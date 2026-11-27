import express from 'express';
import { query, run, get } from '../database/db.js';
import MemoryIntelligenceService, { VALID_CATEGORIES } from '../services/memoryIntelligenceService.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { category, search } = req.query;
    let sql = 'SELECT * FROM memories WHERE 1=1';
    const params = [];

    if (category && category !== 'All') {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      sql += ' AND (key LIKE ? OR value LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY importance DESC, updated_at DESC';
    const rows = await query(sql, params);
    res.json({ success: true, count: rows.length, memories: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const totalRow = await get('SELECT COUNT(*) as count FROM memories');
    const categories = await query('SELECT category, COUNT(*) as count FROM memories GROUP BY category');
    const sources = await query('SELECT source, COUNT(*) as count FROM memories GROUP BY source');
    res.json({
      success: true,
      total: totalRow.count,
      categories,
      sources
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/check-duplicate', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ success: false, error: 'Key required' });
    const dup = await MemoryIntelligenceService.detectDuplicate(key, value || '');
    res.json({ success: true, ...dup });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/retrieve-context', async (req, res) => {
  try {
    const promptText = req.body.prompt || req.body.query;
    const { limit } = req.body;
    if (!promptText) return res.status(400).json({ success: false, error: 'Prompt or query required' });
    const relevant = await MemoryIntelligenceService.retrieveRelevantMemories(promptText, limit || 5);
    res.json({ success: true, count: relevant.length, memories: relevant });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post(['/', '/add'], async (req, res) => {
  try {
    const { key, value, category, importance, source, forceUpdate } = req.body;
    const result = await MemoryIntelligenceService.storeMemory({
      key,
      value,
      category,
      importance,
      source: source || 'user_explicit',
      forceUpdate: !!forceUpdate
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { key, value, category, importance, source } = req.body;
    const now = new Date().toISOString();
    await run(
      'UPDATE memories SET key = ?, value = ?, category = ?, importance = ?, source = coalesce(?, source), updated_at = ? WHERE id = ?',
      [key, value, category, importance, source, now, req.params.id]
    );
    res.json({ success: true, message: 'Memory updated.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await run('DELETE FROM memories WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Memory erased from bank.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
