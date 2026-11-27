import { query, run, get } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';

export class WorkflowOptimizationService {
  constructor() {}

  /**
   * Optimizes a mission DAG workflow while strictly preserving safety invariants.
   * NON-NEGOTIABLE INVARIANT:
   * 1. Never optimize away approval barriers (requires_approval = 1).
   * 2. Never optimize away truthful verification steps.
   * 3. Preserve required causal dependencies between steps.
   */
  async optimizeWorkflow({
    mission_id = null,
    steps = [],
    original_steps = null,
    allowParallel = true
  }) {
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error('steps array is required for workflow optimization.');
    }

    const optimizationId = `opt-${uuidv4().substring(0, 8)}`;
    const baselineSteps = (original_steps && Array.isArray(original_steps)) ? original_steps : steps;
    const originalSteps = JSON.parse(JSON.stringify(baselineSteps));
    const optimizedSteps = [];

    let eliminatedRedundancies = 0;
    let parallelStepsCount = 0;

    // Track original approval and verification counts
    const originalApprovalsCount = baselineSteps.filter(s => s.requires_approval).length;
    const originalVerificationsCount = baselineSteps.filter(s => s.tool === 'verify_file' || s.is_verification || s.title?.toLowerCase().includes('verif')).length;

    // 1. Redundant Step Elimination Check
    // Example: Consecutive duplicate reads of the exact same target path
    const seenReads = new Set();
    for (const step of steps) {
      const isRead = step.tool === 'read_file' || step.tool === 'search_files';
      const targetPath = step.args?.file_path || step.args?.path;

      if (isRead && targetPath && seenReads.has(targetPath) && !step.requires_approval) {
        // Redundant read detected: can be safely bypassed
        eliminatedRedundancies++;
        continue;
      }

      if (isRead && targetPath) {
        seenReads.add(targetPath);
      }

      optimizedSteps.push(step);
    }

    // 2. Parallel Step Opportunity Detection
    if (allowParallel && optimizedSteps.length > 1) {
      for (let i = 0; i < optimizedSteps.length - 1; i++) {
        const current = optimizedSteps[i];
        const next = optimizedSteps[i + 1];

        // Steps are independent if neither depends on the other's outputs and neither is an approval gate
        const isCurrentGate = current.requires_approval;
        const isNextGate = next.requires_approval;

        if (!isCurrentGate && !isNextGate) {
          const currentWrites = current.tool === 'write_file' || current.tool === 'edit_file';
          const nextReads = next.tool === 'read_file';
          const sharesFile = current.args?.file_path === next.args?.file_path;

          if (!(currentWrites && nextReads && sharesFile)) {
            next.can_run_parallel_with = current.step_index || current.id;
            parallelStepsCount++;
          }
        }
      }
    }

    // 3. Safety Barrier Enforcement (Invariant 17 & 18)
    const optimizedApprovalsCount = optimizedSteps.filter(s => s.requires_approval).length;
    const optimizedVerificationsCount = optimizedSteps.filter(s => s.tool === 'verify_file' || s.is_verification || s.title?.toLowerCase().includes('verif')).length;

    if (optimizedApprovalsCount < originalApprovalsCount) {
      throw new Error('INVALID_OPTIMIZATION: Optimization violated safety policy: Approval barriers cannot be removed.');
    }

    if (optimizedVerificationsCount < originalVerificationsCount) {
      throw new Error('INVALID_OPTIMIZATION: Optimization violated safety policy: Verification steps cannot be removed.');
    }

    const nowIso = new Date().toISOString();
    await run(
      `INSERT INTO evolution_workflow_optimizations
        (id, mission_id, original_dag_json, optimized_dag_json, optimization_type, eliminated_redundancies_count, parallel_steps_count, approval_barrier_preserved, verification_step_preserved, status, created_at)
       VALUES (?, ?, ?, ?, 'DAG_REFINEMENT', ?, ?, 1, 1, 'PROPOSED', ?)`,
      [
        optimizationId,
        mission_id,
        JSON.stringify(originalSteps),
        JSON.stringify(optimizedSteps),
        eliminatedRedundancies,
        parallelStepsCount,
        nowIso
      ]
    );

    return {
      optimization_id: optimizationId,
      mission_id,
      original_steps_count: originalSteps.length,
      optimized_steps_count: optimizedSteps.length,
      eliminated_redundancies: eliminatedRedundancies,
      parallel_steps_count: parallelStepsCount,
      approval_barriers_preserved: true,
      verification_steps_preserved: true,
      optimized_steps: optimizedSteps,
      status: 'PROPOSED',
      created_at: nowIso
    };
  }

  /**
   * Retrieves optimization records.
   */
  async getOptimizations(missionId = null) {
    let rows;
    if (missionId) {
      rows = await query('SELECT * FROM evolution_workflow_optimizations WHERE mission_id = ? ORDER BY created_at DESC', [missionId]);
    } else {
      rows = await query('SELECT * FROM evolution_workflow_optimizations ORDER BY created_at DESC');
    }

    return rows.map(r => ({
      ...r,
      original_dag: JSON.parse(r.original_dag_json || '[]'),
      optimized_dag: JSON.parse(r.optimized_dag_json || '[]'),
      approval_barrier_preserved: Boolean(r.approval_barrier_preserved),
      verification_step_preserved: Boolean(r.verification_step_preserved)
    }));
  }
}

let instance = null;
export function getWorkflowOptimizationService() {
  if (!instance) {
    instance = new WorkflowOptimizationService();
  }
  return instance;
}

export default WorkflowOptimizationService;
