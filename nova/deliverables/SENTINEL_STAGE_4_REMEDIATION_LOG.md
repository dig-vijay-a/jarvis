# SENTINEL STAGE 4 — DEFECT & REMEDIATION LOG

All baseline evidence was captured FIRST in `nova/data/sentinel_disposable_test/stage4_isolated/stage4_baseline_snapshot.json` (`0/20 PASS | 20 FAIL`) prior to any source modification.

## Baseline Defects Found & Minimal Fixes Applied

1. **Cloud Provider TLS & Default Model Deprecation (`GroqProvider.js`, `OpenAICompatibleProvider.js`, `GeminiProvider.js`, `ModelRouterService.js`)**
   - *Root Cause:* Node failed Groq HTTPS with `SELF_SIGNED_CERT_IN_CHAIN`; Groq key did not authorize `llama-3.3-70b-versatile` (`404`, while `openai/gpt-oss-120b` worked); Gemini defaulted to retired `gemini-2.5-flash` (`404`); `ModelRouterService` lacked short rate-limit cooldowns.
   - *Minimal Fix:* Enabled `tls.getCACertificates('system')` `https.Agent` cleanly (strict TLS retained), updated Groq/Gemini active model lists with 404/503 model fallback, and added bounded 10s/120s cooldowns on `QUOTA_EXCEEDED`.
   - *Verification:* Groq and Gemini executed live DAG planning & synthesis cleanly until free-tier RPM/TPM limits were exhausted.

2. **Unlabeled Synthetic Empty Fallback in `WebSearchService` (`webSearchService.js`)**
   - *Root Cause:* DuckDuckGo HTML scraping timed out / returned 0 `.result` elements and emitted fake `"Synthesized intelligence for: ..."` boilerplate.
   - *Minimal Fix:* Replaced fake boilerplate with parallel live DuckDuckGo HTML + DuckDuckGo Instant API + Wikipedia MediaWiki Search API lookups (returning real `https://en.wikipedia.org/wiki/...` URLs), returning `[]` on failure instead of fabricated text. `TruthfulVerificationService` also updated to check `data.sources` and require `>= 1` source.
   - *Verification:* Live Wikipedia URLs returned & cited in `OBJ-13, 14, 15`.

3. **Ambiguous Anaphoric App Launch Misclassification (`orchestrator.js`)**
   - *Root Cause:* `"Launch that program for my project"` bypassed Rule 10 and fell into Rule 12 `UNKNOWN -> DIRECT_TOOL (open_application)`.
   - *Minimal Fix:* Expanded Rule 10 + added demonstrative/generic phrase guard in Rule 12 to return `NEEDS_CLARIFICATION`.
   - *Verification:* `OBJ-12` transitioned `FAIL -> PASS` (`199ms`, `NEEDS_CLARIFICATION`).

4. **Missing Scoped File/Test Tools & Static Plan Disconnection (`registry.js`, `truthfulVerificationService.js`, `missionControlService.js`)**
   - *Root Cause:* `ToolRegistry` lacked recursive SHA-256 listing, safe file organization, and bounded test execution; `planningPrompt` listed only 8 example tools and omitted schemas; downstream `write_file` steps received static placeholders; heuristic matched `"content hashes"` to YouTube screenplays (`OBJ-02`).
   - *Minimal Fix:* Added `hash_and_list_files`, `organize_files_by_type`, and `run_project_tests` with strict allowlist boundaries + postcondition checks; injected compact live tool catalog into `planningPrompt`; added `synthesizeStepInputs()` for runtime upstream-to-downstream synthesis + deterministic inventory/test table formatting; fixed `"content"` heuristic regex, added JSON fence/trailing-comma repair, normalized numeric `importance` & tool arg aliases.
   - *Verification:* `OBJ-01, 02, 03, 07, 08, 16, 18, 19, 20` moved from `FAIL -> PASS`.

5. **EnvironmentalPerception 401 Polling Auth (`environmentalPerceptionService.js`) & Store Notepad Launch (`files.py`)**
   - *Root Cause:* `pollWindowAndSystemState()` omitted `Authorization: Bearer ...` when polling `127.0.0.1:8000`; Windows 11 `.txt` `os.startfile` relied on broken `txtfilelegacy` vs Store Notepad async launch.
   - *Minimal Fix:* Passed token from DB `settings` in perception poll; used `notepad.exe` Popen for `.txt`/`.log` files.

## Unresolved System Limitations Documented (No Masking)
- Free-tier cloud quota saturation (`Groq` TPM + `Gemini` 429 + `Mistral` 402 + no local `Ollama`) caused 6 final-run objectives (`OBJ-04, 05, 06, 14, 15, 17`) to fall back to generic heuristics that completed without requested files.
- Windows 11 UWP Calculator (`OBJ-09`) and Store Notepad (`OBJ-10`) window visibility via `EnumWindows` remain intermittent under fast polling -> `PARTIALLY_VERIFIED`.
