import axios from 'axios';
import { query, run, get } from '../database/db.js';
import MemoryIntelligenceService from '../services/memoryIntelligenceService.js';
import ToolRegistry from '../tools/registry.js';
import CoordinatorAgent from '../ai/agents/CoordinatorAgent.js';
import { TaskPlannerService, TASK_STATUSES } from '../services/taskPlannerService.js';
import VisionService from '../services/visionService.js';

const BACKEND_URL = 'http://localhost:5000';
const AGENT_URL = 'http://localhost:8000';
const AGENT_TOKEN = 'nova-local-agent-secure-token-2026';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] Test ${totalTests}: ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTestSuite() {
  console.log(`=======================================================`);
  console.log(`   NOVA PHASE 2 — COMPREHENSIVE AUTOMATED TEST SUITE   `);
  console.log(`=======================================================\n`);

  // Clean up prior test runs
  await run("DELETE FROM memories WHERE key LIKE 'ArchPreference_%'");

  // --- 1. Memory Persistence & Schema ---
  console.log('--- 1. Testing Memory Persistence & Categories ---');
  const testKey = `ArchPreference_${Date.now()}`;
  const stored = await MemoryIntelligenceService.storeMemory({
    key: testKey,
    value: 'User prefers dark glassmorphic HUD interfaces with cyan neon accents.',
    category: 'Preferences',
    importance: 4,
    source: 'user_explicit'
  });
  assert(stored.created === true, 'Memory successfully committed to SQLite.');
  const inDb = await get('SELECT * FROM memories WHERE id = ?', [stored.id]);
  assert(inDb && inDb.key === testKey, 'Memory persisted with matching key.');
  assert(inDb.category === 'Preferences', 'Memory category preserved.');
  assert(inDb.importance === 4, 'Importance rank (1-5) stored.');
  assert(inDb.source === 'user_explicit', 'Source attribution recorded.');

  // --- 2. Memory Retrieval Scoring ---
  console.log('\n--- 2. Testing Memory Retrieval Relevance Scoring ---');
  const relevant = await MemoryIntelligenceService.retrieveRelevantMemories('What UI design and accents does the user like?', 3);
  assert(relevant.length > 0, 'Relevant memories retrieved based on prompt context.');
  assert(relevant.some(m => m.key === testKey), 'Newly stored memory surfaced in top relevant results.');
  assert(relevant[0].relevanceScore !== undefined, 'Memory assigned calculated relevance score.');

  // --- 3. Duplicate Detection ---
  console.log('\n--- 3. Testing Duplicate Detection Defense ---');
  const dupCheckExact = await MemoryIntelligenceService.detectDuplicate(testKey, 'Some new value');
  assert(dupCheckExact.isDuplicate === true, 'Duplicate detector caught exact key match.');

  const dupCheckSimilar = await MemoryIntelligenceService.detectDuplicate('User interface accent preference', 'User prefers dark cyan neon themes.');
  assert(dupCheckSimilar.isDuplicate === true, 'Duplicate detector caught semantic conceptual match.');

  // --- 4. Tool Registry Matrix ---
  console.log('\n--- 4. Testing Tool Registry & Scoping ---');
  const tools = ToolRegistry.getTools();
  assert(tools.length >= 10, `Registry contains ${tools.length} active registered tools.`);
  const toolNames = tools.map(t => t.name);
  assert(toolNames.includes('get_system_telemetry'), 'get_system_telemetry registered.');
  assert(toolNames.includes('open_application'), 'open_application registered.');
  assert(toolNames.includes('search_files'), 'search_files registered.');
  assert(toolNames.includes('save_memory'), 'save_memory registered.');
  assert(toolNames.includes('search_web'), 'search_web registered.');

  // --- 5. Multi-Agent Intent Classification ---
  console.log('\n--- 5. Testing Multi-Agent Intent Routing ---');
  const researchIntent = CoordinatorAgent.classifyIntentAndSelectAgent('Search the web for top AI agent developments 2026');
  assert(researchIntent.agentKey === 'research', 'Research directive routed to Research Agent.');
  assert(researchIntent.agent.allowedTools.includes('search_web'), 'Research Agent granted search_web permission.');
  assert(!researchIntent.agent.allowedTools.includes('open_application'), 'Research Agent denied open_application permission (least privilege).');

  const codingIntent = CoordinatorAgent.classifyIntentAndSelectAgent('Debug syntax error in python script');
  assert(codingIntent.agentKey === 'coding', 'Coding directive routed to Coding Agent.');

  const productivityIntent = CoordinatorAgent.classifyIntentAndSelectAgent('Set a reminder to review code at 8 PM');
  assert(productivityIntent.agentKey === 'productivity', 'Reminder directive routed to Productivity Agent.');

  // --- 6. Autonomous Task Planner Decomposition & Execution ---
  console.log('\n--- 6. Testing Autonomous Task Planner ---');
  const planner = new TaskPlannerService(null);
  const plan = await planner.createPlan('Inspect system telemetry and save memory update');
  assert(plan.steps && plan.steps.length >= 2, `Instruction decomposed into ${plan.steps.length} sequential steps.`);
  assert(plan.status === TASK_STATUSES.PENDING, 'Initial plan status set to PENDING.');

  await planner.executeTask(plan.id);
  const updatedTask = await get('SELECT * FROM planned_tasks WHERE id = ?', [plan.id]);
  assert(updatedTask.status === TASK_STATUSES.COMPLETED, 'Task execution completed all steps.');
  const parsedSteps = JSON.parse(updatedTask.steps);
  assert(parsedSteps[0].status === TASK_STATUSES.COMPLETED, 'Step 1 status is COMPLETED.');

  // --- 7. Approval Handling on Sensitive Actions ---
  console.log('\n--- 7. Testing Approval Handling on Sensitive Operations ---');
  const sensitivePlan = {
    id: `task-sensitive-${Date.now()}`,
    instruction: 'Delete deprecated memory entry',
    plan: 'Security approval test',
    steps: JSON.stringify([
      { id: 1, name: 'Request memory deletion', tool: 'delete_memory', args: { id: 'dummy-id' }, status: TASK_STATUSES.PENDING, requires_approval: true }
    ]),
    status: TASK_STATUSES.PENDING,
    current_step_index: 0,
    created_at: new Date().toISOString()
  };
  await run(
    'INSERT INTO planned_tasks (id, instruction, plan, steps, status, current_step_index, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [sensitivePlan.id, sensitivePlan.instruction, sensitivePlan.plan, sensitivePlan.steps, sensitivePlan.status, 0, sensitivePlan.created_at]
  );
  await planner.executeTask(sensitivePlan.id);
  const pausedTask = await get('SELECT * FROM planned_tasks WHERE id = ?', [sensitivePlan.id]);
  assert(pausedTask.status === TASK_STATUSES.WAITING_FOR_APPROVAL, 'Task halted execution and transitioned to WAITING_FOR_APPROVAL.');

  // Approve step and test resume
  const approvalRes = await planner.approveStep(sensitivePlan.id, 0);
  assert(approvalRes.success === true, 'Approval successfully acknowledged.');

  // --- 8. Task Cancellation ---
  console.log('\n--- 8. Testing Task Cancellation ---');
  const cancelTestTask = await planner.createPlan('Long multi-step pipeline for cancellation test');
  await planner.cancelTask(cancelTestTask.id);
  const cancelledDb = await get('SELECT status FROM planned_tasks WHERE id = ?', [cancelTestTask.id]);
  assert(cancelledDb.status === TASK_STATUSES.CANCELLED, 'Task successfully cancelled.');

  // --- 9. Python Agent Authentication & Origin Validation ---
  console.log('\n--- 9. Testing Python Agent Security & Authentication ---');
  try {
    await axios.get(`${AGENT_URL}/api/system/info`, { timeout: 3000 });
    assert(false, 'Expected 401 Unauthorized when missing token.');
  } catch (err) {
    assert(err.response?.status === 401, '401 Unauthorized returned when token is missing.');
  }

  const authedRes = await axios.get(`${AGENT_URL}/api/system/info`, {
    headers: { Authorization: `Bearer ${AGENT_TOKEN}` },
    timeout: 3000
  });
  assert(authedRes.status === 200, '200 OK returned with valid Bearer token.');
  assert(authedRes.data.success === true, 'Telemetry payload returned.');

  // --- 10. File Access Restrictions & Sandboxing ---
  console.log('\n--- 10. Testing File Access Boundaries ---');
  try {
    await axios.post(`${AGENT_URL}/api/action/read-file`, {
      file_path: 'C:\\Windows\\System32\\drivers\\etc\\hosts'
    }, {
      headers: { Authorization: `Bearer ${AGENT_TOKEN}` },
      timeout: 3000
    });
    assert(false, 'Expected failure on accessing C:\\Windows\\System32.');
  } catch (err) {
    assert(err.response?.status === 400 || err.response?.status === 403, 'Path traversal to Windows System directory rejected by security validator.');
  }

  // --- 11. Persistent Scheduler ---
  console.log('\n--- 11. Testing Persistent Scheduler ---');
  const testJob = {
    id: `job-test-${Date.now()}`,
    title: 'Audit System Diagnostics',
    type: 'RECURRING_REMINDER',
    schedule_type: 'RECURRING',
    schedule_value: 'every_24h',
    next_run_at: new Date(Date.now() + 86400000).toISOString(),
    action_type: 'DAILY_TASK_SUMMARY',
    created_at: new Date().toISOString()
  };
  await run(
    'INSERT INTO scheduled_jobs (id, title, type, schedule_type, schedule_value, next_run_at, status, action_type, created_at) VALUES (?, ?, ?, ?, ?, ?, "ACTIVE", ?, ?)',
    [testJob.id, testJob.title, testJob.type, testJob.schedule_type, testJob.schedule_value, testJob.next_run_at, testJob.action_type, testJob.created_at]
  );
  const jobDb = await get('SELECT * FROM scheduled_jobs WHERE id = ?', [testJob.id]);
  assert(jobDb && jobDb.title === testJob.title, 'Scheduled job persisted in SQLite.');

  // --- 12. Screen Intelligence Pipeline ---
  console.log('\n--- 12. Testing Screen Intelligence & Vision ---');
  const dummyB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const visionRes = await VisionService.analyzeScreen({
    imageBase64: dummyB64,
    mode: 'summarize'
  });
  assert(visionRes.success === true, 'Vision analysis pipeline processed image capture.');
  assert(visionRes.analysis && visionRes.analysis.length > 0, 'Vision report generated.');

  console.log(`\n=======================================================`);
  console.log(`  ALL TESTS PASSED: ${passedTests} / ${totalTests} (100% SUCCESS)`);
  console.log(`=======================================================\n`);
}

runTestSuite().catch(err => {
  console.error('\n[FATAL] Test suite failed:', err);
  process.exit(1);
});
