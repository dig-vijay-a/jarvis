# PHASE 15 OPTIMIZATION REPORT — ZERO-COST LOCAL AI PERFORMANCE TUNING

- **Primary Model / Endpoint:** `qwen3.5:4b` at `http://127.0.0.1:11434` (`think: false`, CPU-only inference)
- **Host Hardware:** 12 logical CPUs, `15.72 GB` RAM, `hasNvidiaGpu: false`
- **Verification Suite:** `nova/run_phase15_benchmarks.js` -> **26/26 PASS (100%)** (`2026-11-26T23:10:57.664Z`)
- **Production Database Integrity:** `4018871d0a62bb7ff0be9c857f69517a3b406187365227e35697c47f1d84afc0` (Preserved byte-for-byte)

## 1. Implemented Optimizations (Zero Extra Models)

1. **Inference Runtime & CPU Threading (`ollamaProvider.js`, `.env`, `backend/.env`):**
   - Increased optimal CPU thread allocation from `8` to `10` (`Math.min(10, Math.max(2, logicalCpus - 2))`) based on measured 6–12 thread sweep (`B01`).
   - Extended `OLLAMA_KEEP_ALIVE` from `5m` to `10m` across runtime configuration and `OllamaProvider` so loaded weights survive multi-step DAG planning and synthesis without hitting `13.7–14.0 s` reloads.
   - Bounded CPU KV-cache context length cleanly (`num_ctx <= 4096`; `recommendedCtx = 3072` under tight RAM `2.16 GB` free during `B01`), with per-request `numCtx` overrides (`2048`–`4096`).
   - Enforced single-resident model execution (`maxLoadedModels: 1`).
   - Added token/timing telemetry extraction (`ttftMs`, `tokensPerSec`, `promptTokensPerSec`, `evalDurationMs`, `promptEvalDurationMs`, `numCtx`, `numThreads`).

2. **7-Class Task Complexity Classifier & Dynamic Context Sizing (`modelRouterService.js`):**
   - Implemented deterministic heuristic `classifyTaskComplexity(userText)` classifying all 7 workload classes with zero extra LLM calls (`B02`):
     `simple_conversation`, `memory_retrieval`, `single_tool_operation`, `multi_tool_mission`, `research_synthesis`, `coding_debugging`, `complex_reasoning`.
   - Routes lightweight turns (`simple_conversation`, `memory_retrieval`) to `numCtx=2048`, `maxTokens=256`, `useCompactPrompt=true`, `includeTools=false` (`B02`, `B06`).
   - Implemented `compactToolSchemas()` shrinking single-tool schema JSON size from `2,433` to `2,017` chars while keeping types and `required` arrays intact (`B05`).

3. **Prompt & Memory Efficiency (`prompts.js`, `memoryIntelligenceService.js`, `orchestrator.js`):**
   - Added `COMPACT_SYSTEM_PROMPT` and line/memory deduplication (`B03`: `1,603 -> 358` chars, **77.7% reduction**; `B06` prompt tokens: `373 -> 93`).
   - Scoped turn-level tool injection in `Orchestrator.processMessage` rather than attaching all registry schemas (`B07`).
   - Enforced secret/credential filtering (`isPrivateMemoryRecord()`), semantic near-duplicate suppression (`>= 0.5` similarity), score filtering, and explicit provenance metadata in `retrieveRelevantMemories()` (`B04`: `12 ms`, 0 leaked secrets).

4. **Domain-Scoped Planning & Parallel DAG Execution (`missionControlService.js`):**
   - Scoped planning catalog to relevant domains and compressed planning/synthesis instructions (`maxTokens: 780`, `numCtx: 3584`) (`B08`).
   - Added concurrent execution (`Promise.all`, batch size up to 3) for non-conflicting read-only/independent DAG steps marked `parallelEligible` while preserving Stage 4.1 verification contracts (`B10`).

5. **Real-Time Telemetry Persistence & Dashboard (`modelRouterService.js`, `routing.js`, `PerformanceIntelligenceCard.jsx`):**
   - Added `ttft_ms`, `tokens_per_sec`, `prompt_tokens_per_sec`, `task_class`, `num_ctx`, `phase_type` columns on `ai_usage_logs` and exposed `GET /api/routing/telemetry-metrics` (`B24`) plus live UI card built in `nova/frontend`.

## 2. Empirical Before-vs-After Comparison

| Metric | Baseline (`run_phase15_baseline.js`) | Optimized (`run_phase15_benchmarks.js`) | Measured Change | Benchmark ID |
|---|---:|---:|---:|---|
| **Streaming Chat TTFT** | `20,460 ms` | `2,199 ms` | **-89.3%** (`9.3x` faster) | `B06` |
| **Streaming Chat Total** | `27,090 ms` | `10,884 ms` | **-59.8%** (`2.49x` faster) | `B06` |
| **Streaming Prompt Tokens** | `373` | `93` | **-75.1%** | `B06` |
| **Single-Tool Selection** | `33,603 ms` | `25,337 ms` | **-24.6%** | `B07` |
| **DAG Mission Planning** | `89,664 ms` | `74,139 ms` | **-17.3%** | `B08` |
| **Multi-Step Mission (2-step)** | `126,641 ms` | `65,218 ms` | **-48.5%** (`1.94x` faster) | `B09` |
| **Peak RAM Usage** | `15.14 GB` | `14.52 GB` | **-0.62 GB** | Suite RAM tracker |

## 3. Honest Remaining Bottlenecks & Constraints

- **Raw CPU Decode Throughput (`~6.25–7.37 tok/s`):** On 12 logical CPUs with no discrete GPU (`hasNvidiaGpu: false`), token generation speed is memory-bandwidth bound (`telemetry.summary.avg_tokens_per_sec = 6.25 tok/s` across 13 logged suite calls vs `7.39 tok/s` short baseline). Prompt/context compaction cut total latency substantially without accelerating raw per-token silicon throughput.
- **Non-Streaming Internal Phase Latency:** `chatCompletion` awaits full generation for planning (`avg 79,202 ms`) and synthesis (`avg 76,461.7 ms`), yielding `avg_ttft_ms = 57,343.5 ms` across non-streaming calls (`p95 = 117,280 ms`). Long analytical coding missions (`B15`: `284,284 ms`) still take multiple minutes on CPU.
- **Model Reload Cost:** Unload verification is fast, but full reload into system RAM still takes `13,699 ms` (`B25`), making `keepAlive='10m'` critical to avoid mid-mission eviction.
