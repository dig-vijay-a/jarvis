import { query, run, get } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';

export class EvolutionMetricsService {
  constructor() {
    this.minSampleSizeForSignificance = 3;
  }

  /**
   * Evaluates post-deployment performance metrics against pre-deployment baseline.
   * NON-NEGOTIABLE RULE: Do not claim improvement without measurable evidence.
   */
  async recordMetricEvaluation({
    skill_id_or_system = 'system_core',
    metric_name,
    pre_evolution_value,
    post_evolution_value,
    sample_size = 1,
    evidence_notes = ''
  }) {
    if (!metric_name || pre_evolution_value === undefined || post_evolution_value === undefined) {
      throw new Error('metric_name, pre_evolution_value, and post_evolution_value are required.');
    }

    const delta = parseFloat((post_evolution_value - pre_evolution_value).toFixed(3));

    // Statistical significance criteria:
    // Requires minimum sample size and measurable non-zero gain
    let isStatisticallySignificant = false;

    // For metrics where higher is better (e.g., success_rate, user_acceptance)
    if (metric_name.includes('success_rate') || metric_name.includes('acceptance') || metric_name.includes('reliability')) {
      isStatisticallySignificant = delta > 0.05 && sample_size >= this.minSampleSizeForSignificance;
    }
    // For metrics where lower is better (e.g., latency, failure_rate, retries, memory_consumption)
    else if (metric_name.includes('latency') || metric_name.includes('failure') || metric_name.includes('retry') || metric_name.includes('error')) {
      isStatisticallySignificant = delta < -0.05 && sample_size >= this.minSampleSizeForSignificance;
    }

    const id = `metric-${uuidv4().substring(0, 8)}`;
    const nowIso = new Date().toISOString();

    await run(
      `INSERT INTO evolution_metrics_tracking
        (id, skill_id_or_system, metric_name, pre_evolution_value, post_evolution_value, delta, sample_size, is_statistically_significant, evidence_notes, measured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        skill_id_or_system,
        metric_name,
        pre_evolution_value,
        post_evolution_value,
        delta,
        sample_size,
        isStatisticallySignificant ? 1 : 0,
        evidence_notes,
        nowIso
      ]
    );

    return {
      id,
      skill_id_or_system,
      metric_name,
      pre_evolution_value,
      post_evolution_value,
      delta,
      sample_size,
      is_statistically_significant: isStatisticallySignificant,
      is_genuine_improvement: isStatisticallySignificant,
      measured_at: nowIso
    };
  }

  /**
   * Validates whether a claimed improvement is genuinely supported by measured data.
   * Rejects false claims (Invariant 24).
   */
  async verifyClaimedImprovement(metricName, claimedPre, claimedPost, sampleSize) {
    if (sampleSize < this.minSampleSizeForSignificance) {
      return {
        valid: false,
        reason: `INSUFFICIENT_SAMPLE_SIZE: Measured across only ${sampleSize} samples (minimum required: ${this.minSampleSizeForSignificance}).`
      };
    }

    const delta = claimedPost - claimedPre;

    // Check if delta actually represents an improvement
    let isImproved = false;
    if (metricName.includes('success') || metricName.includes('reliability')) {
      isImproved = delta > 0;
    } else {
      isImproved = delta < 0;
    }

    if (!isImproved) {
      return {
        valid: false,
        reason: `FALSE_IMPROVEMENT_CLAIM: Measured delta (${delta}) shows no positive improvement for '${metricName}'.`
      };
    }

    return {
      valid: true,
      metric_name: metricName,
      delta,
      sample_size: sampleSize
    };
  }

  /**
   * Retrieves aggregated evolution performance metrics summary.
   */
  async getMetricsSummary() {
    const rows = await query('SELECT * FROM evolution_metrics_tracking ORDER BY measured_at DESC LIMIT 50');
    return rows.map(r => ({
      ...r,
      is_statistically_significant: Boolean(r.is_statistically_significant)
    }));
  }
}

let instance = null;
export function getEvolutionMetricsService() {
  if (!instance) {
    instance = new EvolutionMetricsService();
  }
  return instance;
}

export default EvolutionMetricsService;
