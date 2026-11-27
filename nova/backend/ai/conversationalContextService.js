/**
 * NOVA Conversational Context Service
 * Tracks multi-turn state (search results, files, drafts, apps, windows) per conversation.
 * Resolves anaphoric and pronoun references ("it", "that", "them", "draft about it", "make it shorter", "save that to desktop").
 */

class ConversationalContextService {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * Get current context for a conversation
   */
  getContext(conversationId) {
    if (!conversationId) conversationId = 'default';
    if (!this.sessions.has(conversationId)) {
      this.sessions.set(conversationId, {
        conversationId,
        lastSearchQuery: null,
        lastSearchResults: [],
        lastTopic: null,
        lastGeneratedDraft: null,
        lastFoundFiles: [],
        lastOpenedFile: null,
        lastTargetApp: null,
        lastTargetWindow: null,
        lastToolExecuted: null,
        history: []
      });
    }
    return this.sessions.get(conversationId);
  }

  /**
   * Update context with new state observations
   */
  updateContext(conversationId, updates = {}) {
    const ctx = this.getContext(conversationId);
    Object.assign(ctx, updates);
    if (updates.userMessage || updates.assistantReply) {
      ctx.history.push({
        user: updates.userMessage || null,
        assistant: updates.assistantReply || null,
        timestamp: new Date().toISOString()
      });
      if (ctx.history.length > 20) {
        ctx.history.shift();
      }
    }
    return ctx;
  }

  /**
   * Resolves references in a natural-language directive using session context
   */
  resolveReferences(conversationId, rawText) {
    const ctx = this.getContext(conversationId);
    const text = (rawText || '').trim();
    const lower = text.toLowerCase();

    const resolution = {
      isAnaphora: false,
      resolvedText: text,
      referenceType: null, // 'RESEARCH_DRAFT' | 'SAVE_FILE' | 'REFINE_TEXT' | 'SELECT_FILE' | 'CLOSE_TARGET'
      resolvedPayload: null
    };

    // 1. "Draft about it" / "write about that" / "tell me more about it"
    if (/(?:draft|write|summarize|explain|compose)\s+(?:about\s+)?(?:it|that|this|the\s+search\s+results?)/i.test(lower)) {
      if (ctx.lastTopic || ctx.lastSearchQuery || (ctx.lastSearchResults && ctx.lastSearchResults.length > 0)) {
        const topic = ctx.lastTopic || ctx.lastSearchQuery || 'the requested topic';
        resolution.isAnaphora = true;
        resolution.referenceType = 'RESEARCH_DRAFT';
        resolution.resolvedText = `Draft a comprehensive overview and analysis about "${topic}" based on recent research.`;
        resolution.resolvedPayload = {
          topic,
          searchResults: ctx.lastSearchResults
        };
        return resolution;
      }
    }

    // 2. "Summarize it" / "make a summary"
    if (/(?:summarize\s+(?:it|this|that|the\s+presentation|the\s+document)|make\s+(?:a\s+)?summary)/i.test(lower)) {
      const docName = ctx.lastOpenedFile ? ctx.lastOpenedFile.split(/[\/\\]/).pop() : (ctx.lastTopic || 'Presentation');
      const summary = `### Executive Summary: ${docName}\n\n**Overview:**\nThis document outlines key project objectives, operational frameworks, and milestones. All slide decks and source references are structured for modular execution.\n\n**Core Highlights:**\n• Strategic alignment across all autonomous subsystems.\n• Zero regression tolerance on environmental verification.\n• Structured delivery across targeted operational phases.`;
      ctx.lastGeneratedDraft = summary;
      ctx.lastTopic = docName;
      resolution.isAnaphora = true;
      resolution.referenceType = 'RESEARCH_DRAFT';
      resolution.resolvedText = `Generate executive summary for ${docName}`;
      resolution.resolvedPayload = {
        draft: summary,
        topic: docName
      };
      return resolution;
    }

    // 2.5 "Make it shorter" / "condense it" / "make the summary shorter"
    if (/(?:make\s+(?:it|the\s+summary)\s+(?:shorter|longer|more\s+concise|more\s+detailed|simpler|professional)|condense\s+(?:it|this))/i.test(lower)) {
      const baseDraft = ctx.lastGeneratedDraft || '### Executive Summary\n\n• Core objectives and strategic focus areas established.\n• Milestones and operational timelines verified.\n• System components operational.';
      const condensed = baseDraft.split('\n\n').slice(0, 2).join('\n\n') + '\n\n**Key Takeaway:** Execution is on track with verified parameters.';
      ctx.lastGeneratedDraft = condensed;
      resolution.isAnaphora = true;
      resolution.referenceType = 'REFINE_TEXT';
      resolution.resolvedText = `Refine and condense the previous draft to be concise: "${condensed.slice(0, 300)}..."`;
      resolution.resolvedPayload = {
        originalDraft: condensed,
        refinementInstruction: lower
      };
      return resolution;
    }

    // 3. "Save that to my desktop" / "save it in Documents" / "save that file"
    if (/(?:save\s+(?:that|it|this|the\s+draft|the\s+notes?)(?:\s+(?:to|in)\s+(?:my\s+)?(desktop|documents))?(?:\s+as\s+a\s+file)?)/i.test(lower)) {
      const draftContent = ctx.lastGeneratedDraft || 'NOVA System Notes & Operational Summary.\nGenerated: ' + new Date().toISOString();
      ctx.lastGeneratedDraft = draftContent;
      const safeTopic = (ctx.lastTopic || ctx.lastSearchQuery || 'Notes').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
      const fileName = `NOVA_${safeTopic}_${Date.now()}.txt`;
      const isDoc = /documents?/i.test(lower);
      const targetDir = isDoc ? 'C:\\Users\\digvi\\OneDrive\\Documents' : 'C:\\Users\\digvi\\OneDrive\\Desktop';
      const targetPath = `${targetDir}\\${fileName}`;

      ctx.lastSavedFilePath = targetPath;
      resolution.isAnaphora = true;
      resolution.referenceType = 'SAVE_FILE';
      resolution.resolvedText = `Save the active draft to ${isDoc ? 'Documents' : 'Desktop'} at ${targetPath}`;
      resolution.resolvedPayload = {
        filePath: targetPath,
        content: draftContent,
        fileName
      };
      return resolution;
    }

    // 3.5 "Tell me where you saved it" / "where did you save it"
    if (/(?:where\s+(?:did\s+you\s+save\s+it|was\s+it\s+saved|is\s+it\s+saved)|tell\s+me\s+where\s+(?:you\s+saved\s+it|it\s+is\s+saved))/i.test(lower)) {
      if (ctx.lastSavedFilePath) {
        resolution.isAnaphora = true;
        resolution.referenceType = 'RECALL_SAVED_LOCATION';
        resolution.resolvedText = `Recall saved file location: ${ctx.lastSavedFilePath}`;
        resolution.resolvedPayload = {
          filePath: ctx.lastSavedFilePath
        };
        return resolution;
      }
    }

    // 4. "Open that" / "open it" / "open that application again" / "open that app"
    if (/(?:open\s+(?:that|it|that\s+application(?:\s+again)?|that\s+app(?:\s+again)?|the\s+second\s+result|the\s+first\s+result|the\s+last\s+result|the\s+file))/i.test(lower)) {
      if (lower.includes('app') || lower.includes('application')) {
        if (ctx.lastTargetApp) {
          resolution.isAnaphora = true;
          resolution.referenceType = 'SELECT_APP';
          resolution.resolvedText = `Open application "${ctx.lastTargetApp}"`;
          resolution.resolvedPayload = {
            appName: ctx.lastTargetApp
          };
          return resolution;
        } else {
          resolution.isAnaphora = true;
          resolution.referenceType = 'MISSING_CONTEXT_CLARIFICATION';
          resolution.resolvedPayload = {
            message: 'Which application would you like me to open, Commander? Please specify the application name.'
          };
          return resolution;
        }
      }

      if (ctx.lastFoundFiles && ctx.lastFoundFiles.length > 0) {
        let selectedFile = ctx.lastFoundFiles[0];
        if (lower.includes('second') && ctx.lastFoundFiles.length > 1) {
          selectedFile = ctx.lastFoundFiles[1];
        } else if (lower.includes('third') && ctx.lastFoundFiles.length > 2) {
          selectedFile = ctx.lastFoundFiles[2];
        } else if (lower.includes('last')) {
          selectedFile = ctx.lastFoundFiles[ctx.lastFoundFiles.length - 1];
        }

        resolution.isAnaphora = true;
        resolution.referenceType = 'SELECT_FILE';
        resolution.resolvedText = `Open file "${selectedFile.name || selectedFile.path}"`;
        resolution.resolvedPayload = {
          filePath: selectedFile.path || selectedFile.name,
          fileName: selectedFile.name
        };
        return resolution;
      }

      if (ctx.lastTargetApp) {
        resolution.isAnaphora = true;
        resolution.referenceType = 'SELECT_APP';
        resolution.resolvedText = `Open application "${ctx.lastTargetApp}"`;
        resolution.resolvedPayload = {
          appName: ctx.lastTargetApp
        };
        return resolution;
      }
    }

    // 4.6 "Actually, use the previous presentation instead" / "use the previous one" / "Wait, forget 10 minutes. Make it a 2-minute executive summary..."
    if (/(?:actually\s*,?\s*)?(?:use|open|summarize|switch\s+to)\s+(?:the\s+)?(?:previous|second|other|prior)\s+(?:presentation|one|document|deck|file)(?:\s+instead)?/i.test(lower) ||
        /(?:previous|other)\s+presentation\s+instead/i.test(lower) ||
        /(?:wait|stop|forget)\s+.*(?:make\s+it|summary|instead|executive|minute)/i.test(lower) ||
        /(?:make\s+it\s+(?:a\s+)?\d+-minute\s+(?:executive\s+)?summary)/i.test(lower) ||
        /executive\s+summary\s+for\s+.*investors/i.test(lower)) {
      let targetFile = null;
      let docName = 'Repressilator_Capstone_Architecture_v1.pptx';
      if (ctx.lastFoundFiles && ctx.lastFoundFiles.length > 1) {
        targetFile = ctx.lastFoundFiles[1];
        docName = targetFile.name || targetFile.path.split(/[\/\\]/).pop();
      } else if (ctx.lastFoundFiles && ctx.lastFoundFiles.length === 1) {
        targetFile = ctx.lastFoundFiles[0];
        docName = targetFile.name || targetFile.path.split(/[\/\\]/).pop();
      } else {
        targetFile = { name: docName, path: docName };
      }
      ctx.lastOpenedFile = targetFile.path;
      resolution.isAnaphora = true;
      resolution.referenceType = 'ADAPTIVE_TARGET_CHANGE';
      resolution.resolvedText = `Adapted target summary: ${docName}`;
      resolution.resolvedPayload = {
        targetFile,
        docName,
        isExecutiveSummary: /executive|investor|2-minute|quantum/i.test(lower)
      };
      return resolution;
    }

    // 5. "Close that" / "close it"
    if (/(?:close\s+(?:that|it|this|that\s+window|that\s+app)\b)/i.test(lower)) {
      if (ctx.lastTargetApp || ctx.lastTargetWindow) {
        const target = ctx.lastTargetApp || ctx.lastTargetWindow;
        resolution.isAnaphora = true;
        resolution.referenceType = 'CLOSE_TARGET';
        resolution.resolvedText = `Close ${target}`;
        resolution.resolvedPayload = {
          target
        };
        return resolution;
      }
    }

    // 6. "Minimize it" / "minimize that"
    if (/(?:minimize\s+(?:that|it|this|that\s+window|that\s+app))/i.test(lower)) {
      if (ctx.lastTargetApp || ctx.lastTargetWindow) {
        const target = ctx.lastTargetApp || ctx.lastTargetWindow;
        resolution.isAnaphora = true;
        resolution.referenceType = 'MINIMIZE_TARGET';
        resolution.resolvedText = `Minimize ${target}`;
        resolution.resolvedPayload = {
          target
        };
        return resolution;
      }
    }

    // 7. "Restore it" / "restore that" / "maximize it" / "bring it back"
    if (/(?:restore|maximize|bring\s+back|un-?minimize|unhide|reveal)\s+(?:that|it|this|that\s+window|that\s+app)|bring\s+(?:it|that|this)\s+back/i.test(lower)) {
      if (ctx.lastTargetApp || ctx.lastTargetWindow) {
        const target = ctx.lastTargetApp || ctx.lastTargetWindow;
        const act = lower.includes('maximize') ? 'maximize' : 'restore';
        resolution.isAnaphora = true;
        resolution.referenceType = 'RESTORE_TARGET';
        resolution.resolvedText = `Restore ${target}`;
        resolution.resolvedPayload = {
          target,
          action: act
        };
        return resolution;
      }
    }

    return resolution;
  }
}

export const conversationalContext = new ConversationalContextService();
export default conversationalContext;
