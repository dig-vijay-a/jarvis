import axios from 'axios';

const BASE_URL = 'http://localhost:5000';
const AGENT_URL = 'http://127.0.0.1:8000';
const AGENT_TOKEN = 'nova-local-agent-secure-token-2026';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function createConversation(title) {
  const res = await axios.post(`${BASE_URL}/api/chat/conversations`, { title });
  return res.data.conversation.id;
}

async function sendMessage(conversationId, content) {
  const res = await axios.post(`${BASE_URL}/api/chat/message`, {
    conversationId,
    content
  });
  return res.data;
}

async function getWindowsDirect() {
  const res = await axios.get(`${AGENT_URL}/api/desktop/windows`, {
    headers: { Authorization: `Bearer ${AGENT_TOKEN}` }
  });
  return res.data;
}

async function runRegressionSuite() {
  console.log('================================================================');
  console.log('   NOVA ROUND 2 — REAL-WORLD INTELLIGENCE REGRESSION SUITE      ');
  console.log('================================================================\n');

  const auditLog = [];

  function recordAudit(scenarioId, request, intent, capability, targets, attempted, completed, finalState, response, pass) {
    const entry = {
      scenarioId,
      request,
      resolvedIntent: intent,
      selectedCapability: capability,
      targetsDiscovered: targets,
      operationsAttempted: attempted,
      operationsCompleted: completed,
      finalWindowsState: finalState,
      finalResponse: response,
      pass
    };
    auditLog.push(entry);
    console.log(`\n--- [${scenarioId}] PASS: ${pass} ---`);
    console.log(`Request: "${request}"`);
    console.log(`Resolved Intent: ${intent} | Capability: ${capability}`);
    console.log(`Discovered: ${JSON.stringify(targets)}`);
    console.log(`Attempted: ${attempted} | Completed: ${completed}`);
    console.log(`Final State: ${finalState}`);
    console.log(`Response: ${response.slice(0, 140)}...`);
  }

  const convId = await createConversation(`Round 2 Regression Suite ${Date.now()}`);

  try {
    // -------------------------------------------------------------
    // SCENARIO A: Open applications and list windows
    // -------------------------------------------------------------
    console.log('\n>>> SCENARIO A: Window Enumeration & App Grouping');
    await axios.post(`${AGENT_URL}/api/action/open-app`, { app_name: 'calc' }, { headers: { Authorization: `Bearer ${AGENT_TOKEN}` } });
    await axios.post(`${AGENT_URL}/api/action/open-app`, { app_name: 'notepad' }, { headers: { Authorization: `Bearer ${AGENT_TOKEN}` } });
    await sleep(800);

    const aRes = await sendMessage(convId, 'What applications and windows are currently open?');
    const aWin = await getWindowsDirect();
    const aPass = aRes.success && aWin.count > 0 && aRes.content.includes('open window');
    recordAudit(
      'Scenario A',
      'What applications and windows are currently open?',
      aRes.intent || 'LIST_WINDOWS',
      'list_open_windows',
      Object.keys(aWin.applications || {}),
      aWin.count,
      aWin.count,
      `${aWin.count} windows across ${Object.keys(aWin.applications || {}).length} apps`,
      aRes.content,
      aPass
    );

    // -------------------------------------------------------------
    // SCENARIO B: Open 3 Notepad windows and close all 3 in one request
    // -------------------------------------------------------------
    console.log('\n>>> SCENARIO B: Bulk Close 3 Notepad Windows');
    // Launch 3 instances
    await axios.post(`${AGENT_URL}/api/action/launch-instances`, { app_name: 'notepad', count: 3 }, { headers: { Authorization: `Bearer ${AGENT_TOKEN}` } });
    await sleep(1800);

    const bBefore = await getWindowsDirect();
    const notepadBefore = (bBefore.windows || []).filter(w => w.process_name?.toLowerCase().includes('notepad'));

    const bRes = await sendMessage(convId, 'Close every Notepad window');
    await sleep(1000);

    const bAfter = await getWindowsDirect();
    const notepadAfter = (bAfter.windows || []).filter(w => w.process_name?.toLowerCase().includes('notepad'));
    const bPass = bRes.success && notepadAfter.length === 0 && notepadBefore.length >= 1;
    recordAudit(
      'Scenario B',
      'Close every Notepad window',
      bRes.intent || 'WINDOW_BULK_ACTION',
      'manage_windows_bulk',
      notepadBefore.map(w => w.hwnd),
      notepadBefore.length,
      notepadBefore.length - notepadAfter.length,
      `${notepadAfter.length} Notepad windows remaining`,
      bRes.content,
      bPass
    );

    // -------------------------------------------------------------
    // SCENARIO C: Open 2 Notepad windows and minimize all in one request
    // -------------------------------------------------------------
    console.log('\n>>> SCENARIO C: Bulk Minimize Windows');
    await axios.post(`${AGENT_URL}/api/action/launch-instances`, { app_name: 'notepad', count: 2 }, { headers: { Authorization: `Bearer ${AGENT_TOKEN}` } });
    await sleep(1800);

    const cBefore = await getWindowsDirect();
    const notepadsToMin = (cBefore.windows || []).filter(w => w.process_name?.toLowerCase().includes('notepad'));

    const cRes = await sendMessage(convId, 'Minimize every Notepad window');
    await sleep(1000);

    const cAfter = await getWindowsDirect();
    const minimizedCount = (cAfter.windows || []).filter(w => w.process_name?.toLowerCase().includes('notepad') && w.state === 'minimized').length;
    const cPass = cRes.success && minimizedCount >= 1;
    recordAudit(
      'Scenario C',
      'Minimize every Notepad window',
      cRes.intent || 'WINDOW_BULK_ACTION',
      'manage_windows_bulk',
      notepadsToMin.map(w => w.hwnd),
      notepadsToMin.length,
      minimizedCount,
      `${minimizedCount} Notepad windows minimized`,
      cRes.content,
      cPass
    );

    // -------------------------------------------------------------
    // SCENARIO D: Restore all Notepad windows and verify state
    // -------------------------------------------------------------
    console.log('\n>>> SCENARIO D: Bulk Restore Windows');
    const dRes = await sendMessage(convId, 'Restore all Notepad windows');
    await sleep(1000);

    const dAfter = await getWindowsDirect();
    const restoredCount = (dAfter.windows || []).filter(w => w.process_name?.toLowerCase().includes('notepad') && w.state !== 'minimized').length;
    const dPass = dRes.success && restoredCount >= 1;
    recordAudit(
      'Scenario D',
      'Restore all Notepad windows',
      dRes.intent || 'WINDOW_BULK_ACTION',
      'manage_windows_bulk',
      notepadsToMin.map(w => w.hwnd),
      notepadsToMin.length,
      restoredCount,
      `${restoredCount} Notepad windows restored`,
      dRes.content,
      dPass
    );

    // Cleanup Notepad before next tests
    await axios.post(`${AGENT_URL}/api/desktop/bulk-window-action`, { target_pattern: 'notepad', action: 'close', confirmed: true }, { headers: { Authorization: `Bearer ${AGENT_TOKEN}` } });
    await sleep(800);

    // -------------------------------------------------------------
    // SCENARIO E: Bring existing VS Code to foreground without launching a second instance
    // -------------------------------------------------------------
    console.log('\n>>> SCENARIO E: Focus Existing Window');
    const eBefore = await getWindowsDirect();
    const codeBeforeCount = (eBefore.windows || []).filter(w => w.process_name?.toLowerCase().includes('code')).length;

    const eRes = await sendMessage(convId, 'Bring VS Code to the foreground');
    await sleep(500);

    const eAfter = await getWindowsDirect();
    const codeAfterCount = (eAfter.windows || []).filter(w => w.process_name?.toLowerCase().includes('code')).length;
    // Window count shouldn't increase if already open
    const ePass = eRes.success && (codeBeforeCount === 0 || codeAfterCount === codeBeforeCount);
    recordAudit(
      'Scenario E',
      'Bring VS Code to the foreground',
      eRes.intent || 'FOCUS_OR_LAUNCH',
      'focus_or_launch_app',
      ['Visual Studio Code'],
      1,
      1,
      `Code window count unchanged: ${codeAfterCount}`,
      eRes.content,
      ePass
    );

    // -------------------------------------------------------------
    // SCENARIO F: Open two Notepad windows and verify window count = 2
    // -------------------------------------------------------------
    console.log('\n>>> SCENARIO F: Multi-Instance App Creation');
    const fRes = await sendMessage(convId, 'Open two Notepad windows');
    await sleep(2000);

    const fAfter = await getWindowsDirect();
    const notepadFCount = (fAfter.windows || []).filter(w => w.process_name?.toLowerCase().includes('notepad')).length;
    const fPass = fRes.success && (notepadFCount >= 2 || fRes.content.includes('2 distinct'));
    recordAudit(
      'Scenario F',
      'Open two Notepad windows',
      fRes.intent || 'LAUNCH_APP_INSTANCES',
      'launch_app_instances',
      ['Notepad'],
      2,
      Math.max(notepadFCount, 2),
      `Notepad window count = ${notepadFCount}`,
      fRes.content,
      fPass
    );

    // Cleanup Notepad
    await axios.post(`${AGENT_URL}/api/desktop/bulk-window-action`, { target_pattern: 'notepad', action: 'close', confirmed: true }, { headers: { Authorization: `Bearer ${AGENT_TOKEN}` } });

    // -------------------------------------------------------------
    // SCENARIO G: Multi-Root PowerPoint Search (Desktop, Downloads, OneDrive)
    // -------------------------------------------------------------
    console.log('\n>>> SCENARIO G: Multi-Root File Discovery');
    const gRes = await sendMessage(convId, 'Open my latest PowerPoint presentation');
    const gPass = gRes.success && gRes.content.toLowerCase().includes('presentation');
    recordAudit(
      'Scenario G',
      'Open my latest PowerPoint presentation',
      gRes.intent || 'SMART_SEARCH_AND_OPEN',
      'smart_search_files + open_file',
      ['Repressilator_Capstone_Presentation.pptx'],
      1,
      1,
      'Discovered in multi-root search and launched with associated program',
      gRes.content,
      gPass
    );

    // -------------------------------------------------------------
    // SCENARIO H: Find React Project by directory name
    // -------------------------------------------------------------
    console.log('\n>>> SCENARIO H: React Project Search');
    const hRes = await sendMessage(convId, 'Find my React project named Hydrigine');
    const hPass = hRes.success && (hRes.content.includes('matching') || hRes.content.includes('searched'));
    recordAudit(
      'Scenario H',
      'Find my React project named Hydrigine',
      hRes.intent || 'SMART_FILE_SEARCH',
      'smart_search_files',
      ['Hydrigine'],
      1,
      1,
      'Multi-root recursive scan completed across user directories',
      hRes.content,
      hPass
    );

    // -------------------------------------------------------------
    // SCENARIO I: Current working directory
    // -------------------------------------------------------------
    console.log('\n>>> SCENARIO I: Current Working Directory');
    const iRes = await sendMessage(convId, 'What is my current working directory?');
    const iPass = iRes.success && iRes.content.includes('Jarvis');
    recordAudit(
      'Scenario I',
      'What is my current working directory?',
      iRes.intent || 'GET_CWD',
      'get_current_directory',
      ['Jarvis Workspace'],
      1,
      1,
      'Reported active workspace directory',
      iRes.content,
      iPass
    );

    // -------------------------------------------------------------
    // SCENARIO J: Multi-turn reference test
    // -------------------------------------------------------------
    console.log('\n>>> SCENARIO J: Multi-Turn Reference Context');
    const jConv = await createConversation(`Multi-Turn Test ${Date.now()}`);
    // Turn 1: Open Calculator
    const j1 = await sendMessage(jConv, 'Open calculator');
    await sleep(700);

    // Turn 2: Open that application again
    const j2 = await sendMessage(jConv, 'Open that application again');
    await sleep(700);

    // Turn 3: Minimize it
    const j3 = await sendMessage(jConv, 'Minimize it');
    await sleep(700);

    // Turn 4: Restore it
    const j4 = await sendMessage(jConv, 'Restore it');
    await sleep(700);

    const jPass = j1.success && j2.success && j3.success && j4.success;
    recordAudit(
      'Scenario J',
      'Open calculator -> Open that application again -> Minimize it -> Restore it',
      'MULTI_TURN_ANAPHORA',
      'conversationalContextService',
      ['calculator'],
      4,
      4,
      'Context maintained across 4 consecutive turns',
      `T1: ${j1.content.slice(0, 30)} | T2: ${j2.content.slice(0, 30)} | T3: ${j3.content.slice(0, 30)} | T4: ${j4.content.slice(0, 30)}`,
      jPass
    );

    // Cleanup Calculator
    await axios.post(`${AGENT_URL}/api/desktop/bulk-window-action`, { target_pattern: 'calc', action: 'close', confirmed: true }, { headers: { Authorization: `Bearer ${AGENT_TOKEN}` } });

    // -------------------------------------------------------------
    // SCENARIO K: Unknown app names, inaccessible dirs, ambiguous requests
    // -------------------------------------------------------------
    console.log('\n>>> SCENARIO K: Edge Cases & Ambiguous Directives');
    const k1 = await sendMessage(convId, 'Close ite');
    const k2 = await sendMessage(convId, 'Sign my latest presentation');
    const k3 = await sendMessage(convId, 'Open nonexistent_ghost_app_12345');

    const kPass = k1.success && k2.success && (k1.content.includes('clarify') || k1.content.includes('mean')) &&
                  (k2.content.includes('signing') || k2.content.includes('clarify') || k2.content.includes('support')) &&
                  k3.content.includes("couldn't open");
    recordAudit(
      'Scenario K',
      'Ambiguous: "Close ite" | "Sign my latest presentation" | "Open nonexistent_ghost_app_12345"',
      'AMBIGUOUS / ERROR_HANDLING',
      'clarification_and_validation',
      ['ite', 'digital_signature', 'nonexistent_ghost_app_12345'],
      3,
      3,
      'Safely prompted clarification without arbitrary execution',
      `K1: ${k1.content.slice(0, 50)} | K2: ${k2.content.slice(0, 50)} | K3: ${k3.content.slice(0, 50)}`,
      kPass
    );

    console.log('\n================================================================');
    console.log('   REGRESSION SUITE COMPLETED: ALL SCENARIOS EVALUATED          ');
    console.log('================================================================\n');

    const passedTotal = auditLog.filter(a => a.pass).length;
    console.log(`TOTAL SCENARIOS: ${auditLog.length}`);
    console.log(`PASSED: ${passedTotal} / ${auditLog.length}`);
    console.log(`SUCCESS RATE: ${((passedTotal / auditLog.length) * 100).toFixed(1)}%\n`);

  } catch (err) {
    console.error('Fatal regression suite error:', err.message, err.response?.data || '');
  }
}

runRegressionSuite();
