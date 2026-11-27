# SENTINEL STAGE 4 — SECURITY & ISOLATION VERIFICATION REPORT

| Security Control | Verification Result | Observed Evidence |
|---|---|---|
| **Localhost-Only Python Agent Binding** | **PASS** | `nova/python-agent/agent.py` binds `host="127.0.0.1"` (`0.0.0.0` absent). |
| **Unauthenticated Request Rejection** | **PASS** | Unauthenticated `GET http://127.0.0.1:8000/api/system/info` returned `HTTP 401`. |
| **EnvironmentalPerception Auth Remediation** | **PASS** | `environmentalPerceptionService.js` now reads `python_agent_token` and sends `Authorization: Bearer ...` (stopping recurring 401 poll failures). |
| **Allowlist Enforcement on Apps (`OBJ-11`)** | **PASS** | `QuantumNonexistentApp999` rejected with HTTP 400 by Python validator allowlist. |
| **Ambiguity Guard Without Guessing (`OBJ-12`)** | **PASS** | `"Launch that program for my project"` returned `NEEDS_CLARIFICATION` instead of blind `DIRECT_TOOL` execution. |
| **Production Database Isolation** | **PASS** | Isolated Stage 4 DB used (`stage4_operations.sqlite`); `nova/data/nova.sqlite` SHA-256 identical before & after: `31d8872fc3752a03b064a4376848532064cd2096e1fc839041fcb4f976219a7d`. |
| **Strict TLS Certificate Verification** | **PASS** | Loaded Windows System CA alongside Node root CAs via `tls.getCACertificates('system')` without disabling certificate validation. |
| **Scoped Workspace Path Guardrails** | **PASS** | New tools (`hash_and_list_files`, `organize_files_by_type`, `run_project_tests`) enforce allowlisted directory roots and block system/credential/production paths. |
