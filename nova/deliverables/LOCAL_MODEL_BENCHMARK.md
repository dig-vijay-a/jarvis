# JARVIS OS 2.0 — Local Model Benchmark Report

- **Model:** `qwen3.5:4b` (Q4_K_M, ~3.32 GB on disk)
- **Endpoint:** `http://127.0.0.1:11434`
- **Host Profile:** 12 logical CPUs, 15.72 GB RAM (CPU execution, `hasNvidiaGpu: false`, `numThreads: 8`)
- **Router Usage Telemetry:** 18 total logged router calls, 17 succeeded, 17617 total tokens (14776 prompt / 2841 completion), avg router latency `46124 ms`

## 1. Key Diagnostic Finding: Thinking Mode vs. JSON/Tool Latency
Before integrating `think: false` as the default in `OllamaProvider.buildPayload()`, direct probing on CPU showed `qwen3.5:4b` spent 256 hidden reasoning tokens (`1042` thinking chars) before emitting any visible content:
- `think` unset: `38,596 ms`, `eval_count=256`, empty content `""`
- `think: false`: `1,853 ms`, `eval_count=13`, valid JSON `{"ok": true, "tool": "search_files"}`

## 2. Measured Task Latencies from Validation Suite
| Benchmark Area | Test ID | Status | End-to-End Duration | Key Metrics |
|---|---|---|---:|---|
| Short Completion + Vision Guard | `T03` | **PASS** | 11806 ms | Model latency=11761 ms |
| Multi-turn Conversation Context | `T04` | **PASS** | 54695 ms | Turn 1 len=103 chars |
| NDJSON Token Streaming | `T05` | **PASS** | 8040 ms | 52 chunks, 53 tokens, 7987 ms |
| Structured Tool Calling | `T06` | **PASS** | 19933 ms | Tool=`get_system_telemetry`, latency=18397 ms |
| Multi-Step DAG Planning + Write | `T07` | **PASS** | 93243 ms | Steps=["hash_and_list_files","write_file"] |
| Dynamic Replanning | `T08` | **PASS** | 44995 ms | Replacement=`search_files` |
| Memory Retrieval & Synthesis | `T09` | **PASS** | 20531 ms | Grounded synthesis from DB memory |
| File Organization (SHA-256 Verified) | `T10` | **PASS** | 71591 ms | All hashes preserved=true |
| Coding Tests + Failure Analysis | `T11` | **PASS** | 198479 ms | Status=COMPLETED |
| External Web + Local Synthesis | `T12` | **PASS** | 27648 ms | 3 hits, latency=26424 ms |
| Shutdown & Restart Recovery | `T18` | **PASS** | 123259 ms | Resumed=1, final=COMPLETED |
| Model Unload & Reload | `T19` | **PASS** | 10387 ms | Reload latency=8989 ms |
| 40 KB Context Bounding | `T20` | **PASS** | 6796 ms | Prompt tokens=30, numCtx=4096 |
| Concurrent Missions | `T21` | **PASS** | 147721 ms | A=COMPLETED, B=COMPLETED |
| Responsiveness Under Load | `T22` | **PASS** | 18976 ms | Inference=18608 ms, max `/health`=24 ms |
