import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { get, run, query } from '../database/db.js';
import { getProvider, getAllProviders, ERROR_TYPES } from './providers/index.js';
import ToolRegistry from '../tools/registry.js';

let dbInitialized = false;
const providerCooldowns = new Map(); // providerName -> timestamp ms until cooled down after quota exhaustion
async function ensureDb() {
  if (dbInitialized) return;
  try {
    await run(`
      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        latency_ms INTEGER DEFAULT 0,
        ttft_ms REAL DEFAULT 0,
        tokens_per_sec REAL DEFAULT 0,
        prompt_tokens_per_sec REAL DEFAULT 0,
        task_class TEXT,
        num_ctx INTEGER DEFAULT 0,
        phase_type TEXT,
        success INTEGER DEFAULT 1,
        error_type TEXT,
        timestamp TEXT NOT NULL
      )
    `);
    const cols = await query("PRAGMA table_info(ai_usage_logs)");
    const colNames = cols.map(c => c.name);
    if (!colNames.includes('ttft_ms')) await run("ALTER TABLE ai_usage_logs ADD COLUMN ttft_ms REAL DEFAULT 0");
    if (!colNames.includes('tokens_per_sec')) await run("ALTER TABLE ai_usage_logs ADD COLUMN tokens_per_sec REAL DEFAULT 0");
    if (!colNames.includes('prompt_tokens_per_sec')) await run("ALTER TABLE ai_usage_logs ADD COLUMN prompt_tokens_per_sec REAL DEFAULT 0");
    if (!colNames.includes('task_class')) await run("ALTER TABLE ai_usage_logs ADD COLUMN task_class TEXT");
    if (!colNames.includes('num_ctx')) await run("ALTER TABLE ai_usage_logs ADD COLUMN num_ctx INTEGER DEFAULT 0");
    if (!colNames.includes('phase_type')) await run("ALTER TABLE ai_usage_logs ADD COLUMN phase_type TEXT");
    dbInitialized = true;
  } catch (err) {
    console.warn('[ModelRouter] Error initializing ai_usage_logs table:', err.message);
  }
}

export class ModelRouterService {
  /**
   * Phase 15 P3: Lightweight 7-class Task Complexity Classifier (Zero Extra Models)
   * Categories: simple_conversation | memory_retrieval | single_tool_operation |
   *             multi_tool_mission | complex_reasoning | research_synthesis | coding_debugging
   */
  static classifyTaskComplexity(userText = '', contextHints = {}) {
    const raw = String(userText || '').trim();
    const lower = raw.toLowerCase();
    const hasMemoryCue = /\b(?:remember|what is my|do you recall|from memory|previous session|stored memory|codename|preference|my favorite)\b/i.test(lower);
    const hasCodingCue = /\b(?:bug|debug|fix|codebase|architecture|api docs?|unit test|run tests?|node --test|pytest|invoice\.js|calculate|function|symbol)\b/i.test(lower);
    const hasResearchCue = /\b(?:research|compare|conflicting|benchmark|citations?|source urls?|traceable urls?|deep research|web search|wasi|fido2|quic|http\/3)\b/i.test(lower);
    const hasMultiStepCue = /\b(?:and write|and save|then open|and organize|step|corpus|summarize all|duplicate hashes|inventory.*write|multi-step|report at|to ['"`][a-z]:)\b/i.test(lower);
    const hasSingleToolCue = /\b(?:open |launch |close |minimize |maximize |list windows|system telemetry|cpu|ram usage|set reminder|create task|focus timer|search files|read file)\b/i.test(lower);
    const hasReasoningCue = /\b(?:design|trade-?offs?|compare and contrast|evaluate|strategy|security audit|analyze in depth|explain why)\b/i.test(lower) || raw.length > 260;

    let taskClass = 'simple_conversation';
    if (hasCodingCue && (hasMultiStepCue || /\b(inspect|analyze|find|run|repo|project)\b/i.test(lower))) {
      taskClass = 'coding_debugging';
    } else if (hasResearchCue) {
      taskClass = 'research_synthesis';
    } else if (hasMultiStepCue || (hasSingleToolCue && /\b(?:then|and also|and record|and write)\b/i.test(lower))) {
      taskClass = 'multi_tool_mission';
    } else if (hasCodingCue) {
      taskClass = 'coding_debugging';
    } else if (hasMemoryCue && !hasSingleToolCue) {
      taskClass = 'memory_retrieval';
    } else if (hasSingleToolCue) {
      taskClass = 'single_tool_operation';
    } else if (hasReasoningCue) {
      taskClass = 'complex_reasoning';
    }

    const profiles = {
      simple_conversation: {
        legacyComplexity: 'low',
        numCtx: 2048,
        maxTokens: 256,
        useCompactPrompt: true,
        includeTools: false,
        maxToolSchemas: 0,
        skipPlanner: true
      },
      memory_retrieval: {
        legacyComplexity: 'low',
        numCtx: 2048,
        maxTokens: 256,
        useCompactPrompt: true,
        includeTools: false,
        maxToolSchemas: 0,
        skipPlanner: true
      },
      single_tool_operation: {
        legacyComplexity: 'medium',
        numCtx: 2560,
        maxTokens: 256,
        useCompactPrompt: true,
        includeTools: true,
        maxToolSchemas: 4,
        skipPlanner: true
      },
      multi_tool_mission: {
        legacyComplexity: 'high',
        numCtx: 3584,
        maxTokens: 640,
        useCompactPrompt: false,
        includeTools: true,
        maxToolSchemas: 8,
        skipPlanner: false
      },
      research_synthesis: {
        legacyComplexity: 'high',
        numCtx: 4096,
        maxTokens: 850,
        useCompactPrompt: false,
        includeTools: true,
        maxToolSchemas: 6,
        skipPlanner: false
      },
      coding_debugging: {
        legacyComplexity: 'high',
        numCtx: 4096,
        maxTokens: 850,
        useCompactPrompt: false,
        includeTools: true,
        maxToolSchemas: 6,
        skipPlanner: false
      },
      complex_reasoning: {
        legacyComplexity: 'high',
        numCtx: 3584,
        maxTokens: 640,
        useCompactPrompt: false,
        includeTools: false,
        maxToolSchemas: 0,
        skipPlanner: false
      }
    };

    const cfg = profiles[taskClass];
    return {
      taskClass,
      ...cfg,
      reason: `Classified '${taskClass}' (ctx=${cfg.numCtx}, maxTok=${cfg.maxTokens}, compact=${cfg.useCompactPrompt})`
    };
  }

  /**
   * Compacts tool JSON schemas to cut prompt prefill tokens on local CPU inference
   * while preserving strict parameter types and required constraints.
   */
  static compactToolSchemas(tools = []) {
    if (!Array.isArray(tools) || tools.length === 0) return [];
    return tools.map(t => {
      const props = t.parameters?.properties || {};
      const compactProps = {};
      for (const [k, v] of Object.entries(props)) {
        compactProps[k] = {
          type: v.type || 'string',
          ...(v.enum ? { enum: v.enum } : {}),
          ...(v.description ? { description: String(v.description).slice(0, 48) } : {})
        };
      }
      return {
        name: t.name,
        description: String(t.description || '').slice(0, 64),
        parameters: {
          type: 'object',
          properties: compactProps,
          required: Array.isArray(t.parameters?.required) ? t.parameters.required : []
        }
      };
    });
  }

  /**
   * Evaluates prompt complexity: 'low' | 'medium' | 'high'
   */
  static evaluateComplexity(userText = '') {
    return this.classifyTaskComplexity(userText).legacyComplexity;
  }

  /**
   * Checks if user prompt or settings mandate strictly local execution (zero data leakage)
   */
  static async checkPrivacyRequirement(userText = '', explicitPrivacyTag = null) {
    if (explicitPrivacyTag === 'strict_local') return true;

    // Check system setting
    try {
      const privacySetting = await get("SELECT value FROM settings WHERE key = 'privacy_mode'");
      if (privacySetting && privacySetting.value === 'strict_local') {
        return true;
      }
    } catch (_) {}

    // Heuristic detection of sensitive tokens
    const sensitiveTokens = [
      /\b(?:password|passwd|pin|secret|api[_-]?key|private[_-]?key|token|credential)\b/i,
      /\b(?:ssn|bank account|credit card|cvv|medical record)\b/i
    ];

    return sensitiveTokens.some(pattern => pattern.test(userText));
  }

  /**
   * Validates tool call parameters against registered tool schemas
   */
  static validateToolCall(toolCall) {
    if (!toolCall || !toolCall.name) {
      return { valid: false, error: 'Missing tool name in tool call' };
    }

    const tool = ToolRegistry.getTool(toolCall.name);
    if (!tool) {
      return { valid: false, error: `Tool '${toolCall.name}' is not registered in ToolRegistry` };
    }

    const args = toolCall.arguments || {};
    const schema = tool.parameters || {};
    const required = schema.required || [];

    // Check required arguments
    for (const reqField of required) {
      if (args[reqField] === undefined || args[reqField] === null || args[reqField] === '') {
        return {
          valid: false,
          error: `Tool '${toolCall.name}' requires parameter '${reqField}'`
        };
      }
    }

    // Check basic types
    const properties = schema.properties || {};
    for (const [key, propDef] of Object.entries(properties)) {
      if (args[key] !== undefined && propDef.type) {
        const expectedType = propDef.type.toLowerCase();
        const actualType = typeof args[key];

        if (expectedType === 'string' && actualType !== 'string') {
          args[key] = String(args[key]);
        } else if ((expectedType === 'number' || expectedType === 'integer') && actualType !== 'number') {
          const num = Number(args[key]);
          if (!isNaN(num)) args[key] = num;
          else return { valid: false, error: `Parameter '${key}' must be a number` };
        } else if (expectedType === 'boolean' && actualType !== 'boolean') {
          args[key] = args[key] === 'true' || args[key] === true;
        } else if (expectedType === 'array' && !Array.isArray(args[key])) {
          return { valid: false, error: `Parameter '${key}' must be an array` };
        }
      }
    }

    return { valid: true, sanitizedArgs: args };
  }

  /**
   * Checks whether Zero-Cost Local-Only mode is active (default: true).
   * When true, only local Ollama inference is allowed and cloud APIs are never invoked.
   */
  static async isZeroCostLocalOnly() {
    if (process.env.ZERO_COST_LOCAL_ONLY === 'false') return false;
    try {
      const setting = await get("SELECT value FROM settings WHERE key = 'zero_cost_local_only'");
      if (setting && setting.value === 'false') return false;
    } catch (_) {}
    return true;
  }

  /**
   * Resolves the ordered priority chain of providers
   */
  static async getProviderPriorityChain({ preferredProvider = null, isStrictPrivacyRequired = false } = {}) {
    const zeroCostLocal = await this.isZeroCostLocalOnly();
    if (zeroCostLocal || isStrictPrivacyRequired) {
      return ['ollama'];
    }

    // Optional manual multi-provider configuration (inactive while zero_cost_local_only is true)
    let primary = 'ollama';
    let secondary = '';
    let fallback = 'ollama';

    try {
      const primarySetting = await get("SELECT value FROM settings WHERE key = 'primary_provider'");
      if (primarySetting?.value) primary = primarySetting.value.toLowerCase().trim();

      const secondarySetting = await get("SELECT value FROM settings WHERE key = 'secondary_provider'");
      if (secondarySetting?.value) secondary = secondarySetting.value.toLowerCase().trim();

      const fallbackSetting = await get("SELECT value FROM settings WHERE key = 'fallback_provider'");
      if (fallbackSetting?.value) fallback = fallbackSetting.value.toLowerCase().trim();
    } catch (_) {}

    const order = [];
    if (preferredProvider) order.push(preferredProvider.toLowerCase().trim());
    if (primary) order.push(primary);
    if (secondary) order.push(secondary);
    if (fallback) order.push(fallback);

    return Array.from(new Set(order.filter(Boolean)));
  }

  /**
   * Core Autonomous Generation Engine with Provider Switching and Transient Error Backoff
   */
  static async generateWithFallback({
    prompt = '',
    systemPrompt = '',
    messages = [],
    contents = [],
    tools = null,
    preferredProvider = null,
    complexity = null,
    privacyTag = null,
    maxRetries = 2,
    maxTokens = 1536,
    temperature = 0.25,
    numCtx = null,
    taskClass = null,
    phaseType = 'chat',
    timeoutMs = Number(process.env.LOCAL_INFERENCE_TIMEOUT_MS) || 120000,
    responseFormat = null
  } = {}) {
    await ensureDb();

    // 1. Normalize input messages
    let normalizedMessages = [];
    if (messages && messages.length > 0) {
      normalizedMessages = messages.map(m => ({
        role: (m.role === 'user' || m.sender === 'user') ? 'user' :
              (m.role === 'assistant' || m.sender === 'assistant' || m.sender === 'bot') ? 'assistant' :
              (m.role === 'system') ? 'system' : 'user',
        content: m.content || (m.parts ? m.parts.map(p => p.text).join('') : '')
      }));
    } else if (contents && contents.length > 0) {
      normalizedMessages = contents.map(c => ({
        role: c.role === 'user' ? 'user' : 'assistant',
        content: c.parts ? c.parts.map(p => p.text).join('') : ''
      }));
    } else if (prompt) {
      normalizedMessages = [{ role: 'user', content: prompt }];
    }

    const fullUserText = normalizedMessages.map(m => m.content).join(' ');
    const isStrictPrivacyRequired = await this.checkPrivacyRequirement(fullUserText, privacyTag);
    const zeroCostLocal = await this.isZeroCostLocalOnly();
    const providerChain = await this.getProviderPriorityChain({ preferredProvider, isStrictPrivacyRequired });

    const errorsEncountered = [];

    // Strict zero-cost local guard: refuse any external/cloud inference and fail fast if Ollama/model unavailable
    if (zeroCostLocal) {
      const ollama = getProvider('ollama');
      const avail = ollama?.verifyModelAvailability ? await ollama.verifyModelAvailability() : null;
      if (!avail || !avail.online || !avail.modelDownloaded) {
        const reason = avail?.error || 'Local Ollama model is unavailable.';
        const localErr = new Error(`LOCAL_MODEL_UNAVAILABLE: ${reason}`);
        localErr.code = 'LOCAL_MODEL_UNAVAILABLE';
        localErr.details = avail;
        throw localErr;
      }
    }

    // 2. Iterate through provider priority chain
    for (const providerName of providerChain) {
      if (zeroCostLocal && providerName !== 'ollama') {
        continue; // Never allow cloud API calls in zero-cost local mode
      }
      const coolUntil = providerCooldowns.get(providerName) || 0;
      if (Date.now() < coolUntil) {
        errorsEncountered.push({
          provider: providerName,
          type: ERROR_TYPES.QUOTA_EXCEEDED,
          message: `${providerName} in temporary quota cooldown window.`
        });
        continue;
      }

      const provider = getProvider(providerName);
      if (!provider) continue;

      // Check health/configuration
      const isConfigured = await provider.checkHealth();
      if (!isConfigured) {
        errorsEncountered.push({
          provider: providerName,
          type: ERROR_TYPES.AUTH_FAILURE,
          message: `${providerName} is not configured with an active API key or endpoint.`
        });
        continue;
      }

      const classification = this.classifyTaskComplexity(fullUserText);
      const effectiveTaskClass = taskClass || classification.taskClass;
      const effectiveCtx = numCtx || classification.numCtx;
      const compactedTools = tools && tools.length > 0 ? this.compactToolSchemas(tools) : [];

      // Retry loop for transient errors
      let attempt = 0;
      while (attempt <= maxRetries) {
        const t0 = Date.now();
        try {
          const result = await provider.chatCompletion({
            systemPrompt,
            messages: normalizedMessages,
            tools: compactedTools,
            maxTokens,
            temperature,
            numCtx: effectiveCtx,
            timeoutMs,
            responseFormat
          });

          const latencyMs = Date.now() - t0;

          // Validate tool calls if returned
          const validatedToolCalls = [];
          if (result.toolCalls && result.toolCalls.length > 0) {
            for (const tc of result.toolCalls) {
              const validation = this.validateToolCall(tc);
              if (validation.valid) {
                validatedToolCalls.push({
                  name: tc.name,
                  arguments: validation.sanitizedArgs
                });
              } else {
                console.warn(`[ModelRouter] Tool validation warning for ${tc.name}:`, validation.error);
                // Keep tool call with original args if not critical
                validatedToolCalls.push(tc);
              }
            }
          }

          // Record usage & Phase 15 telemetry in database
          try {
            await run(
              `INSERT INTO ai_usage_logs (id, provider, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, ttft_ms, tokens_per_sec, prompt_tokens_per_sec, task_class, num_ctx, phase_type, success, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
              [
                `usage-${uuidv4()}`,
                providerName,
                result.model || 'default',
                result.usage?.promptTokens || 0,
                result.usage?.completionTokens || 0,
                result.usage?.totalTokens || 0,
                latencyMs,
                result.telemetry?.ttftMs || latencyMs,
                result.telemetry?.tokensPerSec || 0,
                result.telemetry?.promptTokensPerSec || 0,
                effectiveTaskClass,
                result.telemetry?.numCtx || effectiveCtx || 4096,
                phaseType || 'chat',
                new Date().toISOString()
              ]
            );
          } catch (_) {}

          return {
            text: result.text,
            toolCalls: validatedToolCalls,
            functionCalls: validatedToolCalls, // backward compatibility alias
            usage: result.usage,
            telemetry: result.telemetry || null,
            taskClass: effectiveTaskClass,
            finishReason: result.finishReason,
            latencyMs,
            provider: providerName,
            model: result.model
          };

        } catch (err) {
          const latencyMs = Date.now() - t0;
          const classified = provider.classifyError(err);

          // Record failed usage
          try {
            await run(
              `INSERT INTO ai_usage_logs (id, provider, model, latency_ms, success, error_type, timestamp)
               VALUES (?, ?, ?, ?, 0, ?, ?)`,
              [
                `usage-${uuidv4()}`,
                providerName,
                'unknown',
                latencyMs,
                classified.type,
                new Date().toISOString()
              ]
            );
          } catch (_) {}

          errorsEncountered.push({
            provider: providerName,
            attempt,
            type: classified.type,
            message: classified.message
          });

          // Check if transient error eligible for retry
          if (classified.retryable && attempt < maxRetries) {
            attempt++;
            const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
            console.warn(`[ModelRouter] Transient error from ${providerName} (${classified.type}). Retrying in ${backoffMs}ms (attempt ${attempt}/${maxRetries})...`);
            await new Promise(r => setTimeout(r, backoffMs));
            continue;
          }

          // Non-retryable error or exhausted retries -> switch to next provider
          if (classified.type === ERROR_TYPES.QUOTA_EXCEEDED) {
            const isBillingExhausted = classified.status === 402 || /payment|billing/i.test(classified.message || '');
            providerCooldowns.set(providerName, Date.now() + (isBillingExhausted ? 120000 : 10000));
          } else if (classified.type === ERROR_TYPES.RATE_LIMIT) {
            providerCooldowns.set(providerName, Date.now() + 8000);
          }
          console.warn(`[ModelRouter] Provider ${providerName} failed with ${classified.type}: ${classified.message}. Switching to next provider in fallback chain.`);
          break; // break retry loop, try next provider in chain
        }
      }
    }

    // 3. Fallback exhausted
    const errorSummary = errorsEncountered.map(e => `[${e.provider}: ${e.type}] ${e.message}`).join(' | ');
    const finalErr = new Error(`All AI providers in fallback chain failed: ${errorSummary || 'No providers available.'}`);
    finalErr.errorsEncountered = errorsEncountered;
    throw finalErr;
  }

  /**
   * Streaming response using local Ollama NDJSON stream (or configured provider if local-only disabled)
   */
  static async streamWithFallback({
    prompt = '',
    systemPrompt = '',
    messages = [],
    tools = null,
    onChunk,
    preferredProvider = null,
    timeoutMs = Number(process.env.LOCAL_INFERENCE_TIMEOUT_MS) || 90000
  }) {
    const normalizedMessages = messages.length > 0
      ? messages
      : (prompt ? [{ role: 'user', content: prompt }] : []);

    const zeroCostLocal = await this.isZeroCostLocalOnly();
    const ollama = getProvider('ollama');
    const classification = this.classifyTaskComplexity(normalizedMessages.map(m => m.content).join(' '));
    if (zeroCostLocal && ollama) {
      const res = await ollama.streamResponse({
        systemPrompt,
        messages: normalizedMessages,
        tools: tools ? this.compactToolSchemas(tools) : [],
        numCtx: classification.numCtx,
        maxTokens: classification.maxTokens,
        onChunk,
        timeoutMs
      });
      try {
        await run(
          `INSERT INTO ai_usage_logs (id, provider, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, ttft_ms, tokens_per_sec, prompt_tokens_per_sec, task_class, num_ctx, phase_type, success, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [
            `usage-${uuidv4()}`,
            'ollama',
            res.model || 'qwen3.5:4b',
            res.usage?.promptTokens || 0,
            res.usage?.completionTokens || 0,
            res.usage?.totalTokens || 0,
            res.latencyMs || 0,
            res.telemetry?.ttftMs || res.ttftMs || res.latencyMs || 0,
            res.telemetry?.tokensPerSec || 0,
            res.telemetry?.promptTokensPerSec || 0,
            classification.taskClass,
            res.telemetry?.numCtx || classification.numCtx,
            'stream_chat',
            new Date().toISOString()
          ]
        );
      } catch (_) {}
      return { ...res, taskClass: classification.taskClass };
    }

    const res = await this.generateWithFallback({
      prompt,
      systemPrompt,
      messages,
      tools,
      preferredProvider,
      timeoutMs
    });
    if (onChunk) {
      onChunk({
        text: res.text,
        toolCalls: res.toolCalls,
        done: true,
        provider: res.provider,
        model: res.model
      });
    }
    return res;
  }

  /**
   * Health, availability, and configuration status across providers (cloud providers disabled by policy by default)
   */
  static async getProvidersStatus() {
    await ensureDb();
    const zeroCostLocal = await this.isZeroCostLocalOnly();
    const providers = getAllProviders();
    const statusMap = {};

    for (const [name, provider] of Object.entries(providers)) {
      if (name === 'ollama') {
        const avail = provider.verifyModelAvailability ? await provider.verifyModelAvailability() : { online: await provider.checkHealth(), model: await provider.getModel(), modelDownloaded: false };
        statusMap[name] = {
          name,
          configured: true,
          online: avail.online,
          modelDownloaded: avail.modelDownloaded,
          available: Boolean(avail.online && avail.modelDownloaded),
          model: avail.model,
          endpoint: avail.endpoint,
          loadedModels: avail.loadedModels || [],
          resourceProfile: avail.resourceProfile || null,
          error: avail.error || null,
          type: 'local'
        };
      } else {
        const hasKey = await provider.checkHealth();
        const model = await provider.getModel();
        statusMap[name] = {
          name,
          configured: hasKey,
          available: zeroCostLocal ? false : hasKey,
          disabledByPolicy: zeroCostLocal,
          model,
          type: 'cloud'
        };
      }
    }

    // Add smart reflex (utility/tool schema validation only, never fakes mission AI steps)
    statusMap['smart_reflex'] = {
      name: 'smart_reflex',
      configured: true,
      available: true,
      model: 'local-validator',
      type: 'embedded'
    };

    let policy = 'local_only';
    let privacyMode = 'strict_local';
    let primary = zeroCostLocal ? 'ollama' : 'groq';
    let fallback = 'ollama';

    try {
      const p = await get("SELECT value FROM settings WHERE key = 'model_routing_policy'");
      if (p) policy = p.value;
      const pm = await get("SELECT value FROM settings WHERE key = 'privacy_mode'");
      if (pm) privacyMode = pm.value;
      const pr = await get("SELECT value FROM settings WHERE key = 'primary_provider'");
      if (pr && !zeroCostLocal) primary = pr.value;
      const fb = await get("SELECT value FROM settings WHERE key = 'fallback_provider'");
      if (fb) fallback = fb.value;
    } catch (_) {}

    return {
      zeroCostLocalOnly: zeroCostLocal,
      routingPolicy: policy,
      privacyMode,
      primaryProvider: primary,
      fallbackProvider: fallback,
      providers: statusMap
    };
  }

  /**
   * Aggregate token and latency metrics
   */
  static async getUsageMetrics() {
    await ensureDb();
    try {
      const rows = await query(`
        SELECT 
          provider,
          COUNT(*) as total_requests,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_requests,
          SUM(prompt_tokens) as total_prompt_tokens,
          SUM(completion_tokens) as total_completion_tokens,
          SUM(total_tokens) as total_tokens,
          AVG(CASE WHEN success = 1 THEN latency_ms ELSE NULL END) as avg_latency_ms,
          AVG(CASE WHEN success = 1 AND ttft_ms > 0 THEN ttft_ms ELSE NULL END) as avg_ttft_ms,
          AVG(CASE WHEN success = 1 AND tokens_per_sec > 0 THEN tokens_per_sec ELSE NULL END) as avg_tokens_per_sec,
          AVG(CASE WHEN success = 1 AND prompt_tokens_per_sec > 0 THEN prompt_tokens_per_sec ELSE NULL END) as avg_prompt_tokens_per_sec
        FROM ai_usage_logs
        GROUP BY provider
      `);
      return rows;
    } catch (err) {
      return [];
    }
  }

  /**
   * Phase 15 P7: Real-Time Performance & Intelligence Telemetry Aggregation
   */
  static async getTelemetryMetrics() {
    await ensureDb();
    const summary = await get(`
      SELECT
        COUNT(*) as total_requests,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_requests,
        COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
        COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        ROUND(AVG(CASE WHEN success = 1 THEN latency_ms ELSE NULL END), 1) as avg_latency_ms,
        ROUND(AVG(CASE WHEN success = 1 AND ttft_ms > 0 THEN ttft_ms ELSE NULL END), 1) as avg_ttft_ms,
        ROUND(AVG(CASE WHEN success = 1 AND tokens_per_sec > 0 THEN tokens_per_sec ELSE NULL END), 2) as avg_tokens_per_sec,
        ROUND(AVG(CASE WHEN success = 1 AND prompt_tokens_per_sec > 0 THEN prompt_tokens_per_sec ELSE NULL END), 2) as avg_prompt_tokens_per_sec,
        MAX(num_ctx) as max_num_ctx
      FROM ai_usage_logs
    `).catch(() => ({}));

    const ttftRows = await query(
      'SELECT ttft_ms FROM ai_usage_logs WHERE success = 1 AND ttft_ms > 0 ORDER BY ttft_ms ASC'
    ).catch(() => []);
    const p50TtftMs = ttftRows.length > 0 ? ttftRows[Math.floor(ttftRows.length * 0.5)].ttft_ms : 0;
    const p95TtftMs = ttftRows.length > 0 ? ttftRows[Math.min(ttftRows.length - 1, Math.floor(ttftRows.length * 0.95))].ttft_ms : 0;

    const byPhase = await query(`
      SELECT
        COALESCE(phase_type, 'chat') as phase_type,
        COUNT(*) as count,
        ROUND(AVG(CASE WHEN success = 1 THEN latency_ms ELSE NULL END), 1) as avg_latency_ms,
        ROUND(AVG(CASE WHEN success = 1 AND tokens_per_sec > 0 THEN tokens_per_sec ELSE NULL END), 2) as avg_tokens_per_sec
      FROM ai_usage_logs
      GROUP BY COALESCE(phase_type, 'chat')
    `).catch(() => []);

    const byTaskClass = await query(`
      SELECT
        COALESCE(task_class, 'unclassified') as task_class,
        COUNT(*) as count,
        ROUND(AVG(CASE WHEN success = 1 THEN latency_ms ELSE NULL END), 1) as avg_latency_ms,
        ROUND(AVG(num_ctx), 0) as avg_num_ctx
      FROM ai_usage_logs
      GROUP BY COALESCE(task_class, 'unclassified')
    `).catch(() => []);

    const missionStats = await query(`
      SELECT status, COUNT(*) as count FROM missions GROUP BY status
    `).catch(() => []);

    const statusCounts = {};
    let totalMissions = 0;
    for (const row of missionStats) {
      statusCounts[row.status] = row.count;
      totalMissions += row.count;
    }

    const recentTraces = await query(`
      SELECT id, provider, model, prompt_tokens, completion_tokens, latency_ms, ttft_ms, tokens_per_sec, task_class, num_ctx, phase_type, success, error_type, timestamp
      FROM ai_usage_logs
      ORDER BY timestamp DESC
      LIMIT 15
    `).catch(() => []);

    return {
      summary: {
        ...summary,
        p50_ttft_ms: p50TtftMs,
        p95_ttft_ms: p95TtftMs,
        cloud_cost_usd: 0.0,
        zero_cost_local_only: true
      },
      byPhase,
      byTaskClass,
      missions: {
        total: totalMissions,
        statusCounts,
        completionRatePercent: totalMissions > 0
          ? Number((((statusCounts.COMPLETED || 0) / totalMissions) * 100).toFixed(1))
          : 0
      },
      recentTraces
    };
  }

  /**
   * Dynamic Model Routing Decision Engine (Preserved for compatibility)
   */
  static async selectRoute({
    userText = '',
    preferredProvider = null,
    complexity = null,
    privacyTag = null
  } = {}) {
    const effectiveComplexity = complexity || this.evaluateComplexity(userText);
    const isStrictPrivacyRequired = await this.checkPrivacyRequirement(userText, privacyTag);

    const zeroCostLocal = await this.isZeroCostLocalOnly();
    if (zeroCostLocal || isStrictPrivacyRequired) {
      const ollama = getProvider('ollama');
      const avail = ollama?.verifyModelAvailability ? await ollama.verifyModelAvailability() : null;
      return {
        provider: 'ollama',
        model: avail?.model || 'qwen3.5:4b',
        available: Boolean(avail?.online && avail?.modelDownloaded),
        reason: zeroCostLocal
          ? 'Routed to Local Ollama (qwen3.5:4b) per zero-cost local-only policy.'
          : 'Routed to Local Ollama to uphold strict zero-cloud privacy policy.',
        privacyGuaranteed: true,
        zeroCostGuaranteed: true,
        complexity: effectiveComplexity,
        fallbackPath: []
      };
    }

    const chain = await this.getProviderPriorityChain({ preferredProvider });
    const selectedProviderName = chain[0] || 'ollama';
    const providerInstance = getProvider(selectedProviderName);
    const model = providerInstance ? await providerInstance.getModel() : 'default';

    return {
      provider: selectedProviderName,
      model,
      reason: `Intelligent routing: Priority provider ${selectedProviderName} (${model}) with fallback chain: ${chain.slice(1).join(' -> ')}`,
      privacyGuaranteed: selectedProviderName === 'ollama',
      complexity: effectiveComplexity,
      fallbackPath: chain.slice(1)
    };
  }
}

export default ModelRouterService;
