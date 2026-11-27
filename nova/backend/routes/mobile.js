import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, run, get } from '../database/db.js';
import { verifyPin, generateSecureToken, sha256 } from '../security/cryptoUtils.js';
import { getMissionControl } from '../services/missionControlService.js';

const router = express.Router();

/**
 * Middleware: Zero-Trust Mobile Session Authentication
 * Validates token, checks revocation status, verifies expiration window, and updates audit timestamp.
 */
export const requireMobileAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Mobile token required' });
  }

  const rawToken = authHeader.split(' ')[1];
  const tokenHash = sha256(rawToken);

  // Match either token_hash or raw token (for backward compatibility)
  const session = await get(
    'SELECT * FROM mobile_sessions WHERE (token_hash = ? OR token = ?) AND revoked = 0',
    [tokenHash, rawToken]
  );

  if (!session) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or revoked session' });
  }

  // Check expiration if set
  if (session.expires_at) {
    const expiresAt = new Date(session.expires_at).getTime();
    if (Date.now() > expiresAt) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Mobile session expired' });
    }
  }

  // Update last active timestamp
  const now = new Date().toISOString();
  await run('UPDATE mobile_sessions SET last_active_at = ? WHERE id = ?', [now, session.id]);
  req.mobileSession = session;
  next();
};

/**
 * Audit log helper
 */
async function logSecurityEvent(sessionId, action, ip, userAgent, status, details) {
  try {
    const id = `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await run(
      'INSERT INTO session_audit_logs (id, session_id, action, ip_address, user_agent, status, details, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, sessionId || null, action, ip || '127.0.0.1', userAgent || 'mobile-agent', status, details || '', new Date().toISOString()]
    );
  } catch (err) {
    console.warn('[SecurityAudit] Failed to log security event:', err.message);
  }
}

// 1. Mobile Authentication via Hashed PIN (PBKDF2-SHA512 with Salt)
router.post('/auth', async (req, res) => {
  try {
    const { pin, deviceName } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'unknown';

    if (!pin) {
      await logSecurityEvent(null, 'LOGIN_FAILED', ip, userAgent, 'FAILED', 'Missing PIN in request body');
      return res.status(400).json({ success: false, error: 'PIN is required' });
    }

    // Check brute-force lockout: count failed attempts in the last 15 minutes
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const failedAttemptsRow = await get(
      "SELECT COUNT(*) as count FROM session_audit_logs WHERE action = 'LOGIN_FAILED' AND ip_address = ? AND timestamp > ?",
      [ip || '127.0.0.1', fifteenMinsAgo]
    );

    if (failedAttemptsRow && failedAttemptsRow.count >= 5) {
      await logSecurityEvent(null, 'LOGIN_BLOCKED_LOCKOUT', ip, userAgent, 'BLOCKED', 'Brute-force lockout triggered (>= 5 failed attempts)');
      return res.status(429).json({
        success: false,
        error: 'Too many failed authentication attempts. Account temporarily locked for 15 minutes for security.'
      });
    }

    // Retrieve hashed PIN and salt
    const pinHashRow = await get("SELECT value FROM settings WHERE key = 'mobile_pin_hash'");
    const pinSaltRow = await get("SELECT value FROM settings WHERE key = 'mobile_pin_salt'");

    let isValid = false;

    if (pinHashRow && pinSaltRow) {
      isValid = verifyPin(pin.trim(), pinHashRow.value, pinSaltRow.value);
    } else {
      // Fallback for legacy configuration
      const legacyPinRow = await get("SELECT value FROM settings WHERE key = 'mobile_pin'");
      const expectedLegacyPin = legacyPinRow ? legacyPinRow.value : '2026';
      isValid = (pin.trim() === expectedLegacyPin.trim());
    }

    if (!isValid) {
      await logSecurityEvent(null, 'LOGIN_FAILED', ip, userAgent, 'FAILED', 'Invalid PIN provided');
      return res.status(403).json({ success: false, error: 'Invalid security PIN' });
    }

    const sessionId = `mob-${Date.now()}`;
    const rawToken = generateSecureToken('nova-mob');
    const refreshToken = generateSecureToken('nova-refresh');
    const tokenHash = sha256(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours expiry
    const nowIso = now.toISOString();

    await run(
      `INSERT INTO mobile_sessions 
      (id, device_name, token, token_hash, expires_at, refresh_token, revoked, permissions, last_active_at, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        sessionId,
        deviceName || 'Mobile Device',
        rawToken,
        tokenHash,
        expiresAt,
        refreshToken,
        JSON.stringify(['chat', 'status', 'missions', 'tasks']),
        nowIso,
        nowIso
      ]
    );

    await logSecurityEvent(sessionId, 'LOGIN_SUCCESS', ip, userAgent, 'SUCCESS', `Paired ${deviceName || 'Mobile Device'}`);

    res.json({
      success: true,
      token: rawToken,
      refreshToken,
      expiresAt,
      sessionId,
      deviceName: deviceName || 'Mobile Device',
      message: 'Mobile pairing authenticated successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Token Rotation
router.post('/rotate', async (req, res) => {
  try {
    const { token, refreshToken } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'unknown';

    if (!token && !refreshToken) {
      return res.status(400).json({ success: false, error: 'Token or refresh token is required for rotation' });
    }

    let session = null;
    if (refreshToken) {
      session = await get('SELECT * FROM mobile_sessions WHERE refresh_token = ? AND revoked = 0', [refreshToken]);
    } else if (token) {
      const tokenHash = sha256(token);
      session = await get('SELECT * FROM mobile_sessions WHERE (token_hash = ? OR token = ?) AND revoked = 0', [tokenHash, token]);
    }

    if (!session) {
      await logSecurityEvent(null, 'TOKEN_ROTATION_FAILED', ip, userAgent, 'FAILED', 'Invalid token for rotation');
      return res.status(401).json({ success: false, error: 'Invalid or revoked session for rotation' });
    }

    const newRawToken = generateSecureToken('nova-mob');
    const newRefreshToken = generateSecureToken('nova-refresh');
    const newTokenHash = sha256(newRawToken);
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    await run(
      'UPDATE mobile_sessions SET token = ?, token_hash = ?, refresh_token = ?, expires_at = ?, last_active_at = ? WHERE id = ?',
      [newRawToken, newTokenHash, newRefreshToken, newExpiresAt, now.toISOString(), session.id]
    );

    await logSecurityEvent(session.id, 'TOKEN_ROTATED', ip, userAgent, 'SUCCESS', 'Session token rotated securely');

    res.json({
      success: true,
      token: newRawToken,
      refreshToken: newRefreshToken,
      expiresAt: newExpiresAt,
      message: 'Session token rotated successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Session Revocation
router.post('/revoke', requireMobileAuth, async (req, res) => {
  try {
    const session = req.mobileSession;
    const { sessionIdToRevoke } = req.body;
    const targetSessionId = sessionIdToRevoke || session.id;

    await run('UPDATE mobile_sessions SET revoked = 1 WHERE id = ?', [targetSessionId]);

    const ip = req.ip || req.connection.remoteAddress;
    await logSecurityEvent(targetSessionId, 'SESSION_REVOKED', ip, req.headers['user-agent'], 'SUCCESS', `Session ${targetSessionId} revoked`);

    res.json({
      success: true,
      message: `Session ${targetSessionId} revoked successfully.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Session Audit Logs (inspect recent security events)
router.get('/audit-logs', requireMobileAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const logs = await query(
      'SELECT * FROM session_audit_logs ORDER BY timestamp DESC LIMIT ?',
      [limit]
    );
    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Data Synchronization (Conversations, Messages, Missions, Memories)
router.get('/sync', requireMobileAuth, async (req, res) => {
  try {
    const since = req.query.since || '1970-01-01T00:00:00Z';

    const recentMessages = await query(
      'SELECT * FROM messages WHERE timestamp > ? ORDER BY timestamp DESC LIMIT 30',
      [since]
    );

    const activeMissions = await query(
      'SELECT id, objective, status, plan_summary, created_at FROM missions ORDER BY created_at DESC LIMIT 10'
    );

    const highImportanceMemories = await query(
      'SELECT id, key, value, category, importance FROM memories WHERE importance >= 3 ORDER BY importance DESC'
    );

    const activeTasks = await query(
      'SELECT * FROM tasks WHERE status != "completed" ORDER BY created_at DESC LIMIT 15'
    );

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      messages: recentMessages,
      missions: activeMissions,
      memories: highImportanceMemories,
      tasks: activeTasks
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Register Web Push Subscription
router.post('/push/subscribe', requireMobileAuth, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint) {
      return res.status(400).json({ success: false, error: 'Endpoint is required' });
    }

    const id = `sub-${Date.now()}`;
    const now = new Date().toISOString();

    await run(
      'INSERT INTO push_subscriptions (id, endpoint, keys, created_at) VALUES (?, ?, ?, ?)',
      [id, endpoint, JSON.stringify(keys || {}), now]
    );

    res.json({ success: true, id, message: 'Push notification subscription registered.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Test Notification Dispatch
router.post('/push/test', requireMobileAuth, async (req, res) => {
  try {
    const notifId = `notif-${Date.now()}`;
    const now = new Date().toISOString();
    await run(
      'INSERT INTO notification_history (id, title, message, type, is_read, timestamp) VALUES (?, ?, ?, ?, 0, ?)',
      [notifId, 'NOVA Mobile Companion', 'Test ping received: mobile channel telemetry active.', 'INFO', now]
    );

    res.json({
      success: true,
      notificationId: notifId,
      message: 'Mobile test notification generated and logged.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Bidirectional Push Synchronization with LWW Conflict Resolution (Module 4)
router.post('/sync/push', requireMobileAuth, async (req, res) => {
  try {
    const { clientId, tasks = [], memories = [] } = req.body;
    const now = new Date().toISOString();
    let appliedTasks = 0;
    let appliedMemories = 0;
    const conflicts = [];

    // Process tasks
    for (const t of tasks) {
      if (!t.id) continue;
      const existing = await get('SELECT id, version, sync_sequence, completed_at FROM tasks WHERE id = ?', [t.id]);
      const clientSeq = t.sync_sequence !== undefined ? Number(t.sync_sequence) : (t.version !== undefined ? Number(t.version) : 1);

      if (!existing) {
        // Brand new task created offline on mobile
        await run(
          `INSERT INTO tasks (id, title, description, status, priority, due_date, sync_sequence, version, client_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            t.id,
            t.title || 'Mobile Task',
            t.description || '',
            t.status || 'pending',
            t.priority || 'medium',
            t.due_date || null,
            clientSeq,
            t.version !== undefined ? Number(t.version) : 1,
            clientId || 'mobile',
            t.created_at || now
          ]
        );
        appliedTasks++;
      } else {
        const serverSeq = existing.sync_sequence !== undefined && existing.sync_sequence !== null ? Number(existing.sync_sequence) : (existing.version !== undefined && existing.version !== null ? Number(existing.version) : 1);
        // Last-Write-Wins: apply if client version/sequence is newer or equal
        if (clientSeq >= serverSeq) {
          await run(
            `UPDATE tasks 
            SET title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status), 
                priority = COALESCE(?, priority), due_date = COALESCE(?, due_date), sync_sequence = ?, version = ?, client_id = ?
            WHERE id = ?`,
            [
              t.title,
              t.description,
              t.status,
              t.priority,
              t.due_date,
              serverSeq + 1,
              (existing.version || 1) + 1,
              clientId || 'mobile',
              t.id
            ]
          );
          appliedTasks++;
        } else {
          conflicts.push({
            entity: 'task',
            id: t.id,
            resolution: 'server_preserved',
            serverSeq,
            clientSeq
          });
        }
      }
    }

    // Process memories
    for (const m of memories) {
      if (!m.id && !m.key) continue;
      const memId = m.id || `mem-mob-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const existing = await get('SELECT id, version, sync_sequence, updated_at FROM memories WHERE id = ? OR key = ?', [memId, m.key]);
      const clientSeq = m.sync_sequence !== undefined ? Number(m.sync_sequence) : (m.version !== undefined ? Number(m.version) : 1);

      if (!existing) {
        await run(
          `INSERT INTO memories (id, key, value, category, importance, source, sync_sequence, version, client_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            memId,
            m.key,
            m.value || '',
            m.category || 'General',
            m.importance || 2,
            m.source || 'mobile_sync',
            clientSeq,
            m.version !== undefined ? Number(m.version) : 1,
            clientId || 'mobile',
            now,
            now
          ]
        );
        appliedMemories++;
      } else {
        const serverSeq = existing.sync_sequence !== undefined && existing.sync_sequence !== null ? Number(existing.sync_sequence) : (existing.version !== undefined && existing.version !== null ? Number(existing.version) : 1);
        if (clientSeq >= serverSeq) {
          await run(
            `UPDATE memories 
            SET value = COALESCE(?, value), category = COALESCE(?, category), importance = COALESCE(?, importance),
                sync_sequence = ?, version = ?, client_id = ?, updated_at = ?
            WHERE id = ?`,
            [
              m.value,
              m.category,
              m.importance,
              serverSeq + 1,
              (existing.version || 1) + 1,
              clientId || 'mobile',
              now,
              existing.id
            ]
          );
          appliedMemories++;
        } else {
          conflicts.push({
            entity: 'memory',
            id: existing.id,
            resolution: 'server_preserved',
            serverSeq,
            clientSeq
          });
        }
      }
    }

    res.json({
      success: true,
      applied: { tasks: appliedTasks, memories: appliedMemories },
      conflicts,
      serverSyncSequence: Date.now(),
      timestamp: now
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Mobile Paired Devices Management (Module 4)
router.get('/devices', requireMobileAuth, async (req, res) => {
  try {
    const devices = await query(
      'SELECT id, device_name, expires_at, revoked, permissions, last_active_at, created_at FROM mobile_sessions ORDER BY created_at DESC'
    );
    res.json({
      success: true,
      count: devices.length,
      devices: devices.map(d => ({
        ...d,
        permissions: typeof d.permissions === 'string' ? JSON.parse(d.permissions || '[]') : d.permissions
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/devices/:id/revoke', requireMobileAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await run('UPDATE mobile_sessions SET revoked = 1 WHERE id = ?', [id]);
    res.json({ success: true, message: `Device session ${id} revoked.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/devices/:id/permissions', requireMobileAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ success: false, error: 'Permissions must be an array' });
    }
    await run('UPDATE mobile_sessions SET permissions = ? WHERE id = ?', [JSON.stringify(permissions), id]);
    res.json({ success: true, message: `Permissions for device ${id} updated.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Remote Mission / Sensitive Step Approval Decision (Module 4)
router.post('/approvals/:id/decide', requireMobileAuth, async (req, res) => {
  try {
    const { id } = req.params; // Can be stepId or missionId
    const { decision, missionId, reason } = req.body; // 'approved' | 'rejected'

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ success: false, error: 'Decision must be approved or rejected' });
    }

    const missionCtrl = getMissionControl();

    if (decision === 'approved') {
      if (missionCtrl && missionId) {
        await missionCtrl.approveStep(missionId, id);
      } else {
        await run("UPDATE mission_steps SET requires_approval = 0, status = 'APPROVED' WHERE id = ?", [id]);
      }
    } else {
      await run("UPDATE mission_steps SET status = 'REJECTED' WHERE id = ?", [id]);
    }

    res.json({
      success: true,
      decision,
      targetId: id,
      message: `Approval decision '${decision}' successfully recorded for ${id}.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
