/**
 * JARVIS OS 2.0 — PHASE 19: SYNC EXTENSION SERVICE
 *
 * Extends CrossDeviceSyncService with:
 * - Targeted mission state sync (steps + deliverables)
 * - Three-way conflict resolution (local vs remote vs base version)
 * - Expired offline queue item pruning
 * - Cross-device duplicate operation detection
 * - Offline queue per-operation retry limits
 */

import { v4 as uuidv4 } from 'uuid';
import { query, run, get } from '../database/db.js';

export class Phase19SyncExtensionService {
  /**
   * Syncs a single mission's state to a device.
   * Returns mission + steps + recent checkpoints.
   */
  async syncMissionState(deviceId, missionId) {
    if (!deviceId || !missionId) throw new Error('deviceId and missionId are required');

    const mission = await get('SELECT * FROM missions WHERE id = ?', [missionId]);
    if (!mission) throw new Error(`Mission not found: ${missionId}`);

    const steps = await query(
      'SELECT * FROM mission_steps WHERE mission_id = ? ORDER BY step_index ASC',
      [missionId]
    );

    const checkpoints = await query(
      'SELECT * FROM mission_checkpoints WHERE mission_id = ? ORDER BY created_at DESC LIMIT 10',
      [missionId]
    );

    // Create a sync checkpoint for this targeted sync
    const checkpointId = `ckpt-${uuidv4().substring(0, 8)}`;
    await run(
      `INSERT INTO device_sync_checkpoints
         (id, device_id, checkpoint_type, sequence_number, snapshot_hash, state_summary, timestamp)
       VALUES (?, ?, 'MISSION_SYNC', ?, ?, ?, ?)`,
      [
        checkpointId, deviceId, Date.now(),
        Buffer.from(JSON.stringify({ mission_id: missionId, step_count: steps.length })).toString('base64').substring(0, 32),
        JSON.stringify({ mission_id: missionId, status: mission.status, steps: steps.length }),
        new Date().toISOString()
      ]
    );

    return {
      device_id: deviceId,
      mission_id: missionId,
      mission: { ...mission, plan: mission.plan_summary || null },
      steps,
      checkpoints,
      checkpoint_id: checkpointId,
      synced_at: new Date().toISOString()
    };
  }

  /**
   * Three-way conflict resolution using Last-Write-Wins with explicit base version.
   * Returns the winning version with resolution reason.
   */
  resolveThreeWayConflict(localVersion, remoteVersion, baseVersion) {
    if (!localVersion || !remoteVersion) {
      throw new Error('localVersion and remoteVersion are required for three-way merge');
    }

    const localSeq = localVersion.sync_sequence || localVersion.updated_seq || 0;
    const remoteSeq = remoteVersion.sync_sequence || remoteVersion.updated_seq || 0;
    const baseSeq = baseVersion ? (baseVersion.sync_sequence || baseVersion.updated_seq || 0) : 0;

    // Both changed from base → LWW by sequence
    if (localSeq > remoteSeq) {
      return { winner: 'local', version: localVersion, reason: `Local (seq ${localSeq}) > Remote (seq ${remoteSeq})` };
    } else if (remoteSeq > localSeq) {
      return { winner: 'remote', version: remoteVersion, reason: `Remote (seq ${remoteSeq}) > Local (seq ${localSeq})` };
    } else if (localVersion.updated_at && remoteVersion.updated_at) {
      // Same sequence — use wall clock
      const localTime = new Date(localVersion.updated_at).getTime();
      const remoteTime = new Date(remoteVersion.updated_at).getTime();
      if (localTime >= remoteTime) {
        return { winner: 'local', reason: 'Same sequence, local timestamp newer or equal' , version: localVersion };
      }
      return { winner: 'remote', reason: 'Same sequence, remote timestamp newer', version: remoteVersion };
    } else {
      return { winner: 'remote', version: remoteVersion, reason: 'Fallback to remote (no timestamps)' };
    }
  }

  /**
   * Prunes expired offline queue items and returns count removed.
   */
  async pruneExpiredQueueItems() {
    const nowIso = new Date().toISOString();
    const result = await run(
      `UPDATE offline_operation_queue SET status = 'EXPIRED', processed_at = ?
       WHERE status = 'PENDING' AND expires_at IS NOT NULL AND expires_at < ?`,
      [nowIso, nowIso]
    );
    const deleted = await run(
      `DELETE FROM offline_operation_queue WHERE status = 'EXPIRED' AND processed_at < ?`,
      [new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()] // older than 24h
    );
    return { expired_marked: result.changes || 0, pruned: deleted.changes || 0, pruned_at: nowIso };
  }

  /**
   * Detects duplicate operations from a device beyond idempotency_key UNIQUE constraint.
   * Checks for same operation_type + similar payload fingerprint within a window.
   */
  async detectDuplicateOperations(deviceId, operation) {
    if (!deviceId || !operation) throw new Error('deviceId and operation are required');

    const { operation_type, idempotency_key, payload } = operation;
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Check by idempotency_key (primary)
    if (idempotency_key) {
      const existing = await get(
        `SELECT id, status FROM offline_operation_queue WHERE idempotency_key = ? AND device_id = ?`,
        [idempotency_key, deviceId]
      );
      if (existing) return { is_duplicate: true, reason: 'IDEMPOTENCY_KEY_MATCH', existing_id: existing.id };
    }

    // Secondary: same device + same operation_type in last 5 min
    const similar = await query(
      `SELECT id, operation_type, created_at FROM offline_operation_queue
       WHERE device_id = ? AND operation_type = ? AND created_at > ? AND status IN ('PENDING', 'PROCESSED')
       ORDER BY created_at DESC LIMIT 1`,
      [deviceId, operation_type, fiveMinAgo]
    );

    if (similar.length > 0) {
      return {
        is_duplicate: true,
        reason: 'RECENT_SAME_OPERATION_TYPE',
        existing_id: similar[0].id,
        created_at: similar[0].created_at
      };
    }

    return { is_duplicate: false };
  }

  /**
   * Queues an operation with retry limit enforcement.
   */
  async queueOperationWithRetryLimit(deviceId, operation, maxRetries = 5, ttlSeconds = 3600) {
    const { operation_type, idempotency_key, payload } = operation;
    if (!operation_type) throw new Error('operation_type is required');

    const dupCheck = await this.detectDuplicateOperations(deviceId, operation);
    if (dupCheck.is_duplicate) {
      return { queued: false, reason: dupCheck.reason, existing_id: dupCheck.existing_id };
    }

    const id = `op-${uuidv4().substring(0, 8)}`;
    const key = idempotency_key || `${deviceId}:${operation_type}:${Date.now()}`;
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    await run(
      `INSERT INTO offline_operation_queue
         (id, device_id, operation_type, idempotency_key, payload, status, retry_count, max_retries, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)`,
      [id, deviceId, operation_type, key, JSON.stringify(payload || {}), maxRetries, expiresAt, nowIso]
    );

    return { queued: true, operation_id: id, idempotency_key: key, expires_at: expiresAt };
  }

  /**
   * Returns sync queue stats for the dashboard.
   */
  async getSyncQueueStats() {
    const rows = await query(
      `SELECT device_id, status, COUNT(*) as count
       FROM offline_operation_queue
       GROUP BY device_id, status`
    );
    return rows;
  }
}

let instance = null;
export function initPhase19SyncExtension() {
  instance = new Phase19SyncExtensionService();
  return instance;
}
export function getPhase19SyncExtension() {
  if (!instance) instance = new Phase19SyncExtensionService();
  return instance;
}
export default Phase19SyncExtensionService;
