import OpenAICompatibleProvider from './OpenAICompatibleProvider.js';

export class GroqProvider extends OpenAICompatibleProvider {
  constructor(options = {}) {
    super('groq', {
      baseUrl: options.baseUrl || 'https://api.groq.com/openai/v1',
      defaultModel: options.defaultModel || 'openai/gpt-oss-120b',
      keySetting: 'groq_api_key',
      envVar: 'GROQ_API_KEY',
      ...options
    });
    this.supportedModels = [
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'qwen/qwen3.8-27b',
      'llama-3.3-70b-versatile'
    ];
  }
}

export default GroqProvider;
