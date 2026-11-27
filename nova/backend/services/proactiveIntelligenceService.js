import { query, run, get } from '../database/db.js';
import WebSearchService from './webSearchService.js';
import { getPersonalContext } from './personalContextEngine.js';
import { getGoalManagement } from './goalManagementService.js';
import { getPredictiveIntelligence } from './predictiveIntelligenceService.js';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export class ProactiveIntelligenceService {
  /**
   * Synthesizes an executive daily briefing (Tasks, Missions, Calendar, System Status, News)
   */
  static async generateDailyBriefing() {
    const now = new Date();

    // 1. Pending tasks
    const pendingTasks = await query(
      'SELECT id, title, priority, due_date FROM tasks WHERE status != "completed" ORDER BY priority DESC, due_date ASC LIMIT 5'
    );

    // 2. Active missions
    const activeMissions = await query(
      'SELECT id, objective, status FROM missions WHERE status IN ("RUNNING", "WAITING_FOR_APPROVAL", "PENDING") LIMIT 3'
    );

    // 3. Upcoming reminders
    const reminders = await query(
      'SELECT id, title, remind_at FROM reminders WHERE status = "active" AND remind_at >= ? ORDER BY remind_at ASC LIMIT 3',
      [now.toISOString()]
    );

    // 4. Overdue tasks check
    const overdueTasks = await query(
      'SELECT id, title, due_date FROM tasks WHERE status != "completed" AND due_date IS NOT NULL AND due_date < ?',
      [now.toISOString()]
    );

    // 5. System telemetry summary
    let systemSummary = 'All systems nominal';
    try {
      const cfgRow = await get("SELECT value FROM settings WHERE key = 'python_agent_url'");
      const tokenRow = await get("SELECT value FROM settings WHERE key = 'python_agent_token'");
      const res = await axios.get(`${cfgRow?.value || 'http://localhost:8000'}/api/system/info`, {
        headers: { Authorization: `Bearer ${tokenRow?.value || 'nova-local-agent-secure-token-2026'}` },
        timeout: 3000
      });
      if (res.data?.success) {
        systemSummary = `CPU: ${res.data.cpu?.percent}%, RAM: ${res.data.memory?.percent}%, Disk: ${res.data.disk?.percent}%`;
      }
    } catch (e) {
      systemSummary = 'Telemetry agent in standby';
    }

    // 6. Technology intelligence headlines
    let techBrief = 'Global tech telemetry online.';
    try {
      const news = await WebSearchService.search('artificial intelligence technology news today', 2);
      if (news && news.length > 0) {
        techBrief = news.map(n => n.title).join(' | ');
      }
    } catch (e) {
      techBrief = 'Web intelligence cache verified.';
    }

    const greeting = now.getHours() < 12 ? 'Good morning' : (now.getHours() < 17 ? 'Good afternoon' : 'Good evening');
    const briefingText = `${greeting}, Commander. Here is your daily operational status:
- System Status: ${systemSummary}
- Priority Focus: ${pendingTasks.length} pending tasks (${overdueTasks.length} overdue).
- Active Missions: ${activeMissions.length} autonomous missions in progress.
- Scheduled Reminders: ${reminders.length} upcoming alerts today.
- Intelligence Feed: ${techBrief}`;

    // Store in notification history
    const notifId = `briefing-${Date.now()}`;
    await run(
      'INSERT INTO notification_history (id, title, message, type, is_read, timestamp) VALUES (?, ?, ?, ?, 0, ?)',
      [notifId, 'Daily Operational Briefing', briefingText, 'BRIEFING', now.toISOString()]
    );

    return {
      success: true,
      timestamp: now.toISOString(),
      greeting,
      systemSummary,
      pendingTasks,
      overdueTasks,
      activeMissions,
      reminders,
      techBrief,
      briefingText
    };
  }

  /**
   * Inspects and flags overdue tasks
   */
  static async checkOverdueTasks() {
    const now = new Date().toISOString();
    const overdue = await query(
      'SELECT id, title, priority, due_date FROM tasks WHERE status != "completed" AND due_date IS NOT NULL AND due_date < ?',
      [now]
    );

    return {
      success: true,
      overdueCount: overdue.length,
      tasks: overdue,
      hasOverdue: overdue.length > 0,
      suggestedAction: overdue.length > 0 ? `Reschedule or prioritize ${overdue.length} overdue tasks.` : 'All tasks are on track.'
    };
  }

  /**
   * Inspects incomplete or stalled autonomous missions
   */
  static async checkIncompleteMissions() {
    const stalled = await query(
      'SELECT id, objective, status, created_at, error FROM missions WHERE status IN ("RUNNING", "WAITING_FOR_APPROVAL", "FAILED")'
    );

    return {
      success: true,
      count: stalled.length,
      missions: stalled,
      hasStalled: stalled.length > 0,
      approvalRequired: stalled.filter(m => m.status === 'WAITING_FOR_APPROVAL').length
    };
  }

  /**
   * Detects tasks with deadlines approaching within 24 hours
   */
  static async detectUpcomingDeadlines() {
    const now = Date.now();
    const next24h = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date(now).toISOString();

    const tasks = await query(
      'SELECT id, title, priority, due_date FROM tasks WHERE status != "completed" AND due_date IS NOT NULL AND due_date > ? AND due_date <= ? ORDER BY due_date ASC',
      [nowIso, next24h]
    );

    return tasks.map(t => {
      const dueTime = new Date(t.due_date).getTime();
      const hoursRemaining = Math.max(0.1, Number(((dueTime - now) / (1000 * 60 * 60)).toFixed(1)));
      const urgency = hoursRemaining <= 6 ? 'HIGH' : 'MEDIUM';

      return {
        id: `rec-deadline-${t.id}`,
        type: 'UPCOMING_DEADLINE',
        title: `Upcoming Deadline: ${t.title}`,
        description: `Task "${t.title}" is due in ${hoursRemaining} hours. Prepare dedicated focus block.`,
        reason: `Due date timestamp ${t.due_date} is within the 24-hour alert threshold (${hoursRemaining} hours remaining).`,
        contextSource: 'tasks.due_date',
        urgency,
        actionTool: 'start_focus_timer',
        actionArgs: JSON.stringify({ duration_minutes: 30, title: `Focus: ${t.title}` }),
        isSensitive: 0
      };
    });
  }

  /**
   * Detects project inactivity (projects from Digital Twin with no task/mission activity in > 72 hours)
   */
  static async detectProjectInactivity() {
    const projects = await query(
      "SELECT id, title, content FROM digital_twin_profiles WHERE category = 'projects' AND is_enabled = 1"
    );

    const inactiveThreshold = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const recommendations = [];

    for (const proj of projects) {
      // Check if any task or mission matches project title or was updated recently
      const recentTask = await get(
        'SELECT id FROM tasks WHERE (title LIKE ? OR description LIKE ?) AND created_at > ?',
        [`%${proj.title}%`, `%${proj.title}%`, inactiveThreshold]
      );

      const recentMission = await get(
        'SELECT id FROM missions WHERE objective LIKE ? AND created_at > ?',
        [`%${proj.title}%`, inactiveThreshold]
      );

      if (!recentTask && !recentMission) {
        recommendations.push({
          id: `rec-inact-${proj.id}`,
          type: 'PROJECT_INACTIVITY',
          title: `Project Inactivity: ${proj.title}`,
          description: `No recorded activity or completed milestones for "${proj.title}" in over 72 hours.`,
          reason: `Digital twin profile project "${proj.title}" has zero task creations or mission runs logged since ${inactiveThreshold}.`,
          contextSource: 'digital_twin.projects',
          urgency: 'MEDIUM',
          actionTool: 'create_task',
          actionArgs: JSON.stringify({ title: `Review progress on ${proj.title}`, priority: 'medium' }),
          isSensitive: 0
        });
      }
    }

    return recommendations;
  }

  /**
   * Detects Digital Twin routine triggers matching current time
   */
  static async detectRoutineTriggers() {
    const currentHour = new Date().getHours();
    const routines = await query(
      "SELECT id, title, content FROM digital_twin_profiles WHERE category = 'routines' AND is_enabled = 1"
    );

    const recommendations = [];

    for (const r of routines) {
      const lower = (r.title + ' ' + r.content).toLowerCase();

      // Morning telemetry routine check (7am to 11am)
      if (currentHour >= 7 && currentHour <= 11 && (lower.includes('morning') || lower.includes('telemetry') || lower.includes('diagnostic'))) {
        recommendations.push({
          id: `rec-routine-${r.id}`,
          type: 'ROUTINE_TRIGGER',
          title: `Routine: Morning Telemetry & Health Audit`,
          description: `Scheduled operational routine detected: "${r.title}".`,
          reason: `Current time window matches daily morning operational protocol defined in personal digital twin.`,
          contextSource: 'digital_twin.routines',
          urgency: 'LOW',
          actionTool: 'get_system_telemetry',
          actionArgs: JSON.stringify({}),
          isSensitive: 0
        });
      }

      // Evening backup & review routine check (18:00 to 23:00)
      if (currentHour >= 18 && currentHour <= 23 && (lower.includes('evening') || lower.includes('backup') || lower.includes('review'))) {
        recommendations.push({
          id: `rec-routine-${r.id}`,
          type: 'ROUTINE_TRIGGER',
          title: `Routine: Evening Review & Hot Backup`,
          description: `Evening operational review routine: "${r.title}".`,
          reason: `Current time matches evening review protocol defined in personal digital twin.`,
          contextSource: 'digital_twin.routines',
          urgency: 'LOW',
          actionTool: 'trigger_hot_backup',
          actionArgs: JSON.stringify({ note: 'Scheduled evening hot backup' }),
          isSensitive: 0
        });
      }
    }

    return recommendations;
  }

  /**
   * Generates Explainable Proactive Recommendations with Throttling & Persistence
   */
  static async getExplainableRecommendations() {
    // 1. Gather all candidates
    const deadlines = await this.detectUpcomingDeadlines();
    const inactivities = await this.detectProjectInactivity();
    const routines = await this.detectRoutineTriggers();
    const overdue = await this.checkOverdueTasks();
    const missions = await this.checkIncompleteMissions();

    const candidates = [...deadlines, ...inactivities, ...routines];

    if (overdue.hasOverdue) {
      candidates.push({
        id: `rec-overdue-${Date.now()}`,
        type: 'TASK_OVERDUE',
        title: `${overdue.overdueCount} Overdue Tasks Detected`,
        description: `You have ${overdue.overdueCount} overdue item(s). Consider scheduling focus time to clear the backlog.`,
        reason: `Tasks with past due dates detected in SQLite task register.`,
        contextSource: 'tasks.overdue',
        urgency: 'HIGH',
        actionTool: 'start_focus_timer',
        actionArgs: JSON.stringify({ duration_minutes: 25, title: 'Clear overdue tasks' }),
        isSensitive: 0
      });
    }

    if (missions.approvalRequired > 0) {
      candidates.push({
        id: `rec-appr-${Date.now()}`,
        type: 'MISSION_APPROVAL',
        title: `${missions.approvalRequired} Mission(s) Awaiting Operator Decision`,
        description: `Sensitive autonomous steps are paused awaiting human operator authorization.`,
        reason: `Autonomous DAG engine paused execution at a protected security checkpoint.`,
        contextSource: 'missions.requires_approval',
        urgency: 'HIGH',
        actionTool: 'open_mission_control',
        actionArgs: JSON.stringify({}),
        isSensitive: 1
      });
    }

    // 2. Throttling and frequency filtering
    const freqSetting = await get("SELECT value FROM settings WHERE key = 'proactive_frequency'");
    const frequency = freqSetting ? freqSetting.value : 'normal'; // 'low', 'normal', 'high'

    let maxItems = 5;
    if (frequency === 'low') maxItems = 2;
    if (frequency === 'high') maxItems = 10;

    // Filter duplicates against recent 6-hour window in proactive_recommendations
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const finalized = [];

    for (const c of candidates) {
      if (finalized.length >= maxItems) break;

      const existingRecent = await get(
        'SELECT id FROM proactive_recommendations WHERE title = ? AND created_at > ?',
        [c.title, sixHoursAgo]
      );

      if (!existingRecent) {
        // Persist into database
        const recId = c.id || `rec-${uuidv4()}`;
        try {
          await run(
            `INSERT INTO proactive_recommendations 
            (id, type, title, description, reason, context_source, urgency, action_tool, action_args, status, is_sensitive, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
            [
              recId,
              c.type,
              c.title,
              c.description,
              c.reason,
              c.contextSource,
              c.urgency || 'MEDIUM',
              c.actionTool || null,
              c.actionArgs || null,
              c.isSensitive || 0,
              new Date().toISOString()
            ]
          );
        } catch (dbErr) {
          // Ignore duplicate insert errors
        }
        finalized.push({ ...c, id: recId, status: 'PENDING' });
      }
    }

    // Also fetch any unresolved pending recommendations from DB
    const persistedPending = await query(
      "SELECT * FROM proactive_recommendations WHERE status = 'PENDING' ORDER BY created_at DESC LIMIT ?",
      [maxItems]
    );

    const mergedMap = new Map();
    persistedPending.forEach(p => mergedMap.set(p.title, p));
    finalized.forEach(f => mergedMap.set(f.title, f));

    return Array.from(mergedMap.values()).slice(0, maxItems);
  }

  /**
   * Resolves a recommendation by ID
   */
  static async resolveRecommendation(id) {
    const now = new Date().toISOString();
    await run("UPDATE proactive_recommendations SET status = 'RESOLVED', resolved_at = ? WHERE id = ?", [now, id]);
    return { success: true, id, status: 'RESOLVED' };
  }

  /**
   * Dismisses a recommendation by ID
   */
  static async dismissRecommendation(id) {
    const now = new Date().toISOString();
    await run("UPDATE proactive_recommendations SET status = 'DISMISSED', resolved_at = ? WHERE id = ?", [now, id]);
    return { success: true, id, status: 'DISMISSED' };
  }

  /**
   * Legacy adapter for getProactiveInsights
   */
  static async getProactiveInsights() {
    const recommendations = await this.getExplainableRecommendations();
    return {
      success: true,
      timestamp: new Date().toISOString(),
      suggestions: recommendations.map(r => ({
        id: r.id,
        type: r.type,
        title: r.title,
        description: r.description,
        reason: r.reason,
        contextSource: r.context_source || r.contextSource,
        urgency: r.urgency,
        actionTool: r.action_tool || r.actionTool,
        actionArgs: r.action_args ? (typeof r.action_args === 'string' ? JSON.parse(r.action_args) : r.action_args) : null
      }))
    };
  }

  /**
   * Phase 17: Proactive Personal Intelligence Briefing & Advisory Generator.
   * Surfaces neglected objectives, conflicting commitments, contradictions/stale facts,
   * and predicted risks WITHOUT making autonomous consequential personal decisions.
   */
  static async generatePersonalProactiveIntelligence() {
    const contextEngine = getPersonalContext();
    const goalMgr = getGoalManagement();
    const predictive = getPredictiveIntelligence();

    const context = await contextEngine.buildContextSnapshot();
    const competing = goalMgr ? await goalMgr.detectCompetingPriorities() : { competing_count: 0, competitions: [] };
    const forecast = predictive ? await predictive.generatePersonalIntelligenceForecast() : { predictions: [], automation_opportunities: [] };
    const explanations = await this.getExplainableRecommendations();

    const alerts = [];

    if ((context.consistency?.total_conflicts || 0) > 0) {
      alerts.push({
        type: 'KNOWLEDGE_CONTRADICTION',
        severity: 'HIGH',
        summary: `Detected ${context.consistency.total_conflicts} contradiction(s) across personal context stores requiring user reconciliation.`,
        requires_user_decision: true
      });
    }
    if ((context.consistency?.stale_count || 0) > 0) {
      alerts.push({
        type: 'STALE_ASSUMPTION',
        severity: 'MEDIUM',
        summary: `${context.consistency.stale_count} unconfirmed/stale personal profile item(s) need user confirmation.`,
        requires_user_decision: true
      });
    }
    if ((competing.competing_count || 0) > 0) {
      alerts.push({
        type: 'CONFLICTING_COMMITMENTS',
        severity: 'HIGH',
        summary: `${competing.competing_count} competing priority/deadline pair(s) identified.`,
        details: competing.competitions,
        requires_user_decision: true
      });
    }

    const neglectedGoals = (context.important_pending_goals || []).filter(g => (g.progress || 0) === 0 && g.status === 'ACTIVE');
    if (neglectedGoals.length > 0) {
      alerts.push({
        type: 'NEGLECTED_OBJECTIVES',
        severity: 'MEDIUM',
        summary: `${neglectedGoals.length} active objective(s) currently at 0% recorded progress.`,
        objectives: neglectedGoals.map(g => g.title),
        requires_user_decision: true
      });
    }

    const highRiskPreds = (forecast.predictions || []).filter(p => (p.probability || 0) >= 0.6);
    if (highRiskPreds.length > 0) {
      alerts.push({
        type: 'PREDICTED_BOTTLENECK_OR_DELAY',
        severity: 'HIGH',
        summary: `${highRiskPreds.length} objective/resource risk forecast(s) exceed 60% probability.`,
        predictions: highRiskPreds,
        requires_user_decision: true
      });
    }

    const nowIso = new Date().toISOString();
    const conciseBriefing = [
      `Personal Context Briefing (${nowIso}):`,
      `- Active Projects: ${context.active_projects.length} | Goals: ${context.important_pending_goals.length} | Missions: ${context.mission_commitments.length}`,
      `- Epistemic Balance: ${context.epistemic_summary?.confirmed_count || 0} confirmed facts vs ${context.epistemic_summary?.inferred_count || 0} inferred observations`,
      `- Proactive Alerts: ${alerts.length} (${alerts.map(a => a.type).join(', ') || 'None'})`,
      `- Advisory Only: Consequential personal decisions require explicit operator approval.`
    ].join('\n');

    return {
      success: true,
      timestamp: nowIso,
      autonomous_execution_blocked: true,
      consequential_actions_require_approval: true,
      concise_briefing: conciseBriefing,
      alerts_count: alerts.length,
      alerts,
      recommendations: explanations,
      automation_opportunities: forecast.automation_opportunities || [],
      competing_priorities: competing.competitions || [],
      neglected_objectives: neglectedGoals
    };
  }
}

export default ProactiveIntelligenceService;
