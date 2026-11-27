import express from 'express';
import ObservabilityService from '../services/observabilityService.js';

const router = express.Router();

/**
 * GET /api/observability/traces
 * Query list of traces with pagination, status filter and search
 */
router.get('/traces', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const status = req.query.status || null;
    const search = req.query.search || null;

    const traces = await ObservabilityService.getTraces({ limit, offset, status, search });
    res.json({ success: true, count: traces.length, traces });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/observability/traces/:traceId
 * Retrieve detailed trace breakdown with all execution spans
 */
router.get('/traces/:traceId', async (req, res) => {
  try {
    const trace = await ObservabilityService.getTraceById(req.params.traceId);
    if (!trace) {
      return res.status(404).json({ success: false, error: 'Trace not found' });
    }
    res.json({ success: true, trace });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/observability/stats
 * Aggregate telemetry metrics (average latency, total tokens, cost, error rate)
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await ObservabilityService.getObservabilityStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
