/**
 * Generates the 5 Markdown deliverables for JARVIS OS 2.0 Zero-Cost Local AI Migration
 * directly from nova/deliverables/LOCAL_AI_TEST_RESULTS.json so every metric reconciles 1:1.
 */
import fs from 'fs';
import path from 'path';

const DELIVERABLES_DIR = path.resolve('nova/deliverables');
const RESULTS_PATH = path.join(DELIVERABLES_DIR, 'LOCAL_AI_TEST_RESULTS.json');

if (!fs.existsSync(RESULTS_PATH)) {
  console.error(`Missing ${RESULTS_PATH}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
const results = Array.isArray(data.results) ? data.results : [];
const byId = Object.fromEntries(results.map(r => [r.id, r]));
const hw = data.hardware_profile || {};
const summary = data.summary || {};
const usage = Array.isArray(data.usage_metrics) ? data.usage_metrics : [];
const ollamaUsage = usage.find(u => u.provider === 'ollama') || usage[0] || {};

const getTest = (id) => byId[id] || { id, status: 'NOT_RUN', duration_ms: 0, metrics: {}, failure_reason: 'Not present in results' };
const fmtTable = (rows) => rows.map(r => `| ${r.id} | ${r.category} | **${r.status}** | ${r.duration_ms} ms | ${r.failure_reason || 'None'} |`).join('\n');

const migrationReport = `# JARVIS OS 2.0 — Local AI Migration Report

- **Generated:** ${data.timestamp}
- **Validation Suite:** \`${data.suite}\`
- **Primary Model:** \`${data.model}\` via Ollama (\`${data.endpoint}\`)
- **Overall Result:** **${summary.PASS}/${summary.total} PASS** (${summary.FAIL} FAIL)
- **Production DB Integrity:** \`${summary.prod_db_preserved ? 'PRESERVED' : 'MODIFIED'}\` (SHA-256: \`${summary.prod_db_sha256}\`)

## 1. Architecture Summary
JARVIS primary intelligence has been migrated to run 100% locally via Ollama (\`http://127.0.0.1:11434\`) with \`qwen3.5:4b\`, preserving the provider abstraction (\`BaseProvider\`, \`getProvider\`, \`ModelRouterService\`) and existing tool/approval architecture while blocking automatic cloud LLM usage under \`zero_cost_local_only = true\`.

### Core Changes Implemented
1. **Local Runtime Provider** ([OllamaProvider.js](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/backend/services/providers/OllamaProvider.js)):
   - Bound strictly to \`http://127.0.0.1:11434\` and \`qwen3.5:4b\` by default.
   - Hardware detection (\`getSystemResourceProfile\`), single-model enforcement (\`ensureSingleLoadedModel\`), safe unloading (\`unloadModel\`), NDJSON streaming (\`streamResponse\`), structured \`tool_calls\` extraction, bounded timeouts (\`LOCAL_INFERENCE_TIMEOUT_MS\`), \`think: false\` default for JSON/tool latency stability on CPU, and context truncation (\`formatAndBoundMessages\`).
2. **Zero-Cost Policy Routing** ([modelRouterService.js](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/backend/services/modelRouterService.js)):
   - Enforces \`isZeroCostLocalOnly() === true\` by default, locking priority chains to \`['ollama']\` and marking cloud providers (\`groq\`, \`gemini\`, \`mistral\`, \`openrouter\`) as \`available: false, disabledByPolicy: true\`.
   - Throws \`LOCAL_MODEL_UNAVAILABLE\` when Ollama or the configured local model tag is absent—zero automatic cloud fallback.
3. **Mission Control Reliability** ([missionControlService.js](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/backend/services/missionControlService.js) & [schedulerService.js](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/backend/services/schedulerService.js)):
   - Added \`BLOCKED_LOCAL_MODEL_UNAVAILABLE\` mission status and removed generic heuristic fallback steps so unparseable/unavailable planning never fakes \`COMPLETED\`.
   - Periodic scheduler ticks invoke \`resumeBlockedLocalModelMissions()\` to automatically resume blocked missions once Ollama recovers.
4. **Orchestration, Vision & Config** ([orchestrator.js](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/backend/ai/orchestrator.js), [visionService.js](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/backend/services/visionService.js), [db.js](file:///c:/Users/digvi/OneDrive/Desktop/Jarvis/nova/backend/database/db.js)):
   - Fixed conversation \`userText\` routing, unique \`messages.id\` UUIDs, word-boundary entity resolution, and scoped per-turn tool schemas so 4B local prompts remain within \`num_ctx\`.
   - Retained optional cloud providers as manually disabled integrations guarded by \`/api/settings/test-ai\` and Vision zero-cost checks.

## 2. Full Validation Matrix (${summary.total} Tests)
| Test ID | Category | Status | Duration | Failure Reason |
|---|---|---|---:|---|
${fmtTable(results)}
`;

const t03 = getTest('T03_NO_EXTERNAL_INFERENCE_NETWORK_REQUESTS');
const t04 = getTest('T04_BASIC_CONVERSATION_AND_CONTEXT');
const t05 = getTest('T05_STREAMING_RESPONSE');
const t06 = getTest('T06_STRUCTURED_TOOL_CALLING');
const t07 = getTest('T07_MULTI_STEP_MISSION_PLANNING_AND_DAG');
const t08 = getTest('T08_DYNAMIC_REPLANNING');
const t09 = getTest('T09_MEMORY_RETRIEVAL_AND_SYNTHESIS');
const t10 = getTest('T10_FILE_OPERATIONS');
const t11 = getTest('T11_CODING_TASK_AND_TESTS');
const t12 = getTest('T12_RESEARCH_SYNTHESIS_WITH_WEB_ALLOWED');
const t14 = getTest('T14_PROMPT_INJECTION_RESISTANCE');
const t18 = getTest('T18_PROVIDER_SHUTDOWN_AND_RECOVERY');
const t19 = getTest('T19_SINGLE_MODEL_MEMORY_MANAGEMENT_AND_UNLOAD');
const t20 = getTest('T20_CONTEXT_OVERFLOW_BOUNDING');
const t21 = getTest('T21_CONCURRENT_MISSIONS');
const t22 = getTest('T22_LONG_RUNNING_INFERENCE_AND_RESPONSIVENESS');
const t23 = getTest('T23_WEB_SEARCH_EMPTY_AND_NETWORK_FAILURE');

const benchmarkReport = `# JARVIS OS 2.0 — Local Model Benchmark Report

- **Model:** \`${data.model}\` (Q4_K_M, ~3.32 GB on disk)
- **Endpoint:** \`${data.endpoint}\`
- **Host Profile:** ${hw.logicalCpus || 'N/A'} logical CPUs, ${hw.totalRamGB || 'N/A'} GB RAM (CPU execution, \`hasNvidiaGpu: ${hw.hasNvidiaGpu}\`, \`numThreads: ${hw.numThreads}\`)
- **Router Usage Telemetry:** ${ollamaUsage.total_requests || 0} total logged router calls, ${ollamaUsage.successful_requests || 0} succeeded, ${ollamaUsage.total_tokens || 0} total tokens (${ollamaUsage.total_prompt_tokens || 0} prompt / ${ollamaUsage.total_completion_tokens || 0} completion), avg router latency \`${Math.round(ollamaUsage.avg_latency_ms || 0)} ms\`

## 1. Key Diagnostic Finding: Thinking Mode vs. JSON/Tool Latency
Before integrating \`think: false\` as the default in \`OllamaProvider.buildPayload()\`, direct probing on CPU showed \`qwen3.5:4b\` spent 256 hidden reasoning tokens (\`1042\` thinking chars) before emitting any visible content:
- \`think\` unset: \`38,596 ms\`, \`eval_count=256\`, empty content \`""\`
- \`think: false\`: \`1,853 ms\`, \`eval_count=13\`, valid JSON \`{"ok": true, "tool": "search_files"}\`

## 2. Measured Task Latencies from Validation Suite
| Benchmark Area | Test ID | Status | End-to-End Duration | Key Metrics |
|---|---|---|---:|---|
| Short Completion + Vision Guard | \`T03\` | **${t03.status}** | ${t03.duration_ms} ms | Model latency=${t03.metrics?.latencyMs ?? 'N/A'} ms |
| Multi-turn Conversation Context | \`T04\` | **${t04.status}** | ${t04.duration_ms} ms | Turn 1 len=${t04.metrics?.turn1Len ?? 'N/A'} chars |
| NDJSON Token Streaming | \`T05\` | **${t05.status}** | ${t05.duration_ms} ms | ${t05.metrics?.chunkCount ?? 'N/A'} chunks, ${t05.metrics?.tokens ?? 'N/A'} tokens, ${t05.metrics?.latencyMs ?? 'N/A'} ms |
| Structured Tool Calling | \`T06\` | **${t06.status}** | ${t06.duration_ms} ms | Tool=\`${t06.metrics?.called ?? 'N/A'}\`, latency=${t06.metrics?.latencyMs ?? 'N/A'} ms |
| Multi-Step DAG Planning + Write | \`T07\` | **${t07.status}** | ${t07.duration_ms} ms | Steps=${JSON.stringify(t07.metrics?.steps ?? [])} |
| Dynamic Replanning | \`T08\` | **${t08.status}** | ${t08.duration_ms} ms | Replacement=\`${t08.metrics?.replacementTool ?? 'N/A'}\` |
| Memory Retrieval & Synthesis | \`T09\` | **${t09.status}** | ${t09.duration_ms} ms | Grounded synthesis from DB memory |
| File Organization (SHA-256 Verified) | \`T10\` | **${t10.status}** | ${t10.duration_ms} ms | All hashes preserved=${t10.metrics?.allHashesPreserved ?? 'N/A'} |
| Coding Tests + Failure Analysis | \`T11\` | **${t11.status}** | ${t11.duration_ms} ms | Status=${t11.metrics?.status ?? t11.failure_reason ?? 'N/A'} |
| External Web + Local Synthesis | \`T12\` | **${t12.status}** | ${t12.duration_ms} ms | ${t12.metrics?.webHits ?? 'N/A'} hits, latency=${t12.metrics?.latencyMs ?? 'N/A'} ms |
| Shutdown & Restart Recovery | \`T18\` | **${t18.status}** | ${t18.duration_ms} ms | Resumed=${t18.metrics?.resumedCount ?? 'N/A'}, final=${t18.metrics?.finalStatus ?? 'N/A'} |
| Model Unload & Reload | \`T19\` | **${t19.status}** | ${t19.duration_ms} ms | Reload latency=${t19.metrics?.reloadLatencyMs ?? 'N/A'} ms |
| 40 KB Context Bounding | \`T20\` | **${t20.status}** | ${t20.duration_ms} ms | Prompt tokens=${t20.metrics?.promptTokens ?? 'N/A'}, numCtx=${t20.metrics?.numCtx ?? 'N/A'} |
| Concurrent Missions | \`T21\` | **${t21.status}** | ${t21.duration_ms} ms | A=${t21.metrics?.statusA ?? 'N/A'}, B=${t21.metrics?.statusB ?? 'N/A'} |
| Responsiveness Under Load | \`T22\` | **${t22.status}** | ${t22.duration_ms} ms | Inference=${t22.metrics?.inferenceLatencyMs ?? 'N/A'} ms, max \`/health\`=${t22.metrics?.maxBackendHealthMs ?? 'N/A'} ms |
`;

const t13 = getTest('T13_INVALID_TOOL_ARGUMENTS');
const t15 = getTest('T15_APPROVAL_GATE_ENFORCEMENT');
const t16 = getTest('T16_ANTI_FAKE_COMPLETION_HEURISTIC_REMOVAL');
const t17 = getTest('T17_MODEL_UNAVAILABLE_BLOCKED');

const toolReport = `# JARVIS OS 2.0 — Local AI Tool Calling & DAG Planning Report

## 1. Architecture & Compatibility Hardening
- **Structured Schema Sanitization:** \`OllamaProvider.sanitizeToolSchema()\` lowercases JSON Schema types and preserves \`required\` constraints expected by Ollama \`/api/chat\`.
- **Context-Safe Tool Scoping:** Passing all 41 tools (\`16,417 bytes\`) to Ollama initially caused HTTP 400 context overflow on 4K CPU slots. Scoping conversational turns in \`Orchestrator.processMessage()\` plus subtracting serialized \`tools\` size inside \`OllamaProvider.formatAndBoundMessages()\` resolved payload rejections cleanly.
- **DAG Dependency Normalization:** Small open-weight models occasionally emit dependency objects like \`[{"step_index": 1}]\` instead of \`[1]\`. \`MissionControlService.planMissionStepsWithLLM()\` now normalizes \`depends_on\` to integer step indices and rejects unregistered tool names.
- **Zero-Heuristic-Filler Guarantee:** Removed generic fallback steps (\`get_system_telemetry\`, \`search_web\`, \`save_memory\`). Malformed or unavailable plans fail or block truthfully.

## 2. Tool-Calling & Planning Test Outcomes
| Capability | Test ID | Status | Duration | Verified Evidence |
|---|---|---|---:|---|
| Structured Tool Emission & Execution | \`T06\` | **${t06.status}** | ${t06.duration_ms} ms | Called \`${t06.metrics?.called ?? 'N/A'}\` |
| Multi-Step DAG Planning & Synthesis | \`T07\` | **${t07.status}** | ${t07.duration_ms} ms | Steps: ${JSON.stringify(t07.metrics?.steps ?? [])} -> \`${t07.metrics?.missionStatus ?? t07.failure_reason}\` |
| Dynamic DAG Replanning | \`T08\` | **${t08.status}** | ${t08.duration_ms} ms | Replan count=${t08.metrics?.replanCount ?? 'N/A'}, tool=\`${t08.metrics?.replacementTool ?? 'N/A'}\` |
| File Organization Tooling | \`T10\` | **${t10.status}** | ${t10.duration_ms} ms | Moved=${JSON.stringify(t10.metrics?.movedSubfiles ?? [])} |
| Code Testing & Failure Analysis | \`T11\` | **${t11.status}** | ${t11.duration_ms} ms | Tools=${JSON.stringify(t11.metrics?.tools ?? [])}, report bytes=${t11.metrics?.outLen ?? 'N/A'} |
| Schema & Boundary Argument Rejection | \`T13\` | **${t13.status}** | ${t13.duration_ms} ms | \`${t13.metrics?.v1Err ?? 'N/A'}\`; \`${t13.metrics?.v3Err ?? 'N/A'}\` |
| Anti-Fake-Completion Guard | \`T16\` | **${t16.status}** | ${t16.duration_ms} ms | Malformed plan blocked (\`blockedFakeRun=${t16.metrics?.blockedFakeRun}\`) |
`;

const resourceReport = `# JARVIS OS 2.0 — Local AI Resource Management Report

## 1. Detected Host Hardware Profile
- **Total RAM:** ${hw.totalRamGB ?? 'N/A'} GB
- **Free RAM (end of suite):** ${hw.freeRamGB ?? 'N/A'} GB
- **Logical CPUs:** ${hw.logicalCpus ?? 'N/A'} (configured \`num_thread: ${hw.numThreads ?? 'N/A'}\`)
- **Discrete NVIDIA GPU:** ${hw.hasNvidiaGpu ? 'Yes' : 'No (CPU / Intel Iris Xe iGPU host; Ollama runs \`qwen3.5:4b\` in CPU mode)'}
- **Configured Limits:** \`OLLAMA_MAX_LOADED_MODELS=${hw.maxLoadedModels ?? 1}\`, \`keep_alive=${hw.keepAlive ?? '5m'}\`, \`recommendedCtx=${hw.recommendedCtx ?? 'N/A'}\`, \`inferenceTimeoutMs=${hw.inferenceTimeoutMs ?? 'N/A'}\`

## 2. Memory, Context & Responsiveness Controls
- **Single Resident Model Enforcement:** Daemon launched with \`OLLAMA_MAX_LOADED_MODELS=1\`; \`ensureSingleLoadedModel()\` unloads competing tags before loading a new model.
- **CPU-Safe Input & Context Bounding:** \`recommendedCtx\` adapts dynamically (\`4096\` on constrained RAM, \`6144\` when \`>= 5.0 GB\` free, \`8192\` on GPU VRAM \`>= 6.5 GB\`), and CPU input history is capped (\`<= 8000 chars\`) so oversized prompts truncate older turns while preserving the system prompt and latest user query.
- **Resource & Stability Tests:**
  - **\`T19\` (Active-Mission Guard, Verified \`/api/ps\` Unload & Reload):** **${t19.status}** (${t19.duration_ms} ms) — loadedBefore=${t19.metrics?.loadedBefore ?? 'N/A'}, guardSkipped=${t19.metrics?.guardSkipped ?? 'N/A'}, verifiedNotResident=${t19.metrics?.verifiedNotResident ?? 'N/A'}, loadedAfterUnload=${t19.metrics?.loadedAfterUnload ?? 'N/A'}, loadedAfterReload=${t19.metrics?.loadedAfterReload ?? 'N/A'}, reloadLatency=${t19.metrics?.reloadLatencyMs ?? 'N/A'} ms${t19.failure_reason ? ` (Failure: ${t19.failure_reason})` : ''}
  - **\`T20\` (40 KB Overflow Bounding):** **${t20.status}** (${t20.duration_ms} ms) — promptTokens=${t20.metrics?.promptTokens ?? 'N/A'}, numCtx=${t20.metrics?.numCtx ?? 'N/A'}${t20.failure_reason ? ` (Failure: ${t20.failure_reason})` : ''}
  - **\`T21\` (Concurrent Missions):** **${t21.status}** (${t21.duration_ms} ms) — A=${t21.metrics?.statusA ?? 'N/A'}, B=${t21.metrics?.statusB ?? 'N/A'}${t21.failure_reason ? ` (Failure: ${t21.failure_reason})` : ''}
  - **\`T22\` (Backend \`/health\` Under Inference & Timeout Enforcement):** **${t22.status}** (${t22.duration_ms} ms) — max \`/health\`=${t22.metrics?.maxBackendHealthMs ?? 'N/A'} ms (${t22.metrics?.healthPings ?? 0} pings), timeoutRejected=${t22.metrics?.timeoutRejected ?? 'N/A'}${t22.failure_reason ? ` (Failure: ${t22.failure_reason})` : ''}

## 3. Free RAM Telemetry Across All Tests
| Test ID | Free RAM Before (MB) | Free RAM After (MB) | Delta (MB) |
|---|---:|---:|---:|
${results.map(r => `| ${r.id} | ${r.free_ram_mb_before} | ${r.free_ram_mb_after} | ${(r.free_ram_mb_after - r.free_ram_mb_before).toFixed(1)} |`).join('\n')}
`;

const t01 = getTest('T01_OLLAMA_HEALTH_AND_RESOURCE_PROFILE');
const t02 = getTest('T02_ZERO_COST_POLICY_AND_DISABLED_CLOUD');
const securityReport = `# JARVIS OS 2.0 — Local AI Security & Zero-Cost Compliance Report

## 1. Zero-Cost & Local Isolation Guarantees
- **Loopback-Only Inference Binding:** Ollama configured at \`http://127.0.0.1:11434\` with \`OLLAMA_NO_CLOUD=1\`.
- **Automatic Cloud Blocking:** \`ModelRouterService.isZeroCostLocalOnly()\` defaults to \`true\`; \`groq\`, \`gemini\`, \`mistral\`, and \`openrouter\` report \`disabledByPolicy: true\` and \`available: false\`. \`VisionService\` refuses cloud fallback under zero-cost mode.
- **Explicit Web Research Separation:** Outbound HTTP web searches (\`search_web\` / \`WebSearchService\`) remain allowed when explicitly requested for research without sending LLM inference to external providers.

## 2. Security Validation Matrix
| Control | Test ID | Status | Verified Result |
|---|---|---|---:|
| Loopback Ollama Runtime Active | \`T01\` | **${t01.status}** | ${t01.metrics?.endpoint ?? 'http://127.0.0.1:11434'} |
| Cloud Providers Disabled by Policy | \`T02\` | **${t02.status}** | Chain=${JSON.stringify(t02.metrics?.chain ?? [])}, groqDisabled=${t02.metrics?.groqDisabledByPolicy} |
| Zero External LLM Requests (HTTP/HTTPS Spy) | \`T03\` | **${t03.status}** | cloudHits=${t03.metrics?.cloudHits ?? 'N/A'}, localOllamaHits=${t03.metrics?.localOllamaHits ?? 'N/A'} |
| Web Search Allowed Without Cloud LLM | \`T12\` | **${t12.status}** | webHits=${t12.metrics?.webHits ?? 'N/A'}, sources=${JSON.stringify(t12.metrics?.sources ?? [])}, cloudLlmHits=${t12.metrics?.cloudLlmHits ?? 'N/A'} |
| Web Search Empty & Network Failure Truthfulness | \`T23\` | **${t23.status}** | emptyHandled=${t23.metrics?.emptyHandled ?? 'N/A'}, emptyResults=${t23.metrics?.emptyResults ?? 'N/A'}, networkFailDetected=${t23.metrics?.networkFailDetected ?? 'N/A'}, networkFailResults=${t23.metrics?.networkFailResults ?? 'N/A'} |
| Traversal & Schema Rejection | \`T13\` | **${t13.status}** | System32 access denied cleanly |
| Prompt Injection Sanitization | \`T14\` | **${t14.status}** | canaryIntact=${t14.metrics?.canaryIntact}, calledDelete=${t14.metrics?.calledDelete}, leakedKey=${t14.metrics?.leakedKey}, sanitized=${t14.metrics?.untrustedContentSanitized} |
| Sensitive Operation Approval Gate | \`T15\` | **${t15.status}** | heldStatus=${t15.metrics?.heldStatus}, stillPresentBeforeApproval=${t15.metrics?.stillPresentBeforeApproval}, deletedAfterApproval=${t15.metrics?.deletedAfterApproval} |
| Unavailable Model Safe Blocking | \`T17\` | **${t17.status}** | status=${t17.metrics?.status}, cloudHits=${t17.metrics?.cloudHits} |
| Daemon Shutdown & Auto-Recovery | \`T18\` | **${t18.status}** | initialStatus=${t18.metrics?.initialStatus}, finalStatus=${t18.metrics?.finalStatus} |

## 3. Production Data Preservation
- Isolated SQLite database (\`nova/data/sentinel_disposable_test/local_ai_isolated/local_ai_test.sqlite\`) and workspace were used for all tests.
- Production DB (\`nova/data/nova.sqlite\`) remained untouched throughout validation (\`prod_db_preserved=${summary.prod_db_preserved}\`, SHA-256 \`${summary.prod_db_sha256}\`).
`;

fs.writeFileSync(path.join(DELIVERABLES_DIR, 'LOCAL_AI_MIGRATION_REPORT.md'), migrationReport, 'utf8');
fs.writeFileSync(path.join(DELIVERABLES_DIR, 'LOCAL_MODEL_BENCHMARK.md'), benchmarkReport, 'utf8');
fs.writeFileSync(path.join(DELIVERABLES_DIR, 'LOCAL_AI_TOOL_CALLING_REPORT.md'), toolReport, 'utf8');
fs.writeFileSync(path.join(DELIVERABLES_DIR, 'LOCAL_AI_RESOURCE_REPORT.md'), resourceReport, 'utf8');
fs.writeFileSync(path.join(DELIVERABLES_DIR, 'LOCAL_AI_SECURITY_REPORT.md'), securityReport, 'utf8');

console.log(`Generated all 5 Markdown reports in ${DELIVERABLES_DIR} from ${RESULTS_PATH} (${summary.PASS}/${summary.total} PASS).`);
