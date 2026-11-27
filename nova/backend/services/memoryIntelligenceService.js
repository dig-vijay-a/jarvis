import { query, run, get } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';

export const VALID_CATEGORIES = [
  'Identity',
  'Preferences',
  'Work',
  'Routine',
  'Projects',
  'General'
];

export class MemoryIntelligenceService {
  /**
   * Tokenizes text into normalized word stems for relevance matching
   */
  static tokenize(text) {
    if (!text) return new Set();
    const str = typeof text === 'string' ? text : (text.objective || text.content || JSON.stringify(text));
    const clean = str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = clean.split(/\s+/).filter(w => w.length > 2);
    // Remove common stopwords
    const stopwords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'what', 'your', 'about', 'some', 'does', 'like']);
    const stemmed = tokens
      .filter(t => !stopwords.has(t))
      .map(t => {
        if (t.endsWith('ing') && t.length > 5) return t.slice(0, -3);
        if (t.endsWith('es') && t.length > 4) return t.slice(0, -2);
        if (t.endsWith('ed') && t.length > 4) return t.slice(0, -2);
        if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) return t.slice(0, -1);
        return t;
      });
    return new Set(stemmed);
  }

  /**
   * Calculates Jaccard token similarity score between 0 and 1
   */
  static calculateSimilarity(textA, textB) {
    const tokensA = this.tokenize(textA);
    const tokensB = this.tokenize(textB);
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersection = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) intersection++;
    }
    const union = new Set([...tokensA, ...tokensB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Checks if a similar memory already exists to prevent duplicate clutter
   */
  static async detectDuplicate(key, value) {
    const allMemories = await query('SELECT * FROM memories');
    for (const mem of allMemories) {
      // If exact key match
      if (key.trim().toLowerCase() === mem.key.trim().toLowerCase()) {
        return { isDuplicate: true, existingMemory: mem, similarity: 1.0, reason: 'Exact key match' };
      }

      const keySim = this.calculateSimilarity(key, mem.key);
      const valSim = this.calculateSimilarity(value, mem.value);
      const combinedSim = this.calculateSimilarity(`${key} ${value}`, `${mem.key} ${mem.value}`);
      const crossSim1 = this.calculateSimilarity(key, mem.value);
      const crossSim2 = this.calculateSimilarity(value, mem.key);

      const maxSim = Math.max(keySim, valSim, combinedSim, crossSim1, crossSim2);

      if (maxSim >= 0.4 || keySim > 0.5 || valSim > 0.4 || combinedSim > 0.35) {
        return { isDuplicate: true, existingMemory: mem, similarity: maxSim, reason: 'High conceptual similarity' };
      }
    }

    return { isDuplicate: false, existingMemory: null, similarity: 0 };
  }

  /**
   * Creates or updates a memory with duplicate checking and source auditing
   */
  static async storeMemory({ key, value, category = 'General', importance = 2, source = 'user_explicit', forceUpdate = false }) {
    if (!key || !value) {
      throw new Error('Memory key and value are required.');
    }

    const validatedCategory = VALID_CATEGORIES.includes(category) ? category : 'General';
    const validatedImportance = Math.max(1, Math.min(5, parseInt(importance, 10) || 2));
    const now = new Date().toISOString();

    const dupCheck = await this.detectDuplicate(key, value);
    if (dupCheck.isDuplicate) {
      if (forceUpdate) {
        // Update existing memory
        await run(
          'UPDATE memories SET value = ?, category = ?, importance = ?, source = ?, updated_at = ? WHERE id = ?',
          [value.trim(), validatedCategory, validatedImportance, source, now, dupCheck.existingMemory.id]
        );
        return {
          id: dupCheck.existingMemory.id,
          key: dupCheck.existingMemory.key,
          value: value.trim(),
          category: validatedCategory,
          importance: validatedImportance,
          source,
          updated: true,
          message: `Updated existing memory: "${key}"`
        };
      } else {
        return {
          id: dupCheck.existingMemory.id,
          key: dupCheck.existingMemory.key,
          existingValue: dupCheck.existingMemory.value,
          duplicate: true,
          similarity: dupCheck.similarity,
          message: `Memory similar to "${dupCheck.existingMemory.key}" already exists.`
        };
      }
    }

    const id = `mem-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await run(
      'INSERT INTO memories (id, key, value, category, importance, source, access_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
      [id, key.trim(), value.trim(), validatedCategory, validatedImportance, source, now, now]
    );

    return {
      id,
      key: key.trim(),
      value: value.trim(),
      category: validatedCategory,
      importance: validatedImportance,
      source,
      created: true,
      message: `Committed new memory to bank: "${key}"`
    };
  }

  static isPrivateMemoryRecord(mem = {}) {
    const combined = `${mem.key || ''} ${mem.value || ''} ${mem.category || ''}`;
    return /\b(?:password|passwd|secret|api[_-]?key|private[_-]?key|bearer|ssn|cvv|credit\s*card|bank\s*account)\b/i.test(combined) ||
      String(mem.category || '').toLowerCase() === 'private_credentials';
  }

  /**
   * Retrieves relevant contextual memories scoring against the current user prompt (Phase 15 P4)
   */
  static async retrieveRelevantMemories(promptText, limit = 6, options = {}) {
    const { minScore = 0.0, excludeSensitive = true } = options || {};
    const allMemories = await query('SELECT * FROM memories ORDER BY importance DESC, updated_at DESC');
    if (allMemories.length === 0) return [];

    const filteredMemories = excludeSensitive
      ? allMemories.filter(m => !this.isPrivateMemoryRecord(m))
      : allMemories;

    const promptTokens = this.tokenize(promptText);
    const now = Date.now();

    const scoredMemories = filteredMemories.map(mem => {
      // 1. Keyword overlap
      const memTokens = this.tokenize(`${mem.key} ${mem.value} ${mem.category}`);
      let overlapCount = 0;
      for (const t of promptTokens) {
        if (memTokens.has(t)) overlapCount++;
      }
      const keywordScore = promptTokens.size > 0 ? (overlapCount / promptTokens.size) : 0;

      // 2. Importance score (normalized 0 to 1 from 1-5 scale)
      const importanceScore = (mem.importance || 2) / 5;

      // 3. Recency factor
      const ageHours = (now - new Date(mem.updated_at || mem.created_at).getTime()) / (1000 * 3600);
      const recencyScore = Math.max(0, 1 - (ageHours / 168)); // decay over 1 week

      // Total composite relevance
      // High importance memories (importance >= 4) receive a baseline boost only when topically relevant or prompt empty
      const baseBoost = (mem.importance >= 4 && (overlapCount > 0 || promptTokens.size === 0)) ? 0.35 : 0;
      const compositeScore = (keywordScore * 0.5) + (importanceScore * 0.25) + (recencyScore * 0.15) + baseBoost;

      return {
        ...mem,
        relevanceScore: parseFloat(compositeScore.toFixed(3)),
        keywordOverlap: overlapCount,
        provenance: {
          source: mem.source || 'user_explicit',
          category: mem.category || 'General',
          updated_at: mem.updated_at || mem.created_at
        }
      };
    });

    // Sort by composite score descending
    scoredMemories.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Filter by minScore and deduplicate near-identical entries
    const selected = [];
    for (const candidate of scoredMemories) {
      if (selected.length >= limit) break;
      if (minScore > 0 && candidate.relevanceScore < minScore && candidate.keywordOverlap === 0) continue;
      const isNearDup = selected.some(existing =>
        this.calculateSimilarity(`${existing.key} ${existing.value}`, `${candidate.key} ${candidate.value}`) >= 0.5
      );
      if (!isNearDup) selected.push(candidate);
    }

    // Asynchronously record access for telemetry
    const nowIso = new Date().toISOString();
    for (const m of selected) {
      run(
        'UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?',
        [nowIso, m.id]
      ).catch(() => {});
    }

    return selected;
  }

  /**
   * Analyzes conversation turn to infer long-term facts worth remembering
   */
  static inferFactFromConversation(userText) {
    const text = userText.trim();
    // Explicit trigger patterns
    const rememberMatch = text.match(/(?:remember that|remember this|don't forget that|keep in mind that)\s+(.+)/i);
    if (rememberMatch) {
      const fact = rememberMatch[1].trim();
      return {
        shouldStore: true,
        key: fact.slice(0, 35) + (fact.length > 35 ? '...' : ''),
        value: fact,
        category: 'Preferences',
        importance: 3,
        source: 'conversation_inferred'
      };
    }

    // "My favorite X is Y"
    const favMatch = text.match(/my favorite (\w+) is (.+)/i);
    if (favMatch) {
      return {
        shouldStore: true,
        key: `Favorite ${favMatch[1]}`,
        value: favMatch[2].trim(),
        category: 'Preferences',
        importance: 3,
        source: 'conversation_inferred'
      };
    }

    // "I am working on X"
    const projectMatch = text.match(/i am working on (?:a |the )?(.+)/i);
    if (projectMatch) {
      return {
        shouldStore: true,
        key: `Active Project`,
        value: projectMatch[1].trim(),
        category: 'Projects',
        importance: 3,
        source: 'conversation_inferred'
      };
    }

    return { shouldStore: false };
  }
}

export default MemoryIntelligenceService;
