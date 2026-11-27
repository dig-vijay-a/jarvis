/**
 * JARVIS OS 2.0 — PHASE 9: RECOMMENDATION INTELLIGENCE ENGINE (P4)
 * Generates, lifecycle-tracks, and evaluates actionable recommendations.
 * States: PENDING, ACCEPTED, REJECTED, EXPIRED, EXECUTED, VERIFIED, FAILED.
 * NON-NEGOTIABLE: Never automatically executes high-impact or sensitive recommendations without approval.
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { query, run, get } from '../database/db.js';
import { getRecommendationLearning } from './recommendationLearningService.js';
import DigitalTwinService from './digitalTwinService.js';
import ToolRegistry from '../tools/registry.js';

export const RECOMMENDATION_STATUSES = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  EXECUTED: 'EXECUTED',
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED'
};

export class PredictiveRecommendationService {
  constructor(options = {}) {
    this.defaultTtlHours = options.defaultTtlHours || 48;
  }

  /**
   * Evaluates opportunities, applies learning weights, deduplicates, and creates persistent recommendations.
   * @param {Array} rawOpportunities
   */
  async processOpportunities(rawOpportunities = []) {
    const learningService = getRecommendationLearning();
    const created = [];

    for (const opp of rawOpportunities) {
      // Calculate signature to prevent duplicates
      const signature = this.computeSignature(opp);
      const existing = await get(
        "SELECT id, status FROM predictive_recommendations WHERE triggering_evidence LIKE ? AND status IN ('PENDING', 'ACCEPTED')",
        [`%"signature":"${signature}"%`]
      );

      if (existing) {
        // Redundant recommendation suppressed (Idempotent Deduplication)
        continue;
      }

      // Apply learning multiplier from RecommendationLearningService (P5)
      const adjustedConfidence = await learningService.adjustConfidence(opp.type, opp.confidence || 0.75);

      const recId = `rec-${uuidv4()}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.defaultTtlHours * 60 * 60 * 1000).toISOString();

      // Enrich with Digital Twin contextual influences (Phase 10: P5)
      let contextualInfluences = { goals: [], projects: [], preferences: [], constraints: [] };
      try {
        const twinProfile = await DigitalTwinService.getFullTwinProfile({ is_enabled: true });
        const titleWords = (opp.title + ' ' + (opp.description || '')).toLowerCase().split(/\s+/);
        contextualInfluences.goals = (twinProfile.goals || [])
          .filter(g => titleWords.some(w => w.length > 3 && g.title.toLowerCase().includes(w)))
          .map(g => g.title);
        contextualInfluences.projects = (twinProfile.projects || [])
          .filter(p => titleWords.some(w => w.length > 3 && p.title.toLowerCase().includes(w)))
          .map(p => p.title);
        contextualInfluences.preferences = (twinProfile.preferences || [])
          .filter(pr => pr.is_confirmed)
          .map(pr => pr.title)
          .slice(0, 3);
        contextualInfluences.constraints = (twinProfile.constraints || [])
          .map(c => c.title)
          .slice(0, 2);
      } catch (_) {}

      const enrichedEvidence = {
        ...(opp.triggering_evidence || {}),
        signature,
        raw_confidence: opp.confidence,
        adjusted_confidence: adjustedConfidence,
        contextual_influences: contextualInfluences
      };

      await run(
        `INSERT INTO predictive_recommendations 
          (id, recommendation_type, title, description, triggering_evidence, confidence, expected_impact, time_horizon, suggested_action, risk_classification, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
        [
          recId,
          opp.type || 'GENERAL',
          opp.title,
          opp.description,
          JSON.stringify(enrichedEvidence),
          adjustedConfidence,
          opp.expected_impact || 'MEDIUM',
          opp.time_horizon || 'SHORT_TERM',
          JSON.stringify(opp.suggested_action || {}),
          opp.risk_classification || 'REQUIRES_REVIEW',
          now.toISOString(),
          expiresAt
        ]
      );

      created.push({
        id: recId,
        type: opp.type,
        title: opp.title,
        description: opp.description,
        confidence: adjustedConfidence,
        expected_impact: opp.expected_impact,
        time_horizon: opp.time_horizon,
        risk_classification: opp.risk_classification,
        status: RECOMMENDATION_STATUSES.PENDING,
        contextual_influences: contextualInfluences,
        expires_at: expiresAt
      });
    }

    await this.expireOverdueRecommendations();
    return created;
  }

  /**
   * Computes a canonical signature for deduplication.
   */
  computeSignature(opp) {
    const key = `${opp.type}:${opp.title}:${JSON.stringify(opp.suggested_action || {})}`;
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
  }

  /**
   * Accepts a recommendation. Triggers feedback learning.
   */
  async acceptRecommendation(id, feedback = '') {
    const rec = await get("SELECT * FROM predictive_recommendations WHERE id = ?", [id]);
    if (!rec) throw new Error(`Recommendation '${id}' not found.`);
    if (rec.status !== RECOMMENDATION_STATUSES.PENDING) {
      throw new Error(`Cannot accept recommendation in status '${rec.status}'.`);
    }

    await run(
      "UPDATE predictive_recommendations SET status = 'ACCEPTED', user_feedback = ?, updated_at = datetime('now') WHERE id = ?",
      [feedback, id]
    );

    // Notify learning engine
    const learningService = getRecommendationLearning();
    await learningService.recordDecision(rec.recommendation_type, 'ACCEPT');

    return { success: true, id, status: RECOMMENDATION_STATUSES.ACCEPTED };
  }

  /**
   * Rejects a recommendation. Triggers feedback learning (damping category prior).
   */
  async rejectRecommendation(id, feedback = '') {
    const rec = await get("SELECT * FROM predictive_recommendations WHERE id = ?", [id]);
    if (!rec) throw new Error(`Recommendation '${id}' not found.`);

    await run(
      "UPDATE predictive_recommendations SET status = 'REJECTED', user_feedback = ?, updated_at = datetime('now') WHERE id = ?",
      [feedback, id]
    );

    // Notify learning engine
    const learningService = getRecommendationLearning();
    await learningService.recordDecision(rec.recommendation_type, 'REJECT');

    return { success: true, id, status: RECOMMENDATION_STATUSES.REJECTED };
  }

  /**
   * Executes an accepted recommendation.
   * NON-NEGOTIABLE: High-impact or high-risk actions are blocked without explicit authorization flag.
   */
  async executeRecommendation(id, isExplicitlyApproved = false) {
    const rec = await get("SELECT * FROM predictive_recommendations WHERE id = ?", [id]);
    if (!rec) throw new Error(`Recommendation '${id}' not found.`);

    const isHighImpact = rec.expected_impact === 'HIGH' || rec.expected_impact === 'CRITICAL';
    const isSensitive = rec.risk_classification === 'HIGH_RISK' || rec.risk_classification === 'REQUIRES_REVIEW';

    // Strict security guard: Block unapproved high impact executions
    if ((isHighImpact || isSensitive) && !isExplicitlyApproved) {
      throw new Error(`SECURITY_REJECTION: Action is marked '${rec.expected_impact}' impact / '${rec.risk_classification}' risk and requires explicit user authorization before execution.`);
    }

    const action = rec.suggested_action ? JSON.parse(rec.suggested_action) : {};
    let executionResult = null;

    try {
      if (action.tool) {
        executionResult = await ToolRegistry.executeTool(action.tool, action.args || {});
      } else {
        executionResult = { executed: true, note: `Processed action template: ${action.type}` };
      }

      await run(
        "UPDATE predictive_recommendations SET status = 'EXECUTED', executed_at = datetime('now') WHERE id = ?",
        [id]
      );

      return {
        success: true,
        id,
        status: RECOMMENDATION_STATUSES.EXECUTED,
        result: executionResult
      };
    } catch (err) {
      await run(
        "UPDATE predictive_recommendations SET status = 'FAILED', user_feedback = ? WHERE id = ?",
        [`Execution failed: ${err.message}`, id]
      );
      throw err;
    }
  }

  /**
   * Retrieves recommendations with optional status and category filtering.
   */
  async getRecommendations(filter = {}) {
    let sql = "SELECT * FROM predictive_recommendations WHERE 1=1";
    const params = [];

    if (filter.status) {
      sql += " AND status = ?";
      params.push(filter.status);
    }
    if (filter.type) {
      sql += " AND recommendation_type = ?";
      params.push(filter.type);
    }

    sql += " ORDER BY confidence DESC, created_at DESC";
    const rows = await query(sql, params);

    return rows.map(r => ({
      ...r,
      triggering_evidence: r.triggering_evidence ? JSON.parse(r.triggering_evidence) : null,
      suggested_action: r.suggested_action ? JSON.parse(r.suggested_action) : null
    }));
  }

  /**
   * Automatically expires overdue recommendations.
   */
  async expireOverdueRecommendations() {
    const res = await run(
      "UPDATE predictive_recommendations SET status = 'EXPIRED' WHERE status = 'PENDING' AND expires_at IS NOT NULL AND expires_at <= datetime('now')"
    );
    return res.changes || 0;
  }
}

let instance = null;
export function initPredictiveRecommendation(options) {
  instance = new PredictiveRecommendationService(options);
  return instance;
}
export function getPredictiveRecommendation() {
  if (!instance) instance = new PredictiveRecommendationService();
  return instance;
}
export default PredictiveRecommendationService;
