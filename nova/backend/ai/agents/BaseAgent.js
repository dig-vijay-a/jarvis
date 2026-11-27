import ToolRegistry from '../../tools/registry.js';
import { query, run } from '../../database/db.js';
import { sha256 } from '../../security/cryptoUtils.js';

export class BaseAgent {
  constructor({
    key = 'general',
    name,
    role,
    description,
    systemInstruction,
    responsibilities = [],
    allowedTools = [],
    inputContract = { required_fields: [], max_payload_bytes: 65536 },
    outputContract = { require_object: true, forbid_unhandled_error: true, max_output_bytes: 524288 },
    resourceLimits = {},
    independentVerification = 'TruthfulVerificationService postcondition + contract check',
    maxIterations = 4,
    timeoutMs = 30000
  }) {
    this.key = key;
    this.name = name;
    this.role = role;
    this.description = description;
    this.systemInstruction = systemInstruction;
    this.responsibilities = Array.isArray(responsibilities) ? responsibilities : [];
    this.allowedTools = Array.isArray(allowedTools) ? allowedTools : [];
    this.inputContract = inputContract;
    this.outputContract = outputContract;
    this.resourceLimits = {
      maxIterations: resourceLimits.maxIterations || maxIterations,
      timeoutMs: resourceLimits.timeoutMs || timeoutMs,
      maxConcurrentTasks: resourceLimits.maxConcurrentTasks || 2,
      maxOutputBytes: resourceLimits.maxOutputBytes || outputContract.max_output_bytes || 524288
    };
    this.independentVerification = independentVerification;
    this.maxIterations = this.resourceLimits.maxIterations;
    this.timeoutMs = this.resourceLimits.timeoutMs;
    this.activeTasks = 0;
    this.executionLogs = [];
  }

  canExecute(toolName) {
    if (!toolName || toolName === 'none') return true;
    return this.allowedTools.includes(toolName);
  }

  getScopedTools() {
    const allTools = ToolRegistry.getTools();
    return allTools.filter(t => this.allowedTools.includes(t.name));
  }

  validateInputContract(args = {}) {
    if (args === null || typeof args !== 'object' || Array.isArray(args)) {
      return { valid: false, error: `INVALID_INPUT_CONTRACT: Agent '${this.name}' expects an argument object.` };
    }
    const serializedBytes = Buffer.byteLength(JSON.stringify(args), 'utf8');
    if (this.inputContract?.max_payload_bytes && serializedBytes > this.inputContract.max_payload_bytes) {
      return { valid: false, error: `RESOURCE_LIMIT_EXCEEDED: Input payload (${serializedBytes}B) exceeds limit (${this.inputContract.max_payload_bytes}B).` };
    }
    const reqFields = this.inputContract?.required_fields || [];
    for (const f of reqFields) {
      if (args[f] === undefined || args[f] === null || args[f] === '') {
        return { valid: false, error: `INVALID_INPUT_CONTRACT: Missing required input field '${f}' for '${this.name}'.` };
      }
    }
    return { valid: true, bytes: serializedBytes };
  }

  validateOutputContract(result, toolName = 'unknown') {
    if (result === null || result === undefined) {
      return { valid: false, error: `INVALID_AGENT_OUTPUT: Agent '${this.name}' produced null/undefined output for '${toolName}'.` };
    }
    if (this.outputContract?.require_object && (typeof result !== 'object' || Array.isArray(result))) {
      return { valid: false, error: `INVALID_AGENT_OUTPUT: Agent '${this.name}' requires structured object output for '${toolName}'.` };
    }
    const rawStr = typeof result === 'string' ? result : JSON.stringify(result);
    const outBytes = Buffer.byteLength(rawStr, 'utf8');
    if (this.resourceLimits?.maxOutputBytes && outBytes > this.resourceLimits.maxOutputBytes) {
      return { valid: false, error: `RESOURCE_LIMIT_EXCEEDED: Output size (${outBytes}B) exceeds maxOutputBytes (${this.resourceLimits.maxOutputBytes}B).` };
    }
    if (this.outputContract?.forbid_unhandled_error && typeof result === 'object' && result.success === false) {
      return { valid: false, error: result.error || `Tool '${toolName}' returned success:false` };
    }
    if (typeof result === 'object' && Array.isArray(this.outputContract?.forbidden_markers)) {
      for (const marker of this.outputContract.forbidden_markers) {
        if (rawStr.includes(marker)) {
          return { valid: false, error: `INVALID_AGENT_OUTPUT: Output contains unresolved marker '${marker}'.` };
        }
      }
    }
    return { valid: true, bytes: outBytes, hash: sha256(rawStr) };
  }

  async recordExecutionLog({ missionId = null, stepId = null, tool, status, args = {}, result = null, contractValid = true, error = null, latencyMs = 0 }) {
    const entry = {
      id: `alog-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      mission_id: missionId,
      step_id: stepId,
      agent_key: this.key,
      tool,
      status,
      input_summary: JSON.stringify(args || {}).slice(0, 400),
      output_hash: result ? sha256(typeof result === 'string' ? result : JSON.stringify(result)) : null,
      output_summary: result ? (typeof result === 'string' ? result : JSON.stringify(result)).slice(0, 400) : null,
      contract_valid: contractValid ? 1 : 0,
      resource_usage: { latency_ms: latencyMs, active_tasks: this.activeTasks, max_concurrent: this.resourceLimits.maxConcurrentTasks },
      error: error || null,
      created_at: new Date().toISOString()
    };

    this.executionLogs.push(entry);
    if (this.executionLogs.length > 100) this.executionLogs.shift();

    try {
      await run(
        `INSERT INTO agent_execution_logs
         (id, mission_id, step_id, agent_key, tool, status, input_summary, output_hash, output_summary, contract_valid, resource_usage_json, error, latency_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id, entry.mission_id, entry.step_id, entry.agent_key, entry.tool, entry.status,
          entry.input_summary, entry.output_hash, entry.output_summary, entry.contract_valid,
          JSON.stringify(entry.resource_usage), entry.error, Math.round(latencyMs), entry.created_at
        ]
      );
    } catch (_) {}

    return entry;
  }

  async getExecutionLogs(limit = 30) {
    try {
      return await query(
        'SELECT * FROM agent_execution_logs WHERE agent_key = ? ORDER BY created_at DESC LIMIT ?',
        [this.key, limit]
      );
    } catch (_) {
      return this.executionLogs.slice(-limit);
    }
  }

  getContractProfile() {
    return {
      key: this.key,
      name: this.name,
      role: this.role,
      description: this.description,
      responsibilities: this.responsibilities,
      allowedTools: this.allowedTools,
      inputContract: this.inputContract,
      outputContract: this.outputContract,
      resourceLimits: this.resourceLimits,
      independentVerification: this.independentVerification,
      activeTasks: this.activeTasks
    };
  }

  async executeTool(toolName, args = {}, context = {}) {
    if (!this.canExecute(toolName)) {
      const errMsg = `PERMISSION_DENIED: Agent '${this.name}' is not authorized to execute tool '${toolName}'.`;
      await this.recordExecutionLog({
        missionId: context.missionId || null,
        stepId: context.stepId || null,
        tool: toolName,
        status: 'REJECTED_UNAUTHORIZED',
        args,
        contractValid: false,
        error: errMsg
      });
      throw new Error(errMsg);
    }

    if (this.activeTasks >= this.resourceLimits.maxConcurrentTasks) {
      throw new Error(`RESOURCE_LIMIT_EXCEEDED: Agent '${this.name}' reached concurrent task cap (${this.resourceLimits.maxConcurrentTasks}).`);
    }

    const inputCheck = this.validateInputContract(args);
    if (!inputCheck.valid) {
      await this.recordExecutionLog({
        missionId: context.missionId || null,
        stepId: context.stepId || null,
        tool: toolName,
        status: 'REJECTED_CONTRACT',
        args,
        contractValid: false,
        error: inputCheck.error
      });
      throw new Error(inputCheck.error);
    }

    const start = Date.now();
    this.activeTasks++;
    try {
      const result = await ToolRegistry.executeTool(toolName, args);
      const outputCheck = this.validateOutputContract(result, toolName);
      if (!outputCheck.valid) {
        await this.recordExecutionLog({
          missionId: context.missionId || null,
          stepId: context.stepId || null,
          tool: toolName,
          status: 'INVALID_OUTPUT',
          args,
          result,
          contractValid: false,
          error: outputCheck.error,
          latencyMs: Date.now() - start
        });
        throw new Error(outputCheck.error);
      }

      await this.recordExecutionLog({
        missionId: context.missionId || null,
        stepId: context.stepId || null,
        tool: toolName,
        status: 'EXECUTED',
        args,
        result,
        contractValid: true,
        latencyMs: Date.now() - start
      });
      return result;
    } catch (err) {
      await this.recordExecutionLog({
        missionId: context.missionId || null,
        stepId: context.stepId || null,
        tool: toolName,
        status: 'FAILED',
        args,
        contractValid: false,
        error: err.message,
        latencyMs: Date.now() - start
      });
      throw err;
    } finally {
      this.activeTasks = Math.max(0, this.activeTasks - 1);
    }
  }
}

export default BaseAgent;
