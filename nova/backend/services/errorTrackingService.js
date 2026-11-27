import { query, run, get } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';

export const SUBSYSTEMS = {
  DATABASE: 'DATABASE',
  ORCHESTRATOR: 'ORCHESTRATOR',
  MISSION_CONTROL: 'MISSION_CONTROL',
  PYTHON_AGENT: 'PYTHON_AGENT',
  DESKTOP_AUTOMATION: 'DESKTOP_AUTOMATION',
  SECURITY: 'SECURITY',
  SYSTEM: 'SYSTEM'
};

export class ErrorTrackingService {
  /**
   * Logs a structured subsystem error
   */
  async logError({ errorCode = 'ERR_SYSTEM', message, stack = null, subsystem = SUBSYSTEMS.SYSTEM, severity = 'ERROR', recoveryAttempted = false, recoveryStatus = null }) {
    try {
      const id = `err-${uuidv4().substring(0, 8)}`;
      const now = new Date().toISOString();

      await run(
        `INSERT INTO system_errors 
        (id, error_code, error_type, message, stack, stack_trace, subsystem, component, severity, recovery_attempted, recovery_status, timestamp, last_occurred_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          errorCode,
          errorCode,
          message || 'Unknown system error',
          stack || '',
          stack || '',
          subsystem,
          subsystem,
          severity,
          recoveryAttempted ? 1 : 0,
          recoveryStatus || null,
          now,
          now
        ]
      );

      return {
        id,
        errorCode,
        message,
        subsystem,
        severity,
        recoveryAttempted,
        recoveryStatus,
        timestamp: now
      };
    } catch (err) {
      console.error('[ErrorTrackingService] Failed to record error in DB:', err.message);
      return null;
    }
  }

  /**
   * Retrieves recent system errors
   */
  async getRecentErrors(limit = 50) {
    const rows = await query('SELECT * FROM system_errors ORDER BY COALESCE(timestamp, last_occurred_at) DESC LIMIT ?', [limit]);
    return rows.map(r => ({
      ...r,
      error_code: r.error_code || r.error_type,
      subsystem: r.subsystem || r.component,
      stack: r.stack || r.stack_trace,
      timestamp: r.timestamp || r.last_occurred_at,
      recovery_attempted: Boolean(r.recovery_attempted)
    }));
  }

  /**
   * Resolves a system error
   */
  async resolveError(id, resolution = 'RESOLVED') {
    const res = await run(
      'UPDATE system_errors SET recovery_attempted = 1, recovery_status = ? WHERE id = ?',
      [resolution, id]
    );
    return res.changes > 0;
  }

  /**
   * Aggregates error statistics by severity and subsystem
   */
  async getErrorStats() {
    const totalRow = await get('SELECT COUNT(*) as total FROM system_errors');
    const unresolvedRow = await get("SELECT COUNT(*) as unresolved FROM system_errors WHERE recovery_status IS NULL OR recovery_status != 'RESOLVED'");
    const bySubsystem = await query('SELECT COALESCE(subsystem, component) as subsystem, COUNT(*) as count FROM system_errors GROUP BY COALESCE(subsystem, component)');
    const bySeverity = await query('SELECT COALESCE(severity, "ERROR") as severity, COUNT(*) as count FROM system_errors GROUP BY COALESCE(severity, "ERROR")');

    return {
      total: totalRow.total,
      unresolved: unresolvedRow.unresolved,
      bySubsystem,
      bySeverity
    };
  }
}

export default new ErrorTrackingService();
