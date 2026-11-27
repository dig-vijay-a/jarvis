import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import axios from 'axios';
import express from 'express';
import { spawn, spawnSync } from 'child_process';

const ISOLATED_DB_DIR = path.resolve('nova/data/sentinel_disposable_test/phase17_isolated');
const ISOLATED_DB_PATH = path.join(ISOLATED_DB_DIR, 'phase17.sqlite');
const PROD_DB_PATH = path.resolve('nova/data/nova.sqlite');
const DELIVERABLES_DIR = path.resolve('nova/deliverables');

fs.mkdirSync(ISOLATED_DB_DIR, { recursive: true });
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

const CLOUD_LLM_HOSTS = ['api.groq.com', 'generativelanguage.googleapis.com', 'openrouter.ai', 'api.mistral.ai', 'api.openai.com', 'api.anthropic.com', 'ollama.com'];

async function ensureOllama() {
  try {
    const r = await axios.get('http://127.0.0.1:11434/api/tags', { timeout: 2000 });
    if (r.status === 200) return { proc: null, started: false };
  } catch (_) {}
  const proc = spawn('ollama', ['serve'], { stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 20; i++) {
    try {
      const r = await axios.get('http://127.0.0.1:11434/api/tags', { timeout: 1000 });
      if (r.status === 200) return { proc, started: true };
    } catch (_) {}
    await new Promise(r => setTimeout(r, 400));
  }
  return { proc, started: true };
}

function installNetMonitor() {
  const reqs = [];
  const id = axios.interceptors.request.use(cfg => {
    try { reqs.push({ host: new URL(cfg.url).hostname, url: cfg.url }); } catch (_) {}
    return cfg;
  });
  return { reqs, restore: () => axios.interceptors.request.eject(id) };
}

async function main() {
  const prodHashBefore = sha256File(PROD_DB_PATH);
  const netMon = installNetMonitor();
  let ollamaChild = null;

  console.log('================================================================================');
  console.log('JARVIS OS 2.0 — PHASE 17 ADVANCED PERSONAL INTELLIGENCE SUITE (28 TESTS)');
  console.log('================================================================================');

  try {
    const ollama = await ensureOllama();
    ollamaChild = ollama.proc;

    const { initDatabase, run, query, get } = await import('./backend/database/db.js');
    const { default: DigitalTwinService } = await import('./backend/services/digitalTwinService.js');
    const { default: KnowledgeGraphService } = await import('./backend/services/knowledgeGraphService.js');
    const { initPersonalContext, getPersonalContext } = await import('./backend/services/personalContextEngine.js');
    const { initDecisionMemory, getDecisionMemory } = await import('./backend/services/decisionMemoryService.js');
    const { initGoalManagement, getGoalManagement } = await import('./backend/services/goalManagementService.js');
    const { initPredictiveIntelligence, getPredictiveIntelligence } = await import('./backend/services/predictiveIntelligenceService.js');
    const { initTwinSimulation, getTwinSimulation } = await import('./backend/services/twinSimulationService.js');
    const { default: MemoryIntelligenceService } = await import('./backend/services/memoryIntelligenceService.js');
    const { default: ProactiveIntelligenceService } = await import('./backend/services/proactiveIntelligenceService.js');
    const { default: ModelRouterService } = await import('./backend/services/modelRouterService.js');
    const { default: ToolRegistry } = await import('./backend/tools/registry.js');
    const { default: twinRouter } = await import('./backend/routes/twin.js');

    await initDatabase();
    initPersonalContext();
    initDecisionMemory();
    const gm = initGoalManagement(null);
    const predCoord = initPredictiveIntelligence(null);
    initTwinSimulation();

    await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ollama_endpoint', 'http://127.0.0.1:11434', ?)", [new Date().toISOString()]);
    await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ollama_model', 'qwen3.5:4b', ?)", [new Date().toISOString()]);

    const results = [];
    async function runTest(id, category, name, fn) {
      const t0 = Date.now();
      try {
        const out = await fn();
        const entry = {
          id, category, name,
          status: out.passed ? 'PASS' : 'FAIL',
          duration_ms: Date.now() - t0,
          evidence: out.evidence || {},
          failure_reason: out.passed ? null : (out.failure_reason || 'Assertion failed')
        };
        results.push(entry);
        console.log(`[${entry.status}] ${id} (${entry.duration_ms}ms) — ${name}${entry.failure_reason ? ' | ' + entry.failure_reason : ''}`);
        return entry;
      } catch (err) {
        const entry = { id, category, name, status: 'FAIL', duration_ms: Date.now() - t0, evidence: {}, failure_reason: err.message };
        results.push(entry);
        console.log(`[FAIL] ${id} (${entry.duration_ms}ms) — ${name} | ${err.message}`);
        return entry;
      }
    }

    // Seed personal domain baseline facts cleanly
    const pProj = await DigitalTwinService.createEntry({
      category: 'projects', title: 'Project Orion', content: 'Distributed local-first privacy architecture using PostgreSQL', priority: 3, source: 'user_explicit', is_confirmed: true
    });
    const pSkill = await DigitalTwinService.createEntry({
      category: 'skills', title: 'Distributed Systems', content: 'Rust, TypeScript, and SQLite WAL concurrency optimization', priority: 3, source: 'user_explicit', is_confirmed: true
    });
    const pInt = await DigitalTwinService.createEntry({
      category: 'interests', title: 'Local Edge AI', content: 'Quantized open-weight LLM inference optimization', priority: 2, source: 'user_explicit', is_confirmed: true
    });
    const pConstraint = await DigitalTwinService.createEntry({
      category: 'constraints', title: 'Inference Cost Boundary', content: 'Zero cloud inference cost; local-only execution required', priority: 3, source: 'user_explicit', is_confirmed: true
    });
    const pPerson = await DigitalTwinService.createEntry({
      category: 'people', title: 'Dr. Elena Vance', content: 'Systems architecture collaborator on Project Orion', priority: 2, source: 'user_explicit', is_confirmed: true
    });
    const pInferred = await DigitalTwinService.createEntry({
      category: 'preferences', title: 'Documentation cadence', content: 'Inferred weekly markdown architecture summaries', priority: 1, source: 'inferred', is_confirmed: false, confidence: 0.90,
      expiration_policy: 'review_30d', review_before: new Date(Date.now() - 86400000).toISOString()
    });
    const pSecretTwin = await DigitalTwinService.createEntry({
      category: 'preferences', title: 'MasterVault API Secret', content: 'SECRET_TWIN_TOKEN_DO_NOT_EXPOSE_987', priority: 1, source: 'user_explicit', is_confirmed: true, metadata: { is_private: true }
    });

    // T01: Unified Personal Context aggregates all 7 stores
    let unifiedSnap = null;
    await runTest('T01_UNIFIED_CONTEXT_CONSISTENCY', 'Unified Context', 'Unifies Digital Twin, Graph, Memory, Decisions, Goals, Strategic Objectives & Missions', async () => {
      const ctx = getPersonalContext();
      unifiedSnap = await ctx.getUnifiedPersonalContext({ topic: 'Orion' });
      const ok = unifiedSnap.unified_schema_version === '17.0' &&
        unifiedSnap.active_projects.some(p => p.title === 'Project Orion') &&
        unifiedSnap.skills.some(s => s.title === 'Distributed Systems') &&
        unifiedSnap.people.some(p => p.title === 'Dr. Elena Vance') &&
        unifiedSnap.constraints.some(c => c.title === 'Inference Cost Boundary') &&
        unifiedSnap.knowledge_graph.nodes_count >= 4;
      return { passed: ok, evidence: { projects: unifiedSnap.active_projects.length, skills: unifiedSnap.skills.length, people: unifiedSnap.people.length, graphNodes: unifiedSnap.knowledge_graph.nodes_count } };
    });

    // T02: Orchestrator prompt formatting preserves consistency without secrets
    await runTest('T02_PROMPT_CONTEXT_CONSISTENCY', 'Unified Context', 'Formatted orchestrator context string includes confirmed facts & excludes private secrets', async () => {
      const md = await getPersonalContext().formatForOrchestratorPrompt({ topic: 'Orion' });
      return {
        passed: md.includes('Project Orion') && !md.includes('SECRET_TWIN_TOKEN_DO_NOT_EXPOSE_987'),
        evidence: { chars: md.length, hasOrion: md.includes('Project Orion'), leakedSecret: md.includes('SECRET_TWIN_TOKEN') }
      };
    });

    // T03: Local qwen3.5:4b personal intelligence synthesis ($0 cloud cost)
    await runTest('T03_LOCAL_AI_CONTEXT_SYNTHESIS', 'Unified Context', 'qwen3.5:4b synthesizes answer grounded strictly in unified personal context', async () => {
      const md = await getPersonalContext().formatForOrchestratorPrompt({ topic: 'Orion' });
      const ai = await ModelRouterService.generateWithFallback({
        systemPrompt: 'Answer concisely using ONLY the provided Personal Context.',
        messages: [{ role: 'user', content: `${md}\n\nQuestion: What architecture is Project Orion using?` }],
        numCtx: 2560, maxTokens: 120, taskClass: 'memory_retrieval', phaseType: 'chat', timeoutMs: 60000
      });
      return { passed: ai.provider === 'ollama' && /postgresql|privacy|local-first/i.test(ai.text || ''), evidence: { provider: ai.provider, preview: (ai.text || '').slice(0, 140) } };
    });

    // T04: Epistemic distinction: confirmed facts vs inferred observations
    await runTest('T04_PROVENANCE_CONFIRMED_VS_INFERRED', 'Knowledge Intelligence', 'Distinguishes explicit confirmed facts (conf=1.0) from inferred observations (cap<=0.70)', async () => {
      const infEnt = await KnowledgeGraphService.upsertEntity({ name: 'Weekend Deployment Window', entity_type: 'concept', source_type: 'inferred', confidence: 0.99 });
      const confCount = unifiedSnap?.epistemic_summary?.confirmed_count || 0;
      const infCount = unifiedSnap?.epistemic_summary?.inferred_count || 0;
      return { passed: confCount >= 4 && infCount >= 1 && infEnt.confidence <= 0.70, evidence: { confCount, infCount, inferredGraphCap: infEnt.confidence } };
    });

    // T05: Knowledge graph source reliability & staleness assessment
    await runTest('T05_SOURCE_RELIABILITY_AND_FRESHNESS', 'Knowledge Intelligence', 'Evaluates source reliability & distinguishes fresh vs >30-day stale graph entities', async () => {
      const oldEnt = await KnowledgeGraphService.upsertEntity({ id: 'ent-stale-17', name: 'Legacy LegacySpec 2024', entity_type: 'concept', source_type: 'unverified_web' });
      await run("UPDATE graph_entities SET updated_at = datetime('now', '-45 days') WHERE id = 'ent-stale-17'");
      const fresh = await KnowledgeGraphService.assessKnowledgeFreshness(`ent-${pProj.id}`, 30);
      const stale = await KnowledgeGraphService.assessKnowledgeFreshness('ent-stale-17', 30);
      const relExp = KnowledgeGraphService.trackSourceReliability('user_explicit');
      const relInf = KnowledgeGraphService.trackSourceReliability('unverified_web');
      return {
        passed: !fresh.is_stale && stale.is_stale && stale.freshness_verdict === 'STALE' && relExp.reliability_score === 1.0 && relInf.reliability_score < 0.75,
        evidence: { staleVerdict: stale.freshness_verdict, ageDays: stale.age_days, relExp: relExp.reliability_score, relInf: relInf.reliability_score }
      };
    });

    // T06: Connect projects, people, skills, interests & objectives across domains
    await runTest('T06_CROSS_DOMAIN_GRAPH_CONNECTION', 'Knowledge Intelligence', 'Connects people, projects, skills, interests, and objectives with multi-hop traversal', async () => {
      const linkRes = await KnowledgeGraphService.connectPersonalDomains({
        person: 'Dr. Elena Vance', project: 'Project Orion', skill: 'Distributed Systems', interest: 'Local Edge AI', objective: 'Zero-Cost Sovereign Stack'
      });
      const projEnt = await get("SELECT id FROM graph_entities WHERE LOWER(name) = 'project orion' AND entity_type = 'project'");
      const cross = await KnowledgeGraphService.discoverCrossDomainConnections(projEnt.id, 3);
      return {
        passed: linkRes.relationships_created >= 4 && cross.total_connected_entities >= 3,
        evidence: { rels: linkRes.relationships_created, crossConnected: cross.total_connected_entities }
      };
    });

    // T07: Intra-Twin contradiction detection
    await runTest('T07_TWIN_CONTRADICTION_DETECTION', 'Knowledge Intelligence', 'Detects opposing PostgreSQL vs MySQL project directives in Digital Twin', async () => {
      await DigitalTwinService.createEntry({
        category: 'projects', title: 'Project Orion', content: 'Switch storage exclusively to MySQL cluster', priority: 2, source: 'inferred', is_confirmed: false
      });
      const conflicts = await DigitalTwinService.detectConflictingEntries();
      return { passed: conflicts.some(c => c.type === 'CONTRADICTORY_VALUE' && c.entity_a.title === 'Project Orion'), evidence: { conflictsCount: conflicts.length, sample: conflicts[0]?.reason } };
    });

    // T08: Cross-store (Twin vs Memory) & Graph contradiction detection
    await runTest('T08_CROSS_STORE_AND_GRAPH_CONTRADICTION', 'Knowledge Intelligence', 'Detects contradictions between Digital Twin, Long-Term Memory & Knowledge Graph', async () => {
      await run("INSERT INTO memories (id, key, value, category, importance, source, created_at, updated_at) VALUES (?, ?, ?, 'Projects', 4, 'conversation_inferred', ?, ?)",
        ['mem-contra-17', 'Inference Cost Boundary', 'Allow unlimited commercial cloud GPT billing', new Date().toISOString(), new Date().toISOString()]);
      const eA = await KnowledgeGraphService.upsertEntity({ name: 'Module Alpha', entity_type: 'concept' });
      const eB = await KnowledgeGraphService.upsertEntity({ name: 'Module Beta', entity_type: 'concept' });
      await KnowledgeGraphService.addRelationship({ source_entity_id: eA.id, target_entity_id: eB.id, relationship_type: 'SUPPORTS' });
      await KnowledgeGraphService.addRelationship({ source_entity_id: eA.id, target_entity_id: eB.id, relationship_type: 'BLOCKS' });

      const crossAudit = await DigitalTwinService.detectCrossStoreContradictions();
      return {
        passed: crossAudit.cross_store_conflicts.length >= 1 && crossAudit.graph_conflicts.length >= 1,
        evidence: { twin: crossAudit.twin_conflicts.length, crossStore: crossAudit.cross_store_conflicts.length, graph: crossAudit.graph_conflicts.length }
      };
    });

    // T09: Stale & incorrect assumption detection
    await runTest('T09_STALE_AND_INCORRECT_ASSUMPTIONS', 'Knowledge Intelligence', 'Identifies expired/past-review unconfirmed assumptions in Digital Twin', async () => {
      const stale = await DigitalTwinService.detectStaleEntries();
      return { passed: stale.some(s => s.id === pInferred.id), evidence: { staleCount: stale.length, sampleReason: stale[0]?.reason } };
    });

    // T10: Private Twin isolation
    await runTest('T10_PRIVACY_TWIN_ISOLATION', 'Privacy & Security', 'Excludes private Digital Twin secrets from prompt & unified context', async () => {
      const ctx = await getPersonalContext().getUnifiedPersonalContext({});
      const rawJson = JSON.stringify(ctx);
      return { passed: !rawJson.includes('SECRET_TWIN_TOKEN_DO_NOT_EXPOSE_987') && ctx.privacy_guarantee === 'PRIVATE_MEMORIES_AND_SECRETS_EXCLUDED', evidence: { leakedSecret: rawJson.includes('SECRET_TWIN_TOKEN') } };
    });

    // T11: Private Long-Term Memory isolation
    await runTest('T11_PRIVACY_MEMORY_ISOLATION', 'Privacy & Security', 'Excludes private credential memories from retrieveRelevantMemories & unified snapshot', async () => {
      await run("INSERT INTO memories (id, key, value, category, importance, source, created_at, updated_at) VALUES (?, ?, ?, 'private_credentials', 5, 'user_explicit', ?, ?)",
        ['mem-priv-17', 'bank_pin_secret', 'PRIVATE_PIN_DO_NOT_LEAK_4411', new Date().toISOString(), new Date().toISOString()]);
      const mems = await MemoryIntelligenceService.retrieveRelevantMemories('bank pin secret credential', 10, { excludeSensitive: true });
      const ctx = await getPersonalContext().getUnifiedPersonalContext({ topic: 'bank' });
      const leaked = mems.some(m => m.value.includes('4411')) || JSON.stringify(ctx).includes('PRIVATE_PIN_DO_NOT_LEAK_4411');
      return { passed: !leaked, evidence: { memHits: mems.length, leaked } };
    });

    // T12: Goal decomposition into milestones + dependency links
    let goal1 = null;
    await runTest('T12_STRATEGIC_GOAL_DECOMPOSITION', 'Strategic Goals', 'Decomposes long-term objective into milestone tasks & DEPENDS_ON graph chain', async () => {
      goal1 = await gm.createGoal({
        title: 'Launch Phase 17 Architecture',
        category: 'engineering',
        priority: 4,
        deadline: new Date(Date.now() + 8 * 3600000).toISOString(),
        success_criteria: 'Zero defects across personal intelligence modules'
      });
      const decomp = await gm.decomposeObjective(goal1.id, [
        { title: 'Audit Twin Dependencies', blocked: true },
        { title: 'Finalize Unified Snapshot' },
        { title: 'Verify Calibration Suite' }
      ]);
      return { passed: decomp.milestones_count === 3, evidence: decomp };
    });

    // T13: Missing dependency identification
    await runTest('T13_GOAL_MISSING_DEPENDENCY_DETECTION', 'Strategic Goals', 'Detects unavailable/blocked prerequisite milestone in Knowledge Graph', async () => {
      const missing = await KnowledgeGraphService.detectMissingDependencies(`ent-${goal1.id}`);
      return { passed: missing.has_missing_dependencies === true && missing.count >= 1, evidence: missing };
    });

    // T14: Competing priorities & timeline overlap detection
    let goal2 = null;
    await runTest('T14_COMPETING_PRIORITIES_AND_DEADLINES', 'Strategic Goals', 'Identifies competing high-priority objectives with overlapping deadlines', async () => {
      goal2 = await gm.createGoal({
        title: 'Security Hardening Audit',
        category: 'security',
        priority: 4,
        deadline: new Date(Date.now() + 10 * 3600000).toISOString()
      });
      const comp = await gm.detectCompetingPriorities(36);
      const simConf = await getTwinSimulation().detectTimelineConflicts();
      return { passed: comp.competing_count >= 1 && simConf.conflicts_detected_count >= 1, evidence: { competing: comp.competing_count, timelineConflicts: simConf.conflicts_detected_count } };
    });

    // T15: Progress vs intended outcome tracking
    await runTest('T15_OUTCOME_VS_INTENT_TRACKING', 'Strategic Goals', 'Tracks actual completed milestones against intended criteria & updates progress', async () => {
      const before = await gm.trackOutcomeVsIntent(goal1.id);
      await run("UPDATE tasks SET status = 'completed' WHERE id = ?", [`ms-${goal1.id}-2`]);
      const after = await gm.trackOutcomeVsIntent(goal1.id);
      return {
        passed: before.measured_milestone_progress === 0 && after.measured_milestone_progress === 33 && after.missing_dependencies.length >= 1,
        evidence: { beforePct: before.measured_milestone_progress, afterPct: after.measured_milestone_progress, missingDeps: after.missing_dependencies.length }
      };
    });

    // T16: Recurring behavioral pattern extraction
    await runTest('T16_BEHAVIORAL_PATTERN_DETECTION', 'Predictive Intelligence', 'Discovers recurring workflow sequence & time patterns with occurrence/confidence gates', async () => {
      const mNow = new Date().toISOString();
      for (let i = 1; i <= 4; i++) {
        const mid = `m-pat-${i}`;
        await run("INSERT INTO missions (id, objective, status, created_at) VALUES (?, ?, 'COMPLETED', ?)", [mid, `Pattern Test ${i}`, mNow]);
        await run("INSERT INTO mission_steps (id, mission_id, step_index, title, agent_key, tool, status) VALUES (?, ?, 1, 'Search', 'files', 'search_files', 'VERIFIED')", [`sp1-${i}`, mid]);
        await run("INSERT INTO mission_steps (id, mission_id, step_index, title, agent_key, tool, status) VALUES (?, ?, 2, 'Read', 'files', 'read_file', 'VERIFIED')", [`sp2-${i}`, mid]);
      }
      const pats = await predCoord.patterns.analyzeExecutionPatterns();
      return { passed: pats.some(p => p.trigger_signature === 'search_files' && p.action_signature === 'read_file'), evidence: { count: pats.length, sample: pats[0]?.name } };
    });

    // T17: Goal delay & risk prediction with evidence, uncertainty & confidence
    await runTest('T17_PROJECT_DELAY_PREDICTION_AND_EVIDENCE', 'Predictive Intelligence', 'Predicts goal deadline risk including evidence, uncertainty interval, confidence & actions', async () => {
      const risk = await predCoord.goalRisks.predictGoalRisk(goal1.id);
      return {
        passed: risk.risk_probability >= 0.5 && Boolean(risk.confidence_interval) && Boolean(risk.supporting_evidence) && risk.recommended_preventive_actions.length > 0,
        evidence: { prob: risk.risk_probability, level: risk.risk_level, ci: risk.confidence_interval, conf: risk.confidence }
      };
    });

    // T18: Resource constraint & automation opportunity detection
    await runTest('T18_RESOURCE_AND_AUTOMATION_PREDICTION', 'Predictive Intelligence', 'Detects repeated manual workflows & forecasts hardware trends', async () => {
      const nowIso = new Date().toISOString();
      for (let i = 0; i < 4; i++) {
        await run("INSERT INTO activity_logs (id, action, category, details, status, timestamp) VALUES (?, 'Export Daily Audit', 'user', 'manual export', 'success', ?)", [`act-p17-${i}`, nowIso]);
      }
      await predCoord.resources.captureResourceSnapshot();
      await predCoord.resources.captureResourceSnapshot();
      const forecast = await predCoord.generatePersonalIntelligenceForecast();
      return {
        passed: forecast.epistemic_notice === 'FORECAST_PROBABILISTIC_NOT_FACT' && forecast.automation_opportunities.length >= 1 && forecast.predictions.some(p => p.category === 'RESOURCE_CONSTRAINT'),
        evidence: { opportunities: forecast.automation_opportunities.length, predictions: forecast.predictions.length }
      };
    });

    // T19: Prediction calibration (Brier Score) & drift detection
    await runTest('T19_PREDICTION_CALIBRATION_AND_DRIFT', 'Predictive Intelligence', 'Computes Brier calibration score & drift across pre-stored predictions vs outcomes', async () => {
      for (let i = 1; i <= 6; i++) {
        const pid = `pred-cal-${i}`;
        await predCoord.evaluations.storePrediction({
          id: pid, prediction_type: 'GOAL_RISK', target_id: goal1.id, predicted_outcome: 'Risk', confidence: 0.85, risk_probability: 0.85
        });
        await predCoord.evaluations.recordOutcome(pid, { delayed: true }, true);
      }
      const metrics = await predCoord.evaluations.calculateMetrics();
      // Now record 4 consecutive inaccurate predictions to verify drift detector catches decay cleanly
      for (let j = 1; j <= 4; j++) {
        const dp = `pred-drift-${j}`;
        await predCoord.evaluations.storePrediction({
          id: dp, prediction_type: 'GOAL_RISK', target_id: goal1.id, predicted_outcome: 'On time', confidence: 0.85, risk_probability: 0.85
        });
        await predCoord.evaluations.recordOutcome(dp, { delayed: false }, false);
      }
      const driftCheck = await predCoord.evaluations.detectPredictionDrift();
      return {
        passed: metrics.total_evaluations >= 6 && metrics.brier_score < 0.20 && metrics.drift_evaluation?.drift_detected === false && driftCheck.drift_detected === true,
        evidence: { baselineMetrics: metrics, simulatedDriftDetected: driftCheck.drift_detected, driftDrop: driftCheck.accuracy_drop }
      };
    });

    // T20: Decision intelligence evaluates alternatives, constraints & counterfactual simulation
    let evalDec = null;
    await runTest('T20_DECISION_INTELLIGENCE_CONSTRAINTS_AND_SIM', 'Decision Intelligence', 'Evaluates alternatives against Digital Twin zero-cloud constraint & simulates outcomes', async () => {
      const dm = getDecisionMemory();
      evalDec = await dm.evaluateDecisionOptions({
        decision_title: 'Primary Model Inference Strategy',
        category: 'architecture',
        alternatives: [
          { name: 'Local Ollama Quantized Sandbox', scores: { expected_benefit: 9, cost_and_resources: 9.5, security_implications: 9.5, reversibility: 9 } },
          { name: 'External Cloud GPU Cluster API', scores: { expected_benefit: 8.5, cost_and_resources: 5, security_implications: 6, reversibility: 7 } }
        ],
        related_goal_id: goal1.id,
        related_project_id: pProj.id
      });
      return {
        passed: evalDec.recommended_option.name === 'Local Ollama Quantized Sandbox' && evalDec.requires_human_confirmation === true && evalDec.simulation_projection?.is_read_only === true,
        evidence: { winner: evalDec.recommended_option.name, score: evalDec.recommended_option.adjusted_score, constraintsCount: evalDec.active_constraints.length }
      };
    });

    // T21: Decision recall surfaces past lessons & penalizes prior negative options
    await runTest('T21_DECISION_RECALL_AND_LESSONS_PENALTY', 'Decision Intelligence', 'Recalls recorded failure lessons & downranks previously regressed choice', async () => {
      const dm = getDecisionMemory();
      const past = await dm.recordDecision({
        decision_title: 'Cache Backend Selection', category: 'architecture', alternatives_considered: ['Volatile RAM Cache', 'SQLite WAL Index'],
        selected_option: 'Volatile RAM Cache', reasoning_summary: 'Initial prototype choice', expected_outcome: 'Fast startup'
      });
      await dm.recordOutcomeAndLearn(past.id, {
        actual_outcome: 'Exceeded memory limit and failed recovery on crash', lessons_learned: 'Avoid Volatile RAM Cache under tight 16GB budget', outcome_matched_prediction: false
      });
      const recalled = await dm.findRelevantDecisions('Cache Backend', 5);
      const reEval = await dm.evaluateDecisionOptions({
        decision_title: 'Cache Backend Selection Review',
        alternatives: [
          { name: 'Volatile RAM Cache', scores: { expected_benefit: 7, cost_and_resources: 7, security_implications: 7, reversibility: 7 } },
          { name: 'SQLite WAL Index', scores: { expected_benefit: 7.5, cost_and_resources: 8, security_implications: 8, reversibility: 8 } }
        ],
        persistDecision: false
      });
      const volOpt = reEval.alternatives_evaluated.find(o => o.name === 'Volatile RAM Cache');
      return {
        passed: recalled.length >= 1 && Boolean(volOpt?.historical_warning) && reEval.recommended_option.name === 'SQLite WAL Index',
        evidence: { recalledCount: recalled.length, warning: volOpt?.historical_warning, winner: reEval.recommended_option.name }
      };
    });

    // T22: Predicted vs actual decision outcome tracking
    await runTest('T22_DECISION_OUTCOME_COMPARISON', 'Decision Intelligence', 'Compares expected vs actual outcome and captures outcome_matched_prediction flag', async () => {
      const dm = getDecisionMemory();
      const out = await dm.recordOutcomeAndLearn(evalDec.decision_id, {
        actual_outcome: 'Expected completion prob met with zero cloud fees and 100% pass',
        lessons_learned: 'Local quantized sandbox preserves budget and security cleanly',
        outcome_matched_prediction: true
      });
      return { passed: out.outcome_matched_prediction === true && Boolean(out.evaluated_at), evidence: out };
    });

    // T23: Counterfactual simulations remain strictly read-only
    await runTest('T23_SIMULATION_STRICTLY_READ_ONLY', 'Decision Intelligence', 'Deadline and resource simulations leave actual autonomous_goals unchanged', async () => {
      const goalBefore = await get('SELECT deadline, progress, status FROM autonomous_goals WHERE id = ?', [goal1.id]);
      const sim = await getTwinSimulation().simulateDeadlineChange({ target_id: goal1.id, days_offset: -5 });
      const goalAfter = await get('SELECT deadline, progress, status FROM autonomous_goals WHERE id = ?', [goal1.id]);
      return {
        passed: sim.is_read_only === true && sim.is_simulation === true && JSON.stringify(goalBefore) === JSON.stringify(goalAfter),
        evidence: { isReadOnly: sim.is_read_only, simulatedUrgency: sim.simulated_impact.urgency_level }
      };
    });

    // T24: User fact correction updates Twin + Knowledge Graph + correction history
    await runTest('T24_USER_FACT_CORRECTION_PROPAGATION', 'User Corrections', 'Explicit user correction sets confidence=1.0, confirmed=true, logs history & updates graph', async () => {
      const corrected = await DigitalTwinService.correctFact(pInferred.id, {
        new_content: 'Bi-weekly verified system architecture reviews',
        reason: 'Operator corrected inferred weekly frequency'
      });
      const graphEnt = await get('SELECT name, confidence FROM graph_entities WHERE id = ?', [`ent-${pInferred.id}`]);
      return {
        passed: corrected.is_confirmed === true && corrected.confidence === 1.0 && corrected.user_correction_history.length === 1 && graphEnt?.confidence === 1.0,
        evidence: { historyLen: corrected.user_correction_history.length, content: corrected.content, graphConf: graphEnt?.confidence }
      };
    });

    // T25: Decision user correction & recommendation learning weights
    await runTest('T25_USER_CORRECTION_AND_LEARNING_WEIGHTS', 'User Corrections', 'Records user correction notes on decisions & tunes recommendation priors on feedback', async () => {
      const dm = getDecisionMemory();
      const learned = await dm.recordOutcomeAndLearn(evalDec.decision_id, {
        actual_outcome: 'Required 240s timeout on CPU coding tasks',
        lessons_learned: 'Local inference latency higher on multi-turn tasks',
        outcome_matched_prediction: false,
        correction_notes: 'Keep CPU inference timeout >= 240s for coding analysis'
      });
      const recCreated = await predCoord.recommendations.processOpportunities([{
        type: 'AUTOMATION', title: 'Schedule Weekly Twin Audit', description: 'Run read-only twin consistency check', expected_impact: 'MEDIUM', risk_classification: 'SAFE', confidence: 0.75
      }]);
      await predCoord.recommendations.acceptRecommendation(recCreated[0].id, 'Helpful');
      const priorAfter = await predCoord.learning.getCategoryPrior('AUTOMATION');
      return {
        passed: learned.learned_correction === true && learned.lessons_learned.includes('[USER_CORRECTION]') && priorAfter > 1.0,
        evidence: { lessons: learned.lessons_learned, automationWeight: priorAfter }
      };
    });

    // T26: Proactive personal briefing surfaces neglected, conflicting & contradictory items
    await runTest('T26_PROACTIVE_PERSONAL_BRIEFING', 'Proactive Intelligence', 'Surfaces contradictions, competing commitments, predicted bottlenecks & concise briefing proactively', async () => {
      const pIntell = await ProactiveIntelligenceService.generatePersonalProactiveIntelligence();
      const types = new Set(pIntell.alerts.map(a => a.type));
      return {
        passed: pIntell.success && types.has('KNOWLEDGE_CONTRADICTION') && types.has('CONFLICTING_COMMITMENTS') && Boolean(pIntell.concise_briefing),
        evidence: { alertTypes: Array.from(types), neglected: pIntell.neglected_objectives.length, briefingLines: pIntell.concise_briefing.split('\n').length }
      };
    });

    // T27: Non-autonomous consequential personal decision guard
    await runTest('T27_CONSEQUENTIAL_DECISION_SAFETY_GUARD', 'Privacy & Security', 'Blocks unapproved high-impact recommendation execution & enforces human confirmation', async () => {
      const pIntell = await ProactiveIntelligenceService.generatePersonalProactiveIntelligence();
      const hiRec = await predCoord.recommendations.processOpportunities([{
        type: 'PREVENTIVE_FIX', title: 'Critical Architecture Override', description: 'High impact state change', expected_impact: 'HIGH', risk_classification: 'HIGH_RISK', confidence: 0.85,
        suggested_action: { type: 'MANUAL_REVIEW' }
      }]);
      let blockedErr = '';
      try {
        await predCoord.recommendations.executeRecommendation(hiRec[0].id, false);
      } catch (err) { blockedErr = err.message; }
      return {
        passed: pIntell.autonomous_execution_blocked === true && pIntell.consequential_actions_require_approval === true && blockedErr.includes('SECURITY_REJECTION'),
        evidence: { autonomousBlocked: pIntell.autonomous_execution_blocked, blockedErr }
      };
    });

    // T28: Phase 17 HTTP APIs, ToolRegistry, zero cloud calls & prod DB intact
    await runTest('T28_API_TOOLS_ZERO_CLOUD_PROD_DB_INTACT', 'Integration & Security', 'All Phase 17 REST endpoints & tools work with 0 cloud LLM requests and prod DB unchanged', async () => {
      const app = express();
      app.use(express.json());
      app.use('/api/twin', twinRouter);
      const srv = http.createServer(app);
      await new Promise(r => srv.listen(0, '127.0.0.1', r));
      const port = srv.address().port;
      let apiCtx, apiIntel, toolRes;
      try {
        apiCtx = (await axios.get(`http://127.0.0.1:${port}/api/twin/unified-context`, { timeout: 10000 })).data;
        apiIntel = (await axios.get(`http://127.0.0.1:${port}/api/twin/personal-intelligence`, { timeout: 10000 })).data;
        toolRes = await ToolRegistry.executeTool('evaluate_personal_decision', {
          decision_title: 'Tool Dispatch Test',
          alternatives: [{ name: 'Local Option' }, { name: 'Alternative Option' }]
        });
      } finally { srv.close(); }

      const cloudHits = netMon.reqs.filter(r => CLOUD_LLM_HOSTS.some(h => r.host.includes(h)));
      const prodHashAfter = sha256File(PROD_DB_PATH);
      return {
        passed: apiCtx.success && apiCtx.context?.unified_schema_version === '17.0' && apiIntel.success && toolRes.success && cloudHits.length === 0 && prodHashBefore === prodHashAfter,
        evidence: { totalHttpReqs: netMon.reqs.length, cloudHits: cloudHits.length, prodDbPreserved: prodHashBefore === prodHashAfter, prodDbSha256: prodHashAfter }
      };
    });

    const summary = {
      suite: 'PHASE_17_ADVANCED_PERSONAL_INTELLIGENCE',
      timestamp: new Date().toISOString(),
      model: 'qwen3.5:4b',
      endpoint: 'http://127.0.0.1:11434',
      total_tests: results.length,
      passed: results.filter(r => r.status === 'PASS').length,
      failed: results.filter(r => r.status === 'FAIL').length,
      pass_rate_percent: Number(((results.filter(r => r.status === 'PASS').length / results.length) * 100).toFixed(1)),
      prod_db_preserved: prodHashBefore === sha256File(PROD_DB_PATH),
      prod_db_sha256: sha256File(PROD_DB_PATH)
    };

    fs.writeFileSync(path.join(DELIVERABLES_DIR, 'PHASE_17_TEST_RESULTS.json'), JSON.stringify({ summary, results }, null, 2), 'utf-8');
    console.log('\n' + '='.repeat(80));
    console.log(`PHASE 17 COMPLETE: ${summary.passed}/${summary.total_tests} PASS (${summary.pass_rate_percent}%) | Prod DB Preserved=${summary.prod_db_preserved}`);
    console.log('='.repeat(80));
  } finally {
    netMon.restore();
    if (ollamaChild?.pid) {
      try { spawnSync('taskkill', ['/F', '/T', '/PID', String(ollamaChild.pid)], { windowsHide: true }); } catch (_) {}
    }
  }
  process.exit(0);
}

main().catch(err => {
  console.error('[Phase 17 Fatal Error]', err);
  process.exit(1);
});
