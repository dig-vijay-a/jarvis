import express from 'express';
import DigitalTwinService from '../services/digitalTwinService.js';
import KnowledgeGraphService from '../services/knowledgeGraphService.js';
import { getPersonalContext } from '../services/personalContextEngine.js';
import { getDecisionMemory } from '../services/decisionMemoryService.js';
import { getTwinSimulation } from '../services/twinSimulationService.js';
import { getTwinSynchronization } from '../services/twinSynchronizationService.js';
import { getGoalManagement } from '../services/goalManagementService.js';
import { getPredictiveIntelligence } from '../services/predictiveIntelligenceService.js';
import ProactiveIntelligenceService from '../services/proactiveIntelligenceService.js';

const router = express.Router();

// ----------------------------------------------------
// PHASE 10: REAL-TIME CONTEXT SNAPSHOT & PROMPT FORMAT
// ----------------------------------------------------

// 1. Get real-time contextual snapshot (P2)
router.get('/snapshot', async (req, res) => {
  try {
    const contextEngine = getPersonalContext();
    const snapshot = await contextEngine.buildContextSnapshot(req.query);
    res.json({ success: true, snapshot });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Get formatted prompt context for orchestrator
router.get('/prompt-context', async (req, res) => {
  try {
    const contextEngine = getPersonalContext();
    const formatted = await contextEngine.formatForOrchestratorPrompt(req.query);
    res.json({ success: true, formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// PHASE 10: DIGITAL TWIN RECONCILIATION & SYNC (P0 & P6)
// ----------------------------------------------------

// 3. Stale facts detection
router.get('/stale', async (req, res) => {
  try {
    const staleFacts = await DigitalTwinService.detectStaleEntries();
    res.json({ success: true, count: staleFacts.length, staleFacts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Conflicting facts detection
router.get('/conflicts', async (req, res) => {
  try {
    const conflicts = await DigitalTwinService.detectConflictingEntries();
    res.json({ success: true, count: conflicts.length, conflicts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Run full twin synchronization cycle
router.post('/sync', async (req, res) => {
  try {
    const syncer = getTwinSynchronization();
    const result = await syncer.runSynchronizationCycle();
    res.json({ success: true, sync_result: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. User fact correction (maintains provenance & correction history)
router.post('/correct/:id', async (req, res) => {
  try {
    const updated = await DigitalTwinService.correctFact(req.params.id, req.body);
    res.json({ success: true, fact: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Explicit user confirmation
router.post('/confirm/:id', async (req, res) => {
  try {
    const confirmed = await DigitalTwinService.confirmFact(req.params.id);
    res.json({ success: true, fact: confirmed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Fact reconciliation (merge / archive)
router.post('/reconcile/:id', async (req, res) => {
  try {
    const reconciled = await DigitalTwinService.reconcileFact(req.params.id, req.body);
    res.json({ success: true, fact: reconciled });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// PHASE 10: DECISION MEMORY (P3)
// ----------------------------------------------------

// 9. Get decision memory history & search
router.get('/decisions', async (req, res) => {
  try {
    const decisionService = getDecisionMemory();
    const history = await decisionService.getDecisionHistory(req.query);
    res.json({ success: true, count: history.length, decisions: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Record new decision
router.post('/decisions', async (req, res) => {
  try {
    const decisionService = getDecisionMemory();
    const decision = await decisionService.recordDecision(req.body);
    res.json({ success: true, decision });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. Record decision outcome & lessons learned
router.put('/decisions/:id/outcome', async (req, res) => {
  try {
    const decisionService = getDecisionMemory();
    const updated = await decisionService.recordOutcome(req.params.id, req.body);
    res.json({ success: true, decision: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// PHASE 10: DIGITAL TWIN SIMULATION (P4 - STRICT READ-ONLY)
// ----------------------------------------------------

// 12. Simulate deadline change
router.post('/simulate/deadline', async (req, res) => {
  try {
    const simulationService = getTwinSimulation();
    const simulation = await simulationService.simulateDeadlineChange(req.body);
    res.json({ success: true, simulation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13. Simulate resource unavailability
router.post('/simulate/resource', async (req, res) => {
  try {
    const simulationService = getTwinSimulation();
    const simulation = await simulationService.simulateResourceUnavailability(req.body);
    res.json({ success: true, simulation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14. Detect timeline conflicts
router.get('/simulate/conflicts', async (req, res) => {
  try {
    const simulationService = getTwinSimulation();
    const conflicts = await simulationService.detectTimelineConflicts();
    res.json({ success: true, count: conflicts.length, conflicts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// CORE TWIN PROFILE CRUD (EXISTING PRESERVED)
// ----------------------------------------------------

// 15. Get full digital twin profile
router.get('/', async (req, res) => {
  try {
    const profile = await DigitalTwinService.getFullTwinProfile();
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 16. Legacy prompt context endpoint
router.get('/context', async (req, res) => {
  try {
    const context = await DigitalTwinService.getFormattedContextForPrompt();
    res.json({ success: true, context });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 17. Create digital twin entry
router.post('/', async (req, res) => {
  try {
    const { category, title, content, priority, source, confidence, is_confirmed, expiration_policy, expires_at } = req.body;
    const entry = await DigitalTwinService.createEntry({
      category,
      title,
      content,
      priority,
      source,
      confidence,
      is_confirmed,
      expiration_policy,
      expires_at
    });
    res.json({ success: true, entry });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 18. Update digital twin entry
router.put('/:id', async (req, res) => {
  try {
    const updated = await DigitalTwinService.updateEntry(req.params.id, req.body);
    res.json({ success: true, entry: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 19. Toggle enable/disable
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { is_enabled } = req.body;
    const result = await DigitalTwinService.toggleEntry(req.params.id, is_enabled);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 20. Delete digital twin entry
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await DigitalTwinService.deleteEntry(req.params.id);
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// PHASE 17: ADVANCED PERSONAL INTELLIGENCE ROUTES
// ----------------------------------------------------

router.get('/unified-context', async (req, res) => {
  try {
    const ctx = await getPersonalContext().getUnifiedPersonalContext(req.query || {});
    res.json({ success: true, context: ctx });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/cross-contradictions', async (req, res) => {
  try {
    const audit = await DigitalTwinService.detectCrossStoreContradictions();
    res.json({ success: true, ...audit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/personal-intelligence', async (req, res) => {
  try {
    const proactive = await ProactiveIntelligenceService.generatePersonalProactiveIntelligence();
    const predictive = await getPredictiveIntelligence().generatePersonalIntelligenceForecast();
    res.json({ success: true, proactive, predictive });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/decisions/evaluate', async (req, res) => {
  try {
    const result = await getDecisionMemory().evaluateDecisionOptions(req.body || {});
    res.json({ success: true, decision: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/decisions/:id/learn', async (req, res) => {
  try {
    const result = await getDecisionMemory().recordOutcomeAndLearn(req.params.id, req.body || {});
    res.json({ success: true, decision: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/goals/:id/decompose', async (req, res) => {
  try {
    const gm = getGoalManagement();
    const result = await gm.decomposeObjective(req.params.id, req.body?.milestones || []);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/goals/competing-priorities', async (req, res) => {
  try {
    const gm = getGoalManagement();
    const result = await gm.detectCompetingPriorities();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/graph/connect-domains', async (req, res) => {
  try {
    const result = await KnowledgeGraphService.connectPersonalDomains(req.body || {});
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
