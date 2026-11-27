import BaseProvider, { ERROR_TYPES } from './BaseProvider.js';
import GeminiProvider from './GeminiProvider.js';
import GroqProvider from './GroqProvider.js';
import OpenRouterProvider from './OpenRouterProvider.js';
import OllamaProvider from './OllamaProvider.js';
import MistralProvider from './MistralProvider.js';

export {
  BaseProvider,
  ERROR_TYPES,
  GeminiProvider,
  GroqProvider,
  OpenRouterProvider,
  OllamaProvider,
  MistralProvider
};

// Singleton instances
const providerInstances = {
  groq: new GroqProvider(),
  openrouter: new OpenRouterProvider(),
  gemini: new GeminiProvider(),
  mistral: new MistralProvider(),
  ollama: new OllamaProvider()
};

/**
 * Get a provider instance by name
 * @param {string} name - 'groq' | 'openrouter' | 'gemini' | 'mistral' | 'ollama'
 * @returns {BaseProvider}
 */
export function getProvider(name) {
  const key = (name || '').toLowerCase().trim();
  return providerInstances[key] || null;
}

/**
 * Returns all registered provider instances
 * @returns {Record<string, BaseProvider>}
 */
export function getAllProviders() {
  return providerInstances;
}

export default {
  getProvider,
  getAllProviders,
  ERROR_TYPES,
  GeminiProvider,
  GroqProvider,
  OpenRouterProvider,
  OllamaProvider,
  MistralProvider
};
