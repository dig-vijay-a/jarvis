/**
 * JARVIS OS 2.0 — PHASE 15 P1: PRE-OPTIMIZATION PERFORMANCE BASELINE PROFILER
 * Measures pure pre-optimization latency, TTFT, tokens/sec, planning, tool selection,
 * multi-step DAG execution, memory retrieval, unload/reload latency, and RAM/CPU footprint.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { spawn, spawnSync } from 'child_process';

const ROOT_DIR = path.resolve('.');
const DELIVERABLES_DIR = path.resolve('nova/deliverables');
const DISPOSABLE_ROOT = path.resolve('nova/data/sentinel_disposable_test/phase15_isolated');
const WORKSPACE_DIR = path.resolve('nova/data/sentinel_disposable_test/phase15_workspace');
const ISOLATED_DB_PATH = path.join(DISPOSABLE_ROOT, 'phase15_baseline.sqlite');
const PROD_DB_PATH = path.resolve('nova/data/nova.sqlite');
const OLLAMA_EXE = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe');

for (const envPath of [path.resolve('nova/backend/.env'), path.resolve('nova/.env')]) {
  if (fs.existsSync(envPath)) {
    const parsed = dotenv.parse(fs.readFileSync(envPath));
    for (const [k, v] of Object.entries(parsed)) {
      if (v && (!process.env[k] || process.env[k].trim() === '')) process.env[k] = v;
    }
  }
}

process.env.NOVA_DB_PATH = ISOLATED_DB_PATH;
process.env.SENTINEL_DELIVERABLES_DIR = path.join(DISPOSABLE_ROOT, 'sentinel_deliverables');
process.env.SENTINEL_STAGE_NAME = 'PHASE_15_BASELINE';
process.env.PYTHON_AGENT_URL = 'http://127.0.0.1:8000';
process.env.ZERO_COST_LOCAL_ONLY = 'true';
process.env.OLLAMA_ENDPOINT = 'http://127.0.0.1:11434';
process.env.OLLAMA_MODEL = 'qwen3.5:4b';
process.env.OLLAMA_NO_CLOUD = '1';
process.env.OLLAMA_MAX_LOADED_MODELS = '1';
process.env.LOCAL_INFERENCE_TIMEOUT_MS = '240000';

function sha256File(p) {
  return fs.existsSync(p) ? crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') : null;
}

function killPidForce(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(pid, 'SIGKILL');
  } catch (_) {}
}

async function waitForHttp(url, timeoutMs = 25000, pred = null) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await axios.get(url, { timeout: 2500 });
      if (res.status >= 200 && res.status < 300 && (!pred || pred(res.data))) return res.data;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function measureStreamingChatRaw(endpoint, model, { systemPrompt, userPrompt, numCtx = 6144, numThread = 8, maxTokens = 256, tools = [] }) {
  const t0 = Date.now();
  let ttftMs = null;
  let finalData = {};
  let chunks = 0;
  let text = '';

  const payload = {
    model,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      { role: 'user', content: userPrompt }
    ],
    stream: true,
    think: false,
    options: { temperature: 0.2, num_predict: maxTokens, num_ctx: numCtx, num_thread: numThread },
    ...(tools.length > 0 ? { tools } : {})
  };

  const res = await axios.post(`${endpoint}/api/chat`, payload, { responseType: 'stream', timeout: 180000 });
  await new Promise((resolve, reject) => {
    let buf = '';
    res.data.on('data', (c) => {
      buf += c.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const l of lines) {
        if (!l.trim()) continue;
        try {
          const obj = JSON.parse(l);
          const delta = obj.message?.content || '';
          const tcalls = obj.message?.tool_calls;
          if ((delta || (Array.isArray(tcalls) && tcalls.length > 0)) && ttftMs === null) {
            ttftMs = Date.now() - t0;
          }
          if (delta) { chunks++; text += delta; }
          if (obj.done) finalData = obj;
        } catch (_) {}
      }
    });
    res.data.on('end', resolve);
    res.data.on('error', reject);
  });

  const totalMs = Date.now() - t0;
  const evalCount = finalData.eval_count || 0;
  const evalSec = (finalData.eval_duration || 0) / 1e9;
  const promptEvalCount = finalData.prompt_eval_count || 0;
  const promptEvalSec = (finalData.prompt_eval_duration || 0) / 1e9;

  return {
    ttftMs: ttftMs ?? totalMs,
    totalMs,
    chunks,
    promptTokens: promptEvalCount,
    completionTokens: evalCount,
    tokensPerSec: evalSec > 0 ? Number((evalCount / evalSec).toFixed(2)) : 0,
    promptTokensPerSec: promptEvalSec > 0 ? Number((promptEvalCount / promptEvalSec).toFixed(2)) : 0,
    numCtx,
    numThread,
    textLen: text.length
  };
}

async function main() {
  console.log('='.repeat(75));
  console.log('PHASE 15 P1 — PRE-OPTIMIZATION BASELINE PROFILER');
  console.log('='.repeat(75));

  const prodHashBefore = sha256File(PROD_DB_PATH);
  if (fs.existsSync(DISPOSABLE_ROOT)) fs.rmSync(DISPOSABLE_ROOT, { recursive: true, force: true });
  fs.mkdirSync(path.join(DISPOSABLE_ROOT, 'sentinel_deliverables'), { recursive: true });
  fs.mkdirSync(path.join(WORKSPACE_DIR, 'sample_docs'), { recursive: true });
  fs.mkdirSync(path.join(WORKSPACE_DIR, 'reports'), { recursive: true });
  fs.mkdirSync(DELIVERABLES_DIR, { recursive: true });

  fs.writeFileSync(path.join(WORKSPACE_DIR, 'sample_docs', 'alpha.txt'), 'Service Alpha: p99 latency 4.2ms, throughput 12500 req/s.');
  fs.writeFileSync(path.join(WORKSPACE_DIR, 'sample_docs', 'beta.txt'), 'Service Beta: p99 latency 9.8ms, throughput 6400 req/s.');

  let ollamaProc = null, pyProc = null, keepAwakeProc = null;
  let startedOllama = false, startedPy = false;

  try {
    if (process.platform === 'win32') {
      keepAwakeProc = spawn('python', ['-c', 'import ctypes,time; ctypes.windll.kernel32.SetThreadExecutionState(0x80000001)\nwhile True: time.sleep(30)'], { stdio: 'ignore' });
    }
    try { await waitForHttp('http://127.0.0.1:11434/api/tags', 1500, d => Array.isArray(d.models)); }
    catch {
      ollamaProc = spawn(OLLAMA_EXE, ['serve'], {
        stdio: 'ignore',
        env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_MAX_LOADED_MODELS: '1', OLLAMA_NO_CLOUD: '1' }
      });
      startedOllama = true;
      await waitForHttp('http://127.0.0.1:11434/api/tags', 30000, d => Array.isArray(d.models));
    }

    try { await waitForHttp('http://127.0.0.1:8000/health', 1200, d => d.status === 'online'); }
    catch {
      pyProc = spawn('python', ['nova/python-agent/agent.py'], { cwd: ROOT_DIR, stdio: 'ignore' });
      startedPy = true;
      await waitForHttp('http://127.0.0.1:8000/health', 25000, d => d.status === 'online');
    }

    const { initDatabase, run } = await import('./backend/database/db.js');
    await initDatabase();
    const { getProvider } = await import('./backend/services/providers/index.js');
    const { initMissionControl } = await import('./backend/services/missionControlService.js');
    const { ModelRouterService } = await import('./backend/services/modelRouterService.js');
    const MemoryIntelligenceService = (await import('./backend/services/memoryIntelligenceService.js')).default;
    const ToolRegistry = (await import('./backend/tools/registry.js')).default;
    const { createSystemPromptWithContext } = await import('./backend/ai/prompts.js');

    const ollama = getProvider('ollama');
    const mc = initMissionControl(null);

    const idleRamUsedGB = Number(((os.totalmem() - os.freemem()) / (1024 ** 3)).toFixed(2));
    const idleFreeRamGB = Number((os.freemem() / (1024 ** 3)).toFixed(2));

    // Unload if resident so cold reload timing is authentic
    await ollama.unloadModel('qwen3.5:4b', { force: true, verifyTimeoutMs: 10000 }).catch(() => {});

    // 1. Cold reload timing
    const reloadT0 = Date.now();
    await ollama.chatCompletion({ systemPrompt: 'Reply Ready.', messages: [{ role: 'user', content: 'Ping' }], maxTokens: 8 });
    const coldReloadMs = Date.now() - reloadT0;
    const availAfterLoad = await ollama.verifyModelAvailability();

    let minFreeRamSeenGB = os.freemem() / (1024 ** 3);
    const sampleRam = () => { minFreeRamSeenGB = Math.min(minFreeRamSeenGB, os.freemem() / (1024 ** 3)); };

    // 2. Streaming conversation baseline (realistic full prompt)
    const sysPrompt = createSystemPromptWithContext({ memories: [], activeTasks: [], recentLogs: [], twinContext: 'Concise engineering tone.', graphContext: '' });
    const streamConv = await measureStreamingChatRaw('http://127.0.0.1:11434', 'qwen3.5:4b', {
      systemPrompt: sysPrompt,
      userPrompt: 'Explain what HTTP/2 multiplexing prevents in two sentences.',
      numCtx: availAfterLoad.resourceProfile.recommendedCtx,
      numThread: availAfterLoad.resourceProfile.numThreads,
      maxTokens: 120
    });
    sampleRam();
    console.log('[Baseline] Stream Conversation:', streamConv);

    // 3. Tool-selection latency (current orchestrator turn behavior with subset of tools)
    const allTools = ToolRegistry.getTools().slice(0, 7);
    const toolT0 = Date.now();
    const toolRes = await ModelRouterService.generateWithFallback({
      systemPrompt: sysPrompt,
      messages: [{ role: 'user', content: 'List open windows or check current system CPU and memory usage.' }],
      tools: allTools,
      maxTokens: 160
    });
    const toolSelectionMs = Date.now() - toolT0;
    sampleRam();
    console.log('[Baseline] Tool Selection ms:', toolSelectionMs, 'calls:', (toolRes.toolCalls || []).map(c => c.name));

    // 4. Memory retrieval latency (populate 60 memories)
    const now = new Date().toISOString();
    for (let i = 0; i < 60; i++) {
      await run('INSERT OR IGNORE INTO memories (id, key, value, category, importance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [`base-mem-${i}`, `Project_Fact_${i}`, `Subsystem ${i} uses SQLite WAL and local Ollama inference node ${i % 5}.`, 'Projects', (i % 5) + 1, now, now]);
    }
    const memT0 = Date.now();
    const memHits = await MemoryIntelligenceService.retrieveRelevantMemories('local Ollama inference SQLite WAL latency', 5);
    const memoryRetrievalMs = Date.now() - memT0;
    console.log('[Baseline] Memory Retrieval ms:', memoryRetrievalMs, 'hits:', memHits.length);

    // 5. Mission Planning latency
    const outPath = path.join(WORKSPACE_DIR, 'reports', 'baseline_summary.md').replace(/\\/g, '/');
    const goal = `Inspect '${path.join(WORKSPACE_DIR, 'sample_docs').replace(/\\/g, '/')}' using hash_and_list_files and write a concise summary to '${outPath}'.`;
    const planT0 = Date.now();
    const planned = await mc.planMissionStepsWithLLM(goal, {});
    const planningMs = Date.now() - planT0;
    sampleRam();
    console.log('[Baseline] Planning ms:', planningMs, 'steps:', planned.steps.map(s => s.tool));

    // 6. Full Multi-step Mission DAG end-to-end duration
    const mT0 = Date.now();
    const created = await mc.createMission(goal);
    await mc.startMission(created.id);
    let done = created;
    const deadline = Date.now() + 360000;
    while (Date.now() < deadline) {
      done = await mc.getMission(created.id);
      if (['COMPLETED', 'FAILED', 'PARTIALLY_VERIFIED', 'FAILED_RETRYABLE', 'BLOCKED_PROVIDER_UNAVAILABLE'].includes(done.status)) break;
      await new Promise(r => setTimeout(r, 300));
    }
    const multiStepMissionMs = Date.now() - mT0;
    sampleRam();
    console.log('[Baseline] Multi-step Mission:', done.status, multiStepMissionMs, 'ms');

    // 7. Model unload latency
    const unloadRes = await ollama.unloadModel('qwen3.5:4b', { force: true, verifyTimeoutMs: 15000 });
    const unloadMs = Date.now(); // measure explicitly cleanly
    const uT0 = Date.now();
    await ollama.chatCompletion({ systemPrompt: 'Hi', messages: [{ role: 'user', content: 'Hi' }], maxTokens: 6 });
    const reloadWarmPingMs = Date.now() - uT0;
    const uT1 = Date.now();
    const uVer = await ollama.unloadModel('qwen3.5:4b', { force: true, verifyTimeoutMs: 15000 });
    const unloadVerifiedMs = Date.now() - uT1;

    const prodHashAfter = sha256File(PROD_DB_PATH);
    const totalRamGB = Number((os.totalmem() / (1024 ** 3)).toFixed(2));
    const peakRamUsedGB = Number((totalRamGB - minFreeRamSeenGB).toFixed(2));

    const baselineData = {
      phase: 'PHASE_15_P1_BASELINE',
      timestamp: new Date().toISOString(),
      model: 'qwen3.5:4b',
      endpoint: 'http://127.0.0.1:11434',
      hardware: {
        total_ram_gb: totalRamGB,
        logical_cpus: os.cpus().length,
        has_gpu: availAfterLoad.resourceProfile.hasNvidiaGpu,
        configured_ctx: availAfterLoad.resourceProfile.recommendedCtx,
        configured_threads: availAfterLoad.resourceProfile.numThreads,
        keep_alive: availAfterLoad.resourceProfile.keepAlive,
        resident_model_size_bytes: availAfterLoad.loadedModels?.[0]?.sizeBytes || 0
      },
      metrics: {
        streaming_conversation: streamConv,
        tool_selection_latency_ms: toolSelectionMs,
        tool_selected: (toolRes.toolCalls || []).map(c => c.name),
        planning_latency_ms: planningMs,
        multi_step_mission_ms: multiStepMissionMs,
        multi_step_mission_status: done.status,
        memory_retrieval_ms: memoryRetrievalMs,
        cold_reload_ms: coldReloadMs,
        warm_reload_ms: reloadWarmPingMs,
        unload_verified_ms: unloadVerifiedMs,
        unload_verified: uVer.verifiedNotResident,
        idle_ram_used_gb: idleRamUsedGB,
        peak_ram_used_gb: peakRamUsedGB,
        min_free_ram_gb: Number(minFreeRamSeenGB.toFixed(2)),
        cpu_load_avg_1m: Number(os.loadavg()[0].toFixed(2))
      },
      prod_db_preserved: prodHashBefore === prodHashAfter,
      prod_db_sha256: prodHashAfter
    };

    fs.writeFileSync(path.join(DISPOSABLE_ROOT, 'phase15_baseline_snapshot.json'), JSON.stringify(baselineData, null, 2), 'utf-8');
    console.log('\nBASELINE SNAPSHOT SAVED:', JSON.stringify(baselineData.metrics, null, 2));
  } finally {
    if (startedPy && pyProc?.pid) killPidForce(pyProc.pid);
    if (startedOllama && ollamaProc?.pid) killPidForce(ollamaProc.pid);
    if (keepAwakeProc?.pid) killPidForce(keepAwakeProc.pid);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('[Phase 15 Baseline Error]', err);
  process.exit(1);
});
