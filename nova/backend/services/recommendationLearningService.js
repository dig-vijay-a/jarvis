/**
 * JARVIS OS 2.0 — PHASE 9: FEEDBACK LEARNING ENGINE (P5)
 * Dynamically adjusts category priors and confidence weights based on
 * user acceptance, rejection, and measured intervention efficacy.
 * NON-NEGOTIABLE: Never modifies security policies, permissions, or approval rules.
 */

import { query, run, get } from '../database/db.js';

export class RecommendationLearningService {
  constructor(options = {}) {
    this.acceptanceBoost = options.acceptanceBoost || 1.15;
    this.rejectionPenalty = options.rejectionPenalty || 0.80;
    this.maxMultiplier = options.maxMultiplier || 2.0;
    this.minMultiplier = options.minMultiplier || 0.25;
  }

  /**
   * Initializes default learning weights if table is empty.
   */
  async ensureInitialized() {
    const defaultCategories = ['AUTOMATION', 'CONSOLIDATION', 'PREVENTIVE_FIX', 'CAPABILITY_ACTIVATION', 'RESOURCE_OPTIMIZATION', 'GENERAL'];
    for (const cat of defaultCategories) {
      await run(
        "INSERT OR IGNORE INTO recommendation_learning_weights (category, acceptance_count, rejection_count, success_count, weight_multiplier, updated_at) VALUES (?, 0, 0, 0, 1.0, datetime('now'))",
        [cat]
      );
    }
  }

  /**
   * Records a user decision (ACCEPT or REJECT) and updates learning weights.
   */
  async recordDecision(category, decision) {
    await this.ensureInitialized();
    const cat = category || 'GENERAL';
    const row = await get("SELECT * FROM recommendation_learning_weights WHERE category = ?", [cat]);

    let weight = row ? row.weight_multiplier : 1.0;
    let acceptCount = row ? row.acceptance_count : 0;
    let rejectCount = row ? row.rejection_count : 0;

    if (decision === 'ACCEPT') {
      acceptCount++;
      weight = Math.min(this.maxMultiplier, weight * this.acceptanceBoost);
    } else if (decision === 'REJECT') {
      rejectCount++;
      weight = Math.max(this.minMultiplier, weight * this.rejectionPenalty);
    }

    await run(
      `INSERT INTO recommendation_learning_weights 
        (category, acceptance_count, rejection_count, success_count, weight_multiplier, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(category) DO UPDATE SET
        acceptance_count = excluded.acceptance_count,
        rejection_count = excluded.rejection_count,
        weight_multiplier = excluded.weight_multiplier,
        updated_at = excluded.updated_at`,
      [cat, acceptCount, rejectCount, row ? row.success_count : 0, Number(weight.toFixed(3))]
    );

    return {
      category: cat,
      decision,
      new_weight_multiplier: Number(weight.toFixed(3)),
      acceptance_count: acceptCount,
      rejection_count: rejectCount
    };
  }

  /**
   * Records a verified outcome for a preventive intervention.
   */
  async recordInterventionSuccess(category, wasSuccessful = true) {
    await this.ensureInitialized();
    const cat = category || 'GENERAL';
    const row = await get("SELECT * FROM recommendation_learning_weights WHERE category = ?", [cat]);

    let weight = row ? row.weight_multiplier : 1.0;
    let successCount = row ? row.success_count : 0;

    if (wasSuccessful) {
      successCount++;
      weight = Math.min(this.maxMultiplier, weight * 1.10);
    } else {
      weight = Math.max(this.minMultiplier, weight * 0.85);
    }

    await run(
      `UPDATE recommendation_learning_weights SET
        success_count = ?,
        weight_multiplier = ?,
        updated_at = datetime('now')
       WHERE category = ?`,
      [successCount, Number(weight.toFixed(3)), cat]
    );

    return { category: cat, successCount, weightMultiplier: Number(weight.toFixed(3)) };
  }

  /**
   * Applies the learned category multiplier to adjust recommendation confidence.
   */
  async adjustConfidence(category, baseConfidence) {
    await this.ensureInitialized();
    const cat = category || 'GENERAL';
    const row = await get("SELECT weight_multiplier FROM recommendation_learning_weights WHERE category = ?", [cat]);
    const multiplier = row ? row.weight_multiplier : 1.0;

    // Adjusted confidence = base * multiplier, bounded in [0.05, 0.99]
    const adjusted = Math.min(0.99, Math.max(0.05, baseConfidence * multiplier));
    return Number(adjusted.toFixed(3));
  }

  /**
   * Retrieves the current learned weight multiplier (prior) for a category.
   */
  async getCategoryPrior(category) {
    await this.ensureInitialized();
    const cat = category || 'GENERAL';
    const row = await get("SELECT weight_multiplier FROM recommendation_learning_weights WHERE category = ?", [cat]);
    return row ? row.weight_multiplier : 1.0;
  }

  /**
   * Retrieves all learned weights for dashboard and audit reporting.
   */
  async getLearningWeights() {
    await this.ensureInitialized();
    return await query("SELECT * FROM recommendation_learning_weights ORDER BY category ASC");
  }
}

let instance = null;
export function initRecommendationLearning(options) {
  instance = new RecommendationLearningService(options);
  return instance;
}
export function getRecommendationLearning() {
  if (!instance) instance = new RecommendationLearningService();
  return instance;
}
export default RecommendationLearningService;
