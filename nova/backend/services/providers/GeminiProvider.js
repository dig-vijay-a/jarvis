import https from 'https';
import tls from 'tls';
import axios from 'axios';
import BaseProvider, { ERROR_TYPES } from './BaseProvider.js';
import { get } from '../../database/db.js';
import { decryptData } from '../../security/cryptoUtils.js';

const systemCaAgent = typeof tls.getCACertificates === 'function'
  ? new https.Agent({ ca: [...tls.rootCertificates, ...tls.getCACertificates('system')] })
  : undefined;

export class GeminiProvider extends BaseProvider {
  constructor(options = {}) {
    super('gemini', options);
    this.defaultModel = options.defaultModel || 'gemini-flash-latest';
    this.fallbackModels = ['gemini-flash-latest', 'gemini-3-flash-preview', 'gemini-3.8-flash'];
  }

  async getApiKey() {
    try {
      const setting = await get("SELECT value FROM settings WHERE key = 'gemini_api_key'");
      if (setting && setting.value) {
        return decryptData(setting.value).trim();
      }
    } catch (_) {}
    return (process.env.GEMINI_API_KEY || '').trim();
  }

  async getModel() {
    try {
      const setting = await get("SELECT value FROM settings WHERE key = 'gemini_model'");
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
        systemPrompt: 'Respond in 3 words: Diagnostic ping successful.',
        messages: [{ role: 'user', content: 'Ping' }],
        timeoutMs: 10000
      });
      return {
        success: true,
        provider: 'gemini',
        model: res.model,
        latencyMs: Date.now() - t0,
        message: res.text
      };
    } catch (err) {
      const classified = this.classifyError(err);
      return {
        success: false,
        provider: 'gemini',
        latencyMs: Date.now() - t0,
        error: classified.message,
        errorType: classified.type
      };
    }
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
    if (!apiKey) {
      const err = new Error('Gemini API key is not configured.');
      err.status = 401;
      throw err;
    }

    const model = await this.getModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const t0 = Date.now();

    // Format contents
    const contents = messages.map(msg => ({
      role: (msg.role === 'user' || msg.sender === 'user') ? 'user' : 'model',
      parts: msg.parts || [{ text: msg.content || '' }]
    }));

    // If messages was empty, add dummy prompt
    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    const requestBody = {
      contents,
      systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens
      }
    };

    if (responseFormat?.type === 'json_object') {
      requestBody.generationConfig.responseMimeType = 'application/json';
    }

    if (tools && tools.length > 0) {
      requestBody.tools = [{
        functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }))
      }];
    }

    const candidateModels = [model, ...(this.fallbackModels || []).filter(m => m !== model)];
    let lastErr = null;
    for (const candidateModel of candidateModels) {
      const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${apiKey}`;
      try {
        const response = await axios.post(targetUrl, requestBody, {
          headers: { 'Content-Type': 'application/json' },
          timeout: timeoutMs,
          httpsAgent: systemCaAgent
        });

        const latencyMs = Date.now() - t0;
        const candidate = response.data?.candidates?.[0];
        if (!candidate) {
          throw new Error('No candidate received from Gemini.');
        }

        const parts = candidate.content?.parts || [];
        let textResponse = '';
        const toolCalls = [];

        for (const part of parts) {
          if (part.text) textResponse += part.text;
          if (part.functionCall) {
            toolCalls.push({
              name: part.functionCall.name,
              arguments: part.functionCall.args || {}
            });
          }
        }

        const usageMeta = response.data?.usageMetadata || {};
        const usage = {
          promptTokens: usageMeta.promptTokenCount || this.estimateTokens(systemPrompt + JSON.stringify(messages)),
          completionTokens: usageMeta.candidatesTokenCount || this.estimateTokens(textResponse),
          totalTokens: usageMeta.totalTokenCount || 0
        };
        if (!usage.totalTokens) usage.totalTokens = usage.promptTokens + usage.completionTokens;

        return {
          text: textResponse.trim(),
          toolCalls,
          usage,
          finishReason: candidate.finishReason || 'STOP',
          latencyMs,
          provider: 'gemini',
          model: candidateModel
        };
      } catch (err) {
        lastErr = err;
        const st = err.response?.status;
        if ((st === 404 || st === 503) && candidateModel !== candidateModels[candidateModels.length - 1]) {
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  async streamResponse({ systemPrompt, messages, tools, onChunk, timeoutMs = 35000 }) {
    // For non-streaming fallback, invoke chatCompletion and emit chunk
    const res = await this.chatCompletion({ systemPrompt, messages, tools, timeoutMs });
    if (onChunk) {
      onChunk({ text: res.text, done: true, toolCalls: res.toolCalls, usage: res.usage });
    }
    return res;
  }
}

export default GeminiProvider;
