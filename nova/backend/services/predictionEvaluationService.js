/**
 * JARVIS OS 2.0 — PHASE 9: PREDICTION EVALUATION ENGINE (P6)
 * Measures forecast accuracy, calibration (Brier Score), false-positive rates,
 * lead times, acceptance metrics, and prediction drift.
 * NON-NEGOTIABLE: Stores predictions before outcomes occur to prevent retrospective manipulation.
 */

import { query, run, get } from '../database/db.js';

export class PredictionEvaluationService {
  constructor(options = {}) {
    this.minObservationsForConfidence = options.minObservationsForConfidence || 5;
    this.driftThreshold = options.driftThreshold || 0.20; // 20% accuracy drop indicates drift
  }

  /**
   * Persists a prediction BEFORE the outcome occurs.
   */
  async storePrediction(data) {
    const id = data.id || `pred-${Date.now()}`;
    await run(
      `INSERT INTO stored_predictions 
        (id, prediction_type, target_id, predicted_outcome, confidence, risk_probability, expected_window_start, expected_window_end, status, evidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, datetime('now'))`,
      [
        id,
        data.prediction_type || 'GENERAL',
        data.target_id || data.target_entity_id || null,
        typeof data.predicted_outcome === 'object' ? JSON.stringify(data.predicted_outcome) : (data.predicted_outcome || ''),
        data.confidence || 0.8,
        data.risk_probability || data.predicted_probability || null,
        data.expected_window_start || null,
        data.expected_window_end || null,
        typeof data.evidence === 'object' ? JSON.stringify(data.evidence) : (data.evidence || null)
      ]
    );
    return { id, status: 'PENDING' };
  }

  /**
   * Records the ground truth outcome for a previously stored prediction.
   * @param {string} predictionId
   * @param {Object} actualOutcome
   * @param {boolean} wasAccurate
   */
  async recordOutcome(predictionId, actualOutcome, wasAccurate) {
    const existing = await get("SELECT * FROM stored_predictions WHERE id = ?", [predictionId]);
    if (!existing) {
      throw new Error(`Prediction '${predictionId}' not found in stored predictions.`);
    }

    const now = new Date();
    const createdDate = new Date(existing.created_at);
    const leadTimeSeconds = Math.max(0, Math.round((now - createdDate) / 1000));
    const status = wasAccurate ? 'CONFIRMED' : 'REFUTED';

    await run(
      `UPDATE stored_predictions SET
        actual_outcome = ?,
        was_accurate = ?,
        status = ?,
        lead_time_seconds = ?,
        evaluated_at = datetime('now')
       WHERE id = ?`,
      [
        JSON.stringify(actualOutcome || {}),
        wasAccurate ? 1 : 0,
        status,
        leadTimeSeconds,
        predictionId
      ]
    );

    return {
      prediction_id: predictionId,
      status,
      was_accurate: wasAccurate,
      lead_time_seconds: leadTimeSeconds
    };
  }

  /**
   * Computes empirical evaluation metrics across all resolved predictions.
   */
  async calculateMetrics() {
    const resolved = await query(
      "SELECT * FROM stored_predictions WHERE evaluated_at IS NOT NULL"
    );

    if (resolved.length === 0) {
      return {
        has_sufficient_data: false,
        total_evaluations: 0,
        message: 'No resolved predictions available for empirical evaluation.'
      };
    }

    const total = resolved.length;
    const accurate = resolved.filter(r => r.was_accurate === 1).length;
    const accuracy = accurate / total;

    // Brier Score calculation: Mean Squared Error of probabilistic forecasts
    // BS = (1/N) * sum((prob - actual)^2), where actual is 1 or 0
    let brierSum = 0.0;
    let totalLeadTime = 0;
    let falsePositives = 0;
    let falseNegatives = 0;

    for (const r of resolved) {
      const prob = r.risk_probability !== null ? r.risk_probability : r.confidence;
      const actual = r.was_accurate === 1 ? 1.0 : 0.0;
      brierSum += Math.pow(prob - actual, 2);
      totalLeadTime += (r.lead_time_seconds || 0);

      // High probability predicted risk (>0.5), but outcome was not accurate/did not occur
      if (prob > 0.5 && r.was_accurate === 0) falsePositives++;
      // Low probability predicted risk (<=0.5), but failure occurred
      if (prob <= 0.5 && r.was_accurate === 0) falseNegatives++;
    }

    const brierScore = brierSum / total;
    const avgLeadTimeSeconds = total > 0 ? Math.round(totalLeadTime / total) : 0;

    // Recommendation Acceptance Rate
    const recs = await query("SELECT status FROM predictive_recommendations WHERE status IN ('ACCEPTED', 'REJECTED')");
    const acceptedCount = recs.filter(r => r.status === 'ACCEPTED').length;
    const totalDecisions = recs.length;
    const acceptanceRate = totalDecisions > 0 ? acceptedCount / totalDecisions : 1.0;

    // Evaluate drift
    const driftEvaluation = await this.detectPredictionDrift(resolved);

    return {
      has_sufficient_data: total >= this.minObservationsForConfidence,
      total_evaluations: total,
      accurate_predictions: accurate,
      prediction_accuracy: Number(accuracy.toFixed(3)),
      brier_score: Number(brierScore.toFixed(4)), // Lower is better (0.0 = perfect calibration)
      calibration_quality: brierScore < 0.20 ? 'EXCELLENT' : brierScore < 0.35 ? 'GOOD' : 'POOR',
      average_lead_time_seconds: avgLeadTimeSeconds,
      false_positive_count: falsePositives,
      false_negative_count: falseNegatives,
      false_positive_rate: Number((falsePositives / total).toFixed(3)),
      recommendation_acceptance_rate: Number(acceptanceRate.toFixed(3)),
      drift_evaluation: driftEvaluation
    };
  }

  /**
   * Compares recent prediction accuracy against baseline to detect drift.
   */
  async detectPredictionDrift(resolvedList = null) {
    const list = resolvedList || (await query("SELECT * FROM stored_predictions WHERE evaluated_at IS NOT NULL ORDER BY evaluated_at ASC"));

    if (list.length < 6) {
      return {
        drift_detected: false,
        confidence: 'LOW',
        reason: 'Insufficient observation window to evaluate drift (minimum 6 required).'
      };
    }

    const midpoint = Math.floor(list.length / 2);
    const baselineSet = list.slice(0, midpoint);
    const recentSet = list.slice(midpoint);

    const baselineAccuracy = baselineSet.filter(r => r.was_accurate === 1).length / baselineSet.length;
    const recentAccuracy = recentSet.filter(r => r.was_accurate === 1).length / recentSet.length;
    const drop = baselineAccuracy - recentAccuracy;

    const isDrifting = drop >= this.driftThreshold;

    return {
      drift_detected: isDrifting,
      baseline_accuracy: Number(baselineAccuracy.toFixed(3)),
      recent_accuracy: Number(recentAccuracy.toFixed(3)),
      accuracy_drop: Number(drop.toFixed(3)),
      drift_magnitude: Number(drop.toFixed(3)),
      threshold: this.driftThreshold,
      assessment: isDrifting
        ? 'ALERT: Significant prediction accuracy decay detected. Recommend retraining priors or recalibrating weights.'
        : 'STABLE: Predictive accuracy trajectory is calibrated within acceptable variance tolerances.'
    };
  }
}

let instance = null;
export function initPredictionEvaluation(options) {
  instance = new PredictionEvaluationService(options);
  return instance;
}
export function getPredictionEvaluation() {
  if (!instance) instance = new PredictionEvaluationService();
  return instance;
}
export default PredictionEvaluationService;
