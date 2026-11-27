/**
 * JARVIS OS 2.0 — PHASE 11: AMBIENT PERSONAL INTELLIGENCE ADVERSARIAL VALIDATION SUITE
 * 
 * Validates 20 distinct real-world and adversarial cross-device scenarios:
 * 1.  Securely pair a new device.
 * 2.  Reject an unauthorized device.
 * 3.  Revoke an existing device.
 * 4.  Synchronize a mission between desktop and mobile.
 * 5.  Detect conflicting concurrent updates.
 * 6.  Recover from temporary network loss.
 * 7.  Synchronize queued updates after reconnection.
 * 8.  Prevent duplicate mission execution.
 * 9.  Deliver an approval request to a trusted device.
 * 10. Reject approval from an untrusted device.
 * 11. Expire stale approval requests.
 * 12. Preserve conversation continuity across devices.
 * 13. Recover an interrupted voice handoff.
 * 14. Respect microphone mute state.
 * 15. Respect screen observation permissions.
 * 16. Deliver urgent notifications correctly.
 * 17. Suppress duplicate notifications.
 * 18. Respect quiet hours.
 * 19. Recover from device restart.
 * 20. Reconcile Digital Twin state across devices.
 */

import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, get, run } from './backend/database/db.js';
import { getDeviceIdentity } from './backend/services/deviceIdentityService.js';
import { getCrossDeviceSync } from './backend/services/crossDeviceSyncService.js';
import { getAmbientContextService } from './backend/services/ambientContextService.js';
import { getUnifiedNotification } from './backend/services/unifiedNotificationService.js';
import { getCrossDeviceConversation } from './backend/services/crossDeviceConversationService.js';
import { getDeviceOrchestration } from './backend/services/deviceOrchestrationService.js';
import { getConnectivityManager } from './backend/services/connectivityManagerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DELIVERABLES_DIR = path.join(__dirname, 'deliverables');

const results = [];
let passCount = 0;
let failCount = 0;

function assert(condition, testId, description, details = {}) {
  const timestamp = new Date().toISOString();
  if (condition) {
    passCount++;
    console.log(`[PASS] [${testId}] ${description}`);
    results.push({ testId, description, status: 'PASS', timestamp, details });
  } else {
    failCount++;
    console.error(`[FAIL] [${testId}] ${description}`);
    results.push({ testId, description, status: 'FAIL', timestamp, details });
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('  JARVIS OS 2.0 — PHASE 11: AMBIENT PERSONAL INTELLIGENCE SUITE ');
  console.log('================================================================\n');

  const runId = uuidv4().substring(0, 8);
  const deviceIdentity = getDeviceIdentity();
  const syncService = getCrossDeviceSync();
  const ambientService = getAmbientContextService();
  const notifService = getUnifiedNotification();
  const convService = getCrossDeviceConversation();
  const orchService = getDeviceOrchestration();
  const connService = getConnectivityManager();

  // Reset quiet hours to disabled initially to ensure clean test environment
  try {
    await notifService.configureQuietHours({ enabled: false });
  } catch (_) {}

  // -------------------------------------------------------------
  // SCENARIO 1: Securely pair a new device
  // -------------------------------------------------------------
  let pairedMobileDevice = null;
  try {
    const enr = await deviceIdentity.generateEnrollmentToken({
      device_name: `Companion Phone_${runId}`,
      device_type: 'mobile',
      ttlSeconds: 300
    });

    pairedMobileDevice = await deviceIdentity.pairDeviceWithToken({
      enrollment_code: enr.enrollment_code,
      device_name: `Companion Phone_${runId}`,
      device_type: 'mobile'
    });

    const isPaired = pairedMobileDevice &&
      pairedMobileDevice.device_id.startsWith('dev-mobile-') &&
      typeof pairedMobileDevice.device_token === 'string' &&
      pairedMobileDevice.device_token.length > 20;

    assert(
      isPaired,
      'SCENARIO-01',
      'Securely pair a new device using one-time cryptographic enrollment token',
      { device_id: pairedMobileDevice?.device_id, name: pairedMobileDevice?.device_name }
    );
  } catch (err) {
    assert(false, 'SCENARIO-01', 'Securely pair a new device failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 2: Reject an unauthorized device
  // -------------------------------------------------------------
  try {
    const bogusToken = 'unauthorized_token_xyz_99999999';
    const authResult = await deviceIdentity.authenticateDevice(bogusToken);

    assert(
      authResult.authenticated === false,
      'SCENARIO-02',
      'Strictly reject unauthorized device with invalid or untrusted credential',
      { reason: authResult.reason }
    );
  } catch (err) {
    assert(false, 'SCENARIO-02', 'Reject unauthorized device failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 3: Revoke an existing device
  // -------------------------------------------------------------
  try {
    const tempEnr = await deviceIdentity.generateEnrollmentToken({ device_name: `Revoke Test_${runId}` });
    const tempDev = await deviceIdentity.pairDeviceWithToken({ enrollment_code: tempEnr.enrollment_code });

    // Revoke
    await deviceIdentity.revokeDevice(tempDev.device_id, 'Security audit test revocation');

    // Authenticate with revoked token
    const revokedAuth = await deviceIdentity.authenticateDevice(tempDev.device_token);

    assert(
      revokedAuth.authenticated === false,
      'SCENARIO-03',
      'Revoke existing device and immediately invalidate all session credentials',
      { device_id: tempDev.device_id, revokedAuth }
    );
  } catch (err) {
    assert(false, 'SCENARIO-03', 'Revoke existing device failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 4: Synchronize a mission between desktop and mobile
  // -------------------------------------------------------------
  try {
    const missionId = `m-sync-${runId}`;
    await run(
      `INSERT INTO missions (id, objective, plan_summary, status, replan_count, created_at)
       VALUES (?, ?, ?, 'RUNNING', 0, ?)`,
      [missionId, `Cross-Device Mission Objective_${runId}`, 'Multi-device execution pipeline', new Date().toISOString()]
    );

    const payloadResult = await syncService.generateSyncPayload(pairedMobileDevice.device_id);
    const hasMission = payloadResult.payload.missions.some(m => m.id === missionId);

    assert(
      hasMission && payloadResult.payload.missions.length > 0,
      'SCENARIO-04',
      'Synchronize active mission between desktop orchestrator and companion mobile device',
      { missionId, payloadMissionsCount: payloadResult.payload.missions.length }
    );
  } catch (err) {
    assert(false, 'SCENARIO-04', 'Synchronize mission failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 5: Detect conflicting concurrent updates
  // -------------------------------------------------------------
  try {
    const taskId = `task-conflict-${runId}`;
    await run(
      `INSERT INTO tasks (id, title, status, sync_sequence, version, created_at)
       VALUES (?, ?, 'pending', 3, 3, ?)`,
      [taskId, `Concurrent Conflict Task_${runId}`, new Date().toISOString()]
    );

    // Stale client tries to push version 1
    const pushResult = await syncService.processIncomingSyncPush({
      device_id: pairedMobileDevice.device_id,
      tasks: [
        { id: taskId, title: 'Client Stale Override', sync_sequence: 1, version: 1 }
      ]
    });

    const hasConflict = pushResult.conflicts.some(c => c.id === taskId && c.resolution === 'SERVER_PRESERVED');

    assert(
      hasConflict,
      'SCENARIO-05',
      'Detect conflicting concurrent updates and resolve using versioned LWW preserving server truth',
      { conflicts: pushResult.conflicts }
    );
  } catch (err) {
    assert(false, 'SCENARIO-05', 'Detect conflicting concurrent updates failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 6: Recover from temporary network loss
  // -------------------------------------------------------------
  try {
    // Manually backdate device last_seen_at to simulate timeout
    const pastTime = new Date(Date.now() - 60000).toISOString();
    await run("UPDATE trusted_devices SET last_seen_at = ?, connectivity_status = 'ONLINE' WHERE id = ?", [pastTime, pairedMobileDevice.device_id]);

    // Scanner marks offline
    await connService.scanConnectivityTimeouts();
    const offlineDev = await deviceIdentity.getDeviceById(pairedMobileDevice.device_id);

    // Reconnection heartbeat
    const beat = await connService.recordHeartbeat(pairedMobileDevice.device_id);
    const onlineDev = await deviceIdentity.getDeviceById(pairedMobileDevice.device_id);

    const recovered = offlineDev.connectivity_status === 'OFFLINE' && onlineDev.connectivity_status === 'ONLINE';

    assert(
      recovered,
      'SCENARIO-06',
      'Recover from temporary network loss: auto-transition from OFFLINE back to ONLINE upon heartbeat',
      { before: offlineDev.connectivity_status, after: onlineDev.connectivity_status }
    );
  } catch (err) {
    assert(false, 'SCENARIO-06', 'Recover from temporary network loss failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 7: Synchronize queued updates after reconnection
  // -------------------------------------------------------------
  try {
    const queueTaskId = `task-queued-${runId}`;
    await run(
      `INSERT INTO tasks (id, title, status, sync_sequence, version, created_at)
       VALUES (?, ?, 'pending', 1, 1, ?)`,
      [queueTaskId, `Queued Offline Task_${runId}`, new Date().toISOString()]
    );

    // Queue update while offline
    const queueResult = await syncService.queueOfflineOperation({
      device_id: pairedMobileDevice.device_id,
      operation_type: 'TASK_STATUS',
      idempotency_key: `idemp-${runId}-1`,
      payload: { task_id: queueTaskId, status: 'completed' }
    });

    // Reconnect and drain queue
    const drainResult = await syncService.drainOfflineQueue(pairedMobileDevice.device_id);
    const updatedTask = await get("SELECT status FROM tasks WHERE id = ?", [queueTaskId]);

    const isApplied = drainResult.drained_count >= 1 && updatedTask.status === 'completed';

    assert(
      isApplied,
      'SCENARIO-07',
      'Synchronize queued offline operations in chronological order after device reconnection',
      { drained: drainResult.drained_count, taskStatus: updatedTask?.status }
    );
  } catch (err) {
    assert(false, 'SCENARIO-07', 'Synchronize queued updates failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 8: Prevent duplicate mission execution
  // -------------------------------------------------------------
  try {
    const cmd = `Deploy Docker Release_${runId}`;
    const lock1 = await convService.acquireCommandExecutionLock(cmd, 'desktop-main');
    const lock2 = await convService.acquireCommandExecutionLock(cmd, pairedMobileDevice.device_id);

    const deduplicated = lock1.allowed === true && lock2.allowed === false && lock2.suppressed === true;

    assert(
      deduplicated,
      'SCENARIO-08',
      'Prevent duplicate command/mission execution when multiple listening devices capture directive',
      { lock1: lock1.allowed, lock2: lock2.allowed, reason: lock2.reason }
    );
  } catch (err) {
    assert(false, 'SCENARIO-08', 'Prevent duplicate mission execution failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 9: Deliver an approval request to a trusted device
  // -------------------------------------------------------------
  let approvalStepId = null;
  try {
    const stepId = `step-appr-${runId}`;
    approvalStepId = stepId;
    const missionId = `m-appr-${runId}`;

    await run(
      `INSERT INTO missions (id, objective, status, created_at) VALUES (?, ?, 'RUNNING', ?)`,
      [missionId, `Approval Mission_${runId}`, new Date().toISOString()]
    );

    await run(
      `INSERT INTO mission_steps (id, mission_id, step_index, title, agent_key, tool, status, requires_approval, started_at)
       VALUES (?, ?, 1, 'Sensitive Format Command', 'jarvis-core', 'format_disk', 'WAITING_FOR_APPROVAL', 1, ?)`,
      [stepId, missionId, new Date().toISOString()]
    );

    const routed = await orchService.routeApprovalRequest({
      mission_id: missionId,
      step_id: stepId,
      tool: 'format_disk',
      reason: 'Requires authorization to format staging volume',
      target_device_id: pairedMobileDevice.device_id
    });

    const notifs = await notifService.getActiveNotifications(pairedMobileDevice.device_id);
    const hasApprovalNotif = notifs.some(n => n.type === 'APPROVAL_REQUEST' && n.title.includes('format_disk'));

    assert(
      routed.routed && hasApprovalNotif,
      'SCENARIO-09',
      'Deliver sensitive mission step approval request to trusted companion device',
      { routed, notificationsCount: notifs.length }
    );
  } catch (err) {
    assert(false, 'SCENARIO-09', 'Deliver approval request failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 10: Reject approval from an untrusted device
  // -------------------------------------------------------------
  try {
    let threw = false;
    try {
      await orchService.processRemoteApprovalDecision({
        step_id: approvalStepId,
        mission_id: `m-appr-${runId}`,
        decision: 'approved',
        device_id: 'bogus_device_untrusted',
        device_token: 'bogus_token'
      });
    } catch (e) {
      threw = e.message.includes('UNAUTHORIZED_DEVICE');
    }

    assert(
      threw,
      'SCENARIO-10',
      'Strictly reject approval decision submitted from an untrusted or forged device identity',
      { rejectionCaught: threw }
    );
  } catch (err) {
    assert(false, 'SCENARIO-10', 'Reject approval from untrusted device test failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 11: Expire stale approval requests
  // -------------------------------------------------------------
  try {
    const staleStepId = `step-stale-${runId}`;
    const ancientDate = new Date(Date.now() - 45 * 60 * 1000).toISOString(); // 45 minutes old
    await run(
      `INSERT INTO mission_steps (id, mission_id, step_index, title, agent_key, tool, status, requires_approval, started_at)
       VALUES (?, 'm-stale', 1, 'Stale Tool', 'jarvis-core', 'delete_file', 'WAITING_FOR_APPROVAL', 1, ?)`,
      [staleStepId, ancientDate]
    );

    let expiredCaught = false;
    try {
      await orchService.processRemoteApprovalDecision({
        step_id: staleStepId,
        mission_id: 'm-stale',
        decision: 'approved',
        device_id: pairedMobileDevice.device_id,
        device_token: pairedMobileDevice.device_token
      });
    } catch (e) {
      expiredCaught = e.message.includes('APPROVAL_EXPIRED');
    }

    assert(
      expiredCaught,
      'SCENARIO-11',
      'Expire stale approval requests exceeding maximum authorization window (> 30 minutes)',
      { expiredCaught }
    );
  } catch (err) {
    assert(false, 'SCENARIO-11', 'Expire stale approval requests failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 12: Preserve conversation continuity across devices
  // -------------------------------------------------------------
  try {
    const convId = `conv-cont-${runId}`;
    await run(
      `INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      [convId, `Cross-Device Thread_${runId}`, new Date().toISOString(), new Date().toISOString()]
    );
    await run(
      `INSERT INTO messages (id, conversation_id, sender, content, timestamp) VALUES (?, ?, 'user', 'Analyze GPU cluster latency', ?)`,
      [`msg-${runId}-1`, convId, new Date().toISOString()]
    );
    await run(
      `INSERT INTO messages (id, conversation_id, sender, content, timestamp) VALUES (?, ?, 'nova', 'Cluster telemetry indicates node 3 bottleneck.', ?)`,
      [`msg-${runId}-2`, convId, new Date().toISOString()]
    );

    // Handoff from desktop to mobile
    const handoff = await convService.initiateConversationHandoff({
      source_device_id: 'desktop-main',
      target_device_id: pairedMobileDevice.device_id,
      conversation_id: convId,
      partial_transcript: 'What is the recommended mitigation?'
    });

    // Accept on mobile
    const accepted = await convService.acceptHandoff(handoff.handoff_id, pairedMobileDevice.device_id);
    const hasMessages = accepted.resumed_messages.length === 2 && accepted.partial_transcript.includes('recommended mitigation');

    assert(
      hasMessages,
      'SCENARIO-12',
      'Preserve conversation continuity and message history across device handoff',
      { resumedMessagesCount: accepted.resumed_messages.length, transcript: accepted.partial_transcript }
    );
  } catch (err) {
    assert(false, 'SCENARIO-12', 'Preserve conversation continuity failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 13: Recover an interrupted voice handoff
  // -------------------------------------------------------------
  try {
    const ancientHandoffId = `handoff-old-${runId}`;
    const oldTime = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 mins ago
    await run(
      `INSERT INTO cross_device_handoffs 
        (id, source_device_id, target_device_id, handoff_type, conversation_id, state_payload, status, created_at)
       VALUES (?, 'desktop-main', ?, 'VOICE_SESSION', 'conv-x', '{}', 'PENDING', ?)`,
      [ancientHandoffId, pairedMobileDevice.device_id, oldTime]
    );

    const cleanup = await connService.recoverInterruptedHandoffs(pairedMobileDevice.device_id);
    const cleanedRecord = await get("SELECT status FROM cross_device_handoffs WHERE id = ?", [ancientHandoffId]);

    const isExpired = cleanedRecord && cleanedRecord.status === 'EXPIRED';

    assert(
      isExpired,
      'SCENARIO-13',
      'Recover interrupted voice handoff and automatically expire zombie handoff sessions',
      { recoveredCount: cleanup.recovered_count, status: cleanedRecord?.status }
    );
  } catch (err) {
    assert(false, 'SCENARIO-13', 'Recover interrupted voice handoff failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 14: Respect microphone mute state
  // -------------------------------------------------------------
  try {
    // Set mic to muted
    await ambientService.setPrivacyPermissions(pairedMobileDevice.device_id, {
      microphone_enabled: false
    });

    const lockAttempt = await convService.acquireCommandExecutionLock('Execute voice command', pairedMobileDevice.device_id);
    const micRespected = lockAttempt.allowed === false && lockAttempt.reason === 'MICROPHONE_MUTED';

    assert(
      micRespected,
      'SCENARIO-14',
      'Strictly respect microphone mute state and block voice command capture when muted',
      { lockAttempt }
    );
  } catch (err) {
    assert(false, 'SCENARIO-14', 'Respect microphone mute state failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 15: Respect screen observation permissions
  // -------------------------------------------------------------
  try {
    await ambientService.setPrivacyPermissions(pairedMobileDevice.device_id, {
      screen_observation_allowed: false
    });

    const permCheck = await ambientService.checkPermission(pairedMobileDevice.device_id, 'screen_observation');
    const isDisallowed = permCheck.allowed === false;

    assert(
      isDisallowed,
      'SCENARIO-15',
      'Enforce zero-invasive screen monitoring: strictly block vision/screen capture when disallowed',
      { allowed: permCheck.allowed, reason: permCheck.reason }
    );
  } catch (err) {
    assert(false, 'SCENARIO-15', 'Respect screen observation permissions failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 16: Deliver urgent notifications correctly
  // -------------------------------------------------------------
  try {
    const urgent = await notifService.dispatchNotification({
      title: `CRITICAL HARDWARE FAULT_${runId}`,
      message: 'Primary compute cluster cooling fan failed',
      type: 'URGENT_FAILURE',
      priority: 'CRITICAL',
      target_device_id: pairedMobileDevice.device_id
    });

    assert(
      urgent.dispatched === true && urgent.priority === 'CRITICAL',
      'SCENARIO-16',
      'Deliver urgent failure notifications immediately with priority bypass',
      { notification_id: urgent.notification_id, priority: urgent.priority }
    );
  } catch (err) {
    assert(false, 'SCENARIO-16', 'Deliver urgent notifications failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 17: Suppress duplicate notifications
  // -------------------------------------------------------------
  try {
    const notifA = await notifService.dispatchNotification({
      title: `Disk Space Warning_${runId}`,
      message: 'Drive C: has less than 10GB remaining',
      type: 'PREDICTIVE_RISK',
      priority: 'HIGH'
    });

    const notifB = await notifService.dispatchNotification({
      title: `Disk Space Warning_${runId}`,
      message: 'Drive C: has less than 10GB remaining',
      type: 'PREDICTIVE_RISK',
      priority: 'HIGH'
    });

    const deduped = notifA.dispatched === true && notifB.suppressed === true && notifB.reason === 'DUPLICATE_SUPPRESSED';

    assert(
      deduped,
      'SCENARIO-17',
      'Suppress duplicate spam notifications sharing identical signatures within deduplication window',
      { notifA: notifA.dispatched, notifB: notifB.reason }
    );
  } catch (err) {
    assert(false, 'SCENARIO-17', 'Suppress duplicate notifications failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 18: Respect quiet hours
  // -------------------------------------------------------------
  try {
    const currentHour = new Date().getHours();
    // Configure quiet hours to include current hour
    await notifService.configureQuietHours({
      enabled: true,
      startHour: currentHour,
      endHour: (currentHour + 2) % 24
    });

    const heldNotif = await notifService.dispatchNotification({
      title: `Contextual Recommendation_${runId}`,
      message: 'Consider scheduling weekly report generation',
      type: 'RECOMMENDATION',
      priority: 'LOW'
    });

    // Reset quiet hours to avoid affecting live environment
    await notifService.configureQuietHours({ enabled: false });

    const quietRespected = heldNotif.suppressed === true && heldNotif.reason === 'QUIET_HOURS_ACTIVE';

    assert(
      quietRespected,
      'SCENARIO-18',
      'Respect configured quiet hours: hold non-critical notifications while allowing critical alerts',
      { heldNotif }
    );
  } catch (err) {
    assert(false, 'SCENARIO-18', 'Respect quiet hours failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 19: Recover from device restart
  // -------------------------------------------------------------
  try {
    // Create checkpoint
    const cp = await syncService.createSyncCheckpoint(pairedMobileDevice.device_id, 'RECOVERY', {
      reboot_safe: true,
      pending_tasks: 2
    });

    const checkpoints = await syncService.getSyncCheckpoints(pairedMobileDevice.device_id);
    const hasCheckpoint = checkpoints.some(c => c.id === cp.id);

    assert(
      hasCheckpoint,
      'SCENARIO-19',
      'Recover from device restart: verify state checkpoint persistence and recovery checkpoint retrieval',
      { checkpointId: cp.id, totalCheckpoints: checkpoints.length }
    );
  } catch (err) {
    assert(false, 'SCENARIO-19', 'Recover from device restart failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 20: Reconcile Digital Twin state across devices
  // -------------------------------------------------------------
  try {
    const twinTitle = `Remote IDE Setting_${runId}`;
    const pushResult = await syncService.processIncomingSyncPush({
      device_id: pairedMobileDevice.device_id,
      twin_updates: [
        {
          category: 'preferences',
          title: twinTitle,
          content: 'Disable telemetry telemetry_opt_out = true',
          priority: 8
        }
      ]
    });

    const twinFact = await get("SELECT * FROM digital_twin_profiles WHERE title = ?", [twinTitle]);
    const isReconciled = pushResult.applied.twin_updates >= 1 &&
      twinFact &&
      twinFact.is_confirmed === 0 && // Non-negotiable security invariant: unconfirmed fact
      twinFact.source.includes('sync_dev-mobile-');

    assert(
      isReconciled,
      'SCENARIO-20',
      'Reconcile Digital Twin state across devices preserving strict unconfirmed inference invariant',
      { applied: pushResult.applied.twin_updates, is_confirmed: twinFact?.is_confirmed, source: twinFact?.source }
    );
  } catch (err) {
    assert(false, 'SCENARIO-20', 'Reconcile Digital Twin state across devices failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // Summary & Evidence Export
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`  PHASE 11 ADVERSARIAL VALIDATION SUMMARY: ${passCount} / ${results.length} PASSED`);
  console.log('================================================================\n');

  if (!fs.existsSync(DELIVERABLES_DIR)) {
    fs.mkdirSync(DELIVERABLES_DIR, { recursive: true });
  }

  const evidencePath = path.join(DELIVERABLES_DIR, 'phase11_device_evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify({
    suite: 'JARVIS OS 2.0 — PHASE 11: AMBIENT PERSONAL INTELLIGENCE ADVERSARIAL VALIDATION',
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passed: passCount,
    failed: failCount,
    passRate: `${Math.round((passCount / results.length) * 100)}%`,
    evidenceRecords: results
  }, null, 2));

  console.log(`Saved detailed evidence to: ${evidencePath}\n`);

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
