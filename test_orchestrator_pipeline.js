import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api/chat';

const TEST_COMMANDS = [
  { id: 1, text: "Open Notepad.", expectedIntent: "LAUNCH_APPLICATION", expectedMode: "DIRECT_TOOL" },
  { id: 2, text: "Open Chrome.", expectedIntent: "LAUNCH_APPLICATION", expectedMode: "DIRECT_TOOL" },
  { id: 3, text: "What is my CPU usage?", expectedIntent: "SYSTEM_TELEMETRY", expectedMode: "DIRECT_TOOL" },
  { id: 4, text: "Find my React project.", expectedIntent: "FILE_SEARCH", expectedMode: "DIRECT_TOOL" },
  { id: 5, text: "Open my current React project and run it.", expectedIntent: "PROJECT_EXECUTION", expectedMode: "MULTI_STEP_MISSION" },
  { id: 6, text: "Find my latest presentation and summarize it.", expectedIntent: "DOCUMENT_SUMMARIZATION", expectedMode: "MULTI_STEP_MISSION" },
  { id: 7, text: "Research the latest AI developments and prepare a YouTube script.", expectedIntent: "AUTONOMOUS_MISSION", expectedMode: "MULTI_STEP_MISSION" },
  { id: 8, text: "Create a reminder for tomorrow.", expectedIntent: "REMINDER_CREATION", expectedMode: "DIRECT_TOOL" },
  { id: 9, text: "Open Calculator and then open VS Code.", expectedIntent: "MULTI_STEP_TASK", expectedMode: "SINGLE_STEP_PLAN" },
  { id: 10, text: "Analyze the current screen and explain what is displayed.", expectedIntent: "SCREEN_ANALYSIS", expectedMode: "DIRECT_TOOL" },
  // Edge cases
  { id: 11, text: "Do that thing with the file.", expectedIntent: "AMBIGUOUS", expectedMode: "NEEDS_CLARIFICATION" },
  { id: 12, text: "Launch a nuclear missile.", expectedIntent: "UNSUPPORTED", expectedMode: "UNSUPPORTED" },
  { id: 13, text: "Delete all memories.", expectedIntent: "SENSITIVE_OPERATION", expectedMode: "DIRECT_TOOL" },
  { id: 14, text: "Who are you?", expectedIntent: "CONVERSATIONAL", expectedMode: "CONVERSATIONAL" }
];

async function runTests() {
  console.log('========================================================================');
  console.log('  NOVA CRITICAL EXECUTION PIPELINE VERIFICATION LABORATORY');
  console.log('========================================================================\n');

  let passedCount = 0;
  let failedCount = 0;
  const resultsSummary = [];

  for (const cmd of TEST_COMMANDS) {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`[TEST #${cmd.id}] Directive: "${cmd.text}"`);
    console.log(`------------------------------------------------------------------------`);

    try {
      const convId = `test-conv-${Date.now()}`;
      const res = await axios.post(`${BASE_URL}/message`, {
        conversationId: convId,
        content: cmd.text
      }, { timeout: 25000 });

      const data = res.data;
      const trace = data.executionTrace;
      const responseText = data.content || '';

      const isCannedMock = responseText.includes('standing by for multi-step execution');

      console.log(`> Detected Intent   : ${trace?.detected_intent} (Confidence: ${Math.round((trace?.intent_confidence || 1) * 100)}%)`);
      console.log(`> Execution Mode    : ${trace?.selected_execution_mode}`);
      console.log(`> Assigned Agent    : ${trace?.selected_agent}`);
      console.log(`> Contract Status   : ${trace?.contract_status}`);
      console.log(`> Tools Executed    : ${trace?.selected_tools?.join(', ') || 'None'}`);
      console.log(`> Tool Call Count   : ${data.toolExecutions?.length || 0}`);
      console.log(`> Approval Status   : ${trace?.approval_status}`);
      console.log(`> Validation Result : ${trace?.validation_result}`);
      console.log(`> Canned Mock Check : ${isCannedMock ? 'FAILED (MOCK DETECTED)' : 'PASSED (REAL RESPONSE)'}`);
      console.log(`> Assistant Response Preview:\n  "${responseText.slice(0, 160).replace(/\n/g, ' ')}..."`);

      let testPass = true;
      if (isCannedMock) {
        testPass = false;
        console.error(`❌ Test #${cmd.id} FAILED: Returned canned mock text!`);
      }

      if (cmd.expectedIntent && trace?.detected_intent !== cmd.expectedIntent) {
        testPass = false;
        console.error(`❌ Test #${cmd.id} FAILED: Expected intent ${cmd.expectedIntent}, got ${trace?.detected_intent}`);
      }

      if (testPass) {
        passedCount++;
        console.log(`✅ [TEST #${cmd.id} PASSED]`);
      } else {
        failedCount++;
      }

      resultsSummary.push({
        id: cmd.id,
        text: cmd.text,
        intent: trace?.detected_intent,
        mode: trace?.selected_execution_mode,
        contract: trace?.contract_status,
        tools: trace?.selected_tools,
        passed: testPass
      });

    } catch (err) {
      failedCount++;
      console.error(`❌ [TEST #${cmd.id} ERROR]:`, err.response?.data || err.message);
      resultsSummary.push({
        id: cmd.id,
        text: cmd.text,
        error: err.message,
        passed: false
      });
    }
  }

  console.log('\n========================================================================');
  console.log(`  VERIFICATION RESULTS: ${passedCount} PASSED / ${failedCount} FAILED (${passedCount + failedCount} TOTAL)`);
  console.log('========================================================================\n');

  console.table(resultsSummary.map(r => ({
    Test: `#${r.id}`,
    Directive: r.text.slice(0, 30),
    Intent: r.intent || 'ERROR',
    Mode: r.mode || 'N/A',
    Contract: r.contract || 'N/A',
    Passed: r.passed ? 'PASS' : 'FAIL'
  })));
}

runTests();
