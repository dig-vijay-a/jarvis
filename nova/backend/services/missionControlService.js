import fs from 'fs';
import path from 'path';
import { query, run, get } from '../database/db.js';
import ToolRegistry from '../tools/registry.js';
import GeminiService from './geminiService.js';
import MemoryIntelligenceService from './memoryIntelligenceService.js';
import ModelRouterService from './modelRouterService.js';
import { getProvider } from './providers/index.js';
import DigitalTwinService from './digitalTwinService.js';
import KnowledgeGraphService from './knowledgeGraphService.js';
import TruthfulVerificationService from './truthfulVerificationService.js';
import { CoordinatorAgent, coordinatorInstance } from '../ai/agents/CoordinatorAgent.js';
import { SPECIALIZED_AGENTS } from '../ai/agents/specializedAgents.js';
import { sha256 } from '../security/cryptoUtils.js';

export const canonicalJson = (obj) => {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalJson).join(',')}]`;
  const sortedKeys = Object.keys(obj).sort();
  return `{${sortedKeys.map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
};

export const computeActionHash = (tool, args) => {
  const parsed = typeof args === 'string' ? JSON.parse(args || '{}') : (args || {});
  return sha256(`${tool}:${canonicalJson(parsed)}`);
};

export const MISSION_STATUSES = {
  PENDING: 'PENDING',
  PLANNING: 'PLANNING',
  RUNNING: 'RUNNING',
  WAITING_FOR_APPROVAL: 'WAITING_FOR_APPROVAL',
  BLOCKED_PROVIDER_UNAVAILABLE: 'BLOCKED_PROVIDER_UNAVAILABLE',
  BLOCKED_LOCAL_MODEL_UNAVAILABLE: 'BLOCKED_LOCAL_MODEL_UNAVAILABLE',
  PARTIALLY_VERIFIED: 'PARTIALLY_VERIFIED',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  PAUSED: 'PAUSED'
};

export const STEP_STATUSES = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  EXECUTED: 'EXECUTED',
  VERIFIED: 'VERIFIED',
  PARTIALLY_VERIFIED: 'PARTIALLY_VERIFIED',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
  WAITING_FOR_APPROVAL: 'WAITING_FOR_APPROVAL',
  COMPLETED: 'COMPLETED'
};

export const FAILURE_CLASSES = {
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  TRANSIENT_NETWORK: 'TRANSIENT_NETWORK',
  TIMEOUT: 'TIMEOUT',
  MALFORMED_PLAN: 'MALFORMED_PLAN',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INVALID_ARGUMENTS: 'INVALID_ARGUMENTS',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  SYSTEM_FAULT: 'SYSTEM_FAULT'
};

const SENSITIVE_TOOLS = new Set([
  'rename_file',
  'delete_memory',
  'emergency_stop',
  'execute_script',
  'send_email',
  'create_calendar_event',
  'github_create_issue',
  'publish_article',
  'financial_transfer'
]);

const GOVERNANCE_TRIGGER_REGEX = /\b(delete|remove|wipe|drop|publish|deploy_prod|broadcast|tweet|post_public|payment|transfer|purchase|checkout|billing|invoice_pay|wire_funds)\b/i;

export class MissionControlService {
  constructor(wss) {
    this.wss = wss;
    this.controllers = new Map(); // missionId -> { isPaused: boolean, isCancelled: boolean }
    this.activeExecutions = new Set(); // In-flight execution lock per missionId
    this.maxConcurrentWorkers = Number(process.env.MISSION_MAX_WORKERS) || 4;
    this.workerWaitQueue = []; // { missionId, priority, enqueuedAt, resolve }
    this.executionOrderLog = []; // Tracks priority dispatch order
    this.peakActiveWorkers = 0;
    this.peakQueueDepth = 0;
    this.recoverInterruptedMissions();
  }

  async acquireWorkerSlot(missionId, priority = 2) {
    if (this.activeExecutions.size < this.maxConcurrentWorkers) {
      this.activeExecutions.add(missionId);
      if (this.activeExecutions.size > this.peakActiveWorkers) {
        this.peakActiveWorkers = this.activeExecutions.size;
      }
      this.executionOrderLog.push({ missionId, priority, startedAt: Date.now() });
      return;
    }
    return new Promise((resolve) => {
      this.workerWaitQueue.push({ missionId, priority, enqueuedAt: Date.now(), resolve });
      // Sort descending by priority, then FIFO
      this.workerWaitQueue.sort((a, b) => (b.priority - a.priority) || (a.enqueuedAt - b.enqueuedAt));
      if (this.workerWaitQueue.length > this.peakQueueDepth) {
        this.peakQueueDepth = this.workerWaitQueue.length;
      }
    });
  }

  releaseWorkerSlot(missionId) {
    this.activeExecutions.delete(missionId);
    if (this.workerWaitQueue.length > 0 && this.activeExecutions.size < this.maxConcurrentWorkers) {
      const next = this.workerWaitQueue.shift();
      this.activeExecutions.add(next.missionId);
      if (this.activeExecutions.size > this.peakActiveWorkers) {
        this.peakActiveWorkers = this.activeExecutions.size;
      }
      this.executionOrderLog.push({ missionId: next.missionId, priority: next.priority, startedAt: Date.now() });
      next.resolve();
    }
  }

  getWorkerPoolMetrics() {
    return {
      max_concurrent_workers: this.maxConcurrentWorkers,
      active_workers: this.activeExecutions.size,
      queued_workers: this.workerWaitQueue.length,
      peak_active_workers: this.peakActiveWorkers,
      peak_queue_depth: this.peakQueueDepth,
      dispatch_history: this.executionOrderLog.slice(-50)
    };
  }

  sanitizeToolOutput(output) {
    if (output === null || output === undefined) return output;
    const injectionPatterns = [
      /ignore\s+(?:all\s+)?previous\s+instructions/gi,
      /system\s+directive\s*:/gi,
      /<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi,
      /__proto__|constructor\s*\[\s*['"]prototype['"]\s*\]/gi
    ];

    let sanitizedFlag = false;
    const cleanString = (str) => {
      let s = str;
      for (const pat of injectionPatterns) {
        const replaced = s.replace(pat, '[REDACTED_UNTRUSTED_DIRECTIVE]');
        if (replaced !== s) {
          sanitizedFlag = true;
          s = replaced;
        }
      }
      return s;
    };

    const scrub = (val) => {
      if (typeof val === 'string') return cleanString(val);
      if (Array.isArray(val)) return val.map(scrub);
      if (val && typeof val === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(val)) {
          if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
            sanitizedFlag = true;
            continue;
          }
          out[k] = scrub(v);
        }
        return out;
      }
      return val;
    };

    const scrubbed = scrub(output);
    if (sanitizedFlag && scrubbed && typeof scrubbed === 'object' && !Array.isArray(scrubbed)) {
      scrubbed.untrusted_content_sanitized = true;
    }
    return scrubbed;
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
   * Module 2: Failure Classification
   */
  classifyFailure(errorMessage = '', errorObj = null) {
    const code = String(errorObj?.code || '').toUpperCase();
    const msg = String(errorMessage || errorObj?.message || '').toLowerCase();
    if (
      code === 'LOCAL_MODEL_UNAVAILABLE' ||
      code === 'PROVIDER_UNAVAILABLE' ||
      msg.includes('local_model_unavailable') ||
      msg.includes('blocked_provider_unavailable') ||
      msg.includes('ollama') && (msg.includes('unavailable') || msg.includes('unreachable') || msg.includes('not downloaded'))
    ) {
      return FAILURE_CLASSES.PROVIDER_UNAVAILABLE;
    }
    if (
      code === 'RESOURCE_EXHAUSTED' ||
      msg.includes('resource_exhausted') ||
      msg.includes('insufficient free ram') ||
      msg.includes('out of memory') ||
      msg.includes('insufficient resources')
    ) {
      return FAILURE_CLASSES.RESOURCE_EXHAUSTED;
    }
    if (
      code === 'NETWORK_TIMEOUT' ||
      code === 'ECONNABORTED' ||
      code === 'ETIMEDOUT' ||
      msg.includes('timeout') ||
      msg.includes('timed out')
    ) {
      return FAILURE_CLASSES.TIMEOUT;
    }
    if (msg.includes('malformed') || msg.includes('valid structured step dag') || msg.includes('heuristic_fallback_disabled')) {
      return FAILURE_CLASSES.MALFORMED_PLAN;
    }
    if (msg.includes('0 verified external sources') || msg.includes('missing deliverable') || msg.includes('insufficient evidence')) {
      return FAILURE_CLASSES.INSUFFICIENT_EVIDENCE;
    }
    if (
      msg.includes('network') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('502') ||
      msg.includes('503') ||
      msg.includes('504') ||
      msg.includes('fetch failed')
    ) {
      return FAILURE_CLASSES.TRANSIENT_NETWORK;
    }
    if (
      msg.includes('permission') ||
      msg.includes('unauthorized') ||
      msg.includes('forbidden') ||
      msg.includes('approval') ||
      msg.includes('access denied')
    ) {
      return FAILURE_CLASSES.PERMISSION_DENIED;
    }
    if (msg.includes('not found') || msg.includes('enoent') || msg.includes('404')) {
      return FAILURE_CLASSES.RESOURCE_NOT_FOUND;
    }
    if (msg.includes('invalid') || msg.includes('required') || msg.includes('schema') || msg.includes('argument')) {
      return FAILURE_CLASSES.INVALID_ARGUMENTS;
    }
    return FAILURE_CLASSES.SYSTEM_FAULT;
  }

  /**
   * Module 2: Agent Performance Metrics Tracking
   */
  async recordAgentMetric(agentKey, isSuccess, retries = 0, latencyMs = 0) {
    try {
      const now = new Date().toISOString();
      const id = `metric-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await run(
        `INSERT OR IGNORE INTO agent_performance_metrics
         (id, agent_key, total_actions, successful_actions, failed_actions, retries, avg_latency_ms, last_updated)
         VALUES (?, ?, 0, 0, 0, 0, 0, ?)`,
        [id, agentKey, now]
      );

      await run(
        `UPDATE agent_performance_metrics
         SET avg_latency_ms = ROUND(((COALESCE(avg_latency_ms, 0) * total_actions) + ?) / (total_actions + 1)),
             total_actions = total_actions + 1,
             successful_actions = successful_actions + ?,
             failed_actions = failed_actions + ?,
             retries = retries + ?,
             last_updated = ?
         WHERE agent_key = ?`,
        [Math.round(latencyMs), isSuccess ? 1 : 0, isSuccess ? 0 : 1, retries, now, agentKey]
      );
    } catch (err) {
      console.warn('[MissionControl] Error updating agent metric:', err.message);
    }
  }

  /**
   * Module 2: Execution Checkpoints & Crash Recovery
   */
  async saveCheckpoint(missionId, stepIndex, snapshot) {
    try {
      const id = `chk-${missionId}-${stepIndex}`;
      await run(
        'INSERT OR REPLACE INTO mission_checkpoints (id, mission_id, step_index, state_snapshot, created_at) VALUES (?, ?, ?, ?, ?)',
        [id, missionId, stepIndex, JSON.stringify(snapshot), new Date().toISOString()]
      );
    } catch (err) {
      console.warn('[MissionControl] Checkpoint save note:', err.message);
    }
  }

  /**
   * P0/P4: Environmental Pre-Inspection
   * Inspects the computer environment before executing or retrying a step to see if
   * its expected postcondition is already satisfied (idempotency, crash recovery).
   */
  async inspectEnvironmentBeforeStep(step) {
    if (!step || !step.tool) return { alreadySatisfied: false };
    const tool = step.tool;
    const args = typeof step.args === 'string' ? JSON.parse(step.args || '{}') : (step.args || {});

    try {
      if (tool === 'write_file') {
        const filePath = args.file_path || args.path;
        if (filePath && fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (stats.size > 0) {
            let contentMatches = true;
            if (typeof args.content === 'string') {
              const physicalContent = fs.readFileSync(filePath, 'utf-8');
              contentMatches = (physicalContent.replace(/\r\n/g, '\n') === args.content.replace(/\r\n/g, '\n'));
            }
            if (contentMatches) {
              return {
                alreadySatisfied: true,
                evidence: {
                  file_path: filePath,
                  size: stats.size,
                  modified: stats.mtime,
                  reason: 'Target file already exists with verified content match.'
                }
              };
            }
          }
        }
      }

      if (tool === 'create_folder') {
        const folderPath = args.folder_path || args.path;
        if (folderPath && fs.existsSync(folderPath)) {
          return {
            alreadySatisfied: true,
            evidence: {
              folder_path: folderPath,
              reason: 'Target directory already exists.'
            }
          };
        }
      }

      if (tool === 'save_memory') {
        const key = args.key;
        if (key) {
          const row = await get('SELECT id, key, value FROM memories WHERE key = ?', [key]);
          if (row) {
            return {
              alreadySatisfied: true,
              evidence: {
                id: row.id,
                key: row.key,
                reason: 'Memory entry with specified key already exists.'
              }
            };
          }
        }
      }

      if (tool === 'create_task') {
        const title = args.title;
        if (title) {
          const row = await get('SELECT id, title FROM tasks WHERE title = ?', [title]);
          if (row) {
            return {
              alreadySatisfied: true,
              evidence: {
                id: row.id,
                title: row.title,
                reason: 'Task with identical title already registered.'
              }
            };
          }
        }
      }
    } catch (err) {
      console.warn(`[MissionControl] Pre-inspection note for step ${step.id}:`, err.message);
    }

    return { alreadySatisfied: false };
  }

  /**
   * P2: Rollback / Compensation Execution
   */
  async executeCompensation(step) {
    if (!step) return;
    try {
      console.log(`[MissionControl] Initiating compensation/rollback for step ${step.step_index} (${step.tool})...`);
      let comp = step.compensation_action;
      if (typeof comp === 'string') {
        try { comp = JSON.parse(comp); } catch (_) { }
      }

      if (comp && comp.tool) {
        await ToolRegistry.executeTool(comp.tool, comp.args || {});
      } else {
        // Default compensation heuristics
        if (step.tool === 'write_file') {
          const rawArgs = typeof step.args === 'string' ? JSON.parse(step.args || '{}') : (step.args || {});
          const filePath = rawArgs?.file_path || rawArgs?.path;
          if (filePath && fs.existsSync(filePath) && (filePath.endsWith('.tmp') || filePath.includes('scratch') || filePath.includes('temp_') || filePath.includes('multi_comp'))) {
            fs.unlinkSync(filePath);
            console.log(`[MissionControl] Compensation removed temporary file: ${filePath}`);
          }
        }
      }
      this.broadcast('MISSION_COMPENSATED', { stepId: step.id, tool: step.tool });
    } catch (err) {
      console.warn(`[MissionControl] Compensation action note for step ${step.id}:`, err.message);
    }
  }

  /**
   * P1/P2: Environmental Event Notification
   * Signals that an environmental event relevant to this mission has occurred.
   */
  async notifyEnvironmentalEvent(missionId, event) {
    try {
      console.log(`[MissionControl] Environmental event received for mission ${missionId}:`, event?.type || event);
      await run(
        "UPDATE missions SET last_heartbeat = ? WHERE id = ?",
        [new Date().toISOString(), missionId]
      );
      this.broadcast('MISSION_ENVIRONMENTAL_UPDATE', { missionId, event });

      const mission = await this.getMission(missionId);
      if (mission && (mission.status === MISSION_STATUSES.RUNNING || mission.status === MISSION_STATUSES.PAUSED)) {
        this.startMission(missionId).catch(err => {
          console.warn(`[MissionControl] Error resuming mission ${missionId} after event:`, err.message);
        });
      }
    } catch (err) {
      console.warn(`[MissionControl] notifyEnvironmentalEvent error:`, err.message);
    }
  }

  /**
   * Module 2: Application Restart Recovery
   */
  async recoverInterruptedMissions() {
    try {
      const runningMissions = await query(
        "SELECT id, status, objective FROM missions WHERE status IN ('RUNNING', 'PLANNING', 'IN_PROGRESS')"
      );

      let autoResume = true;
      try {
        const settingRow = await get("SELECT value FROM settings WHERE key = 'auto_resume_on_restart'");
        if (settingRow && settingRow.value !== undefined) {
          autoResume = settingRow.value === 'true' || settingRow.value === true;
        }
      } catch (_) { }

      for (const m of runningMissions) {
        console.log(`[MissionRecovery] Recovering interrupted mission ${m.id}...`);
        const now = new Date().toISOString();
        await run("UPDATE missions SET last_heartbeat = ? WHERE id = ?", [now, m.id]);

        const checkpoint = await get(
          'SELECT * FROM mission_checkpoints WHERE mission_id = ? ORDER BY step_index DESC LIMIT 1',
          [m.id]
        );

        // Pre-inspect remaining steps before blind restart or execution
        const remainingSteps = await query(
          "SELECT * FROM mission_steps WHERE mission_id = ? AND status NOT IN ('VERIFIED', 'PARTIALLY_VERIFIED', 'COMPLETED')",
          [m.id]
        );

        for (const s of remainingSteps) {
          const preInspection = await this.inspectEnvironmentBeforeStep(s);
          if (preInspection.alreadySatisfied) {
            console.log(`[MissionRecovery] Step ${s.step_index} (${s.tool}) already satisfied in environment. Marking VERIFIED.`);
            await run(
              "UPDATE mission_steps SET status = 'VERIFIED', verification_status = 'VERIFIED', verification_evidence = ?, completed_at = ? WHERE id = ?",
              [JSON.stringify(preInspection.evidence), now, s.id]
            );
          } else if (s.status === 'RUNNING' || s.status === 'IN_PROGRESS') {
            await run("UPDATE mission_steps SET status = 'PENDING' WHERE id = ?", [s.id]);
          }
        }

        const activeRemainingSteps = await query(
          "SELECT * FROM mission_steps WHERE mission_id = ? AND status NOT IN ('VERIFIED', 'PARTIALLY_VERIFIED', 'COMPLETED')",
          [m.id]
        );

        if (activeRemainingSteps.length === 0) {
          console.log(`[MissionRecovery] Checking acceptance contract for recovered mission ${m.id}...`);
          const recoveredMission = await this.getMission(m.id);
          const contractOutcome = await this.verifyMissionAcceptanceContract(recoveredMission);
          const reconciledStatus = contractOutcome.passed
            ? MISSION_STATUSES.COMPLETED
            : (contractOutcome.finalStatus || MISSION_STATUSES.PARTIALLY_VERIFIED);
          await run(
            'UPDATE missions SET status = ?, completed_at = ?, verification_report = ? WHERE id = ?',
            [
              reconciledStatus,
              reconciledStatus === MISSION_STATUSES.COMPLETED ? now : null,
              JSON.stringify(contractOutcome),
              m.id
            ]
          );
          this.broadcast(
            reconciledStatus === MISSION_STATUSES.COMPLETED ? 'MISSION_COMPLETED' : 'MISSION_STATUS',
            { missionId: m.id, status: reconciledStatus, verification_report: contractOutcome }
          );
          continue;
        }

        await this.recordCoordinationEvent(
          m.id,
          'RECOVERY_EVENT',
          'recovery_manager',
          'mission_control',
          { lastCheckpointStep: checkpoint ? checkpoint.step_index : 0, remainingSteps: activeRemainingSteps.length },
          autoResume ? 'AUTO_RESUMING' : 'PAUSED_FOR_APPROVAL'
        );

        const hasSensitiveOrApproval = activeRemainingSteps.some(
          s => this.checkStepGovernance(s).requiresApproval
        );

        if (autoResume && !hasSensitiveOrApproval && activeRemainingSteps.length > 0) {
          console.log(`[MissionRecovery] Mission ${m.id} contains safe steps only. Auto-resuming execution...`);
          this.broadcast('MISSION_RECOVERED', {
            missionId: m.id,
            lastCheckpointStep: checkpoint ? checkpoint.step_index : 0,
            status: 'AUTO_RESUMING'
          });
          setTimeout(() => {
            this.startMission(m.id).catch(err => {
              console.warn(`[MissionRecovery] Auto-resume failed for mission ${m.id}:`, err.message);
            });
          }, 1000);
        } else {
          await run("UPDATE missions SET status = 'PAUSED' WHERE id = ?", [m.id]);
          this.broadcast('MISSION_RECOVERED', {
            missionId: m.id,
            lastCheckpointStep: checkpoint ? checkpoint.step_index : 0,
            status: 'PAUSED',
            requiresApproval: hasSensitiveOrApproval
          });
        }
      }
      return { recoveredCount: runningMissions.length };
    } catch (err) {
      console.warn('[MissionRecovery] Startup recovery scan note:', err.message);
      return { recoveredCount: 0, error: err.message };
    }
  }

  /**
   * Verifies local Ollama daemon & configured model (e.g. qwen3.5:4b) before mission planning/execution.
   */
  /**
   * Verifies local Ollama daemon, configured model (e.g. qwen3.5:4b), residency,
   * and host resource headroom before mission planning/execution.
   */
  async ensureLocalModelReady() {
    const zeroCostLocal = await ModelRouterService.isZeroCostLocalOnly();
    if (!zeroCostLocal) {
      return { ready: true, zeroCostLocal: false };
    }
    const ollama = getProvider('ollama');
    if (!ollama || typeof ollama.verifyModelAvailability !== 'function') {
      return {
        ready: false,
        zeroCostLocal: true,
        failureClass: FAILURE_CLASSES.PROVIDER_UNAVAILABLE,
        blockedStatus: MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE,
        reason: 'Ollama provider not initialized.'
      };
    }
    const avail = await ollama.verifyModelAvailability();

    // Check host RAM headroom
    const minFreeRamGB = Number(process.env.MIN_REQUIRED_FREE_RAM_GB) || 0.5;
    const freeRamGB = avail?.resourceProfile?.freeRamGB;
    if (typeof freeRamGB === 'number' && freeRamGB < minFreeRamGB) {
      return {
        ready: false,
        zeroCostLocal: true,
        failureClass: FAILURE_CLASSES.RESOURCE_EXHAUSTED,
        blockedStatus: MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE,
        model: avail.model,
        endpoint: avail.endpoint,
        reason: `Insufficient free RAM (${freeRamGB} GB available < ${minFreeRamGB} GB required) for local inference.`,
        details: avail
      };
    }

    if (!avail.online) {
      return {
        ready: false,
        zeroCostLocal: true,
        failureClass: FAILURE_CLASSES.PROVIDER_UNAVAILABLE,
        blockedStatus: MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE,
        model: avail.model,
        endpoint: avail.endpoint,
        reason: avail.error || 'Local Ollama provider daemon is unreachable.',
        details: avail
      };
    }

    if (!avail.modelDownloaded) {
      return {
        ready: false,
        zeroCostLocal: true,
        failureClass: FAILURE_CLASSES.PROVIDER_UNAVAILABLE,
        blockedStatus: MISSION_STATUSES.BLOCKED_LOCAL_MODEL_UNAVAILABLE,
        model: avail.model,
        endpoint: avail.endpoint,
        reason: avail.error || `Configured local model '${avail.model}' is not downloaded.`,
        details: avail
      };
    }

    const modelResident = Array.isArray(avail.loadedModels)
      ? avail.loadedModels.some(m => ollama.modelMatchesTag(m.name, avail.model))
      : false;

    return {
      ready: true,
      zeroCostLocal: true,
      model: avail.model,
      endpoint: avail.endpoint,
      modelResident,
      reason: null,
      details: avail
    };
  }

  /**
   * Phase 18: Records an inter-agent or workflow lifecycle coordination event.
   */
  async recordCoordinationEvent(missionId, eventType, sourceAgent = 'coordinator', targetAgent = 'mission_control', payload = {}, resolutionStatus = 'RECORDED') {
    const id = `coord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nowIso = new Date().toISOString();
    try {
      await run(
        `INSERT INTO mission_coordination_events
         (id, mission_id, event_type, source_agent, target_agent, payload_json, resolution_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, missionId, eventType, sourceAgent, targetAgent, JSON.stringify(payload || {}), resolutionStatus, nowIso]
      );
    } catch (err) {
      console.warn('[MissionControl] recordCoordinationEvent note:', err.message);
    }
    this.broadcast('WORKFLOW_COORDINATION_EVENT', { id, missionId, eventType, sourceAgent, targetAgent, payload, resolutionStatus, timestamp: nowIso });
    return { id, mission_id: missionId, event_type: eventType, source_agent: sourceAgent, target_agent: targetAgent, payload, resolution_status: resolutionStatus, created_at: nowIso };
  }

  /**
   * Phase 18: Governance evaluator for sensitive, external-publication, financial, and destructive operations.
   */
  checkStepGovernance(step = {}) {
    const tool = String(step.tool || '');
    const argsStr = typeof step.args === 'string' ? step.args : JSON.stringify(step.args || {});
    const surface = `${tool} ${step.title || ''} ${step.description || ''} ${argsStr}`;
    const explicit = Boolean(step.requires_approval);
    const matchedSensitiveTool = SENSITIVE_TOOLS.has(tool);
    const matchedKeyword = GOVERNANCE_TRIGGER_REGEX.test(surface);
    const requiresApproval = explicit || matchedSensitiveTool || matchedKeyword;
    const category = matchedKeyword
      ? (/payment|transfer|purchase|checkout|billing|invoice_pay|wire_funds/i.test(surface)
        ? 'FINANCIAL_OR_PURCHASE'
        : (/publish|broadcast|tweet|post_public|send_email|github_create_issue/i.test(surface) ? 'EXTERNAL_PUBLICATION' : 'DESTRUCTIVE_OR_SENSITIVE'))
      : (matchedSensitiveTool ? 'SENSITIVE_TOOL' : (explicit ? 'EXPLICIT_GATE' : 'STANDARD'));
    return { requiresApproval, category };
  }

  /**
   * Phase 18: Validates a workflow DAG using Kahn's topological sort, detecting circular
   * dependencies, missing references, parallelizable wavefronts, and critical path length.
   */
  validateWorkflowDAG(steps = []) {
    if (!Array.isArray(steps) || steps.length === 0) {
      return { valid: false, error: 'Workflow must contain at least one step.', parallel_layers: [], critical_path_length: 0, nodes: [], edges: [] };
    }

    const byIndex = new Map();
    const inDegree = new Map();
    const adj = new Map();
    const edges = [];

    for (const s of steps) {
      const idx = Number(s.step_index);
      if (!Number.isInteger(idx) || idx <= 0) {
        return { valid: false, error: `Invalid step_index '${s.step_index}'.`, parallel_layers: [], critical_path_length: 0, nodes: [], edges: [] };
      }
      if (byIndex.has(idx)) {
        return { valid: false, error: `Duplicate step_index '${idx}' in workflow DAG.`, parallel_layers: [], critical_path_length: 0, nodes: [], edges: [] };
      }
      byIndex.set(idx, s);
      inDegree.set(idx, 0);
      adj.set(idx, []);
    }

    for (const s of steps) {
      const idx = Number(s.step_index);
      const deps = Array.isArray(s.depends_on)
        ? s.depends_on
        : (typeof s.depends_on === 'string' ? JSON.parse(s.depends_on || '[]') : []);

      for (const rawDep of deps) {
        const dep = Number(rawDep);
        if (dep === idx) {
          return {
            valid: false,
            circular: true,
            error: `CIRCULAR_DEPENDENCY_DETECTED: Step ${idx} depends on itself.`,
            parallel_layers: [],
            critical_path_length: 0,
            nodes: [],
            edges: []
          };
        }
        if (!byIndex.has(dep)) {
          return {
            valid: false,
            error: `INVALID_DEPENDENCY: Step ${idx} depends on missing step ${dep}.`,
            parallel_layers: [],
            critical_path_length: 0,
            nodes: [],
            edges: []
          };
        }
        adj.get(dep).push(idx);
        inDegree.set(idx, inDegree.get(idx) + 1);
        edges.push({ from: dep, to: idx });
      }
    }

    // Kahn's layered topological sort to detect cycles and identify parallel wavefronts
    const tempInDegree = new Map(inDegree);
    let queue = [];
    for (const [idx, deg] of tempInDegree.entries()) {
      if (deg === 0) queue.push(idx);
    }

    const parallelLayers = [];
    let visitedCount = 0;

    while (queue.length > 0) {
      const currentLayer = [...queue].sort((a, b) => a - b);
      parallelLayers.push(currentLayer);
      const nextQueue = [];
      for (const u of currentLayer) {
        visitedCount++;
        for (const v of adj.get(u)) {
          const nextDeg = tempInDegree.get(v) - 1;
          tempInDegree.set(v, nextDeg);
          if (nextDeg === 0) nextQueue.push(v);
        }
      }
      queue = nextQueue;
    }

    if (visitedCount !== steps.length) {
      const cycleNodes = [...tempInDegree.entries()].filter(([, d]) => d > 0).map(([idx]) => idx);
      return {
        valid: false,
        circular: true,
        cycle_nodes: cycleNodes,
        error: `CIRCULAR_DEPENDENCY_DETECTED: Cyclic dependency involving step(s) [${cycleNodes.join(', ')}].`,
        parallel_layers: [],
        critical_path_length: 0,
        nodes: [],
        edges
      };
    }

    const layerMap = new Map();
    parallelLayers.forEach((layer, lIdx) => layer.forEach(sIdx => layerMap.set(sIdx, lIdx)));
    const nodes = steps.map(s => ({
      step_index: Number(s.step_index),
      title: s.title,
      agent_key: s.agent_key || 'general',
      tool: s.tool,
      status: s.status || STEP_STATUSES.PENDING,
      layer: layerMap.get(Number(s.step_index)) ?? 0,
      requires_approval: Boolean(s.requires_approval)
    }));

    return {
      valid: true,
      circular: false,
      parallel_layers: parallelLayers,
      critical_path_length: parallelLayers.length,
      max_parallelism: Math.max(...parallelLayers.map(l => l.length), 1),
      nodes,
      edges
    };
  }

  /**
   * Persists planned steps into mission_steps with validation & idempotency hashes.
   */
  async persistMissionSteps(missionId, steps = []) {
    const dagCheck = this.validateWorkflowDAG(steps);
    if (!dagCheck.valid) {
      throw new Error(dagCheck.error);
    }

    await run('DELETE FROM mission_steps WHERE mission_id = ?', [missionId]);
    for (const step of steps) {
      const stepId = `step-${missionId}-${step.step_index}`;
      const gov = this.checkStepGovernance(step);
      const isSensitive = gov.requiresApproval && !step.approved_at;
      const actionHash = computeActionHash(step.tool, step.args);
      const compensation = step.compensation_action ? JSON.stringify(step.compensation_action) : null;

      await run(
        `INSERT INTO mission_steps 
        (id, mission_id, step_index, title, description, agent_key, tool, args, depends_on, status, requires_approval, idempotency_hash, retry_count, compensation_action) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          stepId,
          missionId,
          step.step_index,
          step.title,
          step.description || '',
          step.agent_key || 'system',
          step.tool || 'none',
          JSON.stringify(step.args || {}),
          JSON.stringify(step.depends_on || []),
          STEP_STATUSES.PENDING,
          isSensitive ? 1 : 0,
          actionHash,
          compensation
        ]
      );
    }
    return dagCheck;
  }

  /**
   * Uses the active local model via ModelRouterService to formulate & validate a DAG plan.
   */
  async planMissionStepsWithLLM(objective, { memoryContext = '', twinContext = '', graphContext = '' } = {}) {
    const cannedSkills = new Set([
      'code_repository_analyzer',
      'web_dossier_synthesizer',
      'system_resource_optimizer',
      'executive_presentation_summarizer',
      'meeting_calendar_planner',
      'desktop_mouse_action',
      'desktop_keyboard_action',
      'get_clipboard',
      'set_clipboard',
      'capture_screen',
      'analyze_screen',
      'manage_window',
      'manage_windows_bulk',
      'launch_app_instances',
      'focus_or_launch_app',
      'get_current_directory',
      'open_website',
      'start_focus_timer',
      'create_reminder',
      'update_task',
      'list_tasks',
      'create_task'
    ]);
    const objClassification = ModelRouterService.classifyTaskComplexity(objective);
    const objLow = String(objective || '').toLowerCase();
    let scopedToolNames = null;
    if (objClassification.taskClass === 'coding_debugging') {
      scopedToolNames = new Set(['hash_and_list_files', 'search_files', 'read_file', 'run_project_tests', 'write_file', 'save_memory']);
    } else if (objClassification.taskClass === 'research_synthesis') {
      scopedToolNames = new Set(['search_web', 'conduct_deep_research', 'write_file', 'save_memory', 'read_file']);
    } else if (/\b(?:open|launch|desktop|window|notepad|calculator)\b/i.test(objLow)) {
      scopedToolNames = new Set(['open_application', 'open_file', 'list_open_windows', 'write_file', 'read_file', 'save_memory']);
    } else if (/\b(?:organize|hash|duplicate|inventory|directory|folder|file|memory|delete|summary|summarize|report)\b/i.test(objLow)) {
      scopedToolNames = new Set(['hash_and_list_files', 'organize_files_by_type', 'search_files', 'read_file', 'write_file', 'save_memory', 'query_memories', 'delete_memory']);
    }

    const allRegistered = ToolRegistry.getTools().filter(t => !cannedSkills.has(t.name));
    const filteredForPlan = scopedToolNames ? allRegistered.filter(t => scopedToolNames.has(t.name)) : allRegistered;
    const planTools = filteredForPlan.length > 0 ? filteredForPlan : allRegistered;

    const toolCatalog = planTools
      .map(t => {
        const props = Object.keys(t.parameters?.properties || {}).join(',');
        const req = (t.parameters?.required || []).join(',');
        return `- ${t.name}(${props})${req ? `[req:${req}]` : ''}`;
      })
      .join('\n');

    const dedupeLines = (txt) => [...new Set(String(txt || '').split('\n').map(l => l.trim()).filter(Boolean))].slice(0, 5).join('\n');
    const compactMemory = dedupeLines(memoryContext);
    const compactTwin = dedupeLines(twinContext);
    const compactGraph = dedupeLines(graphContext);

    const planningPrompt = `JARVIS Mission Planner. Output strictly valid JSON DAG (1-5 steps).
Agents: research|content|coding|files|productivity|system.
ALLOWED TOOLS:
${toolCatalog}

RULES:
- NEVER invent filenames, hashes, test errors, or URLs. Use exact registered tools & param keys. Use forward slashes '/' in paths inside JSON.
- Code/docs/bugs/inventory/duplicates: use hash_and_list_files(include_content_preview:1). Tests: run_project_tests. Organize subfolders: single organize_files_by_type({directory}).
- Research with citations: search_web or conduct_deep_research(depth:"deep"), then write_file(content:"{{SYNTHESIZE_FROM_DEPS}}",depends_on:[...]).
- Report/summary files: write_file(file_path, content:"{{SYNTHESIZE_FROM_DEPS}}", depends_on:[prior_step_indices]).
- Desktop apps: open_application / open_file, plus list_open_windows if active window check requested.
${compactMemory ? `\nMemory:\n${compactMemory}` : ''}${compactTwin ? `\nPreferences:\n${compactTwin}` : ''}${compactGraph ? `\nGraph:\n${compactGraph}` : ''}

Objective: "${objective}"
JSON format:
{"plan_summary":"...","steps":[{"step_index":1,"title":"...","description":"...","agent_key":"files","tool":"hash_and_list_files","args":{"directory":"...","include_content_preview":1},"depends_on":[],"requires_approval":false}]}`;

    const localTimeout = Number(process.env.LOCAL_INFERENCE_TIMEOUT_MS) || 120000;
    const aiRes = await ModelRouterService.generateWithFallback({
      systemPrompt: planningPrompt,
      messages: [{ role: 'user', content: `Plan DAG JSON: "${objective}"` }],
      responseFormat: { type: 'json_object' },
      maxTokens: 512,
      temperature: 0.12,
      numCtx: objClassification.numCtx || 3584,
      taskClass: objClassification.taskClass,
      phaseType: 'planning',
      timeoutMs: localTimeout
    });

    const extractPlan = (rawTxt) => {
      if (!rawTxt) return null;
      const stripped = rawTxt.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const cleaned = jsonMatch[0]
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      return JSON.parse(cleaned);
    };

    let parsed = null;
    try {
      parsed = extractPlan(aiRes.text);
    } catch (_) {
      const retryRes = await ModelRouterService.generateWithFallback({
        systemPrompt: planningPrompt,
        messages: [{ role: 'user', content: `Strict valid JSON only for: "${objective}"` }],
        responseFormat: { type: 'json_object' },
        maxTokens: 512,
        temperature: 0.05,
        numCtx: objClassification.numCtx || 3584,
        taskClass: objClassification.taskClass,
        phaseType: 'planning',
        timeoutMs: localTimeout
      });
      parsed = extractPlan(retryRes.text);
    }

    if (!parsed || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      throw new Error('Local AI model failed to generate a valid structured step DAG.');
    }

    const validatedSteps = parsed.steps.map((s, idx) => {
      const normalizedArgs = { ...(s.args || {}) };
      if (s.tool === 'save_memory' && normalizedArgs.importance !== undefined && typeof normalizedArgs.importance === 'string') {
        const impMap = { critical: 5, high: 5, medium: 3, moderate: 3, low: 1 };
        const mapped = impMap[normalizedArgs.importance.toLowerCase().trim()];
        normalizedArgs.importance = mapped || (Number(normalizedArgs.importance) || 3);
      }
      const stepIndex = Number.isInteger(Number(s.step_index)) ? Number(s.step_index) : (idx + 1);
      if (s.tool && s.tool !== 'none') {
        const registered = ToolRegistry.getTool(s.tool);
        if (!registered) {
          throw new Error(`Invalid planned tool '${s.tool}' not found in ToolRegistry.`);
        }
      }
      const rawDeps = Array.isArray(s.depends_on) ? s.depends_on : [];
      const normalizedDeps = rawDeps
        .map(d => (d && typeof d === 'object' ? Number(d.step_index ?? d.step ?? d.id) : Number(d)))
        .filter(n => Number.isInteger(n) && n > 0 && n !== stepIndex);

      const argsStr = JSON.stringify(normalizedArgs);
      const hasPlaceholderArg = /\{\{[^}]+\}\}|<[a-z0-9_ \-\.]+>/i.test(argsStr);
      if (normalizedDeps.length === 0 && stepIndex > 1 && (hasPlaceholderArg || s.tool === 'write_file' || s.tool === 'open_file')) {
        normalizedDeps.push(stepIndex - 1);
      }

      let resolvedAgentKey = s.agent_key;
      if (s.tool && s.tool !== 'none') {
        const deleg = coordinatorInstance.delegateTask({
          directive: `${objective} — ${s.title || s.description || ''}`,
          tool: s.tool,
          preferredAgentKey: s.agent_key
        });
        if (deleg.authorized) {
          resolvedAgentKey = deleg.agentKey;
        } else {
          // If LLM misassigned an agent, automatically re-route to a capable specialist
          const autoDeleg = coordinatorInstance.delegateTask({
            directive: `${objective} — ${s.title || s.description || ''}`,
            tool: s.tool
          });
          resolvedAgentKey = autoDeleg.agentKey;
        }
      }

      return {
        ...s,
        agent_key: resolvedAgentKey || 'general',
        step_index: stepIndex,
        title: s.title || s.name || s.description || `Step ${stepIndex}: ${s.tool || 'action'}`,
        args: normalizedArgs,
        depends_on: normalizedDeps
      };
    });

    return {
      planSummary: parsed.plan_summary || `Autonomous Mission: ${objective}`,
      steps: validatedSteps
    };
  }

  /**
   * Builds a structured Mission Acceptance Contract persisted alongside the mission.
   */
  buildAcceptanceContract(objective, steps = [], explicitContract = null) {
    if (explicitContract && typeof explicitContract === 'object') {
      return {
        contract_version: '4.1',
        objective,
        required_deliverables: Array.isArray(explicitContract.required_deliverables) ? explicitContract.required_deliverables : [],
        expected_output_paths: Array.isArray(explicitContract.expected_output_paths) ? explicitContract.expected_output_paths : [],
        preconditions: Array.isArray(explicitContract.preconditions) ? explicitContract.preconditions : ['zero_cost_local_provider_ready'],
        acceptance_criteria: Array.isArray(explicitContract.acceptance_criteria) ? explicitContract.acceptance_criteria : ['all_required_steps_verified_without_partial_downgrade'],
        independent_verification_methods: Array.isArray(explicitContract.independent_verification_methods) ? explicitContract.independent_verification_methods : ['mission_step_postcondition_audit'],
        failure_and_recovery_conditions: explicitContract.failure_and_recovery_conditions || {
          on_provider_unavailable: MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE,
          on_resource_exhausted: MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE,
          on_timeout: MISSION_STATUSES.FAILED_RETRYABLE,
          on_missing_or_partial_deliverable: MISSION_STATUSES.PARTIALLY_VERIFIED,
          checkpoint_resume_supported: true
        }
      };
    }

    const expectedPathSet = new Set();
    const requiredDeliverables = [];

    // 1. Derive explicit file outputs from steps
    for (const s of (steps || [])) {
      const args = typeof s.args === 'string' ? JSON.parse(s.args || '{}') : (s.args || {});
      if (s.tool === 'write_file' && (args.file_path || args.path)) {
        const p = String(args.file_path || args.path).trim();
        if (p) {
          expectedPathSet.add(p);
          requiredDeliverables.push({
            id: `deliv-step-${s.step_index}`,
            type: 'file',
            step_index: s.step_index,
            target_path: p,
            min_bytes: 20
          });
        }
      } else if (s.tool === 'save_memory' && args.key) {
        requiredDeliverables.push({
          id: `deliv-mem-${s.step_index}`,
          type: 'memory',
          step_index: s.step_index,
          key: args.key
        });
      } else if (s.tool === 'open_application' || s.tool === 'open_file') {
        requiredDeliverables.push({
          id: `deliv-gui-${s.step_index}`,
          type: 'desktop_outcome',
          step_index: s.step_index,
          tool: s.tool,
          app_name: args.app_name || null,
          target_path: args.file_path || args.path || null
        });
      }
    }

    // 2. Also extract explicit Windows/workspace deliverable paths directly stated in objective text
    // (catches LLM plans that omitted a write_file step for a requested report)
    const objText = String(objective || '');
    const explicitFileMatches = [...objText.matchAll(/['"`]([A-Za-z]:\\[^'"`\r\n]+\.(?:md|txt|json|csv|html|py|js))['"`]/gi)];
    for (const m of explicitFileMatches) {
      const targetPath = m[1].trim();
      const mentionsWrite = /\b(?:write|save|create|generate|produce|export|output|summary|report|brief|analysis|benchmark)\b/i.test(objText);
      const isSourceInput = /\b(?:inspect|read|from|inside|corpus|directory)\b/i.test(objText.slice(Math.max(0, m.index - 40), m.index));
      if (mentionsWrite && !isSourceInput && !expectedPathSet.has(targetPath)) {
        expectedPathSet.add(targetPath);
        requiredDeliverables.push({
          id: `deliv-obj-${requiredDeliverables.length + 1}`,
          type: 'file',
          target_path: targetPath,
          min_bytes: 20
        });
      }
    }

    const hasWebStep = (steps || []).some(s => s.tool === 'search_web' || s.tool === 'conduct_deep_research');
    const requiresCitations = hasWebStep || /\b(cite|citations?|source\s+urls?|traceable\s+urls?|fido2|http\/3|quic|wasi|docker\s+vs|web\s+research)\b/i.test(objText);
    const hasDesktop = (steps || []).some(s => s.tool === 'open_application' || s.tool === 'open_file');
    const expectedOutputPaths = Array.from(expectedPathSet);

    return {
      contract_version: '4.1',
      objective: objText,
      required_deliverables: requiredDeliverables,
      expected_output_paths: expectedOutputPaths,
      requires_citations: requiresCitations,
      requires_desktop_outcome: hasDesktop,
      preconditions: [
        'zero_cost_local_provider_ready',
        ...(requiresCitations ? ['external_web_search_non_empty'] : []),
        ...(hasDesktop ? ['desktop_window_subsystem_available'] : [])
      ],
      acceptance_criteria: [
        'all_required_steps_verified_without_partial_downgrade',
        ...(expectedOutputPaths.length > 0 ? ['all_expected_files_exist_non_empty_with_sha256'] : []),
        ...(requiresCitations ? ['verifiable_external_https_citations_present_and_non_empty_search'] : []),
        ...(hasDesktop ? ['visible_desktop_hwnd_or_document_title_confirmed'] : [])
      ],
      independent_verification_methods: [
        'mission_step_postcondition_audit',
        ...(expectedOutputPaths.length > 0 ? ['filesystem_stat_sha256_and_content_inspection'] : []),
        ...(requiresCitations ? ['upstream_web_search_count_and_url_regex_audit'] : []),
        ...(hasDesktop ? ['win32_enumwindows_title_and_hwnd_check'] : [])
      ],
      failure_and_recovery_conditions: {
        on_provider_unavailable: MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE,
        on_model_missing: MISSION_STATUSES.BLOCKED_LOCAL_MODEL_UNAVAILABLE,
        on_resource_exhausted: MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE,
        on_timeout: MISSION_STATUSES.FAILED_RETRYABLE,
        on_missing_or_partial_deliverable: MISSION_STATUSES.PARTIALLY_VERIFIED,
        checkpoint_resume_supported: true
      }
    };
  }

  /**
   * Independent Mission Acceptance Verification Gate.
   * Never marks COMPLETED based solely on steps returning success; verifies physical files,
   * SHA-256 content hashes, non-placeholder payloads, real search evidence & citations,
   * database memories, and desktop window confirmations.
   */
  async verifyMissionAcceptanceContract(mission, finalSteps = null) {
    const steps = finalSteps || await query('SELECT * FROM mission_steps WHERE mission_id = ? ORDER BY step_index ASC', [mission.id]);
    const parsedSteps = steps.map(s => ({
      ...s,
      args: typeof s.args === 'string' ? JSON.parse(s.args || '{}') : (s.args || {}),
      result: typeof s.result === 'string' && s.result ? JSON.parse(s.result) : (s.result || null),
      verification_evidence: typeof s.verification_evidence === 'string' && s.verification_evidence
        ? JSON.parse(s.verification_evidence)
        : (s.verification_evidence || null)
    }));

    let contract = null;
    if (mission.acceptance_contract) {
      contract = typeof mission.acceptance_contract === 'string'
        ? JSON.parse(mission.acceptance_contract)
        : mission.acceptance_contract;
    }
    if (!contract) {
      contract = this.buildAcceptanceContract(mission.objective, parsedSteps);
    }

    const checks = [];
    let hasPartialStep = false;
    let hasFailedStep = false;

    // 1. Step completeness & partiality check
    if (parsedSteps.length === 0) {
      hasFailedStep = true;
      checks.push({ id: 'steps_present', type: 'steps', passed: false, reason: 'Mission contains zero executable steps.' });
    } else {
      for (const s of parsedSteps) {
        if (s.status === STEP_STATUSES.PARTIALLY_VERIFIED) {
          hasPartialStep = true;
          checks.push({
            id: `step-${s.step_index}`,
            type: 'step',
            tool: s.tool,
            passed: false,
            partial: true,
            reason: s.verification_evidence?.error || `Step ${s.step_index} (${s.tool}) only partially verified.`
          });
        } else if (s.status === STEP_STATUSES.VERIFIED || s.status === STEP_STATUSES.COMPLETED) {
          checks.push({
            id: `step-${s.step_index}`,
            type: 'step',
            tool: s.tool,
            passed: true,
            reason: `Step ${s.step_index} (${s.tool}) independently verified.`
          });
        } else {
          hasFailedStep = true;
          checks.push({
            id: `step-${s.step_index}`,
            type: 'step',
            tool: s.tool,
            passed: false,
            reason: `Step ${s.step_index} (${s.tool}) ended in status '${s.status}'.`
          });
        }
      }
    }

    // 2. Research citation precondition check
    const searchSteps = parsedSteps.filter(s => s.tool === 'search_web' || s.tool === 'conduct_deep_research');
    if (contract.requires_citations && searchSteps.length > 0) {
      const totalSources = searchSteps.reduce((acc, s) => {
        const list = s.result?.results || s.result?.citations || s.result?.data?.sources || [];
        return acc + (Array.isArray(list) ? list.length : 0);
      }, 0);
      if (totalSources === 0) {
        checks.push({
          id: 'web_research_sources',
          type: 'precondition',
          passed: false,
          reason: 'Required external web search returned 0 verified sources; ungrounded report cannot be marked COMPLETED.'
        });
      } else {
        checks.push({
          id: 'web_research_sources',
          type: 'precondition',
          passed: true,
          source_count: totalSources,
          reason: `External web search returned ${totalSources} real source(s).`
        });
      }
    }

    // 3. Independent filesystem / memory / desktop deliverable verification
    const deliverableArtifacts = [];
    for (const deliv of (contract.required_deliverables || [])) {
      if (deliv.type === 'file' && deliv.target_path) {
        const exists = fs.existsSync(deliv.target_path);
        if (!exists) {
          checks.push({
            id: deliv.id,
            type: 'file_deliverable',
            target_path: deliv.target_path,
            passed: false,
            reason: `Missing required deliverable file: ${deliv.target_path}`
          });
          continue;
        }
        const stat = fs.statSync(deliv.target_path);
        const rawText = stat.isFile() ? fs.readFileSync(deliv.target_path, 'utf-8') : '';
        const contentHash = sha256(rawText);
        const hasUnresolvedPlaceholder = /\{\{SYNTHESIZE_FROM_DEPS\}\}|\{\{[A-Z0-9_]+\}\}/.test(rawText);
        const minBytes = deliv.min_bytes || 20;
        const sizeOk = stat.isFile() && stat.size >= minBytes && rawText.trim().length > 0;
        const citationsOk = !contract.requires_citations || /https?:\/\/[^\s)]+/i.test(rawText);

        const passed = sizeOk && !hasUnresolvedPlaceholder && citationsOk;
        let reason = 'Deliverable file exists, non-empty, and SHA-256 verified.';
        if (!sizeOk) reason = `Deliverable file is empty or below minimum size (${stat.size} bytes < ${minBytes}).`;
        else if (hasUnresolvedPlaceholder) reason = 'Deliverable file still contains unresolved template placeholder.';
        else if (!citationsOk) reason = 'Research deliverable lacks verifiable https:// source URLs.';

        checks.push({
          id: deliv.id,
          type: 'file_deliverable',
          target_path: deliv.target_path,
          bytes: stat.size,
          sha256: contentHash,
          passed,
          reason
        });
        if (passed) {
          deliverableArtifacts.push({ target_path: deliv.target_path, bytes: stat.size, sha256: contentHash });
        }
      } else if (deliv.type === 'memory' && deliv.key) {
        const row = await get('SELECT id, key, category FROM memories WHERE key = ?', [deliv.key]);
        checks.push({
          id: deliv.id,
          type: 'memory_deliverable',
          key: deliv.key,
          passed: Boolean(row),
          reason: row ? `Memory '${deliv.key}' verified in database.` : `Missing persisted memory '${deliv.key}'.`
        });
      } else if (deliv.type === 'desktop_outcome') {
        const s = parsedSteps.find(st => st.step_index === deliv.step_index);
        const dv = s?.verification_evidence?.desktopVerification;
        const ok = Boolean(s?.status === STEP_STATUSES.VERIFIED && dv?.window_visible);
        checks.push({
          id: deliv.id,
          type: 'desktop_deliverable',
          tool: deliv.tool,
          passed: ok,
          partial: Boolean(dv?.process_created && !dv?.window_visible),
          desktopVerification: dv || null,
          reason: ok
            ? `Desktop window confirmed (${dv.matched_window_title || dv.matched_hwnd}).`
            : `Desktop GUI outcome not confirmed (level=${dv?.verification_level || 'none'}).`
        });
      }
    }

    const totalChecks = checks.length;
    const passedChecks = checks.filter(c => c.passed).length;
    const failedChecks = checks.filter(c => !c.passed);

    const allPassed = totalChecks > 0 && failedChecks.length === 0 && !hasPartialStep && !hasFailedStep;
    let finalStatus = MISSION_STATUSES.FAILED;
    if (allPassed) {
      finalStatus = MISSION_STATUSES.COMPLETED;
    } else if (passedChecks > 0 || hasPartialStep) {
      finalStatus = MISSION_STATUSES.PARTIALLY_VERIFIED;
    }

    return {
      contract_version: contract.contract_version || '4.1',
      passed: allPassed,
      finalStatus,
      totalChecks,
      passedChecks,
      failedCount: failedChecks.length,
      hasPartialStep,
      checks,
      deliverableArtifacts,
      summary: allPassed
        ? `All ${totalChecks} acceptance contract verification check(s) passed.`
        : `Contract verification incomplete (${passedChecks}/${totalChecks} checks passed; finalStatus=${finalStatus}). Failed: ${failedChecks.map(f => f.reason).join(' | ')}`
    };
  }

  /**
   * Parks a mission cleanly in BLOCKED_PROVIDER_UNAVAILABLE or BLOCKED_LOCAL_MODEL_UNAVAILABLE
   * with full checkpoint preservation so it can auto-resume when provider health returns.
   */
  async parkMissionBlockedLocalModel(missionId, reason, pendingStepId = null, targetStatus = MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE, failureClass = FAILURE_CLASSES.PROVIDER_UNAVAILABLE) {
    if (pendingStepId) {
      await run('UPDATE mission_steps SET status = ?, error = ? WHERE id = ?', [STEP_STATUSES.PENDING, reason, pendingStepId]);
    }
    const existingSteps = await query('SELECT step_index, status FROM mission_steps WHERE mission_id = ? ORDER BY step_index ASC', [missionId]);
    const checkpointState = {
      paused_at: new Date().toISOString(),
      reason,
      failure_class: failureClass,
      pending_step_id: pendingStepId,
      completed_steps: existingSteps.filter(s => s.status === STEP_STATUSES.VERIFIED || s.status === STEP_STATUSES.COMPLETED).map(s => s.step_index)
    };
    await run(
      'UPDATE missions SET status = ?, error = ?, failure_class = ?, checkpoint_state = ? WHERE id = ?',
      [targetStatus, reason, failureClass, JSON.stringify(checkpointState), missionId]
    );
    this.broadcast('MISSION_STATUS', {
      missionId,
      status: targetStatus,
      failureClass,
      error: reason
    });
  }

  /**
   * Parks a mission in FAILED_RETRYABLE on transient inference timeout / network blip, preserving progress checkpoints.
   */
  async parkMissionFailedRetryable(missionId, reason, pendingStepId = null, failureClass = FAILURE_CLASSES.TIMEOUT) {
    if (pendingStepId) {
      await run('UPDATE mission_steps SET status = ?, error = ?, failure_classification = ? WHERE id = ?', [STEP_STATUSES.PENDING, reason, failureClass, pendingStepId]);
    }
    const existingSteps = await query('SELECT step_index, status FROM mission_steps WHERE mission_id = ? ORDER BY step_index ASC', [missionId]);
    const checkpointState = {
      paused_at: new Date().toISOString(),
      reason,
      failure_class: failureClass,
      retryable: true,
      pending_step_id: pendingStepId,
      completed_steps: existingSteps.filter(s => s.status === STEP_STATUSES.VERIFIED || s.status === STEP_STATUSES.COMPLETED).map(s => s.step_index)
    };
    await run(
      'UPDATE missions SET status = ?, error = ?, failure_class = ?, checkpoint_state = ? WHERE id = ?',
      [MISSION_STATUSES.FAILED_RETRYABLE, reason, failureClass, JSON.stringify(checkpointState), missionId]
    );
    this.broadcast('MISSION_STATUS', {
      missionId,
      status: MISSION_STATUSES.FAILED_RETRYABLE,
      failureClass,
      error: reason
    });
  }

  /**
   * Resumes missions blocked on unavailable local provider/model (and eligible FAILED_RETRYABLE missions)
   * once daemon & model are healthy again.
   */
  async resumeBlockedLocalModelMissions({ includeRetryable = false } = {}) {
    if (this._resumingBlockedMissions) {
      return { resumedCount: 0, skipped: 'in_progress', ready: true };
    }
    this._resumingBlockedMissions = true;
    try {
      const check = await this.ensureLocalModelReady();
      if (!check.ready) {
        return { resumedCount: 0, ready: false, reason: check.reason, failureClass: check.failureClass };
      }

      const targetStatuses = includeRetryable
        ? [MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE, MISSION_STATUSES.BLOCKED_LOCAL_MODEL_UNAVAILABLE, MISSION_STATUSES.FAILED_RETRYABLE]
        : [MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE, MISSION_STATUSES.BLOCKED_LOCAL_MODEL_UNAVAILABLE];
      const placeholders = targetStatuses.map(() => '?').join(', ');

      const blockedMissions = await query(
        `SELECT * FROM missions WHERE status IN (${placeholders}) ORDER BY priority ASC, created_at ASC`,
        targetStatuses
      );

      const resumedIds = [];
      for (const m of blockedMissions) {
        const claim = await run(
          `UPDATE missions SET status = 'RESUMING' WHERE id = ? AND status IN (${placeholders})`,
          [m.id, ...targetStatuses]
        );
        if (!claim || claim.changes === 0) continue;

        try {
          const existingSteps = await query('SELECT * FROM mission_steps WHERE mission_id = ? ORDER BY step_index ASC', [m.id]);
          if (existingSteps.length === 0) {
            const relevantMemories = await MemoryIntelligenceService.retrieveRelevantMemories(m.objective, 3);
            const memoryContext = relevantMemories.map(mem => `- ${mem.key}: ${mem.value}`).join('\n');
            const planned = await this.planMissionStepsWithLLM(m.objective, { memoryContext });
            await this.persistMissionSteps(m.id, planned.steps);
            const contract = this.buildAcceptanceContract(m.objective, planned.steps);
            await run('UPDATE missions SET plan_summary = ?, acceptance_contract = ?, status = ?, error = NULL, failure_class = NULL WHERE id = ?', [
              planned.planSummary,
              JSON.stringify(contract),
              MISSION_STATUSES.PENDING,
              m.id
            ]);
          } else {
            await run('UPDATE missions SET status = ?, error = NULL, failure_class = NULL WHERE id = ?', [
              MISSION_STATUSES.PENDING,
              m.id
            ]);
          }
          await this.startMission(m.id);
          resumedIds.push(m.id);
        } catch (err) {
          console.warn(`[MissionRecovery] Failed to resume blocked mission ${m.id}:`, err.message);
          const fClass = this.classifyFailure(err.message, err);
          const parkStatus = (fClass === FAILURE_CLASSES.TIMEOUT || fClass === FAILURE_CLASSES.TRANSIENT_NETWORK)
            ? MISSION_STATUSES.FAILED_RETRYABLE
            : MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE;
          await run('UPDATE missions SET status = ?, error = ?, failure_class = ? WHERE id = ?', [
            parkStatus,
            err.message,
            fClass,
            m.id
          ]);
        }
      }

      return { resumedCount: resumedIds.length, resumedMissionIds: resumedIds, ready: true };
    } finally {
      this._resumingBlockedMissions = false;
    }
  }

  /**
   * Plans a high-level autonomous mission with multi-agent delegation & step dependencies (DAG)
   */
  async createMission(objectiveInput) {
    const isObj = typeof objectiveInput === 'object' && objectiveInput !== null;
    const objective = isObj
      ? (objectiveInput.objective || JSON.stringify(objectiveInput))
      : String(objectiveInput || '');
    const idempotencyKey = isObj ? (objectiveInput.idempotency_key || objectiveInput.idempotencyKey || null) : null;
    const priority = isObj && objectiveInput.priority !== undefined ? Number(objectiveInput.priority) : 2;
    const goalId = isObj ? (objectiveInput.goalId || objectiveInput.goal_id || null) : null;
    const explicitContract = isObj ? (objectiveInput.acceptance_contract || objectiveInput.acceptanceContract || null) : null;
    const explicitSteps = isObj && Array.isArray(objectiveInput.steps) ? objectiveInput.steps : null;

    if (idempotencyKey) {
      const existing = await get(
        "SELECT id FROM missions WHERE idempotency_key = ? AND status NOT IN ('FAILED', 'CANCELLED') LIMIT 1",
        [idempotencyKey]
      );
      if (existing) {
        const m = await this.getMission(existing.id);
        return { ...m, deduplicated: true };
      }
    }

    const missionId = `mission-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    if (explicitSteps) {
      const normalizedExplicit = explicitSteps.map((s, idx) => ({
        ...s,
        step_index: Number.isInteger(Number(s.step_index)) ? Number(s.step_index) : (idx + 1),
        agent_key: s.agent_key || coordinatorInstance.delegateTask({ directive: `${objective} ${s.title || ''}`, tool: s.tool }).agentKey || 'general',
        args: s.args || {},
        depends_on: Array.isArray(s.depends_on) ? s.depends_on.map(Number) : []
      }));
      const dagReport = this.validateWorkflowDAG(normalizedExplicit);
      if (!dagReport.valid) {
        const err = new Error(dagReport.error);
        err.code = dagReport.circular ? 'CIRCULAR_DEPENDENCY_DETECTED' : 'INVALID_WORKFLOW_DAG';
        throw err;
      }
      const contract = this.buildAcceptanceContract(objective.trim(), normalizedExplicit, explicitContract);
      const metadata = {
        dag: {
          parallel_layers: dagReport.parallel_layers,
          critical_path_length: dagReport.critical_path_length,
          max_parallelism: dagReport.max_parallelism,
          edges: dagReport.edges
        },
        source: 'explicit_structured_dag'
      };
      await run(
        'INSERT INTO missions (id, objective, plan_summary, status, created_at, replan_count, goal_id, last_heartbeat, priority, idempotency_key, acceptance_contract, workflow_metadata) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)',
        [missionId, objective.trim(), objectiveInput.plan_summary || `Structured Workflow: ${objective}`, MISSION_STATUSES.PENDING, now, goalId, now, priority, idempotencyKey, JSON.stringify(contract), JSON.stringify(metadata)]
      );
      await this.persistMissionSteps(missionId, normalizedExplicit);
      await this.recordCoordinationEvent(missionId, 'WORKFLOW_PLANNED', 'coordinator', 'mission_control', metadata.dag, 'VALIDATED');
      this.broadcast('MISSION_CREATED', { missionId, objective, stepCount: normalizedExplicit.length, acceptance_contract: contract, dag: metadata.dag });
      return this.getMission(missionId);
    }

    const initialContract = this.buildAcceptanceContract(objective.trim(), [], explicitContract);

    // 0. Critical Reliability Gate: verify local Ollama daemon + model + host resources before autonomous planning
    const localGate = await this.ensureLocalModelReady();
    if (!localGate.ready) {
      const reason = localGate.reason || 'Local AI provider is unavailable.';
      const blockedStatus = localGate.blockedStatus || MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE;
      const failureClass = localGate.failureClass || FAILURE_CLASSES.PROVIDER_UNAVAILABLE;
      const checkpointState = { paused_at: now, reason, failure_class: failureClass, completed_steps: [] };
      await run(
        'INSERT INTO missions (id, objective, plan_summary, status, error, created_at, replan_count, goal_id, last_heartbeat, priority, idempotency_key, acceptance_contract, failure_class, checkpoint_state) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)',
        [
          missionId,
          objective.trim(),
          `Blocked (${blockedStatus}): ${objective}`,
          blockedStatus,
          reason,
          now,
          goalId,
          now,
          priority,
          idempotencyKey,
          JSON.stringify(initialContract),
          failureClass,
          JSON.stringify(checkpointState)
        ]
      );
      this.broadcast('MISSION_STATUS', { missionId, status: blockedStatus, failureClass, error: reason });
      const blockedMission = await this.getMission(missionId);
      return { ...blockedMission, blocked: true };
    }

    // 1. Context retrieval: pull relevant memories, digital twin preferences, knowledge graph
    const relevantMemories = await MemoryIntelligenceService.retrieveRelevantMemories(objective, 3);
    const memoryContext = relevantMemories.map(m => `- ${m.key}: ${m.value}`).join('\n');

    let twinContext = '';
    try {
      twinContext = await DigitalTwinService.getFormattedContextForPrompt();
    } catch (_) { }

    let graphContext = '';
    try {
      const entities = await KnowledgeGraphService.searchEntities(objective, 5);
      if (entities.length > 0) {
        graphContext = entities.map(e => `- ${e.name} (${e.entity_type}): ${JSON.stringify(e.properties)}`).join('\n');
      }
    } catch (_) { }

    let planSummary = `Autonomous Mission: ${objective}`;
    let steps = [];

    try {
      const planned = await this.planMissionStepsWithLLM(objective, { memoryContext, twinContext, graphContext });
      planSummary = planned.planSummary;
      steps = planned.steps;
    } catch (err) {
      // Never use generic heuristic steps to pretend a task can succeed when planning fails
      const fClass = this.classifyFailure(err.message, err);
      const isProviderDown = fClass === FAILURE_CLASSES.PROVIDER_UNAVAILABLE || fClass === FAILURE_CLASSES.RESOURCE_EXHAUSTED;
      const isRetryable = fClass === FAILURE_CLASSES.TIMEOUT || fClass === FAILURE_CLASSES.TRANSIENT_NETWORK;
      const statusToSave = isProviderDown
        ? (String(err.message).toLowerCase().includes('not downloaded') ? MISSION_STATUSES.BLOCKED_LOCAL_MODEL_UNAVAILABLE : MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE)
        : (isRetryable ? MISSION_STATUSES.FAILED_RETRYABLE : MISSION_STATUSES.FAILED);
      const checkpointState = { paused_at: now, reason: err.message, failure_class: fClass, completed_steps: [] };

      await run(
        'INSERT INTO missions (id, objective, plan_summary, status, error, created_at, replan_count, goal_id, last_heartbeat, priority, idempotency_key, acceptance_contract, failure_class, checkpoint_state) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)',
        [
          missionId,
          objective.trim(),
          planSummary,
          statusToSave,
          err.message,
          now,
          goalId,
          now,
          priority,
          idempotencyKey,
          JSON.stringify(initialContract),
          fClass,
          JSON.stringify(checkpointState)
        ]
      );
      this.broadcast('MISSION_STATUS', { missionId, status: statusToSave, failureClass: fClass, error: err.message });
      const failedOrBlocked = await this.getMission(missionId);
      return { ...failedOrBlocked, blocked: isProviderDown };
    }

    const finalContract = this.buildAcceptanceContract(objective.trim(), steps, explicitContract);
    const dagMeta = this.validateWorkflowDAG(steps);
    const metadata = {
      dag: {
        parallel_layers: dagMeta.parallel_layers,
        critical_path_length: dagMeta.critical_path_length,
        max_parallelism: dagMeta.max_parallelism,
        edges: dagMeta.edges
      },
      source: 'llm_planned_dag'
    };

    // Persist Mission, Acceptance Contract, and Validated Steps in DB
    await run(
      'INSERT INTO missions (id, objective, plan_summary, status, created_at, replan_count, goal_id, last_heartbeat, priority, idempotency_key, acceptance_contract, workflow_metadata) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)',
      [missionId, objective.trim(), planSummary, MISSION_STATUSES.PENDING, now, goalId, now, priority, idempotencyKey, JSON.stringify(finalContract), JSON.stringify(metadata)]
    );
    await this.persistMissionSteps(missionId, steps);
    await this.recordCoordinationEvent(missionId, 'WORKFLOW_PLANNED', 'coordinator', 'mission_control', metadata.dag, 'VALIDATED');

    this.broadcast('MISSION_CREATED', { missionId, objective, stepCount: steps.length, acceptance_contract: finalContract, dag: metadata.dag });
    return this.getMission(missionId);
  }

  /**
   * Legacy generic heuristic generation is strictly prohibited in SENTINEL Stage 4.1+.
   */
  generateHeuristicMissionSteps() {
    throw new Error('HEURISTIC_FALLBACK_DISABLED: Generic heuristic mission steps are prohibited; structured LLM planning is required.');
  }

  /**
   * Resolves dynamic cross-step inputs and synthesizes grounded file/memory payloads
   * from actual upstream step execution results before running dependent steps.
   */
  async synthesizeStepInputs(mission, step) {
    const args = { ...(step.args || {}) };
    const isPlaceholderStr = (v) => typeof v === 'string' && (/\{\{[^}]+\}\}/.test(v) || /^<[a-z0-9_ \-\.]+>$/i.test(v.trim()));
    const hasAnyPlaceholder = isPlaceholderStr(args.file_path) || isPlaceholderStr(args.content) || isPlaceholderStr(args.value);
    const deps = Array.isArray(step.depends_on) ? step.depends_on : [];
    if (deps.length === 0 && !hasAnyPlaceholder) return args;

    const isSynthesisStep = step.tool === 'write_file' || step.tool === 'save_memory';
    const depSteps = (mission.steps || []).filter(s =>
      (deps.length > 0
        ? (deps.includes(s.step_index) || (isSynthesisStep && s.step_index < step.step_index && ['hash_and_list_files', 'search_web', 'conduct_deep_research', 'run_project_tests', 'read_file'].includes(s.tool)))
        : s.step_index < step.step_index) &&
      (s.status === STEP_STATUSES.VERIFIED || s.status === STEP_STATUSES.PARTIALLY_VERIFIED || s.status === STEP_STATUSES.COMPLETED) &&
      s.result
    );
    if (depSteps.length === 0) return args;

    // 1. Dynamic file_path resolution for open_file / read_file if left blank or placeholder ({{...}} or <...>)
    if ((step.tool === 'open_file' || step.tool === 'read_file') && (!args.file_path || isPlaceholderStr(args.file_path))) {
      const writeDep = [...depSteps].reverse().find(s => s.tool === 'write_file' && (s.args?.file_path || s.result?.file_path));
      if (writeDep && step.tool === 'open_file') {
        args.file_path = writeDep.result?.file_path || writeDep.args.file_path;
      } else if (step.tool === 'read_file') {
        const listDep = [...depSteps].reverse().find(s => Array.isArray(s.result?.files) && s.result.files.length > 0);
        if (listDep) {
          const hintTokens = String(args.file_path || step.title || mission.objective || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
          const rankedFiles = listDep.result.files
            .map(f => {
              const fpath = typeof f === 'string' ? f : (f?.path || f?.full_path || '');
              const fLow = fpath.toLowerCase();
              const score = hintTokens.reduce((acc, tok) => acc + (fLow.includes(tok) ? 2 : 0), 0) + (/\.(js|ts|py|md|txt)$/i.test(fLow) ? 1 : 0);
              return { fpath, score };
            })
            .filter(x => x.fpath)
            .sort((a, b) => b.score - a.score);
          if (rankedFiles.length > 0) {
            args.file_path = rankedFiles[0].fpath;
          }
        }
      }
    }

    // 2. Dynamic content synthesis for write_file / save_memory when using placeholders or empty payload
    const needsSynthesis =
      (step.tool === 'write_file' && (
        !args.content ||
        !String(args.content).trim() ||
        isPlaceholderStr(args.content) ||
        String(args.content).includes('{{')
      )) ||
      (step.tool === 'save_memory' && typeof args.value === 'string' && (args.value.includes('{{') || isPlaceholderStr(args.value)));

    if (!needsSynthesis) return args;

    // Respect exact quoted literal payload if caller specified a fixed string token already present in args.content
    const quotedLiterals = [...(mission.objective || '').matchAll(/'([A-Z0-9_]{8,})'/g)].map(m => m[1]);
    if (step.tool === 'write_file' && quotedLiterals.length > 0 && quotedLiterals.every(q => String(args.content || '').includes(q))) {
      return args;
    }

    // Enrich upstream search_files / hash_and_list_files results with real bounded file contents if previews weren't captured
    const upstreamEvidence = [];
    const retrievedWebSources = [];
    for (const d of depSteps) {
      const resObj = { ...d.result };
      if ((d.tool === 'hash_and_list_files' || d.tool === 'search_files') && Array.isArray(resObj.files)) {
        resObj.files = resObj.files.slice(0, 20).map(f => {
          let preview = f.content_preview || '';
          const fpath = f.path || f.full_path;
          if (!preview && fpath && fs.existsSync(fpath)) {
            try {
              const st = fs.statSync(fpath);
              if (st.isFile() && st.size <= 32768 && !/\.(png|jpg|jpeg|gif|pdf|zip|exe|sqlite)$/i.test(fpath)) {
                preview = fs.readFileSync(fpath, 'utf8').slice(0, 3500);
              }
            } catch (_) { }
          }
          return {
            relative_path: f.relative_path || path.basename(fpath || ''),
            size_bytes: f.size_bytes ?? f.size ?? 0,
            ...(preview ? { content_preview: preview } : {})
          };
        });
      }
      const srcs = d.result?.results || d.result?.citations || d.result?.data?.sources || [];
      if (Array.isArray(srcs)) {
        for (const s of srcs) {
          if (s?.url && /^https?:\/\//i.test(s.url) && !retrievedWebSources.some(x => x.url === s.url)) {
            retrievedWebSources.push({ title: s.title || s.url, url: s.url });
          }
        }
      }
      upstreamEvidence.push({ step_index: d.step_index, tool: d.tool, args: d.args, result: resObj });
    }

    let synthesized = '';
    const objLow = (mission.objective || '').toLowerCase();
    const explicitDeps = deps.length > 0 ? depSteps.filter(d => deps.includes(d.step_index)) : depSteps;
    const formatSourceDeps = explicitDeps.length > 0 ? explicitDeps : depSteps;
    // Fast deterministic grounded formatting for pure tabular inventory / duplicate-hash / test-runner deliverables (saves LLM TPM quota)
    if (step.tool === 'write_file' && formatSourceDeps.every(d => d.tool === 'hash_and_list_files') && (objLow.includes('inventory') || objLow.includes('duplicate'))) {
      const hRes = formatSourceDeps[0].result;
      const rows = (hRes.files || []).map(f => `| \`${f.relative_path}\` | ${f.size_bytes} | \`${f.sha256}\` |`).join('\n');
      const dupSec = (hRes.duplicate_groups || []).length > 0
        ? `\n## Duplicate File Groups (SHA-256)\n` + hRes.duplicate_groups.map((g, i) => `### Duplicate Group ${i + 1}\n- SHA-256: \`${g.sha256}\`\n- Files: ${g.files.map(x => `\`${x}\``).join(', ')}\n`).join('\n')
        : '';
      synthesized = `# Directory Inspection Report\n\nTarget: \`${hRes.directory}\` (${hRes.count} files)\n\n| Relative Path | Size (bytes) | SHA-256 |\n|---|---:|---|\n${rows}\n${dupSec}`;
    } else if (step.tool === 'write_file' && formatSourceDeps.every(d => d.tool === 'run_project_tests')) {
      const tRes = formatSourceDeps[0].result;
      synthesized = `# Test Execution Report\n\n- Directory: \`${tRes.directory}\`\n- Command: \`${tRes.command}\`\n- Exit Code: ${tRes.exit_code}\n- Total Tests: ${tRes.tests_total}\n- Passed: ${tRes.tests_passed}\n- Failed: ${tRes.tests_failed}\n\n## Raw Output\n\`\`\`\n${tRes.output}\n\`\`\`\n`;
    }

    if (!synthesized) {
      const synthPrompt = `You are synthesizing grounded Markdown deliverable content for JARVIS Mission Control.
MISSION OBJECTIVE: "${mission.objective}"
TARGET STEP: "${step.title}" (tool: ${step.tool}, target_path: ${args.file_path || args.key || 'memory'})

STRICT TRUTHFULNESS & COMPLETENESS RULES:
- Use ONLY exact facts, filenames, exported function/symbol names, code behaviors, metrics, test outputs, and real https:// URLs present in UPSTREAM TOOL OUTPUTS below.
- Be CONCISE and COMPLETE: cover EVERY file, function name, and source URL without printing repetitive full directory paths, filler paragraphs, or raw SHA-256 tables unless explicitly requested.
- Never fabricate citations, filenames, hashes, or numbers.
- If comparative research sources conflict or lack apples-to-apples numbers, explicitly preserve uncertainty.
- Output ONLY clean Markdown (no JSON wrapper).

UPSTREAM TOOL OUTPUTS:
${JSON.stringify(upstreamEvidence).slice(0, 4800)}`;

      try {
        const aiSynth = await ModelRouterService.generateWithFallback({
          systemPrompt: synthPrompt,
          messages: [{ role: 'user', content: `Generate concise complete Markdown output for: ${step.title}` }],
          maxTokens: 950,
          temperature: 0.15,
          timeoutMs: Number(process.env.LOCAL_INFERENCE_TIMEOUT_MS) || 180000
        });
        if (aiSynth?.text && aiSynth.text.trim().length > 40) {
          synthesized = aiSynth.text.trim();
          if (retrievedWebSources.length > 0 && !/https?:\/\/[^\s)]+/i.test(synthesized)) {
            synthesized += `\n\n## Verified Sources\n${retrievedWebSources.map(s => `- [${s.title}](${s.url})`).join('\n')}\n`;
          }
        } else {
          throw new Error('Synthesis returned insufficient content from local model.');
        }
      } catch (e) {
        const fClass = this.classifyFailure(e.message, e);
        if (
          fClass === FAILURE_CLASSES.PROVIDER_UNAVAILABLE ||
          fClass === FAILURE_CLASSES.RESOURCE_EXHAUSTED ||
          fClass === FAILURE_CLASSES.TIMEOUT ||
          fClass === FAILURE_CLASSES.TRANSIENT_NETWORK
        ) {
          throw e;
        }
        throw new Error(`SYNTHESIS_FAILED: ${e.message}`);
      }
    }

    if (!synthesized) {
      throw new Error('SYNTHESIS_FAILED: Unable to produce verified deliverable content from upstream outputs.');
    }

    if (step.tool === 'write_file') {
      args.content = synthesized;
    } else if (step.tool === 'save_memory') {
      args.value = synthesized.slice(0, 1500);
    }
    return args;
  }

  /**
   * Dynamic DAG Replanning on Step Failure with Bounded Attempts (Max 2)
   */
  async replanMissionDAG(missionId, failedStepId, failureReason) {
    const mission = await this.getMission(missionId);
    if (!mission) throw new Error('Mission not found');

    const currentReplanCount = (mission.replan_count || 0) + 1;
    if (currentReplanCount > 2) {
      console.warn(`[DAG Replanner] Max replan attempts (2) reached for mission ${missionId}. Aborting replan.`);
      return false;
    }

    const failedStep = mission.steps.find(s => s.id === failedStepId);
    if (!failedStep) return false;

    console.log(`[DAG Replanner] Initiating dynamic LLM replan for mission ${missionId}, step ${failedStep.step_index} (${failedStep.tool}), reason: ${failureReason}`);

    const availableTools = ToolRegistry.getTools().map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));

    const completedSteps = mission.steps.filter(s =>
      s.status === STEP_STATUSES.VERIFIED ||
      s.status === STEP_STATUSES.PARTIALLY_VERIFIED ||
      s.status === STEP_STATUSES.COMPLETED
    ).map(s => `Step ${s.step_index} (${s.tool}): ${s.title} -> Completed`);

    const replanPrompt = `You are the JARVIS Autonomous Mission Replanner.
A step in an active mission has failed. Diagnose the root cause and formulate an alternative step or adjusted arguments using available tools.

Mission Objective: "${mission.objective}"
Completed Milestones:
${completedSteps.join('\n') || 'None'}

Failed Step:
- Step Index: ${failedStep.step_index}
- Title: ${failedStep.title}
- Tool: ${failedStep.tool}
- Arguments: ${JSON.stringify(failedStep.args)}
- Error / Failure Reason: ${failureReason}

Available Tools in Registry:
${availableTools.slice(0, 22).map(t => `- ${t.name}: ${String(t.description || '').slice(0, 55)}`).join('\n')}

Rules:
1. Select an alternative tool or correct the arguments so the task can achieve the desired outcome.
2. The replacement tool MUST exist in Available Tools.
3. Respond ONLY with valid JSON in this exact structure:
{
  "diagnosis": "concise explanation of why it failed",
  "replacement_step": {
    "title": "Adjusted step title",
    "description": "Explanation of fix",
    "agent_key": "system",
    "tool": "valid_tool_name",
    "args": {}
  }
}`;

    try {
      const aiRes = await ModelRouterService.generateWithFallback({
        systemPrompt: replanPrompt,
        messages: [{ role: 'user', content: `Diagnose and replan failed step: "${failedStep.title}"` }],
        responseFormat: { type: 'json_object' },
        maxTokens: 512,
        timeoutMs: Number(process.env.LOCAL_INFERENCE_TIMEOUT_MS) || 120000
      });

      const jsonMatch = aiRes.text ? aiRes.text.match(/\{[\s\S]*\}/) : null;
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.replacement_step && parsed.replacement_step.tool) {
          const rep = parsed.replacement_step;
          const isToolValid = availableTools.some(t => t.name === rep.tool);
          if (!isToolValid) {
            console.warn(`[DAG Replanner] Suggested invalid tool '${rep.tool}'; rejecting fabricated substitution.`);
            return false;
          }
          const chosenTool = rep.tool;

          await run(
            `UPDATE mission_steps 
             SET tool = ?, args = ?, title = ?, description = ?, status = 'PENDING', error = NULL, retry_count = 0 
             WHERE id = ?`,
            [
              chosenTool,
              JSON.stringify(rep.args || {}),
              rep.title || failedStep.title,
              `${rep.description || 'Replanned by JARVIS'} (Replanned: ${parsed.diagnosis || failureReason})`,
              failedStepId
            ]
          );

          await run(
            `UPDATE missions 
             SET replan_count = ?, last_replan_reason = ? 
             WHERE id = ?`,
            [currentReplanCount, `${failureReason} -> ${parsed.diagnosis || 'Replanned'}`, missionId]
          );

          this.broadcast('MISSION_REPLANNED', {
            missionId,
            failedStepId,
            replacementTool: chosenTool,
            diagnosis: parsed.diagnosis,
            replanCount: currentReplanCount
          });
          return true;
        }
      }
    } catch (err) {
      const fClass = this.classifyFailure(err.message, err);
      if (fClass === FAILURE_CLASSES.PROVIDER_UNAVAILABLE || fClass === FAILURE_CLASSES.RESOURCE_EXHAUSTED) {
        return 'LOCAL_MODEL_UNAVAILABLE';
      }
      if (fClass === FAILURE_CLASSES.TIMEOUT || fClass === FAILURE_CLASSES.TRANSIENT_NETWORK) {
        return 'RETRYABLE_TIMEOUT';
      }
      console.warn('[DAG Replanner] LLM replanning note:', err.message);
    }

    return false;
  }

  /**
   * Retrieves full mission details including parsed steps, deliverables, contract, workflow metadata, and verification report
   */
  async getMission(missionId) {
    const mission = await get('SELECT * FROM missions WHERE id = ?', [missionId]);
    if (!mission) return null;

    const steps = await query('SELECT * FROM mission_steps WHERE mission_id = ? ORDER BY step_index ASC', [missionId]);
    return {
      ...mission,
      deliverables: mission.deliverables ? JSON.parse(mission.deliverables) : null,
      acceptance_contract: mission.acceptance_contract ? JSON.parse(mission.acceptance_contract) : null,
      verification_report: mission.verification_report ? JSON.parse(mission.verification_report) : null,
      checkpoint_state: mission.checkpoint_state ? JSON.parse(mission.checkpoint_state) : null,
      workflow_metadata: mission.workflow_metadata ? JSON.parse(mission.workflow_metadata) : null,
      steps: steps.map(s => ({
        ...s,
        args: JSON.parse(s.args || '{}'),
        depends_on: JSON.parse(s.depends_on || '[]'),
        result: s.result ? JSON.parse(s.result) : null
      }))
    };
  }

  /**
   * Lists all missions with latest state
   */
  async listMissions(limit = 20) {
    const missions = await query('SELECT * FROM missions ORDER BY created_at DESC LIMIT ?', [limit]);
    const detailed = [];
    for (const m of missions) {
      const steps = await query('SELECT * FROM mission_steps WHERE mission_id = ? ORDER BY step_index ASC', [m.id]);
      detailed.push({
        ...m,
        deliverables: m.deliverables ? JSON.parse(m.deliverables) : null,
        acceptance_contract: m.acceptance_contract ? JSON.parse(m.acceptance_contract) : null,
        verification_report: m.verification_report ? JSON.parse(m.verification_report) : null,
        checkpoint_state: m.checkpoint_state ? JSON.parse(m.checkpoint_state) : null,
        workflow_metadata: m.workflow_metadata ? JSON.parse(m.workflow_metadata) : null,
        steps: steps.map(s => ({
          ...s,
          args: JSON.parse(s.args || '{}'),
          depends_on: JSON.parse(s.depends_on || '[]'),
          result: s.result ? JSON.parse(s.result) : null
        }))
      });
    }
    return detailed;
  }

  /**
   * Phase 18: Shared specialist step execution core with least-privilege checks, input/output
   * contract validation, pre-state rollback capture, independent verification, and execution logging.
   */
  async executeStepCore(currentMission, step) {
    const startPerf = Date.now();
    const agent = coordinatorInstance.getAgent(step.agent_key);

    // 1. Least-Privilege Tool Authorization
    const authCheck = coordinatorInstance.validateAgentToolAccess(step.agent_key, step.tool);
    if (!authCheck.authorized) {
      if (agent) {
        await agent.recordExecutionLog({
          missionId: currentMission.id,
          stepId: step.id,
          tool: step.tool,
          status: 'REJECTED_UNAUTHORIZED',
          args: step.args,
          contractValid: false,
          error: authCheck.reason,
          latencyMs: Date.now() - startPerf
        });
      }
      throw new Error(authCheck.reason);
    }

    // 2. Agent Input Contract & Resource Limits
    if (agent) {
      const inputCheck = agent.validateInputContract(step.args || {});
      if (!inputCheck.valid) {
        await agent.recordExecutionLog({
          missionId: currentMission.id,
          stepId: step.id,
          tool: step.tool,
          status: 'REJECTED_CONTRACT',
          args: step.args,
          contractValid: false,
          error: inputCheck.error,
          latencyMs: Date.now() - startPerf
        });
        throw new Error(inputCheck.error);
      }
    }

    // 3. Environmental Pre-State Capture (supports safe idempotency & rollback)
    const preState = await TruthfulVerificationService.capturePreState(step.tool, step.args || {});

    // 4. Execute Registered Tool
    let stepResult = step.tool && step.tool !== 'none'
      ? await ToolRegistry.executeTool(step.tool, step.args || {})
      : { status: 'acknowledged', message: step.description };

    if (stepResult && typeof stepResult === 'object' && stepResult.success === false) {
      throw new Error(stepResult.error || `Tool ${step.tool} returned failure`);
    }

    // 5. Agent Output Contract Enforcement
    if (agent) {
      const outCheck = agent.validateOutputContract(stepResult, step.tool);
      if (!outCheck.valid) {
        await agent.recordExecutionLog({
          missionId: currentMission.id,
          stepId: step.id,
          tool: step.tool,
          status: 'INVALID_OUTPUT',
          args: step.args,
          result: stepResult,
          contractValid: false,
          error: outCheck.error,
          latencyMs: Date.now() - startPerf
        });
        throw new Error(outCheck.error);
      }
    }

    // 6. Independent Truthful Verification of Environmental Outcome
    const verificationOutcome = await TruthfulVerificationService.verifyOutcome(step.tool, step.args || {}, stepResult, preState);
    if (!verificationOutcome.verified && !verificationOutcome.partiallyVerified) {
      throw new Error(`Outcome verification failed: ${verificationOutcome.reason || verificationOutcome.error || 'Postcondition check failed'}`);
    }

    // 7. Sanitize Output & Track Reversible File Creation for Rollback
    stepResult = this.sanitizeToolOutput(stepResult);
    if (step.tool === 'write_file' && preState?.file && !preState.file.exists && !step.compensation_action) {
      const createdPath = step.args?.file_path || step.args?.path || preState.file.path;
      if (createdPath) {
        await run('UPDATE mission_steps SET compensation_action = ? WHERE id = ?', [
          JSON.stringify({ type: 'unlink_created_file', file_path: createdPath, pre_existed: false }),
          step.id
        ]);
      }
    }

    // 8. Persist Execution Log & Inter-Agent Handoff Provenance
    if (agent) {
      await agent.recordExecutionLog({
        missionId: currentMission.id,
        stepId: step.id,
        tool: step.tool,
        status: verificationOutcome.verified ? 'VERIFIED' : 'PARTIALLY_VERIFIED',
        args: step.args,
        result: stepResult,
        contractValid: true,
        latencyMs: Date.now() - startPerf
      });
    }

    if (Array.isArray(step.depends_on) && step.depends_on.length > 0) {
      const producers = (currentMission.steps || [])
        .filter(s => step.depends_on.includes(s.step_index))
        .map(s => `${s.agent_key}#${s.step_index}`);
      await this.recordCoordinationEvent(
        currentMission.id,
        'HANDOFF_EXCHANGED',
        producers.join(',') || 'upstream',
        `${step.agent_key}#${step.step_index}`,
        { tool: step.tool, dependencies: step.depends_on },
        'VERIFIED'
      );
    }

    return { stepResult, verificationOutcome, preState };
  }

  /**
   * Asynchronously executes a mission, honoring DAG dependencies, approval gates, checkpoints, adaptive retries, and strict truthful verification
   */
  async startMission(missionId) {
    const mission = await this.getMission(missionId);
    if (!mission) throw new Error(`Mission ${missionId} not found.`);

    if (mission.status === MISSION_STATUSES.CANCELLED) {
      return { success: false, blocked: 'MISSION_CANCELLED', message: `Mission ${missionId} is cancelled and cannot start.`, missionId };
    }

    const localGate = await this.ensureLocalModelReady();
    if (!localGate.ready) {
      const reason = localGate.reason || 'Local Ollama provider is unavailable.';
      const blockedStatus = localGate.blockedStatus || MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE;
      const failureClass = localGate.failureClass || FAILURE_CLASSES.PROVIDER_UNAVAILABLE;
      await this.parkMissionBlockedLocalModel(missionId, reason, null, blockedStatus, failureClass);
      return { success: false, blocked: blockedStatus, failureClass, message: reason, missionId };
    }

    // If mission was blocked prior to step planning, formulate validated steps now before running
    if (!mission.steps || mission.steps.length === 0) {
      try {
        const relevantMemories = await MemoryIntelligenceService.retrieveRelevantMemories(mission.objective, 3);
        const memoryContext = relevantMemories.map(m => `- ${m.key}: ${m.value}`).join('\n');
        const planned = await this.planMissionStepsWithLLM(mission.objective, { memoryContext });
        await this.persistMissionSteps(missionId, planned.steps);
        const updatedContract = this.buildAcceptanceContract(mission.objective, planned.steps);
        await run('UPDATE missions SET plan_summary = ?, acceptance_contract = ?, status = ?, error = NULL, failure_class = NULL WHERE id = ?', [
          planned.planSummary,
          JSON.stringify(updatedContract),
          MISSION_STATUSES.PENDING,
          missionId
        ]);
        mission = await this.getMission(missionId);
      } catch (planErr) {
        const fClass = this.classifyFailure(planErr.message, planErr);
        if (fClass === FAILURE_CLASSES.PROVIDER_UNAVAILABLE || fClass === FAILURE_CLASSES.RESOURCE_EXHAUSTED) {
          const bStatus = String(planErr.message).toLowerCase().includes('not downloaded')
            ? MISSION_STATUSES.BLOCKED_LOCAL_MODEL_UNAVAILABLE
            : MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE;
          await this.parkMissionBlockedLocalModel(missionId, planErr.message, null, bStatus, fClass);
          return { success: false, blocked: bStatus, failureClass: fClass, message: planErr.message, missionId };
        }
        if (fClass === FAILURE_CLASSES.TIMEOUT || fClass === FAILURE_CLASSES.TRANSIENT_NETWORK) {
          await this.parkMissionFailedRetryable(missionId, planErr.message, null, fClass);
          return { success: false, retryable: true, status: MISSION_STATUSES.FAILED_RETRYABLE, failureClass: fClass, message: planErr.message, missionId };
        }
        await run('UPDATE missions SET status = ?, error = ?, failure_class = ? WHERE id = ?', [MISSION_STATUSES.FAILED, planErr.message, fClass, missionId]);
        return { success: false, message: planErr.message, missionId };
      }
    }

    // Re-entrancy lock: prevent duplicate concurrent worker loops for the same mission
    if (this.activeExecutions.has(missionId) || this.workerWaitQueue.some(q => q.missionId === missionId)) {
      return { success: true, deduplicated: true, alreadyRunning: true, message: `Mission ${missionId} execution already in progress.`, missionId };
    }

    this.controllers.set(missionId, { isPaused: false, isCancelled: false });
    const priority = mission.priority !== undefined && mission.priority !== null ? Number(mission.priority) : 2;
    await this.acquireWorkerSlot(missionId, priority);

    const now = new Date().toISOString();

    await run('UPDATE missions SET status = ?, started_at = ? WHERE id = ?', [MISSION_STATUSES.RUNNING, now, missionId]);
    this.broadcast('MISSION_STATUS', { missionId, status: MISSION_STATUSES.RUNNING });

    // Run execution loop in background
    (async () => {
      try {
        const completedStepIndices = new Set(
          mission.steps
            .filter(s => s.status === STEP_STATUSES.VERIFIED || s.status === STEP_STATUSES.PARTIALLY_VERIFIED || s.status === STEP_STATUSES.COMPLETED)
            .map(s => s.step_index)
        );
        const deliverables = mission.deliverables || [];

        let progressMade = true;

        while (progressMade) {
          const nowHeartbeat = new Date().toISOString();
          await run('UPDATE missions SET last_heartbeat = ? WHERE id = ?', [nowHeartbeat, missionId]);

          const ctrl = this.controllers.get(missionId);
          if (ctrl?.isCancelled) {
            await run('UPDATE missions SET status = ? WHERE id = ?', [MISSION_STATUSES.CANCELLED, missionId]);
            this.broadcast('MISSION_STATUS', { missionId, status: MISSION_STATUSES.CANCELLED });
            return;
          }
          if (ctrl?.isPaused) {
            await run('UPDATE missions SET status = ? WHERE id = ?', [MISSION_STATUSES.PAUSED, missionId]);
            this.broadcast('MISSION_STATUS', { missionId, status: MISSION_STATUSES.PAUSED });
            return;
          }

          // Fetch fresh steps
          const currentMission = await this.getMission(missionId);
          const pendingSteps = currentMission.steps.filter(s => s.status === STEP_STATUSES.PENDING);

          if (pendingSteps.length === 0) {
            const waiting = currentMission.steps.find(s => s.status === STEP_STATUSES.WAITING_FOR_APPROVAL);
            if (waiting) {
              await run('UPDATE missions SET status = ? WHERE id = ?', [MISSION_STATUSES.WAITING_FOR_APPROVAL, missionId]);
              this.broadcast('MISSION_STATUS', { missionId, status: MISSION_STATUSES.WAITING_FOR_APPROVAL, waitingStep: waiting });
              return;
            }
            break; // All pending steps processed
          }

          // Find steps whose dependencies are completely satisfied
          const readySteps = pendingSteps.filter(s => {
            return s.depends_on.every(depIndex => completedStepIndices.has(depIndex));
          });

          if (readySteps.length === 0) {
            const waiting = currentMission.steps.find(s => s.status === STEP_STATUSES.WAITING_FOR_APPROVAL);
            if (waiting) {
              await run('UPDATE missions SET status = ? WHERE id = ?', [MISSION_STATUSES.WAITING_FOR_APPROVAL, missionId]);
              this.broadcast('MISSION_STATUS', { missionId, status: MISSION_STATUSES.WAITING_FOR_APPROVAL, waitingStep: waiting });
              return;
            }
            throw new Error('Unresolvable step dependencies detected in mission plan.');
          }

          progressMade = false;

          // Phase 15 & 18: Concurrent execution of independent non-sensitive, non-GUI steps (partial subset allowed)
          const parallelBatch = readySteps.filter(s =>
            !this.checkStepGovernance({ ...s, requires_approval: Boolean(s.requires_approval) && !s.approved_at }).requiresApproval &&
            !['open_application', 'open_file', 'manage_window', 'manage_windows_bulk', 'desktop_mouse_action', 'desktop_keyboard_action'].includes(s.tool) &&
            !(s.tool === 'write_file' && readySteps.some(o => o.id !== s.id && o.tool === 'write_file' && (o.args?.file_path || o.args?.path) === (s.args?.file_path || s.args?.path)))
          ).slice(0, 3);

          if (parallelBatch.length > 1) {
            const batchOutcomes = await Promise.all(parallelBatch.map(async (step) => {
              const stepStartTime = new Date().toISOString();
              const startPerf = Date.now();
              try {
                await run('UPDATE mission_steps SET status = ?, started_at = ? WHERE id = ?', [STEP_STATUSES.RUNNING, stepStartTime, step.id]);
                this.broadcast('MISSION_STEP_UPDATE', { missionId, stepId: step.id, status: STEP_STATUSES.RUNNING });
                const resolvedArgs = await this.synthesizeStepInputs(currentMission, step);
                if (JSON.stringify(resolvedArgs) !== JSON.stringify(step.args)) {
                  step.args = resolvedArgs;
                  await run('UPDATE mission_steps SET args = ? WHERE id = ?', [JSON.stringify(resolvedArgs), step.id]);
                }
                const { stepResult, verificationOutcome } = await this.executeStepCore(currentMission, step);
                return { step, ok: true, stepResult, verificationOutcome, startPerf };
              } catch (batchErr) {
                return { step, ok: false, error: batchErr.message, startPerf };
              }
            }));

            let batchHadFailure = false;
            for (const out of batchOutcomes) {
              const latencyMs = Date.now() - out.startPerf;
              await this.recordAgentMetric(out.step.agent_key, out.ok, 0, latencyMs);
              if (out.ok) {
                const stepFinalStatus = out.verificationOutcome?.verified ? STEP_STATUSES.VERIFIED : STEP_STATUSES.PARTIALLY_VERIFIED;
                await run(
                  'UPDATE mission_steps SET status = ?, result = ?, verification_status = ?, verification_evidence = ?, completed_at = ?, retry_count = 0 WHERE id = ?',
                  [stepFinalStatus, JSON.stringify(out.stepResult), stepFinalStatus, JSON.stringify(out.verificationOutcome || {}), new Date().toISOString(), out.step.id]
                );
                completedStepIndices.add(out.step.step_index);
                deliverables.push({ step_index: out.step.step_index, title: out.step.title, agent_key: out.step.agent_key, output: out.stepResult, verification: out.verificationOutcome, executed_parallel: true });
                await this.saveCheckpoint(missionId, out.step.step_index, { completedSteps: Array.from(completedStepIndices), deliverables });
                this.broadcast('MISSION_STEP_UPDATE', { missionId, stepId: out.step.id, status: stepFinalStatus, result: out.stepResult, verification: out.verificationOutcome });
                progressMade = true;
              } else {
                batchHadFailure = true;
                // Reset failed parallel step to PENDING for standard retry + replanning path below
                await run('UPDATE mission_steps SET status = ?, error = ? WHERE id = ?', [STEP_STATUSES.PENDING, out.error, out.step.id]);
              }
            }
            if (!batchHadFailure) {
              continue; // Re-evaluate readySteps with newly satisfied dependencies
            }
          }

          // Execute ready steps (serial / retry + replan + approval gate path)
          for (const step of readySteps) {
            const stepStartTime = new Date().toISOString();
            const startPerf = Date.now();

            // Governance & Approval Check (Human in the loop — sensitive, financial, external publication & destructive actions)
            const govCheck = this.checkStepGovernance({ ...step, requires_approval: Boolean(step.requires_approval) && !step.approved_at });
            if (govCheck.requiresApproval && !step.approved_at) {
              await run('UPDATE mission_steps SET status = ?, requires_approval = 1 WHERE id = ?', [STEP_STATUSES.WAITING_FOR_APPROVAL, step.id]);
              await run('UPDATE missions SET status = ? WHERE id = ?', [MISSION_STATUSES.WAITING_FOR_APPROVAL, missionId]);
              await this.recordCoordinationEvent(missionId, 'GOVERNANCE_APPROVAL_REQUESTED', step.agent_key, 'human_operator', { stepId: step.id, tool: step.tool, category: govCheck.category }, 'WAITING_FOR_APPROVAL');
              this.broadcast('MISSION_STEP_UPDATE', { missionId, stepId: step.id, status: STEP_STATUSES.WAITING_FOR_APPROVAL });
              this.broadcast('MISSION_APPROVAL_REQUESTED', {
                missionId,
                stepId: step.id,
                title: step.title,
                tool: step.tool,
                category: govCheck.category,
                args: step.args
              });
              return; // Pause execution until user approves
            }

            // Mark step RUNNING
            await run('UPDATE mission_steps SET status = ?, started_at = ? WHERE id = ?', [STEP_STATUSES.RUNNING, stepStartTime, step.id]);
            this.broadcast('MISSION_STEP_UPDATE', { missionId, stepId: step.id, status: STEP_STATUSES.RUNNING });

            // Dynamic cross-step input synthesis & path resolution from upstream deliverables
            let resolvedArgs;
            try {
              resolvedArgs = await this.synthesizeStepInputs(currentMission, step);
            } catch (synthErr) {
              const fClass = this.classifyFailure(synthErr.message, synthErr);
              if (fClass === FAILURE_CLASSES.PROVIDER_UNAVAILABLE || fClass === FAILURE_CLASSES.RESOURCE_EXHAUSTED) {
                await this.parkMissionBlockedLocalModel(missionId, synthErr.message, step.id, MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE, fClass);
                return;
              }
              if (fClass === FAILURE_CLASSES.TIMEOUT || fClass === FAILURE_CLASSES.TRANSIENT_NETWORK) {
                await this.parkMissionFailedRetryable(missionId, synthErr.message, step.id, fClass);
                return;
              }
              throw synthErr;
            }
            if (JSON.stringify(resolvedArgs) !== JSON.stringify(step.args)) {
              step.args = resolvedArgs;
              await run('UPDATE mission_steps SET args = ? WHERE id = ?', [JSON.stringify(resolvedArgs), step.id]);
            }

            // Idempotency check: prevent duplicate conflicting executions
            const actionHash = computeActionHash(step.tool, step.args);
            const duplicateCheck = await get(
              "SELECT id, result, verification_evidence FROM mission_steps WHERE mission_id = ? AND idempotency_hash = ? AND status IN ('VERIFIED', 'PARTIALLY_VERIFIED', 'COMPLETED') AND id != ?",
              [missionId, actionHash, step.id]
            );

            let attempts = 0;
            let success = false;
            let stepResult = null;
            let stepError = null;
            let failureClass = null;
            let verificationOutcome = null;

            // Environmental pre-inspection: if outcome already exists/satisfied in environment
            const preCheck = await this.inspectEnvironmentBeforeStep(step);
            if (preCheck.alreadySatisfied) {
              stepResult = { status: 'already_satisfied', evidence: preCheck.evidence };
              verificationOutcome = {
                verified: true,
                partiallyVerified: false,
                reason: preCheck.evidence?.reason || 'Environmental pre-check satisfied.'
              };
              success = true;
              console.log(`[MissionControl] Pre-inspection satisfied for step "${step.title}" - avoiding redundant execution.`);
            } else if (duplicateCheck && duplicateCheck.result) {
              stepResult = JSON.parse(duplicateCheck.result);
              verificationOutcome = duplicateCheck.verification_evidence ? JSON.parse(duplicateCheck.verification_evidence) : { verified: true, reason: 'Re-used idempotent verified result' };
              success = true;
              console.log(`[MissionControl] Re-used idempotent result for step "${step.title}"`);
            } else {
              const maxAttempts = 3;
              while (attempts < maxAttempts && !success) {
                attempts++;
                try {
                  const coreOut = await this.executeStepCore(currentMission, step);
                  stepResult = coreOut.stepResult;
                  verificationOutcome = coreOut.verificationOutcome;
                  success = true;
                } catch (err) {
                  stepError = err.message;
                  failureClass = this.classifyFailure(stepError);
                  console.warn(`[MissionControl] Attempt ${attempts} failed (${failureClass}) for step "${step.title}":`, err.message);

                  if (failureClass === FAILURE_CLASSES.PERMISSION_DENIED || failureClass === FAILURE_CLASSES.INVALID_ARGUMENTS || stepError.includes('INVALID_AGENT_OUTPUT')) {
                    break;
                  }

                  if (attempts < maxAttempts) {
                    const backoffMs = Math.min(1000 * Math.pow(2, attempts - 1), 4000);
                    await new Promise(r => setTimeout(r, backoffMs));
                  }
                }
              }

              // Dynamic DAG replanning on failure
              if (!success && attempts >= maxAttempts) {
                const replanned = await this.replanMissionDAG(missionId, step.id, stepError);
                if (replanned === 'LOCAL_MODEL_UNAVAILABLE') {
                  await this.parkMissionBlockedLocalModel(missionId, `Local provider unavailable during step replan: ${stepError}`, step.id, MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE, FAILURE_CLASSES.PROVIDER_UNAVAILABLE);
                  return;
                }
                if (replanned === 'RETRYABLE_TIMEOUT') {
                  await this.parkMissionFailedRetryable(missionId, `Local inference timed out during replan: ${stepError}`, step.id, FAILURE_CLASSES.TIMEOUT);
                  return;
                }
                if (replanned === true) {
                  progressMade = true;
                  continue; // Loop again with updated step configuration
                }
              }
            }

            const stepEndTime = new Date().toISOString();
            const latencyMs = Date.now() - startPerf;

            await this.recordAgentMetric(step.agent_key, success, attempts - 1, latencyMs);

            if (success) {
              const stepFinalStatus = (verificationOutcome && verificationOutcome.verified)
                ? STEP_STATUSES.VERIFIED
                : STEP_STATUSES.PARTIALLY_VERIFIED;

              await run(
                `UPDATE mission_steps 
                 SET status = ?, result = ?, verification_status = ?, verification_evidence = ?, completed_at = ?, retry_count = ? 
                 WHERE id = ?`,
                [
                  stepFinalStatus,
                  JSON.stringify(stepResult),
                  stepFinalStatus,
                  JSON.stringify(verificationOutcome || {}),
                  stepEndTime,
                  attempts - 1,
                  step.id
                ]
              );
              completedStepIndices.add(step.step_index);
              deliverables.push({
                step_index: step.step_index,
                title: step.title,
                agent_key: step.agent_key,
                output: stepResult,
                verification: verificationOutcome
              });

              // Save execution checkpoint
              await this.saveCheckpoint(missionId, step.step_index, {
                completedSteps: Array.from(completedStepIndices),
                deliverables
              });

              this.broadcast('MISSION_STEP_UPDATE', {
                missionId,
                stepId: step.id,
                status: stepFinalStatus,
                result: stepResult,
                verification: verificationOutcome
              });
              progressMade = true;
            } else {
              // Mark step as FAILED
              await run(
                `UPDATE mission_steps 
                 SET status = ?, error = ?, failure_classification = ?, completed_at = ?, retry_count = ? 
                 WHERE id = ?`,
                [STEP_STATUSES.FAILED, stepError, failureClass, stepEndTime, attempts, step.id]
              );

              // Step compensation / rollback
              await this.executeCompensation(step);

              // Mark all remaining pending steps as BLOCKED
              await run(
                `UPDATE mission_steps 
                 SET status = ? 
                 WHERE mission_id = ? AND status = 'PENDING' AND id != ?`,
                [STEP_STATUSES.BLOCKED, missionId, step.id]
              );

              const isRetryableFail = failureClass === FAILURE_CLASSES.TIMEOUT || failureClass === FAILURE_CLASSES.TRANSIENT_NETWORK;
              const isProviderBlocked = failureClass === FAILURE_CLASSES.PROVIDER_UNAVAILABLE || failureClass === FAILURE_CLASSES.RESOURCE_EXHAUSTED;
              const failMissionStatus = isProviderBlocked
                ? MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE
                : (isRetryableFail ? MISSION_STATUSES.FAILED_RETRYABLE : MISSION_STATUSES.FAILED);

              await run('UPDATE missions SET status = ?, error = ?, failure_class = ? WHERE id = ?', [
                failMissionStatus,
                `Step failed (${failureClass}): ${stepError}`,
                failureClass,
                missionId
              ]);
              this.broadcast('MISSION_STEP_UPDATE', { missionId, stepId: step.id, status: STEP_STATUSES.FAILED, error: stepError, failureClass });
              this.broadcast('MISSION_ESCALATED', {
                missionId,
                failedStepId: step.id,
                failureReason: stepError,
                failureClass,
                action: isRetryableFail ? 'RETRY_ELIGIBLE' : 'HALTED_AWAITING_INTERVENTION'
              });
              this.broadcast('MISSION_STATUS', { missionId, status: failMissionStatus, error: stepError, failureClass });
              return;
            }
          }
        }

        // Strict Objective Acceptance Contract Verification Gate (P0/P2)
        // A mission MUST NOT complete merely because steps returned success; independently verify
        // deliverables, content hashes, non-empty citations, and real desktop state.
        const latestMission = await this.getMission(missionId);
        const finalSteps = await query('SELECT * FROM mission_steps WHERE mission_id = ? ORDER BY step_index ASC', [missionId]);
        const contractOutcome = await this.verifyMissionAcceptanceContract(latestMission, finalSteps);

        if (!contractOutcome.passed) {
          const finalMissionStatus = contractOutcome.finalStatus || MISSION_STATUSES.PARTIALLY_VERIFIED;
          await run(
            'UPDATE missions SET status = ?, error = ?, deliverables = ?, verification_report = ? WHERE id = ?',
            [
              finalMissionStatus,
              contractOutcome.summary,
              JSON.stringify(deliverables),
              JSON.stringify(contractOutcome),
              missionId
            ]
          );
          this.broadcast('MISSION_STATUS', {
            missionId,
            status: finalMissionStatus,
            error: contractOutcome.summary,
            verification_report: contractOutcome
          });
          return;
        }

        // Mission Independently Verified & Completed!
        const completionTime = new Date().toISOString();
        await run(
          'UPDATE missions SET status = ?, completed_at = ?, deliverables = ?, verification_report = ?, failure_class = NULL WHERE id = ?',
          [
            MISSION_STATUSES.COMPLETED,
            completionTime,
            JSON.stringify(deliverables),
            JSON.stringify(contractOutcome),
            missionId
          ]
        );
        this.broadcast('MISSION_STATUS', {
          missionId,
          status: MISSION_STATUSES.COMPLETED,
          deliverables,
          verification_report: contractOutcome
        });

      } catch (fatalErr) {
        console.error('[MissionControl] Fatal error during mission execution:', fatalErr);
        const fClass = this.classifyFailure(fatalErr.message, fatalErr);
        const errStatus = (fClass === FAILURE_CLASSES.PROVIDER_UNAVAILABLE || fClass === FAILURE_CLASSES.RESOURCE_EXHAUSTED)
          ? MISSION_STATUSES.BLOCKED_PROVIDER_UNAVAILABLE
          : ((fClass === FAILURE_CLASSES.TIMEOUT || fClass === FAILURE_CLASSES.TRANSIENT_NETWORK)
            ? MISSION_STATUSES.FAILED_RETRYABLE
            : MISSION_STATUSES.FAILED);
        await run('UPDATE missions SET status = ?, error = ?, failure_class = ? WHERE id = ?', [errStatus, fatalErr.message, fClass, missionId]);
        this.broadcast('MISSION_STATUS', { missionId, status: errStatus, failureClass: fClass, error: fatalErr.message });
      } finally {
        this.releaseWorkerSlot(missionId);
      }
    })();

    return { success: true, message: `Mission execution initiated for ${missionId}`, missionId };
  }

  /**
   * Approves a waiting step and resumes the mission
   */
  async approveStep(missionId, stepId) {
    const mission = await get('SELECT status FROM missions WHERE id = ?', [missionId]);
    if (!mission) throw new Error('Mission not found.');
    if (mission.status === MISSION_STATUSES.CANCELLED) {
      throw new Error(`APPROVAL_REJECTED: Mission ${missionId} was cancelled and cannot resume.`);
    }

    const step = await get('SELECT * FROM mission_steps WHERE id = ? AND mission_id = ?', [stepId, missionId]);
    if (!step) throw new Error('Step not found.');

    await run('UPDATE mission_steps SET requires_approval = 0, approved_at = ?, status = ? WHERE id = ?', [new Date().toISOString(), MISSION_STATUSES.PENDING, stepId]);
    return this.startMission(missionId);
  }

  /**
   * Pauses an active mission
   */
  pauseMission(missionId) {
    const ctrl = this.controllers.get(missionId) || {};
    ctrl.isPaused = true;
    this.controllers.set(missionId, ctrl);
    return { success: true, message: `Mission ${missionId} paused.` };
  }

  /**
   * Resumes a paused mission
   */
  async resumeMission(missionId) {
    const ctrl = this.controllers.get(missionId) || {};
    ctrl.isPaused = false;
    this.controllers.set(missionId, ctrl);
    return this.startMission(missionId);
  }

  /**
   * Cancels an active mission cleanly and marks unstarted steps as CANCELLED
   */
  async cancelMission(missionId, reason = 'Cancelled by operator') {
    const ctrl = this.controllers.get(missionId) || {};
    ctrl.isCancelled = true;
    this.controllers.set(missionId, ctrl);
    await run('UPDATE missions SET status = ?, error = ? WHERE id = ?', [MISSION_STATUSES.CANCELLED, reason, missionId]);
    await run("UPDATE mission_steps SET status = 'CANCELLED' WHERE mission_id = ? AND status IN ('PENDING', 'WAITING_FOR_APPROVAL', 'BLOCKED')", [missionId]);
    await this.recordCoordinationEvent(missionId, 'MISSION_CANCELLED', 'operator', 'mission_control', { reason }, 'CANCELLED');
    this.broadcast('MISSION_STATUS', { missionId, status: MISSION_STATUSES.CANCELLED });
    return { success: true, message: `Mission ${missionId} cancelled.` };
  }

  /**
   * Retries a failed step
   */
  async retryStep(missionId, stepId) {
    await run('UPDATE mission_steps SET status = ?, error = NULL WHERE id = ?', [MISSION_STATUSES.PENDING, stepId]);
    return this.startMission(missionId);
  }

  /**
   * Fetches agent performance metrics
   */
  async getAgentMetrics() {
    return query('SELECT * FROM agent_performance_metrics ORDER BY total_actions DESC');
  }

  /**
   * Fetches checkpoints for a mission
   */
  async getCheckpoints(missionId) {
    return query('SELECT * FROM mission_checkpoints WHERE mission_id = ? ORDER BY step_index ASC', [missionId]);
  }

  // ==========================================
  // PHASE 13: STRATEGIC HIERARCHICAL ORCHESTRATION
  // ==========================================

  /**
   * Links a mission to its parent strategic objective and initiative.
   */
  async linkMissionToObjective(missionId, arg2, arg3) {
    let objectiveId = arg2;
    let initiativeId = arg3;

    // Gracefully handle either argument order: (missionId, objectiveId, initiativeId) or (missionId, initiativeId, objectiveId)
    if (typeof arg2 === 'string' && arg2.startsWith('init-') && typeof arg3 === 'string' && (arg3.startsWith('strat-obj-') || arg3.startsWith('obj-'))) {
      initiativeId = arg2;
      objectiveId = arg3;
    } else if (typeof arg3 === 'string' && arg3.startsWith('init-')) {
      objectiveId = arg2;
      initiativeId = arg3;
    }

    if (!missionId || !objectiveId) {
      throw new Error('missionId and objectiveId are required.');
    }
    await run(
      'UPDATE missions SET parent_objective_id = ?, initiative_id = ? WHERE id = ?',
      [objectiveId, initiativeId || null, missionId]
    );
    return {
      linked: true,
      mission_id: missionId,
      objective_id: objectiveId,
      parent_objective_id: objectiveId,
      initiative_id: initiativeId
    };
  }

  /**
   * Tracks hierarchical progress across constituent missions.
   * INVARIANT 17: A completed task/mission does NOT automatically imply that its parent strategic objective is complete.
   */
  async trackObjectiveProgress(objectiveId) {
    const obj = await get('SELECT * FROM strategic_objectives WHERE id = ?', [objectiveId]);
    if (!obj) throw new Error(`Strategic objective ${objectiveId} not found.`);

    const childMissions = await query('SELECT * FROM missions WHERE parent_objective_id = ?', [objectiveId]);
    const initiatives = await query('SELECT * FROM strategic_initiatives WHERE objective_id = ?', [objectiveId]);

    const totalMissions = childMissions.length;
    const completedMissions = childMissions.filter(m => m.status === 'COMPLETED').length;

    // Progress metric based on constituent missions
    const progress = totalMissions > 0 ? parseFloat((completedMissions / totalMissions).toFixed(2)) : 0.0;

    // INVARIANT: Completed tasks alone do not complete the objective; requires outcome verification
    let objectiveStatus = obj.status;
    if (progress >= 1.0 && totalMissions > 0) {
      // Retain verification pending state rather than marking ACHIEVED automatically
      objectiveStatus = 'OUTCOME_VERIFICATION_PENDING';
    } else if (progress > 0) {
      objectiveStatus = 'IN_PROGRESS';
    }

    await run(
      'UPDATE strategic_objectives SET progress = ?, status = ?, updated_at = ? WHERE id = ?',
      [progress, objectiveStatus, new Date().toISOString(), objectiveId]
    );

    return {
      objective_id: objectiveId,
      progress,
      status: objectiveStatus,
      total_missions: totalMissions,
      completed_missions: completedMissions,
      initiatives_count: initiatives.length,
      requires_independent_verification: progress >= 1.0
    };
  }

  /**
   * Detects stalled strategic initiatives (Invariant 19).
   */
  async detectStalledInitiatives() {
    const initiatives = await query('SELECT * FROM strategic_initiatives WHERE status = "ACTIVE" OR status = "PLANNED"');
    const stalledList = [];

    for (const init of initiatives) {
      const missions = await query('SELECT status, error FROM missions WHERE initiative_id = ?', [init.id]);
      const hasBlockedOrFailed = missions.some(m => m.status === 'FAILED' || m.status === 'BLOCKED');

      if (hasBlockedOrFailed) {
        const reason = 'Constituent mission encountered unhandled failure or blocked gate';
        await run(
          'UPDATE strategic_initiatives SET status = "STALLED", stalled_reason = ?, updated_at = ? WHERE id = ?',
          [reason, new Date().toISOString(), init.id]
        );
        stalledList.push({
          initiative_id: init.id,
          title: init.title,
          stalled_reason: reason
        });
      }
    }

    return {
      stalled_count: stalledList.length,
      stalled_initiatives: stalledList
    };
  }

  /**
   * Reallocates operational resources for an initiative within authorized limits.
   */
  async reallocateResources(initiativeId, resourceAllocation = {}) {
    const init = await get('SELECT * FROM strategic_initiatives WHERE id = ?', [initiativeId]);
    if (!init) throw new Error(`Initiative ${initiativeId} not found.`);

    const nowIso = new Date().toISOString();
    await run(
      'UPDATE strategic_initiatives SET allocated_resources = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(resourceAllocation), nowIso, initiativeId]
    );

    return {
      initiative_id: initiativeId,
      allocated_resources: resourceAllocation,
      updated_at: nowIso
    };
  }

  /**
   * Recovers strategic missions across system restarts (Invariant 18).
   */
  async recoverStrategicMissions() {
    const interrupted = await query(
      `SELECT m.*, o.title as objective_title 
       FROM missions m
       JOIN strategic_objectives o ON m.parent_objective_id = o.id
       WHERE m.status = 'RUNNING' OR m.status = 'PLANNING'`
    );

    const recovered = [];
    for (const m of interrupted) {
      await run('UPDATE missions SET status = "PENDING" WHERE id = ?', [m.id]);
      recovered.push({ mission_id: m.id, parent_objective: m.objective_title, status: 'RECOVERED_PENDING' });
    }

    return {
      recovered_count: recovered.length,
      recovered_missions: recovered
    };
  }

  // ==========================================
  // PHASE 18: AUTONOMOUS WORKFLOW ECOSYSTEM
  // ==========================================

  /**
   * Resolves conflicting agent outputs or escalates unresolved disagreements for human adjudication.
   */
  async resolveStepDisagreement(missionId, conflictingOutputs = []) {
    const resolution = coordinatorInstance.resolveAgentDisagreement(conflictingOutputs);
    if (resolution.requires_escalation) {
      await run(
        "UPDATE missions SET status = ?, error = ? WHERE id = ?",
        [MISSION_STATUSES.WAITING_FOR_APPROVAL, resolution.escalation_reason, missionId]
      );
      await this.recordCoordinationEvent(
        missionId,
        'DISAGREEMENT_ESCALATED',
        'coordinator',
        'human_operator',
        resolution,
        'ESCALATED_AWAITING_HUMAN'
      );
      this.broadcast('MISSION_ESCALATED', {
        missionId,
        type: 'AGENT_DISAGREEMENT',
        reason: resolution.escalation_reason,
        candidates: resolution.candidates
      });
    } else if (resolution.conflict_detected && resolution.resolved) {
      await this.recordCoordinationEvent(
        missionId,
        'CONFLICT_RESOLVED',
        'coordinator',
        resolution.winner?.agent_key || 'selected_agent',
        { winner: resolution.winner?.agent_key, margin: resolution.margin, rationale: resolution.rationale },
        'RESOLVED'
      );
    }
    return resolution;
  }

  /**
   * Applies human adjudication to an escalated workflow disagreement.
   */
  async resolveEscalation(missionId, { chosenAgentKey, decisionNote = 'Operator resolved disagreement', approvedBy = 'operator' } = {}) {
    const mission = await this.getMission(missionId);
    if (!mission) throw new Error(`Mission ${missionId} not found.`);
    const event = await this.recordCoordinationEvent(
      missionId,
      'ESCALATION_ADJUDICATED',
      approvedBy,
      chosenAgentKey || 'coordinator',
      { chosenAgentKey, decisionNote },
      'ADJUDICATED'
    );
    await run("UPDATE missions SET status = ?, error = NULL WHERE id = ? AND status = 'WAITING_FOR_APPROVAL'", [
      MISSION_STATUSES.PENDING,
      missionId
    ]);
    return { success: true, missionId, chosenAgentKey, event };
  }

  /**
   * Simulates or handles a mid-flight worker crash and recovers cleanly from latest checkpoint.
   */
  async handleWorkerCrash(missionId, crashReason = 'WORKER_PROCESS_CRASH') {
    const nowIso = new Date().toISOString();
    await run(
      "UPDATE mission_steps SET status = 'PENDING', error = ? WHERE mission_id = ? AND status = 'RUNNING'",
      [crashReason, missionId]
    );
    await run(
      "UPDATE missions SET status = ?, error = ?, last_heartbeat = ? WHERE id = ?",
      [MISSION_STATUSES.RUNNING, crashReason, nowIso, missionId]
    );
    const checkpoint = await get(
      'SELECT * FROM mission_checkpoints WHERE mission_id = ? ORDER BY step_index DESC LIMIT 1',
      [missionId]
    );
    const event = await this.recordCoordinationEvent(
      missionId,
      'WORKER_CRASH_RECOVERED',
      'recovery_manager',
      'mission_control',
      { crashReason, recoveredFromStep: checkpoint ? checkpoint.step_index : 0 },
      'RECOVERED'
    );
    const resumeOut = await this.recoverInterruptedMissions();
    return {
      success: true,
      missionId,
      checkpoint_step: checkpoint ? checkpoint.step_index : 0,
      recovery_event: event,
      recovery_scan: resumeOut
    };
  }

  /**
   * Returns complete execution provenance for a workflow including steps, logs, events, checkpoints, and verification report.
   */
  async getWorkflowProvenance(missionId) {
    const mission = await this.getMission(missionId);
    if (!mission) throw new Error(`Mission ${missionId} not found.`);
    const [checkpoints, executionLogs, coordinationEvents] = await Promise.all([
      this.getCheckpoints(missionId),
      query('SELECT * FROM agent_execution_logs WHERE mission_id = ? ORDER BY created_at ASC', [missionId]),
      query('SELECT * FROM mission_coordination_events WHERE mission_id = ? ORDER BY created_at ASC', [missionId])
    ]);
    return {
      mission_id: missionId,
      objective: mission.objective,
      status: mission.status,
      created_at: mission.created_at,
      completed_at: mission.completed_at,
      dag: mission.workflow_metadata?.dag || this.validateWorkflowDAG(mission.steps || []),
      acceptance_contract: mission.acceptance_contract,
      verification_report: mission.verification_report,
      checkpoints: checkpoints.map(c => ({ ...c, state_snapshot: JSON.parse(c.state_snapshot || '{}') })),
      execution_logs: executionLogs.map(l => ({ ...l, resource_usage: JSON.parse(l.resource_usage_json || '{}') })),
      coordination_events: coordinationEvents.map(e => ({ ...e, payload: JSON.parse(e.payload_json || '{}') })),
      rollback_eligible: (mission.steps || []).some(s => Boolean(s.compensation_action))
    };
  }

  /**
   * Executes safe reverse-order compensation/rollback for reversible workflow steps.
   */
  async rollbackMission(missionId, reason = 'Operator initiated rollback') {
    const mission = await this.getMission(missionId);
    if (!mission) throw new Error(`Mission ${missionId} not found.`);

    const completedReverse = [...(mission.steps || [])]
      .filter(s => ['VERIFIED', 'PARTIALLY_VERIFIED', 'COMPLETED', 'EXECUTED'].includes(s.status))
      .sort((a, b) => b.step_index - a.step_index);

    const rolledBackSteps = [];
    for (const step of completedReverse) {
      let comp = step.compensation_action;
      if (typeof comp === 'string') {
        try { comp = JSON.parse(comp); } catch (_) {}
      }
      if (comp?.type === 'unlink_created_file' && comp.file_path && !comp.pre_existed && fs.existsSync(comp.file_path)) {
        fs.unlinkSync(comp.file_path);
        rolledBackSteps.push({ step_index: step.step_index, action: 'unlinked_created_file', target: comp.file_path });
      } else if (comp && comp.tool) {
        await this.executeCompensation(step);
        rolledBackSteps.push({ step_index: step.step_index, action: `compensation_tool:${comp.tool}`, target: comp.args || null });
      }
    }

    await run('UPDATE missions SET status = ?, error = ? WHERE id = ?', [MISSION_STATUSES.CANCELLED, `ROLLED_BACK: ${reason}`, missionId]);
    await this.recordCoordinationEvent(
      missionId,
      'WORKFLOW_ROLLED_BACK',
      'operator',
      'mission_control',
      { reason, rolledBackSteps },
      'ROLLED_BACK'
    );
    this.broadcast('MISSION_STATUS', { missionId, status: MISSION_STATUSES.CANCELLED, rolledBackSteps });
    return {
      success: true,
      mission_id: missionId,
      status: MISSION_STATUSES.CANCELLED,
      rolled_back_count: rolledBackSteps.length,
      rolled_back_steps: rolledBackSteps
    };
  }

  /**
   * Aggregates live Workflow Intelligence Dashboard telemetry across missions, agents, DAGs,
   * worker pool, blocked tasks, recovery events, verifications, and workflow skill benchmarks.
   */
  async getWorkflowDashboardSummary() {
    const [recentMissions, agentMetrics, coordinationEvents, benchmarks, recentLogs] = await Promise.all([
      this.listMissions(25),
      this.getAgentMetrics(),
      query('SELECT * FROM mission_coordination_events ORDER BY created_at DESC LIMIT 40').catch(() => []),
      query('SELECT * FROM workflow_skill_benchmarks ORDER BY created_at DESC LIMIT 30').catch(() => []),
      query('SELECT * FROM agent_execution_logs ORDER BY created_at DESC LIMIT 40').catch(() => [])
    ]);

    const enrichedWorkflows = recentMissions.map(m => {
      const steps = m.steps || [];
      const totalSteps = steps.length;
      const verifiedSteps = steps.filter(s => ['VERIFIED', 'COMPLETED'].includes(s.status)).length;
      const blockedSteps = steps.filter(s => ['BLOCKED', 'WAITING_FOR_APPROVAL', 'FAILED'].includes(s.status)).length;
      const dag = m.workflow_metadata?.dag || (steps.length > 0 ? this.validateWorkflowDAG(steps) : { parallel_layers: [], critical_path_length: 0, edges: [], nodes: [] });
      return {
        id: m.id,
        objective: m.objective,
        status: m.status,
        priority: m.priority,
        created_at: m.created_at,
        completed_at: m.completed_at,
        progress_percent: totalSteps > 0 ? Math.round((verifiedSteps / totalSteps) * 100) : 0,
        verified_steps: verifiedSteps,
        total_steps: totalSteps,
        blocked_steps: blockedSteps,
        dag,
        steps,
        verification_report: m.verification_report,
        checkpoint_state: m.checkpoint_state
      };
    });

    const activeWorkflows = enrichedWorkflows.filter(w => ['RUNNING', 'PLANNING', 'PENDING', 'WAITING_FOR_APPROVAL', 'RESUMING'].includes(w.status));
    const blockedTasks = [];
    for (const w of enrichedWorkflows) {
      if (['WAITING_FOR_APPROVAL', 'BLOCKED_PROVIDER_UNAVAILABLE', 'BLOCKED_LOCAL_MODEL_UNAVAILABLE', 'FAILED_RETRYABLE'].includes(w.status)) {
        blockedTasks.push({ mission_id: w.id, objective: w.objective, mission_status: w.status, steps: w.steps.filter(s => ['WAITING_FOR_APPROVAL', 'BLOCKED', 'FAILED'].includes(s.status)) });
      }
    }

    const parsedEvents = coordinationEvents.map(e => ({ ...e, payload: JSON.parse(e.payload_json || '{}') }));
    const recoveryEvents = parsedEvents.filter(e => ['RECOVERY_EVENT', 'WORKER_CRASH_RECOVERED', 'WORKFLOW_ROLLED_BACK', 'DISAGREEMENT_ESCALATED'].includes(e.event_type));

    return {
      generated_at: new Date().toISOString(),
      active_workflows: activeWorkflows,
      workflows: enrichedWorkflows,
      specialist_agents: coordinatorInstance.getAllAgents(),
      agent_metrics: agentMetrics,
      worker_utilization: this.getWorkerPoolMetrics(),
      blocked_tasks: blockedTasks,
      recovery_events: recoveryEvents,
      coordination_events: parsedEvents,
      verification_results: enrichedWorkflows
        .filter(w => w.verification_report)
        .map(w => ({ mission_id: w.id, objective: w.objective, status: w.status, report: w.verification_report })),
      skill_benchmarks: benchmarks,
      recent_execution_logs: recentLogs
    };
  }
}

let missionControlInstance = null;

export const initMissionControl = (wss) => {
  missionControlInstance = new MissionControlService(wss);
  return missionControlInstance;
};

export const getMissionControl = () => missionControlInstance;
