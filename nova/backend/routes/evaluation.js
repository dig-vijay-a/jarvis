import express from 'express';
import EvaluationEngineService from '../services/evaluationEngineService.js';

const router = express.Router();

// 1. Get benchmarks
router.get('/benchmarks', async (req, res) => {
  try {
    const benchmarks = await EvaluationEngineService.getBenchmarks();
    res.json({ success: true, count: benchmarks.length, benchmarks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Get past evaluation runs
router.get('/runs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const runs = await EvaluationEngineService.getEvaluationRuns(limit);
    res.json({ success: true, count: runs.length, runs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Trigger evaluation suite
router.post('/run', async (req, res) => {
  try {
    const { suiteType, runName } = req.body;
    const result = await EvaluationEngineService.runEvaluationSuite(suiteType, runName);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
