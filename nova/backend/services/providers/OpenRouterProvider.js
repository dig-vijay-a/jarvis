import OpenAICompatibleProvider from './OpenAICompatibleProvider.js';

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(options = {}) {
    super('openrouter', {
      baseUrl: options.baseUrl || 'https://openrouter.ai/api/v1',
      defaultModel: options.defaultModel || 'meta-llama/llama-3.3-70b-instruct',
      keySetting: 'openrouter_api_key',
      envVar: 'OPENROUTER_API_KEY',
      customHeaders: {
        'HTTP-Referer': 'http://localhost:5000',
        'X-Title': 'JARVIS OS 2.0'
      },
      ...options
    });
    this.supportedModels = [
      'meta-llama/llama-3.3-70b-instruct',
      'deepseek/deepseek-r1',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.0-flash-001',
      'mistralai/mistral-large-2411'
    ];
  }
}

export default OpenRouterProvider;
