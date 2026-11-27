/**
 * JARVIS OS 2.0 — PHASE 9: UNIFIED PREDICTIVE INTELLIGENCE COORDINATOR (P7)
 * Central orchestrator connecting Pattern, Goal Risk, Resource Forecast, Opportunity,
 * Recommendation, Learning, and Evaluation engines.
 * NON-NEGOTIABLE: Does not create a second mission execution engine.
 * Routes actionable recommendations through the canonical approval and DAG pipeline.
 */

import { initPatternIntelligence, getPatternIntelligence } from './patternIntelligenceService.js';
import { initGoalRiskPrediction, getGoalRiskPrediction } from './goalRiskPredictionService.js';
import { initResourceForecast, getResourceForecast } from './resourceForecastService.js';
import { initOpportunityDetection, getOpportunityDetection } from './opportunityDetectionService.js';
import { initPredictiveRecommendation, getPredictiveRecommendation } from './predictiveRecommendationService.js';
import { initRecommendationLearning, getRecommendationLearning } from './recommendationLearningService.js';
import { initPredictionEvaluation, getPredictionEvaluation } from './predictionEvaluationService.js';

import { getMissionControl } from './missionControlService.js';
import { getEnvironmentalPerception } from './environmentalPerceptionService.js';
import { getGoalManagement } from './goalManagementService.js';

export class PredictiveIntelligenceCoordinator {
  constructor(io = null, options = {}) {
    this.io = io;
    this.options = options;

    // Sub-engines
    this.patterns = initPatternIntelligence(options);
    this.goalRisks = initGoalRiskPrediction(options);
    this.resources = initResourceForecast(options);
    this.opportunities = initOpportunityDetection(options);
    this.recommendations = initPredictiveRecommendation(options);
    this.learning = initRecommendationLearning(options);
    this.evaluations = initPredictionEvaluation(options);

    this.isCycleRunning = false;
  }

  /**
   * Broadcasts an event via Socket.IO if available.
   */
  broadcast(eventType, payload) {
    if (this.io) {
      this.io.emit('predictive_event', {
        type: eventType,
        timestamp: new Date().toISOString(),
        payload
      });
    }
  }

  /**
   * Executes a full predictive intelligence cycle across all sub-engines:
   * 1. Capture hardware telemetry snapshot.
   * 2. Mine operational patterns.
   * 3. Evaluate goal risk rankings.
   * 4. Forecast resource trajectories.
   * 5. Detect proactive opportunities.
   * 6. Generate and deduplicate actionable recommendations.
   */
  async runPredictiveCycle() {
    if (this.isCycleRunning) return { status: 'ALREADY_RUNNING' };
    this.isCycleRunning = true;

    try {
      console.log('[PredictiveIntelligence] Starting predictive intelligence cycle...');

      // Step 1: Telemetry snapshot
      const telemetrySnapshot = await this.resources.captureResourceSnapshot();

      // Step 2: Pattern mining
      const discoveredPatterns = await this.patterns.analyzeExecutionPatterns();

      // Step 3: Goal risks
      const goalRisks = await this.goalRisks.evaluateAllGoalRisks();

      // Step 4: Resource forecasts
      const resourceForecast = await this.resources.forecastResourceTrends();

      // Step 5: Opportunity detection
      const rawOpportunities = await this.opportunities.detectOpportunities();

      // Step 6: Process recommendations with learning weights
      const newRecommendations = await this.recommendations.processOpportunities(rawOpportunities);

      const summary = {
        timestamp: new Date().toISOString(),
        patternsDiscovered: discoveredPatterns.length,
        goalsEvaluated: goalRisks.length,
        criticalRisks: goalRisks.filter(r => r.risk_level === 'CRITICAL' || r.risk_level === 'HIGH').length,
        resourceRisk: resourceForecast.overall_resource_risk,
        opportunitiesFound: rawOpportunities.length,
        recommendationsGenerated: newRecommendations.length
      };

      this.broadcast('PREDICTIVE_CYCLE_COMPLETE', summary);
      console.log(`[PredictiveIntelligence] Cycle complete: ${discoveredPatterns.length} patterns, ${goalRisks.length} goals, ${newRecommendations.length} recommendations.`);

      return {
        summary,
        patterns: discoveredPatterns,
        goalRisks,
        resourceForecast,
        recommendations: newRecommendations
      };
    } catch (err) {
      console.error('[PredictiveIntelligence] Cycle error:', err.message);
      return { status: 'ERROR', error: err.message };
    } finally {
      this.isCycleRunning = false;
    }
  }

  /**
   * Intercepts pre-execution checks from MissionControlService to assess risk.
   */
  async assessStepRisk(step) {
    const patterns = await this.patterns.getPatterns({ pattern_type: 'REPEATED_FAILURE' });
    const matchingFailure = patterns.find(p => p.trigger_signature === step.tool);

    if (matchingFailure) {
      return {
        has_risk: true,
        risk_type: 'KNOWN_FAILURE_CLUSTER',
        tool: step.tool,
        confidence: matchingFailure.confidence,
        warning: `Tool '${step.tool}' has a historical failure pattern (${matchingFailure.observation_count} failures observed). Consider verifying parameters or dependencies.`
      };
    }

    return { has_risk: false };
  }

  /**
   * Aggregates live predictive intelligence telemetry for the Operations Dashboard.
   */
  async getDashboardPredictiveData() {
    const patterns = await this.patterns.getPatterns({ min_confidence: 0.6 });
    const goalRisks = await this.goalRisks.evaluateAllGoalRisks();
    const resourceForecast = await this.resources.forecastResourceTrends();
    const pendingRecs = await this.recommendations.getRecommendations({ status: 'PENDING' });
    const acceptedRecs = await this.recommendations.getRecommendations({ status: 'ACCEPTED' });
    const rejectedRecs = await this.recommendations.getRecommendations({ status: 'REJECTED' });
    const evaluationMetrics = await this.evaluations.calculateMetrics();
    const learningWeights = await this.learning.getLearningWeights();

    return {
      active_patterns: patterns.slice(0, 10),
      goal_risk_rankings: goalRisks.sort((a, b) => b.risk_probability - a.risk_probability),
      resource_forecast: resourceForecast,
      recommendations: {
        pending: pendingRecs,
        accepted_count: acceptedRecs.length,
        rejected_count: rejectedRecs.length
      },
      evaluation_metrics: evaluationMetrics,
      learning_weights: learningWeights
    };
  }

  /**
   * Phase 17: Produces a unified personal prediction summary with explicit evidence,
   * uncertainty intervals, confidence bounds, calibration score, and preventive actions.
   */
  async generatePersonalIntelligenceForecast() {
    const telemetrySnapshot = await this.resources.captureResourceSnapshot();
    const patterns = await this.patterns.analyzeExecutionPatterns();
    const goalRisks = await this.goalRisks.evaluateAllGoalRisks();
    const resourceForecast = await this.resources.forecastResourceTrends();
    const opportunities = await this.opportunities.detectOpportunities();
    const evalMetrics = await this.evaluations.calculateMetrics();

    const formattedPredictions = [];

    for (const gr of goalRisks) {
      formattedPredictions.push({
        prediction_id: gr.prediction_id,
        category: 'PROJECT_DELAY_RISK',
        target: gr.goal_title,
        probability: gr.risk_probability,
        risk_level: gr.risk_level,
        confidence: gr.confidence,
        uncertainty: gr.confidence_interval,
        evidence: gr.supporting_evidence,
        preventive_actions: gr.recommended_preventive_actions,
        statement: gr.probabilistic_statement
      });
    }

    const rRisk = Number(resourceForecast?.overall_resource_risk ?? 0.15);
    formattedPredictions.push({
      category: 'RESOURCE_CONSTRAINT',
      target: 'host_system_resources',
      probability: rRisk,
      confidence: 0.85,
      uncertainty: { lower_bound: Number(Math.max(0.01, rRisk - 0.1).toFixed(3)), upper_bound: Number(Math.min(0.99, rRisk + 0.1).toFixed(3)) },
      evidence: { telemetrySnapshot, cpu: resourceForecast?.cpu_analysis, disk: resourceForecast?.disk_forecast, queue: resourceForecast?.queue_analysis },
      preventive_actions: resourceForecast?.recommended_preventive_actions || ['Continue standard resource monitoring']
    });

    return {
      generated_at: new Date().toISOString(),
      epistemic_notice: 'FORECAST_PROBABILISTIC_NOT_FACT',
      behavioral_patterns: patterns,
      automation_opportunities: opportunities,
      predictions: formattedPredictions,
      calibration_metrics: evalMetrics,
      upcoming_workload: {
        active_missions: telemetrySnapshot.active_missions,
        pending_queue: telemetrySnapshot.pending_queue,
        high_risk_goals: goalRisks.filter(g => g.risk_probability >= 0.6).length
      }
    };
  }
}

let instance = null;
export function initPredictiveIntelligence(io, options) {
  instance = new PredictiveIntelligenceCoordinator(io, options);
  return instance;
}
export function getPredictiveIntelligence() {
  if (!instance) instance = new PredictiveIntelligenceCoordinator();
  return instance;
}
export default PredictiveIntelligenceCoordinator;
