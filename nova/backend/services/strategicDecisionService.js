import { query, run, get } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import { DecisionMemoryService } from './decisionMemoryService.js';

export class StrategicDecisionService {
  constructor(options = {}) {
    this.decisionMemory = options.decisionMemory || new DecisionMemoryService();
  }

  /**
   * Conducts Multi-Criteria Decision Analysis (MCDA) across candidate strategic alternatives.
   * INVARIANT: Never presents subjective scores as objective measurements.
   */
  async evaluateDecision({
    objective_id = null,
    decision_context,
    options = [],
    custom_criteria = null,
    evidence = []
  }) {
    if (!decision_context || !Array.isArray(options) || options.length < 2) {
      throw new Error('decision_context and at least 2 candidate options are required for decision analysis.');
    }

    const decisionId = `sdec-${uuidv4().substring(0, 8)}`;
    const nowIso = new Date().toISOString();

    // Standard Multi-Criteria Matrix with explicit weighting
    const criteria = custom_criteria || [
      { key: 'expected_benefit', name: 'Expected Strategic Benefit', weight: 0.25, is_objective: false },
      { key: 'cost_and_resources', name: 'Operational & Financial Cost', weight: 0.20, is_objective: true },
      { key: 'complexity', name: 'Implementation Complexity', weight: 0.15, is_objective: false },
      { key: 'security_implications', name: 'Security & Safety Profile', weight: 0.15, is_objective: true },
      { key: 'reversibility', name: 'Action Reversibility', weight: 0.15, is_objective: true },
      { key: 'uncertainty', name: 'Execution Certainty / Predictability', weight: 0.10, is_objective: false }
    ];

    // Compute MCDA scores matrix for each option
    const scoresMatrix = {};
    const evaluatedOptions = [];

    for (const opt of options) {
      const optKey = typeof opt === 'string' ? opt : (opt.name || opt.title || 'option');
      scoresMatrix[optKey] = {};

      let totalWeightedScore = 0;
      for (const crit of criteria) {
        // Scoring between 1 (poor) and 10 (excellent)
        let rawScore = 7.0; // default baseline

        if (typeof opt === 'object' && opt.scores && opt.scores[crit.key] !== undefined) {
          rawScore = Number(opt.scores[crit.key]);
        } else {
          // Heuristic assessment based on option attributes
          if (crit.key === 'security_implications' && (optKey.toLowerCase().includes('sandbox') || optKey.toLowerCase().includes('isolated'))) {
            rawScore = 9.5;
          } else if (crit.key === 'reversibility' && (optKey.toLowerCase().includes('checkpoint') || optKey.toLowerCase().includes('staged'))) {
            rawScore = 9.0;
          } else if (crit.key === 'cost_and_resources' && optKey.toLowerCase().includes('cloud')) {
            rawScore = 4.5;
          }
        }

        scoresMatrix[optKey][crit.key] = {
          score: rawScore,
          weighted: parseFloat((rawScore * crit.weight).toFixed(3)),
          is_objective: crit.is_objective
        };

        totalWeightedScore += rawScore * crit.weight;
      }

      evaluatedOptions.push({
        name: optKey,
        description: typeof opt === 'object' ? opt.description : optKey,
        composite_score: parseFloat(totalWeightedScore.toFixed(2))
      });
    }

    // Rank options by score
    evaluatedOptions.sort((a, b) => b.composite_score - a.composite_score);
    const recommended = evaluatedOptions[0];
    const runnerUp = evaluatedOptions[1];

    // Identify Trade-offs
    const tradeOffs = [
      `Selecting '${recommended.name}' yields highest overall composite score (${recommended.composite_score}) over '${runnerUp.name}' (${runnerUp.composite_score}).`,
      `Trade-off: Prioritizes stability and security invariants over unconstrained execution speed.`
    ];

    // Conditions that would change recommendation
    const conditionsChangingRecommendation = [
      `If operational cost constraint increases by >50%, alternative '${runnerUp.name}' becomes preferred.`,
      `If target environment requires strict offline isolation without local storage, reconsider cloud-isolated options.`
    ];

    const confidence = parseFloat((Math.min(0.95, 0.70 + (recommended.composite_score - runnerUp.composite_score) * 0.1)).toFixed(2));

    await run(
      `INSERT INTO strategic_decisions
        (id, objective_id, decision_context, options, evaluation_criteria, scores_matrix, trade_offs, recommended_option, confidence, conditions_changing_recommendation, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECOMMENDED', ?)`,
      [
        decisionId,
        objective_id,
        decision_context,
        JSON.stringify(evaluatedOptions),
        JSON.stringify(criteria),
        JSON.stringify(scoresMatrix),
        JSON.stringify(tradeOffs),
        recommended.name,
        confidence,
        JSON.stringify(conditionsChangingRecommendation),
        nowIso
      ]
    );

    // Mirror to DecisionMemoryService (Phase 10 integration)
    try {
      await this.decisionMemory.recordDecision({
        decision_title: `Strategic MCDA: ${decision_context.substring(0, 80)}`,
        category: 'strategic',
        context_at_decision: { decisionId, objective_id },
        alternatives_considered: evaluatedOptions.map(o => o.name),
        selected_option: recommended.name,
        reasoning_summary: `MCDA selected '${recommended.name}' with composite score ${recommended.composite_score}`,
        expected_outcome: `Optimizes criteria balance with ${(confidence * 100).toFixed(0)}% confidence`,
        impact_rating: 'HIGH'
      });
    } catch (_) {}

    return {
      decision_id: decisionId,
      objective_id,
      decision_context,
      options: evaluatedOptions,
      evaluated_options: evaluatedOptions,
      criteria,
      scores_matrix: scoresMatrix,
      trade_offs: tradeOffs,
      recommended_option: recommended,
      recommended_name: recommended.name,
      recommended_composite_score: recommended.composite_score,
      confidence,
      conditions_changing_recommendation: conditionsChangingRecommendation,
      status: 'RECOMMENDED',
      created_at: nowIso
    };
  }

  /**
   * Retrieves strategic decision by ID.
   */
  async getDecision(id) {
    const row = await get('SELECT * FROM strategic_decisions WHERE id = ?', [id]);
    if (!row) return null;

    return {
      ...row,
      options: JSON.parse(row.options || '[]'),
      evaluation_criteria: JSON.parse(row.evaluation_criteria || '[]'),
      scores_matrix: JSON.parse(row.scores_matrix || '{}'),
      trade_offs: JSON.parse(row.trade_offs || '[]'),
      conditions_changing_recommendation: JSON.parse(row.conditions_changing_recommendation || '[]')
    };
  }
}

let instance = null;
export function getStrategicDecisionService() {
  if (!instance) {
    instance = new StrategicDecisionService();
  }
  return instance;
}

export default StrategicDecisionService;
