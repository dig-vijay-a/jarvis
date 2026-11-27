# SENTINEL STAGE 4.1 — FAILURES, DEFECTS & RUNTIME OBSERVATIONS

- **Final Validation Run:** `22 / 22 PASS` (`0 FAIL`) recorded in `SENTINEL_STAGE_4_1_METRICS.json` (`2026-11-26T22:07:40.079Z`).
- Below is the honest record of every code defect uncovered during Stage 4.1 development runs and every architectural/hardware observation noted during testing.

## 1. Defects Uncovered During Stage 4.1 Pre-Pass Runs (Resolved Before Final Run)

1. **Unwired DAG Dependencies Leaving Literal `{{SYNTHESIZE_FROM_DEPS}}` (`T01`, `T03`)**
   - **Symptom:** `qwen3.5:4b` emitted `write_file` with `content: "{{SYNTHESIZE_FROM_DEPS}}"` and `depends_on: []`, or emitted `read_file` with angle-bracket placeholders (`<path_to_invoice_calculation_file>`). `MissionControlService.synthesizeStepInputs()` skipped placeholder synthesis when `depends_on` was empty.
   - **Truthful Contract Check Impact:** `verifyMissionAcceptanceContract()` caught the unresolved template placeholder and blocked `COMPLETED` (`PARTIALLY_VERIFIED`), confirming P0 integrity worked even while exposing the wiring bug.
   - **Resolution:** Auto-wired `depends_on` in `planMissionStepsWithLLM()` for placeholder/output steps, and extended `synthesizeStepInputs()` to resolve both `{{...}}` and `<...>` path placeholders plus gather prior verified inspection/search steps cleanly.

2. **Synthesis `maxTokens: 450` Mid-Sentence Truncation (`T01`, `T02`, `T04`)**
   - **Symptom:** Once `ModelRouterService.generateWithFallback()` properly forwarded `maxTokens` and `temperature` to `OllamaProvider`, 450-token synthesis outputs truncated multi-document summaries (`T01`), multi-file symbol tables (`T02`), and trailing `https://` source sections (`T04`).
   - **Resolution:** Raised `synthesizeStepInputs()` synthesis cap to `maxTokens: 950`, compacted redundant absolute directory/SHA-256 fields in upstream prompt evidence, and appended verbatim retrieved `https://` URLs under `## Verified Sources` if omitted by model prose.

3. **Missing `import path` and Short Timeouts in Desktop Verification (`T18`, `T19`, `T20`)**
   - **Symptom:** `truthfulVerificationService.js` lacked `import path from 'path'`, throwing `ReferenceError` on `open_file`. Additionally, `desktop.py`'s `inspect_app_state()` queried `memory_info`/`status` across every running Windows OS process, exceeding `truthfulVerificationService`'s 4s timeout, and cold `notepad.exe <file>` launches without active Store Notepad host missed the 2.8s window check.
   - **Resolution:** Added `import path from 'path'`, filtered `psutil.process_iter(['pid', 'name'])` before querying `memory_info` on matches only, increased desktop probe timeouts to `10s–12s`, and activated Windows 11 Store Notepad host in `files.py` when launching `.txt`/`.log`/`.md`/`.json` files.

4. **Resident Model RAM Guard False Positive During Multi-Mission Recovery (`T13`)**
   - **Symptom:** On the ~16 GB RAM host while `qwen3.5:4b` was actively loaded, transient free RAM dipped to `0.39 GB`, triggering the static `0.5 GB` cold-load floor on the 3rd recovered mission.
   - **Resolution:** Updated `ensureLocalModelReady()` to differentiate cold loading (`0.45 GB` required) from resident inference when `qwen3.5:4b` is already loaded in `/api/ps` (`0.15 GB` free RAM floor unless explicitly overridden by `MIN_REQUIRED_FREE_RAM_GB`).

5. **Test Script Sensitive Tool Name Mismatch & Wait Budget (`T03`, `T05`, `T06`, `T17`)**
   - **Symptom:** `T17` tested `rename_file` (not registered in `ToolRegistry`) instead of registered sensitive tool `delete_memory`, and `T03`/`T05`/`T06` hardcoded `150s` `waitForMission` budgets while CPU multi-step inference took `205s–235s`.
   - **Resolution:** Updated `T17` to verify `WAITING_FOR_APPROVAL` and operator approval with `delete_memory`, and aligned `waitForMission` budgets to `440s`.

## 2. Residual Constraints Entering Phase 15
- **CPU Inference Latency Baseline:** Average Ollama router latency across Stage 4.1 (`25` calls) was `104,488 ms` (`~172s–235s` end-to-end per multi-step mission), and free OS RAM fell to `0.04 GB` at peak multi-mission completion (`SENTINEL_STAGE_4_1_METRICS.json` `hardware.freeRamGB`). Optimizing prompt size, tool schemas, context caching, and inference speed is the primary target for Phase 15.
