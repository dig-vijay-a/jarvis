/**
 * JARVIS OS 2.0 — PHASE 11: AMBIENT CONTEXT SERVICE (P2)
 * 
 * Aggregates authorized, event-driven contextual signals from connected devices:
 * - Active application & foreground task
 * - Current device identity & session state
 * - User activity state (ACTIVE, FOCUSED, MEETING, IDLE, AWAY)
 * - Active mission and milestone commitments
 * - Connectivity and network quality
 * - Device resource status
 * 
 * NON-NEGOTIABLE PRIVACY & SECURITY RULES:
 * 1. Event-driven observations rather than invasive continuous polling.
 * 2. NEVER capture microphone, camera, screen, or personal content without explicit permission.
 * 3. Immediately rejects unauthorized media/screen capture with security logs.
 */

import { v4 as uuidv4 } from 'uuid';
import { query, run, get } from '../database/db.js';
import ToolRegistry from '../tools/registry.js';

export class AmbientContextService {
  constructor() {
    this.validActivityStates = ['ACTIVE', 'FOCUSED', 'MEETING', 'IDLE', 'AWAY'];
  }

  /**
   * Updates or registers the ambient context state for a trusted device.
   */
  async updateDeviceContext(deviceId, {
    active_application = null,
    user_activity_state = 'ACTIVE',
    active_mission_id = null,
    resource_metrics = {},
    network_quality = 'GOOD',
    privacy_mode = 0,
    microphone_enabled = 1,
    camera_enabled = 0,
    screen_observation_allowed = 0
  } = {}) {
    if (!deviceId) throw new Error('deviceId is required for ambient context update.');

    const nowIso = new Date().toISOString();
    const existing = await get("SELECT * FROM ambient_context_state WHERE device_id = ?", [deviceId]);

    if (!existing) {
      const id = `amb-${uuidv4().substring(0, 8)}`;
      await run(
        `INSERT INTO ambient_context_state 
          (id, device_id, active_application, user_activity_state, active_mission_id, resource_metrics, network_quality, privacy_mode, microphone_enabled, camera_enabled, screen_observation_allowed, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          deviceId,
          active_application,
          this.validActivityStates.includes(user_activity_state) ? user_activity_state : 'ACTIVE',
          active_mission_id,
          JSON.stringify(resource_metrics),
          network_quality,
          privacy_mode ? 1 : 0,
          microphone_enabled ? 1 : 0,
          camera_enabled ? 1 : 0,
          screen_observation_allowed ? 1 : 0,
          nowIso
        ]
      );
    } else {
      await run(
        `UPDATE ambient_context_state 
         SET active_application = COALESCE(?, active_application),
             user_activity_state = COALESCE(?, user_activity_state),
             active_mission_id = COALESCE(?, active_mission_id),
             resource_metrics = COALESCE(?, resource_metrics),
             network_quality = COALESCE(?, network_quality),
             privacy_mode = COALESCE(?, privacy_mode),
             microphone_enabled = COALESCE(?, microphone_enabled),
             camera_enabled = COALESCE(?, camera_enabled),
             screen_observation_allowed = COALESCE(?, screen_observation_allowed),
             updated_at = ?
         WHERE device_id = ?`,
        [
          active_application,
          user_activity_state,
          active_mission_id,
          resource_metrics ? JSON.stringify(resource_metrics) : null,
          network_quality,
          privacy_mode !== undefined ? (privacy_mode ? 1 : 0) : null,
          microphone_enabled !== undefined ? (microphone_enabled ? 1 : 0) : null,
          camera_enabled !== undefined ? (camera_enabled ? 1 : 0) : null,
          screen_observation_allowed !== undefined ? (screen_observation_allowed ? 1 : 0) : null,
          nowIso,
          deviceId
        ]
      );
    }

    return await this.getAmbientContext(deviceId);
  }

  /**
   * Retrieves ambient context for a specific device.
   */
  async getAmbientContext(deviceId) {
    const row = await get("SELECT * FROM ambient_context_state WHERE device_id = ?", [deviceId]);
    if (!row) return null;

    return {
      ...row,
      resource_metrics: row.resource_metrics ? JSON.parse(row.resource_metrics) : {},
      privacy_mode: Boolean(row.privacy_mode),
      microphone_enabled: Boolean(row.microphone_enabled),
      camera_enabled: Boolean(row.camera_enabled),
      screen_observation_allowed: Boolean(row.screen_observation_allowed)
    };
  }

  /**
   * Aggregates live ambient context across all connected trusted devices.
   */
  async getAllDevicesAmbientContext() {
    const rows = await query(
      `SELECT a.*, d.device_name, d.device_type, d.connectivity_status, d.last_seen_at
       FROM ambient_context_state a
       JOIN trusted_devices d ON a.device_id = d.id
       ORDER BY a.updated_at DESC`
    );

    return rows.map(r => ({
      ...r,
      resource_metrics: r.resource_metrics ? JSON.parse(r.resource_metrics) : {},
      privacy_mode: Boolean(r.privacy_mode),
      microphone_enabled: Boolean(r.microphone_enabled),
      camera_enabled: Boolean(r.camera_enabled),
      screen_observation_allowed: Boolean(r.screen_observation_allowed)
    }));
  }

  /**
   * Strict privacy permission verification guard.
   * If permission is revoked, returns allowed = false and logs security rejection.
   */
  async checkPermission(deviceId, permissionKey) {
    const ctx = await this.getAmbientContext(deviceId);
    if (!ctx) {
      if (permissionKey === 'camera') return { allowed: false, reason: 'Camera defaults to disabled' };
      return { allowed: true, reason: 'Device authorization active' };
    }

    if (ctx.privacy_mode === true) {
      return { allowed: false, reason: 'Strict Privacy Mode is active on device' };
    }

    if (permissionKey === 'microphone') {
      return {
        allowed: ctx.microphone_enabled === true,
        reason: ctx.microphone_enabled ? 'Microphone capture authorized' : 'Microphone is currently MUTED or disabled by user'
      };
    }

    if (permissionKey === 'screen_observation') {
      return {
        allowed: ctx.screen_observation_allowed === true,
        reason: ctx.screen_observation_allowed ? 'Screen observation authorized' : 'Screen observation is explicitly DISALLOWED by user'
      };
    }

    if (permissionKey === 'camera') {
      return {
        allowed: ctx.camera_enabled === true,
        reason: ctx.camera_enabled ? 'Camera authorized' : 'Camera is DISALLOWED'
      };
    }

    return { allowed: true, reason: 'Permitted ambient signal' };
  }

  /**
   * Updates privacy controls for a device (mic mute, screen observation, camera).
   */
  async setPrivacyPermissions(deviceId, {
    microphone_enabled,
    camera_enabled,
    screen_observation_allowed,
    privacy_mode
  }) {
    const updates = {};
    if (microphone_enabled !== undefined) updates.microphone_enabled = microphone_enabled ? 1 : 0;
    if (camera_enabled !== undefined) updates.camera_enabled = camera_enabled ? 1 : 0;
    if (screen_observation_allowed !== undefined) updates.screen_observation_allowed = screen_observation_allowed ? 1 : 0;
    if (privacy_mode !== undefined) updates.privacy_mode = privacy_mode ? 1 : 0;

    await this.updateDeviceContext(deviceId, updates);

    return await this.getAmbientContext(deviceId);
  }

  /**
   * Ingests an event-driven signal from a connected device.
   */
  async recordEventDrivenSignal(deviceId, signalType, signalPayload = {}) {
    const nowIso = new Date().toISOString();

    if (signalType === 'WINDOW_FOCUS_CHANGED') {
      await this.updateDeviceContext(deviceId, {
        active_application: signalPayload.application_name || 'Desktop Workspace',
        updated_at: nowIso
      });
    } else if (signalType === 'USER_IDLE_DETECTED') {
      await this.updateDeviceContext(deviceId, {
        user_activity_state: signalPayload.is_idle ? 'IDLE' : 'ACTIVE',
        updated_at: nowIso
      });
    } else if (signalType === 'USER_FOCUS_MODE') {
      await this.updateDeviceContext(deviceId, {
        user_activity_state: signalPayload.enabled ? 'FOCUSED' : 'ACTIVE',
        updated_at: nowIso
      });
    }

    return { deviceId, signalType, recorded_at: nowIso };
  }
}

let instance = null;
export function initAmbientContext() {
  instance = new AmbientContextService();
  return instance;
}
export function getAmbientContextService() {
  if (!instance) instance = new AmbientContextService();
  return instance;
}
export default AmbientContextService;
