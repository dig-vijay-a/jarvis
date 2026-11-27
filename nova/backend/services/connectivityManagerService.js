/**
 * JARVIS OS 2.0 — PHASE 11: CONNECTIVITY MANAGER SERVICE (P6)
 * 
 * Manages device connectivity transitions, offline queues, and state recovery:
 * - Detects connection loss via heartbeat timeouts
 * - Queues permitted synchronization operations while offline
 * - Reconciles and replays queued operations in chronological order upon reconnection
 * - Detects stale device state (> 24 hours offline) and forces full synchronization
 * - Prevents replay of expired sensitive commands
 * - Recovers interrupted device handoffs and cleans up zombie sessions
 */

import { query, run, get } from '../database/db.js';
import { getCrossDeviceSync } from './crossDeviceSyncService.js';
import { getDeviceIdentity } from './deviceIdentityService.js';

export class ConnectivityManagerService {
  constructor(options = {}) {
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs || 45000; // 45 seconds to offline
    this.staleThresholdMs = options.staleThresholdMs || 24 * 3600 * 1000; // 24 hours
    this.commandReplayTtlMs = options.commandReplayTtlMs || 5 * 60 * 1000; // 5 minute command replay protection
  }

  /**
   * Records a live heartbeat from a device.
   * If device was previously OFFLINE, transitions to ONLINE and triggers reconnection reconciliation.
   */
  async recordHeartbeat(deviceId, clientIp = '127.0.0.1') {
    const device = await get("SELECT * FROM trusted_devices WHERE id = ?", [deviceId]);
    if (!device) throw new Error(`Device ${deviceId} not found.`);

    const nowIso = new Date().toISOString();
    const wasOffline = device.connectivity_status !== 'ONLINE';

    await run(
      "UPDATE trusted_devices SET last_seen_at = ?, connectivity_status = 'ONLINE', ip_address = ? WHERE id = ?",
      [nowIso, clientIp, deviceId]
    );

    let reconciliation = null;
    if (wasOffline) {
      reconciliation = await this.handleDeviceReconnection(deviceId);
    }

    return {
      device_id: deviceId,
      status: 'ONLINE',
      last_seen_at: nowIso,
      reconnected: wasOffline,
      reconciliation
    };
  }

  /**
   * Scans all devices and marks any exceeding heartbeatTimeoutMs as OFFLINE.
   */
  async scanConnectivityTimeouts() {
    const devices = await query("SELECT id, last_seen_at, connectivity_status FROM trusted_devices WHERE pairing_status = 'PAIRED'");
    const nowMs = Date.now();
    const transitionedOffline = [];

    for (const d of devices) {
      const lastSeenMs = new Date(d.last_seen_at).getTime();
      if ((nowMs - lastSeenMs) > this.heartbeatTimeoutMs && d.connectivity_status !== 'OFFLINE') {
        await run("UPDATE trusted_devices SET connectivity_status = 'OFFLINE' WHERE id = ?", [d.id]);
        transitionedOffline.push(d.id);
      }
    }

    return {
      scanned_count: devices.length,
      transitioned_offline: transitionedOffline
    };
  }

  /**
   * Handles device reconnection:
   * 1. Evaluates stale threshold (> 24h)
   * 2. Drains offline queue
   * 3. Recovers interrupted handoffs
   */
  async handleDeviceReconnection(deviceId) {
    const device = await get("SELECT * FROM trusted_devices WHERE id = ?", [deviceId]);
    if (!device) return { success: false, reason: 'Device not found' };

    const lastSeenMs = new Date(device.last_seen_at).getTime();
    const offlineDurationMs = Date.now() - lastSeenMs;
    const isStale = offlineDurationMs > this.staleThresholdMs;

    const syncService = getCrossDeviceSync();

    if (isStale) {
      // Force full synchronization checkpoint
      await syncService.createSyncCheckpoint(deviceId, 'FULL_REFRESH_REQUIRED', {
        offline_duration_hours: Math.round(offlineDurationMs / 3600000)
      });
      return {
        device_id: deviceId,
        reconnection_status: 'STALE_FULL_RESYNC_REQUIRED',
        offline_duration_hours: Math.round(offlineDurationMs / 3600000)
      };
    }

    // Drain queued operations
    const drainResult = await syncService.drainOfflineQueue(deviceId);

    // Clean up expired handoffs
    const handoffCleanup = await this.recoverInterruptedHandoffs(deviceId);

    return {
      device_id: deviceId,
      reconnection_status: 'SYNCHRONIZED',
      drained_operations: drainResult.drained_count,
      expired_operations: drainResult.expired_count,
      recovered_handoffs: handoffCleanup.recovered_count
    };
  }

  /**
   * Replay protection guard for sensitive commands.
   * If a command's creation timestamp is older than commandReplayTtlMs, rejects as STALE_REPLAY_REJECTED.
   */
  verifyCommandReplayFreshness(commandTimestamp) {
    if (!commandTimestamp) {
      return { valid: false, reason: 'Missing command timestamp for replay verification' };
    }

    const cmdMs = new Date(commandTimestamp).getTime();
    const ageMs = Date.now() - cmdMs;

    if (ageMs > this.commandReplayTtlMs) {
      return {
        valid: false,
        reason: 'STALE_REPLAY_REJECTED',
        age_seconds: Math.round(ageMs / 1000),
        ttl_seconds: Math.round(this.commandReplayTtlMs / 1000)
      };
    }

    return { valid: true, age_seconds: Math.round(ageMs / 1000) };
  }

  /**
   * Recovers or times out interrupted cross-device handoffs.
   */
  async recoverInterruptedHandoffs(deviceId = null) {
    const nowMs = Date.now();
    const queryStr = deviceId
      ? "SELECT * FROM cross_device_handoffs WHERE (source_device_id = ? OR target_device_id = ?) AND status = 'PENDING'"
      : "SELECT * FROM cross_device_handoffs WHERE status = 'PENDING'";
    const params = deviceId ? [deviceId, deviceId] : [];

    const pending = await query(queryStr, params);
    const expired = [];

    for (const h of pending) {
      const createdMs = new Date(h.created_at).getTime();
      // Hand-offs expire after 15 minutes of inactivity
      if (nowMs - createdMs > 15 * 60 * 1000) {
        await run("UPDATE cross_device_handoffs SET status = 'EXPIRED' WHERE id = ?", [h.id]);
        expired.push(h.id);
      }
    }

    return {
      pending_checked: pending.length,
      recovered_count: expired.length,
      expired_handoff_ids: expired
    };
  }
}

let instance = null;
export function initConnectivityManager() {
  instance = new ConnectivityManagerService();
  return instance;
}
export function getConnectivityManager() {
  if (!instance) instance = new ConnectivityManagerService();
  return instance;
}
export default ConnectivityManagerService;
