/**
 * JARVIS OS 2.0 — PHASE 10: PERSONAL CONTEXT ENGINE (P2)
 * Continuously aggregates and computes the user's real-time operational context:
 * - Active projects & priorities
 * - Important pending goals
 * - Live mission commitments
 * - Approaching deadlines
 * - Hardware & software resources
 * - Relevant user preferences (filtered for privacy)
 * - Active execution blockers
 * - Recent significant architectural decisions
 * 
 * Provides a compact, explainable snapshot for the orchestrator without exposing raw private memories.
 */

import { query, get } from '../database/db.js';
import DigitalTwinService from './digitalTwinService.js';
import KnowledgeGraphService from './knowledgeGraphService.js';
import MemoryIntelligenceService from './memoryIntelligenceService.js';
import { getDecisionMemory } from './decisionMemoryService.js';
import ToolRegistry from '../tools/registry.js';

export class PersonalContextEngine {
  constructor(options = {}) {
    this.deadlineHorizonHours = options.deadlineHorizonHours || 48;
  }

  /**
   * Phase 17 Unified Personal Context: merges Digital Twin, Knowledge Graph,
   * Long-term Memory, Decision Memory, Goal Management, Strategic Objectives,
   * and Mission Control into one consistent, privacy-safe contextual representation.
   */
  async buildContextSnapshot(options = {}) {
    const filterTopic = options.topic || '';
    const now = new Date();
    const horizonMs = this.deadlineHorizonHours * 60 * 60 * 1000;
    const nowIso = now.toISOString();

    // 1. Digital Twin (Strictly exclude private records)
    const twinProfile = await DigitalTwinService.getFullTwinProfile({ is_enabled: true, excludePrivate: true });
    const mapTwin = (arr = []) => arr.map(item => ({
      id: item.id,
      category: item.category,
      title: item.title,
      content: item.content,
      priority: item.priority,
      source: item.source,
      is_confirmed: item.is_confirmed,
      confidence: item.confidence,
      epistemic_status: item.is_confirmed ? 'CONFIRMED' : 'INFERRED',
      user_correction_history: item.user_correction_history || []
    }));

    const activeProjects = mapTwin(twinProfile.projects);
    const twinSkills = mapTwin(twinProfile.skills);
    const twinInterests = mapTwin(twinProfile.interests);
    const twinPeople = mapTwin(twinProfile.people);
    const twinConstraints = mapTwin(twinProfile.constraints);
    const twinObjectives = mapTwin(twinProfile.objectives);

    // 2. Pending Goals & Strategic Objectives
    const pendingGoalsRaw = await query(
      "SELECT id, title, description, category, priority, status, deadline, progress, linked_mission_id FROM autonomous_goals WHERE status IN ('ACTIVE', 'IN_PROGRESS', 'PENDING', 'STALLED') ORDER BY priority DESC, created_at ASC LIMIT 12"
    );
    const pendingGoals = pendingGoalsRaw.map(g => ({
      id: g.id,
      title: g.title,
      category: g.category,
      priority: g.priority,
      status: g.status,
      deadline: g.deadline,
      progress: g.progress || 0,
      linked_mission_id: g.linked_mission_id || null
    }));

    const strategicObjectives = await query(
      "SELECT id, title, status, progress, confidence, dependencies, created_at FROM strategic_objectives ORDER BY created_at DESC LIMIT 8"
    );

    // 3. Mission Control Commitments
    const activeMissionsRaw = await query(
      "SELECT id, objective, status, replan_count, created_at FROM missions WHERE status IN ('RUNNING', 'PLANNING', 'WAITING_FOR_APPROVAL', 'BLOCKED_PROVIDER_UNAVAILABLE', 'FAILED_RETRYABLE') ORDER BY created_at DESC LIMIT 8"
    );
    const missionCommitments = activeMissionsRaw.map(m => ({
      id: m.id,
      objective: m.objective,
      status: m.status,
      replan_count: m.replan_count || 0
    }));

    // 4. Approaching Deadlines
    const approachingDeadlines = [];
    for (const g of pendingGoals) {
      if (g.deadline) {
        const dTime = new Date(g.deadline).getTime();
        const diffHours = (dTime - now.getTime()) / (1000 * 60 * 60);
        if (diffHours >= -24 && diffHours <= this.deadlineHorizonHours) {
          approachingDeadlines.push({
            type: 'GOAL_DEADLINE',
            id: g.id,
            title: g.title,
            deadline: g.deadline,
            hours_remaining: Math.round(diffHours * 10) / 10,
            is_overdue: diffHours < 0
          });
        }
      }
    }

    // 5. Long-Term Memory (strict private isolation + provenance preservation)
    const memQuery = filterTopic || 'project goal skill preference objective decision';
    const relevantMemories = await MemoryIntelligenceService.retrieveRelevantMemories(memQuery, 10, {
      minScore: 0.04,
      excludeSensitive: true
    });
    const longTermMemories = relevantMemories.map(m => ({
      id: m.id,
      key: m.key,
      value: m.value,
      category: m.category,
      source: m.source || 'user_explicit',
      is_confirmed: (m.source || '').includes('user_explicit') || (m.source || '').includes('confirmed'),
      epistemic_status: ((m.source || '').includes('inferred') || (m.source || '').includes('auto')) ? 'INFERRED' : 'CONFIRMED',
      provenance: m.provenance || null
    }));

    // 6. Knowledge Graph Connectivity, Missing Dependencies & Contradictions (Privacy Filtered)
    const rawGraphSnapshot = await KnowledgeGraphService.getFullGraph(80);
    const isPrivateGraphNode = (n) => {
      const s = `${n.name || ''} ${JSON.stringify(n.properties || {})}`.toLowerCase();
      return n.properties?.is_private === true || /\b(?:password|passcode|pin|secret|api[_-]?key|private[_-]?key|credential|token|ssn)\b/i.test(s);
    };
    const safeNodes = rawGraphSnapshot.nodes.filter(n => !isPrivateGraphNode(n));
    const safeNodeIds = new Set(safeNodes.map(n => n.id));
    const graphSnapshot = {
      nodes: safeNodes,
      links: rawGraphSnapshot.links.filter(l => safeNodeIds.has(l.source) && safeNodeIds.has(l.target))
    };
    const missingDependencies = [];
    for (const projNode of graphSnapshot.nodes.filter(n => (n.type || '').toLowerCase() === 'project').slice(0, 6)) {
      try {
        const md = await KnowledgeGraphService.detectMissingDependencies(projNode.id);
        if (md?.has_missing_dependencies) {
          missingDependencies.push(md);
        }
      } catch (_) {}
    }

    // 7. Cross-store Contradictions & Staleness
    const contradictionAudit = await DigitalTwinService.detectCrossStoreContradictions();
    const staleEntries = await DigitalTwinService.detectStaleEntries();

    // 8. System Resources
    let systemResources = null;
    try {
      const telemetry = await ToolRegistry.executeTool('get_system_telemetry', {});
      if (telemetry && telemetry.success !== false) {
        systemResources = {
          cpu_percent: telemetry.cpu?.percent ?? 15,
          memory_percent: telemetry.memory?.percent ?? 40,
          disk_percent: telemetry.disk?.percent ?? 50
        };
      }
    } catch (_) {}
    if (!systemResources) {
      systemResources = { cpu_percent: 15, memory_percent: 40, disk_percent: 50 };
    }

    // 9. Preferences (Privacy filtered)
    const allPreferences = twinProfile.preferences || [];
    const relevantPreferences = allPreferences
      .filter(pref => {
        if (pref.metadata?.is_private === true || DigitalTwinService.isPrivateEntry(pref)) return false;
        if (filterTopic) {
          const t = filterTopic.toLowerCase();
          return pref.title.toLowerCase().includes(t) || pref.content.toLowerCase().includes(t) || pref.is_confirmed;
        }
        return true;
      })
      .slice(0, 10)
      .map(p => ({
        id: p.id,
        title: p.title,
        content: p.content,
        source: p.source,
        is_confirmed: p.is_confirmed,
        confidence: p.confidence,
        epistemic_status: p.is_confirmed ? 'CONFIRMED' : 'INFERRED'
      }));

    // 10. Current Blockers
    const blockerSteps = await query(
      `SELECT s.id, s.mission_id, s.title, s.tool, s.status, m.objective 
       FROM mission_steps s 
       JOIN missions m ON s.mission_id = m.id 
       WHERE s.status IN ('WAITING_FOR_APPROVAL', 'BLOCKED') 
       ORDER BY s.started_at DESC LIMIT 6`
    );
    const currentBlockers = blockerSteps.map(b => ({
      step_id: b.id,
      mission_id: b.mission_id,
      mission_objective: b.objective,
      title: b.title,
      tool: b.tool,
      blocker_type: b.status === 'WAITING_FOR_APPROVAL' ? 'APPROVAL_REQUIRED' : 'PREREQUISITE_BLOCKED'
    }));

    // 11. Decision Memory
    const decisionService = getDecisionMemory();
    const recentDecisions = decisionService
      ? (await decisionService.getDecisionHistory({}, 8)).map(d => ({
          id: d.id,
          title: d.decision_title,
          category: d.category,
          selected_option: d.selected_option,
          alternatives_considered: d.alternatives_considered || [],
          reasoning_summary: d.reasoning_summary,
          expected_outcome: d.expected_outcome,
          actual_outcome: d.actual_outcome || null,
          lessons_learned: d.lessons_learned || null,
          impact: d.impact_rating
        }))
      : [];

    // Separate confirmed facts vs inferred observations across ALL non-private stores
    const allTwinItems = [
      ...activeProjects, ...twinSkills, ...twinInterests, ...twinPeople,
      ...twinConstraints, ...twinObjectives, ...mapTwin(allPreferences), ...mapTwin(twinProfile.routines)
    ];
    const confirmedFacts = [
      ...allTwinItems.filter(i => i.is_confirmed),
      ...longTermMemories.filter(m => m.epistemic_status === 'CONFIRMED')
    ];
    const inferredObservations = [
      ...allTwinItems.filter(i => !i.is_confirmed),
      ...longTermMemories.filter(m => m.epistemic_status === 'INFERRED')
    ];

    return {
      snapshot_timestamp: nowIso,
      unified_schema_version: '17.0',
      active_projects: activeProjects,
      skills: twinSkills,
      interests: twinInterests,
      people: twinPeople,
      constraints: twinConstraints,
      long_term_objectives: twinObjectives,
      strategic_objectives: strategicObjectives.map(so => ({
        ...so,
        dependencies: JSON.parse(so.dependencies || '[]')
      })),
      important_pending_goals: pendingGoals,
      mission_commitments: missionCommitments,
      approaching_deadlines: approachingDeadlines,
      long_term_memories: longTermMemories,
      knowledge_graph: {
        nodes_count: graphSnapshot.nodes.length,
        edges_count: graphSnapshot.links.length,
        nodes: graphSnapshot.nodes.slice(0, 30),
        edges: graphSnapshot.links.slice(0, 40),
        missing_dependencies: missingDependencies
      },
      consistency: {
        total_conflicts: contradictionAudit.total_conflicts,
        contradictions: contradictionAudit,
        stale_count: staleEntries.length,
        stale_entries: staleEntries,
        missing_dependencies_count: missingDependencies.length,
        missing_dependencies: missingDependencies
      },
      epistemic_summary: {
        confirmed_count: confirmedFacts.length,
        inferred_count: inferredObservations.length,
        confirmed_facts: confirmedFacts.slice(0, 20),
        inferred_observations: inferredObservations.slice(0, 20)
      },
      available_resources: systemResources,
      relevant_preferences: relevantPreferences,
      current_blockers: currentBlockers,
      recent_significant_decisions: recentDecisions,
      privacy_guarantee: 'PRIVATE_MEMORIES_AND_SECRETS_EXCLUDED',
      explanation: `Unified context aggregated ${activeProjects.length} projects, ${twinSkills.length} skills, ${twinPeople.length} people, ${pendingGoals.length} goals, ${strategicObjectives.length} strategic objectives, ${missionCommitments.length} missions, ${longTermMemories.length} memories, ${graphSnapshot.nodes.length} graph entities, ${recentDecisions.length} decisions, and ${contradictionAudit.total_conflicts} contradictions.`
    };
  }

  async getUnifiedPersonalContext(options = {}) {
    return this.buildContextSnapshot(options);
  }

  /**
   * Formats context snapshot into an orchestrator-ready prompt markdown section.
   */
  async formatForOrchestratorPrompt(options = {}) {
    const snap = await this.buildContextSnapshot(options);
    const sections = [];

    sections.push(`## PERSONAL CONTEXT SNAPSHOT (${snap.snapshot_timestamp})`);

    if (snap.active_projects.length > 0) {
      const projList = snap.active_projects.map(p => `- [P${p.priority}] **${p.title}**: ${p.content}`).join('\n');
      sections.push(`### ACTIVE PROJECTS\n${projList}`);
    }

    if (snap.important_pending_goals.length > 0) {
      const goalList = snap.important_pending_goals.map(g => `- [${g.category.toUpperCase()}] **${g.title}** (Progress: ${g.progress}%)`).join('\n');
      sections.push(`### PENDING GOALS\n${goalList}`);
    }

    if (snap.approaching_deadlines.length > 0) {
      const dList = snap.approaching_deadlines.map(d => `- **${d.title}**: Due in ${d.hours_remaining}h (${d.is_overdue ? 'OVERDUE' : 'UPCOMING'})`).join('\n');
      sections.push(`### APPROACHING DEADLINES\n${dList}`);
    }

    if (snap.current_blockers.length > 0) {
      const bList = snap.current_blockers.map(b => `- [${b.blocker_type}] Mission "${b.mission_objective}": ${b.title} (${b.tool})`).join('\n');
      sections.push(`### CURRENT BLOCKERS\n${bList}`);
    }

    if (snap.relevant_preferences.length > 0) {
      const prefList = snap.relevant_preferences.map(p => `- ${p.is_confirmed ? '[CONFIRMED]' : '[INFERRED]'} ${p.title}: ${p.content}`).join('\n');
      sections.push(`### RELEVANT USER PREFERENCES\n${prefList}`);
    }

    return sections.join('\n\n');
  }
}

let instance = null;
export function initPersonalContext(options) {
  instance = new PersonalContextEngine(options);
  return instance;
}
export function getPersonalContext() {
  if (!instance) instance = new PersonalContextEngine();
  return instance;
}
export default PersonalContextEngine;
