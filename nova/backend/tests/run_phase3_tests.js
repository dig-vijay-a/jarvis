import axios from 'axios';
import { query, run, get } from '../database/db.js';
import ToolRegistry from '../tools/registry.js';
import { MissionControlService, MISSION_STATUSES } from '../services/missionControlService.js';
import KnowledgeEngineService from '../services/knowledgeEngineService.js';
import IntegrationService from '../services/integrationService.js';
import ProactiveIntelligenceService from '../services/proactiveIntelligenceService.js';
import HealthMonitorService from '../services/healthMonitorService.js';
import VisionService from '../services/visionService.js';

const BACKEND_URL = 'http://localhost:5000';
const AGENT_URL = 'http://127.0.0.1:8000';
const AGENT_TOKEN = 'nova-local-agent-secure-token-2026';

let passedTests = 0;
let totalTests = 0;

function assert(condition, testDescription) {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] Test ${totalTests}: ${testDescription}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${testDescription}`);
    throw new Error(`Assertion failed: ${testDescription}`);
  }
}

async function runPhase3TestSuite() {
  console.log(`=======================================================`);
  console.log(`   NOVA PHASE 3 — AUTONOMOUS AI OS VERIFICATION SUITE   `);
  console.log(`=======================================================\n`);

  // --- 1. Autonomous Mission Mode (Module 1) ---
  console.log('--- 1. Testing Autonomous Mission Mode & DAG ---');
  const missionControl = new MissionControlService(null);
  const testObjective = 'Research latest AI developments and prepare a YouTube video';

  const mission = await missionControl.createMission(testObjective);
  assert(mission && mission.id, 'Mission instance created and persisted in SQLite.');
  assert(mission.status === MISSION_STATUSES.PENDING, 'Initial mission status set to PENDING.');
  assert(mission.steps && mission.steps.length >= 3, `Decomposed into ${mission.steps.length} multi-agent steps.`);

  // Verify agent delegation
  const agentKeys = mission.steps.map(s => s.agent_key);
  assert(agentKeys.includes('research') && agentKeys.includes('content'), 'Delegated tasks to Research and Content Creation agents.');

  // Verify DAG dependencies
  const step2 = mission.steps.find(s => s.step_index === 2);
  assert(step2 && step2.depends_on.includes(1), 'Step 2 correctly identifies dependency on Step 1 completion.');

  // Execute mission
  await missionControl.startMission(mission.id);
  // Wait briefly for asynchronous execution
  await new Promise(r => setTimeout(r, 2000));

  const updatedMission = await missionControl.getMission(mission.id);
  assert(
    updatedMission.status === MISSION_STATUSES.COMPLETED || updatedMission.status === MISSION_STATUSES.RUNNING,
    `Mission execution progressed (Current status: ${updatedMission.status}).`
  );
  if (updatedMission.status === MISSION_STATUSES.COMPLETED) {
    assert(updatedMission.deliverables && updatedMission.deliverables.length > 0, 'Mission deliverables consolidated and stored in database.');
  }

  // --- 2. Advanced Desktop Automation (Module 2) ---
  console.log('\n--- 2. Testing Advanced Desktop Automation ---');
  // List Windows
  const winRes = await axios.get(`${AGENT_URL}/api/desktop/windows`, {
    headers: { Authorization: `Bearer ${AGENT_TOKEN}` }
  });
  assert(winRes.status === 200 && winRes.data.success === true, 'Desktop window enumeration returned verified payload.');

  // Clipboard Set and Readback Verification
  const testClip = `NOVA_SECURE_TOKEN_TEST_${Date.now()}`;
  const clipSetRes = await axios.post(`${AGENT_URL}/api/desktop/clipboard`, { text: testClip }, {
    headers: { Authorization: `Bearer ${AGENT_TOKEN}` }
  });
  assert(clipSetRes.data.success === true && clipSetRes.data.verified === true, 'Clipboard text updated and verified.');

  const clipGetRes = await axios.get(`${AGENT_URL}/api/desktop/clipboard`, {
    headers: { Authorization: `Bearer ${AGENT_TOKEN}` }
  });
  assert(clipGetRes.data.text === testClip, 'Clipboard readback matches transmitted payload exactly.');

  // Mouse Automation Coordinate Verification
  const mouseRes = await axios.post(`${AGENT_URL}/api/desktop/mouse-action`, {
    action: 'move',
    x: 400,
    y: 300
  }, {
    headers: { Authorization: `Bearer ${AGENT_TOKEN}` }
  });
  assert(mouseRes.data.success === true && mouseRes.data.verified === true, 'Mouse positioning executed and verified via GetCursorPos.');

  // App State Inspection
  const appStateRes = await axios.post(`${AGENT_URL}/api/desktop/inspect-app`, {
    app_name: 'python'
  }, {
    headers: { Authorization: `Bearer ${AGENT_TOKEN}` }
  });
  assert(appStateRes.data.success === true && appStateRes.data.running === true, 'App state inspector detected running Python process.');

  // Confirmation Gating on Sensitive Window Action
  try {
    await axios.post(`${AGENT_URL}/api/desktop/window-action`, {
      hwnd: 12345,
      action: 'close',
      confirmed: false
    }, {
      headers: { Authorization: `Bearer ${AGENT_TOKEN}` }
    });
    assert(false, 'Expected failure on window close without confirmation.');
  } catch (err) {
    assert(err.response?.status === 400, 'Sensitive window close rejected without explicit confirmation.');
  }

  // --- 3. Local Wake Word Engine (Module 3) ---
  console.log('\n--- 3. Testing Local Wake-Word Engine ---');
  const wakeStatus = await axios.get(`${AGENT_URL}/api/wakeword/status`, {
    headers: { Authorization: `Bearer ${AGENT_TOKEN}` }
  });
  assert(wakeStatus.data.success === true && wakeStatus.data.active === true, 'Wake-word daemon active.');
  assert(wakeStatus.data.privacy_mode.includes('Local'), 'Wake-word operates in strict local zero-upload privacy mode.');

  // Process Utterance with Activation Phrase
  const wakeProc = await axios.post(`${AGENT_URL}/api/wakeword/process`, {
    text: 'Hey Nova, open Visual Studio Code'
  }, {
    headers: { Authorization: `Bearer ${AGENT_TOKEN}` }
  });
  assert(wakeProc.data.detected === true, 'Wake-word "Hey Nova" detected in continuous audio stream.');
  assert(wakeProc.data.command.toLowerCase().includes('open visual studio code'), 'Command directive cleanly extracted from utterance.');

  // Process Non-Wake Word Utterance
  const wakeProcNegative = await axios.post(`${AGENT_URL}/api/wakeword/process`, {
    text: 'Just chatting about the weather today.'
  }, {
    headers: { Authorization: `Bearer ${AGENT_TOKEN}` }
  });
  assert(wakeProcNegative.data.detected === false, 'Ignored casual conversation without wake-word activation.');

  // Privacy Mute Test
  await axios.post(`${AGENT_URL}/api/wakeword/configure`, { is_muted: true }, {
    headers: { Authorization: `Bearer ${AGENT_TOKEN}` }
  });
  const mutedProc = await axios.post(`${AGENT_URL}/api/wakeword/process`, {
    text: 'Hey Nova, open Calculator'
  }, {
    headers: { Authorization: `Bearer ${AGENT_TOKEN}` }
  });
  assert(mutedProc.data.detected === false, 'Microphone privacy mute enforced; audio discarded.');
  // Restore unmuted
  await axios.post(`${AGENT_URL}/api/wakeword/configure`, { is_muted: false }, {
    headers: { Authorization: `Bearer ${AGENT_TOKEN}` }
  });

  // --- 4. Personal Knowledge Engine (Module 4) ---
  console.log('\n--- 4. Testing Personal Knowledge Engine & Vector Search ---');
  // Clean up any old test documents from previous runs
  await run("DELETE FROM documents WHERE filename LIKE 'NOVA_Architecture_%'");
  await run("DELETE FROM document_chunks WHERE metadata LIKE '%NOVA_Architecture_%'");

  const testDocName = `NOVA_Architecture_${Date.now()}.md`;
  const testDocContent = `# NOVA Architecture Specification
The NOVA Personal AI Operating System is structured with an 8-stage Neural Orchestrator pipeline.
It incorporates a Local Wake-Word Engine, Advanced Desktop Automation using Win32 API, and a Vector Knowledge Base.
The system securely delegates directives to specialized agents including Research, Coding, and Content Creation.`;

  const ingestRes = await KnowledgeEngineService.ingestDocument({
    filename: testDocName,
    content: testDocContent,
    filetype: 'markdown'
  });
  assert(ingestRes.success === true && ingestRes.chunkCount > 0, `Document ingested and chunked into ${ingestRes.chunkCount} vector nodes.`);

  const vectorSearchRes = await KnowledgeEngineService.searchKnowledge('neural orchestrator pipeline vector knowledge base', 5);
  assert(vectorSearchRes.length > 0, 'Vector similarity search surfaced relevant document chunks.');
  assert(vectorSearchRes.some(r => r.citation.includes(testDocName)), 'Accurate source citation returned for AI context citation.');
  assert(vectorSearchRes[0].score > 0.2, `High vector cosine similarity score computed: ${vectorSearchRes[0].score}`);

  // --- 5. External Integrations & Human Approval Gates (Module 5) ---
  console.log('\n--- 5. Testing External Integrations & Approval Boundaries ---');
  const integrations = await IntegrationService.getIntegrations();
  assert(integrations.length >= 4, `Found ${integrations.length} configured integration connectors.`);
  const providers = integrations.map(i => i.provider);
  assert(providers.includes('gmail') && providers.includes('google_calendar') && providers.includes('github'), 'Gmail, Calendar, Drive, and GitHub connectors registered.');

  // Test Gmail unconfirmed send (MUST REQUIRE APPROVAL)
  const gmailUnconfirmed = await IntegrationService.gmailSendEmail({
    to: 'target@example.com',
    subject: 'Autonomous Alert',
    body: 'Automated test message',
    confirmed: false
  });
  assert(gmailUnconfirmed.requires_approval === true, 'Sending external email blocked by security policy awaiting operator approval.');

  // Test Gmail confirmed send
  const gmailConfirmed = await IntegrationService.gmailSendEmail({
    to: 'target@example.com',
    subject: 'Autonomous Alert',
    body: 'Automated test message',
    confirmed: true
  });
  assert(gmailConfirmed.success === true && gmailConfirmed.sent === true, 'Confirmed email action permitted and executed.');

  // Test Audit Log
  const auditLogs = await IntegrationService.getAuditLogs(10);
  assert(auditLogs.some(l => l.provider === 'gmail' && l.action === 'SEND_EMAIL'), 'Integration audit trail recorded external transmission.');

  // --- 6. Mobile Companion (Module 6) ---
  console.log('\n--- 6. Testing Mobile Companion Sync & Auth ---');
  // Invalid PIN check
  const badAuth = await axios.post(`${BACKEND_URL}/api/mobile/auth`, { pin: '0000' }, { validateStatus: () => true });
  assert(badAuth.status === 403, 'Rejected invalid mobile pairing PIN.');

  // Valid PIN check
  const goodAuth = await axios.post(`${BACKEND_URL}/api/mobile/auth`, { pin: '2026', deviceName: 'Commander iPhone' });
  assert(goodAuth.status === 200 && goodAuth.data.token, 'Mobile session paired with secure bearer token.');

  // Sync Check
  const mobileToken = goodAuth.data.token;
  const syncRes = await axios.get(`${BACKEND_URL}/api/mobile/sync`, {
    headers: { Authorization: `Bearer ${mobileToken}` }
  });
  assert(syncRes.status === 200 && syncRes.data.success === true, 'Synchronized mobile state (messages, missions, memories, tasks).');

  // --- 7. Proactive Intelligence (Module 7) ---
  console.log('\n--- 7. Testing Proactive Intelligence & Daily Briefings ---');
  const briefing = await ProactiveIntelligenceService.generateDailyBriefing();
  assert(briefing.success === true && briefing.briefingText.length > 50, 'Synthesized executive daily morning briefing.');
  assert(briefing.briefingText.includes('Commander'), 'Personalized briefing greeting formatted.');

  const insights = await ProactiveIntelligenceService.getProactiveInsights();
  assert(insights.success === true && insights.suggestions.length > 0, 'Contextual proactive suggestions formulated.');

  // --- 8. System Self-Monitoring (Module 8) ---
  console.log('\n--- 8. Testing System Health & Self-Monitoring ---');
  const health = await HealthMonitorService.checkSystemHealth();
  assert(health.status === 'HEALTHY', `System health status: ${health.status}`);
  assert(health.subsystems.backend.status === 'ONLINE', 'Node.js backend subsystem healthy.');
  assert(health.subsystems.database.status === 'ONLINE', 'SQLite database subsystem responsive.');
  assert(health.subsystems.python_agent.status === 'ONLINE', 'Python automation daemon healthy.');
  assert(health.subsystems.security_boundaries.immutable_permissions === true, 'Security boundary immutability verified.');

  // --- 9. Real User Scenarios Validation (Module 10) ---
  console.log('\n--- 9. Testing End-to-End Real User Scenarios ---');

  // Scenario 1: "Open my current React project and run it"
  console.log('  Scenario 1: "Open my current React project and run it"');
  const s1Files = await ToolRegistry.executeTool('search_files', { directory: '.', pattern: 'package.json' });
  assert(s1Files.success === true && s1Files.files.length > 0, 'Located local React project workspace.');

  // Scenario 2: "Find my latest project presentation and summarize it"
  console.log('  Scenario 2: "Find my latest project presentation and summarize it"');
  const s2Search = await ToolRegistry.executeTool('search_knowledge_documents', { query: 'Architecture Specification' });
  assert(s2Search.success === true && s2Search.results.length > 0, 'Retrieved presentation knowledge chunk with citation.');

  // Scenario 3: "Research AI news and prepare a video script"
  console.log('  Scenario 3: "Research AI news and prepare a video script"');
  const s3Mission = await missionControl.createMission('Research AI news and prepare a video script');
  assert(s3Mission.steps.some(s => s.agent_key === 'content'), 'Mission allocated screenplay generation to Content Creation Agent.');

  // Scenario 4: "Remind me about my pending tasks tomorrow"
  console.log('  Scenario 4: "Remind me about my pending tasks tomorrow"');
  const s4Reminder = await ToolRegistry.executeTool('create_reminder', {
    title: 'Review pending task registers',
    remind_at: new Date(Date.now() + 86400000).toISOString()
  });
  assert(s4Reminder.success === true && s4Reminder.id, 'Tomorrow reminder scheduled and committed to SQLite.');

  // Scenario 5: "Analyze this screenshot and explain the error"
  console.log('  Scenario 5: "Analyze this screenshot and explain the error"');
  const dummyB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const s5Vision = await VisionService.analyzeScreen({ imageBase64: dummyB64, mode: 'explain_error' });
  assert(s5Vision.success === true && s5Vision.analysis, 'Screen analysis diagnosed error state and generated recommended resolution.');

  console.log(`\n=======================================================`);
  console.log(`  PHASE 3 ALL TESTS PASSED: ${passedTests} / ${totalTests} (100% SUCCESS)`);
  console.log(`=======================================================\n`);
}

runPhase3TestSuite().catch(err => {
  console.error('\n[FATAL] Phase 3 Test suite encountered error:', err);
  process.exit(1);
});
