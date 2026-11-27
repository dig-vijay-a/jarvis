import OpenAICompatibleProvider from './OpenAICompatibleProvider.js';

export class MistralProvider extends OpenAICompatibleProvider {
  constructor(options = {}) {
    super('mistral', {
      baseUrl: options.baseUrl || 'https://api.mistral.ai/v1',
      defaultModel: options.defaultModel || 'mistral-small-latest',
      keySetting: 'mistral_api_key',
      envVar: 'MISTRAL_API_KEY',
      ...options
    });
    this.supportedModels = [
      'mistral-small-latest',
      'mistral-large-latest',
      'codestral-latest',
      'pixtral-12b-2409'
    ];
  }
}

export default MistralProvider;
