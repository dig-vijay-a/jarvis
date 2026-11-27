# SENTINEL STAGE 4 — TOOL EXECUTION REPORT

## Tool Invocation Summary (Final Run)

| Tool Name | Invocations | Verified | Other/Failed/Skipped |
|---|---:|---:|---:|
| `write_file` | 11 | 8 | 3 |
| `list_open_windows` | 7 | 6 | 1 |
| `save_memory` | 7 | 5 | 2 |
| `hash_and_list_files` | 6 | 6 | 0 |
| `open_file` | 6 | 5 | 1 |
| `get_system_telemetry` | 5 | 5 | 0 |
| `search_web` | 5 | 5 | 0 |
| `open_application` | 5 | 5 | 0 |
| `search_files` | 4 | 4 | 0 |
| `read_file` | 3 | 3 | 0 |
| `organize_files_by_type` | 1 | 1 | 0 |
| `run_project_tests` | 1 | 1 | 0 |
| `conduct_deep_research` | 1 | 1 | 0 |
| `query_memories` | 1 | 1 | 0 |
| `create_task` | 1 | 0 | 1 |

## Key Tool Observations
- **New Scoped Tools Added During Stage 4 Remediation:** `hash_and_list_files`, `organize_files_by_type`, `run_project_tests` (all enforce workspace/user-home path boundaries and never mutate protected paths or prior deliverables).
- **TruthfulVerificationService Verification:** `write_file` byte+content equality, `read_file` content length, `run_project_tests` TAP output (`exit_code=1, pass=1, fail=1`, catching `109.89 !== 99`), `organize_files_by_type` SHA-256 preservation across 6 files, and `search_web`/`conduct_deep_research` requiring `>=1` real live URL.
- **Desktop GUI Limitations (`OBJ-09`, `OBJ-10`):** Win32 `EnumWindows` (`list_open_windows`) confirmed Store Notepad active in `OBJ-09` (`Notepad active=true`), while Windows 11 Calculator UWP frame (`OBJ-09`) and async `.txt` Notepad launch (`OBJ-10`) remained unconfirmed within the polling interval -> graded honestly as `PARTIALLY_VERIFIED`.
