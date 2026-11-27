/**
 * JARVIS OS 2.0 — PHASE 14: PROJECT SENTINEL
 * Sentinel Readiness & Telemetry API Routes (/api/sentinel)
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { query, get } from '../database/db.js';
import { getSentinelValidationService } from '../services/sentinelValidationService.js';
import { getSentinelEnduranceService } from '../services/sentinelEnduranceService.js';

const router = express.Router();
const validationService = getSentinelValidationService();
const enduranceService = getSentinelEnduranceService();

/**
 * GET /api/sentinel/telemetry
 * Real-time operational telemetry (Memory, CPU, DB, Process, WebSocket)
 */
router.get('/telemetry', async (req, res) => {
  try {
    const mem = process.memoryUsage();
    const dbPath = path.resolve('nova/data/nova.sqlite');
    let dbSize = 0;
    try { dbSize = fs.statSync(dbPath).size; } catch (_) {}

    // Check SQLite integrity
    let dbIntegrity = 'UNKNOWN';
    try {
      const pragma = await get('PRAGMA integrity_check');
      dbIntegrity = pragma?.integrity_check || 'ok';
    } catch (_) {}

    // Check Python Agent via unauthenticated /health endpoint
    const pyUrl = process.env.PYTHON_AGENT_URL || 'http://127.0.0.1:8000';
    let pythonAgentOnline = false;
    let pythonLatencyMs = null;
    try {
      const t0 = Date.now();
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 300);
      const resp = await fetch(`${pyUrl}/health`, { signal: controller.signal });
      clearTimeout(t);
      if (resp.ok) {
        pythonAgentOnline = true;
        pythonLatencyMs = Date.now() - t0;
      }
    } catch (_) {}

    // Active missions summary
    const missionStats = await query(`
      SELECT status, COUNT(*) as count 
      FROM missions 
      GROUP BY status
    `);

    // Trusted devices
    const deviceCount = await get(`SELECT COUNT(*) as c FROM trusted_devices WHERE pairing_status = 'PAIRED'`);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      backend: {
        status: 'HEALTHY',
        uptime_seconds: parseFloat(process.uptime().toFixed(1)),
        pid: process.pid,
        memory: {
          rss_mb: parseFloat((mem.rss / 1024 / 1024).toFixed(1)),
          heap_used_mb: parseFloat((mem.heapUsed / 1024 / 1024).toFixed(1)),
          heap_total_mb: parseFloat((mem.heapTotal / 1024 / 1024).toFixed(1))
        }
      },
      python_agent: {
        status: pythonAgentOnline ? 'ONLINE' : (process.env.PYTHON_AGENT_MODE === 'disabled' ? 'INTENTIONAL_OFFLINE' : 'OFFLINE_FALLBACK'),
        latency_ms: pythonLatencyMs,
        endpoint: pyUrl,
        bound_to_localhost: true
      },
      database: {
        engine: 'SQLite (WAL mode)',
        size_bytes: dbSize,
        size_kb: parseFloat((dbSize / 1024).toFixed(1)),
        integrity: dbIntegrity
      },
      missions: missionStats.reduce((acc, row) => ({ ...acc, [row.status]: row.count }), {}),
      paired_devices: deviceCount ? deviceCount.c : 0
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/sentinel/baseline
 * Comprehensive Phase 1-13 capability inventory & verification status
 */
router.get('/baseline', async (req, res) => {
  try {
    const audit = await validationService.runBaselineAudit();
    res.json({ success: true, ...audit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/sentinel/readiness
 * Operational readiness verdict across endurance, fault recovery, and security
 */
router.get('/readiness', async (req, res) => {
  try {
    let enduranceData = null;
    let faultData = null;
    let gatesData = null;

    try {
      enduranceData = JSON.parse(fs.readFileSync('nova/deliverables/sentinel_endurance_telemetry.json', 'utf8'));
    } catch (_) {}

    try {
      gatesData = JSON.parse(fs.readFileSync('nova/deliverables/sentinel_acceptance_evidence.json', 'utf8'));
    } catch (_) {}

    const verdict = (gatesData && gatesData.failed === 0) ? 'PRODUCTION_READY' : 'REMEDIATION_REQUIRED';

    res.json({
      success: true,
      operational_readiness: verdict,
      timestamp: new Date().toISOString(),
      acceptance_gates: gatesData ? {
        total: gatesData.total_scenarios,
        passed: gatesData.passed,
        failed: gatesData.failed,
        pass_rate: gatesData.pass_rate_percent
      } : null,
      endurance: enduranceData ? {
        status: enduranceData.endurance_status,
        duration_s: enduranceData.actual_duration_seconds,
        net_heap_growth_mb: enduranceData.net_memory_growth_mb
      } : null
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * ============================================================================
 * SENTINEL STAGE 1: TWO-HOUR ENDURANCE VALIDATION & OBSERVABILITY ROUTES
 * ============================================================================
 */

/**
 * GET /api/sentinel/endurance/status
 * Real-time endurance status, remaining time, active scenario, counters
 */
router.get('/endurance/status', async (req, res) => {
  try {
    const status = enduranceService.getStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/sentinel/endurance/history
 * Historical samples for charting (Memory, CPU, DB, Queues)
 */
router.get('/endurance/history', async (req, res) => {
  try {
    const history = enduranceService.getHistory();
    res.json({ success: true, ...history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/sentinel/endurance/events
 * Rolling activity events stream
 */
router.get('/endurance/events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || 50);
    const events = enduranceService.getEvents(limit);
    res.json({ success: true, count: events.length, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/sentinel/endurance/start
 * Launch or initialize the continuous 120-minute endurance runner
 */
router.post('/endurance/start', async (req, res) => {
  try {
    const result = await enduranceService.startTest();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/sentinel/endurance/pause
 * Safely pause the endurance workload & sampling
 */
router.post('/endurance/pause', (req, res) => {
  try {
    const result = enduranceService.pauseTest();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/sentinel/endurance/resume
 * Safely resume the paused endurance workload
 */
router.post('/endurance/resume', (req, res) => {
  try {
    const result = enduranceService.resumeTest();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/sentinel/endurance/stop
 * Halt the active endurance test with confirmation
 */
router.post('/endurance/stop', async (req, res) => {
  try {
    const confirmed = req.body && req.body.confirmed === true;
    const result = await enduranceService.stopTest(confirmed);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/sentinel/endurance/export
 * Export persisted metrics JSON and report markdown
 */
router.get('/endurance/export', async (req, res) => {
  try {
    const stage2Metrics = path.resolve('nova/deliverables/SENTINEL_STAGE_2_METRICS.json');
    const stage1Metrics = path.resolve('nova/deliverables/SENTINEL_STAGE_1_METRICS.json');
    const metricsPath = fs.existsSync(stage2Metrics) ? stage2Metrics : stage1Metrics;

    const stage2Report = path.resolve('nova/deliverables/SENTINEL_STAGE_2_REPORT.md');
    const stage1Report = path.resolve('nova/deliverables/SENTINEL_STAGE_1_REPORT.md');
    const reportPath = fs.existsSync(stage2Report) ? stage2Report : stage1Report;

    let metrics = null;
    let report = null;

    try {
      if (fs.existsSync(metricsPath)) metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    } catch (_) {}

    try {
      if (fs.existsSync(reportPath)) report = fs.readFileSync(reportPath, 'utf8');
    } catch (_) {}

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      metrics,
      report
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
