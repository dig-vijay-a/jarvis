import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import axios from 'axios';
import express from 'express';

const ISOLATED_DB_DIR = path.resolve('nova/data/sentinel_disposable_test/phase19_isolated');
const ISOLATED_DB_PATH = path.join(ISOLATED_DB_DIR, 'phase19.sqlite');
const PROD_DB_PATH = path.resolve('nova/data/nova.sqlite');
const DELIVERABLES_DIR = path.resolve('nova/deliverables');

fs.mkdirSync(ISOLATED_DB_DIR, { recursive: true });
fs.mkdirSync(DELIVERABLES_DIR, { recursive: true });

for (const ext of ['', '-wal', '-shm']) {
  const f = ISOLATED_DB_PATH + ext;
  if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (_) {}
}

process.env.NOVA_DB_PATH = ISOLATED_DB_PATH;
process.env.ZERO_COST_LOCAL_ONLY = 'true';
process.env.OLLAMA_ENDPOINT = 'http://127.0.0.1:11434';
process.env.OLLAMA_MODEL = 'qwen3.5:4b';

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

const CLOUD_LLM_HOSTS = [
  'api.groq.com',
  'generativelanguage.googleapis.com',
  'openrouter.ai',
  'api.mistral.ai',
  'api.openai.com',
  'api.anthropic.com',
  'ollama.com'
];

function installNetMonitor() {
  const reqs = [];
  const id = axios.interceptors.request.use(cfg => {
    try { reqs.push({ host: new URL(cfg.url).hostname, url: cfg.url }); } catch (_) {}
    return cfg;
  });
  return { reqs, restore: () => axios.interceptors.request.eject(id) };
}

const results = [];
function record(id, category, name, passed, details = '') {
  results.push({ id, category, name, passed: !!passed, details });
  const icon = passed ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${id} (${category}) - ${name}${details ? ' :: ' + details : ''}`);
}

async function runTests() {
  const prodHashBefore = fs.existsSync(PROD_DB_PATH) ? sha256File(PROD_DB_PATH) : null;
  const netMon = installNetMonitor();

  // Dynamic imports after NOVA_DB_PATH is set
  const dbModule = await import('./backend/database/db.js');
  const { initDatabase, query, run, get } = dbModule.default ? { initDatabase: dbModule.initDatabase || dbModule.default.initDatabase, query: dbModule.query || dbModule.default.query, run: dbModule.run || dbModule.default.run, get: dbModule.get || dbModule.default.get } : dbModule;
  await initDatabase();

  const { getDeviceIdentity } = await import('./backend/services/deviceIdentityService.js');
  const { getPhase19DeviceTrust } = await import('./backend/services/phase19DeviceTrustService.js');
  const { getCrossDeviceSync } = await import('./backend/services/crossDeviceSyncService.js');
  const { getPhase19SyncExtension } = await import('./backend/services/phase19SyncExtensionService.js');
  const { getCrossDeviceConversation } = await import('./backend/services/crossDeviceConversationService.js');
  const { getDeviceOrchestration } = await import('./backend/services/deviceOrchestrationService.js');
  const { getPhase19IntelligentOrchestration } = await import('./backend/services/phase19IntelligentOrchestrationService.js');
  const { getConnectivityManager } = await import('./backend/services/connectivityManagerService.js');
  const { getUnifiedNotification } = await import('./backend/services/unifiedNotificationService.js');
  const ambientRouter = (await import('./backend/routes/ambient.js')).default;

  const deviceIdentity = getDeviceIdentity();
  const trustSvc = getPhase19DeviceTrust();
  const syncSvc = getCrossDeviceSync();
  const syncExt = getPhase19SyncExtension();
  const convSvc = getCrossDeviceConversation();
  const orchSvc = getDeviceOrchestration();
  const intOrch = getPhase19IntelligentOrchestration();
  const connSvc = getConnectivityManager();
  const notifSvc = getUnifiedNotification();

  let pairedMobile = null;
  let pairedDesktop = null;
  let pairedBrowser = null;

  // ========================================================
  // CATEGORY A: Device Identity & Trust (T01-T06)
  // ========================================================
  try {
    const enr = await deviceIdentity.generateEnrollmentToken({
      device_name: 'Pixel-9-Pro',
      device_type: 'android',
      permissions: ['chat', 'status', 'missions', 'tasks', 'approvals']
    });
    const paired = await deviceIdentity.pairDeviceWithToken({
      enrollment_code: enr.enrollment_code,
      token: enr.token,
      device_name: 'Pixel-9-Pro',
      device_type: 'android',
      capabilities: ['chat', 'voice', 'missions', 'approvals', 'notifications']
    });
    pairedMobile = paired;
    const ok = !!paired.device_id && !!paired.device_token && enr.enrollment_code !== '000000' && enr.enrollment_code.length === 6;
    record('T01', 'A', 'Cryptographic pairing with dynamic enrollment token', ok, `device=${paired.device_id}`);
  } catch (e) {
    record('T01', 'A', 'Cryptographic pairing with dynamic enrollment token', false, e.message);
  }

  try {
    const auth = await deviceIdentity.authenticateDevice('jarvis-forged-token-123456', '127.0.0.1');
    record('T02', 'A', 'Forged identity rejection', !auth.authenticated, `authenticated=${auth.authenticated}`);
  } catch (e) {
    record('T02', 'A', 'Forged identity rejection', true, e.message);
  }

  try {
    const expiredEnr = await deviceIdentity.generateEnrollmentToken({
      device_name: 'Expired-Phone',
      device_type: 'android',
      ttlSeconds: -10
    });
    let rejected = false;
    try {
      await deviceIdentity.pairDeviceWithToken({
        enrollment_code: expiredEnr.enrollment_code,
        token: expiredEnr.token,
        device_name: 'Expired-Phone'
      });
    } catch (_) {
      rejected = true;
    }
    record('T03', 'A', 'Expired enrollment token rejection', rejected);
  } catch (e) {
    record('T03', 'A', 'Expired enrollment token rejection', false, e.message);
  }

  try {
    const enrTemp = await deviceIdentity.generateEnrollmentToken({ device_name: 'Revoke-Test', device_type: 'mobile' });
    const pTemp = await deviceIdentity.pairDeviceWithToken({
      enrollment_code: enrTemp.enrollment_code,
      token: enrTemp.token,
      device_name: 'Revoke-Test'
    });
    const beforeAuth = await deviceIdentity.authenticateDevice(pTemp.device_token);
    await deviceIdentity.revokeDevice(pTemp.device_id, 'Security test revocation');
    const afterAuth = await deviceIdentity.authenticateDevice(pTemp.device_token);
    record('T04', 'A', 'Device revocation immediately blocks auth', beforeAuth.authenticated && !afterAuth.authenticated);
  } catch (e) {
    record('T04', 'A', 'Device revocation immediately blocks auth', false, e.message);
  }

  try {
    const enrDesk = await deviceIdentity.generateEnrollmentToken({ device_name: 'Windows-Workstation', device_type: 'desktop' });
    pairedDesktop = await deviceIdentity.pairDeviceWithToken({
      enrollment_code: enrDesk.enrollment_code,
      token: enrDesk.token,
      device_name: 'Windows-Workstation',
      device_type: 'desktop',
      capabilities: ['coding', 'analysis', 'workflow', 'missions', 'file_management']
    });
    await trustSvc.setDeviceTrustLevel(pairedDesktop.device_id, 'FULL_TRUST');
    await trustSvc.setDeviceTrustLevel(pairedMobile.device_id, 'LIMITED');
    const deskCanAdmin = await trustSvc.checkTrustPermission(pairedDesktop.device_id, 'admin');
    const mobCanApprove = await trustSvc.checkTrustPermission(pairedMobile.device_id, 'approvals');
    // Restore mobile to TRUSTED for later approval tests
    await trustSvc.setDeviceTrustLevel(pairedMobile.device_id, 'TRUSTED');
    record('T05', 'A', 'Trust level assignment and permission scoping', deskCanAdmin && !mobCanApprove);
  } catch (e) {
    record('T05', 'A', 'Trust level assignment and permission scoping', false, e.message);
  }

  try {
    const enrRot = await deviceIdentity.generateEnrollmentToken({ device_name: 'Rotate-Device', device_type: 'tablet' });
    const pRot = await deviceIdentity.pairDeviceWithToken({
      enrollment_code: enrRot.enrollment_code,
      token: enrRot.token,
      device_name: 'Rotate-Device',
      device_type: 'tablet'
    });
    const rotated = await deviceIdentity.rotateDeviceCredential(pRot.device_id, pRot.device_token);
    const oldAuth = await deviceIdentity.authenticateDevice(pRot.device_token);
    const newAuth = await deviceIdentity.authenticateDevice(rotated.new_device_token);
    record('T06', 'A', 'Credential rotation generates new token, invalidates old', !oldAuth.authenticated && newAuth.authenticated);
  } catch (e) {
    record('T06', 'A', 'Credential rotation generates new token, invalidates old', false, e.message);
  }

  // ========================================================
  // CATEGORY B: Session Security & Replay Protection (T07-T10)
  // ========================================================
  try {
    const enrExp = await deviceIdentity.generateEnrollmentToken({ device_name: 'Session-Exp', device_type: 'mobile' });
    const pExp = await deviceIdentity.pairDeviceWithToken({
      enrollment_code: enrExp.enrollment_code,
      token: enrExp.token,
      device_name: 'Session-Exp'
    });
    const pastIso = new Date(Date.now() - 60000).toISOString();
    await run('UPDATE mobile_sessions SET expires_at = ? WHERE id = ?', [pastIso, pExp.device_id]);
    // Also remove from trusted_devices or check mobile_sessions expiry
    await run("UPDATE trusted_devices SET pairing_status = 'EXPIRED' WHERE id = ?", [pExp.device_id]);
    const auth = await deviceIdentity.authenticateDevice(pExp.device_token);
    record('T07', 'B', 'Expired session rejection', !auth.authenticated);
  } catch (e) {
    record('T07', 'B', 'Expired session rejection', false, e.message);
  }

  try {
    const nonce = `nonce-${crypto.randomUUID()}`;
    const first = await trustSvc.validateNonce(nonce, pairedMobile.device_id, 60);
    let replayBlocked = false;
    try {
      await trustSvc.validateNonce(nonce, pairedMobile.device_id, 60);
    } catch (err) {
      if (err.message.includes('REPLAY_ATTACK_DETECTED')) replayBlocked = true;
    }
    record('T08', 'B', 'Replay attack blocked by nonce registry', first.consumed && replayBlocked);
  } catch (e) {
    record('T08', 'B', 'Replay attack blocked by nonce registry', false, e.message);
  }

  try {
    const staleTs = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago (> 5 min TTL)
    const freshTs = new Date().toISOString();
    const staleCheck = connSvc.verifyCommandReplayFreshness(staleTs);
    const freshCheck = connSvc.verifyCommandReplayFreshness(freshTs);
    record('T09', 'B', 'Stale command replay rejected (> 5-minute timestamp)', !staleCheck.valid && freshCheck.valid);
  } catch (e) {
    record('T09', 'B', 'Stale command replay rejected (> 5-minute timestamp)', false, e.message);
  }

  try {
    const payload = { action: 'approve', step_id: 'step-1', ts: Date.now() };
    const sig = trustSvc.generateHmacSignature(payload, pairedMobile.device_token);
    const valid = trustSvc.verifyHmacSignature(payload, sig, pairedMobile.device_token);
    const tampered = trustSvc.verifyHmacSignature({ ...payload, action: 'delete_all' }, sig, pairedMobile.device_token);
    record('T10', 'B', 'HMAC signature verification blocks tampered payloads', valid && !tampered);
  } catch (e) {
    record('T10', 'B', 'HMAC signature verification blocks tampered payloads', false, e.message);
  }

  // ========================================================
  // CATEGORY C: Cross-Device Synchronization (T11-T16)
  // ========================================================
  const missionId = `m-p19-${Date.now()}`;
  try {
    await run(
      `INSERT INTO missions (id, objective, status, created_at) VALUES (?, ?, 'RUNNING', ?)`,
      [missionId, 'Phase 19 cross-device sync test mission', new Date().toISOString()]
    );
    const syncRes = await syncSvc.generateSyncPayload(pairedMobile.device_id, null);
    const p = syncRes.payload || {};
    const hasFields = Array.isArray(p.missions) && Array.isArray(p.notifications) && p.missions.some(m => m.id === missionId);
    record('T11', 'C', 'Full sync payload generation', hasFields, `missions=${p.missions?.length}`);
  } catch (e) {
    record('T11', 'C', 'Full sync payload generation', false, e.message);
  }

  try {
    const futureTs = new Date(Date.now() + 60000).toISOString();
    const incRes = await syncSvc.generateSyncPayload(pairedMobile.device_id, futureTs);
    const ip = incRes.payload || {};
    const filteredOut = Array.isArray(ip.notifications) && ip.notifications.length === 0;
    record('T12', 'C', 'Incremental sync (since=timestamp filters correctly)', filteredOut);
  } catch (e) {
    record('T12', 'C', 'Incremental sync (since=timestamp filters correctly)', false, e.message);
  }

  try {
    const res = syncExt.resolveThreeWayConflict(
      { id: 't1', status: 'DONE', sync_sequence: 2, updated_at: '2026-11-27T07:00:00Z' },
      { id: 't1', status: 'IN_PROGRESS', sync_sequence: 5, updated_at: '2026-11-27T07:01:00Z' },
      { id: 't1', status: 'PENDING', sync_sequence: 1 }
    );
    record('T13', 'C', 'Incoming sync push with LWW conflict resolution', res.winner === 'remote' && res.version.sync_sequence === 5);
  } catch (e) {
    record('T13', 'C', 'Incoming sync push with LWW conflict resolution', false, e.message);
  }

  try {
    const notif = await notifSvc.dispatchNotification({
      title: 'Offline Ack Test',
      message: 'Queued while offline',
      target_device_id: pairedMobile.device_id
    });
    const q = await syncSvc.queueOfflineOperation({
      device_id: pairedMobile.device_id,
      operation_type: 'NOTIFICATION_ACK',
      idempotency_key: `idem-${Date.now()}-1`,
      payload: { notification_id: notif.notification_id },
      ttlSeconds: 3600
    });
    const drained = await syncSvc.drainOfflineQueue(pairedMobile.device_id);
    record('T14', 'C', 'Offline operation queue: persist -> drain on reconnect', q.status === 'PENDING' && drained.drained_count >= 1);
  } catch (e) {
    record('T14', 'C', 'Offline operation queue: persist -> drain on reconnect', false, e.message);
  }

  try {
    await syncSvc.queueOfflineOperation({
      device_id: pairedMobile.device_id,
      operation_type: 'NOTIFICATION_ACK',
      idempotency_key: `idem-expired-${Date.now()}`,
      payload: { notification_id: 'nonexistent' },
      ttlSeconds: -60
    });
    const pruned = await syncExt.pruneExpiredQueueItems();
    record('T15', 'C', 'Expired offline operations rejected/pruned on drain', pruned.expired_marked >= 1);
  } catch (e) {
    record('T15', 'C', 'Expired offline operations rejected/pruned on drain', false, e.message);
  }

  try {
    const dupKey = `idem-dup-${Date.now()}`;
    const q1 = await syncExt.queueOperationWithRetryLimit(pairedMobile.device_id, {
      operation_type: 'TASK_STATUS',
      idempotency_key: dupKey,
      payload: { task_id: 't-1', status: 'DONE' }
    });
    const q2 = await syncExt.queueOperationWithRetryLimit(pairedMobile.device_id, {
      operation_type: 'TASK_STATUS',
      idempotency_key: dupKey,
      payload: { task_id: 't-1', status: 'DONE' }
    });
    record('T16', 'C', 'Duplicate operation idempotency', q1.queued === true && q2.queued === false);
  } catch (e) {
    record('T16', 'C', 'Duplicate operation idempotency', false, e.message);
  }

  // ========================================================
  // CATEGORY D: Mission Handoff & Workflow Transfer (T17-T20)
  // ========================================================
  const stepId = `step-p19-${Date.now()}`;
  try {
    await run(
      `INSERT INTO mission_steps (id, mission_id, step_index, title, description, agent_key, tool, status, requires_approval, started_at)
       VALUES (?, ?, 1, 'Deploy release', 'Deploy release artifact', 'coding', 'shell_exec', 'WAITING_FOR_APPROVAL', 1, ?)`,
      [stepId, missionId, new Date().toISOString()]
    );
    const routed = await orchSvc.routeApprovalRequest({
      mission_id: missionId,
      step_id: stepId,
      tool: 'shell_exec',
      reason: 'Confirm deployment',
      target_device_id: pairedMobile.device_id
    });
    record('T17', 'D', 'Mission approval routed to companion device as notification', routed.routed && !!routed.notification_id);
  } catch (e) {
    record('T17', 'D', 'Mission approval routed to companion device as notification', false, e.message);
  }

  try {
    const decision = await orchSvc.processRemoteApprovalDecision({
      step_id: stepId,
      mission_id: missionId,
      decision: 'approved',
      device_id: pairedMobile.device_id,
      device_token: pairedMobile.device_token
    });
    record('T18', 'D', 'Remote approval decision from authorized device resumes mission', decision.success && decision.decision === 'approved');
  } catch (e) {
    record('T18', 'D', 'Remote approval decision from authorized device resumes mission', false, e.message);
  }

  try {
    const stepId2 = `step-p19-unauth-${Date.now()}`;
    await run(
      `INSERT INTO mission_steps (id, mission_id, step_index, title, description, agent_key, tool, status, requires_approval, started_at)
       VALUES (?, ?, 2, 'Sensitive op', 'Sensitive op', 'coding', 'shell_exec', 'WAITING_FOR_APPROVAL', 1, ?)`,
      [stepId2, missionId, new Date().toISOString()]
    );
    let rejected = false;
    try {
      await orchSvc.processRemoteApprovalDecision({
        step_id: stepId2,
        mission_id: missionId,
        decision: 'approved',
        device_id: pairedMobile.device_id,
        device_token: 'forged-token-xyz'
      });
    } catch (_) {
      rejected = true;
    }
    record('T19', 'D', 'Remote approval from unauthorized device rejected', rejected);
  } catch (e) {
    record('T19', 'D', 'Remote approval from unauthorized device rejected', false, e.message);
  }

  try {
    const transfer = await intOrch.transferWorkflowContext(missionId, pairedDesktop.device_id, pairedMobile.device_id);
    const accepted = await convSvc.acceptHandoff(transfer.handoff_id, pairedMobile.device_id);
    record('T20', 'D', 'Workflow context transfer between devices', !!transfer.handoff_id && transfer.steps_count >= 1 && !!accepted);
  } catch (e) {
    record('T20', 'D', 'Workflow context transfer between devices', false, e.message);
  }

  // ========================================================
  // CATEGORY E: Offline & Recovery (T21-T24)
  // ========================================================
  try {
    await run("UPDATE trusted_devices SET connectivity_status = 'OFFLINE' WHERE id = ?", [pairedMobile.device_id]);
    const beat = await connSvc.recordHeartbeat(pairedMobile.device_id, '127.0.0.1');
    record('T21', 'E', 'Device heartbeat: OFFLINE->ONLINE triggers queue drain', beat.reconnected === true && beat.status === 'ONLINE');
  } catch (e) {
    record('T21', 'E', 'Device heartbeat: OFFLINE->ONLINE triggers queue drain', false, e.message);
  }

  try {
    const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    await run("UPDATE trusted_devices SET connectivity_status = 'OFFLINE', last_seen_at = ? WHERE id = ?", [twoDaysAgo, pairedMobile.device_id]);
    const recon = await connSvc.handleDeviceReconnection(pairedMobile.device_id);
    await connSvc.recordHeartbeat(pairedMobile.device_id, '127.0.0.1');
    record('T22', 'E', 'Stale device (>24h offline) forces full resync checkpoint', recon.reconnection_status === 'STALE_FULL_RESYNC_REQUIRED');
  } catch (e) {
    record('T22', 'E', 'Stale device (>24h offline) forces full resync checkpoint', false, e.message);
  }

  try {
    const convId = `conv-p19-${Date.now()}`;
    await run("INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, 'Handoff Test', ?, ?)", [convId, new Date().toISOString(), new Date().toISOString()]);
    const handoff = await convSvc.initiateConversationHandoff({
      source_device_id: pairedDesktop.device_id,
      target_device_id: pairedMobile.device_id,
      conversation_id: convId,
      partial_transcript: 'Resume my coding review'
    });
    const oldCreated = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    await run("UPDATE cross_device_handoffs SET created_at = ? WHERE id = ?", [oldCreated, handoff.handoff_id]);
    const rec = await connSvc.recoverInterruptedHandoffs(pairedMobile.device_id);
    record('T23', 'E', 'Interrupted conversation handoff recovered after device restart', rec.recovered_count >= 1);
  } catch (e) {
    record('T23', 'E', 'Interrupted conversation handoff recovered after device restart', false, e.message);
  }

  try {
    const expiredStepId = `step-exp-${Date.now()}`;
    const oldStart = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    await run(
      `INSERT INTO mission_steps (id, mission_id, step_index, title, description, agent_key, tool, status, requires_approval, started_at)
       VALUES (?, ?, 3, 'Old approval', 'Old approval', 'coding', 'shell_exec', 'WAITING_FOR_APPROVAL', 1, ?)`,
      [expiredStepId, missionId, oldStart]
    );
    const expRes = await intOrch.handleExpiredApprovals();
    const row = await get('SELECT status FROM mission_steps WHERE id = ?', [expiredStepId]);
    record('T24', 'E', 'Expired approval auto-expires when device offline >30min', expRes.expired_approvals >= 1 && row?.status === 'APPROVAL_EXPIRED');
  } catch (e) {
    record('T24', 'E', 'Expired approval auto-expires when device offline >30min', false, e.message);
  }

  // ========================================================
  // CATEGORY F: Intelligent Device Orchestration (T25-T27)
  // ========================================================
  try {
    await trustSvc.updateDeviceHealth(pairedDesktop.device_id, { cpu_load_percent: 15, network_type: 'ETHERNET' });
    await trustSvc.updateDeviceHealth(pairedMobile.device_id, { battery_level: 85, cpu_load_percent: 20, network_type: 'WIFI' });
    const codingRoute = await intOrch.selectBestDevice('coding');
    record('T25', 'F', 'Coding task routed to desktop device', codingRoute.selected_device_id === pairedDesktop.device_id, `selected=${codingRoute.selected_device?.type}`);
  } catch (e) {
    record('T25', 'F', 'Coding task routed to desktop device', false, e.message);
  }

  try {
    const voiceRoute = await intOrch.selectBestDevice('voice');
    record('T26', 'F', 'Voice/approval task routed to mobile device', voiceRoute.selected_device_id === pairedMobile.device_id, `selected=${voiceRoute.selected_device?.type}`);
  } catch (e) {
    record('T26', 'F', 'Voice/approval task routed to mobile device', false, e.message);
  }

  try {
    const enrBr = await deviceIdentity.generateEnrollmentToken({ device_name: 'Chrome-Browser', device_type: 'browser' });
    pairedBrowser = await deviceIdentity.pairDeviceWithToken({
      enrollment_code: enrBr.enrollment_code,
      token: enrBr.token,
      device_name: 'Chrome-Browser',
      device_type: 'browser',
      capabilities: ['web_research', 'chat']
    });
    // Mark mobile offline -> approval should reroute to desktop/browser
    await run("UPDATE trusted_devices SET connectivity_status = 'OFFLINE' WHERE id = ?", [pairedMobile.device_id]);
    const rerouted = await intOrch.selectBestDevice('approval');
    await connSvc.recordHeartbeat(pairedMobile.device_id, '127.0.0.1');
    record('T27', 'F', 'Device unavailable -> task rerouted to next best device', !!rerouted.selected_device_id && rerouted.selected_device_id !== pairedMobile.device_id);
  } catch (e) {
    record('T27', 'F', 'Device unavailable -> task rerouted to next best device', false, e.message);
  }

  // ========================================================
  // CATEGORY G: Android Companion & Security (T28-T30)
  // ========================================================
  try {
    const enrAnd = await deviceIdentity.generateEnrollmentToken({ device_name: 'Android-Emulator', device_type: 'android' });
    const pAnd = await deviceIdentity.pairDeviceWithToken({
      enrollment_code: enrAnd.enrollment_code,
      token: enrAnd.token,
      device_name: 'Android-Emulator',
      device_type: 'android',
      capabilities: ['chat', 'voice', 'missions', 'approvals', 'notifications']
    });
    const syncRes = await syncExt.syncMissionState(pAnd.device_id, missionId);
    const androidFilesExist = fs.existsSync('nova/android-companion/app/src/main/java/com/jarvis/companion/network/JarvisApiClient.kt') &&
      fs.existsSync('nova/android-companion/app/src/main/java/com/jarvis/companion/service/DevicePairingService.kt') &&
      fs.existsSync('nova/android-companion/app/src/main/AndroidManifest.xml');
    record('T28', 'G', 'Android pairing flow end-to-end + companion project present', !!pAnd.device_token && syncRes.mission_id === missionId && androidFilesExist);
  } catch (e) {
    record('T28', 'G', 'Android pairing flow end-to-end + companion project present', false, e.message);
  }

  try {
    const stepAnd = `step-and-${Date.now()}`;
    await run(
      `INSERT INTO mission_steps (id, mission_id, step_index, title, description, agent_key, tool, status, requires_approval, started_at)
       VALUES (?, ?, 4, 'Android approval', 'Android approval step', 'system', 'notify', 'WAITING_FOR_APPROVAL', 1, ?)`,
      [stepAnd, missionId, new Date().toISOString()]
    );
    const dec = await orchSvc.processRemoteApprovalDecision({
      step_id: stepAnd,
      mission_id: missionId,
      decision: 'approved',
      device_id: pairedMobile.device_id,
      device_token: pairedMobile.device_token
    });
    record('T29', 'G', 'Android approval decision relayed and processed correctly', dec.success);
  } catch (e) {
    record('T29', 'G', 'Android approval decision relayed and processed correctly', false, e.message);
  }

  try {
    await trustSvc.quarantineCompromisedDevice(pairedBrowser.device_id, 'Suspected token leak');
    const canReadMissions = await trustSvc.checkTrustPermission(pairedBrowser.device_id, 'missions');
    const canReadMemory = await trustSvc.checkTrustPermission(pairedBrowser.device_id, 'memory');
    record('T30', 'G', 'Data privacy: quarantined/revoked device cannot read memories or missions', !canReadMissions && !canReadMemory);
  } catch (e) {
    record('T30', 'G', 'Data privacy: quarantined/revoked device cannot read memories or missions', false, e.message);
  }

  // ========================================================
  // CATEGORY H: Integrity (T31-T32)
  // ========================================================
  let server = null;
  try {
    const app = express();
    app.use(express.json());
    app.use('/api/ambient', ambientRouter);
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    const dashRes = await axios.get(`http://127.0.0.1:${port}/api/ambient/dashboard/summary`);
    const body = dashRes.data;
    const ok = dashRes.status === 200 && body.success && body.health && body.routing && Array.isArray(body.devices);
    record('T31', 'H', 'HTTP routes: dashboard summary returns all device telemetry sections', ok, `devices=${body.devices?.length}`);
  } catch (e) {
    record('T31', 'H', 'HTTP routes: dashboard summary returns all device telemetry sections', false, e.message);
  } finally {
    if (server) server.close();
  }

  try {
    netMon.restore();
    const cloudHits = netMon.reqs.filter(r => CLOUD_LLM_HOSTS.some(h => r.host.includes(h)));
    const prodHashAfter = fs.existsSync(PROD_DB_PATH) ? sha256File(PROD_DB_PATH) : null;
    const dbUnchanged = prodHashBefore === prodHashAfter;
    record('T32', 'H', 'Zero cloud hits + production DB SHA-256 preserved', cloudHits.length === 0 && dbUnchanged, `cloudHits=${cloudHits.length}, dbMatch=${dbUnchanged}`);
  } catch (e) {
    record('T32', 'H', 'Zero cloud hits + production DB SHA-256 preserved', false, e.message);
  }

  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  const summary = {
    phase: 'PHASE_19',
    title: 'Universal Device Intelligence',
    timestamp: new Date().toISOString(),
    passed: passedCount,
    total: totalCount,
    pass_rate: `${((passedCount / totalCount) * 100).toFixed(1)}%`,
    production_db_sha256: prodHashBefore,
    results
  };

  fs.writeFileSync(path.join(DELIVERABLES_DIR, 'PHASE_19_TEST_RESULTS.json'), JSON.stringify(summary, null, 2));
  console.log(`\n=== PHASE 19 TEST SUMMARY: ${passedCount}/${totalCount} PASSED (${summary.pass_rate}) ===`);
  process.exit(passedCount === totalCount ? 0 : 1);
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
