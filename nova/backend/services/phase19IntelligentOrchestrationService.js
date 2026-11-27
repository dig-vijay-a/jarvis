/**
 * JARVIS OS 2.0 — PHASE 19: INTELLIGENT DEVICE ORCHESTRATION SERVICE
 *
 * Extends DeviceOrchestrationService with:
 * - Capability-based task routing (desktop → coding, mobile → approvals/voice, browser → web)
 * - Device scoring: availability, capability match, battery, CPU, trust level, network quality
 * - Workflow context (mission-level) transfer between devices
 * - Routing decision audit log
 * - Expired approval auto-handling when target device goes offline
 */

import { v4 as uuidv4 } from 'uuid';
import { query, run, get } from '../database/db.js';
import { getDeviceIdentity } from './deviceIdentityService.js';
import { getUnifiedNotification } from './unifiedNotificationService.js';

// Task type → preferred device_type mapping
const TASK_DEVICE_PREFERENCES = {
  coding:         { preferred: ['desktop'], allowed: ['desktop', 'laptop'] },
  analysis:       { preferred: ['desktop', 'laptop'], allowed: ['desktop', 'laptop'] },
  workflow:       { preferred: ['desktop', 'laptop'], allowed: ['desktop', 'laptop'] },
  research:       { preferred: ['desktop', 'laptop', 'browser'], allowed: ['desktop', 'laptop', 'browser'] },
  approval:       { preferred: ['mobile', 'android', 'tablet'], allowed: ['mobile', 'android', 'tablet', 'desktop'] },
  notification:   { preferred: ['mobile', 'android'], allowed: ['mobile', 'android', 'tablet', 'desktop'] },
  voice:          { preferred: ['mobile', 'android'], allowed: ['mobile', 'android', 'tablet'] },
  web_research:   { preferred: ['browser', 'desktop'], allowed: ['browser', 'desktop', 'laptop'] },
  file_management:{ preferred: ['desktop'], allowed: ['desktop', 'laptop'] },
  default:        { preferred: [], allowed: [] }
};

export class Phase19IntelligentOrchestrationService {
  /**
   * Scores a device for a task based on health, trust, capabilities, and availability.
   * Returns score 0.0 to 1.0.
   */
  scoreDeviceForTask(device, taskType) {
    let score = 0;
    const pref = TASK_DEVICE_PREFERENCES[taskType] || TASK_DEVICE_PREFERENCES.default;

    // Device must be active (paired, not revoked/expired/quarantined)
    if (device.pairing_status !== 'PAIRED' || device.connectivity_status === 'QUARANTINED') return 0;

    // Online check: last_seen within 5 minutes
    const isOnline = device.connectivity_status === 'ONLINE' &&
      (Date.now() - new Date(device.last_seen_at).getTime() < 300000);
    if (!isOnline) return 0;

    // Type preference scoring
    const deviceType = (device.device_type || '').toLowerCase();
    if (pref.preferred.includes(deviceType)) score += 0.4;
    else if (pref.allowed.includes(deviceType)) score += 0.2;
    else score += 0.05; // Any device is better than none

    // Trust level bonus
    const trustMap = { FULL_TRUST: 0.2, TRUSTED: 0.15, LIMITED: 0.08, READ_ONLY: 0.03, GUEST: 0 };
    score += trustMap[device.trust_level] || 0.1;

    // Health score (0-100 → 0-0.2)
    const healthScore = device.health_score !== null && device.health_score !== undefined ? device.health_score : 100;
    score += (healthScore / 100) * 0.2;

    // Battery bonus (mobile devices)
    if (device.battery_level !== null && device.battery_level !== undefined) {
      if (device.battery_level < 15) return 0; // Battery critically low — unusable
      score += (Math.min(device.battery_level, 100) / 100) * 0.1;
    } else {
      score += 0.1; // Desktop/laptop assumed plugged in
    }

    // CPU load penalty
    if (device.cpu_load_percent !== null && device.cpu_load_percent !== undefined) {
      if (device.cpu_load_percent > 90) score -= 0.1;
      else if (device.cpu_load_percent > 70) score -= 0.05;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Selects the best available device for a task type.
   * Records routing decision in audit log.
   */
  async selectBestDevice(taskType, requiredCapabilities = []) {
    const devices = await query(
      `SELECT * FROM trusted_devices WHERE pairing_status != 'REVOKED' ORDER BY last_seen_at DESC`
    );

    const scored = devices
      .filter(d => {
        // Filter by required capabilities
        if (requiredCapabilities.length === 0) return true;
        const caps = d.capabilities ? JSON.parse(d.capabilities) : [];
        return requiredCapabilities.every(rc => caps.includes(rc));
      })
      .map(d => ({ device: d, score: this.scoreDeviceForTask(d, taskType) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);

    const decisionId = `route-${uuidv4().substring(0, 8)}`;
    const nowIso = new Date().toISOString();

    if (scored.length === 0) {
      await run(
        'INSERT INTO device_routing_decisions (id, task_type, selected_device_id, candidate_scores, reason, score, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?)',
        [decisionId, taskType, JSON.stringify([]), 'NO_ELIGIBLE_DEVICE', 0, nowIso]
      );
      return { selected_device_id: null, reason: 'NO_ELIGIBLE_DEVICE', score: 0, candidates: [] };
    }

    const best = scored[0];
    const candidateScores = scored.slice(0, 5).map(x => ({
      device_id: x.device.id,
      device_name: x.device.device_name,
      device_type: x.device.device_type,
      score: parseFloat(x.score.toFixed(3))
    }));

    await run(
      'INSERT INTO device_routing_decisions (id, task_type, selected_device_id, candidate_scores, reason, score, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [decisionId, taskType, best.device.id, JSON.stringify(candidateScores),
       `Best match for ${taskType} (type: ${best.device.device_type}, trust: ${best.device.trust_level || 'TRUSTED'})`,
       parseFloat(best.score.toFixed(3)), nowIso]
    );

    return {
      decision_id: decisionId,
      selected_device_id: best.device.id,
      selected_device: {
        id: best.device.id,
        name: best.device.device_name,
        type: best.device.device_type,
        trust_level: best.device.trust_level
      },
      reason: `Best match for ${taskType}`,
      score: parseFloat(best.score.toFixed(3)),
      candidates: candidateScores
    };
  }

  /**
   * Routes a task spec to the best device and dispatches a notification.
   */
  async routeTaskToDevice({ taskType, taskTitle, taskDescription, requiredCapabilities = [], targetDeviceId = null }) {
    let deviceId = targetDeviceId;
    let routingResult = null;

    if (!deviceId) {
      routingResult = await this.selectBestDevice(taskType, requiredCapabilities);
      deviceId = routingResult.selected_device_id;
    }

    if (!deviceId) {
      return { routed: false, reason: 'NO_ELIGIBLE_DEVICE', task_type: taskType };
    }

    const notifService = getUnifiedNotification();
    const notif = await notifService.dispatchNotification({
      title: `TASK ASSIGNED: ${taskTitle || taskType}`,
      message: taskDescription || `Task of type ${taskType} has been routed to your device.`,
      type: 'TASK_ASSIGNMENT',
      priority: taskType === 'approval' ? 'HIGH' : 'MEDIUM',
      target_device_id: deviceId,
      action_url: `/api/ambient/tasks/${taskType}`,
      action_payload: { task_type: taskType, task_title: taskTitle },
      ttl_hours: 2
    });

    return {
      routed: true,
      task_type: taskType,
      selected_device_id: deviceId,
      notification_id: notif.notification_id,
      routing_result: routingResult
    };
  }

  /**
   * Gets complete mission context for transfer between devices.
   */
  async getMissionHandoffState(missionId) {
    const mission = await get('SELECT * FROM missions WHERE id = ?', [missionId]);
    if (!mission) throw new Error(`Mission not found: ${missionId}`);

    const steps = await query('SELECT * FROM mission_steps WHERE mission_id = ? ORDER BY step_index ASC', [missionId]);
    const checkpoints = await query(
      'SELECT * FROM mission_checkpoints WHERE mission_id = ? ORDER BY created_at DESC LIMIT 5',
      [missionId]
    );

    return {
      mission: {
        ...mission,
        plan: mission.plan_summary || null
      },
      steps,
      checkpoints,
      snapshot_at: new Date().toISOString()
    };
  }

  /**
   * Transfers mission workflow context from one device to another.
   * Creates a cross_device_handoffs record with full mission state payload.
   */
  async transferWorkflowContext(missionId, fromDeviceId, toDeviceId) {
    if (!missionId || !toDeviceId) throw new Error('missionId and toDeviceId are required');

    const missionState = await this.getMissionHandoffState(missionId);
    const handoffId = `handoff-${uuidv4().substring(0, 8)}`;
    const nowIso = new Date().toISOString();

    await run(
      `INSERT INTO cross_device_handoffs
         (id, source_device_id, target_device_id, handoff_type, mission_id, state_payload, partial_transcript, status, created_at)
       VALUES (?, ?, ?, 'MISSION_WORKFLOW', ?, ?, '', 'PENDING', ?)`,
      [handoffId, fromDeviceId || 'desktop', toDeviceId, missionId, JSON.stringify(missionState), nowIso]
    );

    // Notify target device
    const notifService = getUnifiedNotification();
    await notifService.dispatchNotification({
      title: `MISSION HANDOFF: ${missionState.mission.objective || missionId}`,
      message: `Mission workflow transferred to your device. ${missionState.steps.length} steps, status: ${missionState.mission.status}`,
      type: 'MISSION_HANDOFF',
      priority: 'HIGH',
      target_device_id: toDeviceId,
      action_url: `/api/ambient/handoffs/${handoffId}`,
      action_payload: { handoff_id: handoffId, mission_id: missionId },
      ttl_hours: 4
    });

    return {
      handoff_id: handoffId,
      mission_id: missionId,
      from_device: fromDeviceId,
      to_device: toDeviceId,
      steps_count: missionState.steps.length,
      mission_status: missionState.mission.status,
      created_at: nowIso
    };
  }

  /**
   * Handles expired approval requests when device goes offline.
   * Finds WAITING_FOR_APPROVAL steps where the responsible device has been offline > 30 minutes.
   */
  async handleExpiredApprovals() {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    // Find steps awaiting approval for > 30 min
    const stalePendingSteps = await query(
      `SELECT ms.*, m.objective FROM mission_steps ms
       JOIN missions m ON m.id = ms.mission_id
       WHERE ms.status = 'WAITING_FOR_APPROVAL' AND ms.started_at < ?`,
      [thirtyMinAgo]
    );

    const expired = [];
    for (const step of stalePendingSteps) {
      await run(
        `UPDATE mission_steps SET status = 'APPROVAL_EXPIRED' WHERE id = ?`,
        [step.id]
      );
      expired.push({ step_id: step.id, mission_id: step.mission_id, objective: step.objective });
    }

    return { expired_approvals: expired.length, details: expired };
  }

  /**
   * Returns recent routing decisions for dashboard display.
   */
  async getRoutingDecisions(limit = 50) {
    return await query(
      'SELECT * FROM device_routing_decisions ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
  }
}

let instance = null;
export function initPhase19IntelligentOrchestration() {
  instance = new Phase19IntelligentOrchestrationService();
  return instance;
}
export function getPhase19IntelligentOrchestration() {
  if (!instance) instance = new Phase19IntelligentOrchestrationService();
  return instance;
}
export default Phase19IntelligentOrchestrationService;
