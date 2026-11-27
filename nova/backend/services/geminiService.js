import axios from 'axios';
import { get } from '../database/db.js';

export class GeminiService {
  static async getApiKey() {
    const setting = await get("SELECT value FROM settings WHERE key = 'gemini_api_key'");
    return (setting && setting.value && setting.value.trim().length > 0)
      ? setting.value.trim()
      : process.env.GEMINI_API_KEY || '';
  }

  static async getModel() {
    const setting = await get("SELECT value FROM settings WHERE key = 'gemini_model'");
    return (setting && setting.value) ? setting.value : 'gemini-2.5-flash';
  }

  /**
   * Generates content using the Gemini REST API with multi-turn function calling and vision support
   */
  static async generateContent({ systemPrompt, messages = [], contents = null, tools = [], timeoutMs = 35000 }) {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error("Gemini API key is not configured. Please set it in Settings or GEMINI_API_KEY env variable.");
    }

    const model = await this.getModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // If explicit multi-turn contents array with function calls was supplied, use it;
    // otherwise format from standard messages array
    let formattedContents = contents;
    if (!formattedContents) {
      formattedContents = messages.map(msg => ({
        role: (msg.sender === 'user' || msg.role === 'user') ? 'user' : 'model',
        parts: msg.parts || [{ text: msg.content }]
      }));
    }

    const requestBody = {
      contents: formattedContents,
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 2048,
      }
    };

    if (tools && tools.length > 0) {
      requestBody.tools = [{
        functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }))
      }];
    }

    try {
      const response = await axios.post(url, requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: timeoutMs
      });

      const candidate = response.data?.candidates?.[0];
      if (!candidate) {
        throw new Error("No response candidates received from Gemini.");
      }

      const parts = candidate.content?.parts || [];
      let textResponse = '';
      const functionCalls = [];

      for (const part of parts) {
        if (part.text) {
          textResponse += part.text;
        }
        if (part.functionCall) {
          functionCalls.push({
            name: part.functionCall.name,
            arguments: part.functionCall.args || {}
          });
        }
      }

      return {
        text: textResponse.trim(),
        functionCalls,
        rawParts: parts,
        raw: candidate
      };
    } catch (error) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      throw new Error(`Gemini API Error: ${errorMsg}`);
    }
  }

  /**
   * Multimodal Vision Analysis: accepts a base64 encoded image with a prompt
   */
  static async analyzeImage({ imageBase64, mimeType = 'image/png', prompt = 'Analyze this screen capture.', systemPrompt = '' }) {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error("Gemini API key is not configured.");
    }

    const model = await this.getModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Clean base64 header if present (data:image/png;base64,...)
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const requestBody = {
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: cleanBase64
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048
      }
    };

    if (systemPrompt) {
      requestBody.systemInstruction = {
        parts: [{ text: systemPrompt }]
      };
    }

    try {
      const response = await axios.post(url, requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 40000
      });

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { success: true, text: text.trim() };
    } catch (error) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      throw new Error(`Vision API Error: ${errorMsg}`);
    }
  }
}

export default GeminiService;
