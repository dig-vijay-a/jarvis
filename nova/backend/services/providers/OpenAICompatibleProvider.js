import https from 'https';
import tls from 'tls';
import axios from 'axios';
import BaseProvider from './BaseProvider.js';
import { get } from '../../database/db.js';
import { decryptData } from '../../security/cryptoUtils.js';

const systemCaAgent = typeof tls.getCACertificates === 'function'
  ? new https.Agent({ ca: [...tls.rootCertificates, ...tls.getCACertificates('system')] })
  : undefined;

export class OpenAICompatibleProvider extends BaseProvider {
  constructor(name, { baseUrl, defaultModel, keySetting, envVar, customHeaders = {} }) {
    super(name);
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultModel = defaultModel;
    this.keySetting = keySetting;
    this.envVar = envVar;
    this.customHeaders = customHeaders;
  }

  async getApiKey() {
    try {
      if (this.keySetting) {
        const setting = await get(`SELECT value FROM settings WHERE key = ?`, [this.keySetting]);
        if (setting && setting.value) {
          return decryptData(setting.value).trim();
        }
      }
    } catch (_) {}
    return (process.env[this.envVar] || '').trim();
  }

  async getModel() {
    try {
      const setting = await get(`SELECT value FROM settings WHERE key = ?`, [`${this.name}_model`]);
      if (setting && setting.value) return setting.value.trim();
    } catch (_) {}
    return this.defaultModel;
  }

  async checkHealth() {
    const key = await this.getApiKey();
    return !!key;
  }

  async testConnection() {
    const t0 = Date.now();
    try {
      const res = await this.chatCompletion({
        systemPrompt: 'You are JARVIS diagnostic testing probe.',
        messages: [{ role: 'user', content: 'Respond with 3 words: Diagnostic online verified.' }],
        maxTokens: 30,
        timeoutMs: 12000
      });
      return {
        success: true,
        provider: this.name,
        model: res.model,
        latencyMs: Date.now() - t0,
        message: res.text
      };
    } catch (err) {
      const classified = this.classifyError(err);
      return {
        success: false,
        provider: this.name,
        latencyMs: Date.now() - t0,
        error: classified.message,
        errorType: classified.type
      };
    }
  }

  /**
   * Translates common tools schema to OpenAI functions array
   */
  formatTools(tools = []) {
    if (!tools || tools.length === 0) return undefined;

    const sanitizeSchema = (schema) => {
      if (!schema || typeof schema !== 'object') return schema;
      const copy = Array.isArray(schema) ? [...schema] : { ...schema };
      if (typeof copy.type === 'string') {
        copy.type = copy.type.toLowerCase();
      }
      if (copy.properties && typeof copy.properties === 'object') {
        const newProps = {};
        for (const [k, v] of Object.entries(copy.properties)) {
          newProps[k] = sanitizeSchema(v);
        }
        copy.properties = newProps;
      }
      if (copy.items && typeof copy.items === 'object') {
        copy.items = sanitizeSchema(copy.items);
      }
      return copy;
    };

    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: sanitizeSchema(t.parameters) || { type: 'object', properties: {} }
      }
    }));
  }

  /**
   * Translates messages into OpenAI roles
   */
  formatMessages(messages = [], systemPrompt = '') {
    const formatted = [];
    if (systemPrompt) {
      formatted.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      const role = (msg.role === 'user' || msg.sender === 'user') ? 'user' :
                   (msg.role === 'assistant' || msg.sender === 'assistant' || msg.sender === 'bot') ? 'assistant' :
                   (msg.role === 'system') ? 'system' : 'user';
      formatted.push({
        role,
        content: msg.content || (msg.parts ? msg.parts.map(p => p.text).join('') : '')
      });
    }

    if (formatted.length === 0 || (formatted.length === 1 && formatted[0].role === 'system')) {
      formatted.push({ role: 'user', content: 'Hello' });
    }

    return formatted;
  }

  async chatCompletion({
    systemPrompt = '',
    messages = [],
    tools = [],
    temperature = 0.3,
    maxTokens = 2048,
    responseFormat = null,
    timeoutMs = 35000
  }) {
    const apiKey = await this.getApiKey();
    if (!apiKey && this.keySetting) {
      const err = new Error(`${this.name} API key is not configured.`);
      err.status = 401;
      throw err;
    }

    const model = await this.getModel();
    const formattedMessages = this.formatMessages(messages, systemPrompt);
    const formattedTools = this.formatTools(tools);

    const requestBody = {
      model,
      messages: formattedMessages,
      temperature,
      max_tokens: maxTokens
    };

    if (responseFormat?.type === 'json_object') {
      requestBody.response_format = { type: 'json_object' };
    }

    if (formattedTools && formattedTools.length > 0) {
      requestBody.tools = formattedTools;
      requestBody.tool_choice = 'auto';
    }

    const headers = {
      'Content-Type': 'application/json',
      ...this.customHeaders
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const t0 = Date.now();
    const candidateModels = [model, ...(this.supportedModels || []).filter(m => m !== model)];
    let lastErr = null;
    for (const candidateModel of candidateModels) {
      requestBody.model = candidateModel;
      try {
        const response = await axios.post(`${this.baseUrl}/chat/completions`, requestBody, {
          headers,
          timeout: timeoutMs,
          httpsAgent: systemCaAgent
        });

        const latencyMs = Date.now() - t0;
        const choice = response.data?.choices?.[0];
        if (!choice) {
          throw new Error(`Empty completion received from ${this.name}.`);
        }

        const msg = choice.message || {};
        const textResponse = msg.content || '';
        const toolCalls = [];

        if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
          for (const tc of msg.tool_calls) {
            let parsedArgs = {};
            try {
              parsedArgs = typeof tc.function?.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : (tc.function?.arguments || {});
            } catch (_) {
              parsedArgs = { raw: tc.function?.arguments };
            }
            toolCalls.push({
              name: tc.function?.name,
              arguments: parsedArgs
            });
          }
        }

        const usageData = response.data?.usage || {};
        const usage = {
          promptTokens: usageData.prompt_tokens || this.estimateTokens(JSON.stringify(formattedMessages)),
          completionTokens: usageData.completion_tokens || this.estimateTokens(textResponse),
          totalTokens: usageData.total_tokens || 0
        };
        if (!usage.totalTokens) usage.totalTokens = usage.promptTokens + usage.completionTokens;

        return {
          text: textResponse.trim(),
          toolCalls,
          usage,
          finishReason: choice.finish_reason || 'stop',
          latencyMs,
          provider: this.name,
          model: candidateModel
        };
      } catch (err) {
        lastErr = err;
        const st = err.response?.status;
        if ((st === 404 || st === 400) && candidateModel !== candidateModels[candidateModels.length - 1]) {
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  async streamResponse({ systemPrompt, messages, tools, onChunk, timeoutMs = 35000 }) {
    const res = await this.chatCompletion({ systemPrompt, messages, tools, timeoutMs });
    if (onChunk) {
      onChunk({ text: res.text, done: true, toolCalls: res.toolCalls, usage: res.usage });
    }
    return res;
  }
}

export default OpenAICompatibleProvider;
