import express from 'express';
import { getStrategicIntelligenceService } from '../services/strategicIntelligenceService.js';
import { getDeepReasoningService } from '../services/deepReasoningService.js';
import KnowledgeGraphService from '../services/knowledgeGraphService.js';
import { getInvestigationService } from '../services/investigationService.js';
import { getStrategicDecisionService } from '../services/strategicDecisionService.js';
import { getTwinSimulation } from '../services/twinSimulationService.js';
import { getCriticalReviewService } from '../services/criticalReviewService.js';
import { getMissionControl } from '../services/missionControlService.js';

const router = express.Router();

const strategicIntelligence = getStrategicIntelligenceService();
const deepReasoning = getDeepReasoningService();
const investigation = getInvestigationService();
const strategicDecision = getStrategicDecisionService();
const twinSimulation = getTwinSimulation();
const criticalReview = getCriticalReviewService();

// ==========================================
// P0: Strategic Objectives & Initiatives
// ==========================================
router.post('/objectives', async (req, res) => {
  try {
    const { rawInput, options } = req.body;
    const result = await strategicIntelligence.interpretObjective(rawInput, options || {});
    res.json({ success: true, objective: result });
  } catch (err) {
    const status = err.message.includes('CONTRADICTORY_CONSTRAINTS') ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.get('/objectives', async (req, res) => {
  try {
    const { status } = req.query;
    const objectives = await strategicIntelligence.listObjectives(status);
    res.json({ success: true, count: objectives.length, objectives });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/objectives/:id', async (req, res) => {
  try {
    const obj = await strategicIntelligence.getObjective(req.params.id);
    if (!obj) return res.status(404).json({ success: false, error: 'Strategic objective not found' });
    res.json({ success: true, objective: obj });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/objectives/:id/progress', async (req, res) => {
  try {
    const { progress, status } = req.body;
    const result = await strategicIntelligence.updateObjectiveProgress(req.params.id, progress, status);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/conflicts', async (req, res) => {
  try {
    const result = await strategicIntelligence.detectConflictingObjectives();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// P1: Deep Reasoning Engine
// ==========================================
router.post('/reasoning', async (req, res) => {
  try {
    const result = await deepReasoning.performDeepReasoning(req.body);
    res.json({ success: true, reasoning: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// P2: Cross-Domain Knowledge Intelligence
// ==========================================
router.get('/knowledge/cross-domain/:id', async (req, res) => {
  try {
    const maxHops = Number(req.query.maxHops) || 3;
    const result = await KnowledgeGraphService.discoverCrossDomainConnections(req.params.id, maxHops);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/knowledge/freshness/:id', async (req, res) => {
  try {
    const maxDays = Number(req.query.maxDays) || 30;
    const result = await KnowledgeGraphService.assessKnowledgeFreshness(req.params.id, maxDays);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/knowledge/contradictions', async (req, res) => {
  try {
    const conflicts = await KnowledgeGraphService.detectGraphContradictions();
    res.json({ success: true, count: conflicts.length, conflicts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// P3: Research and Investigation
// ==========================================
router.post('/investigations', async (req, res) => {
  try {
    const result = await investigation.conductInvestigation(req.body);
    res.json({ success: true, investigation: result });
  } catch (err) {
    const status = err.message.includes('FABRICATED_CITATION') ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.get('/investigations/:id', async (req, res) => {
  try {
    const inv = await investigation.getInvestigation(req.params.id);
    if (!inv) return res.status(404).json({ success: false, error: 'Investigation not found' });
    res.json({ success: true, investigation: inv });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// P4: Strategic Decisions & MCDA
// ==========================================
router.post('/decisions', async (req, res) => {
  try {
    const result = await strategicDecision.evaluateDecision(req.body);
    res.json({ success: true, decision: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/decisions/:id', async (req, res) => {
  try {
    const dec = await strategicDecision.getDecision(req.params.id);
    if (!dec) return res.status(404).json({ success: false, error: 'Decision not found' });
    res.json({ success: true, decision: dec });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// P5: Strategic Hierarchical Orchestration
// ==========================================
router.post('/hierarchies/link', async (req, res) => {
  try {
    const mc = getMissionControl();
    if (!mc) return res.status(503).json({ success: false, error: 'MissionControl not initialized' });
    const { missionId, initiativeId, objectiveId } = req.body;
    const result = await mc.linkMissionToObjective(missionId, initiativeId, objectiveId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/hierarchies/track/:objectiveId', async (req, res) => {
  try {
    const mc = getMissionControl();
    if (!mc) return res.status(503).json({ success: false, error: 'MissionControl not initialized' });
    const result = await mc.trackObjectiveProgress(req.params.objectiveId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/hierarchies/stalled', async (req, res) => {
  try {
    const mc = getMissionControl();
    if (!mc) return res.status(503).json({ success: false, error: 'MissionControl not initialized' });
    const result = await mc.detectStalledInitiatives();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// P6: Counterfactual Scenario Simulations
// ==========================================
router.post('/simulations', async (req, res) => {
  try {
    const result = await twinSimulation.simulateStrategicScenarios(req.body);
    res.json({ success: true, simulation: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// P7: Self-Critique & Critical Review
// ==========================================
router.post('/reviews/pre', async (req, res) => {
  try {
    const result = await criticalReview.conductPreExecutionReview(req.body);
    res.json({ success: true, review: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/reviews/post', async (req, res) => {
  try {
    const result = await criticalReview.conductPostExecutionReview(req.body);
    res.json({ success: true, review: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/reviews/:id', async (req, res) => {
  try {
    const rev = await criticalReview.getReview(req.params.id);
    if (!rev) return res.status(404).json({ success: false, error: 'Review not found' });
    res.json({ success: true, review: rev });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// P9: Governance & Cancellation
// ==========================================
router.post('/governance/check', (req, res) => {
  try {
    const { actionType, actionPayload } = req.body;
    const result = strategicIntelligence.evaluateAutonomyGovernance(actionType, actionPayload);
    res.json({ success: true, governance: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/objectives/:id/cancel', (req, res) => {
  try {
    const { reason } = req.body;
    const result = strategicIntelligence.cancelStrategicExecution(req.params.id, reason);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
