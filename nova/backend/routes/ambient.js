import express from 'express';
import { getDeviceIdentity } from '../services/deviceIdentityService.js';
import { getCrossDeviceSync } from '../services/crossDeviceSyncService.js';
import { getAmbientContextService } from '../services/ambientContextService.js';
import { getUnifiedNotification } from '../services/unifiedNotificationService.js';
import { getCrossDeviceConversation } from '../services/crossDeviceConversationService.js';
import { getDeviceOrchestration } from '../services/deviceOrchestrationService.js';
import { getConnectivityManager } from '../services/connectivityManagerService.js';
// Phase 19 extensions
import { getPhase19DeviceTrust } from '../services/phase19DeviceTrustService.js';
import { getPhase19IntelligentOrchestration } from '../services/phase19IntelligentOrchestrationService.js';
import { getPhase19SyncExtension } from '../services/phase19SyncExtensionService.js';

const router = express.Router();

/**
 * Middleware: Verify Device Authentication
 * Checks token against DeviceIdentityService.
 */
export const requireDeviceAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Device authorization token required' });
  }

  const rawToken = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';

  const deviceIdentity = getDeviceIdentity();
  const auth = await deviceIdentity.authenticateDevice(rawToken, ip);

  if (!auth.authenticated) {
    return res.status(401).json({ success: false, error: auth.reason || 'Unauthorized device credential' });
  }

  req.authenticatedDevice = auth;
  next();
};

// ----------------------------------------------------
// P0: UNIFIED DEVICE IDENTITY & PAIRING
// ----------------------------------------------------

// 1. Generate one-time dynamic enrollment token
router.post('/devices/enroll', async (req, res) => {
  try {
    const deviceIdentity = getDeviceIdentity();
    const result = await deviceIdentity.generateEnrollmentToken(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Pair device with enrollment code
router.post('/devices/pair', async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'jarvis-client';
    const deviceIdentity = getDeviceIdentity();
    const paired = await deviceIdentity.pairDeviceWithToken({
      ...req.body,
      ip_address: ip,
      user_agent: userAgent
    });
    res.json({ success: true, ...paired });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 3. List all trusted devices
router.get('/devices', async (req, res) => {
  try {
    const deviceIdentity = getDeviceIdentity();
    const devices = await deviceIdentity.getTrustedDevices();
    res.json({ success: true, count: devices.length, devices });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Get specific device details
router.get('/devices/:id', async (req, res) => {
  try {
    const deviceIdentity = getDeviceIdentity();
    const device = await deviceIdentity.getDeviceById(req.params.id);
    if (!device) return res.status(404).json({ success: false, error: 'Device not found' });
    res.json({ success: true, device });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Revoke a device
router.post('/devices/:id/revoke', async (req, res) => {
  try {
    const deviceIdentity = getDeviceIdentity();
    const result = await deviceIdentity.revokeDevice(req.params.id, req.body.reason);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Rotate device credential
router.post('/devices/:id/rotate', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const deviceIdentity = getDeviceIdentity();
    const result = await deviceIdentity.rotateDeviceCredential(req.params.id, token);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// P1: CROSS-DEVICE CONTEXT SYNCHRONIZATION
// ----------------------------------------------------

// 7. Get sync payload for a device
router.get('/sync', async (req, res) => {
  try {
    const syncService = getCrossDeviceSync();
    const deviceId = req.query.device_id || 'desktop-main';
    const payload = await syncService.generateSyncPayload(deviceId, req.query.since);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Push incoming sync from companion
router.post('/sync/push', async (req, res) => {
  try {
    const syncService = getCrossDeviceSync();
    const result = await syncService.processIncomingSyncPush(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Queue offline operation
router.post('/sync/queue', async (req, res) => {
  try {
    const syncService = getCrossDeviceSync();
    const queued = await syncService.queueOfflineOperation(req.body);
    res.json({ success: true, queued });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Drain offline queue upon reconnect
router.post('/sync/drain', async (req, res) => {
  try {
    const syncService = getCrossDeviceSync();
    const drained = await syncService.drainOfflineQueue(req.body.device_id);
    res.json({ success: true, ...drained });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. Get synchronization checkpoints
router.get('/sync/checkpoints', async (req, res) => {
  try {
    const syncService = getCrossDeviceSync();
    const checkpoints = await syncService.getSyncCheckpoints(req.query.device_id);
    res.json({ success: true, count: checkpoints.length, checkpoints });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// P2: AMBIENT CONTEXT AWARENESS & PRIVACY
// ----------------------------------------------------

// 12. Get ambient context across active devices
router.get('/context', async (req, res) => {
  try {
    const ambientService = getAmbientContextService();
    const contexts = await ambientService.getAllDevicesAmbientContext();
    res.json({ success: true, count: contexts.length, contexts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13. Get ambient context for single device
router.get('/context/:deviceId', async (req, res) => {
  try {
    const ambientService = getAmbientContextService();
    const context = await ambientService.getAmbientContext(req.params.deviceId);
    res.json({ success: true, context });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14. Update device ambient context
router.post('/context/:deviceId', async (req, res) => {
  try {
    const ambientService = getAmbientContextService();
    const updated = await ambientService.updateDeviceContext(req.params.deviceId, req.body);
    res.json({ success: true, context: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 15. Update privacy and observation permissions (mic, screen, camera)
router.put('/context/:deviceId/privacy', async (req, res) => {
  try {
    const ambientService = getAmbientContextService();
    const updated = await ambientService.setPrivacyPermissions(req.params.deviceId, req.body);
    res.json({ success: true, context: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 16. Record event-driven signal
router.post('/context/:deviceId/signals', async (req, res) => {
  try {
    const ambientService = getAmbientContextService();
    const { signalType, signalPayload } = req.body;
    const recorded = await ambientService.recordEventDrivenSignal(req.params.deviceId, signalType, signalPayload);
    res.json({ success: true, ...recorded });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// P3: UNIFIED NOTIFICATION INTELLIGENCE
// ----------------------------------------------------

// 17. Get active notifications
router.get('/notifications', async (req, res) => {
  try {
    const notifService = getUnifiedNotification();
    const notifications = await notifService.getActiveNotifications(req.query.device_id, parseInt(req.query.limit, 10) || 25);
    res.json({ success: true, count: notifications.length, notifications });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 18. Dispatch unified notification
router.post('/notifications', async (req, res) => {
  try {
    const notifService = getUnifiedNotification();
    const result = await notifService.dispatchNotification(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 19. Acknowledge notification
router.post('/notifications/:id/ack', async (req, res) => {
  try {
    const notifService = getUnifiedNotification();
    const ack = await notifService.acknowledgeNotification(req.params.id, req.body.device_id);
    res.json({ success: true, ...ack });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 20. Configure quiet hours
router.post('/notifications/quiet-hours', async (req, res) => {
  try {
    const notifService = getUnifiedNotification();
    const qh = await notifService.configureQuietHours(req.body);
    res.json({ success: true, quiet_hours: qh });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// P4: VOICE & CONVERSATION CONTINUITY
// ----------------------------------------------------

// 21. Initiate conversational or voice handoff
router.post('/handoff/initiate', async (req, res) => {
  try {
    const convService = getCrossDeviceConversation();
    const handoff = await convService.initiateConversationHandoff(req.body);
    res.json({ success: true, ...handoff });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 22. Accept handoff on receiving device
router.post('/handoff/:id/accept', async (req, res) => {
  try {
    const convService = getCrossDeviceConversation();
    const resumed = await convService.acceptHandoff(req.params.id, req.body.device_id);
    res.json({ success: true, ...resumed });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 23. Acquire command execution lock (anti-duplicate)
router.post('/voice/lock', async (req, res) => {
  try {
    const convService = getCrossDeviceConversation();
    const lock = await convService.acquireCommandExecutionLock(req.body.commandText, req.body.deviceId);
    res.json({ success: true, ...lock });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// P5: DEVICE ORCHESTRATION & REMOTE APPROVALS
// ----------------------------------------------------

// 24. Route approval request to device
router.post('/orchestration/route-approval', async (req, res) => {
  try {
    const orchService = getDeviceOrchestration();
    const routed = await orchService.routeApprovalRequest(req.body);
    res.json({ success: true, ...routed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 25. Process remote approval decision
router.post('/approvals/:stepId/decide', async (req, res) => {
  try {
    const orchService = getDeviceOrchestration();
    const decision = await orchService.processRemoteApprovalDecision({
      step_id: req.params.stepId,
      ...req.body
    });
    res.json(decision);
  } catch (err) {
    res.status(403).json({ success: false, error: err.message });
  }
});

// 26. Dispatch deliverable evidence to device
router.post('/orchestration/dispatch-deliverable', async (req, res) => {
  try {
    const orchService = getDeviceOrchestration();
    const dispatched = await orchService.dispatchDeliverableEvidence(req.body);
    res.json({ success: true, ...dispatched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// P6: CONNECTIVITY & RECOVERY
// ----------------------------------------------------

// 27. Record device heartbeat
router.post('/connectivity/heartbeat', async (req, res) => {
  try {
    const connService = getConnectivityManager();
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const beat = await connService.recordHeartbeat(req.body.device_id, ip);
    res.json({ success: true, ...beat });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 28. Scan connectivity timeouts
router.post('/connectivity/scan-timeouts', async (req, res) => {
  try {
    const connService = getConnectivityManager();
    const scan = await connService.scanConnectivityTimeouts();
    res.json({ success: true, ...scan });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// PHASE 19: UNIVERSAL DEVICE INTELLIGENCE ROUTES
// =====================================================

// P19-1: Set device trust level
router.patch('/devices/:id/trust', async (req, res) => {
  try {
    const svc = getPhase19DeviceTrust();
    const result = await svc.setDeviceTrustLevel(req.params.id, req.body.trustLevel);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// P19-2: Update device health metrics
router.post('/devices/:id/health', async (req, res) => {
  try {
    const svc = getPhase19DeviceTrust();
    const result = await svc.updateDeviceHealth(req.params.id, req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// P19-3: Device health summary
router.get('/devices/health/summary', async (req, res) => {
  try {
    const svc = getPhase19DeviceTrust();
    const result = await svc.getDeviceHealthSummary();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// P19-4: Quarantine compromised device
router.post('/devices/:id/quarantine', async (req, res) => {
  try {
    const svc = getPhase19DeviceTrust();
    const result = await svc.quarantineCompromisedDevice(req.params.id, req.body.reason || 'Manual quarantine');
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// P19-5: Get routing decisions
router.get('/routing/decisions', async (req, res) => {
  try {
    const svc = getPhase19IntelligentOrchestration();
    const limit = parseInt(req.query.limit) || 50;
    const decisions = await svc.getRoutingDecisions(limit);
    res.json({ success: true, decisions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// P19-6: Select best device for task
router.post('/orchestration/select-device', async (req, res) => {
  try {
    const svc = getPhase19IntelligentOrchestration();
    const { taskType, requiredCapabilities } = req.body;
    const result = await svc.selectBestDevice(taskType, requiredCapabilities);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// P19-7: Transfer workflow context between devices
router.post('/orchestration/transfer-workflow', async (req, res) => {
  try {
    const svc = getPhase19IntelligentOrchestration();
    const { missionId, fromDeviceId, toDeviceId } = req.body;
    const result = await svc.transferWorkflowContext(missionId, fromDeviceId, toDeviceId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// P19-8: Handle expired approvals
router.post('/orchestration/handle-expired-approvals', async (req, res) => {
  try {
    const svc = getPhase19IntelligentOrchestration();
    const result = await svc.handleExpiredApprovals();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// P19-9: Sync mission state to device
router.get('/sync/mission/:missionId', async (req, res) => {
  try {
    const svc = getPhase19SyncExtension();
    const deviceId = req.query.device_id;
    if (!deviceId) return res.status(400).json({ success: false, error: 'device_id required' });
    const result = await svc.syncMissionState(deviceId, req.params.missionId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// P19-10: Prune expired offline queue items
router.post('/sync/prune-expired', async (req, res) => {
  try {
    const svc = getPhase19SyncExtension();
    const result = await svc.pruneExpiredQueueItems();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// P19-11: Dashboard summary (all device telemetry)
router.get('/dashboard/summary', async (req, res) => {
  try {
    const trustSvc = getPhase19DeviceTrust();
    const orchSvc = getPhase19IntelligentOrchestration();
    const syncSvc = getPhase19SyncExtension();
    const devIdSvc = getDeviceIdentity();
    const notifSvc = getUnifiedNotification();

    const [healthSummary, routingDecisions, syncQueue, devices, notifications] = await Promise.all([
      trustSvc.getDeviceHealthSummary(),
      orchSvc.getRoutingDecisions(10),
      syncSvc.getSyncQueueStats(),
      devIdSvc.getTrustedDevices(),
      notifSvc.getActiveNotifications(null, 20).catch(() => [])
    ]);

    res.json({
      success: true,
      health: healthSummary,
      routing: { recent_decisions: routingDecisions },
      sync_queue: syncQueue,
      devices,
      notifications: Array.isArray(notifications) ? notifications : (notifications.notifications || [])
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// P19-12: Nonce registry stats (security)
router.get('/security/nonces', async (req, res) => {
  try {
    const { query: dbQuery } = await import('../database/db.js');
    const nonces = await dbQuery(
      'SELECT device_id, COUNT(*) as count FROM consumed_nonces GROUP BY device_id'
    );
    res.json({ success: true, nonces });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
