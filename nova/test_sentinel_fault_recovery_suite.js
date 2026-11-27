/**
 * JARVIS OS 2.0 — PHASE 14: PROJECT SENTINEL (P2)
 * FAULT INJECTION & RECOVERY VALIDATION SUITE (15 Scenarios)
 */

import { getSentinelFaultInjectionService } from './backend/services/sentinelFaultInjectionService.js';
import { run, get } from './backend/database/db.js';
import fs from 'fs';
import path from 'path';

const faultService = getSentinelFaultInjectionService();
let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion Failed: ${message}`);
}

async function runScenario(id, title, testFn) {
  const start = Date.now();
  try {
    const detail = await testFn();
    const duration = Date.now() - start;
    passed++;
    console.log(`[PASS] Scenario ${id}: ${title} (${duration}ms)`);
    results.push({ id, title, status: 'PASSED', duration_ms: duration, detail });
  } catch (err) {
    const duration = Date.now() - start;
    failed++;
    console.error(`[FAIL] Scenario ${id}: ${title} (${duration}ms) - ${err.message}`);
    results.push({ id, title, status: 'FAILED', duration_ms: duration, error: err.message });
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('SENTINEL P2: FAULT INJECTION & RECOVERY VALIDATION (15 Scenarios)');
  console.log('================================================================\n');

  const missionId = `mis-fault-test-${Date.now()}`;
  const now = new Date().toISOString();
  await run(`INSERT INTO missions (id, objective, status, created_at) VALUES (?, 'Fault Recovery Test', 'PENDING', ?)`, [missionId, now]);

  // Scenario 1: Node backend termination simulation
  await runScenario(1, 'Node backend termination recovery', async () => {
    const res = await faultService.simulateBackendTerminationRecovery(missionId);
    assert(res.recovered === true, 'Mission must recover to PENDING');
    return res;
  });

  // Scenario 2: Python agent termination fallback
  await runScenario(2, 'Python agent termination graceful degradation', async () => {
    const res = await faultService.simulatePythonAgentTermination();
    assert(res.safe_degradation === true, 'Safe degradation must be active');
    return res;
  });

  // Scenario 3: Frontend disconnect & execution persistence
  await runScenario(3, 'Frontend disconnect execution decoupling', async () => {
    const res = await faultService.simulateFrontendDisconnect(missionId);
    assert(res.backend_decoupled_from_frontend === true, 'Backend must execute independently');
    return res;
  });

  // Scenario 4: Network interruption & offline queuing
  await runScenario(4, 'Network interruption offline queuing', async () => {
    const res = await faultService.simulateNetworkInterruptionQueuing('Optimize system cache');
    assert(res.interruption_handled === true, 'Offline queue must record directive');
    assert(res.queued_count >= 1, 'Queue must hold items');
    return res;
  });

  // Scenario 5: DNS resolution failure handling
  await runScenario(5, 'DNS resolution failure cache fallback', async () => {
    const res = faultService.simulateDnsResolutionFailure();
    assert(res.resolution_failed === true, 'DNS failure detected');
    assert(res.graceful_abort === true, 'System aborts gracefully without unhandled exception');
    return res;
  });

  // Scenario 6: HTTP 429 rate limiting with exponential backoff
  await runScenario(6, 'HTTP 429 rate limiting with exponential backoff', async () => {
    const res1 = faultService.simulateRateLimitBackoff(1);
    const res2 = faultService.simulateRateLimitBackoff(2);
    assert(res1.backoff_calculated_ms === 500, 'Attempt 1 backoff is 500ms');
    assert(res2.backoff_calculated_ms === 1000, 'Attempt 2 backoff is 1000ms');
    return { backoff_progression: [res1.backoff_calculated_ms, res2.backoff_calculated_ms] };
  });

  // Scenario 7: SQLite busy condition & lock retries
  await runScenario(7, 'SQLite busy condition & lock retries', async () => {
    const res = await faultService.simulateSqliteBusyRetries();
    assert(res.recovered_from_busy === true, 'Must recover from busy lock');
    assert(res.db_responsive === true, 'Database remains responsive');
    return res;
  });

  // Scenario 8: Database connection interruption
  await runScenario(8, 'Database connection interruption handling', async () => {
    const res = await faultService.simulateDbInterruptionReconnection();
    assert(res.reconnected === true, 'DB connection re-established');
    return res;
  });

  // Scenario 9: Worker termination during execution
  await runScenario(9, 'Worker termination during execution & safe reversion', async () => {
    const res = await faultService.simulateWorkerTermination(missionId, 0);
    assert(res.worker_killed === true, 'Worker killed successfully');
    assert(res.duplicate_side_effects_prevented === true, 'Side effects prevented');
    return res;
  });

  // Scenario 10: Application termination during file operations
  await runScenario(10, 'Application termination during file operations & atomic write', async () => {
    const res = faultService.simulateAtomicFileWrite('atomic_test.json', JSON.stringify({ safe: true }));
    assert(res.atomic_write_verified === true, 'Atomic write verified');
    assert(res.corrupted_intermediate_avoided === true, 'No intermediate file left');
    return res;
  });

  // Scenario 11: Machine restart recovery
  await runScenario(11, 'Machine restart recovery of active missions', async () => {
    const res = await faultService.simulateMachineRestartRecovery();
    assert(res.integrity_maintained === true, 'Integrity maintained');
    return res;
  });

  // Scenario 12: Disk space exhaustion simulation
  await runScenario(12, 'Disk space exhaustion simulation & safety stop', async () => {
    const res = faultService.simulateDiskSpaceExhaustion(10); // 10MB < 100MB
    assert(res.safety_stop_triggered === true, 'Safety stop triggered');
    assert(res.writes_blocked_safely === true, 'Writes blocked safely');
    return res;
  });

  // Scenario 13: Corrupted checkpoint simulation
  await runScenario(13, 'Corrupted checkpoint simulation & fallback', async () => {
    const res = await faultService.simulateCorruptedCheckpointFallback(missionId);
    assert(res.corrupted_checkpoint_detected === true, 'Corrupted checkpoint detected');
    assert(res.fallback_to_prior_checkpoint === true, 'Fell back to valid prior checkpoint');
    return res;
  });

  // Scenario 14: WebSocket reconnection & replay avoidance
  await runScenario(14, 'WebSocket reconnection & replay avoidance', async () => {
    const res = faultService.simulateWebSocketReconnectionDeduplication();
    assert(res.duplicate_replays_blocked === 1, 'Blocked duplicate event replay');
    assert(res.replay_safe === true, 'Deduplication guarantees replay safety');
    return res;
  });

  // Scenario 15: Partial multi-step mission failure & DAG recovery
  await runScenario(15, 'Partial multi-step mission failure & DAG adaptive recovery', async () => {
    const res = await faultService.simulatePartialStepFailureRecovery();
    assert(res.partial_failure_detected === true, 'Partial failure detected');
    assert(res.adaptive_replan_executed === true, 'Adaptive replan executed');
    return res;
  });

  console.log('\n================================================================');
  console.log(`P2 FAULT INJECTION SUMMARY: ${passed} / 15 PASSED (${((passed/15)*100).toFixed(1)}%)`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runSuite().catch(err => {
  console.error('Fatal Fault Recovery Runner Error:', err);
  process.exit(1);
});
