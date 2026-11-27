import express from 'express';
import { getSelfAnalysisService } from '../services/selfAnalysisService.js';
import { getCapabilityGapService } from '../services/capabilityGapService.js';
import { getSkillEvolutionService } from '../services/skillEvolutionService.js';
import { getEvolutionSandboxService } from '../services/evolutionSandboxService.js';
import { getEvolutionValidationService } from '../services/evolutionValidationService.js';
import { getWorkflowOptimizationService } from '../services/workflowOptimizationService.js';
import { getEvolutionPipelineService } from '../services/evolutionPipelineService.js';
import { getEvolutionMetricsService } from '../services/evolutionMetricsService.js';
import { getPhase20Evolution } from '../services/phase20EvolutionService.js';

const router = express.Router();

const selfAnalysis = getSelfAnalysisService();
const capabilityGap = getCapabilityGapService();
const skillEvolution = getSkillEvolutionService();
const evolutionSandbox = getEvolutionSandboxService();
const evolutionValidation = getEvolutionValidationService();
const workflowOpt = getWorkflowOptimizationService();
const evolutionPipeline = getEvolutionPipelineService();
const evolutionMetrics = getEvolutionMetricsService();

// ==========================================
// P0: Self-Analysis & Weakness Detection
// ==========================================
router.post('/analysis/run', async (req, res) => {
  try {
    const { windowHours, minConfidence } = req.body;
    const result = await selfAnalysis.analyzeOperationalHistory({ windowHours, minConfidence });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/weaknesses', async (req, res) => {
  try {
    const { status } = req.query;
    const weaknesses = await selfAnalysis.getDiscoveredWeaknesses(status);
    res.json({ success: true, count: weaknesses.length, weaknesses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/weaknesses/:id/resolve', async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await selfAnalysis.resolveWeakness(req.params.id, notes);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// P1: Capability Gap Detection & Proposals
// ==========================================
router.post('/gaps/detect', async (req, res) => {
  try {
    const { windowHours } = req.body;
    const result = await capabilityGap.detectCapabilityGaps({ windowHours });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/proposals', async (req, res) => {
  try {
    const result = await capabilityGap.evaluateAndCreateProposal(req.body);
    res.json({ success: true, proposal: result });
  } catch (err) {
    const status = err.message.includes('FALSE_CAPABILITY_GAP') ? 409 : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.get('/proposals', async (req, res) => {
  try {
    const { status } = req.query;
    const proposals = await capabilityGap.getProposals(status);
    res.json({ success: true, count: proposals.length, proposals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// P2: Self-Evolving Skill Engine
// ==========================================
router.post('/skills/design', async (req, res) => {
  try {
    const result = await skillEvolution.designSkill(req.body);
    res.json({ success: true, skill: result });
  } catch (err) {
    const status = err.message.includes('SECURITY_VIOLATION') || err.message.includes('PROMPT_INJECTION') ? 403 : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.get('/skills', async (req, res) => {
  try {
    const { status } = req.query;
    const skills = await skillEvolution.getEvolvingSkills(status);
    res.json({ success: true, count: skills.length, skills });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/skills/:id', async (req, res) => {
  try {
    const skill = await skillEvolution.getSkillById(req.params.id);
    if (!skill) return res.status(404).json({ success: false, error: 'Skill not found' });
    res.json({ success: true, skill });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// P3: Evolution Sandbox
// ==========================================
router.post('/sandbox/run', async (req, res) => {
  try {
    const result = await evolutionSandbox.runExperiment(req.body);
    res.json({ success: result.success, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/experiments/:id', async (req, res) => {
  try {
    const exp = await evolutionSandbox.getExperiment(req.params.id);
    if (!exp) return res.status(404).json({ success: false, error: 'Experiment not found' });
    res.json({ success: true, experiment: exp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// P4: Intelligent Validation Engine
// ==========================================
router.post('/validation/run', async (req, res) => {
  try {
    const result = await evolutionValidation.validateSkill(req.body);
    res.json({ success: true, validation: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/validations/:skillId', async (req, res) => {
  try {
    const val = await evolutionValidation.getValidationBySkillId(req.params.skillId);
    if (!val) return res.status(404).json({ success: false, error: 'Validation not found' });
    res.json({ success: true, validation: val });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// P5: Workflow Optimization
// ==========================================
router.post('/workflow/optimize', async (req, res) => {
  try {
    const result = await workflowOpt.optimizeWorkflow(req.body);
    res.json({ success: true, optimization: result });
  } catch (err) {
    const status = err.message.includes('INVALID_OPTIMIZATION') ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.get('/workflow/optimizations', async (req, res) => {
  try {
    const { missionId } = req.query;
    const optimizations = await workflowOpt.getOptimizations(missionId);
    res.json({ success: true, count: optimizations.length, optimizations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// P6: Controlled Evolution Pipeline & Deployments
// ==========================================
router.post('/pipeline/submit', async (req, res) => {
  try {
    const result = await evolutionPipeline.submitForApproval(req.body);
    res.json({ success: true, deployment: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/pipeline/:id/approve', async (req, res) => {
  try {
    const { approvedBy } = req.body;
    const result = await evolutionPipeline.grantApproval(req.params.id, approvedBy);
    res.json({ success: true, approval: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/pipeline/:id/revoke', async (req, res) => {
  try {
    const { reason } = req.body;
    const result = await evolutionPipeline.revokeApproval(req.params.id, reason);
    res.json({ success: true, revocation: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/pipeline/:id/deploy', async (req, res) => {
  try {
    const result = await evolutionPipeline.deploySkill(req.params.id);
    res.json({ success: true, deployment: result });
  } catch (err) {
    const status = err.message.includes('UNAUTHORIZED_DEPLOYMENT') ? 403 : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.post('/pipeline/:id/rollback', async (req, res) => {
  try {
    const { reason } = req.body;
    const result = await evolutionPipeline.rollbackDeployment(req.params.id, reason);
    res.json({ success: true, rollback: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/skills/:key/recover', async (req, res) => {
  try {
    const result = await evolutionPipeline.recoverCorruptedSkill(req.params.key);
    res.json({ success: true, recovery: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/deployments', async (req, res) => {
  try {
    const deployments = await evolutionPipeline.getDeploymentHistory();
    res.json({ success: true, count: deployments.length, deployments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// P8: Continuous Improvement Metrics
// ==========================================
router.post('/metrics/record', async (req, res) => {
  try {
    const result = await evolutionMetrics.recordMetricEvaluation(req.body);
    res.json({ success: true, metric: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/metrics/summary', async (req, res) => {
  try {
    const metrics = await evolutionMetrics.getMetricsSummary();
    res.json({ success: true, count: metrics.length, metrics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// PHASE 18: Autonomous Workflow Skill Learning & Benchmarking
// ==========================================
router.get('/workflows/patterns', async (req, res) => {
  try {
    const minOccurrences = Number(req.query.minOccurrences) || 2;
    const minConfidence = Number(req.query.minConfidence) || 0.6;
    const result = await skillEvolution.identifyRepeatedWorkflows({ minOccurrences, minConfidence });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/workflows/convert', async (req, res) => {
  try {
    const skill = await skillEvolution.convertSequenceToSkill(req.body || {});
    res.json({ success: true, skill });
  } catch (err) {
    const status = err.message.includes('SECURITY_VIOLATION') || err.message.includes('PROMPT_INJECTION') ? 403 : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.post('/workflows/benchmark', async (req, res) => {
  try {
    const benchmark = await skillEvolution.benchmarkWorkflowSkill(req.body || {});
    res.json({ success: true, benchmark });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/workflows/outdated', async (req, res) => {
  try {
    const maxAgeDays = Number(req.query.maxAgeDays) || 30;
    const minPassRate = Number(req.query.minPassRate) || 0.75;
    const result = await skillEvolution.detectOutdatedSkills({ maxAgeDays, minPassRate });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// PHASE 20: GOVERNED SELF-EVOLUTION ROUTES
// ==========================================

router.post('/phase20/assess', async (req, res) => {
  try {
    const svc = getPhase20Evolution();
    const result = await svc.runContinuousAssessment(req.body || {});
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/phase20/hypotheses', async (req, res) => {
  try {
    const svc = getPhase20Evolution();
    const result = await svc.createImprovementHypothesis(req.body || {});
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/phase20/experiments/run', async (req, res) => {
  try {
    const svc = getPhase20Evolution();
    const result = await svc.runControlledExperiment(req.body || {});
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/phase20/deploy/:id', async (req, res) => {
  try {
    const svc = getPhase20Evolution();
    const result = await svc.governedDeploy(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(403).json({ success: false, error: err.message });
  }
});

router.post('/phase20/workflow/:id/rollback', async (req, res) => {
  try {
    const svc = getPhase20Evolution();
    const result = await svc.rollbackWorkflowOptimization(req.params.id, req.body?.reason);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/dashboard/summary', async (req, res) => {
  try {
    const svc = getPhase20Evolution();
    const summary = await svc.getDashboardSummary();
    res.json({ success: true, ...summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
