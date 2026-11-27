import express from 'express';
import { query, run, get } from '../database/db.js';
import { getOrchestrator } from '../ai/orchestrator.js';

const router = express.Router();

router.get('/conversations', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM conversations ORDER BY updated_at DESC');
    res.json({ success: true, conversations: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/conversations', async (req, res) => {
  try {
    const id = `conv-${Date.now()}`;
    const title = req.body.title || 'New Directive';
    const now = new Date().toISOString();
    await run('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      id, title, now, now
    ]);
    res.json({ success: true, conversation: { id, title, created_at: now, updated_at: now } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC',
      [req.params.id]
    );
    // Parse tool_calls, tool_results and execution_trace JSON strings
    const parsed = rows.map(r => ({
      ...r,
      tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) : null,
      tool_results: r.tool_results ? JSON.parse(r.tool_results) : null,
      execution_trace: r.execution_trace ? (typeof r.execution_trace === 'string' ? JSON.parse(r.execution_trace) : r.execution_trace) : null
    }));
    res.json({ success: true, messages: parsed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/message', async (req, res) => {
  try {
    const { conversationId, content, preferredProvider } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Message content is required.' });
    }

    const orchestrator = getOrchestrator();
    if (!orchestrator) {
      return res.status(500).json({ success: false, error: 'AI Orchestrator not initialized.' });
    }

    const result = await orchestrator.processMessage({
      conversationId: conversationId || 'conv-main',
      userText: content.trim(),
      preferredProvider
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Route /chat/message] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/conversations/:id', async (req, res) => {
  try {
    await run('DELETE FROM messages WHERE conversation_id = ?', [req.params.id]);
    await run('DELETE FROM conversations WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Conversation deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
