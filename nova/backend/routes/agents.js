import express from 'express';
import CoordinatorAgent from '../ai/agents/CoordinatorAgent.js';
import { query } from '../database/db.js';

const router = express.Router();

router.get('/', (req, res) => {
  const roster = CoordinatorAgent.getAllAgents();
  res.json({
    success: true,
    agents: roster,
    coordinator: {
      name: 'Coordinator Agent',
      strategy: 'Capability-Scoped Least-Privilege Delegation'
    }
  });
});

router.post('/classify', (req, res) => {
  const { directive } = req.body;
  if (!directive) return res.status(400).json({ success: false, error: 'Directive required.' });

  const result = CoordinatorAgent.classifyIntentAndSelectAgent(directive);
  res.json({
    success: true,
    directive,
    intent: result.intent,
    assignedAgent: {
      key: result.agentKey,
      name: result.agent.name,
      role: result.agent.role,
      allowedTools: result.agent.allowedTools
    }
  });
});

router.post('/delegate', (req, res) => {
  const { directive = '', tool = null, preferredAgentKey = null } = req.body || {};
  const delegation = CoordinatorAgent.delegateTask({ directive, tool, preferredAgentKey });
  res.status(delegation.authorized ? 200 : 403).json({
    success: delegation.authorized,
    ...delegation,
    agent: delegation.agent?.getContractProfile ? delegation.agent.getContractProfile() : {
      name: delegation.agent?.name,
      role: delegation.agent?.role,
      allowedTools: delegation.agent?.allowedTools
    }
  });
});

router.get('/logs/all', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const logs = await query('SELECT * FROM agent_execution_logs ORDER BY created_at DESC LIMIT ?', [limit]);
    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:agentKey/logs', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const agent = CoordinatorAgent.getAgent(req.params.agentKey);
    if (!agent) return res.status(404).json({ success: false, error: `Agent '${req.params.agentKey}' not found.` });
    const logs = await agent.getExecutionLogs(limit);
    res.json({ success: true, agent_key: req.params.agentKey, count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
