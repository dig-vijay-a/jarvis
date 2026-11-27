import express from 'express';
import IntegrationService from '../services/integrationService.js';

const router = express.Router();

// List all connectors and their status
router.get('/', async (req, res) => {
  try {
    const list = await IntegrationService.getIntegrations();
    res.json({ success: true, count: list.length, integrations: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Configure / connect an integration
router.post('/:provider/configure', async (req, res) => {
  try {
    const { token, credentials, scopes } = req.body;
    const result = await IntegrationService.configureIntegration(req.params.provider, { token, credentials, scopes });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Disconnect an integration
router.post('/:provider/disconnect', async (req, res) => {
  try {
    const result = await IntegrationService.disconnectIntegration(req.params.provider);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Audit logs
router.get('/audit-logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const logs = await IntegrationService.getAuditLogs(limit);
    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// CONNECTOR API ENDPOINTS
// ==========================================

// Gmail
router.get('/gmail/messages', async (req, res) => {
  try {
    const filter = req.query.filter || '';
    const limit = parseInt(req.query.limit, 10) || 5;
    const result = await IntegrationService.gmailListMessages(filter, limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/gmail/send', async (req, res) => {
  try {
    const { to, subject, body, confirmed } = req.body;
    const result = await IntegrationService.gmailSendEmail({ to, subject, body, confirmed });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Google Calendar
router.get('/calendar/events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 5;
    const result = await IntegrationService.calendarListEvents(limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/calendar/create', async (req, res) => {
  try {
    const { summary, startTime, endTime, confirmed } = req.body;
    const result = await IntegrationService.calendarCreateEvent({ summary, startTime, endTime, confirmed });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Google Drive
router.get('/drive/files', async (req, res) => {
  try {
    const queryStr = req.query.q || '';
    const limit = parseInt(req.query.limit, 10) || 5;
    const result = await IntegrationService.driveListFiles(queryStr, limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GitHub
router.get('/github/repo', async (req, res) => {
  try {
    const repo = req.query.repo || 'digvijay/nova-ai-os';
    const result = await IntegrationService.githubCheckRepo(repo);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/github/issue', async (req, res) => {
  try {
    const { repo, title, body, confirmed } = req.body;
    const result = await IntegrationService.githubCreateIssue({ repo, title, body, confirmed });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
