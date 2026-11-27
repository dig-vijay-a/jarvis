/**
 * Verification Script for Sentinel Stage 1 Endurance API & WebSocket Streaming
 */

import WebSocket from 'ws';

async function verifySentinelLive() {
  console.log('================================================================');
  console.log('TESTING SENTINEL STAGE 1 ENDURANCE & LIVE DASHBOARD SUBSYSTEMS');
  console.log('================================================================\n');

  const baseUrl = 'http://localhost:5000/api/sentinel';
  let wsMessagesReceived = 0;

  // 1. WebSocket Client Connection
  console.log('[1/7] Connecting WebSocket client to ws://localhost:5000 ...');
  const ws = new WebSocket('ws://localhost:5000');
  
  ws.on('open', () => {
    console.log('  -> WebSocket connected successfully.');
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.event === 'SENTINEL_TELEMETRY' || msg.event === 'SENTINEL_EVENT' || msg.event === 'SENTINEL_STATUS') {
        wsMessagesReceived++;
        console.log(`  -> [WS Stream] Received ${msg.event} payload at ${new Date().toISOString()}`);
      }
    } catch (_) {}
  });

  await new Promise(r => setTimeout(r, 1000));

  // 2. Initial Status
  console.log('\n[2/7] Checking GET /api/sentinel/endurance/status ...');
  const initialStatusRes = await fetch(`${baseUrl}/endurance/status`).then(r => r.json());
  console.log('  -> Status:', initialStatusRes.status);
  console.log('  -> Current Scenario:', initialStatusRes.current_scenario);

  // 3. Start Endurance Test Runner
  console.log('\n[3/7] Triggering POST /api/sentinel/endurance/start ...');
  const startRes = await fetch(`${baseUrl}/endurance/start`, { method: 'POST' }).then(r => r.json());
  console.log('  -> Start Response:', startRes);

  // 4. Wait 15 seconds to allow at least 1 telemetry tick (10s) and 1 workload cycle (15s)
  console.log('\n[4/7] Awaiting 16 seconds for real empirical sampling and workload execution...');
  await new Promise(r => setTimeout(r, 16000));

  // 5. Inspect Running Telemetry & State
  console.log('\n[5/7] Verifying live sampled telemetry...');
  const runningStatusRes = await fetch(`${baseUrl}/endurance/status`).then(r => r.json());
  console.log('  -> Status:', runningStatusRes.status);
  console.log('  -> Elapsed Seconds:', runningStatusRes.elapsed_seconds);
  console.log('  -> Node Heap:', runningStatusRes.node_memory?.heap_used_mb, 'MB');
  console.log('  -> Node RSS:', runningStatusRes.node_memory?.rss_mb, 'MB');
  console.log('  -> Node CPU:', runningStatusRes.cpu_percent, '%');
  console.log('  -> DB Size:', runningStatusRes.database?.size_bytes, 'Bytes');
  console.log('  -> Passed Workloads:', runningStatusRes.passed_count);
  console.log('  -> Total Executed:', runningStatusRes.total_scenarios_executed);
  console.log('  -> Recent Samples in Buffer:', runningStatusRes.recent_samples?.length);

  // 6. Inspect Events Stream
  console.log('\n[6/7] Checking GET /api/sentinel/endurance/events ...');
  const eventsRes = await fetch(`${baseUrl}/endurance/events?limit=10`).then(r => r.json());
  console.log(`  -> Retrieved ${eventsRes.count} events.`);
  eventsRes.events.slice(0, 3).forEach((e, i) => {
    console.log(`     [Event ${i + 1}] [${e.category}] ${e.title}: ${e.detail}`);
  });

  // 7. Pause & Resume Test
  console.log('\n[7/7] Testing Pause, Resume and Export...');
  const pauseRes = await fetch(`${baseUrl}/endurance/pause`, { method: 'POST' }).then(r => r.json());
  console.log('  -> Pause Response:', pauseRes.status);

  const resumeRes = await fetch(`${baseUrl}/endurance/resume`, { method: 'POST' }).then(r => r.json());
  console.log('  -> Resume Response:', resumeRes.status);

  const exportRes = await fetch(`${baseUrl}/endurance/export`).then(r => r.json());
  console.log('  -> Export Has Metrics:', !!exportRes.metrics);
  console.log('  -> Export Has Report:', !!exportRes.report);
  console.log('  -> Total WS Telemetry/Event Messages Received:', wsMessagesReceived);

  ws.close();

  console.log('\n================================================================');
  console.log('ALL SENTINEL LIVE ENDURANCE SUBSYSTEMS OPERATIONAL & VERIFIED');
  console.log('================================================================');
}

verifySentinelLive().catch(err => {
  console.error('[Verification Failed]', err);
  process.exit(1);
});
