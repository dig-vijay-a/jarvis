/**
 * JARVIS OS 2.0 — Base AI Provider Interface
 * Unified contract for multi-provider intelligence routing.
 */

export const ERROR_TYPES = {
  RATE_LIMIT: 'RATE_LIMIT',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  AUTH_FAILURE: 'AUTH_FAILURE',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  INVALID_REQUEST: 'INVALID_REQUEST',
  TOOL_CALL_FAILURE: 'TOOL_CALL_FAILURE',
  UNKNOWN: 'UNKNOWN'
};

export class BaseProvider {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
  }

  /**
   * Primary Chat Completion interface
   * @param {Object} params
   * @param {string} params.systemPrompt
   * @param {Array} params.messages - [{ role: 'user'|'assistant'|'system', content: string }]
   * @param {Array} params.tools - Tools registered in ToolRegistry
   * @param {number} params.temperature
   * @param {number} params.maxTokens
   * @param {Object} params.responseFormat - e.g. { type: 'json_object' }
   * @param {number} params.timeoutMs
   * @returns {Promise<{ text: string, toolCalls: Array, usage: Object, finishReason: string, latencyMs: number, provider: string, model: string }>}
   */
  async chatCompletion(params) {
    throw new Error(`chatCompletion() not implemented on ${this.name}`);
  }

  /**
   * Streaming response interface
   */
  async streamResponse(params, onChunk) {
    throw new Error(`streamResponse() not implemented on ${this.name}`);
  }

  /**
   * Quick connection diagnostic test
   */
  async testConnection() {
    throw new Error(`testConnection() not implemented on ${this.name}`);
  }

  /**
   * Health and model availability check
   */
  async checkHealth() {
    throw new Error(`checkHealth() not implemented on ${this.name}`);
  }

  /**
   * Standardizes error classification across all provider error schemas
   */
  classifyError(error) {
    if (!error) return { type: ERROR_TYPES.UNKNOWN, message: 'Unknown error', retryable: false };

    const status = error.status || error.statusCode || error.response?.status;
    const msg = (error.response?.data?.error?.message || error.response?.data?.message || error.message || '').toLowerCase();
    const code = (error.code || error.response?.data?.error?.code || '').toLowerCase();

    // 1. RATE LIMIT & QUOTA
    if (status === 429) {
      if (msg.includes('quota') || msg.includes('credit') || msg.includes('billing') || msg.includes('exceeded your current quota')) {
        return { type: ERROR_TYPES.QUOTA_EXCEEDED, message: 'Provider quota or credit limit exhausted', retryable: false, status };
      }
      return { type: ERROR_TYPES.RATE_LIMIT, message: 'Rate limit hit (RPM/TPM)', retryable: true, status };
    }

    if (status === 402) {
      return { type: ERROR_TYPES.QUOTA_EXCEEDED, message: 'Payment required / quota exhausted', retryable: false, status };
    }

    // 2. AUTHENTICATION FAILURE
    if (status === 401 || status === 403 || msg.includes('invalid api key') || msg.includes('unauthorized') || msg.includes('forbidden')) {
      return { type: ERROR_TYPES.AUTH_FAILURE, message: 'Authentication failed. Check API key credentials.', retryable: false, status };
    }

    // 3. MODEL UNAVAILABLE
    if (
      status === 404 ||
      status === 503 ||
      msg.includes('model not found') ||
      (msg.includes('model') && msg.includes('not found')) ||
      msg.includes('does not exist') ||
      msg.includes('overloaded') ||
      msg.includes('local_model_unavailable') ||
      msg.includes('not downloaded') ||
      code === 'econnrefused'
    ) {
      return { type: ERROR_TYPES.MODEL_UNAVAILABLE, message: msg || 'Model or service temporarily unavailable', retryable: status === 503, status };
    }

    // 4. NETWORK TIMEOUT & DNS / CONNECTION ERRORS
    if (
      code === 'econnaborted' ||
      code === 'etimedout' ||
      code === 'econnreset' ||
      code === 'enotfound' ||
      code === 'eai_again' ||
      msg.includes('timeout') ||
      msg.includes('socket hang up') ||
      msg.includes('getaddrinfo') ||
      msg.includes('enotfound')
    ) {
      return {
        type: ERROR_TYPES.NETWORK_TIMEOUT,
        message: code === 'enotfound' || code === 'eai_again' ? `DNS resolution failed (${code})` : 'Network connection failed or timed out',
        retryable: true,
        status: status || 408
      };
    }

    // 5. INVALID REQUEST
    if (status === 400 || status === 422 || msg.includes('bad request') || msg.includes('validation error')) {
      return { type: ERROR_TYPES.INVALID_REQUEST, message: `Invalid API payload: ${msg}`, retryable: false, status };
    }

    // Default unknown error
    return { type: ERROR_TYPES.UNKNOWN, message: msg || 'Unexpected provider error', retryable: false, status };
  }

  /**
   * Helper to estimate token counts if provider omits usage
   */
  estimateTokens(text = '') {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }
}

export default BaseProvider;
