# JARVIS OS 2.0 — Phase 20: Autonomous Experimentation & Benchmark Report

## 1. Isolated Experimentation & Duplicate Prevention
- `Phase20EvolutionService.runControlledExperiment()` checks `evolution_experiments` for any active (`PENDING`/`RUNNING`) experiment on the same `skill_id` or existing experiment on the same `proposal_id`, throwing `DUPLICATE_EXPERIMENT_PREVENTED` (`T07`, `T08`).
- Clean candidate code executes inside a zero-privilege `vm.createContext` sandbox with a `300 ms` timeout (`T06`, `T23`).

## 2. Baseline vs. Candidate Benchmarking & Regression Detection
- Records `baseline_metrics_json` (`latency_ms`, `accuracy`) and `candidate_metrics_json`, computing a SHA-256 `provenance_hash`.
- Detects both latency regressions and accuracy regressions (`T09`), setting status to `REJECTED_REGRESSION` and `independent_verification_pass = 0`.
- Self-reported claims (`self_reported_claims: { improved: true, passed: true }`) cannot override independent verification (`T24`).

## 3. Adaptive Workflow Optimization & Rollback
- Preserves approval barriers and verification steps (`T30`).
- `rollbackWorkflowOptimization()` restores the original DAG and marks the optimization `ROLLED_BACK`.
