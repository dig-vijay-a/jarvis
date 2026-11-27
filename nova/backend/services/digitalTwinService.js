import { query, run, get } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import KnowledgeGraphService from './knowledgeGraphService.js';

export const TWIN_CATEGORIES = [
  'preferences',
  'skills',
  'objectives',
  'goals',
  'constraints',
  'interests',
  'projects',
  'routines',
  'priorities',
  'people'
];

const PRIVATE_TWIN_KEY_REGEX = /\b(?:password|passcode|pin|secret|api[_-]?key|private[_-]?key|credential|token|ssn|bank|salary|medical)\b/i;

export class DigitalTwinService {
  isPrivateEntry(row) {
    if (!row) return false;
    let meta = {};
    try {
      meta = row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : {};
    } catch (_) {}
    if (meta.is_private === true || meta.private === true) return true;
    const cat = String(row.category || row.facet_type || '').toLowerCase();
    if (cat.includes('private') || cat.includes('credential') || cat.includes('secret')) return true;
    return PRIVATE_TWIN_KEY_REGEX.test(`${row.title || row.key || ''} ${row.content || row.value || ''}`);
  }

  /**
   * Normalizes category names to standard plural keys
   */
  normalizeCategory(cat) {
    if (!cat) return 'preferences';
    const c = cat.toLowerCase().trim();
    if (c === 'preference') return 'preferences';
    if (c === 'skill') return 'skills';
    if (c === 'objective') return 'objectives';
    if (c === 'goal') return 'goals';
    if (c === 'constraint') return 'constraints';
    if (c === 'interest') return 'interests';
    if (c === 'project') return 'projects';
    if (c === 'routine') return 'routines';
    if (c === 'priority') return 'priorities';
    if (c === 'person' || c === 'people') return 'people';
    return c;
  }

  /**
   * Retrieves all digital twin profile items grouped by category
   */
  async getFullTwinProfile(filter = {}) {
    let sql = 'SELECT * FROM digital_twin_profiles';
    const params = [];
    const conditions = [];

    if (filter.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter.is_confirmed !== undefined) {
      conditions.push('is_confirmed = ?');
      params.push(filter.is_confirmed ? 1 : 0);
    }
    if (filter.is_enabled !== undefined) {
      conditions.push('is_enabled = ?');
      params.push(filter.is_enabled ? 1 : 0);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY priority DESC, confidence DESC, created_at ASC';

    const rows = await query(sql, params);
    const grouped = {};
    for (const cat of TWIN_CATEGORIES) {
      grouped[cat] = [];
    }

    for (const r of rows) {
      if (filter.excludePrivate && this.isPrivateEntry(r)) {
        continue;
      }
      const cat = this.normalizeCategory(r.category || r.facet_type);
      const tit = r.title || r.key;
      const cnt = r.content || r.value;
      const isEnabled = r.is_enabled !== undefined ? Boolean(r.is_enabled) : Boolean(r.is_active);
      const isConfirmed = r.is_confirmed !== undefined ? Boolean(r.is_confirmed) : (r.source === 'user_explicit');
      const src = r.source || r.provenance || 'user_explicit';
      const conf = r.confidence !== undefined && r.confidence !== null ? Number(r.confidence) : (isConfirmed ? 1.0 : 0.75);

      const parsedHistory = r.user_correction_history ? (typeof r.user_correction_history === 'string' ? JSON.parse(r.user_correction_history) : r.user_correction_history) : [];
      const parsedMetadata = r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : {};

      const item = {
        ...r,
        id: r.id,
        category: cat,
        title: tit,
        content: cnt,
        priority: r.priority || 2,
        is_enabled: isEnabled,
        is_confirmed: isConfirmed,
        source: src,
        confidence: conf,
        last_confirmed_at: r.last_confirmed_at || null,
        expiration_policy: r.expiration_policy || 'permanent',
        expires_at: r.expires_at || null,
        review_before: r.review_before || null,
        user_correction_history: parsedHistory,
        status: r.status || 'ACTIVE',
        metadata: parsedMetadata
      };

      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    }

    return grouped;
  }

  /**
   * Retrieves a single entry by ID
   */
  async getEntryById(id) {
    const r = await get('SELECT * FROM digital_twin_profiles WHERE id = ?', [id]);
    if (!r) return null;

    const cat = this.normalizeCategory(r.category || r.facet_type);
    const isConfirmed = r.is_confirmed !== undefined ? Boolean(r.is_confirmed) : (r.source === 'user_explicit');
    const conf = r.confidence !== undefined && r.confidence !== null ? Number(r.confidence) : (isConfirmed ? 1.0 : 0.75);

    return {
      ...r,
      category: cat,
      title: r.title || r.key,
      content: r.content || r.value,
      is_enabled: Boolean(r.is_enabled ?? r.is_active ?? 1),
      is_confirmed: isConfirmed,
      source: r.source || r.provenance || 'user_explicit',
      confidence: conf,
      user_correction_history: r.user_correction_history ? JSON.parse(r.user_correction_history) : [],
      metadata: r.metadata ? JSON.parse(r.metadata) : {}
    };
  }

  /**
   * Adds a structured digital twin entry with provenance, confidence, and confirmation flag
   */
  async createEntry({
    category,
    title,
    content,
    priority = 2,
    source = 'user_explicit',
    confidence = null,
    is_confirmed = null,
    expiration_policy = 'permanent',
    expires_at = null,
    review_before = null,
    metadata = {}
  }) {
    if (!category || !title || !content) {
      throw new Error('category, title, and content are required');
    }

    const normCat = this.normalizeCategory(category);
    if (!TWIN_CATEGORIES.includes(normCat)) {
      throw new Error(`Invalid category. Must be one of: ${TWIN_CATEGORIES.join(', ')}`);
    }

    const id = `twin-${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();

    const explicitlyConfirmed = is_confirmed !== null ? (is_confirmed ? 1 : 0) : (source === 'user_explicit' ? 1 : 0);
    const resolvedConfidence = confidence !== null ? Number(confidence) : (explicitlyConfirmed ? 1.0 : 0.75);
    const lastConfirmedAt = explicitlyConfirmed ? now : null;

    await run(
      `INSERT INTO digital_twin_profiles 
      (id, category, facet_type, title, key, content, value, priority, is_enabled, is_active, source, provenance, confidence, is_confirmed, last_confirmed_at, expiration_policy, expires_at, review_before, user_correction_history, status, metadata, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'ACTIVE', ?, ?, ?)`,
      [
        id,
        normCat,
        normCat,
        title.trim(),
        title.trim(),
        content.trim(),
        content.trim(),
        priority,
        source,
        source,
        resolvedConfidence,
        explicitlyConfirmed,
        lastConfirmedAt,
        expiration_policy,
        expires_at,
        review_before,
        JSON.stringify(metadata || {}),
        now,
        now
      ]
    );

    // Sync to Knowledge Graph ONLY for non-private entries
    if (!this.isPrivateEntry({ category: normCat, title, content, metadata })) {
      try {
        let entityType = 'concept';
        if (normCat === 'projects') entityType = 'project';
        else if (normCat === 'goals' || normCat === 'objectives') entityType = 'goal';
        else if (normCat === 'skills') entityType = 'skill';
        else if (normCat === 'preferences') entityType = 'preference';
        else if (normCat === 'constraints') entityType = 'constraint';
        else if (normCat === 'routines') entityType = 'routine';
        else if (normCat === 'interests') entityType = 'interest';
        else if (normCat === 'people') entityType = 'person';

        await KnowledgeGraphService.upsertEntity({
          id: `ent-${id}`,
          name: title.trim(),
          entity_type: entityType,
          source_type: source,
          confidence: resolvedConfidence,
          properties: {
            twin_id: id,
            category: normCat,
            content: content.trim(),
            is_confirmed: Boolean(explicitlyConfirmed),
            priority
          }
        });
      } catch (gErr) {
        console.warn('[DigitalTwin] Knowledge graph link note:', gErr.message);
      }
    }

    return {
      id,
      category: normCat,
      title: title.trim(),
      content: content.trim(),
      priority,
      is_enabled: true,
      is_confirmed: Boolean(explicitlyConfirmed),
      source,
      confidence: resolvedConfidence,
      last_confirmed_at: lastConfirmedAt,
      expiration_policy,
      created_at: now,
      updated_at: now
    };
  }

  /**
   * Updates an existing digital twin entry
   */
  async updateEntry(id, { title, content, priority, is_enabled, confidence, is_confirmed, expiration_policy, status, reason = '' }) {
    const existing = await get('SELECT * FROM digital_twin_profiles WHERE id = ?', [id]);
    if (!existing) throw new Error('Digital twin entry not found');

    const updatedTitle = title !== undefined ? title.trim() : (existing.title || existing.key);
    const updatedContent = content !== undefined ? content.trim() : (existing.content || existing.value);
    const updatedPriority = priority !== undefined ? priority : existing.priority;
    const updatedEnabled = is_enabled !== undefined ? (is_enabled ? 1 : 0) : (existing.is_enabled ?? existing.is_active ?? 1);
    const updatedConfidence = confidence !== undefined ? Number(confidence) : (existing.confidence || 1.0);
    const updatedConfirmed = is_confirmed !== undefined ? (is_confirmed ? 1 : 0) : (existing.is_confirmed ?? 1);
    const updatedPolicy = expiration_policy !== undefined ? expiration_policy : (existing.expiration_policy || 'permanent');
    const updatedStatus = status !== undefined ? status : (existing.status || 'ACTIVE');
    const now = new Date().toISOString();

    // Check if content or title changed -> record user correction history
    let history = existing.user_correction_history ? JSON.parse(existing.user_correction_history) : [];
    if ((title !== undefined && title.trim() !== (existing.title || existing.key)) ||
        (content !== undefined && content.trim() !== (existing.content || existing.value))) {
      history.push({
        timestamp: now,
        previous_title: existing.title || existing.key,
        previous_content: existing.content || existing.value,
        new_title: updatedTitle,
        new_content: updatedContent,
        reason: reason || 'User update/correction'
      });
    }

    const lastConfirmedAt = updatedConfirmed ? now : existing.last_confirmed_at;

    await run(
      `UPDATE digital_twin_profiles 
       SET title = ?, key = ?, content = ?, value = ?, priority = ?, is_enabled = ?, is_active = ?, confidence = ?, is_confirmed = ?, last_confirmed_at = ?, expiration_policy = ?, status = ?, user_correction_history = ?, updated_at = ? 
       WHERE id = ?`,
      [
        updatedTitle,
        updatedTitle,
        updatedContent,
        updatedContent,
        updatedPriority,
        updatedEnabled,
        updatedEnabled,
        updatedConfidence,
        updatedConfirmed,
        lastConfirmedAt,
        updatedPolicy,
        updatedStatus,
        JSON.stringify(history),
        now,
        id
      ]
    );

    // Update Knowledge Graph if present
    try {
      const graphEnt = await get('SELECT id FROM graph_entities WHERE id = ? OR name = ?', [`ent-${id}`, existing.title]);
      if (graphEnt) {
        await KnowledgeGraphService.correctEntity(graphEnt.id, {
          name: updatedTitle,
          confidence: updatedConfidence,
          properties: { content: updatedContent, priority: updatedPriority, is_confirmed: Boolean(updatedConfirmed) }
        });
      }
    } catch (_) {}

    return {
      id,
      category: this.normalizeCategory(existing.category || existing.facet_type),
      title: updatedTitle,
      content: updatedContent,
      priority: updatedPriority,
      is_enabled: Boolean(updatedEnabled),
      is_confirmed: Boolean(updatedConfirmed),
      confidence: updatedConfidence,
      last_confirmed_at: lastConfirmedAt,
      user_correction_history: history,
      status: updatedStatus,
      updated_at: now
    };
  }

  /**
   * Explicit user correction for a fact: preserves provenance and updates correction history
   */
  async correctFact(id, { new_title, new_content, title, content, reason = 'Explicit user correction' }) {
    const targetContent = new_content !== undefined ? new_content : content;
    const targetTitle = new_title !== undefined ? new_title : title;
    if (!targetContent && !targetTitle) {
      throw new Error('new_content or new_title is required for correction');
    }
    return this.updateEntry(id, {
      title: targetTitle,
      content: targetContent,
      is_confirmed: true,
      confidence: 1.0,
      reason
    });
  }

  /**
   * Explicitly confirms an inferred fact
   */
  async confirmFact(id) {
    const existing = await get('SELECT * FROM digital_twin_profiles WHERE id = ?', [id]);
    if (!existing) throw new Error('Fact not found');

    const now = new Date().toISOString();
    await run(
      `UPDATE digital_twin_profiles 
       SET is_confirmed = 1, confidence = 1.0, last_confirmed_at = ?, status = 'ACTIVE', updated_at = ? 
       WHERE id = ?`,
      [now, now, id]
    );

    return { id, is_confirmed: true, confidence: 1.0, last_confirmed_at: now };
  }

  /**
   * Identifies stale information based on age and review policy
   */
  async detectStaleEntries(thresholdDays = 30) {
    const all = await query(
      "SELECT * FROM digital_twin_profiles WHERE status != 'ARCHIVED'"
    );

    const nowMs = Date.now();
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const staleList = [];

    for (const r of all) {
      if (r.expiration_policy === 'permanent') continue;

      const baseDateStr = r.last_confirmed_at || r.updated_at || r.created_at;
      const baseMs = new Date(baseDateStr).getTime();
      const ageDays = (nowMs - baseMs) / (24 * 60 * 60 * 1000);

      const hasExpired = r.expires_at && new Date(r.expires_at).getTime() <= nowMs;
      const needsReview = r.review_before && new Date(r.review_before).getTime() <= nowMs;
      const exceededAge = (nowMs - baseMs) > thresholdMs;

      if (hasExpired || needsReview || exceededAge) {
        staleList.push({
          id: r.id,
          category: this.normalizeCategory(r.category || r.facet_type),
          title: r.title || r.key,
          content: r.content || r.value,
          age_days: Math.round(ageDays),
          is_confirmed: Boolean(r.is_confirmed),
          expiration_policy: r.expiration_policy || 'review_30d',
          reason: hasExpired ? 'Expired' : (needsReview ? 'Review deadline passed' : `Unconfirmed for ${Math.round(ageDays)} days`)
        });
      }
    }

    return staleList;
  }

  /**
   * Detects mutually conflicting or contradictory facts in the twin profile
   */
  async detectConflictingEntries() {
    const all = await query(
      "SELECT * FROM digital_twin_profiles WHERE is_enabled = 1 AND status != 'ARCHIVED'"
    );

    const conflicts = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        if (this.isPrivateEntry(a) || this.isPrivateEntry(b)) continue;
        const catA = this.normalizeCategory(a.category || a.facet_type);
        const catB = this.normalizeCategory(b.category || b.facet_type);

        if (catA !== catB) continue;

        const titleA = (a.title || a.key || '').toLowerCase();
        const titleB = (b.title || b.key || '').toLowerCase();
        const contentA = (a.content || a.value || '').toLowerCase();
        const contentB = (b.content || b.value || '').toLowerCase();

        // 1. Direct key collision or normalized subject collision with differing values
        const sameSubject = titleA === titleB || (titleA.length >= 5 && titleB.length >= 5 && (titleA.includes(titleB) || titleB.includes(titleA)));
        if (sameSubject && contentA !== contentB) {
          conflicts.push({
            type: 'CONTRADICTORY_VALUE',
            category: catA,
            entity_a: { id: a.id, title: a.title, content: a.content, source: a.source, is_confirmed: Boolean(a.is_confirmed) },
            entity_b: { id: b.id, title: b.title, content: b.content, source: b.source, is_confirmed: Boolean(b.is_confirmed) },
            reason: `Conflicting values between '${a.title}' and '${b.title}'`
          });
        }

        // 2. Semantic negation / mutually exclusive keywords detection
        const hasOpposingDirectives =
          (contentA.includes('dark') && contentB.includes('light')) ||
          (contentA.includes('never') && contentB.includes('always')) ||
          (contentA.includes('disable') && contentB.includes('enable')) ||
          (contentA.includes('forbid') && contentB.includes('permit')) ||
          (contentA.includes('local') && contentB.includes('cloud')) ||
          (contentA.includes('postgres') && contentB.includes('mysql'));

        if (hasOpposingDirectives && (sameSubject || catA === 'preferences' || catA === 'constraints')) {
          conflicts.push({
            type: 'OPPOSING_DIRECTIVES',
            category: catA,
            entity_a: { id: a.id, title: a.title, content: a.content, source: a.source, is_confirmed: Boolean(a.is_confirmed) },
            entity_b: { id: b.id, title: b.title, content: b.content, source: b.source, is_confirmed: Boolean(b.is_confirmed) },
            reason: `Opposing directives detected between '${a.title}' and '${b.title}'`
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Cross-store contradiction & provenance check between Digital Twin, Long-Term Memories, and Knowledge Graph.
   */
  async detectCrossStoreContradictions() {
    const twinConflicts = await this.detectConflictingEntries();
    const graphConflicts = await KnowledgeGraphService.detectGraphContradictions();
    const twinAll = await query("SELECT * FROM digital_twin_profiles WHERE is_enabled = 1 AND status != 'ARCHIVED'");
    const memAll = await query("SELECT id, key, value, category, source, importance FROM memories");

    const crossConflicts = [];
    for (const tw of twinAll) {
      if (this.isPrivateEntry(tw)) continue;
      const twTitle = String(tw.title || tw.key || '').toLowerCase();
      const twVal = String(tw.content || tw.value || '').toLowerCase();
      for (const mem of memAll) {
        const memKey = String(mem.key || '').toLowerCase();
        const memVal = String(mem.value || '').toLowerCase();
        if (PRIVATE_TWIN_KEY_REGEX.test(`${memKey} ${memVal}`) || String(mem.category || '').toLowerCase().includes('private')) continue;

        const keyOverlap = (twTitle === memKey) || (twTitle.length >= 6 && (memKey.includes(twTitle) || twTitle.includes(memKey)));
        if (keyOverlap && twVal && memVal && twVal !== memVal && !memVal.includes(twVal) && !twVal.includes(memVal)) {
          crossConflicts.push({
            type: 'CROSS_STORE_CONTRADICTION',
            twin: { id: tw.id, title: tw.title, content: tw.content, source: tw.source, is_confirmed: Boolean(tw.is_confirmed) },
            memory: { id: mem.id, key: mem.key, value: mem.value, source: mem.source },
            reason: `Digital Twin '${tw.title}' ("${tw.content}") differs from Memory '${mem.key}' ("${mem.value}")`
          });
        }
      }
    }

    return {
      total_conflicts: twinConflicts.length + graphConflicts.length + crossConflicts.length,
      twin_conflicts: twinConflicts,
      graph_conflicts: graphConflicts,
      cross_store_conflicts: crossConflicts
    };
  }

  /**
   * Reconciles a fact by updating the accepted version and archiving or revising others
   */
  async reconcileFact(factId, resolvedContent, reason = 'Reconciled user conflict') {
    const existing = await get('SELECT * FROM digital_twin_profiles WHERE id = ?', [factId]);
    if (!existing) throw new Error('Fact not found');

    return this.updateEntry(factId, {
      content: resolvedContent,
      is_confirmed: true,
      confidence: 1.0,
      status: 'ACTIVE',
      reason
    });
  }

  /**
   * Toggle enable / disable status of a profile entry
   */
  async toggleEntry(id, is_enabled) {
    const enabledVal = is_enabled ? 1 : 0;
    const now = new Date().toISOString();
    const res = await run(
      'UPDATE digital_twin_profiles SET is_enabled = ?, is_active = ?, updated_at = ? WHERE id = ?',
      [enabledVal, enabledVal, now, id]
    );
    if (res.changes === 0) throw new Error('Entry not found');
    return { id, is_enabled: Boolean(enabledVal) };
  }

  /**
   * Delete an entry
   */
  async deleteEntry(id) {
    const res = await run('DELETE FROM digital_twin_profiles WHERE id = ?', [id]);
    return res.changes > 0;
  }

  /**
   * Formats active enabled twin elements into a Markdown context string for system prompts
   */
  async getFormattedContextForPrompt() {
    const grouped = await this.getFullTwinProfile({ is_enabled: true, excludePrivate: true });
    let promptSections = [];

    const formatList = (items) => items
      .filter(i => i.is_enabled)
      .map(i => {
        const confBadge = i.is_confirmed ? '[CONFIRMED]' : `[INFERRED ${Math.round(i.confidence * 100)}%]`;
        return `- ${confBadge} [P${i.priority}] ${i.title}: ${i.content}`;
      })
      .join('\n');

    if (grouped.objectives && grouped.objectives.length > 0) {
      promptSections.push(`### USER LONG-TERM OBJECTIVES\n${formatList(grouped.objectives)}`);
    }
    if (grouped.goals && grouped.goals.length > 0) {
      promptSections.push(`### ACTIVE SHORT-TERM GOALS\n${formatList(grouped.goals)}`);
    }
    if (grouped.projects && grouped.projects.length > 0) {
      promptSections.push(`### ACTIVE PROJECTS\n${formatList(grouped.projects)}`);
    }
    if (grouped.constraints && grouped.constraints.length > 0) {
      promptSections.push(`### OPERATIONAL CONSTRAINTS & BOUNDARIES\n${formatList(grouped.constraints)}`);
    }
    if (grouped.preferences && grouped.preferences.length > 0) {
      promptSections.push(`### USER PREFERENCES & PROTOCOLS\n${formatList(grouped.preferences)}`);
    }
    if (grouped.skills && grouped.skills.length > 0) {
      promptSections.push(`### VERIFIED USER SKILLS & CAPABILITIES\n${formatList(grouped.skills)}`);
    }
    if (grouped.routines && grouped.routines.length > 0) {
      promptSections.push(`### OPERATIONAL ROUTINES\n${formatList(grouped.routines)}`);
    }

    return promptSections.join('\n\n');
  }
}

export default new DigitalTwinService();

