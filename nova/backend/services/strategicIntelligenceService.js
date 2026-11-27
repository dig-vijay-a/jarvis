import { query, run, get } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import { DigitalTwinService } from './digitalTwinService.js';
import { KnowledgeGraphService } from './knowledgeGraphService.js';

export class StrategicIntelligenceService {
  constructor(options = {}) {
    this.digitalTwin = options.digitalTwin || new DigitalTwinService();
    this.knowledgeGraph = options.knowledgeGraph || new KnowledgeGraphService();
    this.activeStrategicRuns = new Map(); // Tracks running strategic executions for cancellation
  }

  /**
   * Interprets and structures a complex or ambiguous strategic objective.
   * Reuses Digital Twin and Knowledge Graph to contextualize goals and constraints.
   * INVARIANT: Never invents user objectives or silently converts inferred facts into confirmed instructions.
   */
  async interpretObjective(rawInput, options = {}) {
    if (!rawInput || typeof rawInput !== 'string' || !rawInput.trim()) {
      throw new Error('rawInput string is required to interpret strategic objective.');
    }

    const cleanInput = rawInput.trim();
    const objectiveId = options.id || `strat-obj-${uuidv4().substring(0, 8)}`;
    const nowIso = new Date().toISOString();

    // 1. Contextualize with Digital Twin (Confirmed Preferences & Constraints only)
    let twinProfile = null;
    try {
      twinProfile = await this.digitalTwin.getFullTwinProfile();
    } catch (_) {}

    const userConstraints = [];
    const userPriorities = [];

    if (twinProfile) {
      if (Array.isArray(twinProfile.constraints)) {
        for (const c of twinProfile.constraints) {
          // Strictly respect confirmation state
          if (c.is_confirmed) {
            userConstraints.push(c.value || c.title);
          }
        }
      }
      if (Array.isArray(twinProfile.priorities)) {
        for (const p of twinProfile.priorities) {
          if (p.is_confirmed) {
            userPriorities.push(p.value || p.title);
          }
        }
      }
    }

    // 2. Identify missing information / ambiguity in raw input
    const missingInfo = [];
    const hasDeadline = /\b(by|until|within|deadline|schedule|date|\d+\s*(days|weeks|months|hours))\b/i.test(cleanInput);
    const hasBudget = /\b(budget|cost|resource limit|cpu|memory|\$)\b/i.test(cleanInput);
    const hasEnvironment = /\b(staging|production|prod|dev|localhost|cluster|cloud)\b/i.test(cleanInput);

    if (!hasDeadline) {
      missingInfo.push('Exact target deadline / timeline timeframe unspecified');
    }
    if (!hasBudget) {
      missingInfo.push('Resource expenditure limits and target environment bounds unspecified');
    }
    if (!hasEnvironment) {
      missingInfo.push('Target runtime environment and host topology unspecified');
    }

    const isAmbiguous = cleanInput.length < 25 || missingInfo.length >= 2;

    // 3. Formulate structured objective representation
    const title = options.title || cleanInput.split('\n')[0].substring(0, 100);

    const intendedOutcomes = options.intended_outcomes || [
      `Accomplish core intent: "${title}"`,
      'Achieve verifiable outcome matching user constraints'
    ];

    const constraints = options.constraints || [
      ...userConstraints,
      'Preserve production file integrity',
      'Require human approval for destructive operations'
    ];

    // Detect contradictory user constraints (e.g. "execute fully offline" vs "scrape live web")
    const lowerInput = cleanInput.toLowerCase();
    if (lowerInput.includes('offline') && (lowerInput.includes('web') || lowerInput.includes('scrape') || lowerInput.includes('download'))) {
      throw new Error('CONTRADICTORY_CONSTRAINTS: Directive specifies conflicting requirements (offline execution vs. external web access).');
    }

    const assumptions = options.assumptions || [
      'Required tools and local runtime resources are operational',
      'Standard security policies and approval gates are maintained'
    ];

    const dependencies = options.dependencies || [
      'host_system_access',
      'sqlite_database_persistence'
    ];

    const successCriteria = options.success_criteria || [
      'All constituent initiatives completed with verified deliverable artifacts',
      'Zero unhandled errors or unverified side effects'
    ];

    const risks = options.risks || [
      { risk: 'Resource constraint exhaustion', severity: 'MEDIUM', mitigation: 'Apply proactive resource forecast' },
      { risk: 'Uncertain dependency availability', severity: 'LOW', mitigation: 'Execute pre-flight dependency check' }
    ];

    const evidence = options.evidence || [
      { source: 'user_directive', timestamp: nowIso, content: cleanInput }
    ];

    // Confidence: capped if ambiguous or information is missing
    const confidence = isAmbiguous ? 0.65 : (options.confidence || 0.88);

    await run(
      `INSERT INTO strategic_objectives
        (id, title, raw_input, intended_outcomes, constraints, assumptions, dependencies, success_criteria, risks, confidence, evidence, status, progress, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ANALYZED', 0.0, ?, ?)`,
      [
        objectiveId,
        title,
        cleanInput,
        JSON.stringify(intendedOutcomes),
        JSON.stringify(constraints),
        JSON.stringify(assumptions),
        JSON.stringify(dependencies),
        JSON.stringify(successCriteria),
        JSON.stringify(risks),
        confidence,
        JSON.stringify(evidence),
        nowIso,
        nowIso
      ]
    );

    // 4. Decompose objective into Strategic Initiatives
    const initiativeAId = `init-${uuidv4().substring(0, 8)}`;
    const initiativeBId = `init-${uuidv4().substring(0, 8)}`;

    const initiatives = [
      {
        id: initiativeAId,
        objective_id: objectiveId,
        title: `Phase 1: Environment & Dependency Discovery for "${title}"`,
        description: 'Investigate prerequisites, active dependencies, and baseline parameters.',
        priority: 'HIGH',
        status: 'PLANNED',
        measurable_outcomes: ['Prerequisites mapped', 'Risk assessment validated'],
        created_at: nowIso,
        updated_at: nowIso
      },
      {
        id: initiativeBId,
        objective_id: objectiveId,
        title: `Phase 2: Execution & Verification for "${title}"`,
        description: 'Deploy coordinated agent missions and conduct truthful post-condition verification.',
        priority: 'MEDIUM',
        status: 'PLANNED',
        measurable_outcomes: ['Deliverables verified', 'Outcomes confirmed'],
        created_at: nowIso,
        updated_at: nowIso
      }
    ];

    for (const init of initiatives) {
      await run(
        `INSERT INTO strategic_initiatives
          (id, objective_id, title, description, priority, status, measurable_outcomes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          init.id,
          init.objective_id,
          init.title,
          init.description,
          init.priority,
          init.status,
          JSON.stringify(init.measurable_outcomes),
          init.created_at,
          init.updated_at
        ]
      );
    }

    return {
      id: objectiveId,
      title,
      raw_input: cleanInput,
      intended_outcomes: intendedOutcomes,
      constraints,
      assumptions,
      dependencies,
      success_criteria: successCriteria,
      risks,
      confidence,
      evidence,
      missing_information: missingInfo,
      status: 'ANALYZED',
      progress: 0.0,
      initiatives,
      created_at: nowIso,
      updated_at: nowIso
    };
  }

  /**
   * Retrieves single objective by ID with its initiatives.
   */
  async getObjective(objectiveId) {
    const row = await get('SELECT * FROM strategic_objectives WHERE id = ?', [objectiveId]);
    if (!row) return null;

    const initiatives = await query('SELECT * FROM strategic_initiatives WHERE objective_id = ? ORDER BY created_at ASC', [objectiveId]);

    return {
      ...row,
      intended_outcomes: JSON.parse(row.intended_outcomes || '[]'),
      constraints: JSON.parse(row.constraints || '[]'),
      assumptions: JSON.parse(row.assumptions || '[]'),
      dependencies: JSON.parse(row.dependencies || '[]'),
      success_criteria: JSON.parse(row.success_criteria || '[]'),
      risks: JSON.parse(row.risks || '[]'),
      evidence: JSON.parse(row.evidence || '[]'),
      initiatives: initiatives.map(init => ({
        ...init,
        allocated_resources: JSON.parse(init.allocated_resources || '{}'),
        measurable_outcomes: JSON.parse(init.measurable_outcomes || '[]')
      }))
    };
  }

  /**
   * Lists objectives with optional status filter.
   */
  async listObjectives(status = null) {
    let rows;
    if (status) {
      rows = await query('SELECT * FROM strategic_objectives WHERE status = ? ORDER BY created_at DESC', [status]);
    } else {
      rows = await query('SELECT * FROM strategic_objectives ORDER BY created_at DESC');
    }

    return rows.map(row => ({
      ...row,
      intended_outcomes: JSON.parse(row.intended_outcomes || '[]'),
      constraints: JSON.parse(row.constraints || '[]'),
      assumptions: JSON.parse(row.assumptions || '[]'),
      dependencies: JSON.parse(row.dependencies || '[]'),
      success_criteria: JSON.parse(row.success_criteria || '[]'),
      risks: JSON.parse(row.risks || '[]'),
      evidence: JSON.parse(row.evidence || '[]')
    }));
  }

  /**
   * Updates objective progress and status.
   */
  async updateObjectiveProgress(objectiveId, progress, status = null) {
    const existing = await get('SELECT * FROM strategic_objectives WHERE id = ?', [objectiveId]);
    if (!existing) throw new Error(`Objective ${objectiveId} not found.`);

    const nowIso = new Date().toISOString();
    const newStatus = status || existing.status;
    const completedAt = (progress >= 1.0 || newStatus === 'ACHIEVED') ? nowIso : existing.completed_at;

    await run(
      'UPDATE strategic_objectives SET progress = ?, status = ?, completed_at = ?, updated_at = ? WHERE id = ?',
      [progress, newStatus, completedAt, nowIso, objectiveId]
    );

    return { id: objectiveId, progress, status: newStatus, completed_at: completedAt, updated_at: nowIso };
  }

  /**
   * Detects conflicting strategic objectives (e.g. competing deadlines or contradictory non-goals).
   */
  async detectConflictingObjectives() {
    const objectives = await this.listObjectives();
    const active = objectives.filter(o => o.status === 'ANALYZED' || o.status === 'IN_PROGRESS');
    const conflicts = [];

    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const objA = active[i];
        const objB = active[j];

        // Check if constraints or assumptions are directly opposed
        const constraintsA = objA.constraints || [];
        const constraintsB = objB.constraints || [];

        const hasConflict = constraintsA.some(cA => 
          constraintsB.some(cB => 
            (cA.toLowerCase().includes('exclusive') && cB.toLowerCase().includes(objA.title.toLowerCase())) ||
            (cA.toLowerCase().includes('zero network') && cB.toLowerCase().includes('cloud'))
          )
        );

        if (hasConflict) {
          conflicts.push({
            objective_a: { id: objA.id, title: objA.title },
            objective_b: { id: objB.id, title: objB.title },
            reason: 'MUTUALLY_EXCLUSIVE_CONSTRAINTS',
            severity: 'HIGH'
          });
        }
      }
    }

    return {
      conflicts_count: conflicts.length,
      conflicts
    };
  }

  /**
   * Evaluates an action against Strategic Autonomy Governance (P9).
   * High-impact or irreversible actions strictly require human approval.
   */
  evaluateAutonomyGovernance(actionType, actionPayload = {}) {
    const highImpactActions = [
      'financial_transaction',
      'external_communication',
      'destructive_file_op',
      'production_code_deploy',
      'permission_escalation',
      'sensitive_data_sharing'
    ];

    if (highImpactActions.includes(actionType)) {
      return {
        permitted_autonomously: false,
        requires_human_approval: true,
        action_type: actionType,
        reason: `MANDATORY_HUMAN_GATE: Action '${actionType}' carries high-impact or irreversible consequences.`
      };
    }

    return {
      permitted_autonomously: true,
      requires_human_approval: false,
      action_type: actionType
    };
  }

  /**
   * Initiates a strategic execution trackable for cancellation.
   */
  startStrategicExecution(objectiveId) {
    const runState = { objective_id: objectiveId, status: 'RUNNING', cancelled: false, started_at: Date.now() };
    this.activeStrategicRuns.set(objectiveId, runState);
    return runState;
  }

  /**
   * Cancels an active strategic execution upon user request.
   */
  cancelStrategicExecution(objectiveId, reason = 'Cancelled by user directive') {
    const runState = this.activeStrategicRuns.get(objectiveId);
    if (runState) {
      runState.cancelled = true;
      runState.status = 'CANCELLED';
      runState.cancel_reason = reason;
      runState.cancelled_at = Date.now();
    }
    return { cancelled: true, objective_id: objectiveId, reason };
  }
}

let instance = null;
export function getStrategicIntelligenceService() {
  if (!instance) {
    instance = new StrategicIntelligenceService();
  }
  return instance;
}

export default StrategicIntelligenceService;
