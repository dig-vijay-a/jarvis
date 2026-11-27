import express from 'express';
import WebSearchService from '../services/webSearchService.js';
import GeminiService from '../services/geminiService.js';
import { get } from '../database/db.js';
import { getOrchestrator } from '../ai/orchestrator.js';

const router = express.Router();

router.post('/search', async (req, res) => {
  try {
    const { query, limit } = req.body;
    if (!query) return res.status(400).json({ success: false, error: 'Query is required.' });

    const results = await WebSearchService.search(query, limit || 5);
    res.json({ success: true, count: results.length, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/deep', async (req, res) => {
  try {
    const { topic, depth } = req.body;
    if (!topic) return res.status(400).json({ success: false, error: 'Topic is required.' });

    const orchestrator = getOrchestrator();
    orchestrator?.logActivity('Research Initiated', 'RESEARCH', `Initiated research for: ${topic}`, 'success');

    // 1. Gather web data
    const rawResearch = await WebSearchService.conductResearch({ topic, depth: depth || 'deep' });

    // 2. Synthesize structured report
    let summary = `### Executive Summary: ${topic}\n\n`;
    summary += `Comprehensive research completed across ${rawResearch.sources.length} indexed intelligence streams.\n\n`;
    summary += `#### Key Insights & Findings:\n`;
    rawResearch.sources.forEach((s, idx) => {
      summary += `${idx + 1}. **${s.title}**: ${s.snippet}\n`;
    });

    summary += `\n#### Strategic Implications & Recommendations:\n`;
    summary += `- Integrate findings into primary workflow registers.\n`;
    summary += `- Monitor verified source citations for telemetry drifts.\n`;
    summary += `- Standardize deployment around verified protocols.\n`;

    res.json({
      success: true,
      topic,
      depth: depth || 'deep',
      report: summary,
      sources: rawResearch.sources,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
