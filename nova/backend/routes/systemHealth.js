import express from 'express';
import { get, query } from '../database/db.js';
import BackupService from '../services/backupService.js';
import ErrorTrackingService from '../services/errorTrackingService.js';
import axios from 'axios';

const router = express.Router();

// 1. Deep System Health Audit
router.get('/health', async (req, res) => {
  try {
    // 1. Database PRAGMA integrity check
    const integrityRow = await get('PRAGMA integrity_check;');
    const isDbHealthy = integrityRow && integrityRow.integrity_check === 'ok';

    // 2. Python agent connectivity check
    let pythonAgentStatus = 'offline';
    let pythonTelemetry = null;
    try {
      const pyUrl = process.env.PYTHON_AGENT_URL || 'http://localhost:8000';
      let pyRes;
      try {
        pyRes = await axios.get(`${pyUrl}/health`, { timeout: 2000 });
      } catch (_) {
        pyRes = await axios.get(`${pyUrl}/`, { timeout: 2000 });
      }
      if (pyRes.status === 200) {
        pythonAgentStatus = 'online';
        pythonTelemetry = pyRes.data;
      }
    } catch (e) {
      pythonAgentStatus = 'offline';
    }

    // 3. Subsystem memory usage
    const memUsage = process.memoryUsage();

    // 4. Counts of active records
    const missionsCount = await get("SELECT COUNT(*) as count FROM missions WHERE status = 'RUNNING'");
    const tasksCount = await get("SELECT COUNT(*) as count FROM tasks WHERE status != 'completed'");

    res.json({
      success: true,
      status: isDbHealthy ? 'OPTIMAL' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      database: {
        status: isDbHealthy ? 'HEALTHY' : 'CORRUPT',
        integrity_check: integrityRow ? integrityRow.integrity_check : 'unknown'
      },
      pythonAgent: {
        status: pythonAgentStatus,
        details: pythonTelemetry
      },
      process: {
        uptime_seconds: Math.round(process.uptime()),
        memory_mb: {
          rss: Math.round(memUsage.rss / 1024 / 1024),
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
        }
      },
      activeWorkload: {
        runningMissions: missionsCount ? missionsCount.count : 0,
        pendingTasks: tasksCount ? tasksCount.count : 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. System Backups
router.get('/backups', async (req, res) => {
  try {
    const backups = await BackupService.listBackups();
    res.json({ success: true, count: backups.length, backups });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/backups', async (req, res) => {
  try {
    const backup = await BackupService.createHotBackup();
    res.json({ success: true, backup });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/backups/:id/verify', async (req, res) => {
  try {
    const result = await BackupService.verifyBackup(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/backups/:id', async (req, res) => {
  try {
    const deleted = await BackupService.deleteBackup(req.params.id);
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. System Errors & Diagnostics
router.get('/errors', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const errors = await ErrorTrackingService.getRecentErrors(limit);
    const stats = await ErrorTrackingService.getErrorStats();
    res.json({ success: true, stats, count: errors.length, errors });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/errors', async (req, res) => {
  try {
    const { errorCode, message, stack, subsystem, severity, recoveryAttempted, recoveryStatus } = req.body;
    const logged = await ErrorTrackingService.logError({
      errorCode,
      message,
      stack,
      subsystem,
      severity,
      recoveryAttempted,
      recoveryStatus
    });
    res.json({ success: true, error: logged });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/errors/:id/resolve', async (req, res) => {
  try {
    const { resolution } = req.body;
    const resolved = await ErrorTrackingService.resolveError(req.params.id, resolution || 'RESOLVED');
    res.json({ success: true, resolved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
