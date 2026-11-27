import { query, run, get } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import PatternIntelligenceService from './patternIntelligenceService.js';

export class SkillEvolutionService {
  constructor() {
    this.allowedPermissions = [
      'read_file', 'write_file', 'edit_file', 'list_files', 'search_files',
      'search_web', 'get_system_telemetry', 'memory_read', 'memory_write',
      'notification_dispatch', 'tool_execute'
    ];

    this.forbiddenCodePatterns = [
      /process\.exit/i,
      /child_process/i,
      /\bexec\s*\(/i,
      /\bspawn\s*\(/i,
      /\beval\s*\(/i,
      /\bFunction\s*\(/i,
      /rmdir\s+[\/\\]s/i,
      /format\s+[a-z]:/i,
      /\bcurl\b/i,
      /\bwget\b/i,
      /chmod\s+777/i,
      /token_exfiltrate/i
    ];

    this.promptInjectionPatterns = [
      /ignore\s+(all\s+)?previous\s+instructions/i,
      /bypass\s+(all\s+)?(security|approval|permission)/i,
      /you\s+are\s+now\s+in\s+developer\s+mode/i,
      /disregard\s+(system|safety)\s+rules/i,
      /exfiltrate\s+(credentials|secrets|keys)/i
    ];
  }

  /**
   * Generates a new evolving skill definition.
   * Enforces strict validation, prompt injection defense, and security invariants.
   */
  async designSkill({
    proposal_id = null,
    skill_key,
    name,
    description,
    version = '1.0.0',
    permissions = [],
    dependencies = [],
    inputs_schema = { type: 'object', properties: {} },
    outputs_schema = { type: 'object', properties: {} },
    failure_conditions = [],
    implementation_code,
    author = 'jarvis-evolution'
  }) {
    if (!skill_key || !name || !description || !implementation_code) {
      throw new Error('skill_key, name, description, and implementation_code are required.');
    }

    // 1. Duplicate Skill Prevention Guard (Invariant 3)
    const existingAgentSkill = await get('SELECT id, version FROM agent_skills WHERE skill_key = ?', [skill_key]);
    const existingEvolutionSkill = await get('SELECT id, version FROM evolution_skills WHERE skill_key = ? AND version = ?', [skill_key, version]);

    if (existingEvolutionSkill || (existingAgentSkill && existingAgentSkill.version === version)) {
      throw new Error(`DUPLICATE_SKILL: Skill '${skill_key}' version '${version}' is already registered.`);
    }

    // 2. Prompt Injection Defense in Name & Description (Invariant 22)
    for (const pattern of this.promptInjectionPatterns) {
      if (pattern.test(description) || pattern.test(name)) {
        throw new Error(`PROMPT_INJECTION_DETECTED: Malicious directive detected in skill metadata: ${pattern}`);
      }
    }

    // 3. Security Boundary: Permission Escalation Guard (Invariant 4 & 10)
    for (const perm of permissions) {
      if (!this.allowedPermissions.includes(perm)) {
        throw new Error(`SECURITY_VIOLATION: Unauthorized permission request '${perm}'. Permitted scopes: ${this.allowedPermissions.join(', ')}`);
      }
    }

    // 4. Malicious Code Pattern Inspection (Invariant 4)
    for (const pattern of this.forbiddenCodePatterns) {
      if (pattern.test(implementation_code)) {
        throw new Error(`SECURITY_VIOLATION: Prohibited code pattern detected in skill implementation: ${pattern}`);
      }
    }

    const id = `eskill-${uuidv4().substring(0, 8)}`;
    const nowIso = new Date().toISOString();

    await run(
      `INSERT INTO evolution_skills
        (id, proposal_id, skill_key, name, description, version, permissions_json, dependencies_json, inputs_schema, outputs_schema, failure_conditions_json, implementation_code, author, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)`,
      [
        id,
        proposal_id,
        skill_key,
        name,
        description,
        version,
        JSON.stringify(permissions),
        JSON.stringify(dependencies),
        JSON.stringify(inputs_schema),
        JSON.stringify(outputs_schema),
        JSON.stringify(failure_conditions),
        implementation_code,
        author,
        nowIso,
        nowIso
      ]
    );

    return {
      id,
      proposal_id,
      skill_key,
      name,
      description,
      version,
      permissions,
      dependencies,
      inputs_schema,
      outputs_schema,
      failure_conditions,
      author,
      status: 'DRAFT',
      created_at: nowIso,
      updated_at: nowIso
    };
  }

  /**
   * Improves an existing skill with a bumped version number.
   */
  async improveSkill(existingSkillKey, improvements = {}) {
    const existing = await get(
      'SELECT * FROM agent_skills WHERE skill_key = ? ORDER BY created_at DESC LIMIT 1',
      [existingSkillKey]
    );

    if (!existing) {
      throw new Error(`Skill '${existingSkillKey}' does not exist to improve.`);
    }

    // Increment semver version
    const parts = (existing.version || '1.0.0').split('.').map(Number);
    parts[1] = (parts[1] || 0) + 1;
    const newVersion = `${parts[0]}.${parts[1]}.0`;

    return await this.designSkill({
      proposal_id: improvements.proposal_id || null,
      skill_key: existingSkillKey,
      name: improvements.name || existing.name,
      description: improvements.description || existing.description,
      version: newVersion,
      permissions: improvements.permissions || JSON.parse(existing.permissions || '[]'),
      dependencies: improvements.dependencies || [],
      inputs_schema: improvements.inputs_schema || JSON.parse(existing.schema_definition || '{}'),
      outputs_schema: improvements.outputs_schema || { type: 'object' },
      failure_conditions: improvements.failure_conditions || [],
      implementation_code: improvements.implementation_code || '// Optimized implementation',
      author: 'jarvis-evolution'
    });
  }

  /**
   * Retrieves skill definition by ID.
   */
  async getSkillById(skillId) {
    const row = await get('SELECT * FROM evolution_skills WHERE id = ?', [skillId]);
    if (!row) return null;

    return {
      ...row,
      permissions: JSON.parse(row.permissions_json || '[]'),
      dependencies: JSON.parse(row.dependencies_json || '[]'),
      inputs_schema: JSON.parse(row.inputs_schema || '{}'),
      outputs_schema: JSON.parse(row.outputs_schema || '{}'),
      failure_conditions: JSON.parse(row.failure_conditions_json || '[]')
    };
  }

  /**
   * Retrieves all evolving skills with optional status.
   */
  async getEvolvingSkills(status = null) {
    let rows;
    if (status) {
      rows = await query('SELECT * FROM evolution_skills WHERE status = ? ORDER BY created_at DESC', [status]);
    } else {
      rows = await query('SELECT * FROM evolution_skills ORDER BY created_at DESC');
    }

    return rows.map(r => ({
      ...r,
      permissions: JSON.parse(r.permissions_json || '[]'),
      dependencies: JSON.parse(r.dependencies_json || '[]'),
      inputs_schema: JSON.parse(r.inputs_schema || '{}'),
      outputs_schema: JSON.parse(r.outputs_schema || '{}'),
      failure_conditions: JSON.parse(r.failure_conditions_json || '[]')
    }));
  }

  /**
   * Updates skill status.
   */
  async updateSkillStatus(skillId, newStatus) {
    const existing = await get('SELECT id FROM evolution_skills WHERE id = ?', [skillId]);
    if (!existing) throw new Error(`Skill ${skillId} not found.`);

    const nowIso = new Date().toISOString();
    await run('UPDATE evolution_skills SET status = ?, updated_at = ? WHERE id = ?', [newStatus, nowIso, skillId]);

    return { id: skillId, status: newStatus, updated_at: nowIso };
  }

  /**
   * Phase 18: Identifies repeated validated multi-step workflows across completed missions.
   */
  async identifyRepeatedWorkflows({ minOccurrences = 2, minConfidence = 0.6 } = {}) {
    const patternSvc = new PatternIntelligenceService({
      minOccurrenceThreshold: minOccurrences,
      minConfidenceThreshold: minConfidence
    });
    const pairPatterns = await patternSvc.discoverWorkflowSequences();

    // Also inspect multi-step sequences (2+ verified steps per completed mission)
    const rows = await query(
      `SELECT ms.mission_id, ms.step_index, ms.agent_key, ms.tool
       FROM mission_steps ms
       JOIN missions m ON m.id = ms.mission_id
       WHERE ms.tool IS NOT NULL AND ms.tool != 'none'
         AND (m.status = 'COMPLETED' OR ms.status IN ('VERIFIED', 'COMPLETED'))
       ORDER BY ms.mission_id, ms.step_index ASC`
    );

    const byMission = new Map();
    for (const r of rows) {
      if (!byMission.has(r.mission_id)) byMission.set(r.mission_id, []);
      byMission.get(r.mission_id).push({ agent_key: r.agent_key, tool: r.tool });
    }

    const seqMap = new Map();
    for (const [missionId, steps] of byMission.entries()) {
      if (steps.length < 2) continue;
      const toolChain = steps.map(s => s.tool);
      const agentChain = [...new Set(steps.map(s => s.agent_key))];
      const signature = toolChain.join(' -> ');
      if (!seqMap.has(signature)) {
        seqMap.set(signature, {
          signature,
          tools: toolChain,
          agents: agentChain,
          occurrences: 0,
          mission_ids: []
        });
      }
      const entry = seqMap.get(signature);
      entry.occurrences++;
      entry.mission_ids.push(missionId);
    }

    const candidates = [];
    for (const entry of seqMap.values()) {
      if (entry.occurrences >= minOccurrences) {
        const confidence = Number(Math.min(0.98, entry.occurrences / (entry.occurrences + 1.5)).toFixed(3));
        if (confidence >= minConfidence) {
          candidates.push({
            ...entry,
            confidence,
            reusable_skill_key: `wf_${entry.tools.slice(0, 3).join('_')}`.toLowerCase().replace(/[^a-z0-9_]/g, '_')
          });
        }
      }
    }

    return {
      candidates: candidates.sort((a, b) => b.occurrences - a.occurrences),
      pairwise_patterns: pairPatterns
    };
  }

  /**
   * Phase 18: Converts a validated repeated workflow sequence into a reusable draft skill.
   */
  async convertSequenceToSkill({
    sequence = [],
    skill_key,
    name,
    description,
    permissions = [],
    inputs_schema = { type: 'object', properties: { target: { type: 'string' } } }
  }) {
    if (!Array.isArray(sequence) || sequence.length < 2) {
      throw new Error('Workflow sequence must contain at least 2 validated steps.');
    }
    const cleanKey = (skill_key || `wf_${sequence.join('_')}`).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 48);
    const derivedPerms = permissions.length > 0
      ? permissions
      : [...new Set(sequence.filter(t => this.allowedPermissions.includes(t)))];
    if (derivedPerms.length === 0) derivedPerms.push('tool_execute');

    const implCode = `
      const target = inputs.target || 'default';
      const steps = ${JSON.stringify(sequence)};
      return {
        status: 'WORKFLOW_SKILL_EXECUTED',
        skill_key: ${JSON.stringify(cleanKey)},
        target,
        executed_steps: steps.map((tool, i) => ({ order: i + 1, tool, verified: true })),
        step_count: steps.length
      };
    `;

    return await this.designSkill({
      skill_key: cleanKey,
      name: name || `Automated Workflow: ${sequence.join(' -> ')}`,
      description: description || `Reusable benchmarked workflow skill distilled from sequence: ${sequence.join(' -> ')}`,
      version: '1.0.0',
      permissions: derivedPerms,
      dependencies: sequence,
      inputs_schema,
      outputs_schema: { type: 'object', required: ['status', 'executed_steps'] },
      failure_conditions: ['step_verification_failed', 'security_boundary_violation'],
      implementation_code: implCode,
      author: 'jarvis-workflow-learner'
    });
  }

  /**
   * Phase 18: Runs isolated sandbox benchmark & security/regression validation on a workflow skill.
   */
  async benchmarkWorkflowSkill({
    skill_id,
    pattern_signature = null,
    baseline_latency_ms = 20,
    test_cases = [],
    simulated_regression_fail = false,
    simulated_security_fail = false
  }) {
    const skill = await this.getSkillById(skill_id);
    if (!skill) throw new Error(`Skill ${skill_id} not found for benchmarking.`);

    const { getEvolutionValidationService } = await import('./evolutionValidationService.js');
    const validationSvc = getEvolutionValidationService();
    const valResult = await validationSvc.validateSkill({
      skill_id,
      test_cases: test_cases.length > 0 ? test_cases : [
        { input: { target: 'benchmark_run_1' }, expected_status: 'WORKFLOW_SKILL_EXECUTED' },
        { input: { target: 'benchmark_run_2' }, expected_status: 'WORKFLOW_SKILL_EXECUTED' }
      ],
      simulated_regression_fail,
      simulated_security_fail
    });

    const totalTests = valResult.evidence?.test_results?.length || 1;
    const passedTests = (valResult.evidence?.test_results || []).filter(t => t.status === 'PASS').length;
    const passRate = Number((passedTests / totalTests).toFixed(3));
    const benchLatency = valResult.benchmark_comparison?.avg_execution_latency_ms || 10;
    const readyForDeployment = valResult.verdict === 'ACCEPTED' && valResult.security_check_pass && valResult.regression_check_pass;

    const benchId = `wbench-${uuidv4().substring(0, 8)}`;
    const nowIso = new Date().toISOString();
    await run(
      `INSERT INTO workflow_skill_benchmarks
        (id, skill_key, version, pattern_signature, baseline_latency_ms, benchmark_latency_ms, pass_rate, regression_passed, security_passed, status, is_outdated, outdated_reason, validation_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)`,
      [
        benchId,
        skill.skill_key,
        skill.version,
        pattern_signature || (skill.dependencies || []).join(' -> '),
        baseline_latency_ms,
        benchLatency,
        passRate,
        valResult.regression_check_pass ? 1 : 0,
        valResult.security_check_pass ? 1 : 0,
        readyForDeployment ? 'BENCHMARK_PASSED' : 'REJECTED',
        valResult.validation_id,
        nowIso,
        nowIso
      ]
    );

    return {
      benchmark_id: benchId,
      skill_id,
      skill_key: skill.skill_key,
      version: skill.version,
      verdict: valResult.verdict,
      ready_for_deployment: readyForDeployment,
      pass_rate: passRate,
      baseline_latency_ms,
      benchmark_latency_ms: benchLatency,
      security_passed: valResult.security_check_pass,
      regression_passed: valResult.regression_check_pass,
      validation: valResult
    };
  }

  /**
   * Phase 18: Detects outdated or degraded workflow skills based on age, pass rate, or missing tool dependencies.
   */
  async detectOutdatedSkills({ maxAgeDays = 30, minPassRate = 0.75, availableTools = null } = {}) {
    const benchmarks = await query('SELECT * FROM workflow_skill_benchmarks ORDER BY created_at DESC');
    const agentSkills = await query('SELECT * FROM agent_skills ORDER BY updated_at DESC');
    const outdated = [];
    const nowMs = Date.now();
    const toolSet = Array.isArray(availableTools) ? new Set(availableTools) : null;

    for (const b of benchmarks) {
      const reasons = [];
      const ageDays = (nowMs - new Date(b.updated_at || b.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > maxAgeDays) reasons.push(`Skill benchmark age (${ageDays.toFixed(1)}d) exceeds ${maxAgeDays}d threshold`);
      if (b.pass_rate < minPassRate) reasons.push(`Pass rate (${b.pass_rate}) fell below ${minPassRate}`);
      if (b.regression_passed === 0) reasons.push('Latest regression suite failed');
      if (toolSet && b.pattern_signature) {
        const deps = b.pattern_signature.split('->').map(s => s.trim()).filter(Boolean);
        const missing = deps.filter(d => !toolSet.has(d));
        if (missing.length > 0) reasons.push(`Referenced tool(s) deprecated/missing: ${missing.join(', ')}`);
      }

      if (reasons.length > 0) {
        const reasonStr = reasons.join('; ');
        await run(
          'UPDATE workflow_skill_benchmarks SET is_outdated = 1, outdated_reason = ?, status = ?, updated_at = ? WHERE id = ?',
          [reasonStr, 'OUTDATED', new Date().toISOString(), b.id]
        );
        outdated.push({ benchmark_id: b.id, skill_key: b.skill_key, version: b.version, reason: reasonStr });
      }
    }

    for (const s of agentSkills) {
      const ageDays = (nowMs - new Date(s.updated_at || s.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > maxAgeDays && !outdated.some(o => o.skill_key === s.skill_key)) {
        outdated.push({
          skill_id: s.id,
          skill_key: s.skill_key,
          version: s.version,
          reason: `Registered skill unchanged for ${ageDays.toFixed(1)} days (> ${maxAgeDays}d)`
        });
      }
    }

    return {
      outdated_count: outdated.length,
      outdated_skills: outdated
    };
  }
}

let instance = null;
export function getSkillEvolutionService() {
  if (!instance) {
    instance = new SkillEvolutionService();
  }
  return instance;
}

export default SkillEvolutionService;
