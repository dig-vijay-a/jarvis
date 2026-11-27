import { v4 as uuidv4 } from 'uuid';
import { run, query, get } from '../database/db.js';
import ToolRegistry from '../tools/registry.js';
import { getMissionControl, MissionControlService } from './missionControlService.js';
import DigitalTwinService from './digitalTwinService.js';

export class AutonomousInitiativeEngine {
  constructor(perceptionService = null, wss = null) {
    this.perceptionService = perceptionService;
    this.wss = wss;
    this.actionCooldowns = new Map(); // triggerKey -> timestamp
    this.cooldownMs = 60000; // 60s cooldown per trigger
    this.isEvaluating = false;

    if (this.perceptionService) {
      this.perceptionService.on('perception_event', (eventData) => {
        this.handlePerceptionEvent(eventData).catch(err => {
          console.warn('[AutonomousInitiative] Error processing perception event:', err.message);
        });
      });
    }
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
   * Periodic evaluation tick called from SchedulerService (every 5 seconds)
   */
  async tick() {
    if (this.isEvaluating) return;
    this.isEvaluating = true;

    try {
      // 1. Evaluate interrupted / paused missions that can safely be recovered
      await this.evaluateUnfinishedMissions();

      // 2. Evaluate proactive operational routines
      await this.evaluateProactiveRoutines();
    } catch (err) {
      console.warn('[AutonomousInitiative] Periodic evaluation tick note:', err.message);
    } finally {
      this.isEvaluating = false;
    }
  }

  /**
   * Handles real-time environmental events from EnvironmentalPerceptionService
   */
  async handlePerceptionEvent(eventData) {
    const { event_type, target, source } = eventData;
    const now = Date.now();

    // Check cooldown
    const triggerKey = `${event_type}:${target}`;
    const lastTrigger = this.actionCooldowns.get(triggerKey) || 0;
    if (now - lastTrigger < this.cooldownMs) {
      return; // Suppressed by rate limit
    }

    this.actionCooldowns.set(triggerKey, now);

    // Specific environmental triggers
    if (event_type === 'FILE_CREATED') {
      await this.handleFileCreatedTrigger(target);
    } else if (event_type === 'WINDOW_OPENED') {
      await this.handleWindowOpenedTrigger(target);
    }
  }

  /**
   * File creation trigger: Check if desktop has clutter or new files needing attention
   */
  async handleFileCreatedTrigger(filename) {
    const nowIso = new Date().toISOString();
    console.log(`[AutonomousInitiative] Environmental trigger: New file detected: "${filename}"`);

    await run(
      'INSERT INTO activity_logs (id, action, category, details, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [
        uuidv4(),
        'Perception Observation',
        'AUTONOMOUS_PERCEPTION',
        `Observed new file in monitored environment: "${filename}"`,
        'success',
        nowIso
      ]
    );

    this.broadcast('AUTONOMOUS_INITIATIVE', {
      type: 'PERCEPTION_OBSERVED',
      target: filename,
      summary: `JARVIS observed creation of "${filename}". Contextual indexing active.`
    });
  }

  /**
   * Window open trigger: Track active application context
   */
  async handleWindowOpenedTrigger(windowTitle) {
    const nowIso = new Date().toISOString();
    console.log(`[AutonomousInitiative] Environmental trigger: New window active: "${windowTitle}"`);

    await run(
      'INSERT INTO activity_logs (id, action, category, details, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [
        uuidv4(),
        'Window Focus Tracking',
        'AUTONOMOUS_PERCEPTION',
        `Observed application window launched: "${windowTitle}"`,
        'success',
        nowIso
      ]
    );
  }

  /**
   * Scans for interrupted or unresumed missions requiring autonomous continuation
   */
  async evaluateUnfinishedMissions() {
    const triggerKey = 'mission_continuation_eval';
    const now = Date.now();
    if (now - (this.actionCooldowns.get(triggerKey) || 0) < this.cooldownMs) return;
    this.actionCooldowns.set(triggerKey, now);

    try {
      const pausedMissions = await query("SELECT id, objective, status FROM missions WHERE status = 'PAUSED' LIMIT 5");
      if (pausedMissions.length === 0) return;

      for (const m of pausedMissions) {
        const remainingSteps = await query(
          "SELECT * FROM mission_steps WHERE mission_id = ? AND status = 'PENDING'",
          [m.id]
        );

        if (remainingSteps.length > 0) {
          console.log(`[AutonomousInitiative] Unfinished mission detected: ${m.id} (${remainingSteps.length} steps remaining).`);
        }
      }
    } catch (_) {}
  }

  /**
   * Evaluates digital twin routines and user preferences for proactive assistance
   */
  async evaluateProactiveRoutines() {
    const triggerKey = 'proactive_routines_eval';
    const now = Date.now();
    if (now - (this.actionCooldowns.get(triggerKey) || 0) < this.cooldownMs * 5) return; // run every 5 minutes
    this.actionCooldowns.set(triggerKey, now);

    try {
      const pendingTasks = await query("SELECT * FROM tasks WHERE status != 'completed'");
      if (pendingTasks.length >= 5) {
        const notifId = `notif-${uuidv4()}`;
        const nowIso = new Date().toISOString();
        await run(
          "INSERT INTO notification_history (id, title, message, type, is_read, timestamp) VALUES (?, ?, ?, 'PROACTIVE', 0, ?)",
          [
            notifId,
            'JARVIS Proactive Advisory',
            `You have ${pendingTasks.length} pending tasks registered. Would you like me to prepare an optimized execution schedule?`,
            nowIso
          ]
        );
        this.broadcast('NEW_NOTIFICATION', {
          id: notifId,
          title: 'JARVIS Proactive Advisory',
          message: `You have ${pendingTasks.length} pending tasks registered.`,
          type: 'PROACTIVE',
          timestamp: nowIso
        });
      }
    } catch (_) {}
  }
}

let initiativeEngineInstance = null;

export const initAutonomousInitiative = (perceptionService, wss) => {
  if (!initiativeEngineInstance) {
    initiativeEngineInstance = new AutonomousInitiativeEngine(perceptionService, wss);
  } else {
    if (perceptionService) initiativeEngineInstance.perceptionService = perceptionService;
    if (wss) initiativeEngineInstance.setWebSocketServer(wss);
  }
  return initiativeEngineInstance;
};

export const getAutonomousInitiative = () => initiativeEngineInstance;
export default AutonomousInitiativeEngine;
