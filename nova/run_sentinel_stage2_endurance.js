/**
 * JARVIS OS 2.0 — PROJECT SENTINEL
 * STAGE 2: FOUR-HOUR CONTINUOUS AUTONOMOUS ENDURANCE CLI RUNNER & OBSERVER
 * 
 * Target: 14,400s (240 minutes / 4 hours)
 * Sampling: 10-second empirical telemetry (~1,441 samples)
 * HUD: Real-time console streaming + WebSocket feed listener
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:5000/api/sentinel';
const WS_URL = 'ws://localhost:5000';
const TARGET_SECONDS = 14400;

console.log('='.repeat(80));
console.log('JARVIS OS 2.0 — PROJECT SENTINEL STAGE 2: FOUR-HOUR ENDURANCE RUNNER');
console.log('Target Duration: 14,400 seconds (240 minutes / 4 hours)');
console.log('Sampling Rate: 10 seconds | Target Samples: ~1,441 records');
console.log('='.repeat(80));

let isTerminating = false;

async function checkBackend() {
  try {
    const res = await fetch(`${API_BASE}/telemetry`);
    if (res.ok) {
      const data = await res.json();
      console.log(`[INIT] Connected to JARVIS OS Backend (PID: ${data.backend.pid}, Uptime: ${data.backend.uptime_seconds}s)`);
      return true;
    }
  } catch (err) {
    console.error(`[INIT ERROR] Backend unreachable at ${API_BASE}: ${err.message}`);
    return false;
  }
  return false;
}

async function ensureEnduranceStarted() {
  try {
    const statusRes = await fetch(`${API_BASE}/endurance/status`);
    const statusData = await statusRes.json();

    if (statusData.status === 'RUNNING') {
      console.log(`[STATUS] Endurance test is already RUNNING. Elapsed: ${statusData.elapsed_seconds}s (${statusData.progress_percent}%)`);
      return statusData;
    }

    console.log(`[STATUS] Starting Stage 2 Endurance Test...`);
    const startRes = await fetch(`${API_BASE}/endurance/start`, { method: 'POST' });
    const startData = await startRes.json();
    console.log(`[STATUS] Start response:`, startData);
    return startData;
  } catch (err) {
    console.error(`[ERROR] Failed to start endurance test:`, err.message);
    throw err;
  }
}

function printTelemetryLine(sample) {
  const elapsed = sample.elapsed_seconds || 0;
  const remaining = sample.remaining_seconds || Math.max(0, TARGET_SECONDS - elapsed);
  const pct = sample.progress_percent || ((elapsed / TARGET_SECONDS) * 100).toFixed(1);
  const heap = sample.node_process?.memory?.heap_used_mb || 0;
  const rss = sample.node_process?.memory?.rss_mb || 0;
  const cpu = sample.node_process?.cpu_percent || 0;
  const dbKb = sample.database?.size_kb || 0;
  const dbOk = sample.database?.integrity || 'ok';
  const passed = sample.workload?.passed_count || 0;
  const failed = sample.workload?.failed_count || 0;
  const recov = sample.workload?.recovery_events || 0;
  const scenario = sample.current_scenario || 'STANDBY';

  const timeStr = new Date().toISOString().substring(11, 19);
  console.log(`[${timeStr}] Sample #${sample.sample_index} | Elapsed: ${elapsed}s / ${TARGET_SECONDS}s (${pct}%) | Heap: ${heap}MB | RSS: ${rss}MB | CPU: ${cpu}% | DB: ${dbKb}KB (${dbOk}) | Passed: ${passed} | Fail: ${failed} | Recov: ${recov} | Scenario: ${scenario}`);
}

function printEventLine(evt) {
  const cat = evt.category || 'EVENT';
  const color = cat === 'FAILURE' ? '!!' : (cat === 'RECOVERY' ? '++' : '>>');
  console.log(`  ${color} [${cat}] ${evt.title}: ${evt.detail} (${evt.elapsed_seconds}s elapsed)`);
}

function startWebSocketListener() {
  let ws = null;
  let reconnectTimeout = null;

  function connect() {
    if (isTerminating) return;
    try {
      ws = new WebSocket(WS_URL);

      ws.on('open', () => {
        console.log(`[WS] HUD WebSocket connection established to ${WS_URL}`);
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.event === 'SENTINEL_TELEMETRY' && msg.data) {
            printTelemetryLine(msg.data);
            if (msg.data.elapsed_seconds >= TARGET_SECONDS) {
              console.log(`\n🎉 TARGET DURATION REACHED (14,400s / 4 Hours)! Test Completed Successfully.`);
            }
          } else if (msg.event === 'SENTINEL_EVENT' && msg.data) {
            printEventLine(msg.data);
          } else if (msg.event === 'SENTINEL_STATUS' && msg.data) {
            console.log(`[STATUS UPDATE] Status changed to: ${msg.data.status}`);
          }
        } catch (_) {}
      });

      ws.on('close', () => {
        if (!isTerminating) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      });

      ws.on('error', () => {
        try { ws.close(); } catch (_) {}
      });
    } catch (_) {
      if (!isTerminating) {
        reconnectTimeout = setTimeout(connect, 3000);
      }
    }
  }

  connect();

  return () => {
    isTerminating = true;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (ws) try { ws.close(); } catch (_) {}
  };
}

// Fallback polling loop every 10 seconds to ensure terminal output even if WS drops
async function startPollingLoop() {
  let lastSampleIndex = -1;

  const interval = setInterval(async () => {
    if (isTerminating) {
      clearInterval(interval);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/endurance/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'COMPLETED') {
          console.log(`[POLL] Endurance Test completed! Total duration: ${data.elapsed_seconds}s.`);
          clearInterval(interval);
          await printFinalAudit();
          process.exit(0);
        }
      }
    } catch (_) {}
  }, 10000);
}

async function printFinalAudit() {
  console.log('\n' + '='.repeat(80));
  console.log('SENTINEL STAGE 2 FOUR-HOUR ENDURANCE AUDIT & DELIVERABLES VERIFICATION');
  console.log('='.repeat(80));

  const files = [
    'SENTINEL_STAGE_2_TELEMETRY.jsonl',
    'SENTINEL_STAGE_2_EVENTS.jsonl',
    'SENTINEL_STAGE_2_METRICS.json',
    'SENTINEL_STAGE_2_FAILURES.md',
    'SENTINEL_STAGE_2_REPORT.md'
  ];

  for (const f of files) {
    const p = path.resolve('nova/deliverables', f);
    if (fs.existsSync(p)) {
      const stat = fs.statSync(p);
      console.log(`[DELIVERABLE] [OK] ${f} (${(stat.size / 1024).toFixed(1)} KB)`);
    } else {
      console.log(`[DELIVERABLE] [MISSING] ${f}`);
    }
  }
}

// Graceful exit
process.on('SIGINT', async () => {
  console.log('\n[RUNNER] Received SIGINT. Observer detaching. Test continues in background backend.');
  isTerminating = true;
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[RUNNER] Received SIGTERM. Observer detaching.');
  isTerminating = true;
  process.exit(0);
});

async function main() {
  const backendOk = await checkBackend();
  if (!backendOk) {
    console.error('Cannot proceed without active backend. Please start backend first.');
    process.exit(1);
  }

  await ensureEnduranceStarted();
  startWebSocketListener();
  startPollingLoop();
}

main();
