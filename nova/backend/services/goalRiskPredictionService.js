/**
 * JARVIS OS 2.0 — PHASE 9: PREDICTIVE GOAL RISK ENGINE (P1)
 * Analyzes deadlines, dependency bottlenecks, historical duration variances,
 * and external friction to forecast goal risks and expected completion windows.
 * NON-NEGOTIABLE: Never represents a prediction as a confirmed fact.
 */

import { v4 as uuidv4 } from 'uuid';
import { query, run, get } from '../database/db.js';
import KnowledgeGraphService from './knowledgeGraphService.js';

export class GoalRiskPredictionService {
  constructor(options = {}) {
    this.highRiskThreshold = options.highRiskThreshold || 0.60;
    this.criticalRiskThreshold = options.criticalRiskThreshold || 0.85;
  }

  /**
   * Evaluates all active autonomous goals and returns risk forecasts.
   */
  async evaluateAllGoalRisks() {
    const goals = await query(
      "SELECT * FROM autonomous_goals WHERE status IN ('ACTIVE', 'IN_PROGRESS', 'PENDING')"
    );

    const forecasts = [];
    for (const g of goals) {
      const forecast = await this.predictGoalRisk(g.id);
      if (forecast) forecasts.push(forecast);
    }
    return forecasts;
  }

  /**
   * Forecasts the risk of delay, blockage, or failure for a specific goal.
   * @param {string} goalId
   */
  async predictGoalRisk(goalId) {
    const goal = await get("SELECT * FROM autonomous_goals WHERE id = ?", [goalId]);
    if (!goal) return null;

    const riskFactors = [];
    const evidence = {
      evaluated_at: new Date().toISOString(),
      goal_id: goalId,
      metrics: {}
    };

    let totalRiskScore = 0.0;
    let factorWeightSum = 0.0;

    // 1. Deadline Proximity vs Expected Duration
    if (goal.deadline) {
      const deadlineDate = new Date(goal.deadline);
      const now = new Date();
      const hoursRemaining = (deadlineDate - now) / (1000 * 60 * 60);

      // Estimate required duration from historical steps in this category
      const histSteps = await get(
        "SELECT AVG((strftime('%s', completed_at) - strftime('%s', started_at))) as avg_sec FROM mission_steps WHERE completed_at IS NOT NULL AND started_at IS NOT NULL"
      );
      // Ensure conservative realistic baseline: minimum 20 minutes per complex autonomous step
      const avgStepMinutes = Math.max(20, (histSteps?.avg_sec ? histSteps.avg_sec / 60 : 25));
      const estimatedRemainingSteps = Math.max(1, (100 - (goal.progress || 0)) / 25);
      const estimatedRequiredHours = (estimatedRemainingSteps * avgStepMinutes * 2.5) / 60; // realistic buffer

      evidence.metrics.hours_remaining = hoursRemaining;
      evidence.metrics.estimated_required_hours = estimatedRequiredHours;

      if (hoursRemaining <= 0) {
        totalRiskScore += 0.95 * 3.0;
        factorWeightSum += 3.0;
        riskFactors.push({
          type: 'DEADLINE_PASSED',
          severity: 'CRITICAL',
          description: `Goal deadline was scheduled for ${goal.deadline} and has expired without completion.`
        });
      } else if (hoursRemaining < estimatedRequiredHours) {
        const deadlinePressure = Math.min(0.95, (estimatedRequiredHours - hoursRemaining) / estimatedRequiredHours + 0.5);
        totalRiskScore += deadlinePressure * 4.0;
        factorWeightSum += 4.0;
        riskFactors.push({
          type: 'DEADLINE_PRESSURE',
          factor: 'DEADLINE_PRESSURE',
          severity: 'HIGH',
          description: `Estimated workload (${estimatedRequiredHours.toFixed(1)}h) exceeds remaining deadline window (${hoursRemaining.toFixed(1)}h).`
        });
      } else {
        factorWeightSum += 1.0;
      }
    }

    // 2. Dependency Bottlenecks in Linked Missions
    let linkedMissions = [];
    if (goal.linked_mission_id) {
      linkedMissions = await query("SELECT * FROM missions WHERE id = ?", [goal.linked_mission_id]);
    } else {
      linkedMissions = await query("SELECT * FROM missions WHERE goal_id = ?", [goalId]);
    }

    let blockedStepsCount = 0;
    let approvalPendingCount = 0;
    let failedStepsCount = 0;

    for (const m of linkedMissions) {
      const steps = await query("SELECT * FROM mission_steps WHERE mission_id = ?", [m.id]);
      blockedStepsCount += steps.filter(s => s.status === 'BLOCKED').length;
      approvalPendingCount += steps.filter(s => s.status === 'WAITING_FOR_APPROVAL').length;
      failedStepsCount += steps.filter(s => s.status === 'FAILED').length;
    }

    evidence.metrics.linked_missions = linkedMissions.length;
    evidence.metrics.blocked_steps = blockedStepsCount;
    evidence.metrics.pending_approvals = approvalPendingCount;
    evidence.metrics.failed_steps = failedStepsCount;

    if (blockedStepsCount > 0) {
      totalRiskScore += 0.85 * 2.0;
      factorWeightSum += 2.0;
      riskFactors.push({
        type: 'DEPENDENCY_BOTTLENECK',
        severity: 'HIGH',
        description: `Found ${blockedStepsCount} DAG mission step(s) blocked by unresolved dependencies.`
      });
    }

    // Check Knowledge Graph goal dependencies too (Phase 17 integration)
    try {
      const graphDeps = await KnowledgeGraphService.detectMissingDependencies(`ent-${goalId}`);
      if (graphDeps?.has_missing_dependencies && graphDeps.count > 0) {
        totalRiskScore += 0.88 * 3.5;
        factorWeightSum += 3.5;
        evidence.metrics.missing_graph_dependencies = graphDeps.count;
        riskFactors.push({
          type: 'MISSING_GOAL_PREREQUISITE',
          severity: 'HIGH',
          description: `Detected ${graphDeps.count} blocked/missing prerequisite dependency edge(s) for goal '${goal.title}'.`
        });
      }
    } catch (_) {}

    if (approvalPendingCount > 0) {
      totalRiskScore += 0.75 * 2.0;
      factorWeightSum += 2.0;
      riskFactors.push({
        type: 'APPROVAL_GATEWAY_IDLE',
        factor: 'APPROVAL_GATEWAY_IDLE',
        severity: 'HIGH',
        description: `Awaiting human approval on ${approvalPendingCount} sensitive execution step(s).`
      });
    }

    if (failedStepsCount > 0) {
      totalRiskScore += 0.85 * 2.0;
      factorWeightSum += 2.0;
      riskFactors.push({
        type: 'UNRESOLVED_STEP_FAILURE',
        factor: 'UNRESOLVED_STEP_FAILURE',
        severity: 'HIGH',
        description: `Encountered ${failedStepsCount} failed execution step(s) requiring replanning or intervention.`
      });
    }

    // 3. Historical Category Completion Rate
    const catMissions = await query(
      "SELECT status, COUNT(*) as count FROM missions GROUP BY status"
    );
    const completed = catMissions.find(c => c.status === 'COMPLETED')?.count || 0;
    const total = catMissions.reduce((acc, c) => acc + c.count, 0) || 1;
    const failureRate = 1.0 - (completed / total);

    totalRiskScore += failureRate * 1.0;
    factorWeightSum += 1.0;
    evidence.metrics.historical_failure_rate = failureRate;

    // Calculate normalized probabilistic risk
    const finalRiskProbability = factorWeightSum > 0
      ? Math.min(0.99, Math.max(0.05, totalRiskScore / factorWeightSum))
      : 0.15;

    // Determine estimated completion window
    const nowMs = Date.now();
    const baseDurationMs = 2 * 60 * 60 * 1000; // 2 hours base
    const multiplier = 1 + finalRiskProbability * 2.5;
    const windowStart = new Date(nowMs + baseDurationMs * 0.7).toISOString();
    const windowEnd = new Date(nowMs + baseDurationMs * multiplier).toISOString();

    // Preventive actions
    const preventiveActions = [];
    if (blockedStepsCount > 0) {
      preventiveActions.push('Execute dependency replanner or substitute fallback tools for blocked steps.');
    }
    if (approvalPendingCount > 0) {
      preventiveActions.push('Surface priority confirmation alert to user for idle approval gates.');
    }
    if (riskFactors.some(f => f.type === 'DEADLINE_PRESSURE')) {
      preventiveActions.push('Spawn parallel worker agents or decompose high-latency steps.');
    }
    if (preventiveActions.length === 0) {
      preventiveActions.push('Maintain active telemetry perception; current trajectory is on schedule.');
    }

    const predictionId = `pred-risk-${uuidv4()}`;
    const predictionPayload = {
      prediction_id: predictionId,
      goal_id: goalId,
      goal_title: goal.title,
      risk_probability: Number(finalRiskProbability.toFixed(3)),
      risk_level: finalRiskProbability >= this.criticalRiskThreshold
        ? 'CRITICAL'
        : finalRiskProbability >= this.highRiskThreshold
        ? 'HIGH'
        : finalRiskProbability >= 0.4
        ? 'MEDIUM'
        : 'LOW',
      confidence_interval: {
        lower_bound: Number(Math.max(0.01, finalRiskProbability - 0.08).toFixed(3)),
        upper_bound: Number(Math.min(0.99, finalRiskProbability + 0.08).toFixed(3))
      },
      // Explicit probabilistic phrasing, never represented as a confirmed fact
      probabilistic_statement: `Statistical forecast models indicate an estimated ${(finalRiskProbability * 100).toFixed(0)}% probability of delivery impediment based on observed dependency and velocity metrics.`,
      expected_completion_window: {
        window_start: windowStart,
        window_end: windowEnd
      },
      risk_factors: riskFactors,
      supporting_evidence: evidence,
      recommended_preventive_actions: preventiveActions,
      confidence: Number((0.65 + Math.min(0.3, factorWeightSum * 0.05)).toFixed(3))
    };

    // Store prediction before outcome occurs (P6 Compliance)
    await run(
      `INSERT INTO stored_predictions 
        (id, prediction_type, target_id, predicted_outcome, confidence, risk_probability, expected_window_start, expected_window_end, status, evidence, created_at)
       VALUES (?, 'GOAL_RISK', ?, ?, ?, ?, ?, ?, 'PENDING', ?, datetime('now'))`,
      [
        predictionId,
        goalId,
        JSON.stringify(predictionPayload),
        predictionPayload.confidence,
        predictionPayload.risk_probability,
        windowStart,
        windowEnd,
        JSON.stringify(evidence)
      ]
    );

    return predictionPayload;
  }
}

let instance = null;
export function initGoalRiskPrediction(options) {
  instance = new GoalRiskPredictionService(options);
  return instance;
}
export function getGoalRiskPrediction() {
  if (!instance) instance = new GoalRiskPredictionService();
  return instance;
}
export default GoalRiskPredictionService;
