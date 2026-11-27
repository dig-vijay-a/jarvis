# PHASE 15 INTELLIGENCE QUALITY REPORT

- **Primary Model / Endpoint:** `qwen3.5:4b` at `http://127.0.0.1:11434` (`zero_cost_local_only: true`, `$0.00` cloud cost)
- **Measured Run:** `nova/run_phase15_benchmarks.js` (`2026-11-26T23:10:57.664Z`) -> **26/26 PASS (100%)**
- **Telemetry Window:** `13` successful DB-logged inference requests (`7,146` prompt tokens, `2,867` completion tokens, `10,013` total tokens)

## 1. Intelligence Quality Benchmarks (P6: `B11`–`B17` + `B02`, `B04`, `B10`)

| Test ID | Dimension Evaluated | Observed Result | Duration | Evidence / Metrics |
|---|---|---|---:|---|
| `B02` | 7-Class Complexity Routing | **PASS** | `7 ms` | Exact match across all 7 classes (`simple_conversation`, `memory_retrieval`, `single_tool_operation`, `multi_tool_mission`, `research_synthesis`, `coding_debugging`, `complex_reasoning`) |
| `B04` | Memory Privacy, Dedup & Provenance | **PASS** | `15 ms` | `12 ms` lookup across 60+ seeded memories, `hitCount: 5`, `leakedSecret: false`, `dupCount: 1`, `hasProvenance: true` |
| `B10` | Parallel Independent DAG Steps | **PASS** | `59,518 ms` | `parallelUsed: true`, verified `COMPLETED` contract with combined inventory report across `parallel_a` and `parallel_b` |
| `B11` | Structured JSON Instruction Following | **PASS** | `3,823 ms` | Valid JSON schema `{"protocol": "HTTPS", "port": 443}` (`numCtx=2048, maxTokens=60`) |
| `B12` | Tool Selection Accuracy | **PASS** | `43,934 ms` | Selected `search_files` with compact scoped tool schemas |
| `B13` | Invalid Arguments & Tool Rejection | **PASS** | `0 ms` | Rejected missing `content` on `write_file` and unregistered `nonexistent_shell_exec` cleanly |
| `B14` | End-to-End Memory Recall (Orchestrator) | **PASS** | `19,189 ms` | Recalled seeded Project Alpha fact via Orchestrator -> `"The codename for Project Alpha is **STARLIGHT-9**."` (`contractStatus: COMPLETED`) |
| `B15` | Coding Bug Discovery & Fix Synthesis | **PASS** | `284,284 ms` | Inspected isolated `buggy_repo`, identified `calculateInvoiceTotal` flat subtraction defect, wrote `1,819`-byte fix report proposing `(1 - discountRate)`, passed Stage 4.1 contract (`COMPLETED`) |
| `B16` | Live Web Research & Source Attribution | **PASS** | `126,734 ms` | Executed live `search_web` + local `qwen3.5:4b` synthesis citing verified `https://en.wikipedia.org/wiki/WebAuthn` URL without fabricating sources (`COMPLETED`) |
| `B17` | Clean Dynamic DAG Replanning | **PASS** | `52,894 ms` | Replaced failed `read_file` step with `search_files` (`replanned: true`) — zero heuristic or telemetry filler |

## 2. Telemetry Distribution by Task Class & Phase

| Breakdown Dimension | Bucket | Count | Avg Latency (`ms`) | Avg `num_ctx` / `tok/s` |
|---|---|---:|---:|---:|
| **By Phase (`byPhase`)** | `chat` | 5 | `34,949.8` | `6.26 tok/s` |
| | `planning` | 4 | `79,202.0` | `6.14 tok/s` |
| | `synthesis` | 3 | `76,461.7` | `6.23 tok/s` |
| | `tool_selection` | 1 | `25,337.0` | `6.72 tok/s` |
| **By Class (`byTaskClass`)** | `memory_retrieval` | 1 | `18,761.0` | `2048` ctx |
| | `single_tool_operation` | 1 | `25,337.0` | `2560` ctx |
| | `simple_conversation` | 3 | `35,445.7` | `2219` avg ctx |
| | `multi_tool_mission` | 4 | `61,800.5` | `3072` ctx |
| | `research_synthesis` | 2 | `62,215.5` | `3072` ctx |
| | `coding_debugging` | 2 | `112,105.5` | `3072` ctx |

## 3. Verification Note on `B14` Diagnosis
- An initial benchmark run (`25/26`) flagged `B14` because `run_phase15_benchmarks.js` checked `resp.response` instead of `Orchestrator.processMessage`'s documented return field `resp.content`. Fixing the field check (`resp.content || resp.response`) confirmed `Orchestrator` already recalled `STARLIGHT-9` natively under `compact: true, numCtx: 2048` in `19,189 ms` (`26/26 PASS`).
