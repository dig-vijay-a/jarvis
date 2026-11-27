import express from 'express';
import ProactiveIntelligenceService from '../services/proactiveIntelligenceService.js';
import ToolRegistry from '../tools/registry.js';

const router = express.Router();

router.get('/briefing', async (req, res) => {
  try {
    const briefing = await ProactiveIntelligenceService.generateDailyBriefing();
    res.json(briefing);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/overdue-tasks', async (req, res) => {
  try {
    const result = await ProactiveIntelligenceService.checkOverdueTasks();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/incomplete-missions', async (req, res) => {
  try {
    const result = await ProactiveIntelligenceService.checkIncompleteMissions();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/insights', async (req, res) => {
  try {
    const insights = await ProactiveIntelligenceService.getProactiveInsights();
    res.json(insights);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/proactive/recommendations
 * Explainable recommendations with reason, context source, urgency and action tools
 */
router.get('/recommendations', async (req, res) => {
  try {
    const recommendations = await ProactiveIntelligenceService.getExplainableRecommendations();
    res.json({ success: true, count: recommendations.length, recommendations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/proactive/recommendations/:id/action
 * Executes the recommended tool action and marks recommendation as RESOLVED
 */
router.post('/recommendations/:id/action', async (req, res) => {
  try {
    const { id } = req.params;
    const { tool, args } = req.body;

    let toolResult = null;
    if (tool) {
      toolResult = await ToolRegistry.executeTool(tool, args || {});
    }

    await ProactiveIntelligenceService.resolveRecommendation(id);

    res.json({
      success: true,
      id,
      status: 'RESOLVED',
      toolResult,
      message: 'Recommendation action executed and status resolved.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/proactive/recommendations/:id/dismiss
 * Dismisses recommendation without action
 */
router.post('/recommendations/:id/dismiss', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await ProactiveIntelligenceService.dismissRecommendation(id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
