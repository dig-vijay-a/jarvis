/**
 * JARVIS OS 2.0 — PHASE 9: PATTERN INTELLIGENCE ENGINE (P0)
 * Analyzes historical mission executions, tool sequence n-grams, time rhythms,
 * recurring failure clusters, and environmental correlations.
 * Assigns confidence scores and rejects statistical coincidences.
 */

import { v4 as uuidv4 } from 'uuid';
import { query, run, get } from '../database/db.js';

export const PATTERN_TYPES = {
  WORKFLOW_SEQUENCE: 'WORKFLOW_SEQUENCE',
  REPEATED_FAILURE: 'REPEATED_FAILURE',
  TIME_OF_DAY: 'TIME_OF_DAY',
  FREQUENT_TOOL: 'FREQUENT_TOOL',
  APPROVAL_PATTERN: 'APPROVAL_PATTERN',
  ENV_CORRELATION: 'ENV_CORRELATION'
};

export class PatternIntelligenceService {
  constructor(options = {}) {
    this.minOccurrenceThreshold = options.minOccurrenceThreshold || 3;
    this.minConfidenceThreshold = options.minConfidenceThreshold || 0.65;
    this.defaultExpirationDays = options.defaultExpirationDays || 14;
  }

  /**
   * Main entry point: runs a comprehensive pattern extraction cycle
   * across execution history, telemetry, and environmental logs.
   */
  async analyzeExecutionPatterns() {
    const discovered = [];
    const sequences = await this.discoverWorkflowSequences();
    const failures = await this.discoverFailureClusters();
    const frequentTools = await this.discoverFrequentTools();
    const envCorrelations = await this.discoverEnvironmentalCorrelations();
    const timePatterns = await this.discoverTimeRhythms();

    const all = [...sequences, ...failures, ...frequentTools, ...envCorrelations, ...timePatterns];

    for (const pat of all) {
      if (pat.observation_count >= this.minOccurrenceThreshold && pat.confidence >= this.minConfidenceThreshold) {
        await this.persistPattern(pat);
        discovered.push(pat);
      }
    }

    await this.pruneExpiredPatterns();
    return discovered;
  }

  /**
   * Identifies recurring n-gram workflow sequences (Tool A -> Tool B) across missions.
   */
  async discoverWorkflowSequences() {
    const steps = await query(
      "SELECT mission_id, step_index, tool FROM mission_steps WHERE tool IS NOT NULL AND tool != 'none' ORDER BY mission_id, step_index ASC"
    );

    const missionStepMap = {};
    for (const s of steps) {
      if (!missionStepMap[s.mission_id]) missionStepMap[s.mission_id] = [];
      missionStepMap[s.mission_id].push(s.tool);
    }

    const pairCounts = {};
    const singleCounts = {};

    for (const tools of Object.values(missionStepMap)) {
      for (let i = 0; i < tools.length - 1; i++) {
        const t1 = tools[i];
        const t2 = tools[i + 1];
        singleCounts[t1] = (singleCounts[t1] || 0) + 1;
        const pairKey = `${t1}->${t2}`;
        pairCounts[pairKey] = (pairCounts[pairKey] || 0) + 1;
      }
    }

    const patterns = [];
    for (const [pair, count] of Object.entries(pairCounts)) {
      const [t1, t2] = pair.split('->');
      const totalT1 = singleCounts[t1] || count;
      const consistency = count / totalT1;

      // Distinguish genuine patterns from coincidences
      if (count >= this.minOccurrenceThreshold && consistency >= 0.6) {
        const confidence = Math.min(0.98, (count / (count + 2)) * consistency);
        patterns.push({
          pattern_type: PATTERN_TYPES.WORKFLOW_SEQUENCE,
          name: `Sequence: ${t1} precedes ${t2}`,
          description: `Tool '${t1}' is followed by '${t2}' in ${(consistency * 100).toFixed(0)}% of executions.`,
          trigger_signature: t1,
          action_signature: t2,
          observation_count: count,
          confidence: Number(confidence.toFixed(3)),
          evidence: {
            t1,
            t2,
            transition_count: count,
            total_t1_invocations: totalT1,
            transition_probability: consistency
          }
        });
      }
    }

    return patterns;
  }

  /**
   * Detects repeated failures and failure clusters on specific tools and error classes.
   */
  async discoverFailureClusters() {
    const failedSteps = await query(
      "SELECT tool, failure_classification AS failure_class, error AS last_error FROM mission_steps WHERE status = 'FAILED' OR verification_status = 'FAILED'"
    );

    const clusterMap = {};
    for (const s of failedSteps) {
      const tool = s.tool || 'unknown_tool';
      const key = `${tool}:${s.failure_class || 'UNKNOWN'}`;
      if (!clusterMap[key]) {
        clusterMap[key] = {
          tool,
          failure_class: s.failure_class || 'UNKNOWN',
          count: 0,
          errors: []
        };
      }
      clusterMap[key].count++;
      if (s.last_error && clusterMap[key].errors.length < 5) {
        clusterMap[key].errors.push(s.last_error);
      }
    }

    const patterns = [];
    for (const c of Object.values(clusterMap)) {
      if (c.count >= this.minOccurrenceThreshold) {
        const confidence = Math.min(0.95, c.count / (c.count + 1.5));
        patterns.push({
          pattern_type: PATTERN_TYPES.REPEATED_FAILURE,
          name: `Recurring Failure on ${c.tool}`,
          description: `Tool '${c.tool}' failed ${c.count} times with class ${c.failure_class}.`,
          trigger_signature: c.tool,
          action_signature: c.failure_class,
          observation_count: c.count,
          confidence: Number(confidence.toFixed(3)),
          evidence: {
            tool: c.tool,
            failure_class: c.failure_class,
            sample_errors: c.errors
          }
        });
      }
    }

    return patterns;
  }

  /**
   * Discovers high-frequency tools and operational reliance.
   */
  async discoverFrequentTools() {
    const toolRows = await query(
      "SELECT tool, COUNT(*) as count FROM mission_steps WHERE tool IS NOT NULL GROUP BY tool HAVING count >= ?",
      [this.minOccurrenceThreshold * 2]
    );

    const totalStepsRow = await get("SELECT COUNT(*) as total FROM mission_steps");
    const total = (totalStepsRow && totalStepsRow.total) || 1;

    return toolRows.map(r => {
      const usageShare = r.count / total;
      const confidence = Math.min(0.99, 0.5 + usageShare * 0.5);
      return {
        pattern_type: PATTERN_TYPES.FREQUENT_TOOL,
        name: `Frequent Tool: ${r.tool}`,
        description: `Tool '${r.tool}' represents ${(usageShare * 100).toFixed(1)}% of total system tool dispatches.`,
        trigger_signature: r.tool,
        action_signature: 'DISPATCH',
        observation_count: r.count,
        confidence: Number(confidence.toFixed(3)),
        evidence: { tool: r.tool, count: r.count, totalSteps: total, usageShare }
      };
    });
  }

  /**
   * Discovers correlations between environmental events and mission outcomes.
   */
  async discoverEnvironmentalCorrelations() {
    const relLogs = await query(
      "SELECT event_type, target, is_relevant, matched_entity_type FROM event_relevance_logs WHERE is_relevant = 1 ORDER BY timestamp DESC LIMIT 100"
    );

    const counts = {};
    for (const r of relLogs) {
      const key = `${r.event_type}:${r.matched_entity_type || 'generic'}`;
      counts[key] = (counts[key] || 0) + 1;
    }

    const patterns = [];
    for (const [key, count] of Object.entries(counts)) {
      if (count >= this.minOccurrenceThreshold) {
        const [eventType, entityType] = key.split(':');
        const confidence = Math.min(0.92, count / (count + 2));
        patterns.push({
          pattern_type: PATTERN_TYPES.ENV_CORRELATION,
          name: `Environmental Correlation: ${eventType} affects ${entityType}`,
          description: `Observed ${count} environmental '${eventType}' events affecting active ${entityType} entities.`,
          trigger_signature: eventType,
          action_signature: entityType,
          observation_count: count,
          confidence: Number(confidence.toFixed(3)),
          evidence: { eventType, entityType, count }
        });
      }
    }

    return patterns;
  }

  /**
   * Discovers time-of-day execution rhythms and scheduling patterns.
   */
  async discoverTimeRhythms() {
    const missions = await query(
      "SELECT strftime('%H', created_at) as hour, COUNT(*) as count FROM missions GROUP BY hour HAVING count >= ?",
      [this.minOccurrenceThreshold]
    );

    return missions.map(m => {
      const confidence = Math.min(0.88, m.count / (m.count + 3));
      return {
        pattern_type: PATTERN_TYPES.TIME_OF_DAY,
        name: `Operational Window: Hour ${m.hour}:00`,
        description: `Identified concentrated mission activity around ${m.hour}:00 UTC (${m.count} missions recorded).`,
        trigger_signature: `HOUR_${m.hour}`,
        action_signature: 'MISSION_PEAK',
        observation_count: m.count,
        confidence: Number(confidence.toFixed(3)),
        evidence: { hour: m.hour, count: m.count }
      };
    });
  }

  /**
   * Persists a discovered pattern into the database with deduplication and expiration.
   */
  async persistPattern(pattern) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.defaultExpirationDays * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();

    const existing = await get(
      "SELECT id, observation_count, confidence FROM discovered_patterns WHERE pattern_type = ? AND trigger_signature = ? AND action_signature = ?",
      [pattern.pattern_type, pattern.trigger_signature, pattern.action_signature]
    );

    if (existing) {
      await run(
        `UPDATE discovered_patterns SET
          observation_count = ?,
          confidence = ?,
          evidence = ?,
          last_observed_at = ?,
          expires_at = ?
         WHERE id = ?`,
        [
          Math.max(existing.observation_count, pattern.observation_count),
          pattern.confidence,
          JSON.stringify(pattern.evidence || {}),
          nowIso,
          expiresAt,
          existing.id
        ]
      );
      pattern.id = existing.id;
    } else {
      const id = `pat-${uuidv4()}`;
      pattern.id = id;
      await run(
        `INSERT INTO discovered_patterns 
          (id, pattern_type, name, description, trigger_signature, action_signature, observation_count, confidence, evidence, created_at, last_observed_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          pattern.pattern_type,
          pattern.name,
          pattern.description,
          pattern.trigger_signature,
          pattern.action_signature,
          pattern.observation_count,
          pattern.confidence,
          JSON.stringify(pattern.evidence || {}),
          nowIso,
          nowIso,
          expiresAt
        ]
      );
    }

    return pattern;
  }

  /**
   * Retrieves active, non-expired patterns.
   */
  async getPatterns(filter = {}) {
    let sql = "SELECT * FROM discovered_patterns WHERE (expires_at IS NULL OR expires_at > datetime('now'))";
    const params = [];

    if (filter.pattern_type) {
      sql += " AND pattern_type = ?";
      params.push(filter.pattern_type);
    }
    if (filter.min_confidence) {
      sql += " AND confidence >= ?";
      params.push(Number(filter.min_confidence));
    }

    sql += " ORDER BY confidence DESC, observation_count DESC";
    const rows = await query(sql, params);

    return rows.map(r => ({
      ...r,
      evidence: r.evidence ? JSON.parse(r.evidence) : null
    }));
  }

  /**
   * Prunes patterns that have expired.
   */
  async pruneExpiredPatterns() {
    const res = await run("DELETE FROM discovered_patterns WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')");
    return res.changes || 0;
  }
}

let instance = null;
export function initPatternIntelligence(options) {
  instance = new PatternIntelligenceService(options);
  return instance;
}
export function getPatternIntelligence() {
  if (!instance) instance = new PatternIntelligenceService();
  return instance;
}
export default PatternIntelligenceService;
