import express from 'express';
import { query, get, run } from '../database/db.js';
import { getGoalManagement } from '../services/goalManagementService.js';
import { getMissionControl } from '../services/missionControlService.js';
import { getEnvironmentalPerception } from '../services/environmentalPerceptionService.js';
import { getPredictiveIntelligence } from '../services/predictiveIntelligenceService.js';
import { getPersonalContext } from '../services/personalContextEngine.js';
import { getDeviceIdentity } from '../services/deviceIdentityService.js';
import { getUnifiedNotification } from '../services/unifiedNotificationService.js';
import ToolRegistry from '../tools/registry.js';

const router = express.Router();

/**
 * GET /api/operations/dashboard
 * Aggregates live operational telemetry, goals, active missions,
 * verification evidence, approval queues, and environmental logs.
 */
router.get('/dashboard', async (req, res) => {
  try {
    const goalService = getGoalManagement();
    const missionControl = getMissionControl();
    const perception = getEnvironmentalPerception();

    // 1. Fetch Goals
    const goals = goalService ? await goalService.getGoals() : await query('SELECT * FROM autonomous_goals ORDER BY priority DESC, created_at DESC');

    // 2. Fetch Missions
    const missions = missionControl ? await missionControl.listMissions(20) : [];
    const activeMissions = missions.filter(m => m.status === 'RUNNING' || m.status === 'PLANNING');
    const stalledMissions = missions.filter(m => m.stall_status === 'STALLED');

    // 3. Pending Approvals
    const approvalSteps = await query(
      "SELECT s.*, m.objective FROM mission_steps s JOIN missions m ON s.mission_id = m.id WHERE s.status = 'WAITING_FOR_APPROVAL' ORDER BY s.started_at DESC"
    );

    // 4. Recent Verification Evidence
    const recentVerified = await query(
      "SELECT id, mission_id, step_index, title, tool, status, verification_status, verification_evidence, completed_at FROM mission_steps WHERE verification_status IN ('VERIFIED', 'PARTIALLY_VERIFIED') ORDER BY completed_at DESC LIMIT 15"
    );

    // 5. Environmental Relevance Logs
    const relevanceLogs = await query(
      'SELECT * FROM event_relevance_logs ORDER BY timestamp DESC LIMIT 25'
    );

    // 6. Recent Replan Checkpoints
    const replanCheckpoints = await query(
      'SELECT id, mission_id, step_index, state_snapshot, created_at FROM mission_checkpoints ORDER BY created_at DESC LIMIT 10'
    );

    // 7. System Telemetry
    let telemetry = null;
    try {
      telemetry = await ToolRegistry.executeTool('get_system_telemetry', {});
    } catch (_) {}

    // 8. Predictive Intelligence Data (Phase 9)
    let predictiveIntelligence = null;
    try {
      const predictive = getPredictiveIntelligence();
      if (predictive) {
        predictiveIntelligence = await predictive.getDashboardPredictiveData();
      }
    } catch (pErr) {
      console.warn('[OperationsDashboard] Predictive data fetch error:', pErr.message);
    }

    // 9. Personal Digital Twin Context (Phase 10)
    let personalContext = null;
    try {
      const contextEngine = getPersonalContext();
      if (contextEngine) {
        personalContext = await contextEngine.buildContextSnapshot();
      }
    } catch (cErr) {
      console.warn('[OperationsDashboard] Personal context fetch error:', cErr.message);
    }

    // 10. Ambient Trusted Devices & Notifications (Phase 11)
    let trustedDevices = [];
    let ambientNotifications = [];
    try {
      const deviceIdentity = getDeviceIdentity();
      if (deviceIdentity) {
        trustedDevices = await deviceIdentity.getTrustedDevices();
      }
      const notifService = getUnifiedNotification();
      if (notifService) {
        ambientNotifications = await notifService.getActiveNotifications(null, 10);
      }
    } catch (aErr) {
      console.warn('[OperationsDashboard] Ambient data fetch error:', aErr.message);
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalGoals: goals.length,
        activeGoals: goals.filter(g => g.status === 'ACTIVE' || g.status === 'IN_PROGRESS').length,
        activeMissions: activeMissions.length,
        stalledMissions: stalledMissions.length,
        pendingApprovals: approvalSteps.length
      },
      dashboard: {
        goals,
        activeMissions,
        stalledMissions,
        approvalRequests: approvalSteps,
        verificationEvidence: recentVerified.map(r => ({
          ...r,
          verification_evidence: r.verification_evidence ? JSON.parse(r.verification_evidence) : null
        })),
        relevanceLogs,
        replanHistory: replanCheckpoints.map(c => ({
          ...c,
          state_snapshot: c.state_snapshot ? JSON.parse(c.state_snapshot) : null
        })),
        telemetry,
        predictiveIntelligence,
        personalContext,
        trustedDevices,
        ambientNotifications
      }
    });
  } catch (err) {
    console.error('[OperationsDashboard] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/operations/goals
 * Lists autonomous goals with optional status filtering
 */
router.get('/goals', async (req, res) => {
  try {
    const goalService = getGoalManagement();
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const goals = goalService ? await goalService.getGoals(filter) : [];
    res.json({ success: true, count: goals.length, goals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/operations/goals
 * Creates a new autonomous goal
 */
router.post('/goals', async (req, res) => {
  try {
    const { title, description, category, priority, deadline, success_criteria } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, error: 'Goal title is required.' });
    }

    const goalService = getGoalManagement();
    if (!goalService) {
      return res.status(500).json({ success: false, error: 'Goal Management Service not initialized.' });
    }

    const goal = await goalService.createGoal({
      title,
      description,
      category,
      priority: priority !== undefined ? Number(priority) : 2,
      deadline,
      success_criteria
    });

    res.json({ success: true, goal });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/operations/goals/:id
 * Updates an autonomous goal
 */
router.put('/goals/:id', async (req, res) => {
  try {
    const goalService = getGoalManagement();
    if (!goalService) {
      return res.status(500).json({ success: false, error: 'Goal Management Service not initialized.' });
    }

    const updated = await goalService.updateGoal(req.params.id, req.body);
    res.json({ success: true, goal: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/operations/goals/:id/link-mission
 * Links an active goal to a canonical mission
 */
router.post('/goals/:id/link-mission', async (req, res) => {
  try {
    const { missionId } = req.body;
    if (!missionId) {
      return res.status(400).json({ success: false, error: 'missionId is required.' });
    }

    const goalService = getGoalManagement();
    const updated = await goalService.linkMissionToGoal(req.params.id, missionId);
    res.json({ success: true, goal: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/operations/relevance-logs
 * Retrieves correlated environmental event logs
 */
router.get('/relevance-logs', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    let sql = 'SELECT * FROM event_relevance_logs';
    const params = [];

    if (req.query.mission_id) {
      sql += ' WHERE correlated_mission_id = ?';
      params.push(req.query.mission_id);
    }
    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const logs = await query(sql, params);
    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/operations/stalls
 * Scans active missions and goals for stall conditions
 */
router.get('/stalls', async (req, res) => {
  try {
    const goalService = getGoalManagement();
    const thresholdMinutes = Number(req.query.threshold) || 3;
    const stalledItems = goalService ? await goalService.detectStalledObjectives(thresholdMinutes) : [];
    res.json({ success: true, count: stalledItems.length, stalledItems });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/operations/recommendations
 * Generates proactive initiative recommendations based on recent environmental events
 */
router.post('/recommendations', async (req, res) => {
  try {
    const goalService = getGoalManagement();
    const perception = getEnvironmentalPerception();
    const recentEvents = perception ? await perception.getRecentEvents(20) : [];
    const recommendations = goalService ? await goalService.recommendInitiatives(recentEvents) : [];
    res.json({ success: true, count: recommendations.length, recommendations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/operations/predictions
 * Returns active forecasts, goal risk rankings, and stored predictions.
 */
router.get('/predictions', async (req, res) => {
  try {
    const predictive = getPredictiveIntelligence();
    const goalRisks = await predictive.goalRisks.evaluateAllGoalRisks();
    const resourceForecast = await predictive.resources.forecastResourceTrends();
    const limit = Number(req.query.limit) || 20;
    const stored = await query(
      'SELECT * FROM stored_predictions ORDER BY created_at DESC LIMIT ?',
      [limit]
    );

    res.json({
      success: true,
      count: stored.length,
      active_goal_risks: goalRisks,
      resource_forecast: resourceForecast,
      stored_predictions: stored.map(s => ({
        ...s,
        prediction_payload: s.prediction_payload ? JSON.parse(s.prediction_payload) : null,
        actual_outcome: s.actual_outcome ? JSON.parse(s.actual_outcome) : null
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/operations/patterns
 * Returns discovered operational patterns with optional filtering.
 */
router.get('/patterns', async (req, res) => {
  try {
    const predictive = getPredictiveIntelligence();
    const filter = {};
    if (req.query.pattern_type) filter.pattern_type = req.query.pattern_type;
    if (req.query.min_confidence) filter.min_confidence = Number(req.query.min_confidence);

    const patterns = await predictive.patterns.getPatterns(filter);
    res.json({ success: true, count: patterns.length, patterns });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/operations/recommendations
 * Lists persistent predictive recommendations with status/category filtering.
 */
router.get('/recommendations', async (req, res) => {
  try {
    const predictive = getPredictiveIntelligence();
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.limit) filter.limit = Number(req.query.limit);

    const recommendations = await predictive.recommendations.getRecommendations(filter);
    res.json({ success: true, count: recommendations.length, recommendations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/operations/recommendations/:id/accept
 * Accepts a recommendation and trains the learning prior.
 */
router.post('/recommendations/:id/accept', async (req, res) => {
  try {
    const predictive = getPredictiveIntelligence();
    const result = await predictive.recommendations.acceptRecommendation(
      req.params.id,
      req.body.feedback || ''
    );
    res.json({ success: true, recommendation: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/operations/recommendations/:id/reject
 * Rejects a recommendation and damps category learning prior.
 */
router.post('/recommendations/:id/reject', async (req, res) => {
  try {
    const predictive = getPredictiveIntelligence();
    const result = await predictive.recommendations.rejectRecommendation(
      req.params.id,
      req.body.feedback || ''
    );
    res.json({ success: true, recommendation: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/operations/recommendations/:id/execute
 * Executes an accepted recommendation. Blocks high-impact actions if unapproved.
 */
router.post('/recommendations/:id/execute', async (req, res) => {
  try {
    const predictive = getPredictiveIntelligence();
    const isApproved = req.body.isExplicitlyApproved === true || req.body.approved === true;
    const result = await predictive.recommendations.executeRecommendation(
      req.params.id,
      isApproved
    );
    res.json({ success: true, execution: result });
  } catch (err) {
    const isSecurityBlock = err.message && err.message.includes('SECURITY_REJECTION');
    res.status(isSecurityBlock ? 403 : 400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/operations/evaluation
 * Returns empirical calibration metrics, Brier scores, and drift detection.
 */
router.get('/evaluation', async (req, res) => {
  try {
    const predictive = getPredictiveIntelligence();
    const metrics = await predictive.evaluations.calculateMetrics();
    res.json({ success: true, metrics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/operations/predictive/cycle
 * Manually executes a full predictive intelligence cycle.
 */
router.post('/predictive/cycle', async (req, res) => {
  try {
    const predictive = getPredictiveIntelligence();
    const result = await predictive.runPredictiveCycle();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
