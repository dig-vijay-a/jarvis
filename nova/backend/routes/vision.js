import express from 'express';
import VisionService, { VISION_MODES } from '../services/visionService.js';
import { getOrchestrator } from '../ai/orchestrator.js';

const router = express.Router();

router.get('/modes', (req, res) => {
  res.json({
    success: true,
    modes: [
      { id: VISION_MODES.SUMMARIZE, name: 'Workspace Summary', description: 'Concise overview of open windows and active documents.' },
      { id: VISION_MODES.EXPLAIN_ERROR, name: 'Explain Visible Errors', description: 'Diagnose visible exception dialogs, terminal tracebacks, or red flags.' },
      { id: VISION_MODES.IDENTIFY_UI, name: 'Identify UI Elements', description: 'Detect actionable buttons, forms, and interface controls.' },
      { id: VISION_MODES.SUGGEST_ACTIONS, name: 'Suggest Next Actions', description: 'Recommends 3 strategic, approved next steps based on visible state.' }
    ]
  });
});

router.post('/analyze', async (req, res) => {
  try {
    const { imageBase64, mode, customPrompt } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'Screen capture image payload required.' });
    }

    const orchestrator = getOrchestrator();
    orchestrator?.broadcast('AI_STATE_CHANGE', { state: 'thinking', agent: 'Screen Intelligence Core' });
    orchestrator?.logActivity('Screen Analysis', 'VISION', `Screen evaluated in mode: ${mode || 'SUMMARIZE'}`, 'success');

    const result = await VisionService.analyzeScreen({
      imageBase64,
      mode: mode || VISION_MODES.SUMMARIZE,
      customPrompt: customPrompt || ''
    });

    orchestrator?.broadcast('AI_STATE_CHANGE', { state: 'idle' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
