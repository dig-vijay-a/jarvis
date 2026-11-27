import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import BaseProvider from './BaseProvider.js';
import { get } from '../../database/db.js';

const execFileAsync = promisify(execFile);

let cachedGpuInfo = { checkedAt: 0, hasNvidiaGpu: false, gpus: [], totalVramMB: 0, freeVramMB: 0 };

export class OllamaProvider extends BaseProvider {
  constructor(options = {}) {
    super('ollama', options);
    this.defaultEndpoint = (options.endpoint || process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434').replace('localhost', '127.0.0.1');
    this.defaultModel = options.defaultModel || process.env.OLLAMA_MODEL || 'qwen3.5:4b';
    this.defaultTimeoutMs = Number(process.env.LOCAL_INFERENCE_TIMEOUT_MS) || 90000;
    this.activeInferences = 0;
    this._lifecycleLock = null;
  }

  async getEndpoint() {
    try {
      const setting = await get("SELECT value FROM settings WHERE key = 'ollama_endpoint'");
      if (setting && setting.value && setting.value.trim()) {
        return setting.value.trim().replace(/\/$/, '').replace('://localhost:', '://127.0.0.1:');
      }
    } catch (_) {}
    return (process.env.OLLAMA_ENDPOINT || this.defaultEndpoint).replace(/\/$/, '').replace('://localhost:', '://127.0.0.1:');
  }

  async getModel() {
    try {
      const setting = await get("SELECT value FROM settings WHERE key = 'ollama_model'");
      if (setting && setting.value && setting.value.trim()) return setting.value.trim();
    } catch (_) {}
    return (process.env.OLLAMA_MODEL || this.defaultModel).trim();
  }

  async isLocalInferenceEnabled() {
    try {
      const setting = await get("SELECT value FROM settings WHERE key = 'local_inference_enabled'");
      if (setting && setting.value !== undefined) return setting.value === 'true';
    } catch (_) {}
    return true;
  }

  /**
   * Detects system RAM, CPU cores, GPU/VRAM, and selects safe context & thread limits.
   */
  async getSystemResourceProfile() {
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const totalRamGB = parseFloat((totalMemBytes / (1024 ** 3)).toFixed(2));
    const freeRamGB = parseFloat((freeMemBytes / (1024 ** 3)).toFixed(2));
    const logicalCpus = (os.cpus() || []).length || 4;

    if (Date.now() - cachedGpuInfo.checkedAt > 60000) {
      let nextGpu = { checkedAt: Date.now(), hasNvidiaGpu: false, gpus: [], totalVramMB: 0, freeVramMB: 0 };
      try {
        const { stdout } = await execFileAsync('nvidia-smi', [
          '--query-gpu=name,memory.total,memory.free',
          '--format=csv,noheader,nounits'
        ], { timeout: 1500 });
        const lines = (stdout || '').trim().split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          const [name, totalMB, freeMB] = line.split(',').map(s => s.trim());
          nextGpu.hasNvidiaGpu = true;
          nextGpu.gpus.push({ name, totalVramMB: Number(totalMB) || 0, freeVramMB: Number(freeMB) || 0 });
          nextGpu.totalVramMB += Number(totalMB) || 0;
          nextGpu.freeVramMB += Number(freeMB) || 0;
        }
      } catch (_) {
        // CPU / integrated GPU host (no nvidia-smi)
      }
      cachedGpuInfo = nextGpu;
    }

    const explicitCtx = Number(process.env.OLLAMA_CONTEXT_LENGTH) || 0;
    let recommendedCtx = 4096;
    if (explicitCtx >= 1024) {
      recommendedCtx = explicitCtx;
    } else if (cachedGpuInfo.hasNvidiaGpu && cachedGpuInfo.freeVramMB >= 6500) {
      recommendedCtx = 8192;
    } else if (freeRamGB >= 4.0) {
      recommendedCtx = 4096;
    } else {
      recommendedCtx = 3072;
    }

    // Benchmarked optimal threading on 12-CPU host: 10 threads yields peak prefill + generation throughput without starving UI/Node
    const numThreads = Math.min(10, Math.max(2, logicalCpus - 2));

    return {
      totalRamGB,
      freeRamGB,
      logicalCpus,
      hasNvidiaGpu: cachedGpuInfo.hasNvidiaGpu,
      gpus: cachedGpuInfo.gpus,
      totalVramMB: cachedGpuInfo.totalVramMB,
      freeVramMB: cachedGpuInfo.freeVramMB,
      recommendedCtx,
      numThreads,
      maxLoadedModels: Number(process.env.OLLAMA_MAX_LOADED_MODELS) || 1,
      keepAlive: process.env.OLLAMA_KEEP_ALIVE || '10m',
      inferenceTimeoutMs: this.defaultTimeoutMs
    };
  }

  modelMatchesTag(installedName = '', configuredModel = '') {
    const a = installedName.toLowerCase().trim();
    const b = configuredModel.toLowerCase().trim();
    if (!a || !b) return false;
    if (a === b) return true;
    if (!b.includes(':') && a === `${b}:latest`) return true;
    return false;
  }

  /**
   * Verifies Ollama daemon reachability, whether configured model is downloaded,
   * and what models are currently resident in memory (/api/ps).
   */
  async verifyModelAvailability() {
    const endpoint = await this.getEndpoint();
    const model = await this.getModel();
    const resourceProfile = await this.getSystemResourceProfile();

    try {
      const enabled = await this.isLocalInferenceEnabled();
      if (!enabled) {
        return {
          online: false,
          model,
          modelDownloaded: false,
          availableModels: [],
          loadedModels: [],
          resourceProfile,
          error: 'Local inference is disabled in settings.'
        };
      }

      const tagsRes = await axios.get(`${endpoint}/api/tags`, { timeout: 4000 });
      const availableModels = Array.isArray(tagsRes.data?.models)
        ? tagsRes.data.models.map(m => m.name || m.model).filter(Boolean)
        : [];
      const modelDownloaded = availableModels.some(m => this.modelMatchesTag(m, model));

      let loadedModels = [];
      try {
        const psRes = await axios.get(`${endpoint}/api/ps`, { timeout: 2000 });
        if (Array.isArray(psRes.data?.models)) {
          loadedModels = psRes.data.models.map(m => ({
            name: m.name || m.model,
            sizeBytes: m.size || 0,
            sizeVramBytes: m.size_vram || 0,
            expiresAt: m.expires_at || null
          }));
        }
      } catch (_) {}

      return {
        online: tagsRes.status === 200,
        endpoint,
        model,
        modelDownloaded,
        availableModels,
        loadedModels,
        resourceProfile,
        error: modelDownloaded ? null : `Model '${model}' is not downloaded in Ollama at ${endpoint}.`
      };
    } catch (err) {
      return {
        online: false,
        endpoint,
        model,
        modelDownloaded: false,
        availableModels: [],
        loadedModels: [],
        resourceProfile,
        error: `Ollama daemon unreachable at ${endpoint}: ${err.message}`
      };
    }
  }

  async checkHealth() {
    const status = await this.verifyModelAvailability();
    return Boolean(status.online && status.modelDownloaded);
  }

  async listAvailableModels() {
    const status = await this.verifyModelAvailability();
    return status.availableModels;
  }

  /**
   * Returns true if an inference call is currently in-flight or a mission is actively executing.
   */
  async hasActiveMissionOrInference() {
    if (this.activeInferences > 0) return { active: true, reason: 'in_flight_inference', activeInferences: this.activeInferences };
    try {
      const row = await get("SELECT COUNT(*) AS cnt FROM missions WHERE status IN ('RUNNING', 'RESUMING')");
      if (row && Number(row.cnt) > 0) {
        return { active: true, reason: 'active_mission_in_db', activeMissions: Number(row.cnt) };
      }
    } catch (_) {}
    return { active: false };
  }

  /**
   * Reads actual resident models from Ollama /api/ps. Never assumes residency without checking /api/ps.
   */
  async getResidentModels(endpoint = null) {
    const ep = endpoint || await this.getEndpoint();
    const psRes = await axios.get(`${ep}/api/ps`, { timeout: 2500 });
    return Array.isArray(psRes.data?.models)
      ? psRes.data.models.map(m => ({
          name: m.name || m.model,
          sizeBytes: m.size || 0,
          sizeVramBytes: m.size_vram || 0,
          expiresAt: m.expires_at || null
        }))
      : [];
  }

  /**
   * Safely unloads a loaded model with active-mission protection and actual /api/ps residency polling.
   * Never reports unloaded: true based on API HTTP 200 acknowledgement alone.
   */
  async unloadModel(targetModel = null, { force = false, verifyTimeoutMs = 15000 } = {}) {
    const endpoint = await this.getEndpoint();
    const model = targetModel || await this.getModel();

    if (!force) {
      const busy = await this.hasActiveMissionOrInference();
      if (busy.active) {
        return {
          success: false,
          model,
          unloaded: false,
          verifiedNotResident: false,
          skipped: true,
          reason: `Refusing unload during active workload (${busy.reason}).`
        };
      }
    }

    try {
      await axios.post(`${endpoint}/api/generate`, { model, prompt: '', keep_alive: 0 }, { timeout: 8000 });
      const deadline = Date.now() + verifyTimeoutMs;
      while (Date.now() < deadline) {
        const resident = await this.getResidentModels(endpoint);
        const stillLoaded = resident.some(m => this.modelMatchesTag(m.name, model));
        if (!stillLoaded) {
          return {
            success: true,
            model,
            unloaded: true,
            verifiedNotResident: true,
            residentModelsAfter: resident
          };
        }
        await new Promise(r => setTimeout(r, 250));
      }
      const finalResident = await this.getResidentModels(endpoint).catch(() => []);
      return {
        success: false,
        model,
        unloaded: false,
        verifiedNotResident: false,
        error: `Unload API acknowledged, but '${model}' remained resident in /api/ps after ${verifyTimeoutMs}ms.`,
        residentModelsAfter: finalResident
      };
    } catch (err) {
      return { success: false, model, unloaded: false, verifiedNotResident: false, error: err.message };
    }
  }

  /**
   * Prevents loading multiple competing models simultaneously in constrained memory without thrashing active runs.
   */
  async ensureSingleLoadedModel(targetModel) {
    if (this._lifecycleLock) {
      await this._lifecycleLock;
    }
    let release;
    this._lifecycleLock = new Promise(res => { release = res; });
    try {
      const endpoint = await this.getEndpoint();
      const resident = await this.getResidentModels(endpoint);
      const otherModels = resident.filter(m => m.name && !this.modelMatchesTag(m.name, targetModel));
      if (otherModels.length === 0) return;
      for (const m of otherModels) {
        await this.unloadModel(m.name, { force: true, verifyTimeoutMs: 10000 });
      }
    } catch (_) {}
    finally {
      this._lifecycleLock = null;
      release();
    }
  }

  async testConnection() {
    const t0 = Date.now();
    try {
      const avail = await this.verifyModelAvailability();
      if (!avail.online || !avail.modelDownloaded) {
        return {
          success: false,
          provider: 'ollama',
          model: avail.model,
          latencyMs: Date.now() - t0,
          error: avail.error || 'Ollama local model is unavailable.',
          errorType: 'MODEL_UNAVAILABLE'
        };
      }

      const res = await this.chatCompletion({
        systemPrompt: 'Respond in 3 words: Diagnostic probe verified.',
        messages: [{ role: 'user', content: 'Ping' }],
        maxTokens: 20,
        timeoutMs: 25000
      });

      return {
        success: true,
        provider: 'ollama',
        model: res.model,
        latencyMs: Date.now() - t0,
        message: res.text,
        resourceProfile: avail.resourceProfile
      };
    } catch (err) {
      const classified = this.classifyError(err);
      return {
        success: false,
        provider: 'ollama',
        latencyMs: Date.now() - t0,
        error: classified.message,
        errorType: classified.type
      };
    }
  }

  sanitizeToolSchema(schema) {
    if (!schema || typeof schema !== 'object') return schema;
    const copy = Array.isArray(schema) ? [...schema] : { ...schema };
    if (typeof copy.type === 'string') {
      copy.type = copy.type.toLowerCase();
    }
    if (copy.properties && typeof copy.properties === 'object') {
      const newProps = {};
      for (const [k, v] of Object.entries(copy.properties)) {
        newProps[k] = this.sanitizeToolSchema(v);
      }
      copy.properties = newProps;
    }
    if (copy.items && typeof copy.items === 'object') {
      copy.items = this.sanitizeToolSchema(copy.items);
    }
    return copy;
  }

  formatAndBoundMessages(systemPrompt, messages, maxCtxTokens, tools = []) {
    const normalized = [];
    for (const msg of (messages || [])) {
      const rawRole = msg.role || (msg.sender === 'user' ? 'user' : msg.sender === 'assistant' || msg.sender === 'bot' ? 'assistant' : 'user');
      const role = ['system', 'user', 'assistant', 'tool'].includes(rawRole) ? rawRole : 'user';
      const content = typeof msg.content === 'string'
        ? msg.content
        : (Array.isArray(msg.parts) ? msg.parts.map(p => p.text || '').join('') : JSON.stringify(msg.content || ''));
      normalized.push({ role, content });
    }

    if (normalized.length === 0) {
      normalized.push({ role: 'user', content: 'Hello' });
    }

    // Reserve budget for tools schema + completion output so context never overflows num_ctx.
    // Never truncate task/planning systemPrompt unless approaching total context limit; cap bulky chat history on CPU.
    const toolsChars = Array.isArray(tools) && tools.length > 0 ? JSON.stringify(tools).length : 0;
    const totalBudgetChars = Math.max(2400, Math.floor((maxCtxTokens - 512) * 3.0));
    const availableAfterTools = Math.max(1200, totalBudgetChars - Math.min(totalBudgetChars - 1200, toolsChars));
    const sysText = String(systemPrompt || '').slice(0, Math.max(1200, availableAfterTools - 600));
    const remainingForMessages = Math.max(600, availableAfterTools - sysText.length);
    const historyCap = cachedGpuInfo.hasNvidiaGpu ? remainingForMessages : Math.min(remainingForMessages, 4500);
    const maxTotalChars = sysText.length + historyCap;
    let usedChars = sysText.length;
    const keptReversed = [];

    for (let i = normalized.length - 1; i >= 0; i--) {
      const m = normalized[i];
      const budgetLeft = maxTotalChars - usedChars;
      if (budgetLeft <= 0 && keptReversed.length > 0) break;
      if (m.content.length <= budgetLeft || keptReversed.length === 0) {
        keptReversed.push({
          role: m.role,
          content: m.content.slice(0, Math.max(500, budgetLeft))
        });
        usedChars += keptReversed[keptReversed.length - 1].content.length;
      } else {
        break;
      }
    }

    const out = [];
    if (sysText) out.push({ role: 'system', content: sysText });
    out.push(...keptReversed.reverse());
    return out;
  }

  parseToolCallsFromMessage(messageObj = {}) {
    const toolCalls = [];
    if (Array.isArray(messageObj.tool_calls)) {
      for (const tc of messageObj.tool_calls) {
        const fnName = tc.function?.name || tc.name;
        if (!fnName) continue;
        let parsedArgs = tc.function?.arguments ?? tc.arguments ?? {};
        if (typeof parsedArgs === 'string') {
          try { parsedArgs = JSON.parse(parsedArgs); } catch (_) { parsedArgs = { raw: parsedArgs }; }
        }
        toolCalls.push({ name: fnName, arguments: parsedArgs });
      }
      return toolCalls;
    }

    const assistantMsg = String(messageObj.content || '');
    try {
      const stripped = assistantMsg.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const name = parsed.tool || parsed.name || parsed.tool_name;
        if (name && typeof name === 'string') {
          toolCalls.push({ name, arguments: parsed.arguments || parsed.args || {} });
        }
      }
    } catch (_) {}
    return toolCalls;
  }

  buildPayload({ model, formattedMessages, tools, temperature, maxTokens, responseFormat, resourceProfile, stream, think = null }) {
    const payload = {
      model,
      messages: formattedMessages,
      stream: Boolean(stream),
      think: think !== null ? Boolean(think) : (process.env.OLLAMA_THINK === 'true'),
      keep_alive: resourceProfile.keepAlive,
      options: {
        temperature,
        num_predict: maxTokens,
        num_ctx: resourceProfile.recommendedCtx,
        num_thread: resourceProfile.numThreads
      }
    };

    if (responseFormat?.type === 'json_object') {
      payload.format = 'json';
    }

    if (tools && tools.length > 0) {
      payload.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description || '',
          parameters: this.sanitizeToolSchema(t.parameters) || { type: 'object', properties: {} }
        }
      }));
    }
    return payload;
  }

  async chatCompletion({
    systemPrompt = '',
    messages = [],
    tools = [],
    temperature = 0.25,
    maxTokens = 1536,
    numCtx = null,
    responseFormat = null,
    timeoutMs = null
  }) {
    const avail = await this.verifyModelAvailability();
    if (!avail.online || !avail.modelDownloaded) {
      const err = new Error(avail.error || 'Local Ollama model is unavailable.');
      err.status = 503;
      err.code = 'LOCAL_MODEL_UNAVAILABLE';
      throw err;
    }

    if (avail.resourceProfile.maxLoadedModels <= 1) {
      await this.ensureSingleLoadedModel(avail.model);
    }

    const effectiveCtx = numCtx && numCtx >= 1024
      ? Math.min(avail.resourceProfile.recommendedCtx, numCtx)
      : avail.resourceProfile.recommendedCtx;
    const effectiveProfile = { ...avail.resourceProfile, recommendedCtx: effectiveCtx };

    const formattedMessages = this.formatAndBoundMessages(systemPrompt, messages, effectiveCtx, tools);
    const payload = this.buildPayload({
      model: avail.model,
      formattedMessages,
      tools,
      temperature,
      maxTokens,
      responseFormat,
      resourceProfile: effectiveProfile,
      stream: false
    });

    const effectiveTimeout = timeoutMs || avail.resourceProfile.inferenceTimeoutMs;
    const t0 = Date.now();
    this.activeInferences++;
    let response;
    try {
      response = await axios.post(`${avail.endpoint}/api/chat`, payload, {
        timeout: effectiveTimeout
      });
    } finally {
      this.activeInferences = Math.max(0, this.activeInferences - 1);
    }

    const latencyMs = Date.now() - t0;
    const messageObj = response.data?.message || {};
    const assistantMsg = messageObj.content || '';
    const toolCalls = this.parseToolCallsFromMessage(messageObj);

    const promptTokens = response.data?.prompt_eval_count || this.estimateTokens(JSON.stringify(formattedMessages));
    const completionTokens = response.data?.eval_count || this.estimateTokens(assistantMsg);
    const evalDurationSec = (response.data?.eval_duration || 0) / 1e9;
    const promptEvalDurationSec = (response.data?.prompt_eval_duration || 0) / 1e9;
    const tokensPerSec = evalDurationSec > 0 ? Number((completionTokens / evalDurationSec).toFixed(2)) : 0;
    const promptTokensPerSec = promptEvalDurationSec > 0 ? Number((promptTokens / promptEvalDurationSec).toFixed(2)) : 0;

    return {
      text: assistantMsg.trim(),
      toolCalls,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      },
      telemetry: {
        ttftMs: latencyMs,
        tokensPerSec,
        promptTokensPerSec,
        evalDurationMs: Math.round(evalDurationSec * 1000),
        promptEvalDurationMs: Math.round(promptEvalDurationSec * 1000),
        numCtx: effectiveCtx,
        numThreads: effectiveProfile.numThreads
      },
      finishReason: response.data?.done_reason || 'stop',
      latencyMs,
      provider: 'ollama',
      model: avail.model,
      resourceContext: {
        numCtx: effectiveCtx,
        numThreads: effectiveProfile.numThreads,
        freeRamGB: avail.resourceProfile.freeRamGB
      }
    };
  }

  async streamResponse({
    systemPrompt = '',
    messages = [],
    tools = [],
    temperature = 0.25,
    maxTokens = 1536,
    numCtx = null,
    responseFormat = null,
    onChunk,
    timeoutMs = null
  }) {
    const avail = await this.verifyModelAvailability();
    if (!avail.online || !avail.modelDownloaded) {
      const err = new Error(avail.error || 'Local Ollama model is unavailable.');
      err.status = 503;
      err.code = 'LOCAL_MODEL_UNAVAILABLE';
      throw err;
    }

    if (avail.resourceProfile.maxLoadedModels <= 1) {
      await this.ensureSingleLoadedModel(avail.model);
    }

    const effectiveCtx = numCtx && numCtx >= 1024
      ? Math.min(avail.resourceProfile.recommendedCtx, numCtx)
      : avail.resourceProfile.recommendedCtx;
    const effectiveProfile = { ...avail.resourceProfile, recommendedCtx: effectiveCtx };

    const formattedMessages = this.formatAndBoundMessages(systemPrompt, messages, effectiveCtx, tools);
    const payload = this.buildPayload({
      model: avail.model,
      formattedMessages,
      tools,
      temperature,
      maxTokens,
      responseFormat,
      resourceProfile: effectiveProfile,
      stream: true
    });

    const effectiveTimeout = timeoutMs || avail.resourceProfile.inferenceTimeoutMs;
    const t0 = Date.now();
    this.activeInferences++;
    let response;
    try {
      response = await axios.post(`${avail.endpoint}/api/chat`, payload, {
        timeout: effectiveTimeout,
        responseType: 'stream'
      });
    } catch (err) {
      this.activeInferences = Math.max(0, this.activeInferences - 1);
      throw err;
    }

    return new Promise((resolve, reject) => {
      let buffer = '';
      let accumulatedText = '';
      let collectedToolCalls = [];
      let promptTokens = 0;
      let completionTokens = 0;
      let evalDurationSec = 0;
      let promptEvalDurationSec = 0;
      let ttftMs = null;
      let doneReason = 'stop';
      let settled = false;
      const finishActive = () => {
        if (!settled) {
          settled = true;
          this.activeInferences = Math.max(0, this.activeInferences - 1);
        }
      };

      response.data.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            const delta = parsed.message?.content || '';
            const tcalls = parsed.message?.tool_calls;
            if ((delta || (Array.isArray(tcalls) && tcalls.length > 0)) && ttftMs === null) {
              ttftMs = Date.now() - t0;
            }
            if (delta) {
              accumulatedText += delta;
              if (onChunk) {
                onChunk({
                  delta,
                  text: accumulatedText,
                  ttftMs,
                  done: false,
                  provider: 'ollama',
                  model: avail.model
                });
              }
            }
            if (Array.isArray(tcalls)) {
              collectedToolCalls.push(...this.parseToolCallsFromMessage(parsed.message));
            }
            if (parsed.done) {
              promptTokens = parsed.prompt_eval_count || this.estimateTokens(JSON.stringify(formattedMessages));
              completionTokens = parsed.eval_count || this.estimateTokens(accumulatedText);
              evalDurationSec = (parsed.eval_duration || 0) / 1e9;
              promptEvalDurationSec = (parsed.prompt_eval_duration || 0) / 1e9;
              doneReason = parsed.done_reason || 'stop';
            }
          } catch (_) {}
        }
      });

      response.data.on('end', () => {
        finishActive();
        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer);
            const delta = parsed.message?.content || '';
            if (delta) {
              if (ttftMs === null) ttftMs = Date.now() - t0;
              accumulatedText += delta;
            }
            if (parsed.prompt_eval_count) promptTokens = parsed.prompt_eval_count;
            if (parsed.eval_count) completionTokens = parsed.eval_count;
            if (parsed.eval_duration) evalDurationSec = parsed.eval_duration / 1e9;
            if (parsed.prompt_eval_duration) promptEvalDurationSec = parsed.prompt_eval_duration / 1e9;
          } catch (_) {}
        }
        if (collectedToolCalls.length === 0) {
          collectedToolCalls = this.parseToolCallsFromMessage({ content: accumulatedText });
        }
        const finalUsage = {
          promptTokens: promptTokens || this.estimateTokens(JSON.stringify(formattedMessages)),
          completionTokens: completionTokens || this.estimateTokens(accumulatedText),
          totalTokens: (promptTokens || 0) + (completionTokens || 0)
        };
        if (!finalUsage.totalTokens) finalUsage.totalTokens = finalUsage.promptTokens + finalUsage.completionTokens;
        const latencyMs = Date.now() - t0;
        const tokensPerSec = evalDurationSec > 0 ? Number((finalUsage.completionTokens / evalDurationSec).toFixed(2)) : 0;
        const promptTokensPerSec = promptEvalDurationSec > 0 ? Number((finalUsage.promptTokens / promptEvalDurationSec).toFixed(2)) : 0;

        const out = {
          text: accumulatedText.trim(),
          toolCalls: collectedToolCalls,
          usage: finalUsage,
          telemetry: {
            ttftMs: ttftMs ?? latencyMs,
            tokensPerSec,
            promptTokensPerSec,
            evalDurationMs: Math.round(evalDurationSec * 1000),
            promptEvalDurationMs: Math.round(promptEvalDurationSec * 1000),
            numCtx: effectiveCtx,
            numThreads: effectiveProfile.numThreads
          },
          finishReason: doneReason,
          latencyMs,
          ttftMs: ttftMs ?? latencyMs,
          provider: 'ollama',
          model: avail.model
        };
        if (onChunk) {
          onChunk({ ...out, done: true });
        }
        resolve(out);
      });

      response.data.on('error', (err) => {
        finishActive();
        reject(err);
      });
    });
  }
}

export default OllamaProvider;
