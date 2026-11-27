import express from 'express';
import os from 'os';
import ModelRouterService from '../services/modelRouterService.js';
import { getProvider } from '../services/providers/index.js';
import { run, get } from '../database/db.js';

const router = express.Router();

/**
 * GET /api/routing/providers
 * Returns operational status, configured models, and active routing policy
 */
router.get('/providers', async (req, res) => {
  try {
    const status = await ModelRouterService.getProvidersStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/routing/usage
 * Returns aggregated token usage and latency metrics per provider
 */
router.get('/usage', async (req, res) => {
  try {
    const metrics = await ModelRouterService.getUsageMetrics();
    res.json({ success: true, metrics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/routing/telemetry-metrics
 * Phase 15 P7: Real-Time Performance, Latency, Throughput & Intelligence Telemetry
 */
router.get('/telemetry-metrics', async (req, res) => {
  try {
    const ollama = getProvider('ollama');
    const [telemetry, availability] = await Promise.all([
      ModelRouterService.getTelemetryMetrics(),
      ollama?.verifyModelAvailability ? ollama.verifyModelAvailability() : Promise.resolve({ online: false })
    ]);
    const totalRamGB = Number((os.totalmem() / (1024 ** 3)).toFixed(2));
    const freeRamGB = Number((os.freemem() / (1024 ** 3)).toFixed(2));
    const cpus = os.cpus() || [];
    const load1m = Number((os.loadavg()[0] || 0).toFixed(2));

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      telemetry,
      runtime: {
        provider: 'ollama',
        online: Boolean(availability?.online),
        model: availability?.model || 'qwen3.5:4b',
        modelDownloaded: Boolean(availability?.modelDownloaded),
        loadedModels: availability?.loadedModels || [],
        resourceProfile: availability?.resourceProfile || null
      },
      host: {
        totalRamGB,
        freeRamGB,
        usedRamGB: Number((totalRamGB - freeRamGB).toFixed(2)),
        logicalCpus: cpus.length,
        loadAvg1m: load1m
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/routing/route
 * Analyzes directive complexity and privacy constraints, returning optimal route
 */
router.post('/route', async (req, res) => {
  try {
    const { userText, preferredProvider, complexity, privacyTag } = req.body;
    const decision = await ModelRouterService.selectRoute({
      userText,
      preferredProvider,
      complexity,
      privacyTag
    });
    res.json({ success: true, decision });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/resources', async (req, res) => {
  try {
    const ollama = getProvider('ollama');
    const availability = ollama?.verifyModelAvailability
      ? await ollama.verifyModelAvailability()
      : { online: false };
    res.json({ success: true, ...availability });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/routing/configure
 * Sets global model routing priorities, policies, and privacy mode
 */
router.post('/configure', async (req, res) => {
  try {
    const { policy, privacyMode, primaryProvider, secondaryProvider, fallbackProvider, zeroCostLocalOnly } = req.body;
    const now = new Date().toISOString();

    if (zeroCostLocalOnly !== undefined) {
      await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('zero_cost_local_only', ?, ?)", [String(Boolean(zeroCostLocalOnly)), now]);
    }

    if (policy) {
      await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('model_routing_policy', ?, ?)", [policy, now]);
    }
    if (privacyMode) {
      await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('privacy_mode', ?, ?)", [privacyMode, now]);
    }
    if (primaryProvider) {
      await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('primary_provider', ?, ?)", [primaryProvider, now]);
    }
    if (secondaryProvider) {
      await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('secondary_provider', ?, ?)", [secondaryProvider, now]);
    }
    if (fallbackProvider) {
      await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('fallback_provider', ?, ?)", [fallbackProvider, now]);
    }

    res.json({
      success: true,
      message: 'Routing parameters updated successfully.',
      policy,
      privacyMode,
      primaryProvider,
      secondaryProvider,
      fallbackProvider
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
