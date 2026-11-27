import { query, run, get } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import KnowledgeGraphService from './knowledgeGraphService.js';

export const GOAL_STATUSES = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  IN_PROGRESS: 'IN_PROGRESS',
  STALLED: 'STALLED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

export class GoalManagementService {
  constructor(wss = null) {
    this.wss = wss;
  }

  setWebSocketServer(wss) {
    this.wss = wss;
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
   * Creates a persistent, user-approved autonomous goal
   */
  async createGoal({
    title,
    description = '',
    category = 'general',
    priority = 2,
    deadline = null,
    success_criteria = ''
  }) {
    if (!title || !title.trim()) {
      throw new Error('Goal title is required.');
    }

    const id = `goal-${Date.now()}-${uuidv4().substring(0, 6)}`;
    const now = new Date().toISOString();

    await run(
      `INSERT INTO autonomous_goals 
       (id, title, description, category, priority, status, deadline, success_criteria, progress, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        title.trim(),
        description.trim(),
        category,
        priority,
        GOAL_STATUSES.ACTIVE,
        deadline,
        success_criteria,
        now,
        now
      ]
    );

    const goal = await this.getGoalById(id);
    this.broadcast('GOAL_CREATED', goal);
    return goal;
  }

  /**
   * Retrieves all goals with optional status filtering
   */
  async getGoals(filter = {}) {
    let sql = 'SELECT * FROM autonomous_goals';
    const params = [];

    if (filter.status) {
      sql += ' WHERE status = ?';
      params.push(filter.status);
    }
    sql += ' ORDER BY priority DESC, created_at DESC';

    const rows = await query(sql, params);
    return rows;
  }

  /**
   * Retrieves a single goal by ID
   */
  async getGoalById(id) {
    return get('SELECT * FROM autonomous_goals WHERE id = ?', [id]);
  }

  /**
   * Links a canonical mission to an active goal
   */
  async linkMissionToGoal(goalId, missionId) {
    const now = new Date().toISOString();
    await run(
      'UPDATE autonomous_goals SET linked_mission_id = ?, status = ?, updated_at = ? WHERE id = ?',
      [missionId, GOAL_STATUSES.IN_PROGRESS, now, goalId]
    );
    await run('UPDATE missions SET goal_id = ? WHERE id = ?', [goalId, missionId]);

    const updated = await this.getGoalById(goalId);
    this.broadcast('GOAL_UPDATED', updated);
    return updated;
  }

  /**
   * Updates goal attributes, status, and progress
   */
  async updateGoal(id, updates = {}) {
    const existing = await this.getGoalById(id);
    if (!existing) throw new Error(`Goal ${id} not found.`);

    const title = updates.title !== undefined ? updates.title.trim() : existing.title;
    const description = updates.description !== undefined ? updates.description : existing.description;
    const status = updates.status !== undefined ? updates.status : existing.status;
    const progress = updates.progress !== undefined ? updates.progress : existing.progress;
    const deadline = updates.deadline !== undefined ? updates.deadline : existing.deadline;
    const criteria = updates.success_criteria !== undefined ? updates.success_criteria : existing.success_criteria;
    const now = new Date().toISOString();

    await run(
      `UPDATE autonomous_goals 
       SET title = ?, description = ?, status = ?, progress = ?, deadline = ?, success_criteria = ?, updated_at = ? 
       WHERE id = ?`,
      [title, description, status, progress, deadline, criteria, now, id]
    );

    const updated = await this.getGoalById(id);
    this.broadcast('GOAL_UPDATED', updated);
    return updated;
  }

  /**
   * Detects stalled objectives and blocked dependencies across running missions and active goals
   */
  async detectStalledObjectives(stallThresholdMinutes = 3) {
    const now = Date.now();
    const thresholdMs = stallThresholdMinutes * 60 * 1000;
    const stalledItems = [];

    // 1. Inspect running missions
    const activeMissions = await query(
      "SELECT * FROM missions WHERE status IN ('RUNNING', 'PLANNING')"
    );

    for (const m of activeMissions) {
      const lastActivityTime = m.last_heartbeat ? new Date(m.last_heartbeat).getTime() : (m.started_at ? new Date(m.started_at).getTime() : new Date(m.created_at).getTime());
      const elapsed = now - lastActivityTime;

      // Check if steps are deadlocked or pending without progress
      const steps = await query(
        "SELECT * FROM mission_steps WHERE mission_id = ?",
        [m.id]
      );

      const hasCompleted = steps.some(s => s.status === 'VERIFIED' || s.status === 'PARTIALLY_VERIFIED' || s.status === 'COMPLETED');
      const hasRunning = steps.some(s => s.status === 'RUNNING');
      const hasWaiting = steps.some(s => s.status === 'WAITING_FOR_APPROVAL');

      // If elapsed > thresholdMs and no running step is actively progressing
      if (elapsed > thresholdMs || (steps.length > 0 && !hasRunning && !hasWaiting && !hasCompleted)) {
        await run("UPDATE missions SET stall_status = 'STALLED' WHERE id = ?", [m.id]);
        stalledItems.push({
          type: 'mission',
          id: m.id,
          objective: m.objective,
          elapsedMinutes: Math.round(elapsed / 60000),
          reason: hasWaiting ? 'Blocked on user approval' : 'Execution heartbeat timeout exceeded'
        });

        // Record in activity logs
        await run(
          'INSERT INTO activity_logs (id, action, category, details, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
          [
            uuidv4(),
            'Stall Detected',
            'AUTONOMOUS_OPERATIONS',
            `Mission "${m.id}" identified as stalled (${Math.round(elapsed / 60000)}m inactive).`,
            'warning',
            new Date().toISOString()
          ]
        );
      }
    }

    // 2. Inspect active goals linked to stalled missions
    const inProgressGoals = await query(
      "SELECT * FROM autonomous_goals WHERE status = 'IN_PROGRESS' AND linked_mission_id IS NOT NULL"
    );

    for (const g of inProgressGoals) {
      const linked = await get('SELECT * FROM missions WHERE id = ?', [g.linked_mission_id]);
      if (linked && (linked.stall_status === 'STALLED' || linked.status === 'FAILED')) {
        await run("UPDATE autonomous_goals SET status = 'STALLED', updated_at = ? WHERE id = ?", [
          new Date().toISOString(),
          g.id
        ]);
        stalledItems.push({
          type: 'goal',
          id: g.id,
          title: g.title,
          linkedMissionId: g.linked_mission_id,
          reason: `Linked mission ${linked.id} is ${linked.status}`
        });
      }
    }

    if (stalledItems.length > 0) {
      this.broadcast('STALL_DETECTED', { stalledCount: stalledItems.length, items: stalledItems });
    }

    return stalledItems;
  }

  /**
   * Recommends contextual autonomous initiatives based on observed environment
   */
  async recommendInitiatives(recentEvents = []) {
    const recommendations = [];

    // Check for created documents needing organization or review
    const fileEvents = recentEvents.filter(e => e.event_type === 'FILE_CREATED' || e.event_type === 'FILE_MODIFIED');
    if (fileEvents.length >= 3) {
      recommendations.push({
        id: `rec-org-${Date.now()}`,
        title: 'Organize Recent Desktop Assets',
        description: `Observed ${fileEvents.length} recent file operations. Propose cataloging items into project folders.`,
        category: 'files',
        priority: 2,
        requires_approval: true
      });
    }

    // Check for pending uncompleted tasks
    const pendingTasks = await query("SELECT COUNT(*) as cnt FROM tasks WHERE status != 'completed'");
    if (pendingTasks[0]?.cnt > 5) {
      recommendations.push({
        id: `rec-focus-${Date.now()}`,
        title: 'Priority Task Consolidation Sprint',
        description: `Identified ${pendingTasks[0].cnt} open tasks. Recommend scheduling an execution sequence.`,
        category: 'productivity',
        priority: 3,
        requires_approval: false
      });
    }

    return recommendations;
  }

  /**
   * Phase 17: Decomposes a long-term goal or objective into concrete milestones and links dependencies in Knowledge Graph.
   */
  async decomposeObjective(goalId, milestones = []) {
    const goal = await this.getGoalById(goalId);
    if (!goal) throw new Error(`Goal ${goalId} not found.`);

    const milestoneSpecs = Array.isArray(milestones) && milestones.length > 0
      ? milestones
      : [
          { title: `${goal.title}: Dependency & Requirement Audit`, priority: 'high' },
          { title: `${goal.title}: Core Milestone Build & Execution`, priority: 'high' },
          { title: `${goal.title}: Independent Outcome Verification`, priority: 'medium' }
        ];

    const goalEnt = await KnowledgeGraphService.upsertEntity({
      id: `ent-${goal.id}`,
      name: goal.title,
      entity_type: 'goal',
      source_type: 'user_explicit',
      confidence: 1.0,
      properties: { goal_id: goal.id, deadline: goal.deadline, priority: goal.priority }
    });

    const createdMilestones = [];
    let prevEnt = null;
    const now = new Date().toISOString();

    for (let i = 0; i < milestoneSpecs.length; i++) {
      const m = typeof milestoneSpecs[i] === 'string' ? { title: milestoneSpecs[i] } : milestoneSpecs[i];
      const taskId = `ms-${goal.id}-${i + 1}`;
      await run(
        `INSERT OR REPLACE INTO tasks (id, title, description, status, priority, due_date, created_at)
         VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
        [
          taskId,
          m.title,
          `[GOAL:${goal.id}] Milestone ${i + 1}: ${m.description || m.title}`,
          m.priority || (goal.priority >= 3 ? 'high' : 'medium'),
          m.due_date || goal.deadline || null,
          now
        ]
      );

      const mEnt = await KnowledgeGraphService.upsertEntity({
        id: `ent-${taskId}`,
        name: m.title,
        entity_type: 'milestone',
        source_type: 'user_explicit',
        confidence: 1.0,
        properties: { goal_id: goal.id, order: i + 1, status: m.blocked ? 'BLOCKED' : 'PENDING', is_available: !m.blocked }
      });

      await KnowledgeGraphService.addRelationship({
        source_entity_id: goalEnt.id,
        target_entity_id: mEnt.id,
        relationship_type: 'DEPENDS_ON',
        weight: 1.0,
        source_type: 'user_explicit'
      });

      if (prevEnt) {
        await KnowledgeGraphService.addRelationship({
          source_entity_id: mEnt.id,
          target_entity_id: prevEnt.id,
          relationship_type: 'DEPENDS_ON',
          weight: 1.0,
          source_type: 'user_explicit'
        });
      }
      prevEnt = mEnt;
      createdMilestones.push({ id: taskId, title: m.title, entity_id: mEnt.id, order: i + 1 });
    }

    return { goal_id: goal.id, title: goal.title, milestones_count: createdMilestones.length, milestones: createdMilestones };
  }

  /**
   * Phase 17: Identifies competing priorities across active deadlines & high-priority objectives.
   */
  async detectCompetingPriorities(windowHours = 36) {
    const activeGoals = await query(
      "SELECT * FROM autonomous_goals WHERE status IN ('ACTIVE', 'IN_PROGRESS', 'PENDING') ORDER BY priority DESC"
    );
    const competitions = [];
    for (let i = 0; i < activeGoals.length; i++) {
      for (let j = i + 1; j < activeGoals.length; j++) {
        const a = activeGoals[i];
        const b = activeGoals[j];
        let closeDeadline = false;
        let hoursApart = null;
        if (a.deadline && b.deadline) {
          hoursApart = Math.abs(new Date(a.deadline).getTime() - new Date(b.deadline).getTime()) / 3600000;
          closeDeadline = hoursApart <= windowHours;
        }
        const highSamePriority = (a.priority >= 3 && b.priority >= 3);
        if (closeDeadline || highSamePriority) {
          competitions.push({
            goal_a: { id: a.id, title: a.title, priority: a.priority, deadline: a.deadline },
            goal_b: { id: b.id, title: b.title, priority: b.priority, deadline: b.deadline },
            reason: closeDeadline
              ? `Competing deadlines within ${hoursApart.toFixed(1)}h`
              : `Multiple high-priority goals (P${a.priority} vs P${b.priority}) competing for execution capacity`,
            severity: (closeDeadline && highSamePriority) ? 'HIGH' : 'MEDIUM'
          });
        }
      }
    }
    return { competing_count: competitions.length, competitions };
  }

  /**
   * Phase 17: Tracks actual milestone & mission progress against intended outcome criteria.
   */
  async trackOutcomeVsIntent(goalId) {
    const goal = await this.getGoalById(goalId);
    if (!goal) throw new Error(`Goal ${goalId} not found.`);

    const milestoneTasks = await query(
      "SELECT id, title, status FROM tasks WHERE description LIKE ?",
      [`%[GOAL:${goalId}]%`]
    );
    const completedMs = milestoneTasks.filter(t => t.status === 'completed').length;
    const actualProgress = milestoneTasks.length > 0
      ? Math.round((completedMs / milestoneTasks.length) * 100)
      : (goal.progress || 0);

    const depCheck = await KnowledgeGraphService.detectMissingDependencies(`ent-${goalId}`);
    const linkedMission = goal.linked_mission_id ? await get('SELECT id, status FROM missions WHERE id = ?', [goal.linked_mission_id]) : null;
    const gap = Math.max(0, 100 - actualProgress);

    return {
      goal_id: goalId,
      title: goal.title,
      intended_criteria: goal.success_criteria || 'Complete goal milestones before deadline',
      declared_progress: goal.progress || 0,
      measured_milestone_progress: actualProgress,
      milestones_total: milestoneTasks.length,
      milestones_completed: completedMs,
      linked_mission: linkedMission,
      missing_dependencies: depCheck?.missing_dependencies || [],
      outcome_gap_percent: gap,
      neglected: actualProgress === 0 && (Date.now() - new Date(goal.updated_at || goal.created_at).getTime()) > 72 * 3600000,
      status: goal.status
    };
  }
}

let goalServiceInstance = null;

export const initGoalManagement = (wss) => {
  if (!goalServiceInstance) {
    goalServiceInstance = new GoalManagementService(wss);
  } else if (wss) {
    goalServiceInstance.setWebSocketServer(wss);
  }
  return goalServiceInstance;
};

export const getGoalManagement = () => goalServiceInstance;
export default GoalManagementService;
