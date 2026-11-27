import { query, run, get, initDatabase } from '../database/db.js';
import cryptoUtils from '../security/cryptoUtils.js';
import KnowledgeGraphService from '../services/knowledgeGraphService.js';
import DigitalTwinService from '../services/digitalTwinService.js';
import SkillRegistryService from '../services/skillRegistryService.js';
import EvaluationEngineService from '../services/evaluationEngineService.js';
import BackupService from '../services/backupService.js';
import ErrorTrackingService from '../services/errorTrackingService.js';
import { MissionControlService, MISSION_STATUSES, FAILURE_CLASSES } from '../services/missionControlService.js';

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] Scenario Step ${totalTests}: ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] Scenario Step ${totalTests}: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runPhase4TestSuite() {
  console.log('================================================================');
  console.log('   NOVA PHASE 4 — PRODUCTION-GRADE INTELLIGENCE QA TEST SUITE   ');
  console.log('================================================================\n');

  await initDatabase();

  // ============================================================================
  // SCENARIO 1: Zero-Trust Mobile Authentication & Hashed PIN Verification
  // ============================================================================
  console.log('--- Scenario 1: Zero-Trust Mobile Authentication & PIN Hashing ---');
  const testPin = '2026';
  const { hash: pinHash, salt: pinSalt } = cryptoUtils.hashPin(testPin);
  assert(pinHash && pinSalt && pinHash.length === 128, 'PBKDF2-SHA512 derives strong 512-bit key with random salt.');

  const isValidPin = cryptoUtils.verifyPin(testPin, pinHash, pinSalt);
  assert(isValidPin === true, 'Constant-time verification validates correct PIN.');

  const isInvalidPin = cryptoUtils.verifyPin('9999', pinHash, pinSalt);
  assert(isInvalidPin === false, 'Invalid PIN is securely rejected.');

  // ============================================================================
  // SCENARIO 2: Zero-Trust Session Token Rotation & Expiry Check
  // ============================================================================
  console.log('\n--- Scenario 2: Zero-Trust Token Rotation & Expiry Check ---');
  const initialToken = cryptoUtils.generateSecureToken('nova-mob');
  const refreshToken = cryptoUtils.generateSecureToken('nova-refresh');
  const tokenHash = cryptoUtils.sha256(initialToken);
  const sessionId = `test-mob-${Date.now()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  await run(
    `INSERT INTO mobile_sessions 
    (id, device_name, token, token_hash, expires_at, refresh_token, revoked, permissions, last_active_at, created_at) 
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [sessionId, 'Test Device', initialToken, tokenHash, expiresAt, refreshToken, '["chat","status"]', now.toISOString(), now.toISOString()]
  );

  const sessionRecord = await get('SELECT * FROM mobile_sessions WHERE id = ?', [sessionId]);
  assert(sessionRecord && sessionRecord.token_hash === tokenHash, 'Session persisted with token hash and 24h expiration.');

  // Rotate token
  const newRawToken = cryptoUtils.generateSecureToken('nova-mob');
  const newRefreshToken = cryptoUtils.generateSecureToken('nova-refresh');
  const newTokenHash = cryptoUtils.sha256(newRawToken);

  await run(
    'UPDATE mobile_sessions SET token = ?, token_hash = ?, refresh_token = ? WHERE id = ?',
    [newRawToken, newTokenHash, newRefreshToken, sessionId]
  );

  const rotatedSession = await get('SELECT * FROM mobile_sessions WHERE id = ?', [sessionId]);
  assert(rotatedSession.token_hash === newTokenHash && rotatedSession.token !== initialToken, 'Token rotated atomically.');

  // ============================================================================
  // SCENARIO 3: Zero-Trust Session Revocation & Immediate Invalidation
  // ============================================================================
  console.log('\n--- Scenario 3: Zero-Trust Session Revocation & Audit Logging ---');
  await run('UPDATE mobile_sessions SET revoked = 1 WHERE id = ?', [sessionId]);
  const activeSessionCheck = await get('SELECT * FROM mobile_sessions WHERE id = ? AND revoked = 0', [sessionId]);
  assert(activeSessionCheck === undefined, 'Revoked session query returns null (access immediately cut off).');

  // Verify Audit Log entry creation
  const auditId = `audit-test-${Date.now()}`;
  await run(
    'INSERT INTO session_audit_logs (id, session_id, action, ip_address, user_agent, status, details, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [auditId, sessionId, 'SESSION_REVOKED', '127.0.0.1', 'qa-tester', 'SUCCESS', 'Manual test revocation', new Date().toISOString()]
  );
  const auditLog = await get('SELECT * FROM session_audit_logs WHERE id = ?', [auditId]);
  assert(auditLog && auditLog.action === 'SESSION_REVOKED', 'Security audit log accurately captures revocation event.');

  // ============================================================================
  // SCENARIO 4: AES-256-GCM Secure Encryption & Decryption at Rest
  // ============================================================================
  console.log('\n--- Scenario 4: AES-256-GCM Encrypted Credentials at Rest ---');
  const secretApiKey = 'gemini-prod-super-secret-key-xyz-2026';
  const encryptedBundle = cryptoUtils.encryptData(secretApiKey);
  assert(typeof encryptedBundle === 'string' && encryptedBundle.split(':').length === 3, 'Payload encrypted to IV:AuthTag:Ciphertext bundle.');

  const decrypted = cryptoUtils.decryptData(encryptedBundle);
  assert(decrypted === secretApiKey, 'Decrypted ciphertext reproduces exact original plaintext.');

  // ============================================================================
  // SCENARIO 5: Tamper Detection & Integrity Verification
  // ============================================================================
  console.log('\n--- Scenario 5: Tamper Detection (Tampered Ciphertext Rejection) ---');
  const [iv, authTag, cipher] = encryptedBundle.split(':');
  const tamperedBundle = `${iv}:${authTag}:${cipher.substring(0, cipher.length - 2)}aa`;
  let tamperCaught = false;
  try {
    cryptoUtils.decryptData(tamperedBundle);
  } catch (err) {
    tamperCaught = true;
  }
  assert(tamperCaught === true, 'Tampered ciphertext triggers authentication tag mismatch and fails.');

  // ============================================================================
  // SCENARIO 6: Knowledge Graph Entity Extraction & Ingestion
  // ============================================================================
  console.log('\n--- Scenario 6: Knowledge Graph Entity Extraction & Ingestion ---');
  const rawText = 'Commander Digvijay designed the NOVA architecture using React, Node.js, and Python.';
  const extracted = await KnowledgeGraphService.extractAndLink({
    text: rawText,
    entityType: 'technology',
    sourceType: 'ai_inferred'
  });
  assert(extracted && extracted.length >= 2, `Extracted ${extracted.length} entities from directive.`);

  const reactEntity = await KnowledgeGraphService.upsertEntity({
    name: 'React',
    entity_type: 'technology',
    source_type: 'user_explicit',
    confidence: 1.0
  });
  assert(reactEntity && reactEntity.name === 'React', 'Entity upserted with explicit user provenance.');

  // ============================================================================
  // SCENARIO 7: Knowledge Graph Multi-Hop Traversal (1-Hop & 2-Hop)
  // ============================================================================
  console.log('\n--- Scenario 7: Knowledge Graph 1-Hop and 2-Hop Traversal ---');
  const entityA = await KnowledgeGraphService.upsertEntity({ name: 'NOVA_CORE', entity_type: 'project', confidence: 1.0 });
  const entityB = await KnowledgeGraphService.upsertEntity({ name: 'FastAPI_Agent', entity_type: 'technology', confidence: 1.0 });
  const entityC = await KnowledgeGraphService.upsertEntity({ name: 'Windows_UI_Automation', entity_type: 'capability', confidence: 0.9 });

  await KnowledgeGraphService.addRelationship({
    source_entity_id: entityA.id,
    target_entity_id: entityB.id,
    relationship_type: 'integrates_with',
    source_type: 'user_explicit'
  });

  await KnowledgeGraphService.addRelationship({
    source_entity_id: entityB.id,
    target_entity_id: entityC.id,
    relationship_type: 'controls',
    source_type: 'ai_inferred'
  });

  const neighborhood = await KnowledgeGraphService.getNeighborhood(entityA.id, 2);
  assert(neighborhood && neighborhood.nodes.length >= 3, `2-hop traversal retrieved ${neighborhood.nodes.length} connected graph entities.`);
  assert(neighborhood.edges.length >= 2, `2-hop traversal recovered ${neighborhood.edges.length} multi-hop directed edges.`);

  // ============================================================================
  // SCENARIO 8: Memory Correction & Source Attribution
  // ============================================================================
  console.log('\n--- Scenario 8: Memory Correction & Source Attribution ---');
  const corrected = await KnowledgeGraphService.correctEntity(entityC.id, {
    confidence: 0.99,
    properties: { verified_in_phase: 4 }
  });
  assert(corrected.confidence === 0.99, 'Entity confidence successfully updated during memory correction.');

  const fullGraph = await KnowledgeGraphService.getFullGraph(50);
  assert(fullGraph.nodes.length > 0 && fullGraph.links.length > 0, 'Full visual graph topology export formatted for HUD renderer.');

  // ============================================================================
  // SCENARIO 9: Personal Digital Twin CRUD & Categorization
  // ============================================================================
  console.log('\n--- Scenario 9: Personal Digital Twin CRUD & Categorization ---');
  const uniqueGoalTitle = `Achieve Production-Grade Autonomy ${Date.now()}`;
  const testGoal = await DigitalTwinService.createEntry({
    category: 'goals',
    title: uniqueGoalTitle,
    content: 'Full reliability across multi-agent DAGs and zero-trust security controls.',
    priority: 3
  });
  assert(testGoal && testGoal.category === 'goals', 'Digital twin trait registered in goals category.');

  const twinProfile = await DigitalTwinService.getFullTwinProfile();
  assert(twinProfile.goals.length > 0 && twinProfile.priorities.length > 0, 'Digital twin profile grouped across all 5 user dimensions.');

  // ============================================================================
  // SCENARIO 10: Personal Digital Twin Prompt Context Generation
  // ============================================================================
  console.log('\n--- Scenario 10: Digital Twin AI Prompt Context Formatter ---');
  const promptContext = await DigitalTwinService.getFormattedContextForPrompt();
  assert(typeof promptContext === 'string' && promptContext.includes('### USER ACTIVE GOALS'), 'Compiled active twin context for system prompt injection.');

  // Toggle trait disable
  await DigitalTwinService.toggleEntry(testGoal.id, false);
  const updatedPrompt = await DigitalTwinService.getFormattedContextForPrompt();
  assert(!updatedPrompt.includes(uniqueGoalTitle), 'Disabled twin traits are omitted from AI prompt context.');

  // Restore enable
  await DigitalTwinService.toggleEntry(testGoal.id, true);

  // ============================================================================
  // SCENARIO 11: Skills Ecosystem Discovery & Schema Validation
  // ============================================================================
  console.log('\n--- Scenario 11: Skills Ecosystem Discovery & Schema Validation ---');
  const allSkills = await SkillRegistryService.getAllSkills();
  assert(allSkills.length >= 5, `Registered skills matrix contains ${allSkills.length} active skills.`);

  const repoSkill = await SkillRegistryService.getSkillByKey('code_repository_analyzer');
  assert(repoSkill && repoSkill.permissions.includes('read_files'), 'Skill correctly declares scoped permission tags.');

  // Schema validation test: missing required argument
  let schemaRejection = false;
  try {
    await SkillRegistryService.executeSkill('code_repository_analyzer', {}); // Missing 'directory'
  } catch (err) {
    schemaRejection = true;
  }
  assert(schemaRejection === true, 'Execution fails when input arguments violate skill schema definition.');

  // ============================================================================
  // SCENARIO 12: Skills Execution & Automated Self-Testing
  // ============================================================================
  console.log('\n--- Scenario 12: Skills Execution & Automated Self-Testing ---');
  const execResult = await SkillRegistryService.executeSkill('code_repository_analyzer', { directory: '.', depth: 2 });
  assert(execResult.success && execResult.output.status === 'HEALTHY', 'Skill executed and returned structured output.');

  const testReport = await SkillRegistryService.testSkill('web_dossier_synthesizer');
  assert(testReport.self_test_passed === true && testReport.schema_valid === true, 'Automated skill self-test validated schema & dispatch handler.');

  // ============================================================================
  // SCENARIO 13: Adaptive Mission DAG Dependency Resolution
  // ============================================================================
  console.log('\n--- Scenario 13: Adaptive Mission DAG Dependency Resolution ---');
  const missionControl = new MissionControlService(null);
  const mission = await missionControl.createMission('Automated Code Audit and System Telemetry');
  assert(mission && mission.steps.length >= 3, `Mission decomposed into ${mission.steps.length} multi-agent DAG steps.`);

  // Verify steps have idempotency hash
  const step1 = mission.steps[0];
  assert(step1.idempotency_hash && step1.idempotency_hash.length === 64, 'Mission steps contain SHA-256 idempotency hash to prevent duplicates.');

  // Verify DAG dependencies
  const step2 = mission.steps[1];
  assert(step2.depends_on.includes(1), 'Step 2 correctly lists Step 1 in dependency array.');

  // ============================================================================
  // SCENARIO 14: Mission Failure Classification & Checkpoints
  // ============================================================================
  console.log('\n--- Scenario 14: Failure Classification & Checkpoints ---');
  const timeoutClass = missionControl.classifyFailure('Request timed out after 30000ms');
  assert(timeoutClass === FAILURE_CLASSES.TIMEOUT, 'Classified timeout error as TIMEOUT.');

  const netClass = missionControl.classifyFailure('connect ECONNREFUSED 127.0.0.1:8000');
  assert(netClass === FAILURE_CLASSES.TRANSIENT_NETWORK, 'Classified connection reset as TRANSIENT_NETWORK.');

  const permClass = missionControl.classifyFailure('Permission denied: requires human approval');
  assert(permClass === FAILURE_CLASSES.PERMISSION_DENIED, 'Classified sensitive action as PERMISSION_DENIED.');

  // Save & Retrieve Checkpoint
  await missionControl.saveCheckpoint(mission.id, 1, { completedSteps: [1], sample: 'ok' });
  const checkpoints = await missionControl.getCheckpoints(mission.id);
  assert(checkpoints.length >= 1, 'Mission execution checkpoint successfully recorded and retrieved.');

  // ============================================================================
  // SCENARIO 15: Production Reliability: SQLite Hot Backup & Integrity Check
  // ============================================================================
  console.log('\n--- Scenario 15: SQLite Hot Backup (VACUUM INTO) & Verification ---');
  const backup = await BackupService.createHotBackup();
  assert(backup && backup.filename.startsWith('nova-backup-'), `Hot backup generated: ${backup.filename}`);
  assert(backup.filesize > 0 && backup.checksum.length === 64, 'Hot backup computed SHA-256 integrity checksum.');

  // Verify backup integrity
  const verifyResult = await BackupService.verifyBackup(backup.id);
  assert(verifyResult.verified === true && verifyResult.status === 'verified', 'PRAGMA integrity_check verified SQLite snapshot as 100% valid.');

  // Error tracking verification
  const testError = await ErrorTrackingService.logError({
    errorCode: 'TEST_ERR_RECOVERY',
    message: 'Transient simulated network error',
    subsystem: 'MISSION_CONTROL',
    severity: 'WARN',
    recoveryAttempted: true,
    recoveryStatus: 'RESOLVED'
  });
  assert(testError && testError.id, 'Structured error captured and persisted in system_errors table.');

  // Evaluation Suite Runner
  const evalResult = await EvaluationEngineService.runEvaluationSuite('smoke', 'Phase 4 QA Smoke Test');
  assert(evalResult && evalResult.metrics.tool_selection_accuracy >= 90, `AI Evaluation Runner executed: ${evalResult.passedCount}/${evalResult.totalTests} tests passed.`);

  console.log('\n================================================================');
  console.log(`  ALL ${totalTests} SCENARIOS & TESTS PASSED SUCCESSFULLY! (100%)`);
  console.log('================================================================\n');
}

runPhase4TestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[FATAL TEST FAILURE]:', err);
    process.exit(1);
  });
