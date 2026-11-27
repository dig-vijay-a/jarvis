import express from 'express';
import KnowledgeGraphService from '../services/knowledgeGraphService.js';

const router = express.Router();

// ----------------------------------------------------
// PHASE 10: ADVANCED GRAPH TRAVERSAL & AUDIT (P1)
// ----------------------------------------------------

// 1. Find multi-hop path between two entities
router.get('/path', async (req, res) => {
  try {
    const { startId, targetId, maxDepth } = req.query;
    if (!startId || !targetId) {
      return res.status(400).json({ success: false, error: 'startId and targetId are required' });
    }
    const path = await KnowledgeGraphService.findPath(
      startId,
      targetId,
      maxDepth ? parseInt(maxDepth, 10) : 5
    );
    res.json({ success: true, path, hops: path ? path.length - 1 : 0 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Downstream impact of entity failure or change
router.get('/impact/:id', async (req, res) => {
  try {
    const maxDepth = req.query.maxDepth ? parseInt(req.query.maxDepth, 10) : 4;
    const impact = await KnowledgeGraphService.getDownstreamImpact(req.params.id, maxDepth);
    res.json({ success: true, ...impact });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Detect missing dependencies for a project
router.get('/missing-dependencies/:projectId', async (req, res) => {
  try {
    const analysis = await KnowledgeGraphService.detectMissingDependencies(req.params.projectId);
    res.json({ success: true, ...analysis });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Detect semantic contradictions in graph relationships
router.get('/contradictions', async (req, res) => {
  try {
    const contradictions = await KnowledgeGraphService.detectGraphContradictions();
    res.json({ success: true, count: contradictions.length, contradictions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// CORE GRAPH CRUD & VISUALIZATION (PRESERVED)
// ----------------------------------------------------

// 5. Get full graph for visualizer
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 200;
    const graphData = await KnowledgeGraphService.getFullGraph(limit);
    res.json({ success: true, ...graphData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Search entities
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    if (!q) {
      return res.status(400).json({ success: false, error: 'Query parameter q is required' });
    }
    const entities = await KnowledgeGraphService.searchEntities(q);
    res.json({ success: true, count: entities.length, entities });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Multi-hop neighborhood
router.get('/neighborhood/:id', async (req, res) => {
  try {
    const hops = parseInt(req.query.hops, 10) || 2;
    const neighborhood = await KnowledgeGraphService.getNeighborhood(req.params.id, hops);
    if (!neighborhood) {
      return res.status(404).json({ success: false, error: 'Entity not found' });
    }
    res.json({ success: true, neighborhood });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Create / Upsert entity
router.post('/entities', async (req, res) => {
  try {
    const { name, entity_type, properties, source_type, confidence } = req.body;
    const entity = await KnowledgeGraphService.upsertEntity({
      name,
      entity_type,
      properties,
      source_type,
      confidence
    });
    res.json({ success: true, entity });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Correct entity
router.put('/entities/:id', async (req, res) => {
  try {
    const updated = await KnowledgeGraphService.correctEntity(req.params.id, req.body);
    res.json({ success: true, entity: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Delete entity
router.delete('/entities/:id', async (req, res) => {
  try {
    const deleted = await KnowledgeGraphService.deleteEntity(req.params.id);
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. Add relationship
router.post('/relationships', async (req, res) => {
  try {
    const { source_entity_id, target_entity_id, relationship_type, weight, properties, source_type, confidence, is_inferred } = req.body;
    const relation = await KnowledgeGraphService.addRelationship({
      source_entity_id,
      target_entity_id,
      relationship_type,
      weight,
      properties,
      source_type,
      confidence,
      is_inferred
    });
    res.json({ success: true, relationship: relation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12. Extract entities from free-form text
router.post('/extract', async (req, res) => {
  try {
    const { text, entityType, sourceType } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: 'Text is required for extraction' });
    }
    const extracted = await KnowledgeGraphService.extractAndLink({ text, entityType, sourceType });
    res.json({ success: true, count: extracted.length, entities: extracted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
