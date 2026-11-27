import { query, run, get } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';

export class SelfAnalysisService {
  constructor(options = {}) {
    this.minConfidenceThreshold = options.minConfidenceThreshold || 0.6;
    this.minEvidenceOccurrences = options.minEvidenceOccurrences || 3; // Minimum 3 occurrences to prevent false positive flukes
  }

  /**
   * Analyzes operational history across missions, tool executions, retries, and errors.
   * Discovers systemic weaknesses with empirical evidence and confidence scoring.
   */
  async analyzeOperationalHistory({ windowHours = 72, minConfidence = null } = {}) {
    const threshold = minConfidence !== null ? minConfidence : this.minConfidenceThreshold;
    const cutoffTime = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
    const discoveredWeaknesses = [];

    // 1. Tool Execution Reliability Analysis
    const toolExecRows = await query(
      `SELECT tool, status, COUNT(*) as count 
       FROM mission_steps 
       WHERE started_at >= ? OR started_at IS NULL
       GROUP BY tool, status`,
      [cutoffTime]
    );

    const toolStats = {};
    for (const row of toolExecRows) {
      if (!row.tool) continue;
      if (!toolStats[row.tool]) {
        toolStats[row.tool] = { total: 0, failed: 0, verified: 0 };
      }
      toolStats[row.tool].total += row.count;
      if (row.status === 'FAILED' || row.status === 'SYSTEM_FAULT') {
        toolStats[row.tool].failed += row.count;
      } else if (row.status === 'VERIFIED' || row.status === 'COMPLETED') {
        toolStats[row.tool].verified += row.count;
      }
    }

    for (const [toolName, stats] of Object.entries(toolStats)) {
      if (stats.total >= this.minEvidenceOccurrences) {
        const failureRate = stats.failed / stats.total;
        if (failureRate >= 0.25) {
          const confidence = Math.min(0.95, 0.5 + (stats.total / 10) * 0.3);
          if (confidence >= threshold) {
            discoveredWeaknesses.push({
              weakness_type: 'TOOL_RELIABILITY',
              subsystem: 'tool_registry',
              description: `Tool '${toolName}' exhibits high failure rate (${(failureRate * 100).toFixed(1)}% failures over ${stats.total} executions).`,
              evidence: { tool: toolName, total_executions: stats.total, failures: stats.failed, failure_rate: failureRate },
              confidence,
              severity: failureRate >= 0.5 ? 'HIGH' : 'MEDIUM'
            });
          }
        }
      }
    }

    // 2. Repeated Failures Cluster Detection
    const repeatedFails = await query(
      `SELECT error, COUNT(*) as count, GROUP_CONCAT(id) as step_ids
       FROM mission_steps
       WHERE (status = 'FAILED' OR status = 'SYSTEM_FAULT') AND error IS NOT NULL AND started_at >= ?
       GROUP BY error
       HAVING count >= ?`,
      [cutoffTime, this.minEvidenceOccurrences]
    );

    for (const fail of repeatedFails) {
      const confidence = Math.min(0.98, 0.6 + (fail.count / 8) * 0.35);
      if (confidence >= threshold) {
        discoveredWeaknesses.push({
          weakness_type: 'REPEATED_FAILURES',
          subsystem: 'mission_control',
          description: `Recurring operational fault encountered ${fail.count} times: "${fail.error.substring(0, 100)}"`,
          evidence: { error_signature: fail.error, occurrence_count: fail.count, step_ids: (fail.step_ids || '').split(',') },
          confidence,
          severity: fail.count >= 5 ? 'HIGH' : 'MEDIUM'
        });
      }
    }

    // 3. User Rejected Recommendations / Manual Workarounds
    try {
      const rejections = await query(
        `SELECT category, COUNT(*) as rejection_count
         FROM feedback_learning
         WHERE action = 'REJECTED' AND timestamp >= ?
         GROUP BY category
         HAVING rejection_count >= ?`,
        [cutoffTime, this.minEvidenceOccurrences]
      );

      for (const rej of rejections) {
        const confidence = Math.min(0.9, 0.55 + (rej.rejection_count / 6) * 0.3);
        if (confidence >= threshold) {
          discoveredWeaknesses.push({
            weakness_type: 'USER_REJECTIONS',
            subsystem: 'predictive_intelligence',
            description: `User frequently rejects recommendations in category '${rej.category}' (${rej.rejection_count} rejections).`,
            evidence: { category: rej.category, rejection_count: rej.rejection_count },
            confidence,
            severity: 'LOW'
          });
        }
      }
    } catch (_) {}

    // Persist discovered weaknesses idempotently
    const recordedList = [];
    const nowIso = new Date().toISOString();

    for (const w of discoveredWeaknesses) {
      const existing = await get(
        `SELECT id FROM evolution_weaknesses 
         WHERE weakness_type = ? AND description = ? AND status != 'RESOLVED'`,
        [w.weakness_type, w.description]
      );

      if (!existing) {
        const id = `weak-${uuidv4().substring(0, 8)}`;
        await run(
          `INSERT INTO evolution_weaknesses 
            (id, weakness_type, subsystem, description, evidence_json, confidence, severity, status, identified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'IDENTIFIED', ?)`,
          [id, w.weakness_type, w.subsystem, w.description, JSON.stringify(w.evidence), w.confidence, w.severity, nowIso]
        );
        recordedList.push({ id, ...w, status: 'IDENTIFIED', identified_at: nowIso });
      } else {
        // Update confidence and evidence
        await run(
          `UPDATE evolution_weaknesses 
           SET evidence_json = ?, confidence = ?, severity = ? 
           WHERE id = ?`,
          [JSON.stringify(w.evidence), w.confidence, w.severity, existing.id]
        );
        recordedList.push({ id: existing.id, ...w, status: 'IDENTIFIED' });
      }
    }

    return {
      success: true,
      weaknesses_count: recordedList.length,
      weaknesses: recordedList
    };
  }

  /**
   * Discovers and registers a specific weakness directly (e.g., from telemetry or event triggers).
   */
  async recordWeakness({
    weakness_type,
    subsystem,
    description,
    evidence,
    confidence = 0.75,
    severity = 'MEDIUM'
  }) {
    if (!weakness_type || !subsystem || !description) {
      throw new Error('weakness_type, subsystem, and description are required.');
    }

    const id = `weak-${uuidv4().substring(0, 8)}`;
    const nowIso = new Date().toISOString();

    await run(
      `INSERT INTO evolution_weaknesses
        (id, weakness_type, subsystem, description, evidence_json, confidence, severity, status, identified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'IDENTIFIED', ?)`,
      [id, weakness_type, subsystem, description, JSON.stringify(evidence || {}), confidence, severity, nowIso]
    );

    return {
      id,
      weakness_type,
      subsystem,
      description,
      confidence,
      severity,
      status: 'IDENTIFIED',
      identified_at: nowIso
    };
  }

  /**
   * Retrieves weaknesses with optional status filter.
   */
  async getDiscoveredWeaknesses(status = null) {
    let rows;
    if (status) {
      rows = await query('SELECT * FROM evolution_weaknesses WHERE status = ? ORDER BY identified_at DESC', [status]);
    } else {
      rows = await query('SELECT * FROM evolution_weaknesses ORDER BY identified_at DESC');
    }

    return rows.map(r => ({
      ...r,
      evidence: JSON.parse(r.evidence_json || '{}')
    }));
  }

  /**
   * Resolves an identified weakness.
   */
  async resolveWeakness(weaknessId, resolutionNotes = '') {
    const existing = await get('SELECT id FROM evolution_weaknesses WHERE id = ?', [weaknessId]);
    if (!existing) throw new Error(`Weakness ${weaknessId} not found.`);

    const nowIso = new Date().toISOString();
    await run(
      `UPDATE evolution_weaknesses 
       SET status = 'RESOLVED', resolved_at = ? 
       WHERE id = ?`,
      [nowIso, weaknessId]
    );

    return {
      id: weaknessId,
      status: 'RESOLVED',
      resolved_at: nowIso,
      notes: resolutionNotes
    };
  }
}

let instance = null;
export function getSelfAnalysisService() {
  if (!instance) {
    instance = new SelfAnalysisService();
  }
  return instance;
}

export default SelfAnalysisService;
