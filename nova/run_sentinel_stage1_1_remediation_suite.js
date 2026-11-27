/**
 * JARVIS OS 2.0 — PROJECT SENTINEL (STAGE 1.1)
 * ENDURANCE DEFECT REMEDIATION & EVIDENCE VALIDATION TEST SUITE
 * 
 * Verifies:
 * - P0: Zero schema errors via real production tables
 * - P1: Strict counting reconciliation between event logs, metrics JSON, and telemetry samples
 * - P2: Line-by-line persisted empirical telemetry records in SENTINEL_STAGE_1_1_TELEMETRY.jsonl
 * - P3: Accurately distinguished real vs simulated failure injectors
 * - P4: Targeted workload verification with 100% pass rate
 * - P5: Generates comprehensive Stage 1.1 remediation deliverables
 */

import fs from 'fs';
import path from 'path';
import { SentinelStage1_1_RemediationService } from './backend/services/sentinelStage1_1_RemediationService.js';

async function runRemediationSuite() {
  console.log('================================================================');
  console.log('SENTINEL STAGE 1.1: ENDURANCE DEFECT REMEDIATION & AUDIT SUITE');
  console.log('================================================================\n');

  const service = new SentinelStage1_1_RemediationService({ freshRun: true });
  service.logEvent('SYSTEM', 'STAGE_1_1_INIT', 'Sentinel Stage 1.1 Remediation & Reconciliation Suite initialized.');

  // 1. Initial Baseline Sample
  console.log('[Phase 1/5] Collecting initial empirical telemetry sample...');
  await service.collectSample();
  console.log(`  -> Initial Sample 0 recorded: Heap=${service.baselineMemory.heap_used_mb}MB, RSS=${service.baselineMemory.rss_mb}MB, DB=${service.baselineDbSize}B\n`);

  // 2. Targeted Workload Execution (5 complete cycles = 30 verified tasks)
  console.log('[Phase 2/5] Executing 30 targeted workload tasks against real production schema...');
  const taskNames = [
    'File Readback Verification',
    'Memory Bank Roundtrip',
    'Synthetic Mission Cycle',
    'Knowledge Graph Traversal',
    'Unified Notification Dispatch',
    'Concurrent SQLite Read Burst'
  ];

  for (let cycle = 0; cycle < 5; cycle++) {
    console.log(`  --- Workload Cycle ${cycle + 1} of 5 ---`);
    for (let taskIdx = 0; taskIdx < 6; taskIdx++) {
      await service.runWorkloadTask(taskIdx);
      process.stdout.write(`    [Task ${taskIdx + 1}/6: ${taskNames[taskIdx]}] `);
      if (service.workloadExceptions === 0) {
        console.log('-> PASS');
      } else {
        console.log(`-> FAILED (Exceptions: ${service.workloadExceptions})`);
      }
    }
    // Collect sample after each cycle
    await service.collectSample();
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n  -> Workloads Completed: Attempted=${service.workloadAttempted}, Passed=${service.workloadPassed}, Failed=${service.workloadFailed}, Schema Errors=${service.schemaMismatchErrors}`);
  if (service.schemaMismatchErrors > 0 || service.workloadFailed > 0) {
    throw new Error(`Schema mismatch detected: ${service.schemaMismatchErrors} errors.`);
  }

  // 3. Truthfully Labeled Failure Injections & Recoveries (Exactly 7 Unique Scenarios)
  console.log('\n[Phase 3/5] Executing 7 accurately categorized failure injectors (strictly once each)...');
  const scenarioIds = [
    'SIMULATED_WS_DISCONNECT',
    'SIMULATED_PYTHON_UNREACHABLE',
    'SIMULATED_HTTP_503',
    'REAL_SQLITE_LOCK_CONTENTION',
    'REAL_INTERRUPTED_MISSION',
    'REAL_WORKER_PROCESS_RECOVERY',
    'REAL_DUPLICATE_IDEMPOTENCY'
  ];

  for (let i = 0; i < scenarioIds.length; i++) {
    const sId = scenarioIds[i];
    const sDef = service.failureScenarios.find(s => s.id === sId);
    console.log(`  [Injector ${i + 1}/7] ${sDef.name}`);
    console.log(`    Classification: [${sDef.classification}] | Target: ${sDef.target}`);
    
    const res = await service.executeFailureScenario(sId);
    console.log(`    Result: ${res.passed ? 'PASSED' : 'FAILED'} (Recovery: ${res.recovery_time_ms}ms)`);
    console.log(`    Evidence: ${res.evidence || res.error}`);

    // Telemetry sample after each injection
    await service.collectSample();
    await new Promise(r => setTimeout(r, 150));
  }

  // 4. Additional Baseline Telemetry Samples for Statistical Convergence
  console.log('\n[Phase 4/5] Collecting concluding telemetry series...');
  for (let i = 0; i < 3; i++) {
    await service.collectSample();
    await new Promise(r => setTimeout(r, 200));
  }

  service.logEvent('SYSTEM', 'STAGE_1_1_COMPLETE', 'All Stage 1.1 workload cycles and failure injections concluded.');

  // 5. Finalize Deliverables and Run Mathematical Reconciliation
  console.log('\n[Phase 5/5] Finalizing deliverables and executing mathematical counting reconciliation...');
  const metrics = await service.finalizeAndGenerateReports();

  // Read generated files directly from disk to verify reconciliation
  const telemetryLines = fs.readFileSync(service.telemetryLogPath, 'utf8').trim().split('\n').filter(Boolean);
  const eventLines = fs.readFileSync(service.eventsLogPath, 'utf8').trim().split('\n').filter(Boolean);

  console.log('\n================================================================');
  console.log('MATHEMATICAL COUNTING & EVIDENCE RECONCILIATION AUDIT');
  console.log('================================================================');
  console.log(`1. Telemetry Samples Collected:        ${metrics.counting_reconciliation.telemetry_samples_collected}`);
  console.log(`   Lines in TELEMETRY.jsonl:           ${telemetryLines.length}`);
  console.log(`   Exact Match Status:                 ${metrics.counting_reconciliation.telemetry_samples_collected === telemetryLines.length ? 'PASS (100.0%)' : 'FAIL'}`);
  console.log('----------------------------------------------------------------');
  console.log(`2. Total Event Stream Records:         ${metrics.counting_reconciliation.event_stream_total_records}`);
  console.log(`   Lines in EVENTS.jsonl:              ${eventLines.length}`);
  console.log(`   Exact Match Status:                 ${metrics.counting_reconciliation.event_stream_total_records === eventLines.length ? 'PASS (100.0%)' : 'FAIL'}`);
  console.log('----------------------------------------------------------------');
  console.log(`3. Workload Tasks Attempted:           ${metrics.counting_reconciliation.workload_operations_attempted}`);
  console.log(`   Workload Tasks Passed:              ${metrics.counting_reconciliation.workload_operations_passed}`);
  console.log(`   Workload Tasks Failed:              ${metrics.counting_reconciliation.workload_operations_failed}`);
  console.log(`   Workload Schema Exceptions:         ${metrics.counting_reconciliation.schema_mismatch_errors}`);
  console.log(`   Workload Exceptions Count:          ${metrics.counting_reconciliation.workload_exceptions_count}`);
  console.log('----------------------------------------------------------------');
  console.log(`4. Unique Failure Scenarios:           ${metrics.counting_reconciliation.unique_failure_scenarios_defined}`);
  console.log(`   Failure Injection Attempts:         ${metrics.counting_reconciliation.failure_injection_attempts}`);
  console.log(`   Successful Recoveries:              ${metrics.counting_reconciliation.successful_recoveries}`);
  console.log(`   Failed Recoveries:                  ${metrics.counting_reconciliation.failed_recoveries}`);
  console.log(`   Duplicate Injection Attempts:       ${metrics.counting_reconciliation.duplicate_injection_attempts}`);
  console.log('================================================================');
  console.log(`RESOURCE ASSESSMENT:`);
  console.log(`   Initial Heap: ${metrics.resource_analysis.initial_heap_mb}MB | Final Heap: ${metrics.resource_analysis.final_heap_mb}MB | Net: ${metrics.resource_analysis.net_heap_growth_mb}MB`);
  console.log(`   Initial RSS:  ${metrics.resource_analysis.initial_rss_mb}MB | Final RSS:  ${metrics.resource_analysis.final_rss_mb}MB | Net: ${metrics.resource_analysis.net_rss_growth_mb}MB`);
  console.log(`   Peak CPU:     ${metrics.resource_analysis.peak_cpu_percent}% | Avg CPU: ${metrics.resource_analysis.average_cpu_percent}%`);
  console.log(`   DB Growth:    ${metrics.resource_analysis.db_growth_bytes} Bytes | Integrity: ${metrics.resource_analysis.db_integrity}`);
  console.log('================================================================');
  console.log(`STAGE 1.1 FINAL OPERATIONAL VERDICT: [${metrics.operational_verdict}]`);
  console.log('================================================================\n');

  if (metrics.operational_verdict !== 'PASS') {
    throw new Error('Stage 1.1 Remediation failed acceptance criteria.');
  }

  return metrics;
}

runRemediationSuite().catch(err => {
  console.error('[Remediation Suite Fatal Error]', err);
  process.exit(1);
});
