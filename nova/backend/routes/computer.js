import express from 'express';
import axios from 'axios';
import { get, run } from '../database/db.js';
import { getOrchestrator } from '../ai/orchestrator.js';
import VisualPerceptionService from '../services/visualPerceptionService.js';
import ComputerUnderstandingService from '../services/computerUnderstandingService.js';
import ComputerControlService from '../services/computerControlService.js';

const router = express.Router();

const getAgentConfig = async () => {
  const urlRow = await get("SELECT value FROM settings WHERE key = 'python_agent_url'");
  const tokenRow = await get("SELECT value FROM settings WHERE key = 'python_agent_token'");
  return {
    url: (urlRow && urlRow.value) ? urlRow.value.replace(/\/$/, '') : 'http://localhost:8000',
    token: (tokenRow && tokenRow.value) ? tokenRow.value : 'nova-local-agent-secure-token-2026'
  };
};

router.get('/status', async (req, res) => {
  const cfg = await getAgentConfig();
  try {
    const health = await axios.get(`${cfg.url}/health`, { timeout: 2500 });
    const info = await axios.get(`${cfg.url}/api/system/info`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 3000
    });
    res.json({
      success: true,
      agentOnline: true,
      agentUrl: cfg.url,
      telemetry: info.data
    });
  } catch (err) {
    res.json({
      success: true,
      agentOnline: false,
      agentUrl: cfg.url,
      error: `Python agent unreachable (${err.message}). Launch python agent via: python python-agent/agent.py`,
      telemetry: {
        os: 'Windows (Offline Telemetry Cache)',
        cpu: { percent: 12.0, cores: 8, freq_mhz: 3200 },
        memory: { percent: 38.5, used_gb: 6.16, total_gb: 16.0 },
        disk: { percent: 45.0, used_gb: 225.0, total_gb: 500.0 }
      }
    });
  }
});

router.get('/processes', async (req, res) => {
  const cfg = await getAgentConfig();
  try {
    const response = await axios.get(`${cfg.url}/api/system/processes?limit=10`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 3000
    });
    res.json(response.data);
  } catch (err) {
    res.json({ success: false, error: err.message, processes: [] });
  }
});

router.get('/allowed-apps', async (req, res) => {
  const cfg = await getAgentConfig();
  try {
    const response = await axios.get(`${cfg.url}/api/system/allowed-apps`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 2500
    });
    res.json(response.data);
  } catch (err) {
    res.json({
      success: true,
      apps: ['code', 'vscode', 'chrome', 'edge', 'notepad', 'calc', 'terminal', 'cmd', 'powershell', 'explorer', 'spotify', 'taskmgr']
    });
  }
});

router.post('/open-app', async (req, res) => {
  const { app_name } = req.body;
  if (!app_name) return res.status(400).json({ success: false, error: 'app_name required' });

  const cfg = await getAgentConfig();
  try {
    const response = await axios.post(`${cfg.url}/api/action/open-app`, { app_name }, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 5000
    });
    const orchestrator = getOrchestrator();
    orchestrator?.logActivity('Open Application', 'COMPUTER', `Launched ${app_name}`, 'success');
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.post('/open-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'url required' });

  const cfg = await getAgentConfig();
  try {
    const response = await axios.post(`${cfg.url}/api/action/open-url`, { url }, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 5000
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.post('/search-files', async (req, res) => {
  const { directory, pattern, limit } = req.body;
  const cfg = await getAgentConfig();
  try {
    const response = await axios.post(`${cfg.url}/api/action/search-files`, {
      directory: directory || '.',
      pattern: pattern || '*',
      limit: limit || 50
    }, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 8000
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.post('/read-file', async (req, res) => {
  const { file_path } = req.body;
  if (!file_path) return res.status(400).json({ success: false, error: 'file_path required' });

  const cfg = await getAgentConfig();
  try {
    const response = await axios.post(`${cfg.url}/api/action/read-file`, { file_path }, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 8000
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.post('/create-folder', async (req, res) => {
  const { folder_path } = req.body;
  const cfg = await getAgentConfig();
  try {
    const response = await axios.post(`${cfg.url}/api/action/create-folder`, { folder_path }, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 5000
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

// ==========================================
// PHASE 3: DESKTOP AUTOMATION ROUTES
// ==========================================

router.get('/windows', async (req, res) => {
  const cfg = await getAgentConfig();
  try {
    const response = await axios.get(`${cfg.url}/api/desktop/windows`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 5000
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.post('/window-action', async (req, res) => {
  const cfg = await getAgentConfig();
  try {
    const response = await axios.post(`${cfg.url}/api/desktop/window-action`, req.body, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 5000
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.post('/mouse-action', async (req, res) => {
  const cfg = await getAgentConfig();
  try {
    const response = await axios.post(`${cfg.url}/api/desktop/mouse-action`, req.body, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 5000
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.post('/keyboard-action', async (req, res) => {
  const cfg = await getAgentConfig();
  try {
    const response = await axios.post(`${cfg.url}/api/desktop/keyboard-action`, req.body, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 5000
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.get('/clipboard', async (req, res) => {
  const cfg = await getAgentConfig();
  try {
    const response = await axios.get(`${cfg.url}/api/desktop/clipboard`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 5000
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.post('/clipboard', async (req, res) => {
  const cfg = await getAgentConfig();
  try {
    const response = await axios.post(`${cfg.url}/api/desktop/clipboard`, req.body, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 5000
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.post('/inspect-app', async (req, res) => {
  const cfg = await getAgentConfig();
  try {
    const response = await axios.post(`${cfg.url}/api/desktop/inspect-app`, req.body, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 5000
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

// ==========================================
// PHASE 16: AUTONOMOUS COMPUTER INTELLIGENCE ROUTES
// ==========================================

router.get('/intelligence/state', async (req, res) => {
  try {
    const data = await ComputerControlService.getDashboardState();
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/intelligence/permission', async (req, res) => {
  try {
    const { granted, updatedBy } = req.body || {};
    const out = await VisualPerceptionService.setScreenPermission(Boolean(granted), updatedBy || 'dashboard_operator');
    res.json(out);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/intelligence/observe', async (req, res) => {
  try {
    const { hwnd, mode, includeOcr, includeUiTree, includeImage, permissionGranted } = req.body || {};
    const obs = await VisualPerceptionService.observe({
      hwnd: hwnd || null,
      mode: mode || 'window',
      includeOcr: includeOcr !== false,
      includeUiTree: includeUiTree !== false,
      includeImage: Boolean(includeImage),
      permissionGranted: permissionGranted !== undefined ? permissionGranted : null
    });
    if (!obs.success) {
      return res.status(obs.permission_denied ? 403 : 500).json(obs);
    }
    const desktopState = ComputerUnderstandingService.buildDesktopState(obs);
    await ComputerControlService.updateDashboardState({
      status: 'OBSERVED',
      active_app: desktopState.activeWindow?.display_app || desktopState.activeWindow?.process_name || 'Desktop',
      active_title: desktopState.activeWindow?.title || 'Desktop',
      active_hwnd: desktopState.activeWindow?.hwnd || null,
      detected_elements: desktopState.interactiveControls.slice(0, 25),
      last_confidence: obs.confidence,
      verification_status: 'OBSERVED',
      screen_permission_granted: 1
    });
    res.json({ success: true, observation: obs, desktopState });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/intelligence/execute', async (req, res) => {
  try {
    const out = await ComputerControlService.runClosedLoopTask(req.body || {});
    res.status(out.status === 'PERMISSION_DENIED' || out.status === 'BLOCKED_SECURITY_POLICY' ? 403 : 200).json(out);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/intelligence/click-element', async (req, res) => {
  const cfg = await getAgentConfig();
  try {
    const response = await axios.post(`${cfg.url}/api/desktop/click-element`, req.body, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 12000
    });
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

router.post('/intelligence/browser', async (req, res) => {
  const cfg = await getAgentConfig();
  try {
    const response = await axios.post(`${cfg.url}/api/action/browser`, req.body, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      timeout: 20000
    });
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

export default router;
