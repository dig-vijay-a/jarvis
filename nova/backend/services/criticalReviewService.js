import { query, run, get } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import { DecisionMemoryService } from './decisionMemoryService.js';

export class CriticalReviewService {
  constructor(options = {}) {
    this.decisionMemory = options.decisionMemory || new DecisionMemoryService();
  }

  /**
   * Conducts pre-execution critical review before high-impact missions or strategic plans.
   * INVARIANT 23: Actively challenges assumptions and identifies invalid premises.
   * INVARIANT 24: Self-evaluation cannot mark outputs correct without independent verification.
   */
  async conductPreExecutionReview({
    target_id,
    target_type = 'PLAN', // OBJECTIVE | PLAN | RECOMMENDATION
    supporting_evidence = [],
    contradictory_evidence = [],
    assumptions = [],
    constraints = [],
    proposed_actions = []
  }) {
    if (!target_id) throw new Error('target_id is required for pre-execution critical review.');

    const reviewId = `rev-${uuidv4().substring(0, 8)}`;
    const nowIso = new Date().toISOString();

    // 1. Challenge Assumptions
    const challengedAssumptions = [];
    for (const a of assumptions) {
      const aText = typeof a === 'string' ? a : (a.text || JSON.stringify(a));
      const lower = aText.toLowerCase();
      // Flag unvalidated assumptions
      if (lower.includes('always') || lower.includes('never') || lower.includes('guaranteed') || lower.includes('no failure') || lower.includes('impossible') || lower.includes('flawless')) {
        challengedAssumptions.push({
          assumption: aText,
          challenge: 'Unjustified certainty: Presumes deterministic behavior in non-deterministic environment.',
          is_valid: false
        });
      } else if (lower.includes('assumed') || lower.includes('untested')) {
        challengedAssumptions.push({
          assumption: aText,
          challenge: 'Lacks empirical test validation; treat as unverified hypothesis.',
          is_valid: false
        });
      } else {
        challengedAssumptions.push({
          assumption: aText,
          challenge: 'Plausible operational premise subject to runtime validation.',
          is_valid: true
        });
      }
    }

    // 2. Identify Alternative Approaches
    const alternativeApproaches = [
      'Staged phased rollout with intermediate rollback checkpoint',
      'Fallback to read-only diagnostic baseline prior to stateful mutations'
    ];

    // 3. Identify Failure Conditions
    const failureConditions = [
      'Host system resource exhaustion during concurrent execution',
      'Transient network timeout when querying external references',
      'Permission check failure on sensitive system paths'
    ];

    // 4. Determine Human Approval Requirements (Invariant 27)
    const approvalReasons = [];
    let requiresApproval = false;

    for (const action of proposed_actions) {
      const actName = typeof action === 'string' ? action : (action.tool || action.name || '');
      if (actName.includes('format') || actName.includes('delete') || actName.includes('write_system') || actName.includes('deploy') || actName.includes('transfer')) {
        requiresApproval = true;
        approvalReasons.push(`Action '${actName}' constitutes an irreversible or sensitive operation.`);
      }
    }

    // 5. Unresolved Uncertainty
    const unresolvedUncertainty = [];
    if (contradictory_evidence.length > 0) {
      unresolvedUncertainty.push(`Identified ${contradictory_evidence.length} contradictory evidence points requiring manual or empirical resolution.`);
    }
    const invalidAssumptions = challengedAssumptions.filter(c => !c.is_valid);
    if (invalidAssumptions.length > 0) {
      unresolvedUncertainty.push(`Identified ${invalidAssumptions.length} invalid or overconfident assumptions.`);
    }

    const verdict = (requiresApproval || invalidAssumptions.length > 0 || contradictory_evidence.length > 0)
      ? 'REVISION_REQUIRED'
      : 'REVIEWED';

    await run(
      `INSERT INTO strategic_critical_reviews
        (id, target_id, target_type, supporting_evidence, contradictory_evidence, challenged_assumptions, alternative_approaches, failure_conditions, requires_human_approval, approval_reasons, unresolved_uncertainty, verdict, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reviewId,
        target_id,
        target_type,
        JSON.stringify(supporting_evidence),
        JSON.stringify(contradictory_evidence),
        JSON.stringify(challengedAssumptions),
        JSON.stringify(alternativeApproaches),
        JSON.stringify(failureConditions),
        requiresApproval ? 1 : 0,
        JSON.stringify(approvalReasons),
        JSON.stringify(unresolvedUncertainty),
        verdict,
        nowIso
      ]
    );

    return {
      review_id: reviewId,
      target_id,
      target_type,
      verdict,
      challenged_assumptions: challengedAssumptions,
      invalid_assumptions_count: invalidAssumptions.length,
      alternative_approaches: alternativeApproaches,
      failure_conditions: failureConditions,
      requires_human_approval: requiresApproval,
      approval_reasons: approvalReasons,
      unresolved_uncertainty: unresolvedUncertainty,
      created_at: nowIso
    };
  }

  /**
   * Conducts post-execution critical review comparing expected vs actual outcomes (Invariant 29).
   */
  async conductPostExecutionReview({
    target_id,
    expected_outcomes = [],
    predicted_outcomes = [],
    actual_outcomes = [],
    self_evaluation = null,
    independent_verification = null,
    independent_evidence = []
  }) {
    if (!target_id) throw new Error('target_id is required for post-execution review.');

    const reviewId = `rev-post-${uuidv4().substring(0, 8)}`;
    const nowIso = new Date().toISOString();

    const planningErrorsIdentified = [];
    const lessonsLearned = [];
    const outcomeComparisons = [];

    const expectedList = predicted_outcomes.length > 0 ? predicted_outcomes : expected_outcomes;

    // Compare expected / predicted vs actual
    for (let i = 0; i < expectedList.length; i++) {
      const exp = expectedList[i];
      const act = actual_outcomes[i] || 'MISSING_OUTCOME';

      if (typeof exp === 'object' && exp !== null && typeof act === 'object' && act !== null) {
        const metricName = exp.metric || act.metric || `metric_${i}`;
        const expVal = exp.value !== undefined ? exp.value : 0;
        const actVal = act.value !== undefined ? act.value : 0;
        const variance = Math.abs(actVal - expVal);

        outcomeComparisons.push({
          metric: metricName,
          predicted: expVal,
          actual: actVal,
          variance
        });

        if (variance > (expVal * 0.2 || 10)) {
          lessonsLearned.push(`Observed variance in metric '${metricName}': predicted ${expVal}, actual ${actVal} (variance: ${variance}).`);
        } else {
          lessonsLearned.push(`Metric '${metricName}' closely tracked prediction (variance: ${variance}).`);
        }
      } else {
        const expStr = typeof exp === 'string' ? exp : JSON.stringify(exp);
        const actStr = typeof act === 'string' ? act : JSON.stringify(act);

        if (actStr === 'MISSING_OUTCOME' || actStr.includes('FAILED') || actStr.includes('ERROR')) {
          planningErrorsIdentified.push({
            expected: expStr,
            actual: actStr,
            error_category: 'EXECUTION_DEFICIT',
            remedy: 'Recalibrate step dependency graph and increase retry backoff'
          });
          lessonsLearned.push(`Planning error: Expectation '${expStr}' failed to materialize due to '${actStr}'.`);
        } else {
          lessonsLearned.push(`Success pattern confirmed: '${expStr}' aligned with measured reality.`);
        }
      }
    }

    // Invariant 24: Self-evaluation cannot override independent verification
    let verdict = 'REVIEWED';
    const hasIndependentEvidence = (Array.isArray(independent_evidence) && independent_evidence.length > 0) || (independent_verification && independent_verification.passed === true);

    if (independent_verification && independent_verification.passed === false) {
      verdict = 'VERIFICATION_FAILED';
      lessonsLearned.push(`Independent verification check failed: ${independent_verification.reason || 'Cryptographic/empirical verification mismatch'}.`);
    } else if (self_evaluation && self_evaluation.score >= 0.8 && !hasIndependentEvidence) {
      verdict = 'VERIFICATION_FAILED';
      lessonsLearned.push('Independent verification check failed: Self-evaluation cannot validate output without independent evidence.');
    } else if (planningErrorsIdentified.length > 0) {
      verdict = 'REVISION_REQUIRED';
    } else if (hasIndependentEvidence) {
      verdict = 'VERIFIED_SUCCESS';
    }

    await run(
      `INSERT INTO strategic_critical_reviews
        (id, target_id, target_type, supporting_evidence, contradictory_evidence, challenged_assumptions, alternative_approaches, failure_conditions, requires_human_approval, approval_reasons, unresolved_uncertainty, planning_errors_identified, lessons_learned, verdict, created_at)
       VALUES (?, ?, 'OUTCOME', ?, '[]', '[]', '[]', '[]', 0, '[]', '[]', ?, ?, ?, ?)`,
      [
        reviewId,
        target_id,
        JSON.stringify(independent_evidence),
        JSON.stringify(planningErrorsIdentified),
        JSON.stringify(lessonsLearned),
        verdict,
        nowIso
      ]
    );

    // Record lessons learned into DecisionMemoryService
    try {
      await this.decisionMemory.recordDecision({
        decision_title: `Outcome Review Lessons: ${target_id}`,
        category: 'lessons_learned',
        context_at_decision: { target_id, errorsCount: planningErrorsIdentified.length },
        alternatives_considered: ['Suppress errors', 'Record empirical lessons'],
        selected_option: 'Record empirical lessons',
        reasoning_summary: lessonsLearned.join('; '),
        expected_outcome: 'Informs future planning and calibration',
        impact_rating: (planningErrorsIdentified.length > 0 || verdict === 'VERIFICATION_FAILED') ? 'HIGH' : 'MEDIUM'
      });
    } catch (_) {}

    return {
      review_id: reviewId,
      target_id,
      target_type: 'OUTCOME',
      verdict,
      outcome_comparisons: outcomeComparisons,
      planning_errors_identified: planningErrorsIdentified,
      lessons_learned: lessonsLearned,
      has_independent_evidence: hasIndependentEvidence,
      created_at: nowIso
    };
  }

  /**
   * Retrieves critical review by ID or target ID.
   */
  async getReview(id) {
    const row = await get('SELECT * FROM strategic_critical_reviews WHERE id = ? OR target_id = ? ORDER BY created_at DESC LIMIT 1', [id, id]);
    if (!row) return null;

    return {
      ...row,
      supporting_evidence: JSON.parse(row.supporting_evidence || '[]'),
      contradictory_evidence: JSON.parse(row.contradictory_evidence || '[]'),
      challenged_assumptions: JSON.parse(row.challenged_assumptions || '[]'),
      alternative_approaches: JSON.parse(row.alternative_approaches || '[]'),
      failure_conditions: JSON.parse(row.failure_conditions || '[]'),
      approval_reasons: JSON.parse(row.approval_reasons || '[]'),
      unresolved_uncertainty: JSON.parse(row.unresolved_uncertainty || '[]'),
      planning_errors_identified: JSON.parse(row.planning_errors_identified || '[]'),
      lessons_learned: JSON.parse(row.lessons_learned || '[]'),
      requires_human_approval: Boolean(row.requires_human_approval)
    };
  }
}

let instance = null;
export function getCriticalReviewService() {
  if (!instance) {
    instance = new CriticalReviewService();
  }
  return instance;
}

export default CriticalReviewService;
