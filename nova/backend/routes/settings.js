import express from 'express';
import { query, run, get } from '../database/db.js';
import HealthMonitorService from '../services/healthMonitorService.js';
import { getProvider, getAllProviders } from '../services/providers/index.js';
import { encryptData, decryptData } from '../security/cryptoUtils.js';
import ModelRouterService from '../services/modelRouterService.js';

const router = express.Router();

const SENSITIVE_KEY_NAMES = [
  'gemini_api_key',
  'groq_api_key',
  'openrouter_api_key',
  'mistral_api_key'
];

router.get('/health', async (req, res) => {
  try {
    const health = await HealthMonitorService.checkSystemHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const rows = await query('SELECT key, value, updated_at FROM settings');
    const settingsObj = {};

    rows.forEach(r => {
      if (SENSITIVE_KEY_NAMES.includes(r.key)) {
        if (r.value) {
          const decrypted = decryptData(r.value);
          if (decrypted && decrypted.length > 8) {
            settingsObj[r.key] = decrypted.slice(0, 4) + '...' + decrypted.slice(-4);
          } else if (decrypted) {
            settingsObj[r.key] = '****...****';
          } else {
            settingsObj[r.key] = '';
          }
          settingsObj[`has_${r.key}`] = true;
        } else {
          settingsObj[r.key] = '';
          settingsObj[`has_${r.key}`] = false;
        }
      } else {
        settingsObj[r.key] = r.value;
      }
    });

    // Provide defaults aligned with Zero-Cost Local AI (Ollama) policy; cloud providers retained as optional disabled integrations
    if (!settingsObj.primary_provider) settingsObj.primary_provider = 'ollama';
    if (!settingsObj.secondary_provider) settingsObj.secondary_provider = '';
    if (!settingsObj.fallback_provider) settingsObj.fallback_provider = 'ollama';
    if (settingsObj.zero_cost_local_only === undefined) settingsObj.zero_cost_local_only = 'true';
    if (!settingsObj.groq_model) settingsObj.groq_model = 'openai/gpt-oss-120b';
    if (!settingsObj.openrouter_model) settingsObj.openrouter_model = 'meta-llama/llama-3.3-70b-instruct';
    if (!settingsObj.mistral_model) settingsObj.mistral_model = 'mistral-small-latest';
    if (!settingsObj.gemini_model) settingsObj.gemini_model = 'gemini-flash-latest';
    if (!settingsObj.ollama_endpoint) settingsObj.ollama_endpoint = 'http://127.0.0.1:11434';
    if (!settingsObj.ollama_model) settingsObj.ollama_model = 'qwen3.5:4b';
    if (settingsObj.local_inference_enabled === undefined) settingsObj.local_inference_enabled = 'true';

    res.json({ success: true, settings: settingsObj });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const updates = req.body;
    const now = new Date().toISOString();

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && value !== null) {
        // Skip updating masked strings
        if (SENSITIVE_KEY_NAMES.includes(key) && typeof value === 'string' && value.includes('...')) {
          continue;
        }

        let storeValue = String(value);

        // Encrypt sensitive API keys with AES-256-GCM
        if (SENSITIVE_KEY_NAMES.includes(key)) {
          if (!storeValue.trim()) {
            storeValue = '';
          } else {
            storeValue = encryptData(storeValue.trim());
          }
        }

        const existing = await get('SELECT key FROM settings WHERE key = ?', [key]);
        if (existing) {
          await run('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?', [storeValue, now, key]);
        } else {
          await run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [key, storeValue, now]);
        }
      }
    }

    res.json({ success: true, message: 'Settings successfully updated.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Diagnostic test connection for any AI provider
 */
router.post('/test-ai', async (req, res) => {
  try {
    const providerName = (req.body.provider || 'ollama').toLowerCase().trim();
    const zeroCostLocal = await ModelRouterService.isZeroCostLocalOnly();
    if (zeroCostLocal && providerName !== 'ollama') {
      return res.json({
        success: false,
        provider: providerName,
        disabledByPolicy: true,
        error: `Cloud provider '${providerName}' is disabled under Zero-Cost Local AI policy.`
      });
    }
    const provider = getProvider(providerName);

    if (!provider) {
      return res.json({
        success: false,
        provider: providerName,
        error: `Provider '${providerName}' is not recognized.`
      });
    }

    const testRes = await provider.testConnection();
    res.json(testRes);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/**
 * AI Token and Latency Metrics endpoint
 */
router.get('/ai-usage', async (req, res) => {
  try {
    const metrics = await ModelRouterService.getUsageMetrics();
    res.json({ success: true, metrics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '40', 10);
    const rows = await query('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT ?', [limit]);
    res.json({ success: true, logs: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
