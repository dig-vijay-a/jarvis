import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';
import { run, query, get } from '../database/db.js';

export class EnvironmentalPerceptionService extends EventEmitter {
  constructor(wss = null) {
    super();
    this.wss = wss;
    this.watchers = [];
    this.watchPaths = [
      path.join(os.homedir(), 'Desktop'),
      process.cwd()
    ];
    this.maxWatchers = 10;
    this.pollInterval = null;
    this.debounceTimers = new Map();
    this.knownWindows = new Map(); // id or title -> window object
    this.lastActiveTitle = null;
    this.isWatching = false;
    this.isPaused = false;
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
   * Configures active observation directory scopes with resource boundary (max 10)
   */
  async setObservationScopes(newPaths = []) {
    if (!Array.isArray(newPaths)) throw new Error('newPaths must be an array of directory paths.');
    const validPaths = newPaths.slice(0, this.maxWatchers).filter(p => fs.existsSync(p));
    this.watchPaths = validPaths;

    if (this.isWatching) {
      this.closeWatchers();
      this.setupFilesystemWatchers();
    }
    return this.watchPaths;
  }

  getObservationScopes() {
    return [...this.watchPaths];
  }

  pauseWatchers() {
    this.isPaused = true;
    console.log('[EnvironmentalPerception] Perception watchers paused.');
  }

  resumeWatchers() {
    this.isPaused = false;
    console.log('[EnvironmentalPerception] Perception watchers resumed.');
  }

  closeWatchers() {
    for (const w of this.watchers) {
      try {
        w.close();
      } catch (_) {}
    }
    this.watchers = [];
  }

  /**
   * Initializes perception monitors for filesystem and OS window state
   */
  async start() {
    if (this.isWatching) return;
    this.isWatching = true;

    console.log('[EnvironmentalPerception] Starting active perception monitors...');

    // 1. Filesystem Watchers (Desktop and current working directory)
    this.setupFilesystemWatchers();

    // 2. Window / Desktop Telemetry Polling (4-second interval)
    this.pollInterval = setInterval(() => {
      if (this.isPaused) return;
      this.pollWindowAndSystemState().catch(() => {});
    }, 4000);

    // Initial snapshot
    this.pollWindowAndSystemState().catch(() => {});
  }

  /**
   * Stops all watchers and polling timers
   */
  stop() {
    this.isWatching = false;
    this.closeWatchers();

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    console.log('[EnvironmentalPerception] Active perception monitors stopped.');
  }

  /**
   * Sets up scoped, debounced, privacy-preserving filesystem monitors
   */
  setupFilesystemWatchers() {
    this.closeWatchers();

    for (const targetDir of this.watchPaths) {
      try {
        if (!fs.existsSync(targetDir)) continue;

        const watcher = fs.watch(targetDir, { recursive: false }, (eventType, filename) => {
          if (!filename || this.isPaused) return;

          // Ignore noise/temporary files before debounce
          if (filename.startsWith('~$') || filename.includes('4913')) {
            return;
          }

          const debounceKey = `${targetDir}:${filename}`;
          if (this.debounceTimers.has(debounceKey)) {
            clearTimeout(this.debounceTimers.get(debounceKey));
          }

          const timer = setTimeout(() => {
            this.debounceTimers.delete(debounceKey);
            this.handleFilesystemChange(targetDir, filename, eventType);
          }, 300);

          this.debounceTimers.set(debounceKey, timer);
        });

        this.watchers.push(watcher);
        console.log(`[EnvironmentalPerception] Monitoring filesystem directory: ${targetDir}`);
      } catch (err) {
        console.warn(`[EnvironmentalPerception] Could not watch ${targetDir}:`, err.message);
      }
    }
  }

  /**
   * Privacy-preserving filesystem event handler with Relevance & Classification
   * NEVER reads file contents; only inspects existence, filename, extension, and file size metadata
   */
  async handleFilesystemChange(targetDir, filename, rawEventType) {
    try {
      const fullPath = path.join(targetDir, filename);
      const exists = fs.existsSync(fullPath);

      let eventType = 'FILE_MODIFIED';
      let statDetails = {};

      if (!exists) {
        eventType = 'FILE_DELETED';
      } else {
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory()) {
            eventType = 'DIRECTORY_CHANGED';
          } else {
            eventType = rawEventType === 'rename' ? 'FILE_CREATED' : 'FILE_MODIFIED';
            statDetails = {
              sizeBytes: stats.size,
              extension: path.extname(filename).toLowerCase()
            };
          }
        } catch (_) {
          eventType = 'FILE_MUTATED';
        }
      }

      const eventData = {
        id: `perc-fs-${uuidv4().substring(0, 8)}`,
        event_type: eventType,
        source: 'FILESYSTEM',
        target: filename,
        details: JSON.stringify({
          directory: targetDir,
          filename,
          ...statDetails
        }),
        timestamp: new Date().toISOString()
      };

      await this.recordPerceptionEvent(eventData);

      // Evaluate event relevance against active missions and goals (P1)
      await this.classifyAndFilterEvent(eventData);
    } catch (err) {
      console.warn('[EnvironmentalPerception] Filesystem event error:', err.message);
    }
  }

  /**
   * Alias for classifyAndFilterEvent (P1 Correlation Engine)
   */
  async correlateEventWithObjectives(eventData) {
    return this.classifyAndFilterEvent(eventData);
  }

  /**
   * Event Classification & Relevance Engine (P1)
   * Associates events with active missions and goals, suppressing noise and logging decisions
   */
  async classifyAndFilterEvent(eventData) {
    const target = eventData.target || '';
    const baseName = path.basename(target);
    const isNoise = /^(~\$|\.)|(\.(tmp|swp|bak|log|lock|git|crdownload|part)|4913)$/i.test(baseName);
    const nowIso = new Date().toISOString();
    const logId = `rel-${uuidv4().substring(0, 8)}`;

    if (isNoise) {
      await run(
        `INSERT INTO event_relevance_logs 
         (id, event_id, event_type, target, is_relevant, matched_entity_type, matched_entity_id, relevance_reason, timestamp) 
         VALUES (?, ?, ?, ?, 0, 'noise', NULL, 'Suppressed noise / temporary file artifact', ?)`,
        [logId, eventData.id, eventData.event_type, target, nowIso]
      );
      return { isRelevant: false, reason: 'Suppressed noise / temporary file artifact' };
    }

    try {
      // 1. Correlate with active running missions
      const activeMissions = await query(
        "SELECT id, objective, deliverables FROM missions WHERE status IN ('RUNNING', 'PLANNING', 'PENDING')"
      );

      const targetLower = target.toLowerCase();
      const baseLower = baseName.toLowerCase();

      for (const m of activeMissions) {
        // Check steps for target filename reference
        const steps = await query("SELECT id, tool, args FROM mission_steps WHERE mission_id = ?", [m.id]);
        const matchedStep = steps.find(s => {
          const argsLower = (s.args || '').toLowerCase();
          return argsLower.includes(baseLower) || argsLower.includes(targetLower);
        });

        if (matchedStep || m.objective.toLowerCase().includes(baseLower) || m.objective.toLowerCase().includes(targetLower)) {
          await run(
            `INSERT INTO event_relevance_logs 
             (id, event_id, event_type, target, is_relevant, matched_entity_type, matched_entity_id, relevance_reason, timestamp) 
             VALUES (?, ?, ?, ?, 1, 'mission', ?, ?, ?)`,
            [logId, eventData.id, eventData.event_type, target, m.id, `Matched active mission: ${m.objective.slice(0, 40)}`, nowIso]
          );

          this.emit('mission_event_correlated', { missionId: m.id, event: eventData, stepId: matchedStep?.id });
          return { isRelevant: true, matchedType: 'mission', matchedId: m.id };
        }
      }

      // 2. Correlate with active autonomous goals
      const activeGoals = await query(
        "SELECT id, title, success_criteria FROM autonomous_goals WHERE status IN ('ACTIVE', 'IN_PROGRESS')"
      );

      for (const g of activeGoals) {
        if (g.title.toLowerCase().includes(target.toLowerCase()) || (g.success_criteria || '').toLowerCase().includes(target.toLowerCase())) {
          await run(
            `INSERT INTO event_relevance_logs 
             (id, event_id, event_type, target, is_relevant, matched_entity_type, matched_entity_id, relevance_reason, timestamp) 
             VALUES (?, ?, ?, ?, 1, 'goal', ?, ?, ?)`,
            [logId, eventData.id, eventData.event_type, target, g.id, `Matched active goal: ${g.title}`, nowIso]
          );
          return { isRelevant: true, matchedType: 'goal', matchedId: g.id };
        }
      }

      // 3. Unmatched event (general environment change, not noise but not linked to active goal)
      await run(
        `INSERT INTO event_relevance_logs 
         (id, event_id, event_type, target, is_relevant, matched_entity_type, matched_entity_id, relevance_reason, timestamp) 
         VALUES (?, ?, ?, ?, 0, 'unmatched', NULL, 'No active mission or goal associated with target', ?)`,
        [logId, eventData.id, eventData.event_type, target, nowIso]
      );
      return { isRelevant: false, reason: 'Unmatched to active missions' };
    } catch (err) {
      console.warn('[EnvironmentalPerception] Event relevance evaluation note:', err.message);
      return { isRelevant: false, error: err.message };
    }
  }

  /**
   * Retrieves relevance decisions for operations dashboard
   */
  async getRelevanceLogs(limit = 40) {
    return query('SELECT * FROM event_relevance_logs ORDER BY timestamp DESC LIMIT ?', [limit]);
  }

  /**
   * Polls Windows window list and detects focus/window transitions
   */
  async pollWindowAndSystemState() {
    try {
      // Query python-agent Windows endpoint if available
      let currentWindows = [];
      try {
        const tokenRow = await get("SELECT value FROM settings WHERE key = 'python_agent_token'");
        const token = tokenRow?.value || 'nova-local-agent-secure-token-2026';
        const resp = await axios.get('http://127.0.0.1:8000/api/desktop/windows', {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 1500
        });
        if (resp.data && Array.isArray(resp.data.windows)) {
          currentWindows = resp.data.windows;
        }
      } catch (_) {
        // Python agent unavailable or busy
      }

      if (currentWindows.length === 0) return;

      const currentMap = new Map();
      let activeWindow = null;

      for (const win of currentWindows) {
        const title = win.title || win.name || '';
        if (!title.trim()) continue;
        const key = `${win.pid || 0}:${title}`;
        currentMap.set(key, win);

        if (win.is_active || win.active || win.is_foreground) {
          activeWindow = win;
        }
      }

      // Detect opened windows
      for (const [key, win] of currentMap.entries()) {
        if (!this.knownWindows.has(key)) {
          await this.recordPerceptionEvent({
            id: `perc-win-open-${uuidv4().substring(0, 8)}`,
            event_type: 'WINDOW_OPENED',
            source: 'OS_WINDOWS',
            target: win.title || 'Unknown Window',
            details: JSON.stringify({ pid: win.pid, process: win.process_name || win.app }),
            timestamp: new Date().toISOString()
          });
        }
      }

      // Detect closed windows
      for (const [key, win] of this.knownWindows.entries()) {
        if (!currentMap.has(key)) {
          await this.recordPerceptionEvent({
            id: `perc-win-close-${uuidv4().substring(0, 8)}`,
            event_type: 'WINDOW_CLOSED',
            source: 'OS_WINDOWS',
            target: win.title || 'Unknown Window',
            details: JSON.stringify({ pid: win.pid, process: win.process_name || win.app }),
            timestamp: new Date().toISOString()
          });
        }
      }

      // Detect active foreground window change
      if (activeWindow && activeWindow.title !== this.lastActiveTitle) {
        this.lastActiveTitle = activeWindow.title;
        await this.recordPerceptionEvent({
          id: `perc-win-active-${uuidv4().substring(0, 8)}`,
          event_type: 'ACTIVE_WINDOW_CHANGED',
          source: 'OS_WINDOWS',
          target: activeWindow.title,
          details: JSON.stringify({ pid: activeWindow.pid, process: activeWindow.process_name || activeWindow.app }),
          timestamp: new Date().toISOString()
        });
      }

      this.knownWindows = currentMap;
    } catch (err) {
      // Quiet poll error
    }
  }

  /**
   * Persists event, emits to Node listeners, and broadcasts to HUD
   */
  async recordPerceptionEvent(eventData) {
    try {
      await run(
        'INSERT INTO environmental_events (id, event_type, source, target, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
        [eventData.id, eventData.event_type, eventData.source, eventData.target, eventData.details, eventData.timestamp]
      );
    } catch (_) {}

    // Emit event for AutonomousInitiativeEngine
    this.emit('perception_event', eventData);

    // Broadcast over WebSocket for UI
    this.broadcast('ENVIRONMENTAL_EVENT', eventData);
  }

  /**
   * Returns recent environmental perception events
   */
  async getRecentEvents(limit = 30) {
    const rows = await query('SELECT * FROM environmental_events ORDER BY timestamp DESC LIMIT ?', [limit]);
    return rows.map(r => ({
      ...r,
      details: r.details ? JSON.parse(r.details) : {}
    }));
  }
}

let perceptionInstance = null;

export const initEnvironmentalPerception = (wss) => {
  if (!perceptionInstance) {
    perceptionInstance = new EnvironmentalPerceptionService(wss);
    perceptionInstance.start();
  } else if (wss) {
    perceptionInstance.setWebSocketServer(wss);
  }
  return perceptionInstance;
};

export const getEnvironmentalPerception = () => perceptionInstance;
export default EnvironmentalPerceptionService;
