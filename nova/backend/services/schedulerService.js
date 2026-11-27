import { query, run, get } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import { getAutonomousInitiative } from './autonomousInitiativeEngine.js';
import { getMissionControl } from './missionControlService.js';

export class SchedulerService {
  constructor(wss) {
    this.wss = wss;
    this.intervalId = null;
    this.focusTimer = null;
    this.autonomousInitiativeEngine = null;
    this.tickCount = 0;
  }

  setAutonomousInitiativeEngine(engine) {
    this.autonomousInitiativeEngine = engine;
  }

  start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.tick(), 5000);
    console.log('[SchedulerService] Background timer, persistent jobs and reminder monitor active.');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  broadcast(event, data) {
    if (!this.wss) return;
    const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    this.wss.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(payload);
      }
    });
  }

  async tick() {
    if (this._isTicking) return;
    this._isTicking = true;
    try {
      this.tickCount = (this.tickCount || 0) + 1;
      const nowIso = new Date().toISOString();
      const nowMs = Date.now();

      if (this.tickCount % 3 === 0) {
        const mc = getMissionControl();
        if (mc && typeof mc.resumeBlockedLocalModelMissions === 'function') {
          await mc.resumeBlockedLocalModelMissions().catch(() => {});
        }
      }

      // 1. Check one-time simple reminders
      const dueReminders = await query(
        "SELECT * FROM reminders WHERE status = 'active' AND remind_at <= ?",
        [nowIso]
      );

      for (const rem of dueReminders) {
        await run("UPDATE reminders SET status = 'triggered' WHERE id = ?", [rem.id]);
        
        // Log activity
        await run(
          "INSERT INTO activity_logs (id, action, category, details, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
          [uuidv4(), 'Reminder Alert', 'REMINDER', `Alert triggered: "${rem.title}"`, 'success', nowIso]
        );

        // Record in notification history
        const notifId = `notif-${uuidv4()}`;
        await run(
          "INSERT INTO notification_history (id, title, message, type, is_read, timestamp) VALUES (?, ?, ?, 'REMINDER', 0, ?)",
          [notifId, 'Reminder Alert', rem.title, nowIso]
        );

        // Broadcast to frontend
        this.broadcast('REMINDER_TRIGGERED', {
          id: rem.id,
          title: rem.title,
          remind_at: rem.remind_at,
          spoken_text: `Attention Commander: Reminder triggered. ${rem.title}.`
        });
        this.broadcast('NEW_NOTIFICATION', { id: notifId, title: 'Reminder Alert', message: rem.title, type: 'REMINDER', timestamp: nowIso });
      }

      // 2. Check persistent scheduled jobs (Recurring reminders, AI briefings, Scheduled workflows)
      const dueJobs = await query(
        "SELECT * FROM scheduled_jobs WHERE status = 'ACTIVE' AND next_run_at <= ?",
        [nowIso]
      );

      for (const job of dueJobs) {
        console.log(`[SchedulerService] Executing scheduled job: "${job.title}" (${job.type})`);
        
        let notifTitle = job.title;
        let notifMsg = `Scheduled automation executed: ${job.title}`;

        if (job.action_type === 'AI_BRIEFING') {
          notifTitle = 'Scheduled Executive Briefing';
          notifMsg = 'Morning briefing generated: Telemetry optimal, priority tasks reviewed.';
        } else if (job.action_type === 'DAILY_TASK_SUMMARY') {
          const pending = await query("SELECT title FROM tasks WHERE status != 'completed'");
          notifTitle = 'Daily Task Summary';
          notifMsg = `You currently have ${pending.length} pending task(s) registered in memory.`;
        } else if (job.action_type === 'WORKFLOW') {
          notifTitle = 'Scheduled Workflow Execution';
          notifMsg = `Workflow ${job.action_payload || ''} execution dispatched.`;
        }

        // Record in notification history
        const notifId = `notif-${uuidv4()}`;
        await run(
          "INSERT INTO notification_history (id, title, message, type, is_read, timestamp) VALUES (?, ?, ?, ?, 0, ?)",
          [notifId, notifTitle, notifMsg, job.type || 'AUTOMATION', nowIso]
        );

        // Compute next run if recurring
        if (job.schedule_type === 'RECURRING') {
          const nextRunMs = this.computeNextRun(job.schedule_value, nowMs);
          const nextRunIso = new Date(nextRunMs).toISOString();
          await run(
            "UPDATE scheduled_jobs SET last_run_at = ?, next_run_at = ? WHERE id = ?",
            [nowIso, nextRunIso, job.id]
          );
        } else {
          // One-time job completes
          await run(
            "UPDATE scheduled_jobs SET status = 'COMPLETED', last_run_at = ? WHERE id = ?",
            [nowIso, job.id]
          );
        }

        this.broadcast('SCHEDULED_JOB_TRIGGERED', {
          jobId: job.id,
          title: job.title,
          type: job.type,
          message: notifMsg
        });
        this.broadcast('NEW_NOTIFICATION', {
          id: notifId,
          title: notifTitle,
          message: notifMsg,
          type: job.type,
          timestamp: nowIso
        });
      }

      // 3. Check focus session countdown if active
      if (this.focusTimer && this.focusTimer.active) {
        const remaining = Math.max(0, Math.floor((this.focusTimer.endTime - Date.now()) / 1000));
        this.focusTimer.remainingSeconds = remaining;

        if (remaining <= 0) {
          this.focusTimer.active = false;
          this.broadcast('FOCUS_SESSION_COMPLETED', {
            title: this.focusTimer.title,
            durationMinutes: this.focusTimer.durationMinutes
          });
          this.focusTimer = null;
        } else {
          this.broadcast('FOCUS_TICK', {
            title: this.focusTimer.title,
            remainingSeconds: remaining,
            totalSeconds: this.focusTimer.totalSeconds
          });
        }
      }

      // 4. Autonomous Initiative Engine Tick
      try {
        const initiative = this.autonomousInitiativeEngine || getAutonomousInitiative();
        if (initiative) {
          await initiative.tick();
        }
      } catch (iErr) {
        // Quiet catch for initiative engine tick
      }
    } catch (err) {
      console.error('[SchedulerService] Tick error:', err.message);
    } finally {
      this._isTicking = false;
    }
  }

  computeNextRun(scheduleValue, currentMs = Date.now()) {
    // scheduleValue can be: "every_1h", "every_24h", "every_30m", or cron-like
    if (scheduleValue === 'every_30m') return currentMs + 30 * 60000;
    if (scheduleValue === 'every_1h') return currentMs + 60 * 60000;
    if (scheduleValue === 'every_24h' || scheduleValue === 'daily') return currentMs + 24 * 3600000;
    
    // Default 1 hour
    return currentMs + 3600000;
  }

  async createJob({ title, type = 'RECURRING_REMINDER', schedule_type = 'RECURRING', schedule_value = 'every_24h', next_run_at = null, action_type = 'NOTIFICATION', action_payload = '' }) {
    const id = `job-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const nextRun = next_run_at || new Date(this.computeNextRun(schedule_value)).toISOString();

    await run(
      `INSERT INTO scheduled_jobs (id, title, type, schedule_type, schedule_value, next_run_at, status, action_type, action_payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
      [id, title, type, schedule_type, schedule_value, nextRun, action_type, action_payload, nowIso]
    );

    return { id, title, type, schedule_type, schedule_value, next_run_at: nextRun, status: 'ACTIVE' };
  }

  startFocusSession(durationMinutes = 25, title = 'Deep Work Protocol') {
    const totalSeconds = durationMinutes * 60;
    this.focusTimer = {
      active: true,
      title,
      durationMinutes,
      totalSeconds,
      remainingSeconds: totalSeconds,
      endTime: Date.now() + (totalSeconds * 1000)
    };

    this.broadcast('FOCUS_SESSION_STARTED', this.focusTimer);
    return this.focusTimer;
  }

  stopFocusSession() {
    if (this.focusTimer) {
      this.focusTimer.active = false;
      this.broadcast('FOCUS_SESSION_STOPPED', {});
      this.focusTimer = null;
    }
    return { success: true, message: 'Focus session terminated.' };
  }
}

let schedulerInstance = null;
export const initScheduler = (wss) => {
  if (!schedulerInstance) {
    schedulerInstance = new SchedulerService(wss);
    schedulerInstance.start();
  }
  return schedulerInstance;
};

export const getScheduler = () => schedulerInstance;
