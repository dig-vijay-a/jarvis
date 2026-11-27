/**
 * JARVIS OS 2.0 — PROJECT SENTINEL (STAGE 1)
 * INDEPENDENT CLI TWO-HOUR ENDURANCE RUNNER & MONITOR
 * 
 * Runs independently of the browser / Antigravity frontend.
 * Can be run via: `node nova/run_sentinel_stage1_endurance.js`
 */

import WebSocket from 'ws';

const BASE_URL = 'http://localhost:5000/api/sentinel';
const WS_URL = 'ws://localhost:5000';

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
}

async function main() {
  console.log('================================================================');
  console.log('JARVIS OS 2.0 — PROJECT SENTINEL: STAGE 1 TWO-HOUR ENDURANCE');
  console.log('================================================================\n');

  // 1. Check current status
  let statusRes;
  try {
    statusRes = await fetch(`${BASE_URL}/endurance/status`).then(r => r.json());
  } catch (err) {
    console.error(`[ERROR] Backend is not reachable at ${BASE_URL}:`, err.message);
    process.exit(1);
  }

  console.log(`Current Test Status: [${statusRes.status}]`);
  console.log(`Elapsed: ${formatDuration(statusRes.elapsed_seconds || 0)} | Remaining: ${formatDuration(statusRes.remaining_seconds || 7200)}`);

  // 2. Start test if idle or stopped
  if (statusRes.status !== 'RUNNING' && statusRes.status !== 'PAUSED') {
    console.log('\nInitializing 120-minute autonomous endurance test...');
    const startRes = await fetch(`${BASE_URL}/endurance/start`, { method: 'POST' }).then(r => r.json());
    console.log('Backend response:', startRes);
  }

  // 3. Connect WebSocket for live telemetry & event streaming
  console.log(`\nSubscribing to live telemetry stream via ${WS_URL} ...`);
  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('[OK] Live WebSocket connected. Streaming telemetry every 10 seconds.\n');
    console.log('-----------------------------------------------------------------------------------------------------------------');
    console.log('| Timestamp               | Elapsed   | Progress | Heap (MB) | RSS (MB) | CPU % | DB Size (KB) | Passed | Recoveries |');
    console.log('-----------------------------------------------------------------------------------------------------------------');
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'SENTINEL_TELEMETRY' && msg.data) {
        const d = msg.data;
        const ts = d.timestamp ? d.timestamp.substring(11, 19) : '--:--:--';
        const elapsed = formatDuration(d.elapsed_seconds || 0);
        const progress = `${d.progress_percent || 0}%`.padStart(6);
        const heap = `${d.node_process?.memory?.heap_used_mb || 0}`.padStart(9);
        const rss = `${d.node_process?.memory?.rss_mb || 0}`.padStart(8);
        const cpu = `${d.node_process?.cpu_percent || 0}%`.padStart(5);
        const dbKb = `${d.database?.size_kb || 0}`.padStart(12);
        const passed = `${d.workload?.passed_count || 0}`.padStart(6);
        const recoveries = `${d.workload?.recovery_events || 0}`.padStart(10);

        console.log(`| ${ts} UTC            | ${elapsed} | ${progress} | ${heap} | ${rss} | ${cpu} | ${dbKb} | ${passed} | ${recoveries} |`);
      } else if (msg.event === 'SENTINEL_EVENT' && msg.data) {
        const e = msg.data;
        console.log(`   [EVENT: ${e.category}] ${e.title} -> ${e.detail}`);
      } else if (msg.event === 'SENTINEL_STATUS' && msg.data) {
        console.log(`   [STATUS CHANGE] Test status transitioned to: ${msg.data.status}`);
        if (msg.data.status === 'COMPLETED') {
          console.log('\n================================================================');
          console.log('SUCCESS: SENTINEL STAGE 1 TWO-HOUR ENDURANCE COMPLETED (120 MIN)');
          console.log('================================================================\n');
          process.exit(0);
        }
      }
    } catch (_) {}
  });

  ws.on('close', () => {
    console.log('[WS] Disconnected from backend HUD stream.');
  });

  ws.on('error', (err) => {
    console.warn('[WS Error]', err.message);
  });

  // Handle graceful stop on Ctrl+C
  process.on('SIGINT', async () => {
    console.log('\n[SIGINT] Intercepted termination signal.');
    console.log('Safely stopping test and compiling final endurance reports...');
    try {
      const stopRes = await fetch(`${BASE_URL}/endurance/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true })
      }).then(r => r.json());
      console.log('Final Stop Verdict:', stopRes.status, `at ${stopRes.elapsed_seconds}s elapsed.`);
      console.log('Report saved: nova/deliverables/SENTINEL_STAGE_1_REPORT.md');
    } catch (e) {
      console.warn('Could not safely notify backend of stop:', e.message);
    }
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[Runner Fatal Error]', err);
  process.exit(1);
});
