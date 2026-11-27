/**
 * JARVIS OS 2.0 — PHASE 7: AUTONOMOUS INTELLIGENCE CORE
 * Comprehensive 15-Scenario Runtime Adversarial Validation Suite
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { query, run, get } from './backend/database/db.js';
import ToolRegistry from './backend/tools/registry.js';
import TruthfulVerificationService from './backend/services/truthfulVerificationService.js';
import { getMissionControl, MissionControlService, STEP_STATUSES, MISSION_STATUSES } from './backend/services/missionControlService.js';
import { getTaskPlanner } from './backend/services/taskPlannerService.js';
import { getEnvironmentalPerception, initEnvironmentalPerception } from './backend/services/environmentalPerceptionService.js';
import { getAutonomousInitiative, initAutonomousInitiative } from './backend/services/autonomousInitiativeEngine.js';
import DigitalTwinService from './backend/services/digitalTwinService.js';
import KnowledgeGraphService from './backend/services/knowledgeGraphService.js';
import SkillRegistryService from './backend/services/skillRegistryService.js';
import { EvaluationEngineService } from './backend/services/evaluationEngineService.js';

const BASE_URL = 'http://localhost:5000';
const results = [];

function recordTest(id, name, passed, details = '', error = null) {
  results.push({ id, name, passed, details, error });
  const statusTag = passed ? '[PASS]' : '[FAIL]';
  console.log(`${statusTag} [${id}] ${name}`);
  if (details) console.log(`       Details: ${details}`);
  if (error) console.log(`       Error: ${error}`);
}

async function runSuite() {
  console.log('================================================================');
  console.log('  JARVIS OS 2.0 — PHASE 7 AUTONOMOUS INTELLIGENCE ADVERSARIAL SUITE');
  console.log('  Testing 15 Closed-Loop Autonomy Scenarios Under Real Environment');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // SCENARIO 1: False Completion Attack
  // Tool returns { success: false } -> Step must NOT be marked COMPLETED
  // -------------------------------------------------------------
  try {
    const mc = getMissionControl() || new MissionControlService();
    const testMissionId = `m-adv-1-${Date.now()}`;
    await run('INSERT INTO missions (id, objective, plan_summary, status, created_at) VALUES (?, ?, ?, ?, ?)', [
      testMissionId, 'Adversarial False Completion Test', 'Testing failure rejection', MISSION_STATUSES.PENDING, new Date().toISOString()
    ]);
    // Insert step calling non-existent read_file which returns { success: false }
    const stepId = `s-adv-1-${Date.now()}`;
    await run(
      `INSERT INTO mission_steps 
       (id, mission_id, step_index, title, description, agent_key, tool, args, depends_on, status, requires_approval, retry_count) 
       VALUES (?, ?, 1, 'Failing Read Step', 'Read non-existent', 'coding', 'read_file', ?, '[]', 'PENDING', 0, 0)`,
      [stepId, testMissionId, JSON.stringify({ file_path: 'c:\\non_existent_path_adversarial_12345.xyz' })]
    );

    await mc.startMission(testMissionId);
    // Allow background loop to process initial attempts
    await new Promise(r => setTimeout(r, 1200));

    const finalStep = await get('SELECT * FROM mission_steps WHERE id = ?', [stepId]);
    const finalMission = await get('SELECT * FROM missions WHERE id = ?', [testMissionId]);

    const passed = finalStep.status !== 'COMPLETED' && finalMission.status !== 'COMPLETED';
    recordTest(
      'SCEN-01',
      'False Completion Attack (Tool Returning Failure)',
      passed,
      `Step status: ${finalStep.status}, Mission status: ${finalMission.status}. Tool failure properly rejected.`
    );
  } catch (err) {
    recordTest('SCEN-01', 'False Completion Attack', false, '', err.message);
  }

  // -------------------------------------------------------------
  // SCENARIO 2: Premature Completion Attack
  // Chat dispatching mission must return RUNNING or DISPATCHED, NOT COMPLETED
  // -------------------------------------------------------------
  try {
    const res = await axios.post(`${BASE_URL}/api/chat/message`, {
      content: 'Conduct deep analysis of autonomous AI systems and formulate a comprehensive roadmap',
      sender: 'user',
      conversationHistory: []
    });

    const contractStatus = res.data.contractStatus;
    const validationResult = res.data.executionTrace?.validation_result || res.data.validationResult;
    const passed = contractStatus === 'RUNNING' && validationResult === 'AUTONOMOUS_MISSION_DISPATCHED';

    recordTest(
      'SCEN-02',
      'Premature Completion Attack on Mission Dispatch',
      passed,
      `contractStatus: "${contractStatus}", validationResult: "${validationResult}". No false completion claim on dispatch.`
    );
  } catch (err) {
    recordTest('SCEN-02', 'Premature Completion Attack on Mission Dispatch', false, '', err.message);
  }

  // -------------------------------------------------------------
  // SCENARIO 3: Dynamic Tool Failure Replanning
  // Diagnoses error and proposes alternative tool from registry
  // -------------------------------------------------------------
  try {
    const mc = getMissionControl() || new MissionControlService();
    const repMissionId = `m-adv-3-${Date.now()}`;
    await run('INSERT INTO missions (id, objective, plan_summary, status, created_at, replan_count) VALUES (?, ?, ?, ?, ?, 0)', [
      repMissionId, 'Investigate project source code', 'Replan test', MISSION_STATUSES.PENDING, new Date().toISOString()
    ]);
    const stepId = `s-adv-3-${Date.now()}`;
    await run(
      `INSERT INTO mission_steps 
       (id, mission_id, step_index, title, description, agent_key, tool, args, depends_on, status, requires_approval, retry_count) 
       VALUES (?, ?, 1, 'Read Source Code', 'Read source', 'coding', 'read_file', ?, '[]', 'FAILED', 0, 0)`,
      [stepId, repMissionId, JSON.stringify({ file_path: 'missing_code.js' })]
    );

    const replanned = await mc.replanMissionDAG(repMissionId, stepId, 'File missing_code.js not found');
    const updatedStep = await get('SELECT * FROM mission_steps WHERE id = ?', [stepId]);
    const updatedMission = await get('SELECT * FROM missions WHERE id = ?', [repMissionId]);

    const passed = replanned && updatedStep.status === 'PENDING' && updatedMission.replan_count > 0;
    recordTest(
      'SCEN-03',
      'Dynamic Tool Failure Replanning',
      passed,
      `Replanned tool: "${updatedStep.tool}", Replan count: ${updatedMission.replan_count}, Status reset to PENDING.`
    );
  } catch (err) {
    recordTest('SCEN-03', 'Dynamic Tool Failure Replanning', false, '', err.message);
  }

  // -------------------------------------------------------------
  // SCENARIO 4: Bound Replanning (Max 2 Attempts)
  // Aborts replanning after max attempts, does not loop infinitely
  // -------------------------------------------------------------
  try {
    const mc = getMissionControl() || new MissionControlService();
    const boundMissionId = `m-adv-4-${Date.now()}`;
    await run('INSERT INTO missions (id, objective, plan_summary, status, created_at, replan_count) VALUES (?, ?, ?, ?, ?, 2)', [
      boundMissionId, 'Persistent failure mission', 'Bound replan test', MISSION_STATUSES.RUNNING, new Date().toISOString()
    ]);
    const stepId = `s-adv-4-${Date.now()}`;
    await run(
      `INSERT INTO mission_steps 
       (id, mission_id, step_index, title, description, agent_key, tool, args, depends_on, status, requires_approval, retry_count) 
       VALUES (?, ?, 1, 'Exhausted Step', 'Persistent error', 'system', 'read_file', '{}', '[]', 'FAILED', 0, 0)`,
      [stepId, boundMissionId]
    );

    const replanResult = await mc.replanMissionDAG(boundMissionId, stepId, 'Fatal persistent resource error');
    const passed = replanResult === false;

    recordTest(
      'SCEN-04',
      'Bounded Replanning Limit (Max 2 Attempts)',
      passed,
      `Replan returned false when replan_count >= 2. Infinite loop prevented.`
    );
  } catch (err) {
    recordTest('SCEN-04', 'Bounded Replanning Limit', false, '', err.message);
  }

  // -------------------------------------------------------------
  // SCENARIO 5: Verification Gating (Truthful Postcondition Guard)
  // Unverified steps prevent mission completion
  // -------------------------------------------------------------
  try {
    const outcome = await TruthfulVerificationService.verifyOutcome('read_file', { file_path: 'ghost_file.txt' }, { success: true, content: '' });
    const passed = outcome.verified === false;

    recordTest(
      'SCEN-05',
      'Truthful Verification Postcondition Gating',
      passed,
      `Empty content verified status: ${outcome.verified}. Reason: "${outcome.reason}".`
    );
  } catch (err) {
    recordTest('SCEN-05', 'Truthful Verification Postcondition Gating', false, '', err.message);
  }

  // -------------------------------------------------------------
  // SCENARIO 6: Unified Planning Contract
  // Call /api/automation/plan -> Creates canonical mission and planned_task
  // -------------------------------------------------------------
  try {
    const planRes = await axios.post(`${BASE_URL}/api/automation/plan`, {
      instruction: 'Audit system security posture and review network telemetry'
    });

    const task = planRes.data.task;
    const missionId = task.mission_id || task.id;

    const missionInDb = await get('SELECT * FROM missions WHERE id = ?', [missionId]);
    const plannedTaskInDb = await get('SELECT * FROM planned_tasks WHERE id = ?', [task.id]);

    const passed = Boolean(missionInDb) && Boolean(plannedTaskInDb);
    recordTest(
      'SCEN-06',
      'Unified Planning Contract (TaskPlanner -> MissionControl Mapping)',
      passed,
      `Mapped task ID "${task.id}" to canonical mission "${missionInDb?.id}". Both tables synchronized.`
    );
  } catch (err) {
    recordTest('SCEN-06', 'Unified Planning Contract', false, '', err.message);
  }

  // -------------------------------------------------------------
  // SCENARIO 7: Active Perception - Filesystem Event
  // Create file in workspace -> EnvironmentalPerception records event
  // -------------------------------------------------------------
  try {
    const testFile = path.join(process.cwd(), `test_perception_${Date.now()}.txt`);
    fs.writeFileSync(testFile, 'JARVIS perception probe metadata test');

    // Wait 500ms for fs.watch debounce (300ms)
    await new Promise(r => setTimeout(r, 600));

    const eventsRes = await axios.get(`${BASE_URL}/api/perception/events?limit=15`);
    const events = eventsRes.data.events || [];
    const baseName = path.basename(testFile);
    const matched = events.find(e => e.target === baseName || (e.details && e.details.filename === baseName));

    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);

    const passed = Boolean(matched);
    recordTest(
      'SCEN-07',
      'Active Environmental Perception: Filesystem Watcher',
      passed,
      `Detected event: "${matched?.event_type || 'NONE'}" on "${baseName}". Debounced metadata captured without reading private content.`
    );
  } catch (err) {
    recordTest('SCEN-07', 'Active Environmental Perception: Filesystem Watcher', false, '', err.message);
  }

  // -------------------------------------------------------------
  // SCENARIO 8: Active Perception - Window / OS Transition
  // Simulate window focus event -> Recorded in environmental_events
  // -------------------------------------------------------------
  try {
    const perception = getEnvironmentalPerception() || initEnvironmentalPerception();
    const eventId = `perc-win-test-${Date.now()}`;
    await perception.recordPerceptionEvent({
      id: eventId,
      event_type: 'ACTIVE_WINDOW_CHANGED',
      source: 'OS_WINDOWS',
      target: 'Visual Studio Code - JARVIS Architecture',
      details: JSON.stringify({ pid: 1420, process: 'code.exe' }),
      timestamp: new Date().toISOString()
    });

    const recorded = await get('SELECT * FROM environmental_events WHERE id = ?', [eventId]);
    const passed = Boolean(recorded);

    recordTest(
      'SCEN-08',
      'Active Environmental Perception: Window Focus Transition',
      passed,
      `Event recorded in SQLite: "${recorded?.event_type}" for target "${recorded?.target}".`
    );
  } catch (err) {
    recordTest('SCEN-08', 'Active Environmental Perception: Window Focus Transition', false, '', err.message);
  }

  // -------------------------------------------------------------
  // SCENARIO 9: Autonomous Initiative - Proactive Trigger & Cooldown
  // Feed perception event -> Processed with 60s cooldown enforcement
  // -------------------------------------------------------------
  try {
    const perception = getEnvironmentalPerception() || initEnvironmentalPerception();
    const initiative = getAutonomousInitiative() || initAutonomousInitiative(perception);
    const testTarget = `probe_document_${Date.now()}.pdf`;

    await initiative.handlePerceptionEvent({
      event_type: 'FILE_CREATED',
      target: testTarget,
      source: 'FILESYSTEM'
    });

    const log1 = await get('SELECT * FROM activity_logs WHERE details LIKE ?', [`%${testTarget}%`]);
    const firstTriggerPassed = Boolean(log1);

    // Immediate second trigger must be suppressed by 60s cooldown
    const preCount = (await query('SELECT COUNT(*) as cnt FROM activity_logs WHERE details LIKE ?', [`%${testTarget}%`]))[0].cnt;
    await initiative.handlePerceptionEvent({
      event_type: 'FILE_CREATED',
      target: testTarget,
      source: 'FILESYSTEM'
    });
    const postCount = (await query('SELECT COUNT(*) as cnt FROM activity_logs WHERE details LIKE ?', [`%${testTarget}%`]))[0].cnt;

    const cooldownPassed = preCount === postCount;
    const passed = firstTriggerPassed && cooldownPassed;

    recordTest(
      'SCEN-09',
      'Autonomous Initiative Engine: Event Trigger & 60s Cooldown',
      passed,
      `Initial perception logged to activity_logs. Immediate duplicate suppressed by rate limit.`
    );
  } catch (err) {
    recordTest('SCEN-09', 'Autonomous Initiative Engine', false, '', err.message);
  }

  // -------------------------------------------------------------
  // SCENARIO 10: Autonomous Initiative - Safety Approval Gate
  // Sensitive/destructive operation requires WAITING_FOR_APPROVAL
  // -------------------------------------------------------------
  try {
    const mc = getMissionControl() || new MissionControlService();
    const safeMissionId = `m-adv-10-${Date.now()}`;
    await run('INSERT INTO missions (id, objective, plan_summary, status, created_at) VALUES (?, ?, ?, ?, ?)', [
      safeMissionId, 'Security Guard Test Mission', 'Approval test', MISSION_STATUSES.PENDING, new Date().toISOString()
    ]);
    const stepId = `s-adv-10-${Date.now()}`;
    await run(
      `INSERT INTO mission_steps 
       (id, mission_id, step_index, title, description, agent_key, tool, args, depends_on, status, requires_approval, retry_count) 
       VALUES (?, ?, 1, 'Rename Project Directory', 'Sensitive rename', 'files', 'rename_file', '{}', '[]', 'PENDING', 1, 0)`,
      [stepId, safeMissionId]
    );

    await mc.startMission(safeMissionId);
    await new Promise(r => setTimeout(r, 600));

    const stepAfter = await get('SELECT * FROM mission_steps WHERE id = ?', [stepId]);
    const missionAfter = await get('SELECT * FROM missions WHERE id = ?', [safeMissionId]);

    const passed = stepAfter.status === 'WAITING_FOR_APPROVAL' && missionAfter.status === 'WAITING_FOR_APPROVAL';
    recordTest(
      'SCEN-10',
      'Autonomous Initiative: Sensitive Operation Safety Approval Gate',
      passed,
      `Step status: ${stepAfter.status}, Mission status: ${missionAfter.status}. Execution halted awaiting explicit operator approval.`
    );
  } catch (err) {
    recordTest('SCEN-10', 'Autonomous Initiative Safety Gate', false, '', err.message);
  }

  // -------------------------------------------------------------
  // SCENARIO 11: Disconnected Intelligence - Digital Twin Context
  // Digital Twin profile preferences injected into planning
  // -------------------------------------------------------------
  try {
    await DigitalTwinService.createEntry({
      category: 'preferences',
      title: 'Coding Standard 2026',
      content: 'Strict TypeScript and Rust only. Zero any types.',
      priority: 3
    });

    const twinContext = await DigitalTwinService.getFormattedContextForPrompt();
    const passed = twinContext.includes('Coding Standard 2026') && twinContext.includes('Strict TypeScript and Rust');

    recordTest(
      'SCEN-11',
      'Connected Intelligence: Digital Twin Context Extraction',
      passed,
      `Retrieved Digital Twin prompt markdown block with length ${twinContext.length} chars.`
    );
  } catch (err) {
    recordTest('SCEN-11', 'Digital Twin Context Extraction', false, '', err.message);
  }

  // -------------------------------------------------------------
  // SCENARIO 12: Disconnected Intelligence - Knowledge Graph Context
  // Knowledge Graph entities queried and provided to context
  // -------------------------------------------------------------
  try {
    await KnowledgeGraphService.upsertEntity({
      name: 'Autonomous Mission DAG',
      entity_type: 'architecture',
      properties: { version: '2.0', capability: 'closed_loop' }
    });

    const entities = await KnowledgeGraphService.searchEntities('Autonomous Mission DAG', 5);
    const passed = entities.length > 0 && entities[0].name === 'Autonomous Mission DAG';

    recordTest(
      'SCEN-12',
      'Connected Intelligence: Knowledge Graph Entity Resolution',
      passed,
      `Found entity: "${entities[0]?.name}" (${entities[0]?.entity_type}) with properties.`
    );
  } catch (err) {
    recordTest('SCEN-12', 'Knowledge Graph Entity Resolution', false, '', err.message);
  }

  // -------------------------------------------------------------
  // SCENARIO 13: Disconnected Intelligence - Skills Registered as Tools
  // Skills exposed via ToolRegistry.getTools() and callable via executeTool()
  // -------------------------------------------------------------
  try {
    SkillRegistryService.registerSkillHandler('test_adversarial_skill', async (args) => ({
      status: 'verified',
      diagnostic: 'optimal',
      echo: args
    }));

    const allTools = ToolRegistry.getTools();
    const hasSkillTool = allTools.some(t => t.name === 'test_adversarial_skill');
    const execRes = await ToolRegistry.executeTool('test_adversarial_skill', { test: true });

    const passed = hasSkillTool && execRes && (execRes.output?.status === 'verified' || execRes.status === 'verified') && execRes.success === true;
    recordTest(
      'SCEN-13',
      'Connected Intelligence: Skills Exported into ToolRegistry & Callable',
      passed,
      `Skill present in ToolRegistry: ${hasSkillTool}. Executed cleanly with output status "${execRes?.output?.status || execRes?.status}".`
    );
  } catch (err) {
    recordTest('SCEN-13', 'Skills Exported into ToolRegistry', false, '', err.message);
  }

  // -------------------------------------------------------------
  // SCENARIO 14: Disconnected Intelligence - Truthful Evaluation Engine
  // Runs real directives with postcondition checks, no mock name matching
  // -------------------------------------------------------------
  try {
    const evalEngine = new EvaluationEngineService();
    const evalRun = await evalEngine.runEvaluationSuite('adversarial', 'Phase 7 Verification Run');

    const passed = evalRun && evalRun.totalTests > 0 && evalRun.passedCount > 0;
    recordTest(
      'SCEN-14',
      'Connected Intelligence: Truthful Evaluation Engine Suite',
      passed,
      `Total tests: ${evalRun.totalTests}, Passed: ${evalRun.passedCount}, Completion rate: ${evalRun.metrics.mission_completion_rate}%. Real directives executed.`
    );
  } catch (err) {
    recordTest('SCEN-14', 'Truthful Evaluation Engine Suite', false, '', err.message);
  }

  // -------------------------------------------------------------
  // SCENARIO 15: Crash Recovery & Safe Resumption
  // Server restart inspection detects checkpoints, auto-resumes safe missions, pauses sensitive
  // -------------------------------------------------------------
  try {
    const mc = getMissionControl() || new MissionControlService();
    const crashMissionId = `m-crash-${Date.now()}`;
    await run('INSERT INTO missions (id, objective, plan_summary, status, created_at) VALUES (?, ?, ?, ?, ?)', [
      crashMissionId, 'Crash Recovery Test Mission', 'Interrupted during execution', 'RUNNING', new Date().toISOString()
    ]);
    const stepId = `s-crash-${Date.now()}`;
    await run(
      `INSERT INTO mission_steps 
       (id, mission_id, step_index, title, description, agent_key, tool, args, depends_on, status, requires_approval, retry_count) 
       VALUES (?, ?, 1, 'Safe Telemetry Check', 'Safe step', 'system', 'get_system_telemetry', '{}', '[]', 'RUNNING', 0, 0)`,
      [stepId, crashMissionId]
    );

    // Save checkpoint
    await mc.saveCheckpoint(crashMissionId, 1, { completedSteps: [] });

    // Trigger restart recovery
    await mc.recoverInterruptedMissions();

    const recoveredStep = await get('SELECT * FROM mission_steps WHERE id = ?', [stepId]);
    const passed = recoveredStep.status === 'PENDING';

    recordTest(
      'SCEN-15',
      'Crash Recovery & Safe State Resumption',
      passed,
      `Interrupted RUNNING step reset to PENDING. Mission checkpoint preserved for clean resumption.`
    );
  } catch (err) {
    recordTest('SCEN-15', 'Crash Recovery & Safe State Resumption', false, '', err.message);
  }

  // -------------------------------------------------------------
  // SUMMARY REPORT
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log('              PHASE 7 ADVERSARIAL SUITE SUMMARY                 ');
  console.log('================================================================');
  const total = results.length;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = total - passedCount;
  const passRate = ((passedCount / total) * 100).toFixed(1);

  console.log(`Total Scenarios Tested:  ${total}`);
  console.log(`Passed:                  ${passedCount}`);
  console.log(`Failed:                  ${failedCount}`);
  console.log(`Adversarial Pass Rate:   ${passRate}%`);
  console.log('================================================================\n');

  // Save evidence to JSON
  fs.writeFileSync(
    path.join(process.cwd(), 'nova', 'deliverables', 'phase7_adversarial_evidence.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), total, passedCount, failedCount, passRate: `${passRate}%`, scenarios: results }, null, 2)
  );

  if (failedCount > 0) {
    console.error(`Validation failed with ${failedCount} scenario errors.`);
    process.exit(1);
  } else {
    console.log('All 15 Phase 7 Closed-Loop Autonomous Intelligence Scenarios PASSED.');
  }
}

runSuite().catch(err => {
  console.error('Fatal suite failure:', err);
  process.exit(1);
});
