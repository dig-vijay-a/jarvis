import { query, run, get } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import { ToolRegistry } from '../tools/registry.js';

export class CapabilityGapService {
  constructor(options = {}) {
    this.toolRegistry = options.toolRegistry || ToolRegistry;
  }

  /**
   * Scans execution traces and weaknesses to identify capability gaps.
   */
  async detectCapabilityGaps({ windowHours = 72 } = {}) {
    const cutoffTime = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
    const proposals = [];

    // 1. Analyze execution traces for failed/unhandled tool requests
    try {
      const failedTraces = await query(
        `SELECT selected_tools, failure_reason, COUNT(*) as count, GROUP_CONCAT(id) as trace_ids
         FROM execution_traces
         WHERE failure_reason LIKE '%tool%' OR failure_reason LIKE '%not found%' OR failure_reason LIKE '%unsupported%'
         GROUP BY selected_tools, failure_reason
         HAVING count >= 2`
      );

      for (const trace of failedTraces) {
        const toolCandidate = (trace.selected_tools || 'custom_tool').replace(/[^a-zA-Z0-9_]/g, '');
        // Validate against existing tools to prevent false capability gaps
        const isAlreadyAvailable = this.isCapabilityAlreadyAvailable(toolCandidate);
        if (!isAlreadyAvailable) {
          proposals.push({
            title: `Implement Missing Tool Adapter: ${toolCandidate}`,
            problem_statement: `User tasks require '${toolCandidate}' which is currently missing, resulting in ${trace.count} operational failures.`,
            evidence: {
              failure_reason: trace.failure_reason,
              occurrences: trace.count,
              trace_ids: (trace.trace_ids || '').split(',')
            },
            expected_benefit: `Eliminates ${trace.count} failures and enables automated execution of ${toolCandidate} workflows.`,
            complexity: 'MEDIUM',
            security_implications: 'Requires sandboxed validation and explicit tool permission boundaries.',
            test_requirements: [
              'Verify input parameter schema validation',
              'Verify non-destructive execution boundary',
              'Verify error handling under missing arguments'
            ]
          });
        }
      }
    } catch (_) {}

    // 2. Scan identified weaknesses from SelfAnalysisService
    const weaknesses = await query(
      `SELECT * FROM evolution_weaknesses WHERE status = 'IDENTIFIED' ORDER BY confidence DESC`
    );

    for (const w of weaknesses) {
      const evidence = JSON.parse(w.evidence_json || '{}');
      if (w.weakness_type === 'TOOL_RELIABILITY' && evidence.tool) {
        proposals.push({
          weakness_id: w.id,
          title: `Enhance & Stabilize Tool Adapter: ${evidence.tool}`,
          problem_statement: `Tool '${evidence.tool}' exhibits high failure rate (${((evidence.failure_rate || 0) * 100).toFixed(1)}%). Requires resilient retry adapter with structured input validation.`,
          evidence,
          expected_benefit: `Reduces failure rate of ${evidence.tool} below 5% with deterministic error recovery.`,
          complexity: 'MEDIUM',
          security_implications: 'Preserves existing tool permissions; adds defensive parameter sanitization.',
          test_requirements: [
            `Simulate ${evidence.tool} edge cases and transient faults`,
            'Verify schema validation rejects malformed payloads',
            'Verify regression invariants are preserved'
          ]
        });
      }
    }

    // Persist discovered proposals idempotently
    const persistedProposals = [];
    for (const p of proposals) {
      const saved = await this.registerProposal(p);
      persistedProposals.push(saved);
    }

    return {
      success: true,
      proposals_count: persistedProposals.length,
      proposals: persistedProposals
    };
  }

  /**
   * Verifies if a capability or tool already exists in the tool registry or agent skills.
   * Prevents false capability gaps.
   */
  isCapabilityAlreadyAvailable(candidateName) {
    if (!candidateName) return false;
    const normalized = candidateName.trim().toLowerCase();

    // 1. Check ToolRegistry
    if (this.toolRegistry && typeof this.toolRegistry.hasTool === 'function') {
      if (this.toolRegistry.hasTool(normalized)) return true;
    }

    // 2. Common core tools check
    const coreTools = [
      'read_file', 'write_file', 'edit_file', 'delete_file', 'list_files',
      'search_files', 'search_web', 'run_command', 'get_system_telemetry',
      'browse_web', 'manage_task'
    ];
    if (coreTools.includes(normalized)) return true;

    return false;
  }

  /**
   * Evaluates a requested capability gap proposal.
   * Strictly rejects proposals for capabilities that already exist (False Gap Invariant).
   */
  async evaluateAndCreateProposal({
    title,
    problem_statement,
    candidate_capability,
    evidence = {},
    expected_benefit,
    complexity = 'MEDIUM',
    security_implications,
    test_requirements = [],
    weakness_id = null
  }) {
    // False Gap Guard: Rejection of existing capabilities
    if (candidate_capability && this.isCapabilityAlreadyAvailable(candidate_capability)) {
      throw new Error(`FALSE_CAPABILITY_GAP: Capability '${candidate_capability}' is already implemented and active in the system.`);
    }

    // Minimum evidence guard
    if (!evidence || Object.keys(evidence).length === 0) {
      throw new Error('INSUFFICIENT_EVIDENCE: Capability gap proposal must provide supporting operational evidence.');
    }

    return await this.registerProposal({
      weakness_id,
      title,
      problem_statement,
      evidence,
      expected_benefit: expected_benefit || 'Improves autonomous execution success rate.',
      complexity,
      security_implications: security_implications || 'Standard sandbox boundary required.',
      test_requirements: test_requirements.length > 0 ? test_requirements : ['Unit verification', 'Security validation']
    });
  }

  /**
   * Registers a proposal in evolution_capability_proposals.
   */
  async registerProposal(proposalData) {
    const {
      weakness_id = null,
      title,
      problem_statement,
      evidence = {},
      expected_benefit = '',
      complexity = 'MEDIUM',
      security_implications = '',
      test_requirements = []
    } = proposalData;

    // Check if matching proposal already exists
    const existing = await get(
      `SELECT * FROM evolution_capability_proposals WHERE title = ? AND status != 'REJECTED'`,
      [title]
    );

    if (existing) {
      return {
        ...existing,
        evidence: JSON.parse(existing.evidence_json || '{}'),
        test_requirements: JSON.parse(existing.test_requirements_json || '[]')
      };
    }

    const id = `prop-${uuidv4().substring(0, 8)}`;
    const nowIso = new Date().toISOString();

    await run(
      `INSERT INTO evolution_capability_proposals
        (id, weakness_id, title, problem_statement, evidence_json, expected_benefit, complexity, security_implications, test_requirements_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROPOSED', ?, ?)`,
      [
        id,
        weakness_id,
        title,
        problem_statement,
        JSON.stringify(evidence),
        expected_benefit,
        complexity,
        security_implications,
        JSON.stringify(test_requirements),
        nowIso,
        nowIso
      ]
    );

    // If weakness_id provided, mark weakness as PROPOSAL_PENDING
    if (weakness_id) {
      await run("UPDATE evolution_weaknesses SET status = 'PROPOSAL_PENDING' WHERE id = ?", [weakness_id]);
    }

    return {
      id,
      weakness_id,
      title,
      problem_statement,
      evidence,
      expected_benefit,
      complexity,
      security_implications,
      test_requirements,
      status: 'PROPOSED',
      created_at: nowIso,
      updated_at: nowIso
    };
  }

  /**
   * Retrieves proposals with optional status filter.
   */
  async getProposals(status = null) {
    let rows;
    if (status) {
      rows = await query('SELECT * FROM evolution_capability_proposals WHERE status = ? ORDER BY created_at DESC', [status]);
    } else {
      rows = await query('SELECT * FROM evolution_capability_proposals ORDER BY created_at DESC');
    }

    return rows.map(r => ({
      ...r,
      evidence: JSON.parse(r.evidence_json || '{}'),
      test_requirements: JSON.parse(r.test_requirements_json || '[]')
    }));
  }

  /**
   * Updates proposal status.
   */
  async updateProposalStatus(proposalId, newStatus) {
    const existing = await get('SELECT id FROM evolution_capability_proposals WHERE id = ?', [proposalId]);
    if (!existing) throw new Error(`Proposal ${proposalId} not found.`);

    const nowIso = new Date().toISOString();
    await run(
      'UPDATE evolution_capability_proposals SET status = ?, updated_at = ? WHERE id = ?',
      [newStatus, nowIso, proposalId]
    );

    return { id: proposalId, status: newStatus, updated_at: nowIso };
  }
}

let instance = null;
export function getCapabilityGapService() {
  if (!instance) {
    instance = new CapabilityGapService();
  }
  return instance;
}

export default CapabilityGapService;
