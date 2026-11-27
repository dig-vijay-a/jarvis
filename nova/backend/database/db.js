import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { hashPin } from '../security/cryptoUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.NOVA_DB_PATH
  ? path.resolve(process.env.NOVA_DB_PATH)
  : path.join(dbDir, 'nova.sqlite');
const dbDirForCustom = path.dirname(dbPath);
if (!fs.existsSync(dbDirForCustom)) {
  fs.mkdirSync(dbDirForCustom, { recursive: true });
}
const db = new sqlite3.Database(dbPath);
db.configure('busyTimeout', 5000);

// Enable Write-Ahead Logging and concurrency pragmas
db.serialize(() => {
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA busy_timeout = 5000;");
  db.run("PRAGMA synchronous = NORMAL;");
});

// Async helper functions
export const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

// Initialize tables and seed initial data
export const initDatabase = async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      tool_results TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      category TEXT NOT NULL,
      importance INTEGER DEFAULT 2,
      source TEXT DEFAULT 'user_explicit',
      last_accessed_at TEXT,
      access_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Safe migration for memories columns if existing table lacks them
  try {
    const memoryCols = await query("PRAGMA table_info(memories)");
    const colNames = memoryCols.map(c => c.name);
    if (!colNames.includes('source')) {
      await run("ALTER TABLE memories ADD COLUMN source TEXT DEFAULT 'user_explicit'");
    }
    if (!colNames.includes('last_accessed_at')) {
      await run("ALTER TABLE memories ADD COLUMN last_accessed_at TEXT");
    }
    if (!colNames.includes('access_count')) {
      await run("ALTER TABLE memories ADD COLUMN access_count INTEGER DEFAULT 0");
    }

    // Safe migration for messages.execution_trace
    const msgCols = await query("PRAGMA table_info(messages)");
    const msgColNames = msgCols.map(c => c.name);
    if (!msgColNames.includes('execution_trace')) {
      await run("ALTER TABLE messages ADD COLUMN execution_trace TEXT");
    }

    // Safe migration for missions (Phase 13: Hierarchical Objectives)
    try {
      const missionCols = await query("PRAGMA table_info(missions)");
      const missionColNames = missionCols.map(c => c.name);
      if (!missionColNames.includes('parent_objective_id')) {
        await run("ALTER TABLE missions ADD COLUMN parent_objective_id TEXT");
      }
      if (!missionColNames.includes('initiative_id')) {
        await run("ALTER TABLE missions ADD COLUMN initiative_id TEXT");
      }
    } catch (_) {}

    // Create execution_traces table for end-to-end auditability
    await run(`
      CREATE TABLE IF NOT EXISTS execution_traces (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        original_user_message TEXT NOT NULL,
        detected_intent TEXT NOT NULL,
        intent_confidence REAL,
        selected_execution_mode TEXT NOT NULL,
        selected_agent TEXT NOT NULL,
        generated_plan TEXT,
        selected_tools TEXT,
        tool_arguments TEXT,
        approval_status TEXT NOT NULL,
        execution_started INTEGER DEFAULT 0,
        execution_result TEXT,
        validation_result TEXT,
        final_response TEXT NOT NULL,
        failure_reason TEXT,
        contract_status TEXT NOT NULL,
        timestamp TEXT NOT NULL
      )
    `);
  } catch (migErr) {
    console.warn('[DB Migration] Note on columns/tables:', migErr.message);
  }

  // Autonomous Task Planner Table
  await run(`
    CREATE TABLE IF NOT EXISTS planned_tasks (
      id TEXT PRIMARY KEY,
      instruction TEXT NOT NULL,
      plan TEXT,
      steps TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      current_step_index INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      error TEXT
    )
  `);

  // Persistent Scheduler Table
  await run(`
    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      next_run_at TEXT NOT NULL,
      last_run_at TEXT,
      status TEXT DEFAULT 'ACTIVE',
      action_type TEXT NOT NULL,
      action_payload TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // Notification History Table
  await run(`
    CREATE TABLE IF NOT EXISTS notification_history (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'INFO',
      is_read INTEGER DEFAULT 0,
      timestamp TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      due_date TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      remind_at TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      steps TEXT NOT NULL,
      status TEXT DEFAULT 'idle',
      progress INTEGER DEFAULT 0,
      logs TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      category TEXT NOT NULL,
      details TEXT,
      status TEXT DEFAULT 'success',
      timestamp TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS environmental_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      details TEXT,
      timestamp TEXT NOT NULL
    )
  `);

  // ==========================================
  // PHASE 3: MISSION CONTROL & ADVANCED EXTENSIONS
  // ==========================================

  // Missions Table (Module 1)
  await run(`
    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY,
      objective TEXT NOT NULL,
      plan_summary TEXT,
      status TEXT DEFAULT 'PENDING',
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      deliverables TEXT,
      error TEXT
    )
  `);

  // Mission Steps with Dependency Graph (Module 1)
  await run(`
    CREATE TABLE IF NOT EXISTS mission_steps (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      agent_key TEXT NOT NULL,
      tool TEXT NOT NULL,
      args TEXT,
      depends_on TEXT,
      status TEXT DEFAULT 'PENDING',
      requires_approval INTEGER DEFAULT 0,
      result TEXT,
      error TEXT,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
    )
  `);

  // Document Knowledge Index (Module 4)
  await run(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      filepath TEXT,
      filetype TEXT NOT NULL,
      filesize INTEGER,
      chunk_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Document Vector Chunks (Module 4)
  await run(`
    CREATE TABLE IF NOT EXISTS document_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      vector_tokens TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `);

  // External Integrations (Module 5)
  await run(`
    CREATE TABLE IF NOT EXISTS external_integrations (
      provider TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'unconfigured',
      auth_type TEXT NOT NULL,
      credentials TEXT,
      scopes TEXT,
      last_synced_at TEXT,
      updated_at TEXT NOT NULL
    )
  `);

  // Integration Audit Logs (Module 5 & 7)
  await run(`
    CREATE TABLE IF NOT EXISTS integration_audit_logs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      status TEXT DEFAULT 'success',
      timestamp TEXT NOT NULL
    )
  `);

  // Mobile Push Subscriptions (Module 6)
  await run(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL,
      keys TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // Mobile Sessions (Module 6)
  await run(`
    CREATE TABLE IF NOT EXISTS mobile_sessions (
      id TEXT PRIMARY KEY,
      device_name TEXT NOT NULL,
      token TEXT NOT NULL,
      token_hash TEXT,
      salt TEXT,
      expires_at TEXT,
      refresh_token TEXT,
      revoked INTEGER DEFAULT 0,
      permissions TEXT DEFAULT '["chat","status","missions","tasks"]',
      last_active_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  // Phase 4 Migration: Ensure mobile_sessions columns exist
  try {
    const mobCols = await query("PRAGMA table_info(mobile_sessions)");
    const mobColNames = mobCols.map(c => c.name);
    if (!mobColNames.includes('token_hash')) await run("ALTER TABLE mobile_sessions ADD COLUMN token_hash TEXT");
    if (!mobColNames.includes('salt')) await run("ALTER TABLE mobile_sessions ADD COLUMN salt TEXT");
    if (!mobColNames.includes('expires_at')) await run("ALTER TABLE mobile_sessions ADD COLUMN expires_at TEXT");
    if (!mobColNames.includes('refresh_token')) await run("ALTER TABLE mobile_sessions ADD COLUMN refresh_token TEXT");
    if (!mobColNames.includes('revoked')) await run("ALTER TABLE mobile_sessions ADD COLUMN revoked INTEGER DEFAULT 0");
    if (!mobColNames.includes('permissions')) await run("ALTER TABLE mobile_sessions ADD COLUMN permissions TEXT DEFAULT '[\"chat\",\"status\",\"missions\",\"tasks\"]'");
  } catch (mErr) {
    console.warn('[DB Migration] Note on mobile_sessions cols:', mErr.message);
  }

  // ==========================================
  // PHASE 4: PRODUCTION-GRADE AUTONOMOUS INTELLIGENCE
  // ==========================================

  // Session Audit Logs (Module 1: Zero-Trust Security)
  await run(`
    CREATE TABLE IF NOT EXISTS session_audit_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      action TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      status TEXT NOT NULL,
      details TEXT,
      timestamp TEXT NOT NULL
    )
  `);

  // Mission Checkpoints (Module 2: Adaptive Mission Intelligence)
  await run(`
    CREATE TABLE IF NOT EXISTS mission_checkpoints (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      state_snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
    )
  `);

  // Agent Performance Metrics (Module 2: Adaptive Mission Intelligence)
  await run(`
    CREATE TABLE IF NOT EXISTS agent_performance_metrics (
      id TEXT PRIMARY KEY,
      agent_key TEXT UNIQUE NOT NULL,
      total_actions INTEGER DEFAULT 0,
      successful_actions INTEGER DEFAULT 0,
      failed_actions INTEGER DEFAULT 0,
      retries INTEGER DEFAULT 0,
      avg_latency_ms REAL DEFAULT 0,
      last_updated TEXT NOT NULL
    )
  `);

  // Mission Steps Phase 4 & Phase 7 & Phase 8 Migration
  try {
    const stepCols = await query("PRAGMA table_info(mission_steps)");
    const stepColNames = stepCols.map(c => c.name);
    if (!stepColNames.includes('idempotency_hash')) await run("ALTER TABLE mission_steps ADD COLUMN idempotency_hash TEXT");
    if (!stepColNames.includes('failure_classification')) await run("ALTER TABLE mission_steps ADD COLUMN failure_classification TEXT");
    if (!stepColNames.includes('retry_count')) await run("ALTER TABLE mission_steps ADD COLUMN retry_count INTEGER DEFAULT 0");
    if (!stepColNames.includes('verification_evidence')) await run("ALTER TABLE mission_steps ADD COLUMN verification_evidence TEXT");
    if (!stepColNames.includes('verification_status')) await run("ALTER TABLE mission_steps ADD COLUMN verification_status TEXT");
    if (!stepColNames.includes('compensation_action')) await run("ALTER TABLE mission_steps ADD COLUMN compensation_action TEXT");
    if (!stepColNames.includes('approved_at')) await run("ALTER TABLE mission_steps ADD COLUMN approved_at TEXT");

    const missionCols = await query("PRAGMA table_info(missions)");
    const missionColNames = missionCols.map(c => c.name);
    if (!missionColNames.includes('replan_count')) await run("ALTER TABLE missions ADD COLUMN replan_count INTEGER DEFAULT 0");
    if (!missionColNames.includes('last_replan_reason')) await run("ALTER TABLE missions ADD COLUMN last_replan_reason TEXT");
    if (!missionColNames.includes('goal_id')) await run("ALTER TABLE missions ADD COLUMN goal_id TEXT");
    if (!missionColNames.includes('last_heartbeat')) await run("ALTER TABLE missions ADD COLUMN last_heartbeat TEXT");
    if (!missionColNames.includes('stall_status')) await run("ALTER TABLE missions ADD COLUMN stall_status TEXT DEFAULT 'NORMAL'");
    if (!missionColNames.includes('priority')) await run("ALTER TABLE missions ADD COLUMN priority INTEGER DEFAULT 2");
    if (!missionColNames.includes('idempotency_key')) await run("ALTER TABLE missions ADD COLUMN idempotency_key TEXT");
  } catch (mErr) {
    console.warn('[DB Migration] Note on mission_steps cols:', mErr.message);
  }

  // ==========================================
  // PHASE 8: AUTONOMOUS FIELD OPERATIONS TABLES
  // ==========================================

  // Autonomous Goals (P3: Goal Management)
  await run(`
    CREATE TABLE IF NOT EXISTS autonomous_goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'general',
      priority INTEGER DEFAULT 2,
      status TEXT DEFAULT 'PENDING',
      deadline TEXT,
      success_criteria TEXT,
      progress INTEGER DEFAULT 0,
      linked_mission_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Event Relevance & Classification Logs (P1: Environmental Intelligence)
  await run(`
    CREATE TABLE IF NOT EXISTS event_relevance_logs (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      target TEXT NOT NULL,
      is_relevant INTEGER NOT NULL,
      matched_entity_type TEXT,
      matched_entity_id TEXT,
      relevance_reason TEXT,
      timestamp TEXT NOT NULL
    )
  `);

  // ==========================================
  // PHASE 9: PREDICTIVE INTELLIGENCE TABLES
  // ==========================================

  // Discovered Patterns (P0)
  await run(`
    CREATE TABLE IF NOT EXISTS discovered_patterns (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      trigger_signature TEXT,
      action_signature TEXT,
      observation_count INTEGER DEFAULT 1,
      confidence REAL NOT NULL,
      evidence TEXT,
      created_at TEXT NOT NULL,
      last_observed_at TEXT NOT NULL,
      expires_at TEXT
    )
  `);

  // Stored Predictions (P1, P2, P6)
  await run(`
    CREATE TABLE IF NOT EXISTS stored_predictions (
      id TEXT PRIMARY KEY,
      prediction_type TEXT NOT NULL,
      target_id TEXT,
      predicted_outcome TEXT,
      confidence REAL NOT NULL,
      risk_probability REAL,
      expected_window_start TEXT,
      expected_window_end TEXT,
      lead_time_seconds INTEGER,
      actual_outcome TEXT,
      was_accurate INTEGER,
      status TEXT DEFAULT 'PENDING',
      evidence TEXT,
      created_at TEXT NOT NULL,
      evaluated_at TEXT
    )
  `);

  // Predictive Recommendations (P4)
  await run(`
    CREATE TABLE IF NOT EXISTS predictive_recommendations (
      id TEXT PRIMARY KEY,
      recommendation_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      triggering_evidence TEXT,
      confidence REAL NOT NULL,
      expected_impact TEXT NOT NULL,
      time_horizon TEXT NOT NULL,
      suggested_action TEXT,
      risk_classification TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      user_feedback TEXT,
      outcome_verified INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      expires_at TEXT,
      executed_at TEXT
    )
  `);

  try {
    const recColNames = (await query("PRAGMA table_info(predictive_recommendations)")).map(c => c.name);
    if (!recColNames.includes('updated_at')) await run("ALTER TABLE predictive_recommendations ADD COLUMN updated_at TEXT");
  } catch (_) {}

  // Resource Telemetry History (P2)
  await run(`
    CREATE TABLE IF NOT EXISTS resource_telemetry_history (
      id TEXT PRIMARY KEY,
      cpu_percent REAL,
      memory_percent REAL,
      disk_free_gb REAL,
      disk_total_gb REAL,
      active_missions_count INTEGER,
      pending_queue_count INTEGER,
      db_page_count INTEGER,
      active_watchers_count INTEGER,
      timestamp TEXT NOT NULL
    )
  `);

  // Recommendation Learning Weights (P5)
  await run(`
    CREATE TABLE IF NOT EXISTS recommendation_learning_weights (
      category TEXT PRIMARY KEY,
      acceptance_count INTEGER DEFAULT 0,
      rejection_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      weight_multiplier REAL DEFAULT 1.0,
      updated_at TEXT NOT NULL
    )
  `);

  // ==========================================
  // PHASE 10: PERSONAL DIGITAL TWIN TABLES
  // ==========================================

  // Decision Memory Records (P3)
  await run(`
    CREATE TABLE IF NOT EXISTS decision_records (
      id TEXT PRIMARY KEY,
      decision_title TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      context_at_decision TEXT,
      alternatives_considered TEXT,
      selected_option TEXT NOT NULL,
      reasoning_summary TEXT NOT NULL,
      expected_outcome TEXT,
      actual_outcome TEXT,
      lessons_learned TEXT,
      impact_rating TEXT DEFAULT 'MEDIUM',
      related_goal_id TEXT,
      related_project_id TEXT,
      created_at TEXT NOT NULL,
      evaluated_at TEXT
    )
  `);

  // Digital Twin Simulation Scenarios (P4)
  await run(`
    CREATE TABLE IF NOT EXISTS twin_simulations (
      id TEXT PRIMARY KEY,
      scenario_type TEXT NOT NULL,
      title TEXT NOT NULL,
      parameters TEXT NOT NULL,
      simulated_outcomes TEXT NOT NULL,
      affected_goals TEXT,
      affected_projects TEXT,
      affected_resources TEXT,
      conflicts_detected TEXT,
      recommendations TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // ==========================================
  // PHASE 11: AMBIENT PERSONAL INTELLIGENCE
  // ==========================================

  // Trusted Devices Registry (P0: Unified Device Identity)
  await run(`
    CREATE TABLE IF NOT EXISTS trusted_devices (
      id TEXT PRIMARY KEY,
      device_name TEXT NOT NULL,
      device_type TEXT NOT NULL,
      public_key TEXT,
      credential_hash TEXT NOT NULL,
      pairing_status TEXT DEFAULT 'PAIRED',
      capabilities TEXT DEFAULT '["chat","voice","missions","approvals","telemetry"]',
      permissions TEXT DEFAULT '["read","execute_command","approve_step"]',
      connectivity_status TEXT DEFAULT 'ONLINE',
      ip_address TEXT,
      user_agent TEXT,
      last_seen_at TEXT NOT NULL,
      registered_at TEXT NOT NULL
    )
  `);

  // Dynamic Enrollment Tokens (P0: Secure Enrollment without Hardcoded PINs)
  await run(`
    CREATE TABLE IF NOT EXISTS device_enrollment_tokens (
      id TEXT PRIMARY KEY,
      enrollment_code TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      device_name TEXT,
      device_type TEXT DEFAULT 'mobile',
      permissions TEXT,
      status TEXT DEFAULT 'PENDING',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      claimed_at TEXT,
      claimed_by_device_id TEXT
    )
  `);

  // Cross-Device Sync Checkpoints (P1: Persistent Synchronization)
  await run(`
    CREATE TABLE IF NOT EXISTS device_sync_checkpoints (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      checkpoint_type TEXT NOT NULL,
      sequence_number INTEGER DEFAULT 0,
      snapshot_hash TEXT,
      state_summary TEXT,
      timestamp TEXT NOT NULL
    )
  `);

  // Offline Operation Queue (P1 & P6: Offline Synchronization & Idempotency)
  await run(`
    CREATE TABLE IF NOT EXISTS offline_operation_queue (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      retry_count INTEGER DEFAULT 0,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      processed_at TEXT
    )
  `);

  // Ambient Context State (P2: Ambient Context Awareness)
  await run(`
    CREATE TABLE IF NOT EXISTS ambient_context_state (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      active_application TEXT,
      user_activity_state TEXT DEFAULT 'ACTIVE',
      active_mission_id TEXT,
      resource_metrics TEXT,
      network_quality TEXT DEFAULT 'GOOD',
      privacy_mode INTEGER DEFAULT 0,
      microphone_enabled INTEGER DEFAULT 1,
      camera_enabled INTEGER DEFAULT 0,
      screen_observation_allowed INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `);

  // Unified Notification Registry (P3: Unified Notification Intelligence)
  await run(`
    CREATE TABLE IF NOT EXISTS unified_notifications (
      id TEXT PRIMARY KEY,
      signature_hash TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'INFO',
      priority TEXT DEFAULT 'MEDIUM',
      target_device_id TEXT,
      action_url TEXT,
      action_payload TEXT,
      is_read INTEGER DEFAULT 0,
      is_acknowledged INTEGER DEFAULT 0,
      acknowledged_by TEXT,
      acknowledged_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // Cross-Device Handoff Sessions (P4 & P5: Voice, Conversation & Mission Continuity)
  await run(`
    CREATE TABLE IF NOT EXISTS cross_device_handoffs (
      id TEXT PRIMARY KEY,
      source_device_id TEXT NOT NULL,
      target_device_id TEXT,
      handoff_type TEXT NOT NULL,
      conversation_id TEXT,
      mission_id TEXT,
      state_payload TEXT NOT NULL,
      partial_transcript TEXT,
      status TEXT DEFAULT 'PENDING',
      created_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);

  // ==========================================
  // PHASE 12: SELF-EVOLVING INTELLIGENCE TABLES
  // ==========================================

  // Discovered System Weaknesses (P0: Self-Analysis Engine)
  await run(`
    CREATE TABLE IF NOT EXISTS evolution_weaknesses (
      id TEXT PRIMARY KEY,
      weakness_type TEXT NOT NULL,
      subsystem TEXT NOT NULL,
      description TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      confidence REAL DEFAULT 0.5,
      severity TEXT DEFAULT 'MEDIUM',
      status TEXT DEFAULT 'IDENTIFIED',
      identified_at TEXT NOT NULL,
      resolved_at TEXT
    )
  `);

  // Capability Gap Proposals (P1: Capability Gap Detection)
  await run(`
    CREATE TABLE IF NOT EXISTS evolution_capability_proposals (
      id TEXT PRIMARY KEY,
      weakness_id TEXT,
      title TEXT NOT NULL,
      problem_statement TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      expected_benefit TEXT NOT NULL,
      complexity TEXT DEFAULT 'MEDIUM',
      security_implications TEXT NOT NULL,
      test_requirements_json TEXT NOT NULL,
      status TEXT DEFAULT 'PROPOSED',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Self-Evolving Skill Specifications (P2: Self-Evolving Skill Engine)
  await run(`
    CREATE TABLE IF NOT EXISTS evolution_skills (
      id TEXT PRIMARY KEY,
      proposal_id TEXT,
      skill_key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      version TEXT DEFAULT '1.0.0',
      permissions_json TEXT NOT NULL,
      dependencies_json TEXT NOT NULL,
      inputs_schema TEXT NOT NULL,
      outputs_schema TEXT NOT NULL,
      failure_conditions_json TEXT NOT NULL,
      implementation_code TEXT NOT NULL,
      author TEXT DEFAULT 'jarvis-evolution',
      status TEXT DEFAULT 'DRAFT',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Sandbox Experiment Executions (P3: Isolated Experimentation Environment)
  await run(`
    CREATE TABLE IF NOT EXISTS evolution_experiments (
      id TEXT PRIMARY KEY,
      proposal_id TEXT,
      skill_id TEXT NOT NULL,
      sandbox_dir TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      resource_usage_json TEXT,
      execution_logs TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      error TEXT
    )
  `);

  // Intelligent Validation Records (P4: Intelligent Validation Engine)
  await run(`
    CREATE TABLE IF NOT EXISTS evolution_validations (
      id TEXT PRIMARY KEY,
      experiment_id TEXT,
      skill_id TEXT NOT NULL,
      unit_tests_pass INTEGER DEFAULT 0,
      integration_tests_pass INTEGER DEFAULT 0,
      security_check_pass INTEGER DEFAULT 0,
      regression_check_pass INTEGER DEFAULT 0,
      benchmark_comparison_json TEXT,
      independent_verification_pass INTEGER DEFAULT 0,
      verdict TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      evaluated_at TEXT NOT NULL
    )
  `);

  // Workflow Optimizations (P5: Workflow Optimization)
  await run(`
    CREATE TABLE IF NOT EXISTS evolution_workflow_optimizations (
      id TEXT PRIMARY KEY,
      mission_id TEXT,
      original_dag_json TEXT NOT NULL,
      optimized_dag_json TEXT NOT NULL,
      optimization_type TEXT NOT NULL,
      eliminated_redundancies_count INTEGER DEFAULT 0,
      parallel_steps_count INTEGER DEFAULT 0,
      approval_barrier_preserved INTEGER DEFAULT 1,
      verification_step_preserved INTEGER DEFAULT 1,
      status TEXT DEFAULT 'PROPOSED',
      created_at TEXT NOT NULL
    )
  `);

  // Controlled Evolution Deployments (P6: Controlled Evolution Pipeline)
  await run(`
    CREATE TABLE IF NOT EXISTS evolution_deployments (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      proposal_id TEXT,
      version TEXT NOT NULL,
      change_diff TEXT,
      approval_id TEXT,
      approved_by TEXT,
      approval_status TEXT DEFAULT 'PENDING',
      deployment_status TEXT DEFAULT 'PENDING',
      rollback_checkpoint_json TEXT,
      deployed_at TEXT,
      rolled_back_at TEXT,
      rollback_reason TEXT
    )
  `);

  // Continuous Improvement Metrics Tracking (P8: Continuous Improvement)
  await run(`
    CREATE TABLE IF NOT EXISTS evolution_metrics_tracking (
      id TEXT PRIMARY KEY,
      skill_id_or_system TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      pre_evolution_value REAL NOT NULL,
      post_evolution_value REAL NOT NULL,
      delta REAL NOT NULL,
      sample_size INTEGER DEFAULT 1,
      is_statistically_significant INTEGER DEFAULT 0,
      evidence_notes TEXT,
      measured_at TEXT NOT NULL
    )
  `);

  // ==========================================
  // PHASE 13: STRATEGIC INTELLIGENCE TABLES
  // ==========================================

  // Strategic Objectives Table (P0: Strategic Intelligence Engine)
  await run(`
    CREATE TABLE IF NOT EXISTS strategic_objectives (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      raw_input TEXT,
      intended_outcomes TEXT NOT NULL,
      constraints TEXT NOT NULL,
      assumptions TEXT NOT NULL,
      dependencies TEXT NOT NULL,
      success_criteria TEXT NOT NULL,
      risks TEXT NOT NULL,
      confidence REAL DEFAULT 0.8,
      evidence TEXT NOT NULL,
      status TEXT DEFAULT 'ANALYZED',
      progress REAL DEFAULT 0.0,
      parent_objective_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);

  // Strategic Initiatives Table (P0 & P5: Objective Decomposition & Hierarchies)
  await run(`
    CREATE TABLE IF NOT EXISTS strategic_initiatives (
      id TEXT PRIMARY KEY,
      objective_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'MEDIUM',
      status TEXT DEFAULT 'PLANNED',
      allocated_resources TEXT,
      measurable_outcomes TEXT,
      stalled_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Strategic Investigations Table (P3: Research and Investigation Intelligence)
  await run(`
    CREATE TABLE IF NOT EXISTS strategic_investigations (
      id TEXT PRIMARY KEY,
      objective_id TEXT,
      research_question TEXT NOT NULL,
      subquestions TEXT NOT NULL,
      retrieved_sources TEXT NOT NULL,
      conflicting_claims TEXT,
      outdated_information TEXT,
      unanswered_questions TEXT,
      synthesis_report TEXT NOT NULL,
      status TEXT DEFAULT 'COMPLETED',
      created_at TEXT NOT NULL
    )
  `);

  // Strategic Decisions Table (P4: Decision Intelligence Engine)
  await run(`
    CREATE TABLE IF NOT EXISTS strategic_decisions (
      id TEXT PRIMARY KEY,
      objective_id TEXT,
      decision_context TEXT NOT NULL,
      options TEXT NOT NULL,
      evaluation_criteria TEXT NOT NULL,
      scores_matrix TEXT NOT NULL,
      trade_offs TEXT NOT NULL,
      recommended_option TEXT NOT NULL,
      confidence REAL DEFAULT 0.8,
      conditions_changing_recommendation TEXT,
      status TEXT DEFAULT 'RECOMMENDED',
      created_at TEXT NOT NULL
    )
  `);

  // Strategic Scenario Simulations (P6: Counterfactual and Scenario Intelligence)
  await run(`
    CREATE TABLE IF NOT EXISTS strategic_scenario_simulations (
      id TEXT PRIMARY KEY,
      objective_id TEXT,
      scenario_name TEXT NOT NULL,
      simulation_type TEXT NOT NULL,
      scenario_parameters TEXT NOT NULL,
      best_case TEXT NOT NULL,
      expected_case TEXT NOT NULL,
      worst_case TEXT NOT NULL,
      is_read_only INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);

  // Strategic Critical Reviews (P7: Self-Critique and Decision Review)
  await run(`
    CREATE TABLE IF NOT EXISTS strategic_critical_reviews (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      supporting_evidence TEXT NOT NULL,
      contradictory_evidence TEXT NOT NULL,
      challenged_assumptions TEXT NOT NULL,
      alternative_approaches TEXT NOT NULL,
      failure_conditions TEXT NOT NULL,
      requires_human_approval INTEGER DEFAULT 0,
      approval_reasons TEXT,
      unresolved_uncertainty TEXT,
      planning_errors_identified TEXT,
      lessons_learned TEXT,
      verdict TEXT DEFAULT 'REVIEWED',
      created_at TEXT NOT NULL
    )
  `);

  // Evaluation Runs & Benchmarks (Module 3: AI Evaluation Engine)
  await run(`
    CREATE TABLE IF NOT EXISTS evaluation_runs (
      id TEXT PRIMARY KEY,
      run_name TEXT NOT NULL,
      suite_type TEXT NOT NULL,
      total_tests INTEGER NOT NULL,
      passed_tests INTEGER NOT NULL,
      failed_tests INTEGER NOT NULL,
      metrics TEXT NOT NULL,
      execution_time_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS evaluation_benchmarks (
      id TEXT PRIMARY KEY,
      scenario_key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      expected_tool TEXT,
      success_criteria TEXT,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  // Knowledge Graph Entities & Relationships (Module 4: Knowledge Graph)
  await run(`
    CREATE TABLE IF NOT EXISTS graph_entities (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      type TEXT,
      name TEXT NOT NULL,
      properties TEXT,
      source_type TEXT DEFAULT 'user_explicit',
      source TEXT DEFAULT 'user_explicit',
      confidence REAL DEFAULT 1.0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Migration for graph_entities
  try {
    const entCols = await query("PRAGMA table_info(graph_entities)");
    const colNames = entCols.map(c => c.name);
    if (!colNames.includes('entity_type')) {
      await run("ALTER TABLE graph_entities ADD COLUMN entity_type TEXT");
      await run("UPDATE graph_entities SET entity_type = type WHERE entity_type IS NULL AND type IS NOT NULL");
    }
    if (!colNames.includes('source_type')) {
      await run("ALTER TABLE graph_entities ADD COLUMN source_type TEXT DEFAULT 'user_explicit'");
      await run("UPDATE graph_entities SET source_type = source WHERE source_type IS NULL AND source IS NOT NULL");
    }
    if (!colNames.includes('confidence')) {
      await run("ALTER TABLE graph_entities ADD COLUMN confidence REAL DEFAULT 1.0");
    }
  } catch (e) {
    console.warn('[DB Migration] graph_entities:', e.message);
  }

  await run(`
    CREATE TABLE IF NOT EXISTS graph_relationships (
      id TEXT PRIMARY KEY,
      source_entity_id TEXT,
      source_id TEXT,
      target_entity_id TEXT,
      target_id TEXT,
      relationship_type TEXT,
      relation_type TEXT,
      weight REAL DEFAULT 1.0,
      properties TEXT,
      metadata TEXT,
      source_type TEXT DEFAULT 'user_explicit',
      source TEXT DEFAULT 'user_explicit',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Migration for graph_relationships
  try {
    const relCols = await query("PRAGMA table_info(graph_relationships)");
    const colNames = relCols.map(c => c.name);
    if (!colNames.includes('source_entity_id')) {
      await run("ALTER TABLE graph_relationships ADD COLUMN source_entity_id TEXT");
      await run("UPDATE graph_relationships SET source_entity_id = source_id WHERE source_entity_id IS NULL AND source_id IS NOT NULL");
    }
    if (!colNames.includes('target_entity_id')) {
      await run("ALTER TABLE graph_relationships ADD COLUMN target_entity_id TEXT");
      await run("UPDATE graph_relationships SET target_entity_id = target_id WHERE target_entity_id IS NULL AND target_id IS NOT NULL");
    }
    if (!colNames.includes('relationship_type')) {
      await run("ALTER TABLE graph_relationships ADD COLUMN relationship_type TEXT");
      await run("UPDATE graph_relationships SET relationship_type = relation_type WHERE relationship_type IS NULL AND relation_type IS NOT NULL");
    }
    if (!colNames.includes('source_type')) {
      await run("ALTER TABLE graph_relationships ADD COLUMN source_type TEXT DEFAULT 'user_explicit'");
      await run("UPDATE graph_relationships SET source_type = source WHERE source_type IS NULL AND source IS NOT NULL");
    }
    if (!colNames.includes('properties')) {
      await run("ALTER TABLE graph_relationships ADD COLUMN properties TEXT");
      await run("UPDATE graph_relationships SET properties = metadata WHERE properties IS NULL AND metadata IS NOT NULL");
    }
    if (!colNames.includes('updated_at')) {
      await run("ALTER TABLE graph_relationships ADD COLUMN updated_at TEXT");
    }
    if (!colNames.includes('confidence')) {
      await run("ALTER TABLE graph_relationships ADD COLUMN confidence REAL DEFAULT 1.0");
    }
    if (!colNames.includes('is_inferred')) {
      await run("ALTER TABLE graph_relationships ADD COLUMN is_inferred INTEGER DEFAULT 0");
    }
    if (!colNames.includes('temporal_start')) {
      await run("ALTER TABLE graph_relationships ADD COLUMN temporal_start TEXT");
    }
    if (!colNames.includes('temporal_end')) {
      await run("ALTER TABLE graph_relationships ADD COLUMN temporal_end TEXT");
    }
  } catch (e) {
    console.warn('[DB Migration] graph_relationships:', e.message);
  }

  // Personal Digital Twin Profiles (Module 5: Digital Twin)
  await run(`
    CREATE TABLE IF NOT EXISTS digital_twin_profiles (
      id TEXT PRIMARY KEY,
      category TEXT,
      facet_type TEXT,
      title TEXT,
      key TEXT,
      content TEXT,
      value TEXT,
      priority INTEGER DEFAULT 2,
      is_enabled INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      source TEXT DEFAULT 'user_explicit',
      provenance TEXT DEFAULT 'user_explicit',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Migration for digital_twin_profiles
  try {
    const twinCols = await query("PRAGMA table_info(digital_twin_profiles)");
    const colNames = twinCols.map(c => c.name);
    if (!colNames.includes('category')) {
      await run("ALTER TABLE digital_twin_profiles ADD COLUMN category TEXT");
      await run("UPDATE digital_twin_profiles SET category = facet_type WHERE category IS NULL AND facet_type IS NOT NULL");
    }
    if (!colNames.includes('title')) {
      await run("ALTER TABLE digital_twin_profiles ADD COLUMN title TEXT");
      await run("UPDATE digital_twin_profiles SET title = key WHERE title IS NULL AND key IS NOT NULL");
    }
    if (!colNames.includes('content')) {
      await run("ALTER TABLE digital_twin_profiles ADD COLUMN content TEXT");
      await run("UPDATE digital_twin_profiles SET content = value WHERE content IS NULL AND value IS NOT NULL");
    }
    if (!colNames.includes('is_enabled')) {
      await run("ALTER TABLE digital_twin_profiles ADD COLUMN is_enabled INTEGER DEFAULT 1");
      await run("UPDATE digital_twin_profiles SET is_enabled = is_active WHERE is_enabled IS NULL AND is_active IS NOT NULL");
    }
    if (!colNames.includes('source')) {
      await run("ALTER TABLE digital_twin_profiles ADD COLUMN source TEXT DEFAULT 'user_explicit'");
      await run("UPDATE digital_twin_profiles SET source = provenance WHERE source IS NULL AND provenance IS NOT NULL");
    }
    if (!colNames.includes('confidence')) {
      await run("ALTER TABLE digital_twin_profiles ADD COLUMN confidence REAL DEFAULT 1.0");
    }
    if (!colNames.includes('is_confirmed')) {
      await run("ALTER TABLE digital_twin_profiles ADD COLUMN is_confirmed INTEGER DEFAULT 1");
    }
    if (!colNames.includes('last_confirmed_at')) {
      await run("ALTER TABLE digital_twin_profiles ADD COLUMN last_confirmed_at TEXT");
    }
    if (!colNames.includes('expiration_policy')) {
      await run("ALTER TABLE digital_twin_profiles ADD COLUMN expiration_policy TEXT DEFAULT 'permanent'");
    }
    if (!colNames.includes('expires_at')) {
      await run("ALTER TABLE digital_twin_profiles ADD COLUMN expires_at TEXT");
    }
    if (!colNames.includes('review_before')) {
      await run("ALTER TABLE digital_twin_profiles ADD COLUMN review_before TEXT");
    }
    if (!colNames.includes('user_correction_history')) {
      await run("ALTER TABLE digital_twin_profiles ADD COLUMN user_correction_history TEXT");
    }
    if (!colNames.includes('status')) {
      await run("ALTER TABLE digital_twin_profiles ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
    }
    if (!colNames.includes('metadata')) {
      await run("ALTER TABLE digital_twin_profiles ADD COLUMN metadata TEXT");
    }
  } catch (e) {
    console.warn('[DB Migration] digital_twin_profiles:', e.message);
  }

  // Migration for evaluation_runs
  try {
    const evalCols = await query("PRAGMA table_info(evaluation_runs)");
    const colNames = evalCols.map(c => c.name);
    if (!colNames.includes('run_name')) await run("ALTER TABLE evaluation_runs ADD COLUMN run_name TEXT");
    if (!colNames.includes('suite_type')) await run("ALTER TABLE evaluation_runs ADD COLUMN suite_type TEXT DEFAULT 'full'");
    if (!colNames.includes('total_tests')) await run("ALTER TABLE evaluation_runs ADD COLUMN total_tests INTEGER DEFAULT 0");
    if (!colNames.includes('passed_tests')) await run("ALTER TABLE evaluation_runs ADD COLUMN passed_tests INTEGER DEFAULT 0");
    if (!colNames.includes('failed_tests')) await run("ALTER TABLE evaluation_runs ADD COLUMN failed_tests INTEGER DEFAULT 0");
    if (!colNames.includes('metrics')) await run("ALTER TABLE evaluation_runs ADD COLUMN metrics TEXT");
    if (!colNames.includes('execution_time_ms')) await run("ALTER TABLE evaluation_runs ADD COLUMN execution_time_ms INTEGER DEFAULT 0");
  } catch (e) {
    console.warn('[DB Migration] evaluation_runs:', e.message);
  }

  // Migration for system_errors
  try {
    const errCols = await query("PRAGMA table_info(system_errors)");
    const colNames = errCols.map(c => c.name);
    if (!colNames.includes('error_code')) await run("ALTER TABLE system_errors ADD COLUMN error_code TEXT DEFAULT 'ERR_SYSTEM'");
    if (!colNames.includes('stack')) await run("ALTER TABLE system_errors ADD COLUMN stack TEXT");
    if (!colNames.includes('subsystem')) await run("ALTER TABLE system_errors ADD COLUMN subsystem TEXT DEFAULT 'SYSTEM'");
    if (!colNames.includes('severity')) await run("ALTER TABLE system_errors ADD COLUMN severity TEXT DEFAULT 'ERROR'");
    if (!colNames.includes('recovery_attempted')) await run("ALTER TABLE system_errors ADD COLUMN recovery_attempted INTEGER DEFAULT 0");
    if (!colNames.includes('recovery_status')) await run("ALTER TABLE system_errors ADD COLUMN recovery_status TEXT");
    if (!colNames.includes('timestamp')) await run("ALTER TABLE system_errors ADD COLUMN timestamp TEXT");
  } catch (e) {
    console.warn('[DB Migration] system_errors:', e.message);
  }

  // Migration for mission_checkpoints
  try {
    const chkCols = await query("PRAGMA table_info(mission_checkpoints)");
    const colNames = chkCols.map(c => c.name);
    if (!colNames.includes('state_snapshot')) {
      await run("ALTER TABLE mission_checkpoints ADD COLUMN state_snapshot TEXT");
      await run("UPDATE mission_checkpoints SET state_snapshot = checkpoint_data WHERE state_snapshot IS NULL AND checkpoint_data IS NOT NULL");
    }
  } catch (e) {
    console.warn('[DB Migration] mission_checkpoints:', e.message);
  }

  // Reusable Agent Skills (Module 7: Skills Ecosystem)
  await run(`
    CREATE TABLE IF NOT EXISTS agent_skills (
      id TEXT PRIMARY KEY,
      skill_key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      version TEXT DEFAULT '1.0.0',
      schema_definition TEXT NOT NULL,
      permissions TEXT NOT NULL,
      is_enabled INTEGER DEFAULT 1,
      author TEXT DEFAULT 'system',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // System Errors & Crash Diagnostics (Module 8: Reliability)
  await run(`
    CREATE TABLE IF NOT EXISTS system_errors (
      id TEXT PRIMARY KEY,
      error_code TEXT NOT NULL,
      message TEXT NOT NULL,
      stack TEXT,
      subsystem TEXT NOT NULL,
      severity TEXT DEFAULT 'ERROR',
      recovery_attempted INTEGER DEFAULT 0,
      recovery_status TEXT,
      timestamp TEXT NOT NULL
    )
  `);

  // SQLite Backups Meta (Module 8: Reliability)
  await run(`
    CREATE TABLE IF NOT EXISTS backups_meta (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      filesize INTEGER NOT NULL,
      checksum TEXT,
      verification_status TEXT DEFAULT 'unverified',
      created_at TEXT NOT NULL
    )
  `);

  // ==========================================
  // PHASE 5: NOVA 1.0 PRODUCTIZATION
  // ==========================================

  // End-to-End Request Traces & Observability Spans (Module 2)
  await run(`
    CREATE TABLE IF NOT EXISTS request_traces (
      id TEXT PRIMARY KEY,
      trace_id TEXT UNIQUE NOT NULL,
      session_id TEXT,
      conversation_id TEXT,
      user_input TEXT,
      intent TEXT,
      agent_assigned TEXT,
      model_used TEXT,
      latency_ms INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      status TEXT DEFAULT 'success',
      error TEXT,
      spans TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  // Contextual Proactive Recommendations (Module 5)
  await run(`
    CREATE TABLE IF NOT EXISTS proactive_recommendations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      reason TEXT NOT NULL,
      context_source TEXT,
      urgency TEXT DEFAULT 'MEDIUM',
      action_tool TEXT,
      action_args TEXT,
      status TEXT DEFAULT 'PENDING',
      is_sensitive INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    )
  `);

  // Phase 5 Migrations: Cross-Device Continuity & Sync Sequence (Module 4)
  try {
    const taskCols = await query("PRAGMA table_info(tasks)");
    const taskColNames = taskCols.map(c => c.name);
    if (!taskColNames.includes('sync_sequence')) await run("ALTER TABLE tasks ADD COLUMN sync_sequence INTEGER DEFAULT 1");
    if (!taskColNames.includes('version')) await run("ALTER TABLE tasks ADD COLUMN version INTEGER DEFAULT 1");
    if (!taskColNames.includes('client_id')) await run("ALTER TABLE tasks ADD COLUMN client_id TEXT");
    if (!taskColNames.includes('updated_at')) await run("ALTER TABLE tasks ADD COLUMN updated_at TEXT");

    const memCols = await query("PRAGMA table_info(memories)");
    const memColNames = memCols.map(c => c.name);
    if (!memColNames.includes('sync_sequence')) await run("ALTER TABLE memories ADD COLUMN sync_sequence INTEGER DEFAULT 1");
    if (!memColNames.includes('version')) await run("ALTER TABLE memories ADD COLUMN version INTEGER DEFAULT 1");
    if (!memColNames.includes('client_id')) await run("ALTER TABLE memories ADD COLUMN client_id TEXT");

    const missionCols = await query("PRAGMA table_info(missions)");
    const missionColNames = missionCols.map(c => c.name);
    if (!missionColNames.includes('sync_sequence')) await run("ALTER TABLE missions ADD COLUMN sync_sequence INTEGER DEFAULT 1");
    if (!missionColNames.includes('version')) await run("ALTER TABLE missions ADD COLUMN version INTEGER DEFAULT 1");
    if (!missionColNames.includes('client_id')) await run("ALTER TABLE missions ADD COLUMN client_id TEXT");
    if (!missionColNames.includes('acceptance_contract')) await run("ALTER TABLE missions ADD COLUMN acceptance_contract TEXT");
    if (!missionColNames.includes('verification_report')) await run("ALTER TABLE missions ADD COLUMN verification_report TEXT");
    if (!missionColNames.includes('failure_class')) await run("ALTER TABLE missions ADD COLUMN failure_class TEXT");
    if (!missionColNames.includes('checkpoint_state')) await run("ALTER TABLE missions ADD COLUMN checkpoint_state TEXT");
  } catch (syncErr) {
    console.warn('[DB Migration] Phase 5 sync columns:', syncErr.message);
  }

  // Seed default settings if not exists
  const existingSettings = await query('SELECT key FROM settings');
  const existingKeys = new Set(existingSettings.map(s => s.key));

  const defaultSettings = [
    { key: 'ai_provider', value: 'ollama' },
    { key: 'primary_provider', value: 'ollama' },
    { key: 'secondary_provider', value: '' },
    { key: 'fallback_provider', value: 'ollama' },
    { key: 'zero_cost_local_only', value: 'true' },
    { key: 'local_inference_enabled', value: 'true' },
    { key: 'gemini_api_key', value: '' },
    { key: 'gemini_model', value: 'gemini-flash-latest' },
    { key: 'ollama_endpoint', value: 'http://127.0.0.1:11434' },
    { key: 'ollama_model', value: 'qwen3.5:4b' },
    { key: 'tts_enabled', value: 'true' },
    { key: 'tts_rate', value: '1.0' },
    { key: 'tts_pitch', value: '1.0' },
    { key: 'tts_voice', value: 'default' },
    { key: 'continuous_listening', value: 'false' },
    { key: 'python_agent_url', value: 'http://localhost:8000' },
    { key: 'python_agent_token', value: 'nova-local-agent-secure-token-2026' },
    { key: 'system_user_name', value: 'Commander' },
    { key: 'emergency_stop', value: 'false' },
    { key: 'wake_word_enabled', value: 'true' },
    { key: 'wake_word_phrase', value: 'Hey Nova' },
    { key: 'proactive_briefing_enabled', value: 'true' },
    { key: 'proactive_task_alerts', value: 'true' },
    { key: 'mobile_access_enabled', value: 'true' },
    { key: 'mobile_pin', value: '2026' },
    { key: 'system_language', value: 'en-US' },
    { key: 'privacy_mode', value: 'standard' },
    { key: 'model_routing_policy', value: 'balanced' },
    { key: 'proactive_frequency', value: 'normal' },
    { key: 'auto_backup_enabled', value: 'true' },
    { key: 'auto_backup_interval_hours', value: '12' }
  ];

  for (const s of defaultSettings) {
    if (!existingKeys.has(s.key)) {
      await run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [
        s.key,
        s.value,
        new Date().toISOString()
      ]);
    }
  }

  // Non-destructively migrate legacy unconfigured/default local settings to Zero-Cost Ollama baseline
  try {
    await run("UPDATE settings SET value = 'http://127.0.0.1:11434' WHERE key = 'ollama_endpoint' AND value = 'http://localhost:11434'");
    await run("UPDATE settings SET value = 'qwen3.5:4b' WHERE key = 'ollama_model' AND value = 'llama3:latest'");
    await run("UPDATE settings SET value = 'ollama' WHERE key = 'ai_provider' AND value = 'gemini'");
  } catch (_) {}

  // Ensure Mobile PIN is salted and hashed for Zero-Trust Security
  const pinHashRow = await get("SELECT value FROM settings WHERE key = 'mobile_pin_hash'");
  if (!pinHashRow) {
    const rawPinRow = await get("SELECT value FROM settings WHERE key = 'mobile_pin'");
    const rawPin = rawPinRow ? rawPinRow.value : '2026';
    const { hash, salt } = hashPin(rawPin);
    await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('mobile_pin_hash', ?, ?)", [hash, new Date().toISOString()]);
    await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('mobile_pin_salt', ?, ?)", [salt, new Date().toISOString()]);
  }

  // Seed default skills if empty
  const skillsCount = await get('SELECT COUNT(*) as count FROM agent_skills');
  if (skillsCount.count === 0) {
    const defaultSkills = [
      {
        id: 'skill-repo-analyzer',
        skill_key: 'code_repository_analyzer',
        name: 'Repository Architecture & Codebase Analyzer',
        description: 'Analyzes folder hierarchies, code conventions, module dependencies and structural health.',
        version: '1.2.0',
        schema_definition: JSON.stringify({
          type: 'object',
          properties: {
            directory: { type: 'string', description: 'Root directory path to analyze' },
            depth: { type: 'number', default: 3, description: 'Inspection depth level' }
          },
          required: ['directory']
        }),
        permissions: JSON.stringify(['read_files', 'analyze_code']),
        is_enabled: 1,
        author: 'NOVA System Core'
      },
      {
        id: 'skill-dossier-synthesizer',
        skill_key: 'web_dossier_synthesizer',
        name: 'Web Intelligence Dossier Synthesizer',
        description: 'Aggregates multiple authoritative sources, cross-references factual claims, and produces structured dossiers with citations.',
        version: '1.1.0',
        schema_definition: JSON.stringify({
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Subject or research question' },
            target_sources: { type: 'number', default: 5, description: 'Number of independent sources' }
          },
          required: ['topic']
        }),
        permissions: JSON.stringify(['web_search', 'extract_text']),
        is_enabled: 1,
        author: 'NOVA Research Agent'
      },
      {
        id: 'skill-resource-optimizer',
        skill_key: 'system_resource_optimizer',
        name: 'System Resource & Performance Optimizer',
        description: 'Inspects running background processes, identifies memory bottlenecks, and optimizes CPU/RAM utilization safely.',
        version: '1.0.4',
        schema_definition: JSON.stringify({
          type: 'object',
          properties: {
            target_metric: { type: 'string', enum: ['memory', 'cpu', 'handles', 'all'], default: 'all' }
          }
        }),
        permissions: JSON.stringify(['system_metrics', 'process_inspection']),
        is_enabled: 1,
        author: 'NOVA System Core'
      },
      {
        id: 'skill-executive-summarizer',
        skill_key: 'executive_presentation_summarizer',
        name: 'Executive Briefing & Presentation Summarizer',
        description: 'Distills long transcripts, meeting notes, and research papers into executive bullet points, key takeaways, and action items.',
        version: '1.0.0',
        schema_definition: JSON.stringify({
          type: 'object',
          properties: {
            text_content: { type: 'string', description: 'Raw document or transcript text' },
            max_bullets: { type: 'number', default: 5 }
          },
          required: ['text_content']
        }),
        permissions: JSON.stringify(['natural_language_synthesis']),
        is_enabled: 1,
        author: 'NOVA Content Agent'
      },
      {
        id: 'skill-calendar-planner',
        skill_key: 'meeting_calendar_planner',
        name: 'Conflict-Free Meeting & Schedule Planner',
        description: 'Analyzes priority schedules, identifies conflict-free time slots, and coordinates optimal productivity focus blocks.',
        version: '1.0.0',
        schema_definition: JSON.stringify({
          type: 'object',
          properties: {
            duration_minutes: { type: 'number', default: 45 },
            preferred_window: { type: 'string', enum: ['morning', 'afternoon', 'any'], default: 'morning' }
          }
        }),
        permissions: JSON.stringify(['calendar_access', 'task_scheduling']),
        is_enabled: 1,
        author: 'NOVA Productivity Agent'
      }
    ];

    for (const skill of defaultSkills) {
      await run(
        `INSERT INTO agent_skills 
        (id, skill_key, name, description, version, schema_definition, permissions, is_enabled, author, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          skill.id,
          skill.skill_key,
          skill.name,
          skill.description,
          skill.version,
          skill.schema_definition,
          skill.permissions,
          skill.is_enabled,
          skill.author,
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
    }
  }

  // Seed default Digital Twin profile entries if missing
  const defaultTwinProfiles = [
    {
      id: 'twin-1',
      category: 'goals',
      title: 'Master Autonomous AI Systems Engineering',
      content: 'Design and deploy production-grade agentic AI operating systems with zero-trust security and multi-modal intelligence.',
      priority: 3,
      source: 'user_explicit'
    },
    {
      id: 'twin-2',
      category: 'projects',
      title: 'NOVA Personal AI OS (JARVIS)',
      content: 'Building complete personal AI command center spanning React HUD, autonomous DAG execution, knowledge graphs, and Windows automation.',
      priority: 3,
      source: 'user_explicit'
    },
    {
      id: 'twin-3',
      category: 'preferences',
      title: 'Concise & Rigorous Engineering Protocol',
      content: 'Deliver architectural clarity, rigorous verification, high performance, and eliminate unnecessary human friction.',
      priority: 2,
      source: 'user_explicit'
    },
    {
      id: 'twin-4',
      category: 'routines',
      title: 'Autonomous Morning Telemetry & Evening Backup',
      content: 'Execute system health diagnostics at start of day; conduct automated hot database backups and audit reviews at end of day.',
      priority: 2,
      source: 'user_explicit'
    },
    {
      id: 'twin-5',
      category: 'priorities',
      title: 'Zero-Trust Safety & Controlled Autonomy',
      content: 'Always require explicit user confirmation before destructive actions or external API permission changes.',
      priority: 3,
      source: 'user_explicit'
    }
  ];

  for (const p of defaultTwinProfiles) {
    const existing = await get('SELECT id FROM digital_twin_profiles WHERE id = ? OR title = ? OR key = ?', [p.id, p.title, p.title]);
    if (!existing) {
      await run(
        `INSERT INTO digital_twin_profiles 
        (id, category, facet_type, title, key, content, value, priority, is_enabled, is_active, source, provenance, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`,
        [p.id, p.category, p.category, p.title, p.title, p.content, p.content, p.priority, p.source, p.source, new Date().toISOString(), new Date().toISOString()]
      );
    }
  }

  // Phase 16: Autonomous Computer Intelligence Tables
  await run(`
    CREATE TABLE IF NOT EXISTS computer_observations (
      id TEXT PRIMARY KEY,
      mission_id TEXT,
      session_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      capture_method TEXT,
      active_hwnd INTEGER,
      active_app TEXT,
      active_title TEXT,
      ui_elements_json TEXT,
      dialogs_json TEXT,
      ocr_text_sanitized TEXT,
      untrusted_injection_detected INTEGER DEFAULT 0,
      pixel_sha256 TEXT,
      frame_changed INTEGER DEFAULT 0,
      diff_ratio REAL DEFAULT 0,
      confidence REAL DEFAULT 0.0,
      permission_granted INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS computer_action_audit (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      mission_id TEXT,
      loop_step INTEGER DEFAULT 1,
      phase TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_app TEXT,
      target_title TEXT,
      target_element TEXT,
      params_json TEXT,
      pre_observation_id TEXT,
      post_observation_id TEXT,
      visual_changed INTEGER DEFAULT 0,
      ui_changed INTEGER DEFAULT 0,
      recovery_attempts INTEGER DEFAULT 0,
      recovery_reason TEXT,
      approval_required INTEGER DEFAULT 0,
      approval_status TEXT DEFAULT 'NONE_REQUIRED',
      confidence REAL DEFAULT 0.0,
      blocked_reason TEXT,
      outcome_verified INTEGER DEFAULT 0,
      error TEXT,
      timestamp TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS computer_control_state (
      id TEXT PRIMARY KEY,
      active_session_id TEXT,
      status TEXT DEFAULT 'IDLE',
      current_task TEXT,
      active_app TEXT,
      active_title TEXT,
      active_hwnd INTEGER,
      screen_permission_granted INTEGER DEFAULT 0,
      planned_actions_json TEXT,
      detected_elements_json TEXT,
      recovery_history_json TEXT,
      last_confidence REAL DEFAULT 0.0,
      verification_status TEXT DEFAULT 'NONE',
      updated_at TEXT NOT NULL
    )
  `);

  // Explicit opt-in default for screen observation unless operator already toggled it
  await run(
    "INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('screen_observation_permitted', 'false', ?)",
    [new Date().toISOString()]
  );

  // Seed default evaluation benchmarks if empty
  const benchCount = await get('SELECT COUNT(*) as count FROM evaluation_benchmarks');
  if (benchCount.count === 0) {
    const defaultBenchmarks = [
      {
        id: 'bench-1',
        scenario_key: 'tool_selection_accuracy',
        name: 'Tool Selection Precision Benchmark',
        description: 'Tests whether the orchestrator accurately maps natural language intents to corresponding specialized tools.',
        expected_tool: 'search_web,open_application,conduct_deep_research',
        success_criteria: 'Selected tool must match domain intent with >= 90% accuracy.',
        category: 'orchestration'
      },
      {
        id: 'bench-2',
        scenario_key: 'dag_dependency_resolution',
        name: 'Mission DAG Dependency Resolution',
        description: 'Verifies that dependent steps in multi-agent missions never execute before parent prerequisites finish.',
        expected_tool: 'mission_step_resolver',
        success_criteria: 'Zero out-of-order execution occurrences in multi-agent pipeline.',
        category: 'planning'
      },
      {
        id: 'bench-3',
        scenario_key: 'zero_trust_token_rotation',
        name: 'Zero-Trust Session Rotation & Expiry',
        description: 'Verifies that mobile session tokens expire after 24h and can be rotated atomically with valid refresh tokens.',
        expected_tool: 'crypto_verifier',
        success_criteria: 'Revoked or expired tokens immediately return HTTP 401/403.',
        category: 'security'
      },
      {
        id: 'bench-4',
        scenario_key: 'knowledge_graph_traversal',
        name: 'Knowledge Graph 2-Hop Traversal',
        description: 'Verifies entity link retrieval across memories, documents, tasks, and people with provenance tracking.',
        expected_tool: 'graph_query_engine',
        success_criteria: 'Retrieves multi-hop connected entities and preserves explicit vs inferred tagging.',
        category: 'knowledge'
      },
      {
        id: 'bench-5',
        scenario_key: 'hot_backup_integrity',
        name: 'SQLite Hot Backup & Restoration Verification',
        description: 'Performs non-blocking VACUUM INTO backup and verifies database integrity on restored copy.',
        expected_tool: 'backup_service',
        success_criteria: 'Integrity check returns "ok" on hot snapshot copy.',
        category: 'reliability'
      }
    ];

    for (const b of defaultBenchmarks) {
      await run(
        `INSERT INTO evaluation_benchmarks 
        (id, scenario_key, name, description, expected_tool, success_criteria, category, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [b.id, b.scenario_key, b.name, b.description, b.expected_tool, b.success_criteria, b.category, new Date().toISOString()]
      );
    }
  }

  // Seed default integrations if empty
  const integrationsCount = await get('SELECT COUNT(*) as count FROM external_integrations');
  if (integrationsCount.count === 0) {
    const defaultIntegrations = [
      { provider: 'gmail', name: 'Google Mail', auth_type: 'oauth2', scopes: 'mail.readonly,mail.send', status: 'unconfigured' },
      { provider: 'google_calendar', name: 'Google Calendar', auth_type: 'oauth2', scopes: 'calendar.events,calendar.readonly', status: 'unconfigured' },
      { provider: 'google_drive', name: 'Google Drive', auth_type: 'oauth2', scopes: 'drive.file,drive.readonly', status: 'unconfigured' },
      { provider: 'github', name: 'GitHub', auth_type: 'pat_token', scopes: 'repo,read:user', status: 'unconfigured' }
    ];
    for (const integ of defaultIntegrations) {
      await run(
        'INSERT INTO external_integrations (provider, name, status, auth_type, credentials, scopes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [integ.provider, integ.name, integ.status, integ.auth_type, null, integ.scopes, new Date().toISOString()]
      );
    }
  }

  // Seed default memories if empty
  const memoriesCount = await get('SELECT COUNT(*) as count FROM memories');
  if (memoriesCount.count === 0) {
    const seedMemories = [
      { id: 'mem-1', key: 'User Name', value: 'Commander Digvijay', category: 'Identity', importance: 3 },
      { id: 'mem-2', key: 'Primary Assistant Role', value: 'NOVA - Personal AI Operating System and Command Center inspired by JARVIS', category: 'System', importance: 3 },
      { id: 'mem-3', key: 'Preferred Coding Stack', value: 'React, Node.js, Python, Tailwind CSS, modern TypeScript and AI frameworks', category: 'Preferences', importance: 2 },
      { id: 'mem-4', key: 'Work Routine', value: 'Daily focus sessions with high-priority deep work in morning and review at 8 PM', category: 'Routine', importance: 2 },
      { id: 'mem-5', key: 'Voice Protocol', value: 'Concise, precise, sophisticated JARVIS-style communication with vocal confirmation for computer actions', category: 'Preferences', importance: 3 }
    ];
    for (const m of seedMemories) {
      await run('INSERT INTO memories (id, key, value, category, importance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        m.id, m.key, m.value, m.category, m.importance, new Date().toISOString(), new Date().toISOString()
      ]);
    }
  }

  // Seed default tasks if empty
  const tasksCount = await get('SELECT COUNT(*) as count FROM tasks');
  if (tasksCount.count === 0) {
    const now = new Date();
    const seedTasks = [
      { id: 'task-1', title: 'Complete NOVA OS core deployment', description: 'Ensure full operational status for HUD, Voice, AI Brain and Computer Automation', status: 'in-progress', priority: 'high', due_date: new Date(now.getTime() + 86400000).toISOString() },
      { id: 'task-2', title: 'Review morning telemetry and active workflows', description: 'Analyze system resource metrics and verify Python agent hooks', status: 'pending', priority: 'medium', due_date: new Date(now.getTime() + 172800000).toISOString() },
      { id: 'task-3', title: 'Automated YouTube content generation pipeline', description: 'Execute research and script drafting for upcoming tech deep-dive', status: 'pending', priority: 'high', due_date: new Date(now.getTime() + 259200000).toISOString() }
    ];
    for (const t of seedTasks) {
      await run('INSERT INTO tasks (id, title, description, status, priority, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        t.id, t.title, t.description, t.status, t.priority, t.due_date, new Date().toISOString()
      ]);
    }
  }

  // Seed sample workflows if empty
  const workflowsCount = await get('SELECT COUNT(*) as count FROM workflows');
  if (workflowsCount.count === 0) {
    const seedWorkflows = [
      {
        id: 'wf-youtube-content',
        name: 'YouTube Content Creation Engine',
        description: 'Researches emerging AI topics, synthesizes tech news, outlines long-form script, generates viral Shorts script and archives output.',
        steps: JSON.stringify([
          { id: 1, name: 'Query Tech News & Trends', status: 'pending', action: 'web_search' },
          { id: 2, name: 'Extract & Rank Hot Topics', status: 'pending', action: 'ai_analysis' },
          { id: 3, name: 'Draft Long-form Video Script', status: 'pending', action: 'ai_generation' },
          { id: 4, name: 'Draft Viral YouTube Short Script', status: 'pending', action: 'ai_generation' },
          { id: 5, name: 'Save Deliverables to Local Vault', status: 'pending', action: 'file_save' },
          { id: 6, name: 'Transmit Completion Briefing', status: 'pending', action: 'notify' }
        ]),
        status: 'idle',
        progress: 0,
        logs: JSON.stringify(['Workflow initialized and standing by for launch directive.'])
      },
      {
        id: 'wf-daily-briefing',
        name: 'Executive Morning Briefing Protocol',
        description: 'Synthesizes active reminders, pending priorities, system hardware metrics, and external news into an audio-visual briefing.',
        steps: JSON.stringify([
          { id: 1, name: 'Inspect Memory & Task Registers', status: 'pending', action: 'memory_check' },
          { id: 2, name: 'Poll System Resource Telemetry', status: 'pending', action: 'system_metrics' },
          { id: 3, name: 'Compile Strategic Priority List', status: 'pending', action: 'ai_planning' },
          { id: 4, name: 'Synthesize Audio Briefing Transcript', status: 'pending', action: 'voice_synthesis' }
        ]),
        status: 'idle',
        progress: 0,
        logs: JSON.stringify(['Workflow registered in active memory banks.'])
      }
    ];
    for (const wf of seedWorkflows) {
      await run('INSERT INTO workflows (id, name, description, steps, status, progress, logs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        wf.id, wf.name, wf.description, wf.steps, wf.status, wf.progress, wf.logs, new Date().toISOString(), new Date().toISOString()
      ]);
    }
  }

  // Seed default conversation if empty
  const convCount = await get('SELECT COUNT(*) as count FROM conversations');
  if (convCount.count === 0) {
    const defaultConvId = 'conv-main';
    await run('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      defaultConvId, 'Command Center Main', new Date().toISOString(), new Date().toISOString()
    ]);
    await run('INSERT INTO messages (id, conversation_id, sender, content, timestamp) VALUES (?, ?, ?, ?, ?)', [
      'msg-welcome',
      defaultConvId,
      'nova',
      'Good day, Commander. NOVA system initialized and operating at peak capacity. All diagnostic subsystems, neural cores, memory registers, and local computer hooks are standing by for your command.',
      new Date().toISOString()
    ]);
  }

  // Seed initial activity log if not exists
  const existingInitLog = await get('SELECT id FROM activity_logs WHERE id = ?', ['log-init']);
  if (!existingInitLog) {
    await run('INSERT INTO activity_logs (id, action, category, details, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)', [
      'log-init', 'System Boot', 'SYSTEM', 'NOVA core online. SQLite memory and tools synchronized.', 'success', new Date().toISOString()
    ]);
  }

  // ==========================================
  // PHASE 18: AUTONOMOUS WORKFLOW ECOSYSTEM
  // ==========================================
  await run(`
    CREATE TABLE IF NOT EXISTS agent_execution_logs (
      id TEXT PRIMARY KEY,
      mission_id TEXT,
      step_id TEXT,
      agent_key TEXT NOT NULL,
      tool TEXT NOT NULL,
      status TEXT NOT NULL,
      input_summary TEXT,
      output_hash TEXT,
      output_summary TEXT,
      contract_valid INTEGER DEFAULT 1,
      resource_usage_json TEXT,
      error TEXT,
      latency_ms INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS workflow_skill_benchmarks (
      id TEXT PRIMARY KEY,
      skill_key TEXT NOT NULL,
      version TEXT NOT NULL,
      pattern_signature TEXT,
      baseline_latency_ms INTEGER DEFAULT 15,
      benchmark_latency_ms INTEGER DEFAULT 15,
      pass_rate REAL DEFAULT 1.0,
      regression_passed INTEGER DEFAULT 1,
      security_passed INTEGER DEFAULT 1,
      status TEXT DEFAULT 'ACTIVE',
      is_outdated INTEGER DEFAULT 0,
      outdated_reason TEXT,
      sandbox_experiment_id TEXT,
      validation_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS mission_coordination_events (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      source_agent TEXT,
      target_agent TEXT,
      payload_json TEXT,
      resolution_status TEXT DEFAULT 'RECORDED',
      created_at TEXT NOT NULL
    )
  `);

  try {
    const missionCols = await query('PRAGMA table_info(missions)');
    const mColNames = missionCols.map(c => c.name);
    if (!mColNames.includes('workflow_metadata')) {
      await run('ALTER TABLE missions ADD COLUMN workflow_metadata TEXT');
    }
  } catch (e) {
    console.warn('[DB Migration] workflow_metadata:', e.message);
  }

  // ==========================================
  // PHASE 19: UNIVERSAL DEVICE INTELLIGENCE
  // ==========================================

  // Nonce registry for per-request replay attack prevention
  await run(`
    CREATE TABLE IF NOT EXISTS consumed_nonces (
      nonce TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      consumed_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `);

  // Device orchestration routing decisions audit log
  await run(`
    CREATE TABLE IF NOT EXISTS device_routing_decisions (
      id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      selected_device_id TEXT,
      candidate_scores TEXT,
      reason TEXT,
      score REAL,
      created_at TEXT NOT NULL
    )
  `);

  // Phase 19 migrations: extend trusted_devices with health & trust fields
  try {
    const tdCols = await query('PRAGMA table_info(trusted_devices)');
    const tdNames = tdCols.map(c => c.name);
    if (!tdNames.includes('trust_level')) {
      await run(`ALTER TABLE trusted_devices ADD COLUMN trust_level TEXT DEFAULT 'TRUSTED'`);
    }
    if (!tdNames.includes('health_score')) {
      await run(`ALTER TABLE trusted_devices ADD COLUMN health_score INTEGER DEFAULT 100`);
    }
    if (!tdNames.includes('battery_level')) {
      await run(`ALTER TABLE trusted_devices ADD COLUMN battery_level INTEGER`);
    }
    if (!tdNames.includes('storage_available_mb')) {
      await run(`ALTER TABLE trusted_devices ADD COLUMN storage_available_mb INTEGER`);
    }
    if (!tdNames.includes('cpu_load_percent')) {
      await run(`ALTER TABLE trusted_devices ADD COLUMN cpu_load_percent INTEGER`);
    }
    if (!tdNames.includes('network_type')) {
      await run(`ALTER TABLE trusted_devices ADD COLUMN network_type TEXT`);
    }
    if (!tdNames.includes('last_health_at')) {
      await run(`ALTER TABLE trusted_devices ADD COLUMN last_health_at TEXT`);
    }
  } catch (e) {
    console.warn('[DB Migration] trusted_devices Phase19 columns:', e.message);
  }

  // Extend offline_operation_queue with retry limit
  try {
    const oqCols = await query('PRAGMA table_info(offline_operation_queue)');
    const oqNames = oqCols.map(c => c.name);
    if (!oqNames.includes('max_retries')) {
      await run(`ALTER TABLE offline_operation_queue ADD COLUMN max_retries INTEGER DEFAULT 5`);
    }
  } catch (e) {
    console.warn('[DB Migration] offline_operation_queue max_retries:', e.message);
  }

  // ==========================================
  // PHASE 20: SELF-EVOLVING INTELLIGENCE
  // ==========================================

  await run(`
    CREATE TABLE IF NOT EXISTS evolution_improvement_memory (
      id TEXT PRIMARY KEY,
      proposal_id TEXT,
      experiment_id TEXT,
      skill_id TEXT,
      deployment_id TEXT,
      original_problem TEXT NOT NULL,
      proposed_improvement TEXT NOT NULL,
      hypothesis TEXT,
      experimental_config_json TEXT,
      baseline_measurements_json TEXT,
      candidate_measurements_json TEXT,
      security_review_json TEXT,
      approval_history_json TEXT,
      deployment_result TEXT,
      rollback_result TEXT,
      lessons_learned TEXT,
      status TEXT DEFAULT 'RECORDED',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  try {
    const propCols = await query('PRAGMA table_info(evolution_capability_proposals)');
    const propNames = propCols.map(c => c.name);
    if (!propNames.includes('hypothesis')) await run('ALTER TABLE evolution_capability_proposals ADD COLUMN hypothesis TEXT');
    if (!propNames.includes('potential_risks')) await run('ALTER TABLE evolution_capability_proposals ADD COLUMN potential_risks TEXT');
    if (!propNames.includes('success_criteria')) await run('ALTER TABLE evolution_capability_proposals ADD COLUMN success_criteria TEXT');
    if (!propNames.includes('resource_requirements_json')) await run('ALTER TABLE evolution_capability_proposals ADD COLUMN resource_requirements_json TEXT');
  } catch (e) {
    console.warn('[DB Migration] evolution_capability_proposals Phase20:', e.message);
  }

  try {
    const expCols = await query('PRAGMA table_info(evolution_experiments)');
    const expNames = expCols.map(c => c.name);
    if (!expNames.includes('baseline_metrics_json')) await run('ALTER TABLE evolution_experiments ADD COLUMN baseline_metrics_json TEXT');
    if (!expNames.includes('candidate_metrics_json')) await run('ALTER TABLE evolution_experiments ADD COLUMN candidate_metrics_json TEXT');
    if (!expNames.includes('regression_detected')) await run('ALTER TABLE evolution_experiments ADD COLUMN regression_detected INTEGER DEFAULT 0');
    if (!expNames.includes('provenance_hash')) await run('ALTER TABLE evolution_experiments ADD COLUMN provenance_hash TEXT');
  } catch (e) {
    console.warn('[DB Migration] evolution_experiments Phase20:', e.message);
  }

  try {
    const missionCols = await query('PRAGMA table_info(missions)');
    const mColNames = missionCols.map(c => c.name);
    if (!mColNames.includes('workflow_metadata')) {
      await run('ALTER TABLE missions ADD COLUMN workflow_metadata TEXT');
    }
  } catch (e) {
    console.warn('[DB Migration] workflow_metadata:', e.message);
  }

  console.log('[NOVA Database] SQLite database initialized and synced at:', dbPath);
};

export default { query, get, run, initDatabase };
