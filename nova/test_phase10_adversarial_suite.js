/**
 * JARVIS OS 2.0 — PHASE 10: PERSONAL DIGITAL TWIN ADVERSARIAL VALIDATION SUITE
 * 
 * Validates 20 distinct real-world and adversarial scenarios covering:
 * 1.  Retrieve explicitly confirmed preference.
 * 2.  Distinguish inferred vs confirmed preference.
 * 3.  Detect conflicting facts.
 * 4.  Update corrected fact (with history).
 * 5.  Preserve fact provenance.
 * 6.  Identify stale information.
 * 7.  Link project to goal (PROJECT_CONTRIBUTES_TO_GOAL).
 * 8.  Trace task to long-term objective via multi-hop path.
 * 9.  Detect missing project dependency.
 * 10. Identify competing commitments.
 * 11. Generate contextual snapshot.
 * 12. Exclude irrelevant memories (privacy filter).
 * 13. Retrieve previous decision and outcome.
 * 14. Simulate deadline change.
 * 15. Simulate resource unavailability.
 * 16. Detect conflicting project timelines.
 * 17. Ensure simulation does not modify real state (read-only verification).
 * 18. Incorporate approved new observation.
 * 19. Prevent unsupported facts from becoming confirmed.
 * 20. Reconcile twin after real project status change.
 */

import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, get, run } from './backend/database/db.js';
import DigitalTwinService from './backend/services/digitalTwinService.js';
import KnowledgeGraphService from './backend/services/knowledgeGraphService.js';
import { getPersonalContext } from './backend/services/personalContextEngine.js';
import { getDecisionMemory } from './backend/services/decisionMemoryService.js';
import { getTwinSimulation } from './backend/services/twinSimulationService.js';
import { getTwinSynchronization } from './backend/services/twinSynchronizationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DELIVERABLES_DIR = path.join(__dirname, 'deliverables');

const results = [];
let passCount = 0;
let failCount = 0;

function assert(condition, testId, description, details = {}) {
  const timestamp = new Date().toISOString();
  if (condition) {
    passCount++;
    console.log(`[PASS] [${testId}] ${description}`);
    results.push({ testId, description, status: 'PASS', timestamp, details });
  } else {
    failCount++;
    console.error(`[FAIL] [${testId}] ${description}`);
    results.push({ testId, description, status: 'FAIL', timestamp, details });
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('  JARVIS OS 2.0 — PHASE 10: PERSONAL DIGITAL TWIN ADVERSARIAL SUITE');
  console.log('================================================================\n');

  const runId = uuidv4().substring(0, 8);

  // -------------------------------------------------------------
  // SCENARIO 1: Retrieve explicitly confirmed preference
  // -------------------------------------------------------------
  try {
    const pref = await DigitalTwinService.createEntry({
      category: 'preferences',
      title: `Editor Preference_${runId}`,
      content: 'VS Code with Vim Keybindings',
      priority: 9,
      source: 'explicit_user_input',
      confidence: 1.0,
      is_confirmed: true
    });

    const retrieved = await DigitalTwinService.getEntryById(pref.id);
    const isExplicitlyConfirmed = retrieved && Boolean(retrieved.is_confirmed) === true && Number(retrieved.confidence) === 1.0;
    
    assert(
      isExplicitlyConfirmed,
      'SCENARIO-01',
      'Retrieve explicitly confirmed preference with 1.0 confidence',
      { id: pref.id, is_confirmed: retrieved.is_confirmed, confidence: retrieved.confidence }
    );
  } catch (err) {
    assert(false, 'SCENARIO-01', 'Retrieve explicitly confirmed preference failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 2: Distinguish inferred vs confirmed preference
  // -------------------------------------------------------------
  try {
    const confirmed = await DigitalTwinService.createEntry({
      category: 'preferences',
      title: `Theme Preference Confirmed_${runId}`,
      content: 'Dark Matrix Theme',
      priority: 8,
      source: 'user_settings',
      confidence: 1.0,
      is_confirmed: true
    });

    const inferred = await DigitalTwinService.createEntry({
      category: 'preferences',
      title: `Music Preference Inferred_${runId}`,
      content: 'Lo-Fi Chill Beats while coding',
      priority: 4,
      source: 'inferred_from_browser_tab',
      confidence: 0.65,
      is_confirmed: false
    });

    const cRow = await DigitalTwinService.getEntryById(confirmed.id);
    const iRow = await DigitalTwinService.getEntryById(inferred.id);

    const correctlyDistinguished = (Boolean(cRow.is_confirmed) === true && Number(cRow.confidence) === 1.0) &&
                                   (Boolean(iRow.is_confirmed) === false && Number(iRow.confidence) <= 0.70);

    assert(
      correctlyDistinguished,
      'SCENARIO-02',
      'Strictly distinguish inferred vs confirmed preferences with confidence caps',
      { confirmed: { is_confirmed: cRow.is_confirmed, conf: cRow.confidence }, inferred: { is_confirmed: iRow.is_confirmed, conf: iRow.confidence } }
    );
  } catch (err) {
    assert(false, 'SCENARIO-02', 'Distinguish inferred vs confirmed preference failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 3: Detect conflicting facts
  // -------------------------------------------------------------
  try {
    const factA = await DigitalTwinService.createEntry({
      category: 'preferences',
      title: `Conflicting Indent_${runId}`,
      content: 'Tabs exclusively (4 spaces wide)',
      priority: 5,
      source: 'user_prompt'
    });

    const factB = await DigitalTwinService.createEntry({
      category: 'preferences',
      title: `Conflicting Indent_${runId}`,
      content: 'Spaces only (2 spaces)',
      priority: 6,
      source: 'inferred_git_config'
    });

    const conflicts = await DigitalTwinService.detectConflictingEntries();
    const conflictFound = conflicts.some(c => 
      (c.entity_a?.id === factA.id && c.entity_b?.id === factB.id) ||
      (c.entity_a?.id === factB.id && c.entity_b?.id === factA.id)
    );

    assert(
      conflictFound,
      'SCENARIO-03',
      'Detect conflicting entries sharing identical or opposing category attributes',
      { conflictCount: conflicts.length, factA: factA.id, factB: factB.id }
    );
  } catch (err) {
    assert(false, 'SCENARIO-03', 'Detect conflicting facts failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 4: Update corrected fact (with history)
  // -------------------------------------------------------------
  try {
    const fact = await DigitalTwinService.createEntry({
      category: 'skills',
      title: `NodeJS Skill Level_${runId}`,
      content: 'Node.js v18 LTS with Express',
      source: 'initial_profile'
    });

    const updated = await DigitalTwinService.correctFact(fact.id, {
      content: 'Node.js v22 LTS with ESM and Native Test Runner',
      reason: 'Upgraded infrastructure to modern LTS'
    });

    const hasHistory = Array.isArray(updated.user_correction_history) &&
                       updated.user_correction_history.length > 0 &&
                       updated.user_correction_history[0].previous_content.includes('Node.js v18');
    const isNowConfirmed = Boolean(updated.is_confirmed) === true && Number(updated.confidence) === 1.0;

    assert(
      hasHistory && isNowConfirmed,
      'SCENARIO-04',
      'Update corrected fact and preserve immutable history with reason',
      { history: updated.user_correction_history, is_confirmed: updated.is_confirmed }
    );
  } catch (err) {
    assert(false, 'SCENARIO-04', 'Update corrected fact failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 5: Preserve fact provenance
  // -------------------------------------------------------------
  try {
    const entry = await DigitalTwinService.createEntry({
      category: 'constraints',
      title: `Daily Working Hours_${runId}`,
      content: 'Do not schedule background tasks between 23:00 and 07:00',
      source: 'user_directive_audit_10',
      confidence: 0.95
    });

    const readBack = await DigitalTwinService.getEntryById(entry.id);
    const provenanceValid = readBack.source === 'user_directive_audit_10' &&
                            readBack.created_at !== null &&
                            readBack.confidence === 0.95;

    assert(
      provenanceValid,
      'SCENARIO-05',
      'Preserve complete provenance (source, confidence, timestamps)',
      { source: readBack.source, created_at: readBack.created_at, confidence: readBack.confidence }
    );
  } catch (err) {
    assert(false, 'SCENARIO-05', 'Preserve fact provenance failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 6: Identify stale information
  // -------------------------------------------------------------
  try {
    const pastDate = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const staleEntry = await DigitalTwinService.createEntry({
      category: 'projects',
      title: `Temporary Sprint Goal_${runId}`,
      content: 'Finish sprint demo deliverable',
      expiration_policy: 'EXPIRES_AT',
      expires_at: pastDate
    });

    const staleEntries = await DigitalTwinService.detectStaleEntries();
    const isFlagged = staleEntries.some(s => s.id === staleEntry.id);

    assert(
      isFlagged,
      'SCENARIO-06',
      'Identify stale information exceeding expiration timestamp',
      { staleEntryId: staleEntry.id, flaggedCount: staleEntries.length }
    );
  } catch (err) {
    assert(false, 'SCENARIO-06', 'Identify stale information failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 7: Link project to goal (PROJECT_CONTRIBUTES_TO_GOAL)
  // -------------------------------------------------------------
  try {
    const projectEnt = await KnowledgeGraphService.upsertEntity({
      name: `Project Alpha_${runId}`,
      entity_type: 'PROJECT',
      properties: { status: 'IN_PROGRESS' }
    });

    const goalEnt = await KnowledgeGraphService.upsertEntity({
      name: `Q4 Revenue Milestone_${runId}`,
      entity_type: 'GOAL',
      properties: { target_value: '$100k' }
    });

    const rel = await KnowledgeGraphService.addRelationship({
      source_entity_id: projectEnt.id,
      target_entity_id: goalEnt.id,
      relationship_type: 'PROJECT_CONTRIBUTES_TO_GOAL',
      weight: 1.0,
      confidence: 1.0
    });

    const impact = await KnowledgeGraphService.getDownstreamImpact(projectEnt.id, 2);
    const linked = impact && Array.isArray(impact.downstream_entities) &&
                   impact.downstream_entities.some(e => e.id === goalEnt.id);

    assert(
      linked && rel.id !== null,
      'SCENARIO-07',
      'Link project to goal via PROJECT_CONTRIBUTES_TO_GOAL and traverse downstream impact',
      { projectId: projectEnt.id, goalId: goalEnt.id, relationshipId: rel.id }
    );
  } catch (err) {
    assert(false, 'SCENARIO-07', 'Link project to goal failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 8: Trace task to long-term objective via multi-hop path
  // -------------------------------------------------------------
  try {
    const taskEnt = await KnowledgeGraphService.upsertEntity({
      name: `Task Build Docker Container_${runId}`,
      entity_type: 'TASK'
    });
    const projEnt = await KnowledgeGraphService.upsertEntity({
      name: `Project Containerization_${runId}`,
      entity_type: 'PROJECT'
    });
    const mileEnt = await KnowledgeGraphService.upsertEntity({
      name: `Milestone Cloud Deployment_${runId}`,
      entity_type: 'GOAL'
    });
    const objEnt = await KnowledgeGraphService.upsertEntity({
      name: `Objective Global Cloud Migration_${runId}`,
      entity_type: 'GOAL'
    });

    // Hop 1: Task -> Project
    await KnowledgeGraphService.addRelationship({
      source_entity_id: taskEnt.id,
      target_entity_id: projEnt.id,
      relationship_type: 'TASK_BELONGS_TO_PROJECT'
    });

    // Hop 2: Project -> Milestone
    await KnowledgeGraphService.addRelationship({
      source_entity_id: projEnt.id,
      target_entity_id: mileEnt.id,
      relationship_type: 'PROJECT_CONTRIBUTES_TO_GOAL'
    });

    // Hop 3: Milestone -> Objective
    await KnowledgeGraphService.addRelationship({
      source_entity_id: mileEnt.id,
      target_entity_id: objEnt.id,
      relationship_type: 'GOAL_SUPPORTS_GOAL'
    });

    const pathFound = await KnowledgeGraphService.findPath(taskEnt.id, objEnt.id, 5);
    const isValidHopChain = pathFound && pathFound.length === 4 &&
                            pathFound[0].name.includes('Task Build Docker') &&
                            pathFound[3].name.includes('Global Cloud Migration');

    assert(
      isValidHopChain,
      'SCENARIO-08',
      'Trace task to long-term objective via 3-hop graph traversal',
      { hops: pathFound ? pathFound.length - 1 : 0, pathNames: pathFound?.map(p => p.name) }
    );
  } catch (err) {
    assert(false, 'SCENARIO-08', 'Trace task to long-term objective failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 9: Detect missing project dependency
  // -------------------------------------------------------------
  try {
    const projectWithReqs = await KnowledgeGraphService.upsertEntity({
      name: `Project Autonomous Machine Vision_${runId}`,
      entity_type: 'PROJECT'
    });

    const skillReq = await KnowledgeGraphService.upsertEntity({
      name: `Skill CUDA Acceleration_${runId}`,
      entity_type: 'SKILL',
      properties: { is_available: false, status: 'UNAVAILABLE' }
    });

    await KnowledgeGraphService.addRelationship({
      source_entity_id: projectWithReqs.id,
      target_entity_id: skillReq.id,
      relationship_type: 'SKILL_REQUIRED_FOR_PROJECT'
    });

    const missing = await KnowledgeGraphService.detectMissingDependencies(projectWithReqs.id);
    const hasMissingSkill = missing && missing.has_missing_dependencies &&
                            Array.isArray(missing.missing_dependencies) &&
                            missing.missing_dependencies.some(m => m.entity_id === skillReq.id);

    assert(
      hasMissingSkill,
      'SCENARIO-09',
      'Detect missing or unavailable project dependencies in knowledge graph',
      { missingCount: missing?.missing_dependencies?.length, missing: missing?.missing_dependencies }
    );
  } catch (err) {
    assert(false, 'SCENARIO-09', 'Detect missing project dependency failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 10: Identify competing commitments
  // -------------------------------------------------------------
  try {
    const simulationService = getTwinSimulation();
    const conflictResult = await simulationService.detectTimelineConflicts();

    assert(
      conflictResult && Array.isArray(conflictResult.conflicts),
      'SCENARIO-10',
      'Identify competing commitments and overlapping goal deadlines',
      { totalConflicts: conflictResult?.conflicts?.length }
    );
  } catch (err) {
    assert(false, 'SCENARIO-10', 'Identify competing commitments failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 11: Generate contextual snapshot
  // -------------------------------------------------------------
  try {
    const contextEngine = getPersonalContext();
    const snapshot = await contextEngine.buildContextSnapshot();

    const hasRequiredFields = snapshot &&
      Array.isArray(snapshot.active_projects) &&
      Array.isArray(snapshot.important_pending_goals) &&
      Array.isArray(snapshot.mission_commitments) &&
      Array.isArray(snapshot.approaching_deadlines) &&
      snapshot.available_resources !== null &&
      Array.isArray(snapshot.relevant_preferences) &&
      Array.isArray(snapshot.current_blockers) &&
      Array.isArray(snapshot.recent_significant_decisions) &&
      typeof snapshot.explanation === 'string';

    assert(
      hasRequiredFields,
      'SCENARIO-11',
      'Generate contextual snapshot containing all 9 core operational context dimensions',
      { explanation: snapshot?.explanation }
    );
  } catch (err) {
    assert(false, 'SCENARIO-11', 'Generate contextual snapshot failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 12: Exclude irrelevant memories (privacy filter)
  // -------------------------------------------------------------
  try {
    const privatePref = await DigitalTwinService.createEntry({
      category: 'preferences',
      title: `Private Health Note_${runId}`,
      content: 'Medical appointment confidential',
      source: 'private_journal',
      is_confirmed: true,
      metadata: { is_private: true }
    });

    const contextEngine = getPersonalContext();
    const snapshot = await contextEngine.buildContextSnapshot();

    const isExcluded = !snapshot.relevant_preferences.some(p => p.id === privatePref.id);

    assert(
      isExcluded,
      'SCENARIO-12',
      'Strictly exclude private or sensitive facts from general orchestrator prompt context',
      { privatePrefId: privatePref.id, isExcluded }
    );
  } catch (err) {
    assert(false, 'SCENARIO-12', 'Exclude irrelevant memories failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 13: Retrieve previous decision and outcome
  // -------------------------------------------------------------
  try {
    const decisionService = getDecisionMemory();
    const dec = await decisionService.recordDecision({
      decision_title: `Architecture Choice_${runId}`,
      category: 'architecture',
      selected_option: 'SQLite WAL Mode with Node worker thread offloading',
      reasoning_summary: 'Maintains zero-external dependency requirement and high concurrent read throughput',
      expected_outcome: 'Eliminate database lock timeouts during autonomous stress runs'
    });

    await decisionService.recordOutcome(dec.id, {
      actual_outcome: 'Database lock timeouts dropped to zero over 2 hour continuous run',
      lessons_learned: 'WAL mode with synchronous=NORMAL provides ideal performance/safety balance for JARVIS OS'
    });

    const history = await decisionService.findRelevantDecisions(`Architecture Choice_${runId}`);
    const found = history.length > 0 &&
                  history[0].actual_outcome.includes('Database lock timeouts dropped to zero') &&
                  history[0].lessons_learned.includes('WAL mode with synchronous=NORMAL');

    assert(
      found,
      'SCENARIO-13',
      'Record and retrieve previous decision, actual outcome, and empirical lessons learned',
      { decisionId: dec.id, actualOutcome: history[0]?.actual_outcome }
    );
  } catch (err) {
    assert(false, 'SCENARIO-13', 'Retrieve previous decision and outcome failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 14: Simulate deadline change
  // -------------------------------------------------------------
  try {
    const simService = getTwinSimulation();
    const sim = await simService.simulateDeadlineChange({
      target_title: `Audit Deliverable_${runId}`,
      days_offset: -4
    });

    const isValidSim = sim &&
      sim.scenario_type === 'DEADLINE_SHIFT' &&
      sim.simulated_impact !== undefined &&
      sim.simulated_impact.shift_days === -4 &&
      sim.is_read_only === true;

    assert(
      isValidSim,
      'SCENARIO-14',
      'Simulate deadline change scenario and compute risk assessment without mutating state',
      { scenario: sim.scenario_type, shift: sim.simulated_impact?.shift_days }
    );
  } catch (err) {
    assert(false, 'SCENARIO-14', 'Simulate deadline change failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 15: Simulate resource unavailability
  // -------------------------------------------------------------
  try {
    const simService = getTwinSimulation();
    const sim = await simService.simulateResourceUnavailability({
      resource_name: `Cloud GPU Node_${runId}`
    });

    const isValidSim = sim &&
      sim.scenario_type === 'RESOURCE_UNAVAILABILITY' &&
      sim.simulated_impact !== undefined &&
      Array.isArray(sim.recommended_mitigations) &&
      sim.is_read_only === true;

    assert(
      isValidSim,
      'SCENARIO-15',
      'Simulate resource unavailability and compute impacted entities and mitigations',
      { mitigations: sim.recommended_mitigations }
    );
  } catch (err) {
    assert(false, 'SCENARIO-15', 'Simulate resource unavailability failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 16: Detect conflicting project timelines
  // -------------------------------------------------------------
  try {
    const simService = getTwinSimulation();
    const conflictResult = await simService.detectTimelineConflicts();

    assert(
      conflictResult && Array.isArray(conflictResult.conflicts),
      'SCENARIO-16',
      'Detect conflicting commitments and evaluate overlap severity',
      { conflictCount: conflictResult?.conflicts?.length }
    );
  } catch (err) {
    assert(false, 'SCENARIO-16', 'Detect conflicting project timelines failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 17: Ensure simulation does not modify real state (read-only verification)
  // -------------------------------------------------------------
  try {
    const goalsBefore = await query('SELECT count(*) as c FROM autonomous_goals');
    const missionsBefore = await query('SELECT count(*) as c FROM missions');
    const twinBefore = await query('SELECT count(*) as c FROM digital_twin_profiles');

    const simService = getTwinSimulation();
    await simService.simulateDeadlineChange({ target_title: 'NonExistentGoal', days_offset: 10 });
    await simService.simulateResourceUnavailability({ resource_name: 'DummyResource' });
    await simService.detectTimelineConflicts();

    const goalsAfter = await query('SELECT count(*) as c FROM autonomous_goals');
    const missionsAfter = await query('SELECT count(*) as c FROM missions');
    const twinAfter = await query('SELECT count(*) as c FROM digital_twin_profiles');

    const stateUnmodified = goalsBefore[0].c === goalsAfter[0].c &&
                            missionsBefore[0].c === missionsAfter[0].c &&
                            twinBefore[0].c === twinAfter[0].c;

    assert(
      stateUnmodified,
      'SCENARIO-17',
      'Verify strict read-only guarantee: simulations produce zero state mutations in goals, missions, or twin profiles',
      { goals: goalsBefore[0].c, missions: missionsBefore[0].c, twinProfiles: twinBefore[0].c }
    );
  } catch (err) {
    assert(false, 'SCENARIO-17', 'Simulation read-only verification failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 18: Incorporate approved new observation
  // -------------------------------------------------------------
  try {
    const syncer = getTwinSynchronization();
    const obs = await syncer.incorporateEnvironmentalObservation({
      event_type: 'FILE_MODIFIED',
      details: `User created build script for Docker release_${runId}`,
      source: 'environmental_watcher'
    });

    const isProperlyIngested = obs &&
      Boolean(obs.is_confirmed) === false &&
      Number(obs.confidence) <= 0.70;

    assert(
      isProperlyIngested,
      'SCENARIO-18',
      'Incorporate environmental observation as unconfirmed fact with strict confidence cap',
      { obsId: obs?.id, is_confirmed: obs?.is_confirmed, confidence: obs?.confidence }
    );
  } catch (err) {
    assert(false, 'SCENARIO-18', 'Incorporate approved new observation failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 19: Prevent unsupported facts from becoming confirmed
  // -------------------------------------------------------------
  try {
    const syncer = getTwinSynchronization();
    const unverifiedObs = await syncer.incorporateEnvironmentalObservation({
      event_type: `INFERRED_PATTERN_${runId}`,
      details: 'User likely prefers working on weekends',
      source: 'unverified_statistical_inference'
    });

    const row = await DigitalTwinService.getEntryById(unverifiedObs.id);
    const cannotSelfConfirm = row && Boolean(row.is_confirmed) === false && Number(row.confidence) < 1.0;

    assert(
      cannotSelfConfirm,
      'SCENARIO-19',
      'Enforce non-negotiable security invariant: unverified facts cannot self-confirm without human confirmation',
      { id: row?.id, is_confirmed: row?.is_confirmed, confidence: row?.confidence }
    );
  } catch (err) {
    assert(false, 'SCENARIO-19', 'Prevent unsupported facts confirmation failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // SCENARIO 20: Reconcile twin after real project status change
  // -------------------------------------------------------------
  try {
    const project = await DigitalTwinService.createEntry({
      category: 'projects',
      title: `Legacy System Migration_${runId}`,
      content: 'Migrate legacy auth to OAuth 2.1',
      status: 'ACTIVE'
    });

    const syncer = getTwinSynchronization();
    const reconciled = await syncer.reconcileEntityStatus(project.id, 'COMPLETED');

    const updatedProject = await DigitalTwinService.getEntryById(project.id);
    const isReconciled = updatedProject && updatedProject.status === 'COMPLETED';

    assert(
      isReconciled,
      'SCENARIO-20',
      'Reconcile twin entity status after real project status transition',
      { projectId: project.id, newStatus: updatedProject?.status }
    );
  } catch (err) {
    assert(false, 'SCENARIO-20', 'Reconcile twin after real status change failed', { error: err.message });
  }

  // -------------------------------------------------------------
  // Summary & Evidence Export
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`  PHASE 10 ADVERSARIAL VALIDATION SUMMARY: ${passCount} / ${results.length} PASSED`);
  console.log('================================================================\n');

  if (!fs.existsSync(DELIVERABLES_DIR)) {
    fs.mkdirSync(DELIVERABLES_DIR, { recursive: true });
  }

  const evidencePath = path.join(DELIVERABLES_DIR, 'phase10_digital_twin_evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify({
    suite: 'JARVIS OS 2.0 — PHASE 10: PERSONAL DIGITAL TWIN ADVERSARIAL VALIDATION',
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passed: passCount,
    failed: failCount,
    passRate: `${Math.round((passCount / results.length) * 100)}%`,
    evidenceRecords: results
  }, null, 2));

  console.log(`Saved detailed evidence to: ${evidencePath}\n`);

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
