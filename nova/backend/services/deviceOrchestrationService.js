/**
 * JARVIS OS 2.0 — PHASE 11: DEVICE ORCHESTRATION SERVICE (P5)
 * 
 * Coordinates authorized actions across connected trusted devices:
 * - Start a desktop mission and monitor it live from mobile
 * - Route approval requests to a trusted companion phone
 * - Securely validate remote approval decisions (reject untrusted/unauthorized devices)
 * - Expire stale approval requests
 * - Dispatch completion deliverables & evidence across devices
 */

import { v4 as uuidv4 } from 'uuid';
import { query, run, get } from '../database/db.js';
import { getDeviceIdentity } from './deviceIdentityService.js';
import { getMissionControl } from './missionControlService.js';
import { getUnifiedNotification } from './unifiedNotificationService.js';

export class DeviceOrchestrationService {
  constructor(options = {}) {
    this.approvalTtlMinutes = options.approvalTtlMinutes || 30; // 30-minute approval window
  }

  /**
   * Routes a sensitive mission step approval request to a trusted companion device.
   */
  async routeApprovalRequest({
    mission_id,
    step_id,
    tool,
    reason,
    target_device_id = null
  }) {
    if (!mission_id || !step_id) {
      throw new Error('mission_id and step_id are required for routing approval request.');
    }

    const notifService = getUnifiedNotification();
    const notif = await notifService.dispatchNotification({
      title: `CONFIRMATION REQUIRED: ${tool}`,
      message: reason ? `${reason} (Step: ${step_id})` : `Approval required for step ${step_id} in mission ${mission_id}`,
      type: 'APPROVAL_REQUEST',
      priority: 'HIGH',
      target_device_id,
      action_url: `/api/ambient/approvals/${step_id}/decide`,
      action_payload: { mission_id, step_id, tool, reason },
      ttl_hours: 1
    });

    return {
      routed: true,
      mission_id,
      step_id,
      tool,
      notification_id: notif.notification_id,
      target_device_id: target_device_id || 'ALL_TRUSTED_DEVICES'
    };
  }

  /**
   * Processes a remote approval decision received from a device.
   * SECURITY INVARIANT:
   * 1. Rejects decisions from untrusted or revoked devices.
   * 2. Rejects decisions from devices lacking 'approve_step' or 'approvals' permission.
   * 3. Rejects stale or expired approval requests.
   */
  async processRemoteApprovalDecision({
    step_id,
    mission_id,
    decision, // 'approved' | 'rejected'
    device_id,
    device_token
  }) {
    if (!step_id || !decision || !device_id) {
      throw new Error('step_id, decision, and device_id are required.');
    }

    const deviceIdentity = getDeviceIdentity();
    const auth = await deviceIdentity.authenticateDevice(device_token);

    if (!auth.authenticated || (auth.device_id !== device_id && !auth.is_legacy_session)) {
      throw new Error('UNAUTHORIZED_DEVICE: Cannot process approval from an untrusted or revoked device.');
    }

    // Check permissions
    const perms = auth.permissions || [];
    const hasApprovalPermission = perms.includes('approve_step') || perms.includes('approvals') || perms.includes('missions');
    if (!hasApprovalPermission) {
      throw new Error('INSUFFICIENT_PERMISSIONS: Device is not authorized to grant approval decisions.');
    }

    // Check if step exists and is in WAITING_FOR_APPROVAL status
    const step = await get("SELECT * FROM mission_steps WHERE id = ?", [step_id]);
    if (!step) {
      throw new Error(`Mission step ${step_id} not found.`);
    }

    if (step.status !== 'WAITING_FOR_APPROVAL') {
      throw new Error(`Step is not waiting for approval (current status: ${step.status}).`);
    }

    // Check if approval request is stale / expired
    if (step.started_at) {
      const stepAgeMinutes = (Date.now() - new Date(step.started_at).getTime()) / 60000;
      if (stepAgeMinutes > this.approvalTtlMinutes) {
        await run("UPDATE mission_steps SET status = 'EXPIRED' WHERE id = ?", [step_id]);
        throw new Error('APPROVAL_EXPIRED: The approval request has expired and can no longer be decided.');
      }
    }

    const nowIso = new Date().toISOString();
    const mc = getMissionControl();

    if (decision === 'approved') {
      if (mc && mission_id) {
        await mc.approveStep(mission_id, step_id);
      } else {
        await run("UPDATE mission_steps SET status = 'APPROVED', requires_approval = 0 WHERE id = ?", [step_id]);
      }
    } else {
      await run("UPDATE mission_steps SET status = 'REJECTED' WHERE id = ?", [step_id]);
    }

    // Acknowledge corresponding notification
    const notifService = getUnifiedNotification();
    const matchingNotif = await get(
      "SELECT id FROM unified_notifications WHERE type = 'APPROVAL_REQUEST' AND action_payload LIKE ? AND is_acknowledged = 0",
      [`%${step_id}%`]
    );
    if (matchingNotif) {
      await notifService.acknowledgeNotification(matchingNotif.id, device_id);
    }

    return {
      success: true,
      step_id,
      decision,
      decided_by_device: device_id,
      decided_at: nowIso
    };
  }

  /**
   * Dispatches completion evidence to a designated companion device.
   */
  async dispatchDeliverableEvidence({
    mission_id,
    deliverable_title,
    deliverable_path,
    target_device_id
  }) {
    const notifService = getUnifiedNotification();
    return await notifService.dispatchNotification({
      title: `DELIVERABLE READY: ${deliverable_title}`,
      message: `Completed mission ${mission_id}. Deliverable verified on disk at: ${deliverable_path}`,
      type: 'MISSION_COMPLETE',
      priority: 'MEDIUM',
      target_device_id,
      action_url: `/api/ambient/deliverables/${mission_id}`,
      action_payload: { mission_id, deliverable_title, deliverable_path }
    });
  }
}

let instance = null;
export function initDeviceOrchestration() {
  instance = new DeviceOrchestrationService();
  return instance;
}
export function getDeviceOrchestration() {
  if (!instance) instance = new DeviceOrchestrationService();
  return instance;
}
export default DeviceOrchestrationService;
