import express from 'express';
import KnowledgeEngineService from '../services/knowledgeEngineService.js';

const router = express.Router();

// Ingest and index a document
router.post('/ingest', async (req, res) => {
  try {
    const { filename, filepath, content, filetype } = req.body;
    if (!filename) {
      return res.status(400).json({ success: false, error: 'Document filename is required.' });
    }
    const result = await KnowledgeEngineService.ingestDocument({ filename, filepath, content, filetype });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List all indexed documents
router.get('/documents', async (req, res) => {
  try {
    const docs = await KnowledgeEngineService.listDocuments();
    res.json({ success: true, count: docs.length, documents: docs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Search knowledge base
router.post('/search', async (req, res) => {
  try {
    const queryText = req.body.query || req.body.prompt;
    const limit = parseInt(req.body.limit, 10) || 5;
    if (!queryText) {
      return res.status(400).json({ success: false, error: 'Search query is required.' });
    }
    const results = await KnowledgeEngineService.searchKnowledge(queryText, limit);
    res.json({ success: true, count: results.length, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete an indexed document
router.delete('/documents/:id', async (req, res) => {
  try {
    const result = await KnowledgeEngineService.deleteDocument(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
