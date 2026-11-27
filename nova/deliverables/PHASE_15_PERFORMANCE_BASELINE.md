# PHASE 15 P1 — PRE-OPTIMIZATION PERFORMANCE BASELINE

- **Profiled Timestamp:** `2026-11-26T22:16:12Z` (via `nova/run_phase15_baseline.js`)
- **Hardware:** 12 logical CPUs, 15.72 GB RAM, CPU-only inference (`hasNvidiaGpu: false`)
- **Primary Model / Endpoint:** `qwen3.5:4b` at `http://127.0.0.1:11434` (`think: false`, `keep_alive: 5m`)
- **Production DB Status:** `4018871d0a62bb7ff0be9c857f69517a3b406187365227e35697c47f1d84afc0` (Preserved)

## 1. Measured Baseline Telemetry

| Metric | Baseline Measurement | Notes |
|---|---:|---|
| **Streaming Chat TTFT** | `20,460 ms` (`20.46 s`) | 373 prompt tokens (`num_ctx=4096`, `num_thread=8`) |
| **Streaming Chat Total Latency** | `27,090 ms` (`27.09 s`) | 48 chunks, 49 completion tokens (`287` chars) |
| **Generation Throughput** | `7.39 tok/s` | Ollama `eval_count / eval_duration` |
| **Prompt Evaluation Throughput** | `46.10 tok/s` | Ollama `prompt_eval_count / prompt_eval_duration` |
| **Tool Selection Latency** | `33,603 ms` (`33.60 s`) | Selected `['get_system_telemetry']` across 7 tool schemas |
| **Mission Planning Latency** | `89,664 ms` (`89.66 s`) | Full DAG plan (`['hash_and_list_files', 'write_file']`) |
| **Multi-Step Mission Duration** | `126,641 ms` (`126.64 s`) | End-to-end 2-step mission (`COMPLETED`) |
| **Memory Retrieval Latency** | `11 ms` | Query across 60 SQLite memory rows (5 hits) |
| **Cold Model Load Latency** | `13,978 ms` (`13.98 s`) | Unloaded -> first ping completion |
| **Warm Reload Latency** | `13,927 ms` (`13.93 s`) | Unloaded -> reload completion |
| **Verified Model Unload Latency** | `259 ms` | Verified non-resident in `/api/ps` (`true`) |
| **Configured Context Length** | `4096 tokens` | Adaptive fallback on CPU RAM profile |
| **Idle RAM Used / Free** | `10.36 GB used` / `5.36 GB free` | Before model residency |
| **Peak RAM Used / Min Free** | `15.14 GB used` / `0.58 GB free` | During active local model mission |

## 2. Primary Bottlenecks Identified for Optimization
1. **Mission Planning Prompt Bloat (`89,664 ms`):** Emits unfiltered tool descriptions, verbose instructions, and long schema rules on every planning turn regardless of objective domain.
2. **Tool Schema Overhead (`33,603 ms`):** Attaches verbose JSON schemas for 7+ tools on single-tool queries without compacting descriptions or task-class scoping.
3. **Oversized System Prompt on Simple Turns (`373` baseline system tokens -> `20,460 ms` TTFT):** Attaches heavyweight multi-domain instructions, recent activity logs, and persona text even to simple factual queries or memory lookups.
4. **Telemetry Observability Gaps:** Pre-Phase 15 `ai_usage_logs` and Dashboard lack TTFT, tokens/sec, task-complexity class, active `num_ctx`, and planning/verification breakdown endpoints.
