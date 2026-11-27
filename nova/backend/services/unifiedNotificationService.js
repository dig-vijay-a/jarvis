/**
 * JARVIS OS 2.0 — PHASE 11: UNIFIED NOTIFICATION SERVICE (P3)
 * 
 * Centralized, multi-device notification intelligence:
 * - Urgent mission failures & stalls
 * - Human approval requests
 * - Approaching goal deadlines
 * - Predictive risk alerts (Phase 9)
 * - Mission completion & deliverable evidence
 * - Device connectivity status transitions
 * - Important contextual recommendations
 * 
 * CAPABILITIES:
 * 1. Priority scoring: CRITICAL, HIGH, MEDIUM, LOW, AMBIENT
 * 2. In-flight and historical signature deduplication (suppresses spam)
 * 3. Quiet Hours enforcement (CRITICAL alerts bypass quiet hours)
 * 4. Automatic TTL expiration
 * 5. Multi-device delivery acknowledgment (ACK)
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query, run, get } from '../database/db.js';

export class UnifiedNotificationService {
  constructor(options = {}) {
    this.dedupWindowMinutes = options.dedupWindowMinutes || 15;
    this.defaultTtlHours = options.defaultTtlHours || 24;
  }

  /**
   * Dispatches a notification across trusted devices with deduplication and quiet-hours handling.
   */
  async dispatchNotification({
    title,
    message,
    type = 'INFO', // URGENT_FAILURE, APPROVAL_REQUEST, DEADLINE_PRESSURE, PREDICTIVE_RISK, MISSION_COMPLETE, CONNECTIVITY_CHANGE, RECOMMENDATION, INFO
    priority = 'MEDIUM', // CRITICAL, HIGH, MEDIUM, LOW, AMBIENT
    target_device_id = null,
    action_url = null,
    action_payload = null,
    ttl_hours = null
  }) {
    if (!title || !message) {
      throw new Error('title and message are required for notification.');
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Signature Hash for Deduplication
    const signatureRaw = `${type}:${title.trim().toLowerCase()}:${message.trim().toLowerCase()}`;
    const signatureHash = crypto.createHash('sha256').update(signatureRaw).digest('hex').substring(0, 24);

    // 2. Deduplication check: check if same signature received within dedupWindowMinutes
    const dedupCutoff = new Date(now.getTime() - this.dedupWindowMinutes * 60 * 1000).toISOString();
    const existing = await get(
      "SELECT id, created_at FROM unified_notifications WHERE signature_hash = ? AND created_at > ?",
      [signatureHash, dedupCutoff]
    );

    if (existing) {
      return {
        dispatched: false,
        suppressed: true,
        reason: 'DUPLICATE_SUPPRESSED',
        existing_notification_id: existing.id
      };
    }

    // 3. Quiet Hours Verification
    const isQuietHour = await this.isQuietHoursActive(now);
    if (isQuietHour && priority !== 'CRITICAL' && type !== 'APPROVAL_REQUEST') {
      // Quiet hours active: hold non-critical notification
      return {
        dispatched: false,
        suppressed: true,
        reason: 'QUIET_HOURS_ACTIVE',
        priority
      };
    }

    // 4. Expiration TTL
    const ttl = ttl_hours || this.defaultTtlHours;
    const expiresAt = new Date(now.getTime() + ttl * 3600 * 1000).toISOString();
    const notifId = `notif-${uuidv4().substring(0, 8)}`;

    await run(
      `INSERT INTO unified_notifications 
        (id, signature_hash, title, message, type, priority, target_device_id, action_url, action_payload, is_read, is_acknowledged, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      [
        notifId,
        signatureHash,
        title,
        message,
        type,
        priority,
        target_device_id,
        action_url,
        action_payload ? JSON.stringify(action_payload) : null,
        expiresAt,
        nowIso
      ]
    );

    // Also mirror to legacy notification_history for backward compatibility
    try {
      await run(
        "INSERT INTO notification_history (id, title, message, type, is_read, timestamp) VALUES (?, ?, ?, ?, 0, ?)",
        [notifId, title, message, (priority === 'CRITICAL' || type === 'APPROVAL_REQUEST') ? 'ERROR' : 'INFO', nowIso]
      );
    } catch (_) {}

    return {
      dispatched: true,
      notification_id: notifId,
      signature_hash: signatureHash,
      priority,
      type,
      bypassed_quiet_hours: isQuietHour && (priority === 'CRITICAL' || type === 'APPROVAL_REQUEST'),
      expires_at: expiresAt
    };
  }

  /**
   * Acknowledges delivery or read status by a device.
   */
  async acknowledgeNotification(notificationId, deviceId) {
    const existing = await get("SELECT * FROM unified_notifications WHERE id = ?", [notificationId]);
    if (!existing) throw new Error('Notification not found.');

    const nowIso = new Date().toISOString();
    await run(
      "UPDATE unified_notifications SET is_read = 1, is_acknowledged = 1, acknowledged_by = ?, acknowledged_at = ? WHERE id = ?",
      [deviceId, nowIso, notificationId]
    );

    return {
      notification_id: notificationId,
      acknowledged: true,
      acknowledged_by: deviceId,
      timestamp: nowIso
    };
  }

  /**
   * Retrieves active, unexpired notifications for a device.
   */
  async getActiveNotifications(deviceId = null, limit = 25) {
    const nowIso = new Date().toISOString();
    const rows = await query(
      `SELECT * FROM unified_notifications 
       WHERE (target_device_id IS NULL OR target_device_id = ?) 
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC LIMIT ?`,
      [deviceId, nowIso, limit]
    );

    return rows.map(r => ({
      ...r,
      action_payload: r.action_payload ? JSON.parse(r.action_payload) : null,
      is_read: Boolean(r.is_read),
      is_acknowledged: Boolean(r.is_acknowledged)
    }));
  }

  /**
   * Evaluates if current time falls within configured quiet hours.
   */
  async isQuietHoursActive(dateObj = new Date()) {
    try {
      const qhRow = await get("SELECT value FROM settings WHERE key = 'quiet_hours_enabled'");
      const isEnabled = qhRow ? (qhRow.value === 'true' || qhRow.value === '1') : false;
      if (!isEnabled) return false;

      const startRow = await get("SELECT value FROM settings WHERE key = 'quiet_hours_start'");
      const endRow = await get("SELECT value FROM settings WHERE key = 'quiet_hours_end'");

      const startHour = startRow ? parseInt(startRow.value, 10) : 22; // 22:00 default
      const endHour = endRow ? parseInt(endRow.value, 10) : 7; // 07:00 default

      const currentHour = dateObj.getHours();

      if (startHour > endHour) {
        // Over midnight: e.g. 22 to 7
        return currentHour >= startHour || currentHour < endHour;
      } else {
        return currentHour >= startHour && currentHour < endHour;
      }
    } catch (_) {
      return false;
    }
  }

  /**
   * Configures quiet hours settings.
   */
  async configureQuietHours({ enabled = true, startHour = 22, endHour = 7 }) {
    const nowIso = new Date().toISOString();
    await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('quiet_hours_enabled', ?, ?)", [enabled ? 'true' : 'false', nowIso]);
    await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('quiet_hours_start', ?, ?)", [startHour.toString(), nowIso]);
    await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('quiet_hours_end', ?, ?)", [endHour.toString(), nowIso]);
    return { enabled, startHour, endHour };
  }
}

let instance = null;
export function initUnifiedNotification() {
  instance = new UnifiedNotificationService();
  return instance;
}
export function getUnifiedNotification() {
  if (!instance) instance = new UnifiedNotificationService();
  return instance;
}
export default UnifiedNotificationService;
