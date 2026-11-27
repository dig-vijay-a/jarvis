/**
 * JARVIS OS 2.0 — PHASE 9: OPPORTUNITY DETECTION ENGINE (P3)
 * Discovers automation candidates from manual user repetitions,
 * identifies uncompleted recurring issues, finds mission consolidation opportunities,
 * and surfaces high-value capabilities relevant to active goals.
 */

import { query, run, get } from '../database/db.js';
import ToolRegistry from '../tools/registry.js';

export class OpportunityDetectionService {
  constructor(options = {}) {
    this.minRepetitionThreshold = options.minRepetitionThreshold || 3;
  }

  /**
   * Scans system activity, pending missions, and active goals for proactive opportunities.
   */
  async detectOpportunities() {
    const automations = await this.detectManualAutomationOpportunities();
    const consolidations = await this.detectMissionConsolidations();
    const unresolvedIssues = await this.detectUnresolvedRecurringProblems();
    const capabilityMatches = await this.detectUnusedCapabilityOpportunities();

    return [...automations, ...consolidations, ...unresolvedIssues, ...capabilityMatches];
  }

  /**
   * Identifies repeated manual user workflows suitable for automation into scheduled cron tasks.
   */
  async detectManualAutomationOpportunities() {
    // Inspect activity logs for repeated explicit user actions
    const repeatedActions = await query(
      "SELECT action, details, COUNT(*) as count FROM activity_logs WHERE category = 'user' GROUP BY action, details HAVING count >= ?",
      [this.minRepetitionThreshold]
    );

    const opportunities = [];
    for (const r of repeatedActions) {
      opportunities.push({
        type: 'AUTOMATION',
        title: `Automate Workflow: ${r.action}`,
        description: `User manually triggered '${r.action}' ${r.count} times. Packaging this into an autonomous background task will reduce repetitive manual effort.`,
        expected_impact: 'MEDIUM',
        time_horizon: 'SHORT_TERM',
        risk_classification: 'SAFE',
        confidence: Math.min(0.95, (r.count / (r.count + 2))),
        triggering_evidence: {
          action: r.action,
          occurrences: r.count,
          sample_details: r.details
        },
        suggested_action: {
          type: 'CREATE_AUTOMATION',
          action: r.action,
          suggested_cron: '0 9 * * 1-5' // Mon-Fri 9AM default
        }
      });
    }

    // Also check repeated mission objectives
    const repeatedMissions = await query(
      "SELECT objective, COUNT(*) as count FROM missions GROUP BY objective HAVING count >= ?",
      [this.minRepetitionThreshold]
    );

    for (const m of repeatedMissions) {
      opportunities.push({
        type: 'AUTOMATION',
        title: `Recurring Mission Automation: "${m.objective.substring(0, 40)}..."`,
        description: `This mission has been initiated ${m.count} times. Converting it to a proactive scheduled job would eliminate manual re-invocation.`,
        expected_impact: 'HIGH',
        time_horizon: 'SHORT_TERM',
        risk_classification: 'SAFE',
        confidence: Math.min(0.92, m.count / (m.count + 1)),
        triggering_evidence: {
          objective: m.objective,
          execution_count: m.count
        },
        suggested_action: {
          type: 'SCHEDULE_RECURRING_MISSION',
          objective: m.objective
        }
      });
    }

    return opportunities;
  }

  /**
   * Identifies opportunities to consolidate overlapping missions targeting identical directories or tools.
   */
  async detectMissionConsolidations() {
    const pendingMissions = await query(
      "SELECT m.id, m.objective, s.tool, s.args FROM missions m JOIN mission_steps s ON m.id = s.mission_id WHERE m.status = 'PENDING' AND s.tool IN ('search_files', 'read_file', 'conduct_deep_research')"
    );

    const targetMap = {};
    for (const p of pendingMissions) {
      let argsObj = {};
      try {
        argsObj = typeof p.args === 'string' ? JSON.parse(p.args) : (p.args || {});
      } catch (_) {}
      const target = argsObj.file_path || argsObj.directory || argsObj.query || 'general';
      const key = `${p.tool}:${target}`;
      if (!targetMap[key]) targetMap[key] = [];
      targetMap[key].push(p);
    }

    const consolidations = [];
    for (const [key, list] of Object.entries(targetMap)) {
      if (list.length >= 2) {
        const [tool, target] = key.split(':');
        consolidations.push({
          type: 'CONSOLIDATION',
          title: `Consolidate ${list.length} Missions Targeting '${target}'`,
          description: `Multiple queued missions (${list.map(l => l.id).join(', ')}) perform redundant '${tool}' operations on the same target. Consolidating them into a unified DAG eliminates duplicate I/O.`,
          expected_impact: 'MEDIUM',
          time_horizon: 'IMMEDIATE',
          risk_classification: 'SAFE',
          confidence: 0.88,
          triggering_evidence: {
            tool,
            target,
            redundant_mission_ids: list.map(l => l.id)
          },
          suggested_action: {
            type: 'CONSOLIDATE_MISSIONS',
            primary_mission_id: list[0].id,
            subsumed_mission_ids: list.slice(1).map(l => l.id)
          }
        });
      }
    }

    return consolidations;
  }

  /**
   * Identifies unresolved recurring problems requiring intervention.
   */
  async detectUnresolvedRecurringProblems() {
    const failedSteps = await query(
      "SELECT tool, error as last_error, COUNT(*) as count FROM mission_steps WHERE status = 'FAILED' GROUP BY tool, error HAVING count >= 2"
    );

    return failedSteps.map(f => ({
      type: 'PREVENTIVE_FIX',
      title: `Unresolved Failure: Tool '${f.tool}'`,
      description: `Tool '${f.tool}' has failed ${f.count} times with error: "${f.last_error}". Recommend adding defensive validation or tool substitution.`,
      expected_impact: 'HIGH',
      time_horizon: 'IMMEDIATE',
      risk_classification: 'REQUIRES_REVIEW',
      confidence: Math.min(0.95, f.count / (f.count + 1)),
      triggering_evidence: {
        tool: f.tool,
        error_pattern: f.last_error,
        failure_count: f.count
      },
      suggested_action: {
        type: 'TOOL_SUBSTITUTION_RULE',
        faulty_tool: f.tool,
        remedy: 'Verify arguments and dependencies before execution'
      }
    }));
  }

  /**
   * Detects unused registered capabilities that match active autonomous goals.
   */
  async detectUnusedCapabilityOpportunities() {
    const activeGoals = await query(
      "SELECT id, title, description, category FROM autonomous_goals WHERE status IN ('ACTIVE', 'IN_PROGRESS')"
    );
    const allTools = ToolRegistry.getAllTools ? ToolRegistry.getAllTools() : [];

    const capabilityOpportunities = [];
    for (const g of activeGoals) {
      const text = `${g.title} ${g.description || ''}`.toLowerCase();
      
      // Match tools
      for (const t of allTools) {
        if (text.includes(t.name) || (t.description && text.includes(t.name.split('_')[0]))) {
          // Check if this tool has been dispatched for this goal
          const dispatched = await get(
            "SELECT COUNT(*) as count FROM mission_steps s JOIN missions m ON s.mission_id = m.id WHERE m.goal_id = ? AND s.tool = ?",
            [g.id, t.name]
          );

          if (!dispatched || dispatched.count === 0) {
            capabilityOpportunities.push({
              type: 'CAPABILITY_ACTIVATION',
              title: `Deploy Unused Tool '${t.name}' for Goal "${g.title.substring(0, 30)}"`,
              description: `Tool '${t.name}' is registered and available in JARVIS OS, directly matching the goal requirements, but has not yet been utilized.`,
              expected_impact: 'MEDIUM',
              time_horizon: 'SHORT_TERM',
              risk_classification: 'SAFE',
              confidence: 0.78,
              triggering_evidence: {
                goal_id: g.id,
                goal_title: g.title,
                available_tool: t.name
              },
              suggested_action: {
                type: 'INTEGRATE_TOOL_INTO_GOAL',
                goal_id: g.id,
                tool: t.name
              }
            });
          }
        }
      }
    }

    return capabilityOpportunities;
  }
}

let instance = null;
export function initOpportunityDetection(options) {
  instance = new OpportunityDetectionService(options);
  return instance;
}
export function getOpportunityDetection() {
  if (!instance) instance = new OpportunityDetectionService();
  return instance;
}
export default OpportunityDetectionService;
