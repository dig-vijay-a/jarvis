import axios from 'axios';
import { get } from '../database/db.js';

export class OllamaService {
  static async getEndpoint() {
    const setting = await get("SELECT value FROM settings WHERE key = 'ollama_endpoint'");
    const raw = (setting && setting.value) ? setting.value : (process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434');
    return raw.replace(/\/$/, '').replace('://localhost:', '://127.0.0.1:');
  }

  static async getModel() {
    const setting = await get("SELECT value FROM settings WHERE key = 'ollama_model'");
    return (setting && setting.value) ? setting.value : (process.env.OLLAMA_MODEL || 'qwen3.5:4b');
  }

  static async checkHealth() {
    try {
      const endpoint = await this.getEndpoint();
      const res = await axios.get(`${endpoint}/api/tags`, { timeout: 2000 });
      return res.status === 200;
    } catch (e) {
      return false;
    }
  }

  static async generateContent({ systemPrompt, messages, tools = [] }) {
    const endpoint = await this.getEndpoint();
    const model = await this.getModel();

    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.content
      }))
    ];

    try {
      const response = await axios.post(`${endpoint}/api/chat`, {
        model,
        messages: formattedMessages,
        stream: false,
        options: {
          temperature: 0.4
        }
      }, { timeout: 45000 });

      const assistantMessage = response.data?.message?.content || '';

      // Check if text contains structured tool execution JSON
      let functionCalls = [];
      try {
        const jsonMatch = assistantMessage.match(/\{[\s\S]*"tool"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.tool) {
            functionCalls.push({
              name: parsed.tool,
              arguments: parsed.arguments || {}
            });
          }
        }
      } catch (e) {
        // Not a JSON tool call
      }

      return {
        text: assistantMessage.trim(),
        functionCalls
      };
    } catch (err) {
      throw new Error(`Ollama connection error (${endpoint}): ${err.message}`);
    }
  }
}

export default OllamaService;
