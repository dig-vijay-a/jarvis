/**
 * JARVIS OS 2.0 — PHASE 10: TWIN SYNCHRONIZATION SERVICE (P6)
 * Synchronizes the Digital Twin and Knowledge Graph from approved sources:
 * - Memories (memories table)
 * - Goals (autonomous_goals table)
 * - Missions and steps (missions, mission_steps)
 * - Tasks and plans (tasks, planned_tasks)
 * - Environmental observations (event_relevance_logs)
 * 
 * NON-NEGOTIABLE GUARANTEES:
 * 1. NEVER silently converts an inferred observation into an explicitly confirmed personal fact.
 * 2. Inferred facts are strictly flagged with `is_confirmed = false` and lower confidence bounds.
 * 3. Preserves complete provenance and user correction history.
 */

import { query, run, get } from '../database/db.js';
import DigitalTwinService from './digitalTwinService.js';
import KnowledgeGraphService from './knowledgeGraphService.js';

export class TwinSynchronizationService {
  /**
   * Main synchronization cycle: scans approved sources and synchronizes twin state.
   */
  async runSynchronizationCycle() {
    const results = {
      timestamp: new Date().toISOString(),
      goals_synced: 0,
      projects_synced: 0,
      inferences_recorded: 0,
      stale_facts_flagged: 0,
      conflicts_found: 0
    };

    // 1. Sync from Autonomous Goals
    const activeGoals = await query("SELECT * FROM autonomous_goals WHERE status IN ('ACTIVE', 'IN_PROGRESS')");
    for (const g of activeGoals) {
      await this.syncGoalToTwin(g);
      results.goals_synced++;
    }

    // 2. Sync from Tasks / Projects
    const tasks = await query("SELECT * FROM tasks WHERE status != 'completed' LIMIT 20");
    for (const t of tasks) {
      await this.syncTaskToTwin(t);
      results.projects_synced++;
    }

    // 3. Scan Environmental Logs for Inferred Observations (Strictly Inferred)
    const recentEvents = await query(
      "SELECT * FROM event_relevance_logs WHERE is_relevant = 1 ORDER BY timestamp DESC LIMIT 10"
    );
    for (const ev of recentEvents) {
      const added = await this.incorporateEnvironmentalObservation(ev);
      if (added) results.inferences_recorded++;
    }

    // 4. Stale Facts Audit
    const staleList = await DigitalTwinService.detectStaleEntries(30);
    results.stale_facts_flagged = staleList.length;

    // 5. Conflict Audit
    const conflicts = await DigitalTwinService.detectConflictingEntries();
    results.conflicts_found = conflicts.length;

    return results;
  }

  /**
   * Syncs an active goal to the twin profile and knowledge graph.
   */
  async syncGoalToTwin(goal) {
    if (!goal || !goal.title) return null;

    // Check if twin entry already exists
    const existing = await get(
      "SELECT id FROM digital_twin_profiles WHERE title = ? OR key = ?",
      [goal.title, goal.title]
    );

    if (!existing) {
      // Inferred from goal repository — NOT explicitly user-confirmed
      await DigitalTwinService.createEntry({
        category: 'goals',
        title: goal.title,
        content: goal.description || goal.title,
        priority: goal.priority || 2,
        source: 'inferred_from_goals',
        confidence: 0.85,
        is_confirmed: false, // Strict rule: inference must not be confirmed
        expiration_policy: 'review_30d',
        metadata: {
          goal_id: goal.id,
          deadline: goal.deadline,
          progress: goal.progress
        }
      });
    }

    // Link in Knowledge Graph
    try {
      await KnowledgeGraphService.upsertEntity({
        id: `ent-goal-${goal.id}`,
        name: goal.title,
        entity_type: 'goal',
        source_type: 'system_sync',
        confidence: 0.90,
        properties: { goal_id: goal.id, status: goal.status, priority: goal.priority }
      });
    } catch (_) {}
  }

  /**
   * Syncs a task or planned task into the twin project context.
   */
  async syncTaskToTwin(task) {
    if (!task || !task.title) return null;

    const taskTitle = task.title.trim();
    const existing = await get(
      "SELECT id FROM digital_twin_profiles WHERE title = ? OR key = ?",
      [taskTitle, taskTitle]
    );

    if (!existing) {
      await DigitalTwinService.createEntry({
        category: 'projects',
        title: taskTitle,
        content: task.description || taskTitle,
        priority: task.priority || 2,
        source: 'inferred_from_tasks',
        confidence: 0.75,
        is_confirmed: false,
        expiration_policy: 'review_30d',
        metadata: { task_id: task.id, status: task.status }
      });
    }

    try {
      await KnowledgeGraphService.upsertEntity({
        id: `ent-task-${task.id}`,
        name: taskTitle,
        entity_type: 'task',
        source_type: 'system_sync',
        confidence: 0.85,
        properties: { task_id: task.id }
      });
    } catch (_) {}
  }

  /**
   * Incorporates an environmental observation as an inferred observation.
   * GUARANTEE: Never sets is_confirmed = true.
   */
  async incorporateEnvironmentalObservation(eventLog) {
    if (!eventLog || !eventLog.event_type) return null;

    const factTitle = eventLog.title || `Observed Pattern: ${eventLog.event_type}${eventLog.details ? ' - ' + eventLog.details.substring(0, 30) : ''}`;
    const existing = await get(
      "SELECT id FROM digital_twin_profiles WHERE title = ? AND source LIKE 'inferred_from_env%'",
      [factTitle]
    );

    if (existing) {
      return await DigitalTwinService.getEntryById(existing.id);
    }

    const entry = await DigitalTwinService.createEntry({
      category: 'routines',
      title: factTitle,
      content: eventLog.details || `Observed recurring trigger '${eventLog.event_type}' on target '${eventLog.target}'. Relevance: ${eventLog.relevance_reason || 'Correlated operational event'}.`,
      priority: 1,
      source: eventLog.source || 'inferred_from_env_watcher',
      confidence: 0.70, // Inferred facts have capped confidence
      is_confirmed: false, // STRICT RULE: Must remain unconfirmed until user explicitly confirms
      expiration_policy: 'review_30d',
      metadata: { event_id: eventLog.event_id, target: eventLog.target }
    });

    return entry;
  }

  /**
   * Reconciles the digital twin after a real project/goal status change.
   */
  async reconcileEntityStatus(entityId, newStatus, reason = 'Real status change') {
    // 1. Check in digital_twin_profiles
    const twinEntry = await get("SELECT * FROM digital_twin_profiles WHERE id = ? OR title = ?", [entityId, entityId]);
    if (twinEntry) {
      const isArchived = newStatus === 'COMPLETED' || newStatus === 'CANCELLED' || newStatus === 'ARCHIVED';
      await DigitalTwinService.updateEntry(twinEntry.id, {
        status: newStatus,
        is_enabled: !isArchived,
        reason: `Reconciled: ${reason}`
      });
    }

    // 2. Check in knowledge graph
    const graphEnt = await get("SELECT * FROM graph_entities WHERE id = ? OR name = ?", [entityId, entityId]);
    if (graphEnt) {
      const props = graphEnt.properties ? JSON.parse(graphEnt.properties) : {};
      props.status = newStatus;
      await KnowledgeGraphService.correctEntity(graphEnt.id, {
        properties: props
      });
    }

    return { entityId, newStatus, reconciled: true };
  }
}

let instance = null;
export function initTwinSynchronization(options) {
  instance = new TwinSynchronizationService(options);
  return instance;
}
export function getTwinSynchronization() {
  if (!instance) instance = new TwinSynchronizationService();
  return instance;
}
export default TwinSynchronizationService;
