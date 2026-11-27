import { 
  ResearchAgent, 
  CodingAgent, 
  ProductivityAgent, 
  FileManagerAgent, 
  ContentCreationAgent, 
  SystemAssistantAgent 
} from './specializedAgents.js';
import ToolRegistry from '../../tools/registry.js';

export class CoordinatorAgent {
  constructor() {
    this.agents = {
      research: new ResearchAgent(),
      coding: new CodingAgent(),
      productivity: new ProductivityAgent(),
      files: new FileManagerAgent(),
      content: new ContentCreationAgent(),
      system: new SystemAssistantAgent()
    };
  }

  /**
   * Intelligently selects the best specialized agent for the directive
   */
  classifyIntentAndSelectAgent(userText) {
    const text = userText.toLowerCase();

    // Content Creation patterns
    if (/(youtube|video script|shorts script|screenplay|write an article|content creation|draft a script)/i.test(text)) {
      return { agentKey: 'content', agent: this.agents.content, intent: 'CONTENT_CREATION' };
    }

    // Coding & Codebase inspection
    if (/(debug|refactor|function|codebase|source code|syntax|javascript|python|react|component|api route|bug in)/i.test(text)) {
      return { agentKey: 'coding', agent: this.agents.coding, intent: 'SOFTWARE_ENGINEERING' };
    }

    // Productivity & Planning
    if (/(task|todo|remind me|reminder|schedule|focus session|agenda|what should i work on|daily plan)/i.test(text)) {
      return { agentKey: 'productivity', agent: this.agents.productivity, intent: 'PRODUCTIVITY' };
    }

    // File Management
    if (/(folder|directory|rename file|create folder|mkdir|search file|read file|list files)/i.test(text)) {
      return { agentKey: 'files', agent: this.agents.files, intent: 'FILE_MANAGEMENT' };
    }

    // Research
    if (/(search the web|google|look up online|research|latest news|trends in|compare|citations)/i.test(text)) {
      return { agentKey: 'research', agent: this.agents.research, intent: 'DEEP_RESEARCH' };
    }

    // System Telemetry & App Launcher
    if (/(system status|telemetry|hardware|cpu load|ram usage|open (vs code|chrome|calc|terminal|notepad)|task manager)/i.test(text)) {
      return { agentKey: 'system', agent: this.agents.system, intent: 'SYSTEM_AUTOMATION' };
    }

    // Default general assistant with full capability
    return {
      agentKey: 'general',
      agent: {
        name: 'JARVIS Core',
        role: 'Central AI Command Orchestrator',
        allowedTools: ToolRegistry.getTools().map(t => t.name),
        getScopedTools: () => ToolRegistry.getTools(),
        canExecute: () => true
      },
      intent: 'GENERAL_DIRECTIVE'
    };
  }

  getAgent(key) {
    return this.agents[key] || null;
  }

  getAllAgents() {
    return Object.entries(this.agents).map(([key, a]) => (
      typeof a.getContractProfile === 'function'
        ? a.getContractProfile()
        : {
            key,
            name: a.name,
            role: a.role,
            description: a.description,
            allowedTools: a.allowedTools
          }
    ));
  }

  /**
   * Validates whether a designated agent is authorized under least-privilege policy to invoke a tool.
   */
  validateAgentToolAccess(agentKey, toolName) {
    if (!toolName || toolName === 'none') return { authorized: true };
    if (!agentKey || agentKey === 'general') {
      const exists = Boolean(ToolRegistry.getTool(toolName));
      return { authorized: exists, reason: exists ? null : `Unknown tool '${toolName}'.` };
    }
    const agent = this.agents[agentKey];
    if (!agent) {
      return { authorized: false, reason: `Unknown agent '${agentKey}'.` };
    }
    const allowed = agent.canExecute(toolName);
    return {
      authorized: allowed,
      agentKey,
      agentName: agent.name,
      reason: allowed ? null : `PERMISSION_DENIED: Agent '${agent.name}' (${agentKey}) lacks least-privilege capability for tool '${toolName}'.`
    };
  }

  /**
   * Capability-based task delegation choosing the optimal specialist agent for a directive and tool.
   */
  delegateTask({ directive = '', tool = null, preferredAgentKey = null } = {}) {
    if (preferredAgentKey && preferredAgentKey !== 'general' && this.agents[preferredAgentKey]) {
      const pref = this.agents[preferredAgentKey];
      if (!tool || tool === 'none' || pref.canExecute(tool)) {
        return {
          agentKey: preferredAgentKey,
          agent: pref,
          strategy: 'PREFERRED_CAPABLE',
          authorized: true
        };
      }
      return {
        agentKey: preferredAgentKey,
        agent: pref,
        strategy: 'LEAST_PRIVILEGE_REJECTED',
        authorized: false,
        reason: `PERMISSION_DENIED: Agent '${pref.name}' (${preferredAgentKey}) cannot execute tool '${tool}'.`
      };
    }

    if (tool && tool !== 'none') {
      const candidates = Object.entries(this.agents).filter(([, ag]) => ag.canExecute(tool));
      if (candidates.length > 0) {
        // Rank by affinity to classified intent, then fewest active tasks, then tightest privilege surface
        const classified = this.classifyIntentAndSelectAgent(directive);
        candidates.sort(([kA, aA], [kB, aB]) => {
          const matchA = kA === classified.agentKey ? 1 : 0;
          const matchB = kB === classified.agentKey ? 1 : 0;
          if (matchA !== matchB) return matchB - matchA;
          if (aA.activeTasks !== aB.activeTasks) return aA.activeTasks - aB.activeTasks;
          return aA.allowedTools.length - aB.allowedTools.length;
        });
        const [winnerKey, winnerAgent] = candidates[0];
        return {
          agentKey: winnerKey,
          agent: winnerAgent,
          strategy: 'CAPABILITY_AND_LOAD_MATCH',
          authorized: true
        };
      }
    }

    const fallback = this.classifyIntentAndSelectAgent(directive);
    return {
      agentKey: fallback.agentKey,
      agent: fallback.agent,
      strategy: 'INTENT_CLASSIFICATION',
      authorized: true
    };
  }

  /**
   * Arbitrates conflicting outputs from multiple agents using independent verification weight
   * and source citations, escalating unresolvable ties for human adjudication.
   */
  resolveAgentDisagreement(outputs = []) {
    if (!Array.isArray(outputs) || outputs.length < 2) {
      return {
        conflict_detected: false,
        resolved: true,
        winner: outputs[0] || null,
        requires_escalation: false
      };
    }

    const scored = outputs.map((item, idx) => {
      const ver = item.verification || {};
      const verifiedScore = ver.verified === true ? 3 : (ver.partiallyVerified ? 1.5 : 0);
      const citationsCount = Array.isArray(item.citations) ? item.citations.length : 0;
      const explicitConfidence = typeof item.confidence === 'number' ? item.confidence : 0.5;
      const hashPresent = item.evidence_hash ? 0.5 : 0;
      const score = Number((verifiedScore + Math.min(citationsCount * 0.4, 2) + explicitConfidence + hashPresent).toFixed(3));
      return { ...item, index: idx, resolution_score: score };
    });

    // Check whether conclusions/verdicts actually conflict
    const distinctVerdicts = new Set(
      outputs.map(o => String(o.verdict ?? o.conclusion ?? JSON.stringify(o.output || '')).trim().toLowerCase())
    );

    if (distinctVerdicts.size <= 1) {
      return {
        conflict_detected: false,
        resolved: true,
        winner: scored[0],
        requires_escalation: false,
        rationale: 'Agent outputs converge on the same conclusion.'
      };
    }

    scored.sort((a, b) => b.resolution_score - a.resolution_score);
    const top = scored[0];
    const runnerUp = scored[1];
    const margin = Number((top.resolution_score - runnerUp.resolution_score).toFixed(3));

    if (margin < 0.75) {
      return {
        conflict_detected: true,
        resolved: false,
        requires_escalation: true,
        escalation_reason: `Unresolved agent disagreement between '${top.agent_key}' (score=${top.resolution_score}) and '${runnerUp.agent_key}' (score=${runnerUp.resolution_score}); margin ${margin} < 0.75 tie-breaker threshold.`,
        candidates: scored,
        winner: null
      };
    }

    return {
      conflict_detected: true,
      resolved: true,
      requires_escalation: false,
      winner: top,
      rejected: scored.slice(1),
      margin,
      rationale: `Selected '${top.agent_key}' (score=${top.resolution_score}) over '${runnerUp.agent_key}' (score=${runnerUp.resolution_score}) based on stronger independent verification/citations.`
    };
  }
}

export const coordinatorInstance = new CoordinatorAgent();
export default coordinatorInstance;
