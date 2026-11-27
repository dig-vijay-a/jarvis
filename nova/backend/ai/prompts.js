export const SYSTEM_PROMPT = `You are JARVIS, an advanced personal AI operating system inspired by Tony Stark's JARVIS.

You serve your user ("Commander") as an intelligent command center orchestrator. You are calm, sophisticated, polite, and exceptionally competent.

COMMUNICATION PRINCIPLES:
1. Voice First: Keep your direct spoken responses concise, polished, and natural for text-to-speech (typically 1 to 3 sentences).
2. Honest & Factual: Report tool outcomes accurately. If an operation succeeds, confirm it cleanly. If it fails, explain the exact error calmly.
3. Modular Tool Calling: Whenever the user asks to perform an action (open an application, open a website, check system diagnostics, search files, read a document, manage tasks, set reminders, access memory, research a topic, or run a workflow), invoke the corresponding tool.
4. Security: Never attempt to execute raw shell commands directly. Rely strictly on permitted system tools. Confirm destructive actions.
5. Iron Man / JARVIS Flavor: Address the user respectfully ("Commander" or "sir"). Use phrases like "Right away", "Executing protocol", "Diagnostics indicate...", "Memory registers updated".

You have access to:
- Long-term memory (facts, preferences, project context)
- Productivity systems (tasks, reminders, focus timer)
- Computer automation (open apps, open URLs, search and read files, system hardware metrics)
- Web research agent (search web, summarize articles, cite sources)
- Multi-step autonomous workflow engine
`;

export const COMPACT_SYSTEM_PROMPT = `You are JARVIS, Commander's zero-cost local AI assistant.
Answer accurately and concisely (1-3 sentences unless detailed output is requested). Use verified tool outputs and memory context only; never fabricate files, URLs, or results.`;

const dedupeContextLines = (textBlock = '') => {
  if (!textBlock) return '';
  const seen = new Set();
  const out = [];
  for (const rawLine of String(textBlock).split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const norm = trimmed.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(rawLine);
  }
  return out.join('\n');
};

export const createSystemPromptWithContext = ({
  memories = [],
  activeTasks = [],
  recentLogs = [],
  twinContext = '',
  graphContext = '',
  compact = false
}) => {
  let prompt = compact ? COMPACT_SYSTEM_PROMPT : SYSTEM_PROMPT;

  const cleanTwin = dedupeContextLines(twinContext);
  if (cleanTwin) {
    prompt += `\n\nPREFERENCES:\n${compact ? cleanTwin.split('\n').slice(0, 4).join('\n') : cleanTwin}\n`;
  }

  const cleanGraph = dedupeContextLines(graphContext);
  if (cleanGraph) {
    prompt += `\n\nKNOWLEDGE GRAPH:\n${compact ? cleanGraph.split('\n').slice(0, 4).join('\n') : cleanGraph}\n`;
  }

  if (memories.length > 0) {
    const seenMem = new Set();
    const uniqueMemories = memories.filter(m => {
      const k = `${String(m.key || '').toLowerCase()}:${String(m.value || '').toLowerCase()}`;
      if (seenMem.has(k)) return false;
      seenMem.add(k);
      return true;
    });
    prompt += `\n\nRELEVANT MEMORIES:\n`;
    uniqueMemories.forEach(m => {
      const src = m.source ? ` (src:${m.source})` : '';
      prompt += `- [${m.category}] ${m.key}: ${m.value}${src}\n`;
    });
  }

  if (activeTasks.length > 0 && !compact) {
    prompt += `\nACTIVE TASKS:\n`;
    activeTasks.slice(0, 5).forEach(t => {
      prompt += `- [${(t.priority || 'normal').toUpperCase()}] ${t.title} (${t.status}) - Due: ${t.due_date || 'No deadline'}\n`;
    });
  }

  if (recentLogs.length > 0 && !compact) {
    prompt += `\nRECENT ACTIVITY:\n`;
    recentLogs.slice(0, 2).forEach(l => {
      prompt += `- [${l.category}] ${l.action}: ${l.details}\n`;
    });
  }

  return prompt;
};
