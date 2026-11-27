# JARVIS OS 2.0 — Local AI Resource Management Report

## 1. Detected Host Hardware Profile
- **Total RAM:** 15.72 GB
- **Free RAM (end of suite):** 2.29 GB
- **Logical CPUs:** 12 (configured `num_thread: 8`)
- **Discrete NVIDIA GPU:** No (CPU / Intel Iris Xe iGPU host; Ollama runs `qwen3.5:4b` in CPU mode)
- **Configured Limits:** `OLLAMA_MAX_LOADED_MODELS=1`, `keep_alive=5m`, `recommendedCtx=4096`, `inferenceTimeoutMs=120000`

## 2. Memory, Context & Responsiveness Controls
- **Single Resident Model Enforcement:** Daemon launched with `OLLAMA_MAX_LOADED_MODELS=1`; `ensureSingleLoadedModel()` unloads competing tags before loading a new model.
- **CPU-Safe Input & Context Bounding:** `recommendedCtx` adapts dynamically (`4096` on constrained RAM, `6144` when `>= 5.0 GB` free, `8192` on GPU VRAM `>= 6.5 GB`), and CPU input history is capped (`<= 8000 chars`) so oversized prompts truncate older turns while preserving the system prompt and latest user query.
- **Resource & Stability Tests:**
  - **`T19` (Active-Mission Guard, Verified `/api/ps` Unload & Reload):** **PASS** (10387 ms) — loadedBefore=1, guardSkipped=true, verifiedNotResident=true, loadedAfterUnload=0, loadedAfterReload=1, reloadLatency=8989 ms
  - **`T20` (40 KB Overflow Bounding):** **PASS** (6796 ms) — promptTokens=30, numCtx=4096
  - **`T21` (Concurrent Missions):** **PASS** (147721 ms) — A=COMPLETED, B=COMPLETED
  - **`T22` (Backend `/health` Under Inference & Timeout Enforcement):** **PASS** (18976 ms) — max `/health`=24 ms (89 pings), timeoutRejected=true

## 3. Free RAM Telemetry Across All Tests
| Test ID | Free RAM Before (MB) | Free RAM After (MB) | Delta (MB) |
|---|---:|---:|---:|
| T01_OLLAMA_HEALTH_AND_RESOURCE_PROFILE | 5620 | 5619.4 | -0.6 |
| T02_ZERO_COST_POLICY_AND_DISABLED_CLOUD | 5619.4 | 5620.1 | 0.7 |
| T03_NO_EXTERNAL_INFERENCE_NETWORK_REQUESTS | 5620.1 | 2352.4 | -3267.7 |
| T04_BASIC_CONVERSATION_AND_CONTEXT | 2352.5 | 2534 | 181.5 |
| T05_STREAMING_RESPONSE | 2534 | 2438.6 | -95.4 |
| T06_STRUCTURED_TOOL_CALLING | 2438.6 | 2332.9 | -105.7 |
| T07_MULTI_STEP_MISSION_PLANNING_AND_DAG | 2332.9 | 2463 | 130.1 |
| T08_DYNAMIC_REPLANNING | 2463.1 | 2064.4 | -398.7 |
| T09_MEMORY_RETRIEVAL_AND_SYNTHESIS | 2064.4 | 2252.5 | 188.1 |
| T10_FILE_OPERATIONS | 2252.5 | 2380.2 | 127.7 |
| T11_CODING_TASK_AND_TESTS | 2380.2 | 1585 | -795.2 |
| T12_RESEARCH_SYNTHESIS_WITH_WEB_ALLOWED | 1585 | 1234.8 | -350.2 |
| T13_INVALID_TOOL_ARGUMENTS | 1234.8 | 1234.7 | -0.1 |
| T14_PROMPT_INJECTION_RESISTANCE | 1234.7 | 410.4 | -824.3 |
| T15_APPROVAL_GATE_ENFORCEMENT | 410 | 417 | 7.0 |
| T16_ANTI_FAKE_COMPLETION_HEURISTIC_REMOVAL | 417 | 410.4 | -6.6 |
| T17_MODEL_UNAVAILABLE_BLOCKED | 410.4 | 406.4 | -4.0 |
| T18_PROVIDER_SHUTDOWN_AND_RECOVERY | 406.4 | 2575.8 | 2169.4 |
| T19_SINGLE_MODEL_MEMORY_MANAGEMENT_AND_UNLOAD | 2575.8 | 2710.3 | 134.5 |
| T20_CONTEXT_OVERFLOW_BOUNDING | 2710.3 | 2781.4 | 71.1 |
| T21_CONCURRENT_MISSIONS | 2781.4 | 2565.2 | -216.2 |
| T22_LONG_RUNNING_INFERENCE_AND_RESPONSIVENESS | 2565.2 | 2347.2 | -218.0 |
| T23_WEB_SEARCH_EMPTY_AND_NETWORK_FAILURE | 2347.2 | 2347.2 | 0.0 |
