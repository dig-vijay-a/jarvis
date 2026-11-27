/**
 * JARVIS OS 2.0 — PHASE 19: DEVICE TRUST & HEALTH SERVICE
 *
 * Extends DeviceIdentityService with:
 * - Hierarchical trust levels: FULL_TRUST | TRUSTED | LIMITED | READ_ONLY | GUEST
 * - Device health monitoring (battery, CPU, storage, network)
 * - HMAC per-request signature generation and verification
 * - Nonce registry for per-request replay attack prevention (beyond 5-min timestamp check)
 * - Device quarantine for compromised devices
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query, run, get } from '../database/db.js';
import { getDeviceIdentity } from './deviceIdentityService.js';

// Trust level hierarchy (higher index = more trusted)
export const TRUST_LEVELS = {
  GUEST: 0,
  READ_ONLY: 1,
  LIMITED: 2,
  TRUSTED: 3,
  FULL_TRUST: 4
};

// What each trust level can do
const TRUST_PERMISSIONS = {
  GUEST:      ['chat'],
  READ_ONLY:  ['chat', 'status', 'read_missions'],
  LIMITED:    ['chat', 'status', 'read_missions', 'tasks'],
  TRUSTED:    ['chat', 'status', 'missions', 'tasks', 'approvals'],
  FULL_TRUST: ['chat', 'status', 'missions', 'tasks', 'approvals', 'memory', 'admin']
};

export class Phase19DeviceTrustService {
  constructor() {
    this.nonceTtlSeconds = 300; // 5-minute nonce lifetime
  }

  /**
   * Sets device trust level and updates permissions accordingly.
   */
  async setDeviceTrustLevel(deviceId, trustLevel) {
    if (!TRUST_LEVELS.hasOwnProperty(trustLevel)) {
      throw new Error(`Invalid trust level: ${trustLevel}. Must be one of: ${Object.keys(TRUST_LEVELS).join(', ')}`);
    }
    const device = await get('SELECT * FROM trusted_devices WHERE id = ?', [deviceId]);
    if (!device) throw new Error(`Device not found: ${deviceId}`);

    const perms = TRUST_PERMISSIONS[trustLevel];
    const nowIso = new Date().toISOString();

    await run(
      'UPDATE trusted_devices SET trust_level = ?, permissions = ?, last_seen_at = ? WHERE id = ?',
      [trustLevel, JSON.stringify(perms), nowIso, deviceId]
    );

    const di = getDeviceIdentity();
    await di.logDeviceSecurityEvent(
      deviceId, 'TRUST_LEVEL_SET', '127.0.0.1', 'system', 'SUCCESS',
      `Trust level set to ${trustLevel}. Permissions: ${perms.join(', ')}`
    );

    return { device_id: deviceId, trust_level: trustLevel, permissions: perms, updated_at: nowIso };
  }

  /**
   * Updates device health metrics.
   */
  async updateDeviceHealth(deviceId, { battery_level, storage_available_mb, cpu_load_percent, network_type } = {}) {
    const device = await get('SELECT id FROM trusted_devices WHERE id = ?', [deviceId]);
    if (!device) throw new Error(`Device not found: ${deviceId}`);

    // Calculate composite health score (0-100)
    let score = 100;
    if (battery_level !== undefined && battery_level !== null && battery_level < 20) score -= 30;
    else if (battery_level !== undefined && battery_level !== null && battery_level < 40) score -= 10;
    if (cpu_load_percent !== undefined && cpu_load_percent !== null && cpu_load_percent > 80) score -= 20;
    else if (cpu_load_percent !== undefined && cpu_load_percent !== null && cpu_load_percent > 60) score -= 10;
    if (storage_available_mb !== undefined && storage_available_mb !== null && storage_available_mb < 500) score -= 10;
    score = Math.max(0, score);

    const nowIso = new Date().toISOString();
    const fields = ['health_score = ?', 'last_health_at = ?'];
    const vals = [score, nowIso];

    if (battery_level !== undefined) { fields.push('battery_level = ?'); vals.push(battery_level); }
    if (storage_available_mb !== undefined) { fields.push('storage_available_mb = ?'); vals.push(storage_available_mb); }
    if (cpu_load_percent !== undefined) { fields.push('cpu_load_percent = ?'); vals.push(cpu_load_percent); }
    if (network_type !== undefined) { fields.push('network_type = ?'); vals.push(network_type); }
    vals.push(deviceId);

    await run(`UPDATE trusted_devices SET ${fields.join(', ')} WHERE id = ?`, vals);
    return { device_id: deviceId, health_score: score, updated_at: nowIso };
  }

  /**
   * Returns health summary across all trusted devices.
   */
  async getDeviceHealthSummary() {
    const devices = await query(
      `SELECT id, device_name, device_type, trust_level, health_score, battery_level,
              cpu_load_percent, storage_available_mb, network_type, connectivity_status, last_health_at
       FROM trusted_devices WHERE pairing_status != 'REVOKED' ORDER BY health_score ASC`
    );
    const summary = {
      total: devices.length,
      healthy: devices.filter(d => (d.health_score || 100) >= 70).length,
      degraded: devices.filter(d => (d.health_score || 100) >= 40 && (d.health_score || 100) < 70).length,
      critical: devices.filter(d => (d.health_score || 100) < 40).length,
      devices
    };
    return summary;
  }

  /**
   * Validates a nonce — prevents replay attacks beyond the timestamp check.
   * Inserts nonce into consumed_nonces table; throws if already consumed.
   */
  async validateNonce(nonce, deviceId, ttlSeconds = null) {
    if (!nonce || !deviceId) throw new Error('nonce and deviceId are required');
    const ttl = ttlSeconds || this.nonceTtlSeconds;
    const now = new Date();
    const nowIso = now.toISOString();

    // Clean expired nonces first
    await run('DELETE FROM consumed_nonces WHERE expires_at < ?', [nowIso]);

    // Check if already consumed
    const existing = await get('SELECT nonce FROM consumed_nonces WHERE nonce = ?', [nonce]);
    if (existing) {
      throw new Error(`REPLAY_ATTACK_DETECTED: Nonce ${nonce} has already been consumed.`);
    }

    const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
    await run(
      'INSERT INTO consumed_nonces (nonce, device_id, consumed_at, expires_at) VALUES (?, ?, ?, ?)',
      [nonce, deviceId, nowIso, expiresAt]
    );
    return { nonce, consumed: true, consumed_at: nowIso, expires_at: expiresAt };
  }

  /**
   * Generates an HMAC-SHA256 signature for a payload using device secret.
   */
  generateHmacSignature(payload, deviceSecret) {
    if (!deviceSecret) throw new Error('deviceSecret is required for HMAC signing');
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHmac('sha256', deviceSecret).update(payloadStr).digest('hex');
  }

  /**
   * Verifies an HMAC-SHA256 signature against payload and device secret.
   */
  verifyHmacSignature(payload, signature, deviceSecret) {
    if (!deviceSecret || !signature) return false;
    const expected = this.generateHmacSignature(payload, deviceSecret);
    // Timing-safe comparison
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
    } catch {
      return false;
    }
  }

  /**
   * Quarantines a compromised device: sets trust_level to GUEST, invalidates sessions.
   */
  async quarantineCompromisedDevice(deviceId, reason) {
    await run(
      `UPDATE trusted_devices SET trust_level = 'GUEST', permissions = ?, connectivity_status = 'QUARANTINED' WHERE id = ?`,
      [JSON.stringify(TRUST_PERMISSIONS.GUEST), deviceId]
    );
    // Revoke mobile sessions
    await run(`UPDATE mobile_sessions SET revoked = 1 WHERE id = ?`, [deviceId]);

    const di = getDeviceIdentity();
    await di.logDeviceSecurityEvent(deviceId, 'DEVICE_QUARANTINED', '127.0.0.1', 'system', 'QUARANTINED', reason);

    return { device_id: deviceId, status: 'QUARANTINED', reason, quarantined_at: new Date().toISOString() };
  }

  /**
   * Check if device trust level allows a specific action.
   */
  async checkTrustPermission(deviceId, requiredPermission) {
    const device = await get('SELECT trust_level, permissions, pairing_status FROM trusted_devices WHERE id = ?', [deviceId]);
    if (!device || device.pairing_status === 'REVOKED') return false;
    const perms = device.permissions ? JSON.parse(device.permissions) : [];
    return perms.includes(requiredPermission);
  }

  /**
   * Prunes expired nonces from the registry.
   */
  async pruneExpiredNonces() {
    const result = await run('DELETE FROM consumed_nonces WHERE expires_at < ?', [new Date().toISOString()]);
    return { pruned: result.changes || 0 };
  }
}

let instance = null;
export function initPhase19DeviceTrust() {
  instance = new Phase19DeviceTrustService();
  return instance;
}
export function getPhase19DeviceTrust() {
  if (!instance) instance = new Phase19DeviceTrustService();
  return instance;
}
export default Phase19DeviceTrustService;
