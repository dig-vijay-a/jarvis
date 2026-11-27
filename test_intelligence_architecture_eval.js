import axios from 'axios';

const BACKEND_URL = 'http://localhost:5000';
let CONV_ID = `eval-test-${Date.now()}`;

async function runEvaluationSuite() {
  console.log('===============================================================');
  console.log('   NOVA INTELLIGENCE ARCHITECTURE — REGRESSION EVALUATION      ');
  console.log('===============================================================');

  // Initialize test conversation
  const convRes = await axios.post(`${BACKEND_URL}/api/chat/conversations`, {
    title: 'Intelligence Evaluation Session'
  });
  CONV_ID = convRes.data.conversation.id;
  console.log(`Initialized Test Conversation ID: ${CONV_ID}`);

  let passed = 0;
  let failed = 0;

  async function testCase(name, fn) {
    try {
      console.log(`\n▶ [TEST] ${name}`);
      await fn();
      console.log(`  ✔ PASSED: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✖ FAILED: ${name}`);
      console.error(`    Error: ${err.message}`);
      if (err.response?.data) {
        console.error('    Response Data:', err.response.data);
      }
      failed++;
    }
  }

  // DOMAIN 1: Application & Entity Resolution (Canonical Windows Utilities)
  await testCase('Entity Resolution: "Open device manager" maps to devmgmt.msc and launches', async () => {
    const res = await axios.post(`${BACKEND_URL}/api/chat/message`, {
      conversationId: CONV_ID,
      content: 'Open device manager'
    });
    const data = res.data;
    if (!data.success) throw new Error('API returned success: false');
    const tools = data.toolExecutions || [];
    const appLaunch = tools.find(t => t.tool === 'open_application');
    if (!appLaunch) throw new Error('open_application tool was not executed');
    if (appLaunch.args.app_name !== 'devmgmt') throw new Error(`Expected app_name 'devmgmt', got '${appLaunch.args.app_name}'`);
    if (!data.content.includes('Device Manager') && !data.content.includes('devmgmt') && !data.content.includes("I've opened")) {
      throw new Error(`Unexpected natural response: ${data.content}`);
    }
    console.log(`    Response: "${data.content}"`);
  });

  // DOMAIN 2: Entity Disambiguation (Presentation File vs App Name)
  await testCase('Entity Disambiguation: "Open my latest presentation" routes to file search & open, not app named mylatestpresentation', async () => {
    const res = await axios.post(`${BACKEND_URL}/api/chat/message`, {
      conversationId: CONV_ID,
      content: 'Open my latest presentation'
    });
    const data = res.data;
    if (!data.success) throw new Error('API returned success: false');
    const tools = data.toolExecutions || [];
    const openApp = tools.find(t => t.tool === 'open_application');
    if (openApp && openApp.args.app_name === 'mylatestpresentation') {
      throw new Error('FATAL: System erroneously attempted to launch application named "mylatestpresentation"!');
    }
    const searchFiles = tools.find(t => t.tool === 'search_files');
    if (!searchFiles) throw new Error('Expected search_files to locate *.pptx presentation files');
    console.log(`    Response: "${data.content}"`);
  });

  // DOMAIN 3: State-Aware Bulk Window Operations
  await testCase('State-Aware Bulk Window Management: Launch two Notepads then "Close all Notepad windows"', async () => {
    // Launch Notepad 1
    await axios.post(`${BACKEND_URL}/api/chat/message`, { conversationId: CONV_ID, content: 'Open Notepad' });
    await new Promise(r => setTimeout(r, 600));
    // Launch Notepad 2
    await axios.post(`${BACKEND_URL}/api/chat/message`, { conversationId: CONV_ID, content: 'Open Notepad' });
    await new Promise(r => setTimeout(r, 800));

    // Now execute bulk close
    const closeRes = await axios.post(`${BACKEND_URL}/api/chat/message`, {
      conversationId: CONV_ID,
      content: 'Close all Notepad windows'
    });
    const data = closeRes.data;
    if (!data.success) throw new Error('API returned success: false');
    const tools = data.toolExecutions || [];
    const bulkTool = tools.find(t => t.tool === 'manage_windows_bulk');
    if (!bulkTool) throw new Error('manage_windows_bulk tool was not called');
    if (bulkTool.args.target_pattern !== 'notepad') {
      throw new Error(`Expected pattern 'notepad', got '${bulkTool.args.target_pattern}'`);
    }
    console.log(`    Bulk Action Outcome: affected=${bulkTool.result?.affected}, message: "${data.content}"`);
  });

  // DOMAIN 4: Multi-Turn Context & Anaphora Tracking ("Search" -> "Draft about it" -> "Save that to my desktop")
  await testCase('Conversational Multi-Turn: Search -> "Draft about it" -> "Save that to my desktop"', async () => {
    // Turn 1: Search
    console.log('    Step 1: User says "search the web for the US versus Iran war and"');
    const searchRes = await axios.post(`${BACKEND_URL}/api/chat/message`, {
      conversationId: CONV_ID,
      content: 'search the web for the US versus Iran war and'
    });
    if (!searchRes.data.success) throw new Error('Turn 1 search failed');
    console.log(`    Turn 1 Reply: "${searchRes.data.content.slice(0, 120)}..."`);

    // Turn 2: "Draft about it"
    console.log('    Step 2: User says "Draft about it"');
    const draftRes = await axios.post(`${BACKEND_URL}/api/chat/message`, {
      conversationId: CONV_ID,
      content: 'Draft about it'
    });
    if (!draftRes.data.success) throw new Error('Turn 2 draft failed');
    if (draftRes.data.content.includes('System monitors are ready')) {
      throw new Error('FATAL: NOVA returned generic "System monitors are ready" placeholder instead of synthesizing draft!');
    }
    if (!draftRes.data.content.includes('Briefing') && !draftRes.data.content.includes('Executive') && !draftRes.data.content.includes('Strategic')) {
      throw new Error(`Draft synthesis did not contain briefing headers: ${draftRes.data.content.slice(0, 100)}`);
    }
    console.log(`    Turn 2 Reply: "${draftRes.data.content.slice(0, 150)}..."`);

    // Turn 3: "Save that to my desktop"
    console.log('    Step 3: User says "Save that to my desktop"');
    const saveRes = await axios.post(`${BACKEND_URL}/api/chat/message`, {
      conversationId: CONV_ID,
      content: 'Save that to my desktop'
    });
    if (!saveRes.data.success) throw new Error('Turn 3 save failed');
    const tools = saveRes.data.toolExecutions || [];
    const writeTool = tools.find(t => t.tool === 'write_file');
    if (!writeTool) throw new Error('write_file tool was not called for "Save that to my desktop"');
    const writtenBytes = writeTool.result?.bytes_written ?? writeTool.result?.size ?? 0;
    const writtenPath = writeTool.result?.file_path || writeTool.result?.path;
    if (!writeTool.result?.success || writtenBytes <= 0) {
      throw new Error(`File was not successfully written to disk: ${JSON.stringify(writeTool.result)}`);
    }
    console.log(`    Turn 3 File Created: "${writtenPath}" (${writtenBytes} bytes)`);
    console.log(`    Turn 3 Reply: "${saveRes.data.content}"`);
  });

  // DOMAIN 5: Truthful Verification & Elimination of Robotic Clichés
  await testCase('Natural Phrasing Audit: Verifies absence of repetitive military clichés', async () => {
    const telemetryRes = await axios.post(`${BACKEND_URL}/api/chat/message`, {
      conversationId: CONV_ID,
      content: 'What is my CPU usage?'
    });
    const text = telemetryRes.data.content;
    if (text.includes('Commander, I have analyzed your directive') || text.includes('System monitors are ready')) {
      throw new Error('Robotic military cliché detected in response!');
    }
    if (!text.includes('CPU') && !text.includes('%')) {
      throw new Error(`Response missing CPU telemetry: ${text}`);
    }
    console.log(`    Telemetry Reply: "${text}"`);
  });

  // DOMAIN 6: 15-Field Structured Execution Trace Verification
  await testCase('Observability: 15-field Execution Trace is populated and persisted', async () => {
    const convRes = await axios.get(`${BACKEND_URL}/api/chat/conversations/${CONV_ID}/messages`);
    const messages = convRes.data.messages || [];
    const assistantMsgs = messages.filter(m => m.sender === 'nova' && m.execution_trace);
    if (assistantMsgs.length === 0) throw new Error('No assistant messages with execution_trace found in DB');

    const sample = assistantMsgs[assistantMsgs.length - 1].execution_trace;
    const requiredFields = [
      'request_id',
      'original_user_message',
      'detected_intent',
      'intent_confidence',
      'selected_execution_mode',
      'selected_agent',
      'generated_plan',
      'selected_tools',
      'tool_arguments',
      'approval_status',
      'execution_started',
      'execution_result',
      'validation_result',
      'final_response',
      'contract_status'
    ];

    for (const field of requiredFields) {
      if (sample[field] === undefined) {
        throw new Error(`Missing required trace field: '${field}'`);
      }
    }
    console.log(`    All 15 execution trace fields validated on request ${sample.request_id} (contract_status: ${sample.contract_status})`);
  });

  console.log('\n===============================================================');
  console.log(`EVALUATION COMPLETE: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runEvaluationSuite();
