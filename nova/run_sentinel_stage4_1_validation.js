/**
 * JARVIS OS 2.0 — SENTINEL STAGE 4.1 VALIDATION & ADVERSARIAL SUITE (22 TESTS)
 *
 * Strictly validates:
 * - P0: Zero false completions, independent acceptance contract enforcement, legacy heuristic ban
 * - P1: Provider unavailability, timeout -> FAILED_RETRYABLE, resource exhaustion, outage recovery
 * - P2: Structured acceptance contract schema & verification reports persisted on missions
 * - P3: Adversarial 6-objective stress matrix (OBJ-04, 05, 06, 14, 15, 17)
 * - P4: Real Windows desktop verification distinguishing process creation vs visible window vs opened document
 * - Zero-cost local-only policy (qwen3.5:4b on 127.0.0.1:11434) & untouched production DB
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { spawn, spawnSync } from 'child_process';

const ROOT_DIR = path.resolve('.');
const DELIVERABLES_DIR = path.resolve('nova/deliverables');
const DISPOSABLE_ROOT = path.resolve('nova/data/sentinel_disposable_test/stage4_1_isolated');
const WORKSPACE_DIR = path.resolve('nova/data/sentinel_disposable_test/stage4_1_workspace');
const ISOLATED_DB_PATH = path.join(DISPOSABLE_ROOT, 'stage4_1.sqlite');
const ISOLATED_SENTINEL_DIR = path.join(DISPOSABLE_ROOT, 'sentinel_deliverables');
const PROD_DB_PATH = path.resolve('nova/data/nova.sqlite');
const OLLAMA_EXE = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe');

for (const envPath of [path.resolve('nova/backend/.env'), path.resolve('nova/.env')]) {
  if (fs.existsSync(envPath)) {
    const parsed = dotenv.parse(fs.readFileSync(envPath));
    for (const [k, v] of Object.entries(parsed)) {
      if (v && (!process.env[k] || process.env[k].trim() === '')) {
        process.env[k] = v;
      }
    }
  }
}

process.env.NOVA_DB_PATH = ISOLATED_DB_PATH;
process.env.SENTINEL_DELIVERABLES_DIR = ISOLATED_SENTINEL_DIR;
process.env.SENTINEL_STAGE_NAME = 'STAGE_4_1_VALIDATION';
process.env.PYTHON_AGENT_URL = 'http://127.0.0.1:8000';
process.env.ZERO_COST_LOCAL_ONLY = 'true';
process.env.OLLAMA_ENDPOINT = 'http://127.0.0.1:11434';
process.env.OLLAMA_MODEL = 'qwen3.5:4b';
process.env.OLLAMA_NO_CLOUD = '1';
process.env.OLLAMA_MAX_LOADED_MODELS = '1';
process.env.LOCAL_INFERENCE_TIMEOUT_MS = '300000';

function sha256File(p) {
  if (!fs.existsSync(p)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function wp(rel) {
  return path.join(WORKSPACE_DIR, rel).replace(/\\/g, '/');
}

function killPidForce(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch (_) {}
}

async function httpGetJson(url, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('HTTP timeout')));
  });
}

async function waitForHttp(url, timeoutMs = 30000, pred = null) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = 'none';
  while (Date.now() < deadline) {
    try {
      const { status, body } = await httpGetJson(url, 2500);
      if (status >= 200 && status < 300 && (!pred || pred(body))) return body;
      lastErr = `http_${status}`;
    } catch (e) {
      lastErr = e.message;
    }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`Timeout waiting for ${url} (${lastErr})`);
}

function installNetworkSpy() {
  const log = [];
  const origHttpReq = http.request;
  const origHttpsReq = https.request;
  const extractTarget = (args, proto) => {
    const a0 = args[0];
    if (typeof a0 === 'string') {
      try {
        const u = new URL(a0);
        return { proto: u.protocol, host: u.hostname, port: u.port, path: u.pathname };
      } catch {
        return { proto, host: a0, port: '', path: '' };
      }
    }
    if (a0 && typeof a0 === 'object') {
      return { proto, host: a0.hostname || a0.host || 'unknown', port: a0.port || '', path: a0.path || '' };
    }
    return { proto, host: 'unknown', port: '', path: '' };
  };
  http.request = function (...args) {
    log.push({ ts: Date.now(), ...extractTarget(args, 'http:') });
    return origHttpReq.apply(this, args);
  };
  https.request = function (...args) {
    log.push({ ts: Date.now(), ...extractTarget(args, 'https:') });
    return origHttpsReq.apply(this, args);
  };
  return {
    getLog: () => [...log],
    restore: () => {
      http.request = origHttpReq;
      https.request = origHttpsReq;
    }
  };
}

function prepareWorkspace() {
  if (fs.existsSync(WORKSPACE_DIR)) fs.rmSync(WORKSPACE_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(WORKSPACE_DIR, 'unfamiliar_project', 'src'), { recursive: true });
  fs.mkdirSync(path.join(WORKSPACE_DIR, 'unfamiliar_project', 'docs'), { recursive: true });
  fs.mkdirSync(path.join(WORKSPACE_DIR, 'docs_corpus'), { recursive: true });
  fs.mkdirSync(path.join(WORKSPACE_DIR, 'buggy_repo'), { recursive: true });
  fs.mkdirSync(path.join(WORKSPACE_DIR, 'rename_lab'), { recursive: true });
  fs.mkdirSync(path.join(WORKSPACE_DIR, 'reports'), { recursive: true });

  // OBJ-04 corpus
  fs.writeFileSync(path.join(WORKSPACE_DIR, 'docs_corpus', 'rfc_cache_notes.txt'),
    'RFC Cache Notes: L1 TTL is capped at 120 seconds; eviction uses LRU-K2; hit ratio benchmark reached 94.2%.');
  fs.writeFileSync(path.join(WORKSPACE_DIR, 'docs_corpus', 'storage_bench.md'),
    '# Storage Benchmark\nNVMe WAL throughput measured at 18,400 writes/sec with synchronous=NORMAL and p99 latency of 1.8ms.');
  fs.writeFileSync(path.join(WORKSPACE_DIR, 'docs_corpus', 'incident_postmortem.txt'),
    'Incident PM-404: Root cause was missing idempotency key on retry worker, fixed by transactional outbox deduplication.');

  // OBJ-05 unfamiliar codebase
  fs.writeFileSync(path.join(WORKSPACE_DIR, 'unfamiliar_project', 'package.json'), JSON.stringify({
    name: 'ledger-engine-demo',
    version: '1.2.0',
    type: 'module',
    description: 'Isolated micro-ledger engine for Stage 4.1 architectural inspection'
  }, null, 2));
  fs.writeFileSync(path.join(WORKSPACE_DIR, 'unfamiliar_project', 'README.md'),
    '# Ledger Engine Demo\nModular ledger calculation and validation service.\nModules: calculator.js, formatter.js, validator.js.\n');
  fs.writeFileSync(path.join(WORKSPACE_DIR, 'unfamiliar_project', 'src', 'calculator.js'),
    'export function computeNetBalance(entries = []) {\n  return entries.reduce((sum, e) => sum + (e.type === "CREDIT" ? e.amount : -e.amount), 0);\n}\nexport function computeFee(amount, rate = 0.025) {\n  return Number((amount * rate).toFixed(2));\n}\n');
  fs.writeFileSync(path.join(WORKSPACE_DIR, 'unfamiliar_project', 'src', 'validator.js'),
    'export function isValidEntry(entry) {\n  return Boolean(entry && typeof entry.amount === "number" && entry.amount >= 0 && ["CREDIT", "DEBIT"].includes(entry.type));\n}\n');
  fs.writeFileSync(path.join(WORKSPACE_DIR, 'unfamiliar_project', 'src', 'formatter.js'),
    'export function formatCurrency(val, currency = "USD") {\n  return `${currency} ${Number(val).toFixed(2)}`;\n}\n');
  fs.writeFileSync(path.join(WORKSPACE_DIR, 'unfamiliar_project', 'docs', 'notes.txt'),
    'Architecture note: All entries must pass validator.isValidEntry before ledger posting.\n');

  // OBJ-06 buggy repo
  fs.writeFileSync(path.join(WORKSPACE_DIR, 'buggy_repo', 'package.json'), JSON.stringify({
    name: 'buggy-invoice-demo',
    version: '1.0.0',
    type: 'module',
    scripts: { test: 'node --test' }
  }, null, 2));
  fs.writeFileSync(path.join(WORKSPACE_DIR, 'buggy_repo', 'invoice.js'),
    'export function calculateInvoiceTotal(subtotal, discountRate = 0.1, taxRate = 0.1) {\n  const afterDiscount = subtotal - discountRate; // BUG: flat subtraction instead of subtotal * (1 - discountRate)\n  return Number((afterDiscount * (1 + taxRate)).toFixed(2));\n}\n');
  fs.writeFileSync(path.join(WORKSPACE_DIR, 'buggy_repo', 'invoice.test.js'),
    'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { calculateInvoiceTotal } from "./invoice.js";\ntest("10% discount then 10% tax on 100 equals 99", () => {\n  assert.equal(calculateInvoiceTotal(100, 0.1, 0.1), 99);\n});\n');

  // Approval gate rename test asset
  fs.writeFileSync(path.join(WORKSPACE_DIR, 'rename_lab', 'draft_contract.txt'), 'SENTINEL_STAGE41_APPROVAL_ASSET');
}

const CLOUD_LLM_HOSTS = ['api.groq.com', 'generativelanguage.googleapis.com', 'api.mistral.ai', 'openrouter.ai', 'api.openai.com', 'api.anthropic.com'];

async function main() {
  console.log('='.repeat(80));
  console.log('JARVIS OS 2.0 — SENTINEL STAGE 4.1 AUTONOMY INTEGRITY VALIDATION (22 TESTS)');
  console.log('Isolated DB:', ISOLATED_DB_PATH);
  console.log('Workspace:', WORKSPACE_DIR);
  console.log('='.repeat(80));

  const prodDbHashBefore = sha256File(PROD_DB_PATH);
  if (fs.existsSync(DISPOSABLE_ROOT)) fs.rmSync(DISPOSABLE_ROOT, { recursive: true, force: true });
  fs.mkdirSync(ISOLATED_SENTINEL_DIR, { recursive: true });
  fs.mkdirSync(DELIVERABLES_DIR, { recursive: true });
  prepareWorkspace();

  let pyAgentProc = null;
  let ollamaProc = null;
  let keepAwakeProc = null;
  let startedOllamaByScript = false;
  let startedPyByScript = false;
  const launchedPidsToCleanup = new Set();
  const spy = installNetworkSpy();

  try {
    // Assert process-scoped Win32 ES_CONTINUOUS | ES_SYSTEM_REQUIRED so unattended 15m CPU inference never hits OS sleep
    if (process.platform === 'win32') {
      try {
        keepAwakeProc = spawn('python', ['-c', 'import ctypes,time; ctypes.windll.kernel32.SetThreadExecutionState(0x80000001)\nwhile True: time.sleep(30)'], { stdio: 'ignore' });
      } catch (_) {}
    }
    // Ensure Ollama daemon is online locally (zero-cost)
    let ollamaUp = false;
    try {
      await waitForHttp('http://127.0.0.1:11434/api/tags', 1500, d => Array.isArray(d.models));
      ollamaUp = true;
    } catch (_) {}
    if (!ollamaUp) {
      ollamaProc = spawn(OLLAMA_EXE, ['serve'], {
        detached: false,
        stdio: 'ignore',
        env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_MAX_LOADED_MODELS: '1', OLLAMA_NO_CLOUD: '1' }
      });
      startedOllamaByScript = true;
      await waitForHttp('http://127.0.0.1:11434/api/tags', 30000, d => Array.isArray(d.models));
    }

    // Ensure Python local automation agent is online at 127.0.0.1:8000
    let pyUp = false;
    try {
      await waitForHttp('http://127.0.0.1:8000/health', 1200, d => d.status === 'online');
      pyUp = true;
    } catch (_) {}
    if (!pyUp) {
      const pyLog = fs.createWriteStream(path.join(ISOLATED_SENTINEL_DIR, 'python_agent.log'), { flags: 'a' });
      pyAgentProc = spawn('python', ['nova/python-agent/agent.py'], {
        cwd: ROOT_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env }
      });
      pyAgentProc.stdout.pipe(pyLog);
      pyAgentProc.stderr.pipe(pyLog);
      startedPyByScript = true;
      await waitForHttp('http://127.0.0.1:8000/health', 25000, d => d.status === 'online');
    }

    const { initDatabase, run, get, query } = await import('./backend/database/db.js');
    await initDatabase();
    const { initMissionControl, MISSION_STATUSES, STEP_STATUSES } = await import('./backend/services/missionControlService.js');
    const { TaskPlannerService } = await import('./backend/services/taskPlannerService.js');
    const TruthfulVerificationService = (await import('./backend/services/truthfulVerificationService.js')).default;
    const { ModelRouterService } = await import('./backend/services/modelRouterService.js');
    const { getProvider } = await import('./backend/services/providers/index.js');
    const ToolRegistry = (await import('./backend/tools/registry.js')).default;
    const WebSearchService = (await import('./backend/services/webSearchService.js')).default;

    const missionControl = initMissionControl(null);
    const taskPlanner = new TaskPlannerService(null);
    const ollama = getProvider('ollama');

    // Disable background auto-scheduler interference & ensure clean local settings
    await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ollama_endpoint', 'http://127.0.0.1:11434', ?)", [new Date().toISOString()]);
    await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ollama_model', 'qwen3.5:4b', ?)", [new Date().toISOString()]);

    // Pre-warm qwen3.5:4b into memory so T01 measures steady local inference rather than cold binary load
    await ollama.chatCompletion({
      systemPrompt: 'Respond Ready.',
      messages: [{ role: 'user', content: 'Ready?' }],
      maxTokens: 8,
      timeoutMs: 90000
    });

    const results = [];
    let currentActiveMissionId = null;
    async function runTest(id, category, objectiveId, name, fn, timeoutMs = 480000) {
      const t0 = Date.now();
      const memBeforeMB = parseFloat((os.freemem() / (1024 ** 2)).toFixed(1));
      console.log(`[START] ${id} — ${name}`);
      currentActiveMissionId = null;
      try {
        const out = await Promise.race([
          fn(),
          new Promise((_, rej) => setTimeout(() => rej(new Error(`TEST_TIMEOUT_${timeoutMs}ms`)), timeoutMs))
        ]);
        const entry = {
          id,
          category,
          objective_id: objectiveId,
          name,
          status: out.passed ? 'PASS' : 'FAIL',
          duration_ms: Date.now() - t0,
          free_ram_mb_before: memBeforeMB,
          free_ram_mb_after: parseFloat((os.freemem() / (1024 ** 2)).toFixed(1)),
          metrics: out.metrics || {},
          evidence: out.evidence || {},
          failure_reason: out.passed ? null : (out.failure_reason || 'Assertion failed')
        };
        results.push(entry);
        console.log(`[${entry.status}] ${id} (${entry.duration_ms}ms) — ${name}${entry.failure_reason ? ' | ' + entry.failure_reason : ''}`);
        return entry;
      } catch (err) {
        if (currentActiveMissionId) {
          try { await missionControl.cancelMission(currentActiveMissionId); } catch (_) {}
        }
        const entry = {
          id,
          category,
          objective_id: objectiveId,
          name,
          status: 'FAIL',
          duration_ms: Date.now() - t0,
          free_ram_mb_before: memBeforeMB,
          free_ram_mb_after: parseFloat((os.freemem() / (1024 ** 2)).toFixed(1)),
          metrics: {},
          evidence: {},
          failure_reason: err.message
        };
        results.push(entry);
        console.log(`[FAIL] ${id} (${entry.duration_ms}ms) — ${name} | ${err.message}`);
        return entry;
      }
    }

    async function waitForMission(missionId, timeoutMs = 440000) {
      currentActiveMissionId = missionId;
      const deadline = Date.now() + timeoutMs;
      const terminal = new Set([
        'COMPLETED', 'FAILED', 'FAILED_RETRYABLE', 'PARTIALLY_VERIFIED',
        'WAITING_FOR_APPROVAL', 'CANCELLED', 'PAUSED',
        'BLOCKED_PROVIDER_UNAVAILABLE', 'BLOCKED_LOCAL_MODEL_UNAVAILABLE'
      ]);
      while (Date.now() < deadline) {
        const m = await missionControl.getMission(missionId);
        if (m && terminal.has(m.status)) return m;
        await new Promise(r => setTimeout(r, 300));
      }
      return missionControl.getMission(missionId);
    }

    // -------------------------------------------------------------------------
    // PART 1: P3 NORMAL OPERATION ACROSS THE 6 STAGE 4 FALSE-COMPLETION CASES
    // -------------------------------------------------------------------------

    await runTest('T01_OBJ04_NORMAL_CORPUS_SUMMARY', 'P3.1 Normal Operation', 'OBJ-04', 'OBJ-04 document corpus summary executes, verifies deliverables + contract -> COMPLETED', async () => {
      const outPath = wp('reports/obj04_summary.md');
      const goal = `Read and summarize all documents inside '${wp('docs_corpus')}' and preserve source filenames at '${outPath}'.`;
      const created = await missionControl.createMission(goal);
      if (created.status !== 'PENDING') return { passed: false, failure_reason: `Expected PENDING plan, got ${created.status}: ${created.error}` };
      await missionControl.startMission(created.id);
      const done = await waitForMission(created.id, 440000);
      const exists = fs.existsSync(outPath);
      const txt = exists ? fs.readFileSync(outPath, 'utf-8') : '';
      const citesAll = txt.includes('rfc_cache_notes.txt') && txt.includes('storage_bench.md') && txt.includes('incident_postmortem.txt');
      const hasFacts = txt.includes('94.2') && txt.includes('18,400');
      const contractOk = Boolean(done.acceptance_contract && done.verification_report?.passed);
      return {
        passed: done.status === 'COMPLETED' && exists && citesAll && hasFacts && contractOk,
        metrics: { status: done.status, bytes: exists ? fs.statSync(outPath).size : 0 },
        evidence: { sha256: sha256File(outPath), citesAll, hasFacts, contractPassed: done.verification_report?.passed },
        failure_reason: done.status !== 'COMPLETED' ? `Status=${done.status}: ${done.error}` : (!citesAll || !hasFacts ? 'Missing source refs/facts' : null)
      };
    });

    await runTest('T02_OBJ05_NORMAL_ARCH_ANALYSIS', 'P3.1 Normal Operation', 'OBJ-05', 'OBJ-05 architecture analysis inspects actual codebase -> COMPLETED', async () => {
      const outPath = wp('reports/obj05_architecture.md');
      const goal = `Inspect the unfamiliar codebase in '${wp('unfamiliar_project')}' and write an architecture analysis to '${outPath}'.`;
      const created = await missionControl.createMission(goal);
      if (created.status !== 'PENDING') return { passed: false, failure_reason: `Plan failed: ${created.status} ${created.error}` };
      await missionControl.startMission(created.id);
      const done = await waitForMission(created.id, 440000);
      const exists = fs.existsSync(outPath);
      const txt = exists ? fs.readFileSync(outPath, 'utf-8') : '';
      const hasSymbols = txt.includes('computeNetBalance') && txt.includes('isValidEntry') && txt.includes('formatCurrency');
      const noCanned = !done.steps.some(s => s.tool === 'code_repository_analyzer');
      return {
        passed: done.status === 'COMPLETED' && exists && hasSymbols && noCanned && Boolean(done.verification_report?.passed),
        metrics: { status: done.status, bytes: exists ? fs.statSync(outPath).size : 0 },
        evidence: { sha256: sha256File(outPath), hasSymbols, noCanned },
        failure_reason: done.status !== 'COMPLETED' ? `Status=${done.status}: ${done.error}` : (!hasSymbols ? 'Missing real symbols' : null)
      };
    });

    await runTest('T03_OBJ06_NORMAL_BUG_REPORT', 'P3.1 Normal Operation', 'OBJ-06', 'OBJ-06 reproducible bug discovery -> COMPLETED', async () => {
      const outPath = wp('reports/obj06_bug_report.md');
      const goal = `Inspect the disposable test project in '${wp('buggy_repo')}', find the reproducible bug in its invoice calculation code, and propose a fix in '${outPath}'.`;
      const created = await missionControl.createMission(goal);
      if (created.status !== 'PENDING') return { passed: false, failure_reason: `Plan failed: ${created.status} ${created.error}` };
      await missionControl.startMission(created.id);
      const done = await waitForMission(created.id, 440000);
      const exists = fs.existsSync(outPath);
      const txt = exists ? fs.readFileSync(outPath, 'utf-8') : '';
      const identifiedBug = txt.includes('calculateInvoiceTotal') && /1\s*-\s*discountRate|percentage|flat/i.test(txt);
      return {
        passed: done.status === 'COMPLETED' && exists && identifiedBug && Boolean(done.verification_report?.passed),
        metrics: { status: done.status, bytes: exists ? fs.statSync(outPath).size : 0 },
        evidence: { sha256: sha256File(outPath), identifiedBug },
        failure_reason: done.status !== 'COMPLETED' ? `Status=${done.status}: ${done.error}` : (!identifiedBug ? 'Bug not identified' : null)
      };
    });

    await runTest('T04_OBJ14_NORMAL_WASI_DOCKER', 'P3.1 Normal Operation', 'OBJ-14', 'OBJ-14 WASI vs Docker comparison uses external search + preserves uncertainty -> COMPLETED', async () => {
      const outPath = wp('reports/obj14_comparison.md');
      const goal = `Research conflicting benchmarks comparing WebAssembly WASI 0.2 vs Docker container cold-start latency, preserve uncertainty, and write the comparison to '${outPath}'.`;
      const created = await missionControl.createMission(goal);
      if (created.status !== 'PENDING') return { passed: false, failure_reason: `Plan failed: ${created.status} ${created.error}` };
      await missionControl.startMission(created.id);
      const done = await waitForMission(created.id, 440000);
      const exists = fs.existsSync(outPath);
      const txt = exists ? fs.readFileSync(outPath, 'utf-8') : '';
      const hasUrls = /https?:\/\/[^\s)]+/.test(txt);
      const preservesUncertainty = /uncertain|conflict|vary|depends|differ/i.test(txt);
      return {
        passed: done.status === 'COMPLETED' && exists && hasUrls && preservesUncertainty && Boolean(done.verification_report?.passed),
        metrics: { status: done.status, bytes: exists ? fs.statSync(outPath).size : 0 },
        evidence: { sha256: sha256File(outPath), hasUrls, preservesUncertainty },
        failure_reason: done.status !== 'COMPLETED' ? `Status=${done.status}: ${done.error}` : null
      };
    });

    await runTest('T05_OBJ15_NORMAL_FIDO2_REPORT', 'P3.1 Normal Operation', 'OBJ-15', 'OBJ-15 FIDO2 WebAuthn research report cites traceable URLs -> COMPLETED', async () => {
      const outPath = wp('reports/obj15_research.md');
      const goal = `Research FIDO2 WebAuthn passkey authentication architecture and create a cited report with traceable source URLs at '${outPath}'.`;
      const created = await missionControl.createMission(goal);
      if (created.status !== 'PENDING') return { passed: false, failure_reason: `Plan failed: ${created.status} ${created.error}` };
      await missionControl.startMission(created.id);
      const done = await waitForMission(created.id, 440000);
      const exists = fs.existsSync(outPath);
      const txt = exists ? fs.readFileSync(outPath, 'utf-8') : '';
      const urls = (txt.match(/https?:\/\/[^\s)\]]+/g) || []).filter(u => !u.includes('duckduckgo.com/?q='));
      return {
        passed: done.status === 'COMPLETED' && exists && urls.length > 0 && Boolean(done.verification_report?.passed),
        metrics: { status: done.status, urlCount: urls.length },
        evidence: { sha256: sha256File(outPath), sampleUrls: urls.slice(0, 3) },
        failure_reason: done.status !== 'COMPLETED' ? `Status=${done.status}: ${done.error}` : null
      };
    });

    await runTest('T06_OBJ17_NORMAL_QUIC_MULTISTEP', 'P3.1 Normal Operation', 'OBJ-17', 'OBJ-17 HTTP/3 QUIC multi-step research brief + memory -> COMPLETED', async () => {
      const outPath = wp('reports/obj17_brief.md');
      const goal = `Complete a multi-step project: research HTTP/3 QUIC 0-RTT handshake behavior, write a summary brief to '${outPath}', and record a memory note summarizing the deliverable.`;
      const created = await missionControl.createMission(goal);
      if (created.status !== 'PENDING') return { passed: false, failure_reason: `Plan failed: ${created.status} ${created.error}` };
      await missionControl.startMission(created.id);
      const done = await waitForMission(created.id, 440000);
      const exists = fs.existsSync(outPath);
      const txt = exists ? fs.readFileSync(outPath, 'utf-8') : '';
      const memRows = await query("SELECT key, value FROM memories WHERE value LIKE '%QUIC%' OR value LIKE '%HTTP/3%' OR value LIKE '%0-RTT%' OR key LIKE '%QUIC%' OR key LIKE '%HTTP%'");
      const hasTopic = /QUIC|0-RTT|HTTP\/3/i.test(txt);
      return {
        passed: done.status === 'COMPLETED' && exists && hasTopic && memRows.length > 0 && Boolean(done.verification_report?.passed),
        metrics: { status: done.status, memoryCount: memRows.length },
        evidence: { sha256: sha256File(outPath), hasTopic },
        failure_reason: done.status !== 'COMPLETED' ? `Status=${done.status}: ${done.error}` : null
      };
    });

    // -------------------------------------------------------------------------
    // PART 2: P3 ADVERSARIAL FAULT MATRIX (MODES 2 .. 6)
    // -------------------------------------------------------------------------
    let recoverableMissionIds = [];

    await runTest('T07_FAULT_MODEL_MISSING_OBJ04', 'P3.2 Model Unavailable', 'OBJ-04', 'Missing Ollama model blocks OBJ-04 as BLOCKED_LOCAL_MODEL_UNAVAILABLE with checkpoint (no heuristic)', async () => {
      const outPath = wp('reports/obj04_fault_recover.md');
      await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ollama_model', 'qwen3.5:999b-missing-stage41', ?)", [new Date().toISOString()]);
      let m;
      try {
        m = await missionControl.createMission(`Read and summarize all documents inside '${wp('docs_corpus')}' and preserve source filenames at '${outPath}'.`);
      } finally {
        await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ollama_model', 'qwen3.5:4b', ?)", [new Date().toISOString()]);
      }
      if (m?.id) recoverableMissionIds.push({ id: m.id, outPath });
      return {
        passed: m.status === 'BLOCKED_LOCAL_MODEL_UNAVAILABLE' && m.blocked === true && Boolean(m.checkpoint_state) && m.steps.length === 0 && !fs.existsSync(outPath),
        metrics: { status: m.status, failure_class: m.failure_class },
        evidence: { checkpoint_state: m.checkpoint_state },
        failure_reason: m.status !== 'BLOCKED_LOCAL_MODEL_UNAVAILABLE' ? `Unexpected status ${m.status}` : null
      };
    });

    await runTest('T08_FAULT_PROVIDER_DOWN_OBJ05', 'P3.2 Provider Unavailable', 'OBJ-05', 'Unreachable Ollama daemon blocks OBJ-05 as BLOCKED_PROVIDER_UNAVAILABLE with checkpoint', async () => {
      const outPath = wp('reports/obj05_fault_recover.md');
      await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ollama_endpoint', 'http://127.0.0.1:59997', ?)", [new Date().toISOString()]);
      let m;
      try {
        m = await missionControl.createMission(`Inspect the unfamiliar codebase in '${wp('unfamiliar_project')}' and write an architecture analysis to '${outPath}'.`);
      } finally {
        await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ollama_endpoint', 'http://127.0.0.1:11434', ?)", [new Date().toISOString()]);
      }
      if (m?.id) recoverableMissionIds.push({ id: m.id, outPath });
      return {
        passed: m.status === 'BLOCKED_PROVIDER_UNAVAILABLE' && m.blocked === true && m.failure_class === 'PROVIDER_UNAVAILABLE' && Boolean(m.checkpoint_state) && !fs.existsSync(outPath),
        metrics: { status: m.status, failure_class: m.failure_class },
        evidence: { checkpoint_state: m.checkpoint_state },
        failure_reason: m.status !== 'BLOCKED_PROVIDER_UNAVAILABLE' ? `Unexpected status ${m.status}` : null
      };
    });

    await runTest('T09_FAULT_TIMEOUT_OBJ06', 'P3.3 Ollama Timeout', 'OBJ-06', 'Ollama inference timeout parks OBJ-06 in FAILED_RETRYABLE with checkpoint preserved (no false completion)', async () => {
      const outPath = wp('reports/obj06_timeout_recover.md');
      // Create a tarpit server returning HTTP /api/tags fast (passes health gate) but timing out /api/chat
      const tarpitServer = http.createServer((req, res) => {
        if (req.url === '/api/tags') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ models: [{ name: 'qwen3.5:4b', model: 'qwen3.5:4b' }] }));
          return;
        }
        if (req.url === '/api/ps') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ models: [] }));
          return;
        }
        // Delay /api/chat intentionally past timeout
        setTimeout(() => {
          try { res.writeHead(504); res.end('timeout'); } catch (_) {}
        }, 4000);
      });
      await new Promise(resolve => tarpitServer.listen(0, '127.0.0.1', resolve));
      const port = tarpitServer.address().port;
      const origTimeoutEnv = process.env.LOCAL_INFERENCE_TIMEOUT_MS;
      process.env.LOCAL_INFERENCE_TIMEOUT_MS = '450';
      await run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (\'ollama_endpoint\', ?, ?)', [`http://127.0.0.1:${port}`, new Date().toISOString()]);

      let m;
      try {
        m = await missionControl.createMission(`Inspect the disposable test project in '${wp('buggy_repo')}', find the reproducible bug in its invoice calculation code, and propose a fix in '${outPath}'.`);
      } finally {
        if (origTimeoutEnv === undefined) delete process.env.LOCAL_INFERENCE_TIMEOUT_MS;
        else process.env.LOCAL_INFERENCE_TIMEOUT_MS = origTimeoutEnv;
        await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ollama_endpoint', 'http://127.0.0.1:11434', ?)", [new Date().toISOString()]);
        tarpitServer.close();
      }
      if (m?.id) recoverableMissionIds.push({ id: m.id, outPath, retryable: true });
      return {
        passed: m.status === 'FAILED_RETRYABLE' && m.failure_class === 'TIMEOUT' && Boolean(m.checkpoint_state) && !fs.existsSync(outPath),
        metrics: { status: m.status, failure_class: m.failure_class },
        evidence: { error: m.error, checkpoint_state: m.checkpoint_state },
        failure_reason: m.status !== 'FAILED_RETRYABLE' ? `Expected FAILED_RETRYABLE, got ${m.status} (class=${m.failure_class}, err=${m.error})` : null
      };
    });

    await runTest('T10_FAULT_RESOURCE_EXHAUSTION_OBJ14', 'P3.4 Insufficient Resources', 'OBJ-14', 'Insufficient RAM guard blocks OBJ-14 as BLOCKED_PROVIDER_UNAVAILABLE (RESOURCE_EXHAUSTED)', async () => {
      const outPath = wp('reports/obj14_oom.md');
      process.env.MIN_REQUIRED_FREE_RAM_GB = '999';
      let m;
      try {
        m = await missionControl.createMission(`Research conflicting benchmarks comparing WebAssembly WASI 0.2 vs Docker container cold-start latency, preserve uncertainty, and write the comparison to '${outPath}'.`);
      } finally {
        delete process.env.MIN_REQUIRED_FREE_RAM_GB;
      }
      const passed = m.status === 'BLOCKED_PROVIDER_UNAVAILABLE' && m.failure_class === 'RESOURCE_EXHAUSTED' && m.blocked === true && !fs.existsSync(outPath);
      if (m?.id) await run('DELETE FROM missions WHERE id = ?', [m.id]);
      return {
        passed,
        metrics: { status: m.status, failure_class: m.failure_class },
        evidence: { error: m.error },
        failure_reason: !passed ? `Expected BLOCKED_PROVIDER_UNAVAILABLE/RESOURCE_EXHAUSTED, got ${m.status}/${m.failure_class}` : null
      };
    });

    await runTest('T11_FAULT_EMPTY_SEARCH_OBJ15', 'P3.5 Empty Web Search', 'OBJ-15', 'Empty web search results prevent OBJ-15 completion and produce zero fabricated sources', async () => {
      const outPath = wp('reports/obj15_empty.md');
      const origSearch = WebSearchService.search.bind(WebSearchService);
      const origDiag = WebSearchService.searchWithDiagnostics.bind(WebSearchService);
      const origConduct = WebSearchService.conductResearch.bind(WebSearchService);
      WebSearchService.search = async () => [];
      WebSearchService.searchWithDiagnostics = async (q) => ({ ok: true, query: q, empty: true, networkError: null, results: [] });
      WebSearchService.conductResearch = async ({ topic }) => ({ ok: true, topic, sources: [], results: [], empty: true });
      let done;
      try {
        const created = await missionControl.createMission(`Research FIDO2 WebAuthn passkey authentication architecture and create a cited report with traceable source URLs at '${outPath}'.`);
        await missionControl.startMission(created.id);
        done = await waitForMission(created.id, 180000);
      } finally {
        WebSearchService.search = origSearch;
        WebSearchService.searchWithDiagnostics = origDiag;
        WebSearchService.conductResearch = origConduct;
      }
      const notCompleted = done.status !== 'COMPLETED' && !fs.existsSync(outPath);
      return {
        passed: notCompleted && ['FAILED', 'FAILED_RETRYABLE', 'PARTIALLY_VERIFIED'].includes(done.status),
        metrics: { status: done.status, fileCreated: fs.existsSync(outPath) },
        evidence: { error: done.error },
        failure_reason: !notCompleted ? `False completion or file written on empty web search (status=${done.status})` : null
      };
    });

    await runTest('T12_FAULT_EMPTY_SEARCH_CONTRACT_OBJ17', 'P3.5 Empty Web Search', 'OBJ-17', 'OBJ-17 with memory saved but empty web search resolves to PARTIALLY_VERIFIED/FAILED, NEVER COMPLETED', async () => {
      const outPath = wp('reports/obj17_empty_contract.md');
      // Build synthetic mission representing partial state (step 1 search_web returned 0 sources, step 2 hollow write attempted)
      const mId = `mission-adv-obj17-${Date.now()}`;
      const now = new Date().toISOString();
      const contract = missionControl.buildAcceptanceContract(
        `Complete a multi-step project: research HTTP/3 QUIC 0-RTT handshake behavior, write a summary brief to '${outPath}', and record a memory note summarizing the deliverable.`,
        [
          { step_index: 1, tool: 'search_web', args: { query: 'HTTP/3 QUIC 0-RTT' } },
          { step_index: 2, tool: 'write_file', args: { file_path: outPath } }
        ]
      );
      await run(
        'INSERT INTO missions (id, objective, plan_summary, status, created_at, acceptance_contract) VALUES (?, ?, ?, ?, ?, ?)',
        [mId, contract.objective, 'Adversarial empty-search OBJ-17', 'RUNNING', now, JSON.stringify(contract)]
      );
      await run(
        'INSERT INTO mission_steps (id, mission_id, step_index, title, agent_key, tool, args, status, result) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)',
        [`s1-${mId}`, mId, 'Web Search QUIC', 'research', 'search_web', '{"query":"HTTP/3 QUIC"}', 'FAILED', JSON.stringify({ success: true, count: 0, results: [] })]
      );
      await run(
        'INSERT INTO mission_steps (id, mission_id, step_index, title, agent_key, tool, args, status, result) VALUES (?, ?, 2, ?, ?, ?, ?, ?, ?)',
        [`s2-${mId}`, mId, 'Save QUIC Memory Note', 'productivity', 'save_memory', '{"key":"QUIC_Partial_Note"}', 'VERIFIED', JSON.stringify({ success: true, id: 'mem-adv' })]
      );
      await run('INSERT OR REPLACE INTO memories (id, key, value, category, importance, created_at, updated_at) VALUES (?, ?, ?, ?, 3, ?, ?)',
        ['mem-adv', 'QUIC_Partial_Note', 'Partial test', 'Work', now, now]);

      const verificationReport = await missionControl.verifyMissionAcceptanceContract(await missionControl.getMission(mId));
      const passed = !verificationReport.passed && verificationReport.finalStatus !== 'COMPLETED' && verificationReport.finalStatus === 'PARTIALLY_VERIFIED';
      return {
        passed,
        metrics: { passed: verificationReport.passed, finalStatus: verificationReport.finalStatus },
        evidence: verificationReport,
        failure_reason: !passed ? `Expected PARTIALLY_VERIFIED rejection, got ${verificationReport.finalStatus}` : null
      };
    });

    await runTest('T13_RECOVERY_AFTER_RESTORATION', 'P3.6 Recovery After Restore', 'OBJ-04/05/06', 'Restoring local Ollama resumes blocked & retryable checkpoints -> verified COMPLETED deliverables', async () => {
      await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ollama_endpoint', 'http://127.0.0.1:11434', ?)", [new Date().toISOString()]);
      await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ollama_model', 'qwen3.5:4b', ?)", [new Date().toISOString()]);
      const prevMaxWorkers = missionControl.maxConcurrentWorkers;
      missionControl.maxConcurrentWorkers = 1; // Serialize CPU inference cleanly during multi-mission recovery
      const finalStates = [];
      let resumeRes;
      try {
        resumeRes = await missionControl.resumeBlockedLocalModelMissions({ includeRetryable: true });
        for (const item of recoverableMissionIds) {
          const done = await waitForMission(item.id, 300000);
          const exists = fs.existsSync(item.outPath);
          finalStates.push({
            id: item.id,
            status: done.status,
            outExists: exists,
            sha256: sha256File(item.outPath),
            contractPassed: Boolean(done.verification_report?.passed)
          });
        }
      } finally {
        missionControl.maxConcurrentWorkers = prevMaxWorkers;
      }
      const allCompleted = finalStates.length >= 3 && finalStates.every(f => f.status === 'COMPLETED' && f.outExists && f.contractPassed);
      return {
        passed: resumeRes.resumedCount >= 3 && allCompleted,
        metrics: { resumedCount: resumeRes.resumedCount, recoveredCount: finalStates.length },
        evidence: { finalStates },
        failure_reason: !allCompleted ? `Incomplete recovery: ${JSON.stringify(finalStates)}` : null
      };
    }, 900000);

    // -------------------------------------------------------------------------
    // PART 3: P0 / P2 / P4 ANTI-FALSE-COMPLETION, HEURISTIC BAN, APPROVALS, DESKTOP
    // -------------------------------------------------------------------------

    await runTest('T14_HEURISTIC_FALLBACK_BANNED', 'P0 Heuristic Ban', 'P0-HEURISTIC', 'Legacy generateHeuristicMissionSteps & TaskPlanner heuristic fallback throw HEURISTIC_FALLBACK_DISABLED', async () => {
      let mcThrew = false;
      let tpThrew = false;
      try { missionControl.generateHeuristicMissionSteps('anything'); } catch (e) { mcThrew = e.message.includes('HEURISTIC_FALLBACK_DISABLED'); }
      try { taskPlanner.generateHeuristicSteps('anything'); } catch (e) { tpThrew = e.message.includes('HEURISTIC_FALLBACK_DISABLED'); }
      return {
        passed: mcThrew && tpThrew,
        metrics: { mcThrew, tpThrew },
        failure_reason: !(mcThrew && tpThrew) ? 'Heuristic generator did not throw prohibition error' : null
      };
    });

    await runTest('T15_CONTRACT_REJECTS_MISSING_DELIVERABLE', 'P2 Acceptance Contract', 'P2-CONTRACT', 'Mission with steps VERIFIED but missing deliverable file is rejected -> PARTIALLY_VERIFIED', async () => {
      const mId = `mission-missing-deliv-${Date.now()}`;
      const missingPath = wp('reports/never_created_deliverable.md');
      const now = new Date().toISOString();
      const contract = missionControl.buildAcceptanceContract(`Create summary report at '${missingPath}'`, [
        { step_index: 1, tool: 'write_file', args: { file_path: missingPath } }
      ]);
      await run('INSERT INTO missions (id, objective, plan_summary, status, created_at, acceptance_contract) VALUES (?, ?, ?, ?, ?, ?)',
        [mId, contract.objective, 'False-step missing file test', 'RUNNING', now, JSON.stringify(contract)]);
      await run('INSERT INTO mission_steps (id, mission_id, step_index, title, agent_key, tool, args, status, result) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)',
        [`s1-${mId}`, mId, 'Claimed Write', 'content', 'write_file', JSON.stringify({ file_path: missingPath }), 'VERIFIED', '{"success":true}']);

      const report = await missionControl.verifyMissionAcceptanceContract(await missionControl.getMission(mId));
      const passed = !report.passed && report.finalStatus === 'PARTIALLY_VERIFIED' && report.checks.some(c => c.type === 'file_deliverable' && !c.passed);
      return {
        passed,
        metrics: { passed: report.passed, finalStatus: report.finalStatus },
        evidence: report,
        failure_reason: !passed ? `Expected contract rejection, got status=${report.finalStatus}` : null
      };
    });

    await runTest('T16_CONTRACT_REJECTS_PLACEHOLDER_AND_PARTIAL', 'P0 False-Completion Guard', 'P0-PARTIAL', 'Unresolved template placeholder + PARTIALLY_VERIFIED step cannot complete as COMPLETED', async () => {
      const mId = `mission-placeholder-${Date.now()}`;
      const badPath = wp('reports/unresolved_template.md');
      fs.writeFileSync(badPath, '# Stub Report\nContent: {{SYNTHESIZE_FROM_DEPS}}\n', 'utf-8');
      const now = new Date().toISOString();
      const contract = missionControl.buildAcceptanceContract(`Create report at '${badPath}'`, [
        { step_index: 1, tool: 'write_file', args: { file_path: badPath } }
      ]);
      await run('INSERT INTO missions (id, objective, plan_summary, status, created_at, acceptance_contract) VALUES (?, ?, ?, ?, ?, ?)',
        [mId, contract.objective, 'Placeholder rejection test', 'RUNNING', now, JSON.stringify(contract)]);
      await run('INSERT INTO mission_steps (id, mission_id, step_index, title, agent_key, tool, args, status, result) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)',
        [`s1-${mId}`, mId, 'Write Partial Template', 'content', 'write_file', JSON.stringify({ file_path: badPath }), 'PARTIALLY_VERIFIED', '{}']);

      const report = await missionControl.verifyMissionAcceptanceContract(await missionControl.getMission(mId));
      const passed = !report.passed && report.finalStatus === 'PARTIALLY_VERIFIED';
      return {
        passed,
        metrics: { finalStatus: report.finalStatus },
        evidence: report,
        failure_reason: !passed ? `Expected PARTIALLY_VERIFIED, got ${report.finalStatus}` : null
      };
    });

    await runTest('T17_APPROVAL_GATE_PRESERVED', 'P0 Approval Gate', 'P0-APPROVAL', 'Sensitive delete_memory pauses at WAITING_FOR_APPROVAL until operator approves, then completes', async () => {
      const targetMemId = `mem-appr-stage41-${Date.now()}`;
      const now = new Date().toISOString();
      await run(
        'INSERT INTO memories (id, key, value, category, importance, created_at, updated_at) VALUES (?, ?, ?, ?, 3, ?, ?)',
        [targetMemId, 'Stage41_Approval_Test_Key', 'Disposable asset awaiting explicit approval before removal', 'General', now, now]
      );
      const mId = `mission-appr-${Date.now()}`;
      const steps = [
        { step_index: 1, title: 'Delete sensitive memory record', agent_key: 'productivity', tool: 'delete_memory', args: { id: targetMemId }, depends_on: [], requires_approval: true }
      ];
      const contract = missionControl.buildAcceptanceContract('Delete sensitive memory with approval', steps);
      await run('INSERT INTO missions (id, objective, plan_summary, status, created_at, acceptance_contract) VALUES (?, ?, ?, ?, ?, ?)',
        [mId, 'Delete sensitive memory with approval', 'Approval test', 'PENDING', now, JSON.stringify(contract)]);
      await missionControl.persistMissionSteps(mId, steps);
      await missionControl.startMission(mId);
      const parked = await waitForMission(mId, 15000);
      const stillPresentBeforeApproval = Boolean(await get('SELECT id FROM memories WHERE id = ?', [targetMemId]));
      const blockedBeforeApproval = parked.status === 'WAITING_FOR_APPROVAL' && stillPresentBeforeApproval;
      if (!blockedBeforeApproval) return { passed: false, failure_reason: `Did not pause cleanly (status=${parked.status}, present=${stillPresentBeforeApproval})` };

      await missionControl.approveStep(mId, parked.steps[0].id);
      const done = await waitForMission(mId, 20000);
      const removedAfterApproval = !(await get('SELECT id FROM memories WHERE id = ?', [targetMemId]));
      return {
        passed: blockedBeforeApproval && done.status === 'COMPLETED' && removedAfterApproval,
        metrics: { pausedStatus: parked.status, finalStatus: done.status, removedAfterApproval },
        failure_reason: done.status !== 'COMPLETED' ? `After approval ended in ${done.status}: ${done.error}` : null
      };
    });

    await runTest('T18_REAL_DESKTOP_APP_HWND', 'P4 Desktop Verification', 'P4-APP', 'Real Notepad launch verifies process_created + visible HWND window', async () => {
      const preState = await TruthfulVerificationService.capturePreState();
      const raw = await ToolRegistry.executeTool('open_application', { app_name: 'notepad' });
      if (raw?.pid) launchedPidsToCleanup.add(raw.pid);
      const v = await TruthfulVerificationService.verifyOutcome('open_application', { app_name: 'notepad' }, raw, preState);
      const dv = v.desktopVerification || {};
      return {
        passed: v.verified === true && dv.process_created === true && dv.window_visible === true && Boolean(dv.matched_hwnd),
        metrics: { verified: v.verified, status: v.status, matched_hwnd: dv.matched_hwnd, verification_level: dv.verification_level },
        evidence: { raw, desktopVerification: dv },
        failure_reason: !v.verified ? `Desktop app check failed: ${v.error || v.details}` : null
      };
    });

    await runTest('T19_REAL_DESKTOP_OPEN_FILE_TITLE', 'P4 Desktop Verification', 'P4-DOC', 'Opening unique .txt file verifies visible window + opened document title (outcome_confirmed)', async () => {
      const probePath = path.join(WORKSPACE_DIR, 'reports', 'stage4_1_desktop_probe.txt');
      fs.writeFileSync(probePath, 'JARVIS STAGE 4.1 REAL DESKTOP DOCUMENT VERIFICATION PROBE\n', 'utf-8');
      const preState = await TruthfulVerificationService.capturePreState();
      const raw = await ToolRegistry.executeTool('open_file', { file_path: probePath });
      if (raw?.pid) launchedPidsToCleanup.add(raw.pid);
      const v = await TruthfulVerificationService.verifyOutcome('open_file', { file_path: probePath }, raw, preState);
      const dv = v.desktopVerification || {};
      return {
        passed: v.verified === true && dv.file_exists === true && dv.process_created === true && dv.window_visible === true && dv.document_title_matched === true && dv.verification_level === 'outcome_confirmed',
        metrics: { status: v.status, level: dv.verification_level, title: dv.matched_window_title },
        evidence: { raw, desktopVerification: dv },
        failure_reason: !v.verified ? `Opened file verification failed: ${v.error || v.details}` : null
      };
    });

    await runTest('T20_ANTI_FALSE_GUI_PROCESS_ONLY_REJECTED', 'P4 Desktop Integrity', 'P4-NOFAKEGUI', 'Process-only or hidden/missing GUI window is NEVER falsely verified as VERIFIED/COMPLETED', async () => {
      const missingDocPath = path.join(WORKSPACE_DIR, 'reports', 'no_window_exists_doc.txt');
      fs.writeFileSync(missingDocPath, 'Exists on disk, not opened in any GUI window.\n', 'utf-8');

      const vAppGhost = await TruthfulVerificationService.verifyOutcome(
        'open_application',
        { app_name: 'phantom_ghost_gui_41' },
        { success: true, process_created: true, pid: 999999, window_visible: false, verification_level: 'process_only' },
        { windows: [] }
      );
      const vDocNoWin = await TruthfulVerificationService.verifyOutcome(
        'open_file',
        { file_path: missingDocPath },
        { success: true, path: missingDocPath, process_created: true, window_visible: false, document_title_matched: false, verification_level: 'process_only' },
        { windows: [] }
      );
      const passed = (
        vAppGhost.verified === false &&
        vAppGhost.status === 'PARTIALLY_VERIFIED' &&
        vAppGhost.contractStatus === 'PARTIALLY_VERIFIED' &&
        vDocNoWin.verified === false &&
        vDocNoWin.status === 'PARTIALLY_VERIFIED'
      );
      return {
        passed,
        metrics: { appGhostStatus: vAppGhost.status, docNoWinStatus: vDocNoWin.status },
        failure_reason: !passed ? `GUI false positive leaked! app=${vAppGhost.status}, doc=${vDocNoWin.status}` : null
      };
    });

    await runTest('T21_SIMULATED_TELEMETRY_REJECTED', 'P0 Telemetry Truthfulness', 'P0-TELEMETRY', 'Simulated offline telemetry fallback is rejected by TruthfulVerificationService', async () => {
      const v = await TruthfulVerificationService.verifyOutcome('get_system_telemetry', {}, {
        success: true,
        simulated: true,
        verification_eligible: false,
        cpu: { percent: 18.4 },
        memory: { percent: 42.1 }
      });
      return {
        passed: v.verified === false && v.status === 'FAILED' && v.contractStatus === 'FAILED',
        metrics: { verified: v.verified, status: v.status },
        failure_reason: v.verified ? 'Simulated telemetry wrongly verified!' : null
      };
    });

    await runTest('T22_ZERO_CLOUD_AND_PROD_DB_INTACT', 'Security & Isolation', 'P1-ZERO-CLOUD', 'Zero external cloud LLM egress across all tests + production nova.sqlite byte-for-byte untouched', async () => {
      const netLog = spy.getLog();
      const cloudHits = netLog.filter(r => CLOUD_LLM_HOSTS.some(h => String(r.host || '').includes(h)));
      const prodDbHashAfter = sha256File(PROD_DB_PATH);
      const dbUnchanged = prodDbHashBefore === prodDbHashAfter;
      return {
        passed: cloudHits.length === 0 && dbUnchanged,
        metrics: {
          total_network_requests_observed: netLog.length,
          cloud_llm_requests: cloudHits.length,
          prod_db_unchanged: dbUnchanged,
          prod_db_sha256: prodDbHashAfter
        },
        failure_reason: cloudHits.length > 0 ? `Detected cloud LLM calls: ${JSON.stringify(cloudHits)}` : (!dbUnchanged ? 'Production DB modified!' : null)
      };
    });

    const summary = {
      suite: 'SENTINEL_STAGE_4_1_AUTONOMY_INTEGRITY',
      timestamp: new Date().toISOString(),
      model: 'qwen3.5:4b',
      endpoint: 'http://127.0.0.1:11434',
      total_tests: results.length,
      passed: results.filter(r => r.status === 'PASS').length,
      failed: results.filter(r => r.status === 'FAIL').length,
      pass_rate_percent: Number(((results.filter(r => r.status === 'PASS').length / results.length) * 100).toFixed(1)),
      prod_db_sha256_before: prodDbHashBefore,
      prod_db_sha256_after: sha256File(PROD_DB_PATH),
      prod_db_preserved: prodDbHashBefore === sha256File(PROD_DB_PATH)
    };

    const metricsPayload = {
      summary,
      hardware: await ollama.getSystemResourceProfile(),
      usage: await ModelRouterService.getUsageMetrics(),
      results
    };

    fs.writeFileSync(path.join(DELIVERABLES_DIR, 'SENTINEL_STAGE_4_1_METRICS.json'), JSON.stringify(metricsPayload, null, 2), 'utf-8');
    console.log('\n' + '='.repeat(80));
    console.log(`STAGE 4.1 COMPLETE: ${summary.passed}/${summary.total_tests} PASS (${summary.pass_rate_percent}%) | ${summary.failed} FAIL | Prod DB Preserved=${summary.prod_db_preserved}`);
    console.log('='.repeat(80));
  } finally {
    spy.restore();
    // Clean up test Notepad windows launched by T18/T19
    for (const pid of launchedPidsToCleanup) killPidForce(pid);
    if (process.platform === 'win32') {
      // Ensure any test notepad process triggered via shell:AppsFolder cleanly closes if still lingering
      spawnSync('powershell', ['-Command', "Get-Process notepad -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*stage4_1_desktop_probe*' -or $_.MainWindowTitle -eq '' -or $_.MainWindowTitle -like '*Untitled*' } | Stop-Process -Force"], { stdio: 'ignore' });
    }
    if (startedPyByScript && pyAgentProc?.pid) killPidForce(pyAgentProc.pid);
    if (startedOllamaByScript && ollamaProc?.pid) killPidForce(ollamaProc.pid);
    if (keepAwakeProc?.pid) killPidForce(keepAwakeProc.pid);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('[Stage 4.1 Validation Fatal Error]', err);
  process.exit(1);
});
