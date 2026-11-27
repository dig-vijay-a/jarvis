import { query, run, get } from '../database/db.js';
import ToolRegistry from '../tools/registry.js';
import { getMissionControl, MissionControlService } from './missionControlService.js';
import { v4 as uuidv4 } from 'uuid';

export const TASK_STATUSES = {
  PENDING: 'PENDING',
  PLANNING: 'PLANNING',
  RUNNING: 'RUNNING',
  WAITING_FOR_APPROVAL: 'WAITING_FOR_APPROVAL',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
};

// Tools that require explicit user approval before execution
const SENSITIVE_TOOLS = new Set([
  'rename_file',
  'delete_memory',
  'emergency_stop',
  'execute_script'
]);

/**
 * TaskPlannerService (Consolidated with MissionControlService)
 * Wraps canonical MissionControl DAG execution while preserving backward compatibility for /api/automation routes
 */
export class TaskPlannerService {
  constructor(wss) {
    this.wss = wss;
    this.activeExecutionControllers = new Map();
  }

  getMissionControlService() {
    return getMissionControl() || new MissionControlService(this.wss);
  }

  broadcast(event, data) {
    if (!this.wss) return;
    const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    this.wss.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(payload);
      }
    });
  }

  /**
   * Generates a multi-step execution plan from a user instruction using canonical MissionControl
   */
  async createPlan(instruction) {
    const mc = this.getMissionControlService();
    const mission = await mc.createMission(instruction);
    const taskId = mission.id;
    const now = new Date().toISOString();

    const steps = (mission.steps || []).map((s, idx) => ({
      id: s.step_index || idx + 1,
      name: s.title,
      tool: s.tool && s.tool !== 'none' ? s.tool : null,
      args: s.args || {},
      status: TASK_STATUSES.PENDING,
      requires_approval: Boolean(s.requires_approval || SENSITIVE_TOOLS.has(s.tool)),
      result: null,
      error: null,
      started_at: null,
      completed_at: null
    }));

    await run(
      'INSERT OR REPLACE INTO planned_tasks (id, instruction, plan, steps, status, current_step_index, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
      [taskId, instruction, mission.plan_summary, JSON.stringify(steps), TASK_STATUSES.PENDING, now]
    );

    const taskRecord = {
      id: taskId,
      instruction,
      plan: mission.plan_summary,
      steps,
      status: TASK_STATUSES.PENDING,
      current_step_index: 0,
      created_at: now,
      mission_id: mission.id
    };

    this.broadcast('TASK_PLAN_CREATED', taskRecord);
    return taskRecord;
  }

  generateHeuristicSteps(instruction) {
    throw new Error('HEURISTIC_FALLBACK_DISABLED: Generic heuristic step generation is disabled in SENTINEL Stage 4.1; local model planning is required.');
  }

  /**
   * Executes a planned task step-by-step via canonical MissionControl
   */
  async executeTask(taskId) {
    const mc = this.getMissionControlService();
    // Check if mission exists, otherwise sync from planned_tasks
    let mission = await mc.getMission(taskId);
    if (!mission) {
      const taskRow = await get('SELECT * FROM planned_tasks WHERE id = ?', [taskId]);
      if (taskRow) {
        mission = await mc.createMission(taskRow.instruction);
      }
    }

    const missionIdToStart = mission ? mission.id : taskId;
    await run('UPDATE planned_tasks SET status = ?, started_at = ? WHERE id = ?', [
      TASK_STATUSES.RUNNING,
      new Date().toISOString(),
      taskId
    ]);
    this.broadcast('TASK_PLAN_STATUS', { id: taskId, status: TASK_STATUSES.RUNNING });

    return mc.startMission(missionIdToStart);
  }

  async approveStep(taskId, stepIndex) {
    const mc = this.getMissionControlService();
    const steps = await query('SELECT * FROM mission_steps WHERE mission_id = ? ORDER BY step_index ASC', [taskId]);
    const targetStep = steps[stepIndex] || steps.find(s => s.step_index === (stepIndex + 1));
    if (targetStep) {
      return mc.approveStep(taskId, targetStep.id);
    }
    return { success: true, message: `Approved step ${stepIndex + 1}` };
  }

  async pauseTask(taskId) {
    const mc = this.getMissionControlService();
    mc.pauseMission(taskId);
    await run("UPDATE planned_tasks SET status = 'PAUSED' WHERE id = ?", [taskId]);
    this.broadcast('TASK_PLAN_STATUS', { id: taskId, status: 'PAUSED' });
    return { success: true, message: 'Task paused.' };
  }

  async resumeTask(taskId) {
    const mc = this.getMissionControlService();
    await run("UPDATE planned_tasks SET status = 'RUNNING' WHERE id = ?", [taskId]);
    return mc.resumeMission(taskId);
  }

  async cancelTask(taskId) {
    const mc = this.getMissionControlService();
    mc.cancelMission(taskId);
    await run("UPDATE planned_tasks SET status = 'CANCELLED', completed_at = ? WHERE id = ?", [
      new Date().toISOString(),
      taskId
    ]);
    this.broadcast('TASK_PLAN_STATUS', { id: taskId, status: 'CANCELLED' });
    return { success: true, message: 'Task cancelled.' };
  }

  async retryStep(taskId, stepIndex) {
    const mc = this.getMissionControlService();
    const steps = await query('SELECT * FROM mission_steps WHERE mission_id = ? ORDER BY step_index ASC', [taskId]);
    const targetStep = steps[stepIndex] || steps.find(s => s.step_index === (stepIndex + 1));
    if (targetStep) {
      return mc.retryStep(taskId, targetStep.id);
    }
    return this.executeTask(taskId);
  }
}

let taskPlannerInstance = null;
export const initTaskPlanner = (wss) => {
  if (!taskPlannerInstance) {
    taskPlannerInstance = new TaskPlannerService(wss);
  }
  return taskPlannerInstance;
};

export const getTaskPlanner = () => taskPlannerInstance;
