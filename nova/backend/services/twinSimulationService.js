/**
 * JARVIS OS 2.0 — PHASE 10: DIGITAL TWIN SIMULATION SERVICE (P4)
 * Evaluates hypothetical what-if scenarios in a strictly isolated, read-only manner.
 * Models:
 * - Deadline shifts (e.g. accelerating a deliverable)
 * - Mission delays (e.g. +2 days ripple impact)
 * - Resource / Tool unavailability (graph dependency impact analysis)
 * - Timeline and resource contention between overlapping commitments
 * - Postponing active commitments
 * 
 * NON-NEGOTIABLE GUARANTEES:
 * 1. Strictly read-only: does NOT modify real missions, goals, or twin database state.
 * 2. Clearly distinguishes simulated outcomes from actual confirmed facts.
 */

import { v4 as uuidv4 } from 'uuid';
import { query, run, get } from '../database/db.js';
import KnowledgeGraphService from './knowledgeGraphService.js';
import DigitalTwinService from './digitalTwinService.js';

export class TwinSimulationService {
  /**
   * Simulates advancing or delaying a project or goal deadline.
   */
  async simulateDeadlineChange({ target_id, target_title = '', days_offset = -2 }) {
    // 1. Fetch real target goal or project (Read-Only)
    let target = null;
    if (target_id) {
      target = await get("SELECT * FROM autonomous_goals WHERE id = ?", [target_id]);
      if (!target) {
        target = await get("SELECT * FROM digital_twin_profiles WHERE id = ?", [target_id]);
      }
    }
    if (!target && target_title) {
      target = await get("SELECT * FROM autonomous_goals WHERE LOWER(title) LIKE LOWER(?)", [`%${target_title}%`]);
      if (!target) {
        target = await get("SELECT * FROM digital_twin_profiles WHERE LOWER(title) LIKE LOWER(?)", [`%${target_title}%`]);
      }
    }

    const currentDeadlineStr = target?.deadline || new Date(Date.now() + 5 * 86400000).toISOString();
    const currentDeadlineMs = new Date(currentDeadlineStr).getTime();
    const simulatedDeadlineMs = currentDeadlineMs + (days_offset * 86400000);
    const simulatedDeadlineStr = new Date(simulatedDeadlineMs).toISOString();

    const hoursAvailableNow = (simulatedDeadlineMs - Date.now()) / 3600000;
    const isUrgent = hoursAvailableNow < 48;
    const isOverdue = hoursAvailableNow < 0;

    // 2. Discover downstream dependent goals / tasks via Knowledge Graph (Read-Only)
    let downstreamImpact = [];
    if (target?.id) {
      try {
        downstreamImpact = await KnowledgeGraphService.getDownstreamImpact(`ent-${target.id}`);
      } catch (_) {}
    }

    // 3. Detect conflicting commitments within the simulated window
    const otherGoals = await query(
      "SELECT id, title, deadline, priority FROM autonomous_goals WHERE id != ? AND deadline IS NOT NULL AND status IN ('ACTIVE', 'IN_PROGRESS')",
      [target?.id || 'none']
    );

    const conflictingCommitments = [];
    for (const og of otherGoals) {
      const ogMs = new Date(og.deadline).getTime();
      const diffHours = Math.abs(ogMs - simulatedDeadlineMs) / 3600000;
      if (diffHours <= 24) {
        conflictingCommitments.push({
          id: og.id,
          title: og.title,
          priority: og.priority,
          deadline: og.deadline,
          hours_apart: Math.round(diffHours * 10) / 10
        });
      }
    }

    const simulationResult = {
      simulation_id: `sim-${uuidv4().substring(0, 8)}`,
      scenario_type: 'DEADLINE_SHIFT',
      target: {
        id: target?.id || target_id,
        title: target?.title || target_title,
        original_deadline: currentDeadlineStr,
        simulated_deadline: simulatedDeadlineStr,
        days_offset
      },
      simulated_impact: {
        shift_days: days_offset,
        hours_remaining_simulated: Math.round(hoursAvailableNow * 10) / 10,
        urgency_level: isOverdue ? 'CRITICAL_OVERDUE' : (isUrgent ? 'HIGH_PRESSURE' : 'MANAGEABLE'),
        velocity_multiplier_required: days_offset < 0 ? Number((currentDeadlineMs / (simulatedDeadlineMs || 1)).toFixed(2)) : 1.0,
        downstream_affected_count: downstreamImpact.length,
        downstream_entities: downstreamImpact,
        conflicting_commitments_count: conflictingCommitments.length,
        conflicting_commitments: conflictingCommitments
      },
      recommended_mitigations: isUrgent
        ? [
            'Spawn parallel worker subagents for high-latency tasks',
            'Postpone low-priority concurrent goals',
            'Pre-approve high-impact steps to avoid gateway idle time'
          ]
        : ['Trajectory remains feasible under standard execution allocation'],
      is_simulation: true,
      is_read_only: true,
      simulated_at: new Date().toISOString(),
      disclaimer: 'READ-ONLY HYPOTHETICAL SIMULATION — Does not modify real mission schedules or database records.'
    };

    // Audit log simulation run (Read-only simulation output storage)
    await this.persistSimulationRecord(simulationResult);
    return simulationResult;
  }

  /**
   * Simulates the ripple effects of a specific resource or tool becoming unavailable.
   */
  async simulateResourceUnavailability({ resource_name, tool_name = null }) {
    const resName = resource_name || tool_name || 'external_service';

    // 1. Query Knowledge Graph for entities requiring this resource (Read-Only)
    const affectedEntities = [];
    try {
      const ent = await get("SELECT * FROM graph_entities WHERE LOWER(name) LIKE LOWER(?)", [`%${resName}%`]);
      if (ent) {
        const downstream = await KnowledgeGraphService.getDownstreamImpact(ent.id, 4);
        affectedEntities.push(...downstream);
      }
    } catch (_) {}

    // 2. Query pending and active missions relying on this tool/resource (Read-Only)
    const dependentSteps = await query(
      `SELECT s.id as step_id, s.title as step_title, s.tool, m.id as mission_id, m.objective, m.status 
       FROM mission_steps s 
       JOIN missions m ON s.mission_id = m.id 
       WHERE s.status IN ('PENDING', 'RUNNING', 'WAITING_FOR_APPROVAL') 
         AND (LOWER(s.tool) LIKE LOWER(?) OR LOWER(s.args) LIKE LOWER(?))`,
      [`%${resName}%`, `%${resName}%`]
    );

    // 3. Determine affected goals linked to these missions
    const affectedGoalIds = new Set();
    for (const step of dependentSteps) {
      const g = await get("SELECT id FROM autonomous_goals WHERE linked_mission_id = ?", [step.mission_id]);
      if (g) affectedGoalIds.add(g.id);
    }

    const simulationResult = {
      simulation_id: `sim-${uuidv4().substring(0, 8)}`,
      scenario_type: 'RESOURCE_UNAVAILABILITY',
      resource_simulated: resName,
      simulated_impact: {
        affected_mission_steps_count: dependentSteps.length,
        affected_steps: dependentSteps.map(s => ({ step_id: s.step_id, title: s.step_title, mission: s.objective, tool: s.tool })),
        affected_goals_count: affectedGoalIds.size,
        affected_goal_ids: Array.from(affectedGoalIds),
        graph_entities_affected: affectedEntities.length
      },
      recommended_mitigations: dependentSteps.length > 0
        ? [
            `Switch tool registry fallback routing away from '${resName}'`,
            'Decompose affected mission steps into local alternatives',
            'Notify user of third-party service dependency blockage'
          ]
        : ['No active missions or goals directly depend on this resource'],
      is_simulation: true,
      is_read_only: true,
      simulated_at: new Date().toISOString(),
      disclaimer: 'READ-ONLY HYPOTHETICAL SIMULATION — Real tools and missions remain active.'
    };

    await this.persistSimulationRecord(simulationResult);
    return simulationResult;
  }

  /**
   * Detects timeline and resource contention across all active projects and goals.
   */
  async detectTimelineConflicts() {
    const activeGoals = await query(
      "SELECT id, title, category, priority, deadline FROM autonomous_goals WHERE status IN ('ACTIVE', 'IN_PROGRESS') AND deadline IS NOT NULL ORDER BY deadline ASC"
    );

    const conflicts = [];
    for (let i = 0; i < activeGoals.length; i++) {
      for (let j = i + 1; j < activeGoals.length; j++) {
        const g1 = activeGoals[i];
        const g2 = activeGoals[j];

        const d1 = new Date(g1.deadline).getTime();
        const d2 = new Date(g2.deadline).getTime();
        const diffHours = Math.abs(d1 - d2) / 3600000;

        // Flags overlapping delivery windows within 18 hours
        if (diffHours <= 18) {
          conflicts.push({
            goal_a: { id: g1.id, title: g1.title, deadline: g1.deadline, priority: g1.priority },
            goal_b: { id: g2.id, title: g2.title, deadline: g2.deadline, priority: g2.priority },
            hours_between: Math.round(diffHours * 10) / 10,
            conflict_severity: (g1.priority >= 3 && g2.priority >= 3) ? 'HIGH' : 'MEDIUM',
            recommendation: g1.priority >= g2.priority
              ? `Prioritize '${g1.title}'; stagger '${g2.title}' by +24 hours.`
              : `Prioritize '${g2.title}'; stagger '${g1.title}' by +24 hours.`
          });
        }
      }
    }

    const simulationResult = {
      simulation_id: `sim-${uuidv4().substring(0, 8)}`,
      scenario_type: 'TIMELINE_CONTENTION_AUDIT',
      active_goals_analyzed: activeGoals.length,
      conflicts_detected_count: conflicts.length,
      conflicts,
      is_simulation: true,
      is_read_only: true,
      simulated_at: new Date().toISOString(),
      disclaimer: 'READ-ONLY CONFLICT AUDIT — Real schedules remain untouched.'
    };

    await this.persistSimulationRecord(simulationResult);
    return simulationResult;
  }

  /**
   * Persists a simulation log into twin_simulations table for audit without altering production entities.
   */
  async persistSimulationRecord(sim) {
    try {
      await run(
        `INSERT INTO twin_simulations 
          (id, scenario_type, title, parameters, simulated_outcomes, affected_goals, affected_projects, affected_resources, conflicts_detected, recommendations, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sim.simulation_id,
          sim.scenario_type,
          `Simulation: ${sim.scenario_type}`,
          JSON.stringify(sim.target || sim.resource_simulated || {}),
          JSON.stringify(sim.simulated_impact || {}),
          JSON.stringify(sim.simulated_impact?.affected_goal_ids || []),
          JSON.stringify(sim.simulated_impact?.conflicting_commitments || []),
          JSON.stringify(sim.resource_simulated ? [sim.resource_simulated] : []),
          JSON.stringify(sim.conflicts || []),
          JSON.stringify(sim.recommended_mitigations || []),
          sim.simulated_at
        ]
      );
    } catch (_) {}
  }

  /**
   * Phase 13: Evaluates counterfactual scenario simulations (Best, Expected, Worst case).
   * INVARIANT 21: Strictly read-only; never mutates actual missions, goals, or user files.
   * INVARIANT 22: Distinctly tags all projections as SIMULATED.
   */
  async simulateStrategicScenarios({
    objective_id = null,
    scenario_name,
    simulation_type = 'WHAT_IF',
    parameters = {}
  }) {
    if (!scenario_name) {
      throw new Error('scenario_name is required for strategic scenario simulation.');
    }

    const simId = `scen-${uuidv4().substring(0, 8)}`;
    const nowIso = new Date().toISOString();

    // 1. Gather baseline entities (Read-Only)
    let objective = null;
    if (objective_id) {
      objective = await get('SELECT * FROM strategic_objectives WHERE id = ?', [objective_id]);
    }

    // 2. Compute Counterfactual Cases (Strictly Read-Only Projections)
    const resourceStrain = parameters.resource_strain || 1.0;
    const deadlineShiftDays = parameters.deadline_shift_days || 0;
    const failureProbability = parameters.simulated_failure_rate || 0.15;

    const bestCase = {
      label: 'BEST_CASE_OPTIMISTIC',
      completion_probability: Math.min(0.99, parseFloat((0.90 + (0.05 / resourceStrain)).toFixed(2))),
      estimated_duration_hours: Math.max(1, Math.round(24 * resourceStrain * 0.7)),
      projected_cost: parameters.budget ? parameters.budget * 0.8 : 'Nominal',
      bottlenecks: [],
      is_simulated: true
    };

    const expectedCase = {
      label: 'EXPECTED_CASE_REALISTIC',
      completion_probability: parseFloat((0.85 - (failureProbability * 0.5)).toFixed(2)),
      estimated_duration_hours: Math.round(24 * resourceStrain),
      projected_cost: parameters.budget ? parameters.budget * 1.0 : 'Expected baseline',
      bottlenecks: resourceStrain > 1.2 ? ['Potential resource throttling under sustained load'] : [],
      is_simulated: true
    };

    const worstCase = {
      label: 'WORST_CASE_ADVERSARIAL',
      completion_probability: parseFloat((0.55 - failureProbability).toFixed(2)),
      estimated_duration_hours: Math.round(24 * resourceStrain * 2.2),
      projected_cost: parameters.budget ? parameters.budget * 1.5 : 'Elevated retry cost',
      bottlenecks: [
        'Cascading step dependency stall',
        'Transient external API throttling or failure timeout'
      ],
      is_simulated: true
    };

    // 3. Persist Scenario Record (Read-Only Guarantee Preserved: zero mutation of actual missions/goals)
    await run(
      `INSERT INTO strategic_scenario_simulations
        (id, objective_id, scenario_name, simulation_type, scenario_parameters, best_case, expected_case, worst_case, is_read_only, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        simId,
        objective_id,
        scenario_name,
        simulation_type,
        JSON.stringify(parameters),
        JSON.stringify(bestCase),
        JSON.stringify(expectedCase),
        JSON.stringify(worstCase),
        nowIso
      ]
    );

    return {
      simulation_id: simId,
      objective_id,
      scenario_name,
      simulation_type,
      parameters,
      best_case: bestCase,
      expected_case: expectedCase,
      worst_case: worstCase,
      is_read_only: true,
      is_simulated: true,
      created_at: nowIso
    };
  }
}

let instance = null;
export function initTwinSimulation(options) {
  instance = new TwinSimulationService(options);
  return instance;
}
export function getTwinSimulation() {
  if (!instance) instance = new TwinSimulationService();
  return instance;
}
export default TwinSimulationService;
