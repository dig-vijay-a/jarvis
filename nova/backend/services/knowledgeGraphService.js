import { query, run, get } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';

export class KnowledgeGraphService {
  /**
   * Add or retrieve an entity in the graph
   */
  async upsertEntity({ id, name, entity_type, properties = {}, source_type = 'user_explicit', confidence = 1.0 }) {
    if (!name || !entity_type) {
      throw new Error('Entity name and entity_type are required');
    }

    // Invariant 5: Inferred entity confidence strictly capped at 0.70
    const effectiveConfidence = (source_type === 'inferred') ? Math.min(confidence, 0.70) : confidence;

    const cleanName = name.trim();
    const existing = await get(
      'SELECT * FROM graph_entities WHERE LOWER(name) = LOWER(?) AND (entity_type = ? OR type = ?)',
      [cleanName, entity_type, entity_type]
    );

    const now = new Date().toISOString();
    if (existing) {
      const mergedProps = { ...(existing.properties ? JSON.parse(existing.properties) : {}), ...properties };
      await run(
        'UPDATE graph_entities SET properties = ?, source_type = ?, source = ?, confidence = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(mergedProps), source_type, source_type, effectiveConfidence, now, existing.id]
      );
      return { ...existing, properties: mergedProps, source_type, confidence: effectiveConfidence, updated_at: now };
    }

    const entityId = id || `ent-${uuidv4().substring(0, 8)}`;
    await run(
      'INSERT INTO graph_entities (id, entity_type, type, name, properties, source_type, source, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [entityId, entity_type, entity_type, cleanName, JSON.stringify(properties), source_type, source_type, effectiveConfidence, now, now]
    );

    return {
      id: entityId,
      entity_type,
      name: cleanName,
      properties,
      source_type,
      confidence: effectiveConfidence,
      created_at: now,
      updated_at: now
    };
  }

  /**
   * Add a relationship between two entities
   */
  async createRelationship(params) {
    return this.addRelationship(params);
  }

  async addRelationship({ source_entity_id, target_entity_id, relationship_type, weight = 1.0, properties = {}, source_type = 'user_explicit' }) {
    if (!source_entity_id || !target_entity_id || !relationship_type) {
      throw new Error('source_entity_id, target_entity_id, and relationship_type are required');
    }

    if (source_entity_id === target_entity_id) {
      throw new Error('Self-referential relationships are not permitted');
    }

    // Invariant 5: Inferred relationship weight/confidence strictly capped at 0.70
    const effectiveWeight = (source_type === 'inferred') ? Math.min(weight, 0.70) : weight;

    // Verify entities exist
    const src = await get('SELECT id FROM graph_entities WHERE id = ?', [source_entity_id]);
    const tgt = await get('SELECT id FROM graph_entities WHERE id = ?', [target_entity_id]);
    if (!src || !tgt) {
      throw new Error('Both source and target entities must exist in the graph');
    }

    const existing = await get(
      'SELECT * FROM graph_relationships WHERE (source_entity_id = ? OR source_id = ?) AND (target_entity_id = ? OR target_id = ?) AND (relationship_type = ? OR relation_type = ?)',
      [source_entity_id, source_entity_id, target_entity_id, target_entity_id, relationship_type, relationship_type]
    );

    const now = new Date().toISOString();
    if (existing) {
      const mergedProps = { ...(existing.properties ? JSON.parse(existing.properties) : {}), ...properties };
      await run(
        'UPDATE graph_relationships SET weight = ?, properties = ?, metadata = ?, source_type = ?, source = ?, updated_at = ? WHERE id = ?',
        [effectiveWeight, JSON.stringify(mergedProps), JSON.stringify(mergedProps), source_type, source_type, now, existing.id]
      );
      return { source_entity_id, target_entity_id, relationship_type, weight: effectiveWeight, properties: mergedProps, source_type, updated_at: now };
    }

    const relId = `rel-${uuidv4().substring(0, 8)}`;
    await run(
      `INSERT INTO graph_relationships 
      (id, source_entity_id, source_id, target_entity_id, target_id, relationship_type, relation_type, weight, properties, metadata, source_type, source, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        relId,
        source_entity_id,
        source_entity_id,
        target_entity_id,
        target_entity_id,
        relationship_type,
        relationship_type,
        effectiveWeight,
        JSON.stringify(properties),
        JSON.stringify(properties),
        source_type,
        source_type,
        now,
        now
      ]
    );

    return {
      id: relId,
      source_entity_id,
      target_entity_id,
      relationship_type,
      weight: effectiveWeight,
      properties,
      source_type,
      created_at: now,
      updated_at: now
    };
  }

  async getConnectedEntities(entityId, hops = 2) {
    return this.getNeighborhood(entityId, hops);
  }

  /**
   * Multi-hop neighborhood traversal (1-hop or 2-hop)
   */
  async getNeighborhood(entityId, hops = 2) {
    const root = await get('SELECT * FROM graph_entities WHERE id = ?', [entityId]);
    if (!root) return null;

    const visitedEntityIds = new Set([entityId]);
    const nodes = [{ ...root, properties: JSON.parse(root.properties || '{}') }];
    const edges = [];

    // Hop 1
    const hop1Rel = await query(
      `SELECT r.*, e1.name as source_name, e2.name as target_name 
       FROM graph_relationships r
       JOIN graph_entities e1 ON (COALESCE(r.source_entity_id, r.source_id) = e1.id)
       JOIN graph_entities e2 ON (COALESCE(r.target_entity_id, r.target_id) = e2.id)
       WHERE COALESCE(r.source_entity_id, r.source_id) = ? OR COALESCE(r.target_entity_id, r.target_id) = ?`,
      [entityId, entityId]
    );

    for (const rel of hop1Rel) {
      const srcId = rel.source_entity_id || rel.source_id;
      const tgtId = rel.target_entity_id || rel.target_id;
      const relType = rel.relationship_type || rel.relation_type;
      edges.push({
        ...rel,
        source_entity_id: srcId,
        target_entity_id: tgtId,
        relationship_type: relType,
        properties: JSON.parse(rel.properties || rel.metadata || '{}')
      });
      visitedEntityIds.add(srcId);
      visitedEntityIds.add(tgtId);
    }

    // Hop 2 if requested
    if (hops >= 2 && visitedEntityIds.size > 1) {
      const currentIds = Array.from(visitedEntityIds);
      const placeholders = currentIds.map(() => '?').join(',');
      const hop2Rel = await query(
        `SELECT r.*, e1.name as source_name, e2.name as target_name 
         FROM graph_relationships r
         JOIN graph_entities e1 ON (COALESCE(r.source_entity_id, r.source_id) = e1.id)
         JOIN graph_entities e2 ON (COALESCE(r.target_entity_id, r.target_id) = e2.id)
         WHERE COALESCE(r.source_entity_id, r.source_id) IN (${placeholders}) OR COALESCE(r.target_entity_id, r.target_id) IN (${placeholders})
         LIMIT 100`,
        [...currentIds, ...currentIds]
      );

      for (const rel of hop2Rel) {
        const srcId = rel.source_entity_id || rel.source_id;
        const tgtId = rel.target_entity_id || rel.target_id;
        const relType = rel.relationship_type || rel.relation_type;
        if (!edges.some(e => e.source_entity_id === srcId && e.target_entity_id === tgtId && e.relationship_type === relType)) {
          edges.push({
            ...rel,
            source_entity_id: srcId,
            target_entity_id: tgtId,
            relationship_type: relType,
            properties: JSON.parse(rel.properties || rel.metadata || '{}')
          });
          visitedEntityIds.add(srcId);
          visitedEntityIds.add(tgtId);
        }
      }
    }

    // Fetch all visited nodes
    const allNodePlaceholders = Array.from(visitedEntityIds).map(() => '?').join(',');
    const allNodes = await query(
      `SELECT * FROM graph_entities WHERE id IN (${allNodePlaceholders})`,
      Array.from(visitedEntityIds)
    );

    return {
      rootId: entityId,
      nodes: allNodes.map(n => ({
        ...n,
        entity_type: n.entity_type || n.type,
        source_type: n.source_type || n.source,
        properties: JSON.parse(n.properties || '{}')
      })),
      edges
    };
  }

  /**
   * Full graph export for visualizers
   */
  async getFullGraph(limit = 150) {
    const rawNodes = await query('SELECT * FROM graph_entities ORDER BY updated_at DESC LIMIT ?', [limit]);
    const nodeIds = rawNodes.map(n => n.id);

    let rawEdges = [];
    if (nodeIds.length > 0) {
      const placeholders = nodeIds.map(() => '?').join(',');
      rawEdges = await query(
        `SELECT r.*, e1.name as source_name, e2.name as target_name 
         FROM graph_relationships r
         JOIN graph_entities e1 ON (COALESCE(r.source_entity_id, r.source_id) = e1.id)
         JOIN graph_entities e2 ON (COALESCE(r.target_entity_id, r.target_id) = e2.id)
         WHERE COALESCE(r.source_entity_id, r.source_id) IN (${placeholders}) AND COALESCE(r.target_entity_id, r.target_id) IN (${placeholders})`,
        [...nodeIds, ...nodeIds]
      );
    }

    return {
      nodes: rawNodes.map(n => ({
        id: n.id,
        name: n.name,
        type: n.entity_type || n.type,
        confidence: n.confidence || 1.0,
        source: n.source_type || n.source,
        properties: JSON.parse(n.properties || '{}')
      })),
      links: rawEdges.map(e => ({
        source: e.source_entity_id || e.source_id,
        target: e.target_entity_id || e.target_id,
        relationship: e.relationship_type || e.relation_type,
        weight: e.weight || 1.0,
        sourceType: e.source_type || e.source,
        properties: JSON.parse(e.properties || e.metadata || '{}')
      }))
    };
  }

  /**
   * Search entities by query string
   */
  async searchEntities(searchQuery, limit = 20) {
    const term = `%${searchQuery.trim()}%`;
    const rows = await query(
      'SELECT * FROM graph_entities WHERE name LIKE ? OR entity_type LIKE ? OR type LIKE ? ORDER BY confidence DESC LIMIT ?',
      [term, term, term, limit]
    );
    return rows.map(r => ({
      ...r,
      entity_type: r.entity_type || r.type,
      source_type: r.source_type || r.source,
      properties: JSON.parse(r.properties || '{}')
    }));
  }

  /**
   * Memory correction: delete or adjust confidence of entity or link
   */
  async correctEntity(id, { name, confidence, properties, entity_type }) {
    const existing = await get('SELECT * FROM graph_entities WHERE id = ?', [id]);
    if (!existing) throw new Error('Entity not found');

    const updatedProps = properties !== undefined ? JSON.stringify(properties) : existing.properties;
    const updatedConfidence = confidence !== undefined ? confidence : (existing.confidence || 1.0);
    const updatedName = name ? name.trim() : existing.name;
    const updatedType = entity_type || existing.entity_type || existing.type;
    const now = new Date().toISOString();

    await run(
      'UPDATE graph_entities SET name = ?, entity_type = ?, type = ?, confidence = ?, properties = ?, updated_at = ? WHERE id = ?',
      [updatedName, updatedType, updatedType, updatedConfidence, updatedProps, now, id]
    );

    return { id, name: updatedName, entity_type: updatedType, confidence: updatedConfidence, updated_at: now };
  }

  /**
   * Delete entity and cascading relationships
   */
  async deleteEntity(id) {
    await run(
      'DELETE FROM graph_relationships WHERE source_entity_id = ? OR source_id = ? OR target_entity_id = ? OR target_id = ?',
      [id, id, id, id]
    );
    const res = await run('DELETE FROM graph_entities WHERE id = ?', [id]);
    return res.changes > 0;
  }

  /**
   * Automatically extracts entities and relationships from a text snippet, memory, or task.
   */
  async extractAndLink({ text, entityType = 'topic', sourceId = null, sourceType = 'ai_inferred' }) {
    if (!text || typeof text !== 'string') return [];

    const patterns = [
      { regex: /\b(React|Node\.js|Python|SQLite|Gemini|FastAPI|Vite|Tailwind|Docker|PostgreSQL)\b/gi, type: 'technology' },
      { regex: /\b(NOVA|JARVIS|Project|Mission Control|Digital Twin|Knowledge Graph)\b/gi, type: 'project' },
      { regex: /\b(Commander|Developer|Architect|Agent|Coordinator)\b/gi, type: 'role' }
    ];

    const extracted = [];
    for (const p of patterns) {
      const matches = text.match(p.regex);
      if (matches) {
        for (const m of Array.from(new Set(matches))) {
          const ent = await this.upsertEntity({
            name: m,
            entity_type: p.type,
            source_type: sourceType,
            confidence: 0.95
          });
          extracted.push(ent);
        }
      }
    }

    if (extracted.length >= 2) {
      for (let i = 0; i < extracted.length - 1; i++) {
        await this.addRelationship({
          source_entity_id: extracted[i].id,
          target_entity_id: extracted[i + 1].id,
          relationship_type: 'associated_with',
          weight: 0.8,
          source_type: sourceType
        });
      }
    }

    return extracted;
  }

  /**
   * Finds paths connecting two entities in the knowledge graph (BFS up to maxDepth hops)
   */
  async findPath(startEntityId, targetEntityId, maxDepth = 4) {
    if (!startEntityId || !targetEntityId) return null;
    if (startEntityId === targetEntityId) return [startEntityId];

    const queue = [[startEntityId]];
    const visited = new Set([startEntityId]);

    while (queue.length > 0) {
      const currentPath = queue.shift();
      const currentId = currentPath[currentPath.length - 1];

      if (currentPath.length > maxDepth) continue;

      const rels = await query(
        `SELECT target_entity_id, target_id, source_entity_id, source_id, relationship_type, relation_type 
         FROM graph_relationships 
         WHERE source_entity_id = ? OR source_id = ? OR target_entity_id = ? OR target_id = ?`,
        [currentId, currentId, currentId, currentId]
      );

      for (const r of rels) {
        const src = r.source_entity_id || r.source_id;
        const tgt = r.target_entity_id || r.target_id;
        const neighborId = (src === currentId) ? tgt : src;

        if (neighborId === targetEntityId) {
          const fullPathIds = [...currentPath, neighborId];
          const nodes = [];
          for (const pId of fullPathIds) {
            const ent = await get('SELECT id, name, entity_type FROM graph_entities WHERE id = ?', [pId]);
            nodes.push(ent || { id: pId, name: pId });
          }
          return nodes;
        }

        if (!visited.has(neighborId) && currentPath.length < maxDepth) {
          visited.add(neighborId);
          queue.push([...currentPath, neighborId]);
        }
      }
    }

    return null;
  }

  /**
   * Retrieves all downstream entities transitively affected by an entity
   */
  async getDownstreamImpact(entityId, maxDepth = 3) {
    const affected = new Map();
    const queue = [{ id: entityId, depth: 0 }];
    const visited = new Set([entityId]);

    while (queue.length > 0) {
      const { id, depth } = queue.shift();
      if (depth >= maxDepth) continue;

      // Find relationships where id is source or prerequisite
      const rels = await query(
        `SELECT r.*, e.name as target_name, e.entity_type as target_type 
         FROM graph_relationships r
         JOIN graph_entities e ON (COALESCE(r.target_entity_id, r.target_id) = e.id)
         WHERE COALESCE(r.source_entity_id, r.source_id) = ?`,
        [id]
      );

      for (const r of rels) {
        const tgtId = r.target_entity_id || r.target_id;
        const relType = r.relationship_type || r.relation_type;

        if (!affected.has(tgtId)) {
          affected.set(tgtId, {
            id: tgtId,
            name: r.target_name,
            entity_type: r.target_type,
            relationship: relType,
            depth: depth + 1
          });
        }

        if (!visited.has(tgtId)) {
          visited.add(tgtId);
          queue.push({ id: tgtId, depth: depth + 1 });
        }
      }
    }

    return {
      entity_id: entityId,
      downstream_entities: Array.from(affected.values()),
      count: affected.size
    };
  }

  /**
   * Detects missing skills or resources required by a project or its tasks
   */
  async detectMissingDependencies(projectId) {
    // 1. Get project entity
    const projectEnt = await get(
      "SELECT * FROM graph_entities WHERE id = ? OR LOWER(name) = LOWER(?)",
      [projectId, projectId]
    );
    if (!projectEnt) return [];

    // 2. Query relationships for required skills, resources, or prerequisite tasks
    const requiredRels = await query(
      `SELECT r.*, e.id as target_id, e.name as target_name, e.entity_type as target_type, e.properties
       FROM graph_relationships r
       LEFT JOIN graph_entities e ON (COALESCE(r.target_entity_id, r.target_id) = e.id)
       WHERE (COALESCE(r.source_entity_id, r.source_id) = ?) 
         AND (r.relationship_type IN ('SKILL_REQUIRED_FOR_PROJECT', 'RESOURCE_REQUIRED_BY_TASK', 'DEPENDS_ON'))`,
      [projectEnt.id]
    );

    const missing = [];
    for (const req of requiredRels) {
      if (!req.target_name) {
        missing.push({
          type: req.relationship_type,
          entity_id: req.target_entity_id,
          reason: 'Required dependency entity does not exist in graph'
        });
      } else {
        const props = req.properties ? JSON.parse(req.properties) : {};
        if (props.is_available === false || props.status === 'UNAVAILABLE' || props.status === 'MISSING') {
          missing.push({
            type: req.relationship_type,
            entity_id: req.target_id,
            name: req.target_name,
            reason: `Prerequisite ${req.target_type} '${req.target_name}' is currently flagged unavailable/missing`
          });
        }
      }
    }

    return {
      project_id: projectEnt.id,
      project_name: projectEnt.name,
      has_missing_dependencies: missing.length > 0,
      missing_dependencies: missing,
      count: missing.length
    };
  }

  /**
   * Detects conflicting or contradictory relationships in the knowledge graph
   */
  async detectGraphContradictions() {
    const conflicts = [];

    // Check for opposing relationships between the same entity pairs
    const rels = await query(
      `SELECT r1.id as id1, r1.relationship_type as rel1, r1.source_entity_id as src1, r1.target_entity_id as tgt1,
              r2.id as id2, r2.relationship_type as rel2, r2.source_entity_id as src2, r2.target_entity_id as tgt2,
              e1.name as src_name, e2.name as tgt_name
       FROM graph_relationships r1
       JOIN graph_relationships r2 ON (
         (COALESCE(r1.source_entity_id, r1.source_id) = COALESCE(r2.source_entity_id, r2.source_id) AND COALESCE(r1.target_entity_id, r1.target_id) = COALESCE(r2.target_entity_id, r2.target_id)) OR
         (COALESCE(r1.source_entity_id, r1.source_id) = COALESCE(r2.target_entity_id, r2.target_id) AND COALESCE(r1.target_entity_id, r1.target_id) = COALESCE(r2.source_entity_id, r2.source_id))
       ) AND r1.id < r2.id
       JOIN graph_entities e1 ON (COALESCE(r1.source_entity_id, r1.source_id) = e1.id)
       JOIN graph_entities e2 ON (COALESCE(r1.target_entity_id, r1.target_id) = e2.id)`
    );

    for (const r of rels) {
      const type1 = r.rel1 || '';
      const type2 = r.rel2 || '';

      const isContradiction = 
        (type1.includes('SUPPORTS') && type2.includes('BLOCKS')) ||
        (type1.includes('DEPENDS_ON') && type2.includes('CONFLICTS_WITH')) ||
        (type1 === 'COMPATIBLE_WITH' && type2 === 'INCOMPATIBLE_WITH');

      if (isContradiction) {
        conflicts.push({
          source: r.src_name,
          target: r.tgt_name,
          relationship_1: type1,
          relationship_2: type2,
          reason: `Mutually conflicting relationship types '${type1}' and '${type2}' between '${r.src_name}' and '${r.tgt_name}'`
        });
      }
    }

    return conflicts;
  }

  /**
   * Phase 13: Discovers cross-domain connections traversing graph entities.
   * Connects projects, skills, research, goals, missions, decisions, files, agents, workflows.
   */
  async discoverCrossDomainConnections(entityId, maxHops = 3) {
    if (!entityId) throw new Error('entityId is required to discover cross-domain connections');

    const origin = await get('SELECT * FROM graph_entities WHERE id = ?', [entityId]);
    if (!origin) throw new Error(`Entity ${entityId} not found in knowledge graph`);

    // Multi-hop traversal gathering connected entities across different domains
    const visited = new Set([entityId]);
    const domainBuckets = {
      project: [],
      skill: [],
      research: [],
      goal: [],
      mission: [],
      decision: [],
      file: [],
      agent: [],
      workflow: [],
      other: []
    };

    let currentLevel = [entityId];
    for (let hop = 1; hop <= maxHops; hop++) {
      if (currentLevel.length === 0) break;
      const placeholders = currentLevel.map(() => '?').join(',');
      const edges = await query(
        `SELECT r.*, 
                e1.entity_type as src_type, e1.name as src_name,
                e2.entity_type as tgt_type, e2.name as tgt_name
         FROM graph_relationships r
         JOIN graph_entities e1 ON (COALESCE(r.source_entity_id, r.source_id) = e1.id)
         JOIN graph_entities e2 ON (COALESCE(r.target_entity_id, r.target_id) = e2.id)
         WHERE COALESCE(r.source_entity_id, r.source_id) IN (${placeholders}) 
            OR COALESCE(r.target_entity_id, r.target_id) IN (${placeholders})`,
        [...currentLevel, ...currentLevel]
      );

      const nextLevel = [];
      for (const edge of edges) {
        const srcId = edge.source_entity_id || edge.source_id;
        const tgtId = edge.target_entity_id || edge.target_id;
        const neighborId = (srcId === entityId || visited.has(srcId)) ? tgtId : srcId;
        const neighborType = (srcId === entityId || visited.has(srcId)) ? edge.tgt_type : edge.src_type;
        const neighborName = (srcId === entityId || visited.has(srcId)) ? edge.tgt_name : edge.src_name;

        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          nextLevel.push(neighborId);

          const bucketKey = Object.keys(domainBuckets).find(k => (neighborType || '').toLowerCase().includes(k)) || 'other';
          domainBuckets[bucketKey].push({
            id: neighborId,
            name: neighborName,
            type: neighborType,
            hop_distance: hop,
            relationship: edge.relationship_type || edge.relation_type,
            weight: edge.weight,
            source_type: edge.source_type
          });
        }
      }
      currentLevel = nextLevel;
    }

    return {
      origin: { id: origin.id, name: origin.name, type: origin.entity_type || origin.type },
      cross_domain_connections: domainBuckets,
      total_connected_entities: visited.size - 1
    };
  }

  /**
   * Phase 13: Assesses knowledge freshness and rejects stale entries.
   * INVARIANT: Flags entities older than maxAgeDays as STALE (Invariant 6).
   */
  async assessKnowledgeFreshness(entityId, maxAgeDays = 30) {
    const entity = await get('SELECT * FROM graph_entities WHERE id = ?', [entityId]);
    if (!entity) throw new Error(`Entity ${entityId} not found`);

    const timestampStr = entity.updated_at || entity.created_at;
    const entityTimeMs = new Date(timestampStr).getTime();
    const ageDays = (Date.now() - entityTimeMs) / (1000 * 3600 * 24);
    const isStale = ageDays > maxAgeDays;

    return {
      entity_id: entityId,
      name: entity.name,
      timestamp: timestampStr,
      age_days: parseFloat(ageDays.toFixed(1)),
      max_allowed_days: maxAgeDays,
      is_stale: isStale,
      freshness_verdict: isStale ? 'STALE' : 'FRESH'
    };
  }

  /**
   * Phase 13: Source reliability tracking.
   */
  trackSourceReliability(sourceName, explicitScore = null) {
    if (!sourceName) return { source: 'unknown', reliability_score: 0.5, is_trusted: false };
    const s = sourceName.toLowerCase();

    if (s.includes('inferred') || s.includes('unverified') || s.includes('third_party')) {
      return { source: sourceName, reliability_score: explicitScore !== null ? explicitScore : 0.60, is_trusted: false };
    }
    if (s.includes('user_explicit') || s.includes('local_filesystem') || s.includes('system_core') || /\bverified\b/.test(s)) {
      return { source: sourceName, reliability_score: 1.0, is_trusted: true };
    }

    return { source: sourceName, reliability_score: explicitScore !== null ? explicitScore : 0.75, is_trusted: true };
  }

  /**
   * Phase 17: Connects people, projects, skills, interests, and objectives cleanly
   * while preserving provenance and confirmed vs inferred bounds.
   */
  async connectPersonalDomains({
    person = null,
    project = null,
    skill = null,
    interest = null,
    objective = null,
    source_type = 'user_explicit',
    confidence = 1.0
  } = {}) {
    const createdEntities = [];
    const createdLinks = [];

    const ensureEnt = async (spec, type) => {
      if (!spec) return null;
      const name = typeof spec === 'string' ? spec : spec.name;
      const props = typeof spec === 'object' ? (spec.properties || {}) : {};
      const ent = await this.upsertEntity({
        id: typeof spec === 'object' ? spec.id : undefined,
        name,
        entity_type: type,
        properties: props,
        source_type,
        confidence
      });
      createdEntities.push(ent);
      return ent;
    };

    const ePerson = await ensureEnt(person, 'person');
    const eProj = await ensureEnt(project, 'project');
    const eSkill = await ensureEnt(skill, 'skill');
    const eInterest = await ensureEnt(interest, 'interest');
    const eObj = await ensureEnt(objective, 'goal');

    const linkIfBoth = async (src, tgt, rel) => {
      if (src && tgt) {
        const edge = await this.addRelationship({
          source_entity_id: src.id,
          target_entity_id: tgt.id,
          relationship_type: rel,
          weight: source_type === 'inferred' ? Math.min(confidence, 0.70) : confidence,
          source_type
        });
        createdLinks.push(edge);
      }
    };

    await linkIfBoth(ePerson, eProj, 'COLLABORATES_ON_PROJECT');
    await linkIfBoth(ePerson, eSkill, 'POSSESSES_SKILL');
    await linkIfBoth(ePerson, eInterest, 'HAS_INTEREST');
    await linkIfBoth(eProj, eSkill, 'SKILL_REQUIRED_FOR_PROJECT');
    await linkIfBoth(eProj, eObj, 'ADVANCES_OBJECTIVE');
    await linkIfBoth(eInterest, eObj, 'INFORMS_OBJECTIVE');

    return {
      entities_connected: createdEntities.length,
      relationships_created: createdLinks.length,
      entities: createdEntities,
      relationships: createdLinks
    };
  }
}

export default new KnowledgeGraphService();
