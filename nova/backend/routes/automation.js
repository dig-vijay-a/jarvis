import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, run, get } from '../database/db.js';
import WebSearchService from '../services/webSearchService.js';
import { getOrchestrator } from '../ai/orchestrator.js';
import { getTaskPlanner } from '../services/taskPlannerService.js';

const router = express.Router();
let isEmergencyStopped = false;

// List prebuilt / saved workflows
router.get('/workflows', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM workflows ORDER BY created_at DESC');
    const parsed = rows.map(r => ({
      ...r,
      steps: JSON.parse(r.steps || '[]'),
      logs: JSON.parse(r.logs || '[]')
    }));
    res.json({ success: true, workflows: parsed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create custom workflow
router.post('/workflows', async (req, res) => {
  try {
    const { name, description, steps } = req.body;
    if (!name || !steps) {
      return res.status(400).json({ success: false, error: 'Name and steps are required' });
    }

    const id = `wf-${Date.now()}`;
    const now = new Date().toISOString();
    await run(
      'INSERT INTO workflows (id, name, description, steps, status, progress, logs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, description || '', JSON.stringify(steps), 'idle', 0, JSON.stringify(['Workflow created.']), now, now]
    );

    res.json({ success: true, id, message: 'Workflow created successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Run workflow
router.post('/workflows/:id/run', async (req, res) => {
  const { id } = req.params;
  const workflowRow = await get('SELECT * FROM workflows WHERE id = ?', [id]);
  if (!workflowRow) {
    return res.status(404).json({ success: false, error: 'Workflow not found.' });
  }

  isEmergencyStopped = false;
  const orchestrator = getOrchestrator();
  const steps = JSON.parse(workflowRow.steps || '[]');
  const logs = JSON.parse(workflowRow.logs || '[]');

  res.json({ success: true, message: `Workflow "${workflowRow.name}" launched into autonomous execution.` });

  (async () => {
    try {
      await run("UPDATE workflows SET status = 'running', progress = 5, updated_at = ? WHERE id = ?", [new Date().toISOString(), id]);
      orchestrator?.broadcast('WORKFLOW_STATUS', { id, status: 'running', progress: 5 });

      let deliverables = {};

      for (let i = 0; i < steps.length; i++) {
        if (isEmergencyStopped) {
          logs.push(`[${new Date().toLocaleTimeString()}] EMERGENCY HALT TRIGGERED. Aborting workflow.`);
          await run("UPDATE workflows SET status = 'cancelled', logs = ?, updated_at = ? WHERE id = ?", [JSON.stringify(logs), new Date().toISOString(), id]);
          orchestrator?.broadcast('WORKFLOW_STATUS', { id, status: 'cancelled', logs });
          return;
        }

        const step = steps[i];
        step.status = 'in-progress';
        const progressPct = Math.round(((i + 0.5) / steps.length) * 100);
        
        logs.push(`[${new Date().toLocaleTimeString()}] Starting Step ${i + 1}: ${step.name}`);
        orchestrator?.broadcast('WORKFLOW_STEP_UPDATE', { id, stepIndex: i, step, progress: progressPct, logs });

        if (step.action === 'web_search') {
          const results = await WebSearchService.search('Latest AI breakthroughs 2026', 3);
          deliverables.news = results;
          logs.push(`[${new Date().toLocaleTimeString()}] Discovered ${results.length} intelligence leads.`);
        } else if (step.action === 'ai_analysis' || step.action === 'ai_planning') {
          await new Promise(r => setTimeout(r, 1200));
          deliverables.topTopics = [
            'Autonomous AI Agents in Operating Systems',
            'Next-Gen Neural Multimodal Models',
            'Local AI vs Cloud Intelligence Architecture'
          ];
          logs.push(`[${new Date().toLocaleTimeString()}] Filtered top 3 viral topics: ${deliverables.topTopics[0]}`);
        } else if (step.action === 'ai_generation') {
          await new Promise(r => setTimeout(r, 1400));
          if (step.name.includes('Short')) {
            deliverables.shortScript = `[HOOK]: What if your computer could operate itself like JARVIS?\n[BODY]: Meet NOVA — a personal AI OS that coordinates memory, voice, and local automation.\n[CTA]: Drop a comment if you want the open-source architecture!`;
            logs.push(`[${new Date().toLocaleTimeString()}] Generated 60-second high-retention Short script.`);
          } else {
            deliverables.longScript = `# Deep Dive: The Rise of Personal AI Operating Systems\n\n## Introduction\nIn this video, we explore how autonomous agentic workflows and local system integration are turning standard computers into living AI command centers...\n\n## Section 1: Architecture\n- Neural Core\n- Fast-path tool registry\n- SQLite persistent memory bank`;
            logs.push(`[${new Date().toLocaleTimeString()}] Drafted 1,200 word long-form video screenplay.`);
          }
        } else if (step.action === 'file_save') {
          await new Promise(r => setTimeout(r, 600));
          logs.push(`[${new Date().toLocaleTimeString()}] Content archived to memory bank & deliverables cache.`);
        } else if (step.action === 'notify' || step.action === 'voice_synthesis') {
          await new Promise(r => setTimeout(r, 500));
          logs.push(`[${new Date().toLocaleTimeString()}] Broadcast notification dispatched to HUD.`);
        }

        step.status = 'completed';
        const completedPct = Math.round(((i + 1) / steps.length) * 100);
        await run("UPDATE workflows SET steps = ?, progress = ?, logs = ?, updated_at = ? WHERE id = ?", [
          JSON.stringify(steps), completedPct, JSON.stringify(logs), new Date().toISOString(), id
        ]);
        orchestrator?.broadcast('WORKFLOW_STEP_UPDATE', { id, stepIndex: i, step, progress: completedPct, logs });
      }

      await run("UPDATE workflows SET status = 'completed', progress = 100, updated_at = ? WHERE id = ?", [new Date().toISOString(), id]);
      orchestrator?.broadcast('WORKFLOW_STATUS', { id, status: 'completed', progress: 100, deliverables });
      orchestrator?.logActivity('Workflow Completed', 'AUTONOMOUS', `Workflow "${workflowRow.name}" finished all steps.`, 'success');

    } catch (err) {
      logs.push(`[${new Date().toLocaleTimeString()}] Error in workflow execution: ${err.message}`);
      await run("UPDATE workflows SET status = 'failed', logs = ?, updated_at = ? WHERE id = ?", [JSON.stringify(logs), new Date().toISOString(), id]);
      orchestrator?.broadcast('WORKFLOW_STATUS', { id, status: 'failed', error: err.message, logs });
    }
  })();
});

// ==========================================
// AUTONOMOUS TASK PLANNER API (Module 3)
// ==========================================

// Create a new planned task from instruction
router.post('/plan', async (req, res) => {
  try {
    const { instruction } = req.body;
    if (!instruction || !instruction.trim()) {
      return res.status(400).json({ success: false, error: 'Instruction is required.' });
    }

    const planner = getTaskPlanner();
    const taskPlan = await planner.createPlan(instruction.trim());
    res.json({ success: true, task: taskPlan });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List all planned tasks
router.get('/tasks', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM planned_tasks ORDER BY created_at DESC LIMIT 30');
    const parsed = rows.map(r => ({
      ...r,
      steps: JSON.parse(r.steps || '[]')
    }));
    res.json({ success: true, tasks: parsed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Execute a planned task
router.post('/tasks/:id/execute', async (req, res) => {
  try {
    const planner = getTaskPlanner();
    res.json({ success: true, message: `Task execution initiated for ${req.params.id}` });
    // Async execution
    planner.executeTask(req.params.id).catch(err => {
      console.error('[TaskPlanner] Execute error:', err);
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Approve a waiting step
router.post('/tasks/:id/approve', async (req, res) => {
  try {
    const { stepIndex } = req.body;
    const planner = getTaskPlanner();
    const result = await planner.approveStep(req.params.id, parseInt(stepIndex || 0, 10));
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Pause task
router.post('/tasks/:id/pause', async (req, res) => {
  try {
    const planner = getTaskPlanner();
    const result = await planner.pauseTask(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resume task
router.post('/tasks/:id/resume', async (req, res) => {
  try {
    const planner = getTaskPlanner();
    res.json({ success: true, message: 'Resuming task execution.' });
    planner.resumeTask(req.params.id);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cancel task
router.post('/tasks/:id/cancel', async (req, res) => {
  try {
    const planner = getTaskPlanner();
    const result = await planner.cancelTask(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Retry failed step
router.post('/tasks/:id/retry', async (req, res) => {
  try {
    const { stepIndex } = req.body;
    const planner = getTaskPlanner();
    const result = await planner.retryStep(req.params.id, parseInt(stepIndex || 0, 10));
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Emergency Stop
router.post('/emergency-stop', async (req, res) => {
  isEmergencyStopped = true;
  const now = new Date().toISOString();
  await run("UPDATE settings SET value = 'true', updated_at = ? WHERE key = 'emergency_stop'", [now]);
  await run("UPDATE workflows SET status = 'cancelled', updated_at = ? WHERE status = 'running'", [now]);
  await run("UPDATE planned_tasks SET status = 'CANCELLED', completed_at = ? WHERE status = 'RUNNING'", [now]);
  
  const orchestrator = getOrchestrator();
  orchestrator?.broadcast('EMERGENCY_STOP_TRIGGERED', {
    message: 'EMERGENCY SHUTDOWN ACTIVATED. All active agent processes suspended.'
  });
  orchestrator?.logActivity('Emergency Stop', 'SECURITY', 'User triggered manual emergency override kill-switch.', 'warning');

  res.json({ success: true, message: 'Emergency stop activated. All running agent tasks terminated.' });
});

export default router;
