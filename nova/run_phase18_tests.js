import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import axios from 'axios';
import express from 'express';
import { spawn } from 'child_process';

const ISOLATED_DB_DIR = path.resolve('nova/data/sentinel_disposable_test/phase18_isolated');
const ISOLATED_DB_PATH = path.join(ISOLATED_DB_DIR, 'phase18.sqlite');
const DISPOSABLE_WORK_DIR = path.resolve('nova/data/sentinel_disposable_test/phase18_workspace');
const PROD_DB_PATH = path.resolve('nova/data/nova.sqlite');
const DELIVERABLES_DIR = path.resolve('nova/deliverables');

fs.mkdirSync(ISOLATED_DB_DIR, { recursive: true });
if (fs.existsSync(DISPOSABLE_WORK_DIR)) {
  fs.rmSync(DISPOSABLE_WORK_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DISPOSABLE_WORK_DIR, { recursive: true });

for (const ext of ['', '-wal', '-shm']) {
  const f = ISOLATED_DB_PATH + ext;
  if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (_) {}
}

process.env.NOVA_DB_PATH = ISOLATED_DB_PATH;
process.env.ZERO_COST_LOCAL_ONLY = 'true';
process.env.OLLAMA_ENDPOINT = 'http://127.0.0.1:11434';
process.env.OLLAMA_MODEL = 'qwen3.5:4b';
process.env.MISSION_MAX_WORKERS = '2';

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

async function ensureOllama() {
  try {
    const r = await axios.get('http://127.0.0.1:11434/api/tags', { timeout: 2000 });
    if (r.status === 200) return { proc: null, started: false };
  } catch (_) {}
  const proc = spawn('ollama', ['serve'], { stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 30; i++) {
    try {
      const r = await axios.get('http://127.0.0.1:11434/api/tags', { timeout: 1500 });
      if (r.status === 200) return { proc, started: true };
    } catch (_) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return { proc, started: true };
}

async function ensurePythonAgent() {
  try {
    const r = await axios.get('http://127.0.0.1:8000/openapi.json', { timeout: 1500 });
    if (r.status === 200) return { proc: null, started: false };
  } catch (_) {}
  const agentPath = path.resolve('nova/python-agent/agent.py');
  const proc = spawn('python', [agentPath], { stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 30; i++) {
    try {
      const r = await axios.get('http://127.0.0.1:8000/openapi.json', { timeout: 1000 });
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

async function waitForMissionTerminal(mc, missionId, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  const terminal = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'PARTIALLY_VERIFIED', 'WAITING_FOR_APPROVAL', 'BLOCKED_PROVIDER_UNAVAILABLE', 'BLOCKED_LOCAL_MODEL_UNAVAILABLE', 'FAILED_RETRYABLE']);
  while (Date.now() < deadline) {
    const m = await mc.getMission(missionId);
    if (m && terminal.has(m.status) && !mc.activeExecutions.has(missionId)) {
      return m;
    }
    await new Promise(r => setTimeout(r, 150));
  }
  return mc.getMission(missionId);
}

async function main() {
  const prodHashBefore = sha256File(PROD_DB_PATH);
  const netMon = installNetMonitor();
  let ollamaChild = null;
  let pyAgentChild = null;
  let server = null;

  console.log('================================================================================');
  console.log('JARVIS OS 2.0 — PHASE 18 AUTONOMOUS WORKFLOW ECOSYSTEM SUITE (32 TESTS)');
  console.log('================================================================================');

  try {
    const ollamaInfo = await ensureOllama();
    ollamaChild = ollamaInfo.proc;
    const pyInfo = await ensurePythonAgent();
    pyAgentChild = pyInfo.proc;

    const { initDatabase, run, query, get } = await import('./backend/database/db.js');
    await initDatabase();

    const { initMissionControl, MISSION_STATUSES } = await import('./backend/services/missionControlService.js');
    const mc = initMissionControl(null);
    const CoordinatorAgent = (await import('./backend/ai/agents/CoordinatorAgent.js')).default;
    const { getSkillEvolutionService } = await import('./backend/services/skillEvolutionService.js');
    const skillEvolution = getSkillEvolutionService();
    const { getEvolutionPipelineService } = await import('./backend/services/evolutionPipelineService.js');
    const evolutionPipeline = getEvolutionPipelineService();
    const ToolRegistry = (await import('./backend/tools/registry.js')).default;

    const missionsRoutes = (await import('./backend/routes/missions.js')).default;
    const agentsRoutes = (await import('./backend/routes/agents.js')).default;
    const evolutionRoutes = (await import('./backend/routes/evolution.js')).default;

    const results = [];
    const record = async (id, category, name, fn) => {
      const t0 = Date.now();
      try {
        const evidence = await fn();
        results.push({ id, category, name, status: 'PASS', duration_ms: Date.now() - t0, evidence, failure_reason: null });
        console.log(`[PASS] ${id}: ${name} (${Date.now() - t0}ms)`);
      } catch (err) {
        results.push({ id, category, name, status: 'FAIL', duration_ms: Date.now() - t0, evidence: null, failure_reason: err.message });
        console.error(`[FAIL] ${id}: ${name} -> ${err.message}`);
      }
    };

    const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

    // Shared variables across linked tests
    let crashRecoverMissionId = null;
    let rollbackMissionId = null;
    let escalatedMissionId = null;
    let learnedSkillId = null;
    let learnedSkillKey = null;

    // ------------------------------------------------------------------------
    // CATEGORY A: UNIFIED WORKFLOW ENGINE & DAG ORDERING (T01 - T06)
    // ------------------------------------------------------------------------
    await record('T01_NL_TO_STRUCTURED_DAG_LOCAL_AI', 'Workflow Engine', 'Converts NL objective into structured DAG with local qwen3.5:4b', async () => {
      const probeDir = path.join(DISPOSABLE_WORK_DIR, 't01_inspect');
      fs.mkdirSync(probeDir, { recursive: true });
      fs.writeFileSync(path.join(probeDir, 'alpha.txt'), 'Alpha diagnostic fixture content');
      const forwardDir = probeDir.replace(/\\/g, '/');
      const m = await mc.createMission(`Inspect files in "${forwardDir}" using hash_and_list_files`);
      assert(m && m.steps && m.steps.length >= 1, `Expected >=1 planned steps (status=${m?.status}, error=${m?.error})`);
      assert(m.workflow_metadata?.dag?.parallel_layers?.length >= 1, 'Expected DAG parallel_layers metadata');
      return { mission_id: m.id, steps: m.steps.map(s => ({ step: s.step_index, agent: s.agent_key, tool: s.tool })), dag: m.workflow_metadata.dag };
    });

    await record('T02_CIRCULAR_DEPENDENCY_DETECTION', 'Workflow Engine', 'Detects self & multi-node circular dependencies cleanly', async () => {
      const selfCycle = mc.validateWorkflowDAG([{ step_index: 1, title: 'Loop', tool: 'get_system_telemetry', depends_on: [1] }]);
      assert(!selfCycle.valid && selfCycle.circular, 'Self cycle must fail');
      let threwOnCreate = false;
      try {
        await mc.createMission({
          objective: 'Cyclic workflow test',
          steps: [
            { step_index: 1, title: 'A', agent_key: 'files', tool: 'search_files', depends_on: [2] },
            { step_index: 2, title: 'B', agent_key: 'files', tool: 'read_file', depends_on: [1] }
          ]
        });
      } catch (e) {
        threwOnCreate = e.message.includes('CIRCULAR_DEPENDENCY_DETECTED');
      }
      assert(threwOnCreate, 'Expected CIRCULAR_DEPENDENCY_DETECTED exception on createMission');
      return { selfCycleError: selfCycle.error, threwOnCreate };
    });

    await record('T03_INVALID_DEPENDENCY_REJECTION', 'Workflow Engine', 'Rejects missing prerequisite step reference in workflow DAG', async () => {
      const res = mc.validateWorkflowDAG([{ step_index: 1, title: 'Orphan', tool: 'get_system_telemetry', depends_on: [99] }]);
      assert(!res.valid && res.error.includes('INVALID_DEPENDENCY'), `Expected INVALID_DEPENDENCY, got: ${res.error}`);
      return { error: res.error };
    });

    await record('T04_DEPENDENCY_ORDERING_EXECUTION', 'Workflow Engine', 'Executes multi-step fan-in DAG strictly respecting dependencies', async () => {
      const dir = path.join(DISPOSABLE_WORK_DIR, 't04_dag');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'sample.js'), 'export const VERSION = 18;\n');
      const reportPath = path.join(dir, 'dag_summary.md');

      const m = await mc.createMission({
        objective: `Inspect "${dir}" and produce verified report at "${reportPath}"`,
        steps: [
          { step_index: 1, title: 'Scan directory hashes', agent_key: 'files', tool: 'hash_and_list_files', args: { directory: dir, include_content_preview: 1 }, depends_on: [] },
          { step_index: 2, title: 'Save inventory fact to memory', agent_key: 'files', tool: 'save_memory', args: { key: 'phase18_t04_scan', value: `Scanned ${dir}`, category: 'workflow', importance: 3 }, depends_on: [1] },
          { step_index: 3, title: 'Write verified Markdown report', agent_key: 'content', tool: 'write_file', args: { file_path: reportPath, content: `Phase 18 Verified DAG Output\n\nDirectory inspected cleanly: ${dir}\nUpstream dependencies verified via step 1 and step 2. Deterministic content > 180 chars so test avoids flaky model wait while checking dependencyTimestamps.` }, depends_on: [1, 2] }
        ]
      });
      await mc.startMission(m.id);
      const done = await waitForMissionTerminal(mc, m.id);
      assert(done.status === 'COMPLETED', `Expected COMPLETED, got ${done.status}: ${done.error}`);
      const s1 = done.steps.find(s => s.step_index === 1);
      const s2 = done.steps.find(s => s.step_index === 2);
      const s3 = done.steps.find(s => s.step_index === 3);
      assert(new Date(s1.completed_at) <= new Date(s2.started_at), 'Step 2 started before Step 1 completed');
      assert(new Date(s2.completed_at) <= new Date(s3.started_at), 'Step 3 started before Step 2 completed');
      assert(fs.existsSync(reportPath), 'Report artifact missing');
      return { mission_id: m.id, critical_path: m.workflow_metadata.dag.critical_path_length, reportBytes: fs.statSync(reportPath).size };
    });

    await record('T05_PARALLELIZABLE_LAYER_CONCURRENCY', 'Workflow Engine', 'Runs independent root steps in parallel layer concurrently', async () => {
      const dirA = path.join(DISPOSABLE_WORK_DIR, 't05_a');
      const dirB = path.join(DISPOSABLE_WORK_DIR, 't05_b');
      fs.mkdirSync(dirA, { recursive: true });
      fs.mkdirSync(dirB, { recursive: true });
      fs.writeFileSync(path.join(dirA, 'a.txt'), 'file a');
      fs.writeFileSync(path.join(dirB, 'b.txt'), 'file b');

      const m = await mc.createMission({
        objective: 'Execute parallel file scans and system telemetry inspection',
        steps: [
          { step_index: 1, title: 'Scan Folder A', agent_key: 'files', tool: 'hash_and_list_files', args: { directory: dirA }, depends_on: [] },
          { step_index: 2, title: 'Scan Folder B', agent_key: 'files', tool: 'hash_and_list_files', args: { directory: dirB }, depends_on: [] },
          { step_index: 3, title: 'Capture Telemetry', agent_key: 'system', tool: 'get_system_telemetry', args: {}, depends_on: [] }
        ]
      });
      assert(m.workflow_metadata.dag.parallel_layers[0].length === 3, 'All 3 steps should be in layer 0');
      await mc.startMission(m.id);
      const done = await waitForMissionTerminal(mc, m.id);
      assert(done.status === 'COMPLETED', `Expected COMPLETED, got ${done.status}: ${done.error}`);
      const parallelCount = (done.deliverables || []).filter(d => d.executed_parallel).length;
      assert(parallelCount === 3, `Expected 3 parallel deliverables, got ${parallelCount}`);
      return { parallel_layers: m.workflow_metadata.dag.parallel_layers, parallelCount };
    });

    await record('T06_CHECKPOINT_PERSISTENCE', 'Workflow Engine', 'Persists incremental state checkpoints per completed step', async () => {
      const allM = await mc.listMissions(5);
      const target = allM.find(x => x.status === 'COMPLETED' && x.steps.length >= 3);
      const chks = await mc.getCheckpoints(target.id);
      assert(chks.length >= 2, `Expected >=2 checkpoints, found ${chks.length}`);
      return { mission_id: target.id, checkpoints_count: chks.length };
    });

    // ------------------------------------------------------------------------
    // CATEGORY B: SPECIALIST AGENT ECOSYSTEM & CONTRACTS (T07 - T12)
    // ------------------------------------------------------------------------
    await record('T07_SIX_SPECIALIST_AGENTS_CONTRACTS', 'Specialist Agents', 'All 6 specialist agents expose explicit responsibilities, tools, I/O contracts & limits', async () => {
      const agents = CoordinatorAgent.getAllAgents();
      const keys = agents.map(a => a.key);
      for (const reqKey of ['research', 'coding', 'productivity', 'files', 'content', 'system']) {
        assert(keys.includes(reqKey), `Missing specialist agent '${reqKey}'`);
      }
      for (const a of agents) {
        assert(Array.isArray(a.responsibilities) && a.responsibilities.length >= 2, `${a.key} lacks responsibilities`);
        assert(Array.isArray(a.allowedTools) && a.allowedTools.length >= 4, `${a.key} lacks allowedTools`);
        assert(a.inputContract && a.outputContract && a.resourceLimits, `${a.key} lacks contracts/limits`);
        assert(typeof a.independentVerification === 'string' && a.independentVerification.length > 5, `${a.key} lacks verification method`);
      }
      return { agentCount: agents.length, keys };
    });

    await record('T08_LEAST_PRIVILEGE_TOOL_ENFORCEMENT', 'Specialist Agents', 'Blocks unauthorized tool invocation on specialist agents & records rejection log', async () => {
      const research = CoordinatorAgent.getAgent('research');
      let blockedErr = null;
      try {
        await research.executeTool('execute_script', { script: 'rm -rf /' });
      } catch (e) {
        blockedErr = e.message;
      }
      assert(blockedErr && blockedErr.includes('PERMISSION_DENIED'), `Expected PERMISSION_DENIED, got ${blockedErr}`);
      const logs = await research.getExecutionLogs(5);
      assert(logs.some(l => l.status === 'REJECTED_UNAUTHORIZED' && l.tool === 'execute_script'), 'Expected REJECTED_UNAUTHORIZED log entry');
      return { blockedErr };
    });

    await record('T09_EXECUTION_STEP_AGENT_PRIVILEGE_BLOCK', 'Specialist Agents', 'MissionControl step execution rejects least-privilege violation before tool call', async () => {
      const m = await mc.createMission({
        objective: 'Test unauthorized tool privilege boundary in mission step',
        steps: [
          { step_index: 1, title: 'Unauthorized delete by Research Agent', agent_key: 'research', tool: 'delete_memory', args: { id: 'nonexistent' }, depends_on: [] }
        ]
      });
      // Simulate bypass of approval so runtime authorization check itself triggers
      await run("UPDATE mission_steps SET requires_approval = 0, approved_at = '2026-11-26T00:00:00Z' WHERE mission_id = ?", [m.id]);
      await mc.startMission(m.id);
      const done = await waitForMissionTerminal(mc, m.id);
      assert(done.status === 'FAILED', `Expected FAILED on privilege violation, got ${done.status}`);
      assert(done.error && done.error.includes('PERMISSION_DENIED'), `Expected PERMISSION_DENIED error, got ${done.error}`);
      return { status: done.status, error: done.error };
    });

    await record('T10_INVALID_INPUT_CONTRACT_REJECTION', 'Specialist Agents', 'Rejects oversized or malformed argument payloads against resource limits', async () => {
      const coding = CoordinatorAgent.getAgent('coding');
      const huge = 'X'.repeat(80000);
      const checkOversized = coding.validateInputContract({ data: huge });
      const checkArray = coding.validateInputContract(['invalid']);
      assert(!checkOversized.valid && checkOversized.error.includes('RESOURCE_LIMIT_EXCEEDED'), 'Must reject oversized payload');
      assert(!checkArray.valid && checkArray.error.includes('INVALID_INPUT_CONTRACT'), 'Must reject array args');
      return { oversizedError: checkOversized.error, arrayError: checkArray.error };
    });

    await record('T11_INVALID_OUTPUT_CONTRACT_REJECTION', 'Specialist Agents', 'Rejects null outputs, failure flags & unresolved template markers', async () => {
      const contentAgent = CoordinatorAgent.getAgent('content');
      const c1 = contentAgent.validateOutputContract(null, 'write_file');
      const c2 = contentAgent.validateOutputContract({ text: '{{SYNTHESIZE_FROM_DEPS}}' }, 'write_file');
      const c3 = contentAgent.validateOutputContract({ success: false, error: 'Write failed' }, 'write_file');
      assert(!c1.valid && !c2.valid && !c3.valid, 'All 3 invalid outputs must be rejected');
      return { nullErr: c1.error, markerErr: c2.error, failFlagErr: c3.error };
    });

    await record('T12_EXECUTION_LOGS_PERSISTED', 'Specialist Agents', 'Persists agent execution logs with output SHA-256 hash & contract status', async () => {
      const logs = await query('SELECT * FROM agent_execution_logs ORDER BY created_at DESC LIMIT 20');
      const verifiedLog = logs.find(l => l.contract_valid === 1 && l.output_hash && l.output_hash.length === 64);
      assert(Boolean(verifiedLog), 'Expected at least 1 persisted agent execution log with SHA-256 hash');
      return { total_logs: logs.length, sample_agent: verifiedLog.agent_key, sample_hash_len: verifiedLog.output_hash.length };
    });

    // ------------------------------------------------------------------------
    // CATEGORY C: AGENT COORDINATION & DISAGREEMENT RESOLUTION (T13 - T17)
    // ------------------------------------------------------------------------
    await record('T13_CAPABILITY_BASED_DELEGATION', 'Agent Coordination', 'Coordinator delegates tools accurately based on agent capabilities', async () => {
      const dCode = CoordinatorAgent.delegateTask({ directive: 'Run unit tests', tool: 'run_project_tests' });
      const dFile = CoordinatorAgent.delegateTask({ directive: 'Organize workspace files', tool: 'organize_files_by_type' });
      const dProd = CoordinatorAgent.delegateTask({ directive: 'Add reminder task', tool: 'create_task' });
      const dSys = CoordinatorAgent.delegateTask({ directive: 'Read telemetry', tool: 'get_system_telemetry' });
      assert(dCode.agentKey === 'coding' && dFile.agentKey === 'files' && dProd.agentKey === 'productivity' && dSys.agentKey === 'system', 'Capability routing mismatch');
      return { coding: dCode.agentKey, files: dFile.agentKey, productivity: dProd.agentKey, system: dSys.agentKey };
    });

    await record('T14_STRUCTURED_RESULT_HANDOFF', 'Agent Coordination', 'Records structured upstream-to-downstream result handoffs in coordination events', async () => {
      const events = await query("SELECT * FROM mission_coordination_events WHERE event_type = 'HANDOFF_EXCHANGED'");
      assert(events.length >= 1, 'Expected HANDOFF_EXCHANGED coordination event');
      return { handoffs_count: events.length, sample_target: events[0].target_agent };
    });

    await record('T15_DUPLICATE_WORK_PREVENTION', 'Agent Coordination', 'Deduplicates identical mission keys & reuses identical step action hashes', async () => {
      const key = 'phase18-dedup-test-key';
      const dir = path.join(DISPOSABLE_WORK_DIR, 't15_dedup');
      fs.mkdirSync(dir, { recursive: true });
      const steps = [
        { step_index: 1, title: 'Telemetry Check A', agent_key: 'system', tool: 'get_system_telemetry', args: {}, depends_on: [] },
        { step_index: 2, title: 'Telemetry Check B Duplicate', agent_key: 'system', tool: 'get_system_telemetry', args: {}, depends_on: [1] }
      ];
      const m1 = await mc.createMission({ objective: 'Idempotency Key Test', idempotency_key: key, steps });
      const m2 = await mc.createMission({ objective: 'Idempotency Key Test', idempotency_key: key, steps });
      assert(m2.deduplicated === true && m2.id === m1.id, 'Second createMission with same idempotency_key must deduplicate');
      await mc.startMission(m1.id);
      const done = await waitForMissionTerminal(mc, m1.id);
      assert(done.status === 'COMPLETED', `Expected COMPLETED, got ${done.status}`);
      return { deduplicatedId: m2.id, step2_status: done.steps[1].status };
    });

    await record('T16_CONFLICTING_OUTPUT_EVIDENCE_RESOLUTION', 'Agent Coordination', 'Resolves conflicting outputs deterministically via verification & citation evidence', async () => {
      const m = await mc.createMission({
        objective: 'Conflict resolution mission',
        steps: [{ step_index: 1, title: 'Telemetry', agent_key: 'system', tool: 'get_system_telemetry', args: {}, depends_on: [] }]
      });
      const res = await mc.resolveStepDisagreement(m.id, [
        { agent_key: 'content', conclusion: 'USE_SQLITE_DISABLED', confidence: 0.6, verification: { verified: false } },
        { agent_key: 'coding', conclusion: 'USE_SQLITE_WAL', confidence: 0.9, verification: { verified: true }, evidence_hash: 'abc123', citations: ['https://sqlite.org/wal.html'] }
      ]);
      assert(res.conflict_detected && res.resolved && !res.requires_escalation, 'Conflict should resolve automatically');
      assert(res.winner.agent_key === 'coding', `Expected coding agent to win, got ${res.winner.agent_key}`);
      return { winner: res.winner.agent_key, margin: res.margin, rationale: res.rationale };
    });

    await record('T17_UNRESOLVED_DISAGREEMENT_ESCALATION_AND_ADJUDICATION', 'Agent Coordination', 'Escalates equal-evidence agent disagreement & supports operator adjudication', async () => {
      const m = await mc.createMission({
        objective: 'Ambiguous disagreement escalation test',
        steps: [{ step_index: 1, title: 'Task step', agent_key: 'system', tool: 'get_system_telemetry', args: {}, depends_on: [] }]
      });
      escalatedMissionId = m.id;
      const res = await mc.resolveStepDisagreement(m.id, [
        { agent_key: 'research', conclusion: 'DEPLOY_OPTION_A', confidence: 0.75, verification: { verified: false } },
        { agent_key: 'coding', conclusion: 'DEPLOY_OPTION_B', confidence: 0.78, verification: { verified: false } }
      ]);
      assert(res.conflict_detected && res.requires_escalation && !res.resolved, 'Tie must escalate to human operator');
      const escMission = await mc.getMission(m.id);
      assert(escMission.status === 'WAITING_FOR_APPROVAL', `Expected WAITING_FOR_APPROVAL on escalation, got ${escMission.status}`);
      const adj = await mc.resolveEscalation(m.id, { chosenAgentKey: 'coding', decisionNote: 'Operator chose DEPLOY_OPTION_B', approvedBy: 'commander' });
      const postAdj = await mc.getMission(m.id);
      assert(adj.success && postAdj.status === 'PENDING', 'Adjudication should unblock escalated mission');
      return { escalatedReason: res.escalation_reason, postAdjudicationStatus: postAdj.status };
    });

    // ------------------------------------------------------------------------
    // CATEGORY D: CONCURRENCY, CRASHES & RECOVERY (T18 - T21)
    // ------------------------------------------------------------------------
    await record('T18_CONCURRENT_WORKFLOW_POOL_PRIORITY', 'Concurrency & Recovery', 'Runs multiple concurrent workflows honoring maxConcurrentWorkers limit & queuing', async () => {
      const ids = [];
      for (let i = 0; i < 4; i++) {
        const m = await mc.createMission({
          objective: `Concurrent Workflow #${i + 1}`,
          priority: i === 3 ? 10 : 1,
          steps: [{ step_index: 1, title: `Check Telemetry ${i + 1}`, agent_key: 'system', tool: 'get_system_telemetry', args: {}, depends_on: [] }]
        });
        ids.push(m.id);
      }
      await Promise.all(ids.map(id => mc.startMission(id)));
      const doneAll = await Promise.all(ids.map(id => waitForMissionTerminal(mc, id)));
      assert(doneAll.every(m => m.status === 'COMPLETED'), 'All 4 concurrent workflows should complete');
      const pool = mc.getWorkerPoolMetrics();
      assert(pool.peak_active_workers <= pool.max_concurrent_workers, `Exceeded worker cap: ${pool.peak_active_workers} > ${pool.max_concurrent_workers}`);
      return { completedCount: doneAll.length, pool };
    });

    await record('T19_WORKER_CRASH_AND_CHECKPOINT_RECOVERY', 'Concurrency & Recovery', 'Recovers cleanly from simulated worker crash without losing checkpoints', async () => {
      const dir = path.join(DISPOSABLE_WORK_DIR, 't19_crash');
      fs.mkdirSync(dir, { recursive: true });
      const outPath = path.join(dir, 'crash_recovered.txt');
      const m = await mc.createMission({
        objective: `Crash recovery verification creating "${outPath}"`,
        steps: [
          { step_index: 1, title: 'Step 1 Completed Before Crash', agent_key: 'system', tool: 'get_system_telemetry', args: {}, depends_on: [] },
          { step_index: 2, title: 'Step 2 Interrupted Mid-Worker', agent_key: 'files', tool: 'write_file', args: { file_path: outPath, content: 'Recovered workflow deliverable written safely after simulated worker crash checkpoint restoration (>30 bytes).' }, depends_on: [1] }
        ]
      });
      crashRecoverMissionId = m.id;
      // Manually simulate step 1 finished & checkpoint saved, step 2 crashed while RUNNING
      await run("UPDATE mission_steps SET status = 'VERIFIED', verification_status = 'VERIFIED', result = ? WHERE mission_id = ? AND step_index = 1", [JSON.stringify({ ok: true }), m.id]);
      await mc.saveCheckpoint(m.id, 1, { completedSteps: [1], deliverables: [{ step_index: 1, title: 'Step 1' }] });
      await run("UPDATE mission_steps SET status = 'RUNNING' WHERE mission_id = ? AND step_index = 2", [m.id]);

      const crashOut = await mc.handleWorkerCrash(m.id, 'SIMULATED_SIGKILL_CRASH');
      assert(crashOut.success && crashOut.checkpoint_step === 1, 'Crash recovery must restore from checkpoint step 1');
      const finalM = await waitForMissionTerminal(mc, m.id);
      assert(finalM.status === 'COMPLETED', `Expected COMPLETED after recovery, got ${finalM.status}: ${finalM.error}`);
      assert(fs.existsSync(outPath), 'Step 2 output file must exist after recovery');
      return { mission_id: m.id, checkpoint_step: crashOut.checkpoint_step, status: finalM.status };
    });

    await record('T20_PAUSE_RESUME_CONTINUITY', 'Concurrency & Recovery', 'Supports workflow pause and resume with checkpoint continuity', async () => {
      const m = await mc.createMission({
        objective: 'Pause and resume validation',
        steps: [
          { step_index: 1, title: 'Telemetry Step', agent_key: 'system', tool: 'get_system_telemetry', args: {}, depends_on: [] }
        ]
      });
      mc.pauseMission(m.id);
      const ctrl = mc.controllers.get(m.id);
      assert(ctrl.isPaused === true, 'Controller should be marked paused');
      await mc.resumeMission(m.id);
      const done = await waitForMissionTerminal(mc, m.id);
      assert(done.status === 'COMPLETED', `Expected COMPLETED after resume, got ${done.status}`);
      return { mission_id: m.id, finalStatus: done.status };
    });

    await record('T21_CLEAR_CANCELLATION', 'Concurrency & Recovery', 'Cancels pending steps cleanly and prevents execution restart', async () => {
      const m = await mc.createMission({
        objective: 'Workflow cancellation validation',
        steps: [
          { step_index: 1, title: 'Step 1', agent_key: 'system', tool: 'get_system_telemetry', args: {}, depends_on: [] },
          { step_index: 2, title: 'Step 2 Pending', agent_key: 'files', tool: 'search_files', args: { directory: DISPOSABLE_WORK_DIR }, depends_on: [1] }
        ]
      });
      await mc.cancelMission(m.id, 'Operator test cancellation');
      const after = await mc.getMission(m.id);
      assert(after.status === 'CANCELLED', 'Mission must be CANCELLED');
      assert(after.steps.every(s => s.status === 'CANCELLED'), 'All pending steps must transition to CANCELLED');
      const retryStart = await mc.startMission(m.id);
      assert(retryStart.blocked === 'MISSION_CANCELLED', 'Cancelled mission must not restart');
      return { mission_id: m.id, blocked: retryStart.blocked };
    });

    // ------------------------------------------------------------------------
    // CATEGORY E: WORKFLOW LEARNING & SKILL EVOLUTION (T22 - T25)
    // ------------------------------------------------------------------------
    await record('T22_REPEATED_WORKFLOW_IDENTIFICATION', 'Workflow Learning', 'Identifies repeated multi-step verified workflows across completed missions', async () => {
      const wfDir = path.join(DISPOSABLE_WORK_DIR, 't22_repeat');
      fs.mkdirSync(wfDir, { recursive: true });
      fs.writeFileSync(path.join(wfDir, 'doc.txt'), 'repeated workflow sample');
      for (let i = 0; i < 3; i++) {
        const m = await mc.createMission({
          objective: `Repeated Inspect-Telemetry Cycle #${i + 1}`,
          steps: [
            { step_index: 1, title: 'Inspect files', agent_key: 'files', tool: 'hash_and_list_files', args: { directory: wfDir }, depends_on: [] },
            { step_index: 2, title: 'Capture telemetry', agent_key: 'system', tool: 'get_system_telemetry', args: {}, depends_on: [1] }
          ]
        });
        await mc.startMission(m.id);
        const done = await waitForMissionTerminal(mc, m.id);
        assert(done.status === 'COMPLETED', `Repeat run ${i + 1} failed`);
      }
      const identified = await skillEvolution.identifyRepeatedWorkflows({ minOccurrences: 3, minConfidence: 0.6 });
      const match = identified.candidates.find(c => c.signature.includes('hash_and_list_files -> get_system_telemetry'));
      assert(Boolean(match), 'Expected repeated workflow hash_and_list_files -> get_system_telemetry');
      return { candidatesCount: identified.candidates.length, signature: match.signature, occurrences: match.occurrences, confidence: match.confidence };
    });

    await record('T23_SEQUENCE_TO_SKILL_CONVERSION', 'Workflow Learning', 'Converts validated workflow sequence into reusable draft skill safely', async () => {
      const skill = await skillEvolution.convertSequenceToSkill({
        sequence: ['hash_and_list_files', 'get_system_telemetry'],
        skill_key: 'wf_workspace_health_audit',
        name: 'Workspace Health & File Audit',
        permissions: ['list_files', 'get_system_telemetry']
      });
      learnedSkillId = skill.id;
      learnedSkillKey = skill.skill_key;
      assert(skill.status === 'DRAFT' && skill.skill_key === 'wf_workspace_health_audit', 'Unexpected drafted skill properties');
      return { skill_id: skill.id, skill_key: skill.skill_key, permissions: skill.permissions };
    });

    await record('T24_SANDBOX_BENCHMARK_AND_VALIDATION', 'Workflow Learning', 'Benchmarks workflow skill in isolated sandbox & enforces validation before deployment', async () => {
      // Confirm unvalidated deployment is blocked
      let blockedDeploy = false;
      try {
        await evolutionPipeline.submitForApproval({ skill_id: learnedSkillId });
      } catch (e) {
        blockedDeploy = e.message.includes('UNVALIDATED_SKILL');
      }
      assert(blockedDeploy, 'Unvalidated workflow skill must not submit for deployment');

      const bench = await skillEvolution.benchmarkWorkflowSkill({
        skill_id: learnedSkillId,
        pattern_signature: 'hash_and_list_files -> get_system_telemetry',
        baseline_latency_ms: 25
      });
      assert(bench.verdict === 'ACCEPTED' && bench.ready_for_deployment === true, `Expected ACCEPTED benchmark, got ${bench.verdict}`);
      const dep = await evolutionPipeline.submitForApproval({ skill_id: learnedSkillId });
      await evolutionPipeline.grantApproval(dep.deployment_id, 'commander');
      const deployed = await evolutionPipeline.deploySkill(dep.deployment_id);
      assert(deployed.deployment_status === 'DEPLOYED', 'Approved validated skill should deploy cleanly');
      return { benchmark_id: bench.benchmark_id, pass_rate: bench.pass_rate, latency_ms: bench.benchmark_latency_ms, deployed_version: deployed.version };
    });

    await record('T25_SKILL_REGRESSION_REJECTION_AND_OUTDATED_DETECTION', 'Workflow Learning', 'Blocks deployment on regression/security fail & flags outdated skills', async () => {
      const badSkill = await skillEvolution.convertSequenceToSkill({
        sequence: ['search_files', 'read_file'],
        skill_key: 'wf_regressed_probe',
        name: 'Regression Probe Skill',
        permissions: ['search_files', 'read_file']
      });
      const regBench = await skillEvolution.benchmarkWorkflowSkill({
        skill_id: badSkill.id,
        pattern_signature: 'legacy_removed_tool -> read_file',
        simulated_regression_fail: true
      });
      assert(regBench.verdict === 'REJECTED' && !regBench.ready_for_deployment, 'Regressed skill must be REJECTED');
      const outdated = await skillEvolution.detectOutdatedSkills({
        availableTools: ToolRegistry.getTools().map(t => t.name)
      });
      assert(outdated.outdated_count >= 1, 'Outdated/regressed skill should be flagged');
      return { regressedVerdict: regBench.verdict, outdatedCount: outdated.outdated_count, sampleReason: outdated.outdated_skills[0].reason };
    });

    // ------------------------------------------------------------------------
    // CATEGORY F: COMPLEX MULTI-AGENT PROJECT EXECUTION (T26 - T28)
    // ------------------------------------------------------------------------
    await record('T26_COMPLEX_INSPECT_FIX_AND_TEST_PROJECT', 'Complex Projects', 'Inspects buggy project, applies verified fix, runs tests & produces report', async () => {
      const projDir = path.join(DISPOSABLE_WORK_DIR, 't26_buggy_project');
      fs.mkdirSync(projDir, { recursive: true });
      fs.writeFileSync(path.join(projDir, 'package.json'), JSON.stringify({ name: 't26-fixture', version: '1.0.0', type: 'module', scripts: { test: 'node --test math.test.js' } }, null, 2));
      fs.writeFileSync(path.join(projDir, 'math.js'), 'export function add(a, b) { return a - b; }\n'); // Defect: subtracts!
      fs.writeFileSync(path.join(projDir, 'math.test.js'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from './math.js';\ntest('add sums two numbers', () => { assert.equal(add(2, 3), 5); });\n");

      // Step 0 sanity: ToolRegistry run_project_tests fails on buggy file
      const failRun = await ToolRegistry.executeTool('run_project_tests', { directory: projDir });
      assert(failRun.exit_code !== 0, 'Pre-fix test suite must fail');

      const reportPath = path.join(projDir, 'FIX_REPORT.md');
      const m = await mc.createMission({
        objective: `Inspect project "${projDir}", fix add(a,b) defect in math.js, run project tests, and save report to "${reportPath}"`,
        steps: [
          { step_index: 1, title: 'Read buggy math.js', agent_key: 'coding', tool: 'read_file', args: { file_path: path.join(projDir, 'math.js') }, depends_on: [] },
          { step_index: 2, title: 'Fix add(a,b) implementation', agent_key: 'coding', tool: 'write_file', args: { file_path: path.join(projDir, 'math.js'), content: 'export function add(a, b) { return a + b; }\n' }, depends_on: [1] },
          { step_index: 3, title: 'Run project test suite', agent_key: 'coding', tool: 'run_project_tests', args: { directory: projDir }, depends_on: [2] },
          { step_index: 4, title: 'Write test verification report', agent_key: 'content', tool: 'write_file', args: { file_path: reportPath, content: '{{SYNTHESIZE_FROM_DEPS}}' }, depends_on: [3] }
        ]
      });
      await mc.startMission(m.id);
      const done = await waitForMissionTerminal(mc, m.id);
      assert(done.status === 'COMPLETED', `Expected COMPLETED project repair mission, got ${done.status}: ${done.error}`);
      const testRes = done.steps.find(s => s.step_index === 3).result;
      assert(testRes.exit_code === 0 && testRes.tests_passed >= 1, 'Post-fix test run must pass');
      return { mission_id: m.id, tests_passed: testRes.tests_passed, reportBytes: fs.statSync(reportPath).size };
    });

    await record('T27_COMPLEX_ORGANIZE_AND_VERIFY_INVENTORY', 'Complex Projects', 'Organizes mixed files by extension with zero file loss & verified inventory report', async () => {
      const ws = path.join(DISPOSABLE_WORK_DIR, 't27_files');
      fs.mkdirSync(ws, { recursive: true });
      fs.writeFileSync(path.join(ws, 'note1.txt'), 'identical payload 123');
      fs.writeFileSync(path.join(ws, 'note2.txt'), 'identical payload 123');
      fs.writeFileSync(path.join(ws, 'data.json'), '{"ok":true}');
      const invReport = path.join(DISPOSABLE_WORK_DIR, 't27_inventory.md');

      const m = await mc.createMission({
        objective: `Organize files in "${ws}" by type and generate inventory with duplicate SHA-256 hashes at "${invReport}"`,
        steps: [
          { step_index: 1, title: 'Organize workspace by file type', agent_key: 'files', tool: 'organize_files_by_type', args: { directory: ws }, depends_on: [] },
          { step_index: 2, title: 'Hash organized workspace & verify inventory', agent_key: 'files', tool: 'hash_and_list_files', args: { directory: ws }, depends_on: [1] },
          { step_index: 3, title: 'Write verified inventory & duplicate report', agent_key: 'files', tool: 'write_file', args: { file_path: invReport, content: '{{SYNTHESIZE_FROM_DEPS}}' }, depends_on: [2] }
        ]
      });
      await mc.startMission(m.id);
      const done = await waitForMissionTerminal(mc, m.id);
      assert(done.status === 'COMPLETED', `Expected COMPLETED file workflow, got ${done.status}: ${done.error}`);
      const hashRes = done.steps.find(s => s.step_index === 2).result;
      assert(hashRes.count === 3 && hashRes.duplicate_groups.length === 1, `Expected 3 preserved files and 1 dup group, got count=${hashRes.count}`);
      const mdText = fs.readFileSync(invReport, 'utf8');
      assert(mdText.includes('Duplicate File Groups') && !mdText.includes('{{SYNTHESIZE_FROM_DEPS}}'), 'Inventory report must document SHA-256 duplicates');
      return { mission_id: m.id, filesPreserved: hashRes.count, duplicateGroups: hashRes.duplicate_groups.length };
    });

    await record('T28_INDEPENDENT_OBJECTIVE_VERIFICATION_GATE', 'Complex Projects', 'Refuses COMPLETED status when required deliverable is missing or contains placeholder', async () => {
      const missingPath = path.join(DISPOSABLE_WORK_DIR, 'never_created_deliverable.md');
      const placeholderPath = path.join(DISPOSABLE_WORK_DIR, 'placeholder_deliverable.md');
      fs.writeFileSync(placeholderPath, 'Draft report: {{SYNTHESIZE_FROM_DEPS}}');
      const m = await mc.createMission({
        objective: `Verify missing & placeholder rejection for "${missingPath}"`,
        steps: [{ step_index: 1, title: 'Telemetry only', agent_key: 'system', tool: 'get_system_telemetry', args: {}, depends_on: [] }],
        acceptance_contract: {
          required_deliverables: [
            { id: 'd-miss', type: 'file', target_path: missingPath, min_bytes: 20 },
            { id: 'd-ph', type: 'file', target_path: placeholderPath, min_bytes: 20 }
          ]
        }
      });
      await mc.startMission(m.id);
      const done = await waitForMissionTerminal(mc, m.id);
      assert(done.status !== 'COMPLETED', `Must NOT mark COMPLETED when deliverables missing/placeholder (got ${done.status})`);
      assert(done.verification_report && done.verification_report.passed === false, 'Verification report must fail');
      return { status: done.status, failedCount: done.verification_report.failedCount };
    });

    // ------------------------------------------------------------------------
    // CATEGORY G: HUMAN GOVERNANCE, ROLLBACK, DASHBOARD & INTEGRITY (T29 - T32)
    // ------------------------------------------------------------------------
    await record('T29_GOVERNANCE_APPROVAL_ENFORCEMENT', 'Human Governance', 'Enforces explicit human approval before sensitive, publication, financial or destructive actions', async () => {
      const m = await mc.createMission({
        objective: 'Process billing invoice payment transfer and send external report email',
        steps: [
          { step_index: 1, title: 'Execute external payment transfer trigger', agent_key: 'system', tool: 'get_system_telemetry', args: { note: 'invoice_pay financial transfer' }, depends_on: [] },
          { step_index: 2, title: 'Publish summary externally', agent_key: 'content', tool: 'save_memory', args: { key: 'pub_note_t29', value: 'publish_external_brief', category: 'governance', importance: 2 }, depends_on: [1] }
        ]
      });
      assert(m.steps.every(s => s.requires_approval === 1), 'Governance detector must flag financial & external publication steps');
      await mc.startMission(m.id);
      const paused = await waitForMissionTerminal(mc, m.id);
      assert(paused.status === 'WAITING_FOR_APPROVAL', `Expected WAITING_FOR_APPROVAL, got ${paused.status}`);
      await mc.approveStep(m.id, paused.steps[0].id);
      const step2Gate = await waitForMissionTerminal(mc, m.id);
      assert(step2Gate.status === 'WAITING_FOR_APPROVAL', 'Step 2 should also require explicit approval');
      await mc.approveStep(m.id, paused.steps[1].id);
      const done = await waitForMissionTerminal(mc, m.id);
      assert(done.status === 'COMPLETED', `Expected COMPLETED after dual approvals, got ${done.status}`);
      return { mission_id: m.id, finalStatus: done.status };
    });

    await record('T30_WORKFLOW_ROLLBACK_AND_PROVENANCE', 'Human Governance', 'Captures complete workflow provenance & safely rolls back newly created files', async () => {
      const targetFile = path.join(DISPOSABLE_WORK_DIR, 't30_rollback_target.txt');
      const m = await mc.createMission({
        objective: `Create reversible artifact at "${targetFile}" for rollback test`,
        steps: [
          { step_index: 1, title: 'Create reversible deliverable', agent_key: 'files', tool: 'write_file', args: { file_path: targetFile, content: 'Temporary reversible artifact generated for rollback validation.' }, depends_on: [] }
        ]
      });
      rollbackMissionId = m.id;
      await mc.startMission(m.id);
      const done = await waitForMissionTerminal(mc, m.id);
      assert(done.status === 'COMPLETED' && fs.existsSync(targetFile), 'File must exist prior to rollback');

      const prov = await mc.getWorkflowProvenance(m.id);
      assert(prov.checkpoints.length >= 1 && prov.execution_logs.length >= 1 && prov.coordination_events.length >= 1 && prov.rollback_eligible, 'Provenance incomplete');

      const rb = await mc.rollbackMission(m.id, 'Verify clean reversible file removal');
      assert(rb.success && rb.rolled_back_count === 1 && !fs.existsSync(targetFile), 'Rollback must delete newly created artifact');
      return { checkpoints: prov.checkpoints.length, logs: prov.execution_logs.length, rolled_back_count: rb.rolled_back_count };
    });

    await record('T31_HTTP_ROUTES_AND_DASHBOARD_SUMMARY', 'Dashboard & API', 'Workflow Intelligence dashboard & provenance REST endpoints return complete live state', async () => {
      const app = express();
      app.use(express.json());
      app.use('/api/missions', missionsRoutes);
      app.use('/api/agents', agentsRoutes);
      app.use('/api/evolution', evolutionRoutes);
      server = http.createServer(app);
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const base = `http://127.0.0.1:${server.address().port}`;

      const [dashRes, provRes, agentsRes, logsRes, patRes, outRes] = await Promise.all([
        axios.get(`${base}/api/missions/dashboard/summary`),
        axios.get(`${base}/api/missions/${crashRecoverMissionId}/provenance`),
        axios.get(`${base}/api/agents`),
        axios.get(`${base}/api/agents/logs/all`),
        axios.get(`${base}/api/evolution/workflows/patterns`, { params: { minOccurrences: 2, minConfidence: 0.5 } }),
        axios.get(`${base}/api/evolution/workflows/outdated`)
      ]);

      const d = dashRes.data?.dashboard;
      assert(dashRes.data.success && d && Array.isArray(d.workflows) && d.specialist_agents.length === 6, 'Dashboard summary incomplete');
      assert(d.worker_utilization && d.recovery_events.length >= 1 && d.verification_results.length >= 1 && d.skill_benchmarks.length >= 1, 'Missing dashboard telemetry sections');
      assert(provRes.data.success && provRes.data.provenance.mission_id === crashRecoverMissionId, 'Provenance route failed');
      assert(agentsRes.data.agents.length === 6 && logsRes.data.logs.length >= 1, 'Agents/logs route failed');
      assert(patRes.data.success && outRes.data.success, 'Evolution workflow routes failed');
      return {
        workflows: d.workflows.length,
        recoveryEvents: d.recovery_events.length,
        verifications: d.verification_results.length,
        benchmarks: d.skill_benchmarks.length,
        patterns: patRes.data.candidates.length
      };
    });

    await record('T32_ZERO_CLOUD_AND_PROD_DB_INTACT', 'Security & Integrity', 'Zero cloud LLM network hits & byte-for-byte intact production database', async () => {
      const cloudHits = netMon.reqs.filter(r => CLOUD_LLM_HOSTS.some(h => r.host.includes(h)));
      const prodHashAfter = sha256File(PROD_DB_PATH);
      assert(cloudHits.length === 0, `Cloud LLM endpoints contacted: ${JSON.stringify(cloudHits)}`);
      assert(prodHashAfter === prodHashBefore, `Production DB hash mutated: ${prodHashBefore} != ${prodHashAfter}`);
      return {
        totalHttpReqs: netMon.reqs.length,
        cloudHits: 0,
        prodDbPreserved: true,
        prodDbSha256: prodHashAfter
      };
    });

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const summary = {
      suite: 'PHASE_18_AUTONOMOUS_WORKFLOW_ECOSYSTEM',
      timestamp: new Date().toISOString(),
      model: process.env.OLLAMA_MODEL,
      endpoint: process.env.OLLAMA_ENDPOINT,
      total_tests: results.length,
      passed,
      failed,
      pass_rate_percent: Number(((passed / results.length) * 100).toFixed(2)),
      prod_db_preserved: prodHashBefore === sha256File(PROD_DB_PATH),
      prod_db_sha256: sha256File(PROD_DB_PATH)
    };

    fs.mkdirSync(DELIVERABLES_DIR, { recursive: true });
    const jsonPath = path.join(DELIVERABLES_DIR, 'PHASE_18_TEST_RESULTS.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ summary, results }, null, 2));

    console.log('================================================================================');
    console.log(`PHASE 18 RESULTS: ${passed}/${results.length} PASS (${summary.pass_rate_percent}%) | Prod DB Preserved=${summary.prod_db_preserved}`);
    console.log(`Saved: ${jsonPath}`);
    console.log('================================================================================');
    if (failed > 0) process.exitCode = 1;
  } finally {
    netMon.restore();
    if (server) server.close();
    if (pyAgentChild) try { pyAgentChild.kill(); } catch (_) {}
    if (ollamaChild) try { ollamaChild.kill(); } catch (_) {}
  }
}

main().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
