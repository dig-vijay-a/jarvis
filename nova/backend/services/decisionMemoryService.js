/**
 * JARVIS OS 2.0 — PHASE 10: DECISION MEMORY SERVICE (P3)
 * Records and indexes architectural, operational, and contextual decisions made by the user and JARVIS.
 * Retains context-at-decision, alternatives considered, selection reasoning, expected vs actual outcomes,
 * and empirical lessons learned. Informs future recommendations without blindly repeating past choices.
 */

import { v4 as uuidv4 } from 'uuid';
import { query, run, get } from '../database/db.js';
import KnowledgeGraphService from './knowledgeGraphService.js';
import DigitalTwinService from './digitalTwinService.js';
import StrategicDecisionService from './strategicDecisionService.js';
import TwinSimulationService from './twinSimulationService.js';

export class DecisionMemoryService {
  /**
   * Records a new decision event with context, alternatives, and rationale.
   */
  async recordDecision({
    id = null,
    decision_title,
    category = 'general',
    context_at_decision = {},
    alternatives_considered = [],
    selected_option,
    reasoning_summary,
    expected_outcome = '',
    impact_rating = 'MEDIUM',
    related_goal_id = null,
    related_project_id = null
  }) {
    if (!decision_title || !selected_option || !reasoning_summary) {
      throw new Error('decision_title, selected_option, and reasoning_summary are required.');
    }

    const decisionId = id || `dec-${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();

    await run(
      `INSERT INTO decision_records 
        (id, decision_title, category, context_at_decision, alternatives_considered, selected_option, reasoning_summary, expected_outcome, impact_rating, related_goal_id, related_project_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        decisionId,
        decision_title.trim(),
        category.toLowerCase().trim(),
        typeof context_at_decision === 'object' ? JSON.stringify(context_at_decision) : (context_at_decision || ''),
        Array.isArray(alternatives_considered) ? JSON.stringify(alternatives_considered) : JSON.stringify([alternatives_considered]),
        typeof selected_option === 'object' ? JSON.stringify(selected_option) : String(selected_option),
        reasoning_summary.trim(),
        typeof expected_outcome === 'object' ? JSON.stringify(expected_outcome) : String(expected_outcome || ''),
        impact_rating.toUpperCase(),
        related_goal_id || null,
        related_project_id || null,
        now
      ]
    );

    // Link decision into Knowledge Graph if project or goal is specified
    try {
      const decisionEntity = await KnowledgeGraphService.upsertEntity({
        id: `ent-${decisionId}`,
        name: decision_title.trim(),
        entity_type: 'decision',
        source_type: 'user_explicit',
        confidence: 1.0,
        properties: {
          decision_id: decisionId,
          category,
          selected_option,
          impact: impact_rating
        }
      });

      if (related_project_id) {
        await KnowledgeGraphService.addRelationship({
          source_entity_id: decisionEntity.id,
          target_entity_id: related_project_id.startsWith('ent-') ? related_project_id : `ent-${related_project_id}`,
          relationship_type: 'DECISION_AFFECTS_PROJECT',
          weight: 1.0,
          source_type: 'user_explicit'
        });
      }
    } catch (_) {}

    return {
      id: decisionId,
      decision_title: decision_title.trim(),
      category,
      selected_option,
      reasoning_summary,
      expected_outcome,
      impact_rating,
      related_goal_id,
      related_project_id,
      created_at: now
    };
  }

  /**
   * Records the post-decision outcome, evaluating expected vs actual results and lessons learned.
   */
  async recordOutcome(id, { actual_outcome, lessons_learned, impact_rating = null }) {
    const existing = await get('SELECT * FROM decision_records WHERE id = ?', [id]);
    if (!existing) {
      throw new Error(`Decision record '${id}' not found.`);
    }

    const now = new Date().toISOString();
    const updatedOutcome = typeof actual_outcome === 'object' ? JSON.stringify(actual_outcome) : String(actual_outcome || '');
    const updatedLessons = typeof lessons_learned === 'object' ? JSON.stringify(lessons_learned) : String(lessons_learned || '');
    const updatedImpact = impact_rating ? impact_rating.toUpperCase() : existing.impact_rating;

    await run(
      `UPDATE decision_records 
       SET actual_outcome = ?, lessons_learned = ?, impact_rating = ?, evaluated_at = ?
       WHERE id = ?`,
      [updatedOutcome, updatedLessons, updatedImpact, now, id]
    );

    return {
      id,
      decision_title: existing.decision_title,
      expected_outcome: existing.expected_outcome,
      actual_outcome: updatedOutcome,
      lessons_learned: updatedLessons,
      impact_rating: updatedImpact,
      evaluated_at: now
    };
  }

  /**
   * Retrieves decision history with optional filtering.
   */
  async getDecisionHistory(filter = {}, limit = 25) {
    let sql = 'SELECT * FROM decision_records';
    const params = [];
    const conditions = [];

    if (filter.category) {
      conditions.push('category = ?');
      params.push(filter.category.toLowerCase());
    }
    if (filter.related_project_id) {
      conditions.push('related_project_id = ?');
      params.push(filter.related_project_id);
    }
    if (filter.related_goal_id) {
      conditions.push('related_goal_id = ?');
      params.push(filter.related_goal_id);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(Number(limit) || 25);

    const rows = await query(sql, params);
    return rows.map(r => ({
      ...r,
      context_at_decision: r.context_at_decision ? JSON.parse(r.context_at_decision) : null,
      alternatives_considered: r.alternatives_considered ? JSON.parse(r.alternatives_considered) : []
    }));
  }

  /**
   * Searches past decisions relevant to an upcoming question or plan.
   */
  async findRelevantDecisions(queryText, limit = 5) {
    if (!queryText) return [];
    const tokens = String(queryText).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 4);
    const allRows = await query('SELECT * FROM decision_records ORDER BY created_at DESC LIMIT 80');
    const qLow = queryText.toLowerCase().trim();

    const scored = allRows.map(r => {
      const hay = `${r.decision_title || ''} ${r.reasoning_summary || ''} ${r.lessons_learned || ''} ${r.selected_option || ''}`.toLowerCase();
      let score = hay.includes(qLow) ? 5 : 0;
      for (const t of tokens) {
        if (hay.includes(t)) score += 1;
      }
      return { row: r, score };
    }).filter(x => x.score > 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ row: r }) => ({
      ...r,
      context_at_decision: r.context_at_decision ? JSON.parse(r.context_at_decision) : null,
      alternatives_considered: r.alternatives_considered ? JSON.parse(r.alternatives_considered) : []
    }));
  }

  /**
   * Phase 17 Decision Intelligence: identifies alternatives, weighs constraints from Digital Twin,
   * recalls relevant historical lessons, simulates outcomes read-only, and records decision rationale.
   */
  async evaluateDecisionOptions({
    decision_title,
    category = 'strategic',
    alternatives = [],
    constraints = [],
    context = {},
    related_goal_id = null,
    related_project_id = null,
    simulate = true,
    persistDecision = true
  }) {
    if (!decision_title || !Array.isArray(alternatives) || alternatives.length < 2) {
      throw new Error('decision_title and at least 2 alternatives are required.');
    }

    const twinProfile = await DigitalTwinService.getFullTwinProfile({ is_enabled: true, excludePrivate: true });
    const twinConstraints = (twinProfile.constraints || []).filter(c => c.is_confirmed).map(c => c.content);
    const activeConstraints = [...new Set([...constraints, ...twinConstraints])];

    const pastRelevant = await this.findRelevantDecisions(decision_title, 5);
    const mcda = new StrategicDecisionService({ decisionMemory: this });
    const evaluated = await mcda.evaluateDecision({
      objective_id: related_goal_id,
      decision_context: `${decision_title} | Constraints: ${activeConstraints.join('; ') || 'standard'}`,
      options: alternatives
    });

    // Apply learned penalties/boosts from matching past decisions with recorded negative outcomes
    const constraintAlignedOptions = evaluated.evaluated_options.map(opt => {
      const violated = activeConstraints.filter(c => /zero cloud|local only|no cloud/i.test(c) && /cloud/i.test(opt.name));
      const pastFailureHit = pastRelevant.find(pr =>
        String(pr.selected_option || '').toLowerCase() === String(opt.name || '').toLowerCase() &&
        /fail|delay|regret|worse|exceeded/i.test(`${pr.actual_outcome || ''} ${pr.lessons_learned || ''}`)
      );
      const adjustedScore = Number((opt.composite_score - (violated.length * 3.0) - (pastFailureHit ? 1.5 : 0)).toFixed(2));
      return {
        ...opt,
        adjusted_score: adjustedScore,
        constraints_violated: violated,
        historical_warning: pastFailureHit ? `Prior similar choice led to: ${pastFailureHit.actual_outcome || pastFailureHit.lessons_learned}` : null
      };
    }).sort((a, b) => b.adjusted_score - a.adjusted_score);

    const best = constraintAlignedOptions[0];
    let simulation = null;
    if (simulate) {
      const sim = new TwinSimulationService();
      simulation = await sim.simulateStrategicScenarios({
        objective_id: related_goal_id,
        scenario_name: `Decision Simulation: ${decision_title}`,
        parameters: { simulated_failure_rate: best.constraints_violated.length > 0 ? 0.45 : 0.12 }
      });
    }

    let recorded = null;
    if (persistDecision) {
      recorded = await this.recordDecision({
        decision_title,
        category,
        context_at_decision: { ...context, activeConstraints, pastDecisionMatches: pastRelevant.length, simulationId: simulation?.simulation_id },
        alternatives_considered: constraintAlignedOptions.map(o => o.name),
        selected_option: best.name,
        reasoning_summary: `Evaluated ${alternatives.length} options against ${activeConstraints.length} constraints and ${pastRelevant.length} past decisions; recommended '${best.name}' (score ${best.adjusted_score}).`,
        expected_outcome: simulation ? `Expected completion prob ${simulation.expected_case.completion_probability}` : `Optimal balance with score ${best.adjusted_score}`,
        impact_rating: evaluated.confidence >= 0.8 ? 'HIGH' : 'MEDIUM',
        related_goal_id,
        related_project_id
      });
    }

    return {
      decision_id: recorded?.id || evaluated.decision_id,
      decision_title,
      active_constraints: activeConstraints,
      alternatives_evaluated: constraintAlignedOptions,
      recommended_option: best,
      past_lessons_recalled: pastRelevant.map(p => ({ id: p.id, title: p.decision_title, selected_option: p.selected_option, lessons_learned: p.lessons_learned })),
      simulation_projection: simulation,
      confidence: evaluated.confidence,
      requires_human_confirmation: true
    };
  }

  /**
   * Phase 17: Compares predicted vs actual outcome and learns from user corrections.
   */
  async recordOutcomeAndLearn(id, { actual_outcome, lessons_learned, outcome_matched_prediction = null, correction_notes = '' }) {
    const existing = await get('SELECT * FROM decision_records WHERE id = ?', [id]);
    if (!existing) throw new Error(`Decision record '${id}' not found.`);

    const predicted = existing.expected_outcome || '';
    const divergenceDetected = outcome_matched_prediction === false ||
      (predicted && actual_outcome && !String(actual_outcome).toLowerCase().includes(String(predicted).toLowerCase().slice(0, 12)));

    const enrichedLesson = correction_notes
      ? `${lessons_learned || ''} | [USER_CORRECTION]: ${correction_notes}`
      : `${lessons_learned || ''} | [CALIBRATION]: matched=${outcome_matched_prediction !== null ? outcome_matched_prediction : !divergenceDetected}`;

    const updated = await this.recordOutcome(id, {
      actual_outcome,
      lessons_learned: enrichedLesson.trim()
    });

    return {
      ...updated,
      predicted_outcome: predicted,
      outcome_matched_prediction: outcome_matched_prediction !== null ? outcome_matched_prediction : !divergenceDetected,
      learned_correction: Boolean(correction_notes || divergenceDetected)
    };
  }
}

let instance = null;
export function initDecisionMemory(options) {
  instance = new DecisionMemoryService(options);
  return instance;
}
export function getDecisionMemory() {
  if (!instance) instance = new DecisionMemoryService();
  return instance;
}
export default DecisionMemoryService;
