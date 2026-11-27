import express from 'express';
import { getMissionControl } from '../services/missionControlService.js';

const router = express.Router();

// Create a new mission / workflow
router.post('/create', async (req, res) => {
  try {
    const { objective, priority, idempotency_key, idempotencyKey, steps, acceptance_contract } = req.body;
    if (!objective || !objective.trim()) {
      return res.status(400).json({ success: false, error: 'Mission objective is required.' });
    }
    const missionControl = getMissionControl();
    const mission = await missionControl.createMission({
      objective: objective.trim(),
      priority,
      idempotencyKey: idempotency_key || idempotencyKey,
      steps,
      acceptance_contract
    });
    res.json({ success: true, mission });
  } catch (err) {
    const status = err.code === 'CIRCULAR_DEPENDENCY_DETECTED' || err.code === 'INVALID_WORKFLOW_DAG' ? 400 : 500;
    res.status(status).json({ success: false, error: err.message, code: err.code || null });
  }
});

// Phase 18: Workflow Intelligence Dashboard Summary
router.get('/dashboard/summary', async (req, res) => {
  try {
    const missionControl = getMissionControl();
    const dashboard = await missionControl.getWorkflowDashboardSummary();
    res.json({ success: true, dashboard });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List all missions
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 30;
    const missionControl = getMissionControl();
    const missions = await missionControl.listMissions(limit);
    res.json({ success: true, count: missions.length, missions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get a single mission by ID
router.get('/:id', async (req, res) => {
  try {
    const missionControl = getMissionControl();
    const mission = await missionControl.getMission(req.params.id);
    if (!mission) {
      return res.status(404).json({ success: false, error: 'Mission not found.' });
    }
    res.json({ success: true, mission });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start mission execution
router.post('/:id/start', async (req, res) => {
  try {
    const missionControl = getMissionControl();
    const result = await missionControl.startMission(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Pause mission
router.post('/:id/pause', async (req, res) => {
  try {
    const missionControl = getMissionControl();
    const result = missionControl.pauseMission(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resume mission
router.post('/:id/resume', async (req, res) => {
  try {
    const missionControl = getMissionControl();
    const result = await missionControl.resumeMission(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cancel mission
router.post('/:id/cancel', async (req, res) => {
  try {
    const missionControl = getMissionControl();
    const result = await missionControl.cancelMission(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Approve a waiting step
router.post('/:id/approve', async (req, res) => {
  try {
    const { stepId } = req.body;
    if (!stepId) {
      return res.status(400).json({ success: false, error: 'stepId is required.' });
    }
    const missionControl = getMissionControl();
    const result = await missionControl.approveStep(req.params.id, stepId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Retry a failed step
router.post('/:id/retry', async (req, res) => {
  try {
    const { stepId } = req.body;
    if (!stepId) {
      return res.status(400).json({ success: false, error: 'stepId is required.' });
    }
    const missionControl = getMissionControl();
    const result = await missionControl.retryStep(req.params.id, stepId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get checkpoints for a mission (Module 2)
router.get('/:id/checkpoints', async (req, res) => {
  try {
    const missionControl = getMissionControl();
    const checkpoints = await missionControl.getCheckpoints(req.params.id);
    res.json({ success: true, count: checkpoints.length, checkpoints });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get agent performance metrics (Module 2)
router.get('/metrics/agents', async (req, res) => {
  try {
    const missionControl = getMissionControl();
    const metrics = await missionControl.getAgentMetrics();
    res.json({ success: true, metrics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Phase 18: Complete Workflow Execution Provenance
router.get('/:id/provenance', async (req, res) => {
  try {
    const missionControl = getMissionControl();
    const provenance = await missionControl.getWorkflowProvenance(req.params.id);
    res.json({ success: true, provenance });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// Phase 18: Workflow Safe Rollback / Compensation
router.post('/:id/rollback', async (req, res) => {
  try {
    const { reason } = req.body || {};
    const missionControl = getMissionControl();
    const result = await missionControl.rollbackMission(req.params.id, reason || 'Operator initiated rollback');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Phase 18: Arbitrate Agent Disagreement / Escalate
router.post('/:id/disagreement', async (req, res) => {
  try {
    const { outputs } = req.body || {};
    const missionControl = getMissionControl();
    const result = await missionControl.resolveStepDisagreement(req.params.id, outputs || []);
    res.json({ success: true, resolution: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Phase 18: Operator Adjudication of Escalated Disagreement
router.post('/:id/resolve-escalation', async (req, res) => {
  try {
    const missionControl = getMissionControl();
    const result = await missionControl.resolveEscalation(req.params.id, req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Phase 18: Crash Recovery Trigger
router.post('/:id/recover-crash', async (req, res) => {
  try {
    const { reason } = req.body || {};
    const missionControl = getMissionControl();
    const result = await missionControl.handleWorkerCrash(req.params.id, reason || 'WORKER_CRASH_RECOVERY');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
