import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api/chat';

const USER_COMMANDS = [
  { id: 1, text: "Open device manager", expectedIntent: "LAUNCH_APPLICATION" },
  { id: 2, text: "Can you open notepad", expectedIntent: "LAUNCH_APPLICATION" },
  { id: 3, text: "I need to write something", expectedIntent: "LAUNCH_APPLICATION" },
  { id: 4, text: "Browser", expectedIntent: "LAUNCH_APPLICATION" },
  { id: 5, text: "Can you find my react project named hydrigine", expectedIntent: "FILE_SEARCH" },
  { id: 6, text: "Show all open windows", expectedIntent: "LIST_WINDOWS" },
  { id: 7, text: "Minimize Chrome", expectedIntent: "WINDOW_MANAGEMENT" },
  { id: 8, text: "Maximize notepad", expectedIntent: "WINDOW_MANAGEMENT" },
  { id: 9, text: "Restore Chrome", expectedIntent: "WINDOW_MANAGEMENT" },
  { id: 10, text: "Close calculator", expectedIntent: "WINDOW_MANAGEMENT" },
  { id: 11, text: "Switch to vs code", expectedIntent: "WINDOW_MANAGEMENT" },
  { id: 12, text: "Open notepad and calculator", expectedIntent: "MULTI_STEP_TASK" },
  { id: 13, text: "Search for us recently run War and teleport it", expectedIntent: "WEB_SEARCH" },
  { id: 14, text: "Draft about it", expectedIntent: "DRAFT_CREATION" },
  { id: 15, text: "Okay that is sleep", expectedIntent: "SLEEP_DIRECTIVE" }
];

async function runUserTests() {
  console.log('========================================================================');
  console.log('  TESTING REAL USER DICTATIONS FROM SESSION TRANSCRIPT');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  for (const cmd of USER_COMMANDS) {
    try {
      const res = await axios.post(`${BASE_URL}/message`, {
        conversationId: 'conv-main',
        content: cmd.text
      }, { timeout: 15000 });

      const data = res.data;
      const trace = data.executionTrace;
      const resp = data.content || '';
      const isCanned = resp.includes('standing by for multi-step execution');

      console.log(`\n[#${cmd.id}] "${cmd.text}"`);
      console.log(`  Intent     : ${trace?.detected_intent}`);
      console.log(`  Tools      : ${trace?.selected_tools?.join(', ') || 'None'}`);
      console.log(`  Contract   : ${trace?.contract_status}`);
      console.log(`  Response   : "${resp.slice(0, 140).replace(/\n/g, ' ')}..."`);

      let ok = true;
      if (isCanned) {
        ok = false;
        console.error('  FAILED: Returned canned mock text');
      }
      if (cmd.expectedIntent && trace?.detected_intent !== cmd.expectedIntent) {
        ok = false;
        console.error(`  FAILED: Expected intent ${cmd.expectedIntent}, got ${trace?.detected_intent}`);
      }

      if (ok) {
        passed++;
        console.log('  Status     : ✅ PASS');
      } else {
        failed++;
        console.log('  Status     : ❌ FAIL');
      }
    } catch (err) {
      failed++;
      console.error(`\n[#${cmd.id}] "${cmd.text}" -> ERROR:`, err.response?.data || err.message);
    }
  }

  console.log('\n========================================================================');
  console.log(`  USER TRANSCRIPT VERIFICATION: ${passed} PASSED / ${failed} FAILED (${passed + failed} TOTAL)`);
  console.log('========================================================================\n');
}

runUserTests();
