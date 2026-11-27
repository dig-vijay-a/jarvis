import { query, run, get } from '../database/db.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

export class KnowledgeEngineService {
  /**
   * Tokenizes text into normalized word stems for vector representation
   */
  static tokenize(text) {
    if (!text || typeof text !== 'string') return {};
    const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const words = clean.split(/\s+/).filter(w => w.length > 2);
    const stopwords = new Set([
      'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'what', 'your',
      'about', 'some', 'does', 'like', 'which', 'their', 'there', 'been', 'were'
    ]);

    const termFreq = {};
    for (const w of words) {
      if (stopwords.has(w)) continue;
      // Simple stem
      let stem = w;
      if (stem.endsWith('ing') && stem.length > 5) stem = stem.slice(0, -3);
      else if (stem.endsWith('es') && stem.length > 4) stem = stem.slice(0, -2);
      else if (stem.endsWith('ed') && stem.length > 4) stem = stem.slice(0, -2);
      else if (stem.endsWith('s') && !stem.endsWith('ss') && stem.length > 3) stem = stem.slice(0, -1);

      termFreq[stem] = (termFreq[stem] || 0) + 1;
    }
    return termFreq;
  }

  /**
   * Calculates cosine similarity between two term-frequency vector maps
   */
  static calculateVectorCosine(vecA, vecB) {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (const term in vecA) {
      const valA = vecA[term];
      normA += valA * valA;
      if (vecB[term]) {
        dot += valA * vecB[term];
      }
    }

    for (const term in vecB) {
      const valB = vecB[term];
      normB += valB * valB;
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Splits long document text into overlapping chunks
   */
  static chunkText(text, chunkSize = 800, overlap = 150) {
    if (!text) return [];
    const chunks = [];
    let start = 0;

    while (start < text.length) {
      let end = start + chunkSize;
      if (end >= text.length) {
        chunks.push(text.slice(start).trim());
        break;
      }

      // Try breaking at a paragraph or sentence boundary
      const boundary = text.lastIndexOf('\n', end);
      const sentenceBoundary = text.lastIndexOf('. ', end);

      if (boundary > start + chunkSize * 0.6) {
        end = boundary;
      } else if (sentenceBoundary > start + chunkSize * 0.6) {
        end = sentenceBoundary + 1;
      }

      const chunk = text.slice(start, end).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
      start = end - overlap;
    }

    return chunks;
  }

  /**
   * Ingests, parses, chunks, and vector-indexes a document
   */
  static async ingestDocument({ filename, filepath, content, filetype }) {
    if (!filename) throw new Error('Document filename is required.');

    let textContent = content || '';

    // If content wasn't supplied directly, attempt reading from disk or python agent
    if (!textContent && filepath) {
      try {
        if (fs.existsSync(filepath)) {
          textContent = fs.readFileSync(filepath, 'utf8');
        }
      } catch (readErr) {
        console.warn('[KnowledgeEngine] Direct disk read failed, falling back to agent:', readErr.message);
      }

      if (!textContent) {
        try {
          const cfgRow = await get("SELECT value FROM settings WHERE key = 'python_agent_url'");
          const tokenRow = await get("SELECT value FROM settings WHERE key = 'python_agent_token'");
          const agentUrl = cfgRow?.value || 'http://localhost:8000';
          const agentToken = tokenRow?.value || 'nova-local-agent-secure-token-2026';

          const res = await axios.post(`${agentUrl}/api/action/read-file`, { file_path: filepath }, {
            headers: { Authorization: `Bearer ${agentToken}` },
            timeout: 8000
          });
          if (res.data?.success && res.data?.content) {
            textContent = res.data.content;
          }
        } catch (agentErr) {
          console.warn('[KnowledgeEngine] Python agent read error:', agentErr.message);
        }
      }
    }

    if (!textContent || !textContent.trim()) {
      throw new Error(`Could not extract text content for document "${filename}".`);
    }

    const docId = `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    const ext = filetype || path.extname(filename).toLowerCase().replace('.', '') || 'txt';
    const chunks = this.chunkText(textContent);

    // Save document master record
    await run(
      `INSERT INTO documents (id, filename, filepath, filetype, filesize, chunk_count, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [docId, filename, filepath || '', ext, textContent.length, chunks.length, now, now]
    );

    // Save vector chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const chunkId = `chunk-${docId}-${i + 1}`;
      const vectorTokens = this.tokenize(chunkText);
      const metadata = {
        document_id: docId,
        filename,
        chunk_index: i + 1,
        total_chunks: chunks.length,
        char_count: chunkText.length
      };

      await run(
        `INSERT INTO document_chunks (id, document_id, chunk_index, content, metadata, vector_tokens, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [chunkId, docId, i + 1, chunkText, JSON.stringify(metadata), JSON.stringify(vectorTokens), now]
      );
    }

    return {
      success: true,
      documentId: docId,
      filename,
      chunkCount: chunks.length,
      fileSizeChars: textContent.length,
      message: `Document "${filename}" ingested and indexed across ${chunks.length} vector chunks.`
    };
  }

  /**
   * Performs semantic vector similarity search against indexed document chunks
   */
  static async searchKnowledge(queryText, limit = 5) {
    if (!queryText || !queryText.trim()) return [];

    const queryVec = this.tokenize(queryText);
    const allChunks = await query('SELECT * FROM document_chunks');
    const scored = [];

    for (const c of allChunks) {
      let vec = {};
      try {
        vec = JSON.parse(c.vector_tokens || '{}');
      } catch (e) {
        continue;
      }

      const score = this.calculateVectorCosine(queryVec, vec);
      if (score > 0.05) {
        let meta = {};
        try { meta = JSON.parse(c.metadata || '{}'); } catch (e) {}
        scored.push({
          id: c.id,
          document_id: c.document_id,
          chunk_index: c.chunk_index,
          content: c.content,
          metadata: meta,
          score: Math.round(score * 1000) / 1000,
          citation: `[Source: ${meta.filename || 'Document'}, Chunk #${c.chunk_index}]`
        });
      }
    }

    // Sort descending by similarity score
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /**
   * Lists all indexed documents
   */
  static async listDocuments() {
    return query('SELECT * FROM documents ORDER BY created_at DESC');
  }

  /**
   * Deletes a document and all its indexed chunks
   */
  static async deleteDocument(documentId) {
    await run('DELETE FROM document_chunks WHERE document_id = ?', [documentId]);
    await run('DELETE FROM documents WHERE id = ?', [documentId]);
    return { success: true, message: `Document ${documentId} and associated vector chunks purged.` };
  }
}

export default KnowledgeEngineService;
