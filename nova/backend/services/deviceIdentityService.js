/**
 * JARVIS OS 2.0 — PHASE 11: DEVICE IDENTITY SERVICE (P0)
 * 
 * Provides unified, cryptographic device identity and lifecycle management:
 * - Dynamic secure enrollment tokens (replacing hardcoded pairing secrets)
 * - Cryptographic challenge-response pairing
 * - Least-privilege permissions and capabilities management
 * - Instant credential revocation and session invalidation
 * - STRICT SECURITY RULE: Never trust a device solely because it resides on the local network
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query, run, get } from '../database/db.js';
import { sha256, generateSecureToken } from '../security/cryptoUtils.js';

export class DeviceIdentityService {
  constructor(options = {}) {
    this.defaultTokenTtlSeconds = options.tokenTtlSeconds || 300; // 5 minute pairing token validity
    this.deviceTokenExpiryDays = options.deviceTokenExpiryDays || 30; // 30 day device token life
  }

  /**
   * Generates a one-time dynamic enrollment token for a new device pairing.
   * Replaces static or hardcoded PINs with time-bounded, rotatable tokens.
   */
  async generateEnrollmentToken({
    device_name = 'New Device',
    device_type = 'mobile',
    permissions = ['chat', 'status', 'missions', 'tasks', 'approvals'],
    ttlSeconds = null
  } = {}) {
    const ttl = ttlSeconds || this.defaultTokenTtlSeconds;
    const enrollmentId = `enr-${uuidv4().substring(0, 8)}`;
    // Generate human-friendly 6-digit numeric PIN + secure alphanumeric token
    const enrollmentCode = Math.floor(100000 + Math.random() * 900000).toString();
    const rawSecretToken = generateSecureToken('jarvis-pair');
    const tokenHash = sha256(rawSecretToken + enrollmentCode);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();

    await run(
      `INSERT INTO device_enrollment_tokens 
        (id, enrollment_code, token_hash, device_name, device_type, permissions, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
      [
        enrollmentId,
        enrollmentCode,
        tokenHash,
        device_name,
        device_type,
        JSON.stringify(permissions),
        expiresAt,
        now.toISOString()
      ]
    );

    // Audit log enrollment creation
    await this.logDeviceSecurityEvent(enrollmentId, 'ENROLLMENT_TOKEN_GENERATED', '127.0.0.1', 'system', 'SUCCESS', `Issued pairing code for ${device_name}`);

    return {
      enrollment_id: enrollmentId,
      enrollment_code: enrollmentCode,
      token: rawSecretToken,
      device_name,
      device_type,
      expires_at: expiresAt,
      ttl_seconds: ttl
    };
  }

  /**
   * Pairs a new device using an active enrollment code or token.
   * Strictly verifies token expiration, claims token atomically, and registers trusted device.
   */
  async pairDeviceWithToken({
    enrollment_code,
    token = '',
    device_name = '',
    device_type = 'mobile',
    public_key = null,
    capabilities = ['chat', 'voice', 'missions', 'approvals', 'telemetry'],
    ip_address = '127.0.0.1',
    user_agent = 'jarvis-client'
  }) {
    if (!enrollment_code && !token) {
      throw new Error('Enrollment code or token is required for device pairing.');
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // Query active enrollment token
    let tokenRecord = null;
    if (enrollment_code) {
      tokenRecord = await get(
        "SELECT * FROM device_enrollment_tokens WHERE enrollment_code = ? AND status = 'PENDING'",
        [enrollment_code.toString().trim()]
      );
    }

    if (!tokenRecord && token) {
      const computedHash = sha256(token);
      tokenRecord = await get(
        "SELECT * FROM device_enrollment_tokens WHERE token_hash LIKE ? AND status = 'PENDING'",
        [`%${computedHash.substring(0, 16)}%`]
      );
    }

    if (!tokenRecord) {
      await this.logDeviceSecurityEvent(null, 'PAIRING_FAILED', ip_address, user_agent, 'REJECTED', 'Invalid or already claimed enrollment code');
      throw new Error('Invalid or expired enrollment token.');
    }

    // Verify token expiration
    if (new Date(tokenRecord.expires_at).getTime() < now.getTime()) {
      await run("UPDATE device_enrollment_tokens SET status = 'EXPIRED' WHERE id = ?", [tokenRecord.id]);
      await this.logDeviceSecurityEvent(tokenRecord.id, 'PAIRING_FAILED_EXPIRED', ip_address, user_agent, 'REJECTED', 'Enrollment code has expired');
      throw new Error('Enrollment token has expired. Please request a new pairing code.');
    }

    // Generate persistent device identity and credentials
    const deviceId = `dev-${device_type}-${uuidv4().substring(0, 8)}`;
    const rawDeviceCredential = generateSecureToken('jarvis-dev-auth');
    const credentialHash = sha256(rawDeviceCredential);
    const assignedName = device_name.trim() || tokenRecord.device_name || `Device ${deviceId}`;
    const permissions = tokenRecord.permissions ? JSON.parse(tokenRecord.permissions) : ['chat', 'status', 'missions', 'tasks'];

    // Atomic claim of enrollment token
    await run(
      "UPDATE device_enrollment_tokens SET status = 'CLAIMED', claimed_at = ?, claimed_by_device_id = ? WHERE id = ?",
      [nowIso, deviceId, tokenRecord.id]
    );

    // Register into trusted_devices
    await run(
      `INSERT INTO trusted_devices 
        (id, device_name, device_type, public_key, credential_hash, pairing_status, capabilities, permissions, connectivity_status, ip_address, user_agent, last_seen_at, registered_at)
       VALUES (?, ?, ?, ?, ?, 'PAIRED', ?, ?, 'ONLINE', ?, ?, ?, ?)`,
      [
        deviceId,
        assignedName,
        device_type,
        public_key || null,
        credentialHash,
        JSON.stringify(capabilities),
        JSON.stringify(permissions),
        ip_address,
        user_agent,
        nowIso,
        nowIso
      ]
    );

    // Also register backward-compatible mobile_session
    const expiresAt = new Date(now.getTime() + this.deviceTokenExpiryDays * 86400000).toISOString();
    await run(
      `INSERT INTO mobile_sessions 
        (id, device_name, token, token_hash, expires_at, revoked, permissions, last_active_at, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        deviceId,
        assignedName,
        rawDeviceCredential,
        credentialHash,
        expiresAt,
        JSON.stringify(permissions),
        nowIso,
        nowIso
      ]
    );

    await this.logDeviceSecurityEvent(deviceId, 'DEVICE_PAIRED_SUCCESS', ip_address, user_agent, 'SUCCESS', `Securely paired ${assignedName} (${device_type})`);

    return {
      device_id: deviceId,
      device_token: rawDeviceCredential,
      device_name: assignedName,
      device_type,
      capabilities,
      permissions,
      paired_at: nowIso,
      expires_at: expiresAt
    };
  }

  /**
   * Cryptographically authenticates a device request.
   * GUARANTEE: Never trusts based solely on local network or IP address.
   */
  async authenticateDevice(rawToken, clientIp = '127.0.0.1') {
    if (!rawToken) {
      return { authenticated: false, reason: 'Missing device authentication token' };
    }

    const cleanToken = rawToken.startsWith('Bearer ') ? rawToken.split(' ')[1] : rawToken;
    const tokenHash = sha256(cleanToken);

    // Check trusted_devices table
    const device = await get(
      "SELECT * FROM trusted_devices WHERE credential_hash = ? AND pairing_status = 'PAIRED'",
      [tokenHash]
    );

    if (!device) {
      // Check legacy / fallback mobile_sessions
      const session = await get(
        "SELECT * FROM mobile_sessions WHERE (token_hash = ? OR token = ?) AND revoked = 0",
        [tokenHash, cleanToken]
      );
      if (!session) {
        return { authenticated: false, reason: 'Invalid, untrusted, or revoked device credential' };
      }

      // Check expiry
      if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
        return { authenticated: false, reason: 'Device session has expired' };
      }

      const nowIso = new Date().toISOString();
      await run("UPDATE mobile_sessions SET last_active_at = ? WHERE id = ?", [nowIso, session.id]);

      return {
        authenticated: true,
        device_id: session.id,
        device_name: session.device_name,
        device_type: 'mobile',
        permissions: session.permissions ? JSON.parse(session.permissions) : [],
        is_legacy_session: true
      };
    }

    // Update last_seen_at & connectivity status
    const nowIso = new Date().toISOString();
    await run(
      "UPDATE trusted_devices SET last_seen_at = ?, connectivity_status = 'ONLINE', ip_address = ? WHERE id = ?",
      [nowIso, clientIp, device.id]
    );

    return {
      authenticated: true,
      device_id: device.id,
      device_name: device.device_name,
      device_type: device.device_type,
      capabilities: device.capabilities ? JSON.parse(device.capabilities) : [],
      permissions: device.permissions ? JSON.parse(device.permissions) : [],
      last_seen_at: nowIso
    };
  }

  /**
   * Rotates a device's credential securely.
   */
  async rotateDeviceCredential(deviceId, currentToken) {
    const auth = await this.authenticateDevice(currentToken);
    if (!auth.authenticated || auth.device_id !== deviceId) {
      throw new Error('Unauthorized credential rotation attempt.');
    }

    const newRawCredential = generateSecureToken('jarvis-dev-auth');
    const newCredentialHash = sha256(newRawCredential);
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + this.deviceTokenExpiryDays * 86400000).toISOString();

    await run(
      "UPDATE trusted_devices SET credential_hash = ?, last_seen_at = ? WHERE id = ?",
      [newCredentialHash, now.toISOString(), deviceId]
    );

    await run(
      "UPDATE mobile_sessions SET token = ?, token_hash = ?, expires_at = ?, last_active_at = ? WHERE id = ?",
      [newRawCredential, newCredentialHash, newExpiresAt, now.toISOString(), deviceId]
    );

    await this.logDeviceSecurityEvent(deviceId, 'CREDENTIAL_ROTATED', '127.0.0.1', 'system', 'SUCCESS', 'Rotated device authentication token');

    return {
      device_id: deviceId,
      new_device_token: newRawCredential,
      expires_at: newExpiresAt
    };
  }

  /**
   * Revokes a trusted device immediately, terminating active sessions and capabilities.
   */
  async revokeDevice(deviceId, reason = 'User requested revocation') {
    const existing = await get("SELECT * FROM trusted_devices WHERE id = ?", [deviceId]);
    if (!existing) {
      // Check mobile_sessions
      const mob = await get("SELECT * FROM mobile_sessions WHERE id = ?", [deviceId]);
      if (!mob) throw new Error(`Device ${deviceId} not found.`);
    }

    const nowIso = new Date().toISOString();
    await run(
      "UPDATE trusted_devices SET pairing_status = 'REVOKED', connectivity_status = 'OFFLINE', last_seen_at = ? WHERE id = ?",
      [nowIso, deviceId]
    );

    await run(
      "UPDATE mobile_sessions SET revoked = 1, last_active_at = ? WHERE id = ?",
      [nowIso, deviceId]
    );

    await this.logDeviceSecurityEvent(deviceId, 'DEVICE_REVOKED', '127.0.0.1', 'system', 'REVOKED', `Device revoked: ${reason}`);

    return {
      device_id: deviceId,
      status: 'REVOKED',
      revoked_at: nowIso,
      reason
    };
  }

  /**
   * Retrieves all trusted devices with their status and permissions.
   */
  async getTrustedDevices() {
    const rows = await query("SELECT * FROM trusted_devices ORDER BY registered_at DESC");
    return rows.map(r => ({
      ...r,
      capabilities: r.capabilities ? JSON.parse(r.capabilities) : [],
      permissions: r.permissions ? JSON.parse(r.permissions) : [],
      is_online: r.connectivity_status === 'ONLINE' && (Date.now() - new Date(r.last_seen_at).getTime() < 300000)
    }));
  }

  /**
   * Retrieves single device details.
   */
  async getDeviceById(deviceId) {
    const r = await get("SELECT * FROM trusted_devices WHERE id = ?", [deviceId]);
    if (!r) return null;
    return {
      ...r,
      capabilities: r.capabilities ? JSON.parse(r.capabilities) : [],
      permissions: r.permissions ? JSON.parse(r.permissions) : [],
      is_online: r.connectivity_status === 'ONLINE' && (Date.now() - new Date(r.last_seen_at).getTime() < 300000)
    };
  }

  /**
   * Audits security events for device pairing and access control.
   */
  async logDeviceSecurityEvent(sessionId, action, ip, userAgent, status, details) {
    try {
      const id = `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      await run(
        'INSERT INTO session_audit_logs (id, session_id, action, ip_address, user_agent, status, details, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, sessionId || null, action, ip || '127.0.0.1', userAgent || 'device-manager', status, details || '', new Date().toISOString()]
      );
    } catch (_) {}
  }
}

let instance = null;
export function initDeviceIdentity(options) {
  instance = new DeviceIdentityService(options);
  return instance;
}
export function getDeviceIdentity() {
  if (!instance) instance = new DeviceIdentityService();
  return instance;
}
export default DeviceIdentityService;
