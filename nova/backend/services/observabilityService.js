import { v4 as uuidv4 } from 'uuid';
import { query, run, get } from '../database/db.js';

// In-memory active traces for quick lookup during execution
const activeTraces = new Map();

export class ObservabilityService {
  static wss = null;

  static setWebSocketServer(wss) {
    this.wss = wss;
  }

  static broadcast(event, data) {
    if (!this.wss) return;
    const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    this.wss.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(payload);
      }
    });
  }

  /**
   * Starts an end-to-end request trace
   */
  static async startTrace({ conversationId = 'conv-main', userInput = '', sessionId = null } = {}) {
    const traceId = `trace-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const trace = {
      id: `tr-${Date.now()}`,
      traceId,
      sessionId,
      conversationId,
      userInput: userInput.slice(0, 500),
      intent: 'pending',
      agentAssigned: 'CoordinatorAgent',
      modelUsed: 'pending',
      startTime: Date.now(),
      status: 'running',
      error: null,
      spans: []
    };

    activeTraces.set(traceId, trace);

    // Initial insert into request_traces
    try {
      await run(
        `INSERT INTO request_traces 
        (id, trace_id, session_id, conversation_id, user_input, intent, agent_assigned, model_used, latency_ms, total_tokens, cost_usd, status, error, spans, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          trace.id,
          trace.traceId,
          trace.sessionId,
          trace.conversationId,
          trace.userInput,
          trace.intent,
          trace.agentAssigned,
          trace.modelUsed,
          0,
          0,
          0.0,
          trace.status,
          null,
          JSON.stringify([]),
          new Date().toISOString()
        ]
      );
    } catch (e) {
      console.warn('[Observability] Trace start write warning:', e.message);
    }

    return trace;
  }

  /**
   * Starts a span within a trace
   */
  static startSpan(traceId, name, metadata = {}) {
    const trace = activeTraces.get(traceId);
    const spanId = `span-${Date.now()}-${uuidv4().slice(0, 6)}`;
    const span = {
      spanId,
      name,
      metadata,
      startTime: Date.now(),
      status: 'running'
    };

    if (trace) {
      trace.spans.push(span);
    }
    return spanId;
  }

  /**
   * Ends a span with output or error
   */
  static endSpan(traceId, spanId, outputOrError = {}) {
    const trace = activeTraces.get(traceId);
    if (!trace) return null;

    const span = trace.spans.find(s => s.spanId === spanId);
    if (!span) return null;

    span.endTime = Date.now();
    span.latencyMs = span.endTime - span.startTime;

    if (outputOrError.error) {
      span.status = 'error';
      span.error = outputOrError.error;
    } else {
      span.status = 'completed';
      span.output = outputOrError.output !== undefined ? outputOrError.output : outputOrError;
    }

    return span;
  }

  /**
   * Finalizes and persists an end-to-end trace
   */
  static async endTrace(traceId, {
    intent = null,
    agentAssigned = null,
    modelUsed = null,
    status = 'success',
    error = null,
    tokens = null,
    cost = null
  } = {}) {
    const trace = activeTraces.get(traceId);
    const totalLatency = trace ? (Date.now() - trace.startTime) : 0;

    // Estimate tokens if not provided (~4 chars per token for user input and span outputs)
    let totalTokens = tokens;
    if (totalTokens === null && trace) {
      let charCount = (trace.userInput || '').length;
      trace.spans.forEach(s => {
        if (s.output) charCount += JSON.stringify(s.output).length;
      });
      totalTokens = Math.max(12, Math.round(charCount / 4));
    }

    // Estimate cost based on model
    let costUsd = cost;
    if (costUsd === null) {
      const model = (modelUsed || (trace ? trace.modelUsed : '') || '').toLowerCase();
      if (model.includes('pro')) {
        costUsd = Number(((totalTokens / 1000) * 0.00125).toFixed(6));
      } else if (model.includes('flash')) {
        costUsd = Number(((totalTokens / 1000) * 0.000075).toFixed(6));
      } else {
        costUsd = 0.0; // Local Ollama or Smart Reflex
      }
    }

    const finalIntent = intent || (trace ? trace.intent : 'general');
    const finalAgent = agentAssigned || (trace ? trace.agentAssigned : 'CoordinatorAgent');
    const finalModel = modelUsed || (trace ? trace.modelUsed : 'smart-reflex');
    const spansJson = JSON.stringify(trace ? trace.spans : []);

    try {
      await run(
        `UPDATE request_traces 
        SET intent = ?, agent_assigned = ?, model_used = ?, latency_ms = ?, total_tokens = ?, cost_usd = ?, status = ?, error = ?, spans = ?
        WHERE trace_id = ?`,
        [
          finalIntent,
          finalAgent,
          finalModel,
          totalLatency,
          totalTokens,
          costUsd,
          status,
          error ? String(error) : null,
          spansJson,
          traceId
        ]
      );
    } catch (e) {
      console.warn('[Observability] Trace update error:', e.message);
    }

    const finalizedTrace = {
      ...(trace || {}),
      traceId,
      intent: finalIntent,
      agentAssigned: finalAgent,
      modelUsed: finalModel,
      latencyMs: totalLatency,
      totalTokens,
      costUsd,
      status,
      error: error ? String(error) : null
    };

    activeTraces.delete(traceId);
    this.broadcast('NEW_OBSERVABILITY_TRACE', finalizedTrace);

    return finalizedTrace;
  }

  /**
   * Retrieves traces with filtering and pagination
   */
  static async getTraces({ limit = 50, offset = 0, status = null, search = null } = {}) {
    let sql = 'SELECT * FROM request_traces WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      sql += ' AND (user_input LIKE ? OR intent LIKE ? OR agent_assigned LIKE ? OR model_used LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await query(sql, params);
    return rows.map(r => ({
      ...r,
      spans: typeof r.spans === 'string' ? JSON.parse(r.spans || '[]') : r.spans
    }));
  }

  /**
   * Retrieves single trace by trace_id or id
   */
  static async getTraceById(traceId) {
    const row = await get('SELECT * FROM request_traces WHERE trace_id = ? OR id = ?', [traceId, traceId]);
    if (!row) return null;
    return {
      ...row,
      spans: typeof row.spans === 'string' ? JSON.parse(row.spans || '[]') : row.spans
    };
  }

  /**
   * Aggregates observability telemetry statistics
   */
  static async getObservabilityStats() {
    const totalRow = await get('SELECT COUNT(*) as count, AVG(latency_ms) as avg_latency, SUM(total_tokens) as total_tokens, SUM(cost_usd) as total_cost FROM request_traces');
    const failedRow = await get('SELECT COUNT(*) as count FROM request_traces WHERE status = "error"');
    const modelDistribution = await query('SELECT model_used, COUNT(*) as count FROM request_traces GROUP BY model_used');

    const totalCount = totalRow ? totalRow.count : 0;
    const failedCount = failedRow ? failedRow.count : 0;
    const errorRate = totalCount > 0 ? Number(((failedCount / totalCount) * 100).toFixed(2)) : 0;

    return {
      totalTraces: totalCount,
      avgLatencyMs: Math.round(totalRow?.avg_latency || 0),
      totalTokens: totalRow?.total_tokens || 0,
      totalCostUsd: Number((totalRow?.total_cost || 0).toFixed(4)),
      failedTraces: failedCount,
      errorRatePercent: errorRate,
      modelDistribution: modelDistribution.reduce((acc, row) => {
        acc[row.model_used || 'unknown'] = row.count;
        return acc;
      }, {})
    };
  }
}

export default ObservabilityService;
