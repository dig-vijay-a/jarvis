import { query, run, get } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import { getSkillEvolutionService } from './skillEvolutionService.js';
import { getEvolutionValidationService } from './evolutionValidationService.js';

export class EvolutionPipelineService {
  constructor(options = {}) {
    this.skillService = options.skillService || getSkillEvolutionService();
    this.validationService = options.validationService || getEvolutionValidationService();
  }

  /**
   * Submits a validated skill for human review and approval.
   */
  async submitForApproval({
    skill_id,
    proposal_id = null
  }) {
    const skill = await this.skillService.getSkillById(skill_id);
    if (!skill) throw new Error(`Skill ${skill_id} not found.`);

    if (skill.status !== 'VALIDATED') {
      throw new Error(`UNVALIDATED_SKILL: Skill ${skill_id} must pass validation (current status: ${skill.status}) before submission for approval.`);
    }

    const deploymentId = `dep-${uuidv4().substring(0, 8)}`;
    const approvalId = `appr-${uuidv4().substring(0, 8)}`;
    const nowIso = new Date().toISOString();

    // Check if existing version exists in agent_skills to record diff
    const existingSkill = await get('SELECT * FROM agent_skills WHERE skill_key = ?', [skill.skill_key]);
    const diff = {
      action: existingSkill ? 'UPDATE' : 'CREATE',
      previous_version: existingSkill?.version || null,
      target_version: skill.version,
      permissions_change: {
        from: existingSkill ? JSON.parse(existingSkill.permissions || '[]') : [],
        to: skill.permissions
      }
    };

    await run(
      `INSERT INTO evolution_deployments
        (id, skill_id, proposal_id, version, change_diff, approval_id, approval_status, deployment_status)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 'PENDING')`,
      [deploymentId, skill_id, proposal_id, skill.version, JSON.stringify(diff), approvalId]
    );

    return {
      deployment_id: deploymentId,
      approval_id: approvalId,
      skill_id,
      version: skill.version,
      change_diff: diff,
      approval_status: 'PENDING',
      deployment_status: 'PENDING',
      submitted_at: nowIso
    };
  }

  /**
   * Grants human approval for deployment.
   */
  async grantApproval(deploymentId, approvedBy = 'user') {
    const dep = await get('SELECT * FROM evolution_deployments WHERE id = ?', [deploymentId]);
    if (!dep) throw new Error(`Deployment ${deploymentId} not found.`);

    if (dep.approval_status === 'REVOKED') {
      throw new Error(`REVOKED_APPROVAL: Approval for deployment ${deploymentId} was revoked and cannot be granted.`);
    }

    await run(
      `UPDATE evolution_deployments
       SET approval_status = 'APPROVED', approved_by = ?
       WHERE id = ?`,
      [approvedBy, deploymentId]
    );

    return {
      deployment_id: deploymentId,
      approval_status: 'APPROVED',
      approved_by: approvedBy
    };
  }

  /**
   * Revokes an existing or pending approval (Invariant 12).
   */
  async revokeApproval(deploymentId, reason = 'User revocation') {
    const dep = await get('SELECT * FROM evolution_deployments WHERE id = ?', [deploymentId]);
    if (!dep) throw new Error(`Deployment ${deploymentId} not found.`);

    if (dep.deployment_status === 'DEPLOYED') {
      throw new Error('CANNOT_REVOKE_DEPLOYED: Skill is already deployed. Initiate rollbackDeployment instead.');
    }

    await run(
      `UPDATE evolution_deployments
       SET approval_status = 'REVOKED', rollback_reason = ?
       WHERE id = ?`,
      [reason, deploymentId]
    );

    return {
      deployment_id: deploymentId,
      approval_status: 'REVOKED',
      reason
    };
  }

  /**
   * Deploys an approved skill to production (agent_skills table).
   * NON-NEGOTIABLE INVARIANT:
   * Rejects deployment if explicit approval is missing (Invariant 11).
   * Maintains rollback checkpoint snapshot (Invariant 13).
   */
  async deploySkill(deploymentId) {
    const dep = await get('SELECT * FROM evolution_deployments WHERE id = ?', [deploymentId]);
    if (!dep) throw new Error(`Deployment ${deploymentId} not found.`);

    // 1. Explicit Approval Guard (Invariant 11)
    if (dep.approval_status !== 'APPROVED') {
      throw new Error(`UNAUTHORIZED_DEPLOYMENT: Deployment ${deploymentId} cannot proceed without explicit approval (current status: ${dep.approval_status}).`);
    }

    const skill = await this.skillService.getSkillById(dep.skill_id);
    if (!skill) throw new Error(`Skill ${dep.skill_id} not found.`);

    // 2. Snapshot Rollback Checkpoint (Invariant 13)
    const existingSkill = await get('SELECT * FROM agent_skills WHERE skill_key = ?', [skill.skill_key]);
    const rollbackCheckpoint = existingSkill ? {
      existed_prior: true,
      id: existingSkill.id,
      skill_key: existingSkill.skill_key,
      name: existingSkill.name,
      description: existingSkill.description,
      version: existingSkill.version,
      schema_definition: existingSkill.schema_definition,
      permissions: existingSkill.permissions,
      is_enabled: existingSkill.is_enabled,
      author: existingSkill.author
    } : {
      existed_prior: false,
      skill_key: skill.skill_key
    };

    const nowIso = new Date().toISOString();

    // 3. Deploy to Production (agent_skills)
    if (existingSkill) {
      await run(
        `UPDATE agent_skills
         SET name = ?, description = ?, version = ?, schema_definition = ?, permissions = ?, is_enabled = 1, updated_at = ?
         WHERE skill_key = ?`,
        [
          skill.name,
          skill.description,
          skill.version,
          JSON.stringify(skill.inputs_schema || {}),
          JSON.stringify(skill.permissions || []),
          nowIso,
          skill.skill_key
        ]
      );
    } else {
      const newSkillId = `skill-${uuidv4().substring(0, 8)}`;
      await run(
        `INSERT INTO agent_skills
          (id, skill_key, name, description, version, schema_definition, permissions, is_enabled, author, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [
          newSkillId,
          skill.skill_key,
          skill.name,
          skill.description,
          skill.version,
          JSON.stringify(skill.inputs_schema || {}),
          JSON.stringify(skill.permissions || []),
          skill.author,
          nowIso,
          nowIso
        ]
      );
    }

    // 4. Update Deployment & Skill Status
    await run(
      `UPDATE evolution_deployments
       SET deployment_status = 'DEPLOYED', rollback_checkpoint_json = ?, deployed_at = ?
       WHERE id = ?`,
      [JSON.stringify(rollbackCheckpoint), nowIso, deploymentId]
    );

    await this.skillService.updateSkillStatus(skill.id, 'DEPLOYED');

    return {
      deployment_id: deploymentId,
      skill_id: skill.id,
      skill_key: skill.skill_key,
      version: skill.version,
      deployment_status: 'DEPLOYED',
      rollback_checkpoint_available: true,
      deployed_at: nowIso
    };
  }

  /**
   * Executes rollback to restore previous checkpoint (Invariant 13 & 14).
   */
  async rollbackDeployment(deploymentId, reason = 'Operational anomaly detected') {
    const dep = await get('SELECT * FROM evolution_deployments WHERE id = ?', [deploymentId]);
    if (!dep) throw new Error(`Deployment ${deploymentId} not found.`);

    if (dep.deployment_status !== 'DEPLOYED') {
      throw new Error(`CANNOT_ROLLBACK: Deployment ${deploymentId} is not in DEPLOYED state (current: ${dep.deployment_status}).`);
    }

    const checkpoint = JSON.parse(dep.rollback_checkpoint_json || '{}');
    const skill = await this.skillService.getSkillById(dep.skill_id);
    const nowIso = new Date().toISOString();

    if (checkpoint.existed_prior) {
      // Restore previous version
      await run(
        `UPDATE agent_skills
         SET name = ?, description = ?, version = ?, schema_definition = ?, permissions = ?, is_enabled = ?, updated_at = ?
         WHERE skill_key = ?`,
        [
          checkpoint.name,
          checkpoint.description,
          checkpoint.version,
          checkpoint.schema_definition,
          checkpoint.permissions,
          checkpoint.is_enabled,
          nowIso,
          checkpoint.skill_key
        ]
      );
    } else {
      // Revert created skill
      await run('DELETE FROM agent_skills WHERE skill_key = ?', [checkpoint.skill_key]);
    }

    await run(
      `UPDATE evolution_deployments
       SET deployment_status = 'ROLLED_BACK', rolled_back_at = ?, rollback_reason = ?
       WHERE id = ?`,
      [nowIso, reason, deploymentId]
    );

    if (skill) {
      await this.skillService.updateSkillStatus(skill.id, 'ROLLED_BACK');
    }

    return {
      deployment_id: deploymentId,
      skill_key: checkpoint.skill_key,
      deployment_status: 'ROLLED_BACK',
      restored_version: checkpoint.version || 'REMOVED',
      rollback_reason: reason,
      rolled_back_at: nowIso
    };
  }

  /**
   * Recovers from corrupted skill version by restoring the last known healthy checkpoint (Invariant 14).
   */
  async recoverCorruptedSkill(skillKey) {
    const corrupted = await get('SELECT * FROM agent_skills WHERE skill_key = ?', [skillKey]);
    if (!corrupted) throw new Error(`Skill ${skillKey} not found.`);

    // Find the latest valid rollback checkpoint
    const lastValidDeployment = await get(
      `SELECT * FROM evolution_deployments 
       WHERE deployment_status = 'DEPLOYED' OR deployment_status = 'ROLLED_BACK'
       ORDER BY deployed_at DESC LIMIT 1`
    );

    if (lastValidDeployment && lastValidDeployment.rollback_checkpoint_json) {
      const checkpoint = JSON.parse(lastValidDeployment.rollback_checkpoint_json);
      if (checkpoint.existed_prior) {
        await run(
          `UPDATE agent_skills
           SET schema_definition = ?, permissions = ?, updated_at = ?
           WHERE skill_key = ?`,
          [checkpoint.schema_definition, checkpoint.permissions, new Date().toISOString(), skillKey]
        );
        return { recovered: true, skill_key: skillKey, action: 'RESTORED_FROM_CHECKPOINT' };
      }
    }

    // Default safe fallback schema if no checkpoint
    const safeDefaultSchema = JSON.stringify({ type: 'object', properties: {} });
    await run(
      `UPDATE agent_skills
       SET schema_definition = ?, updated_at = ?
       WHERE skill_key = ?`,
      [safeDefaultSchema, new Date().toISOString(), skillKey]
    );

    return { recovered: true, skill_key: skillKey, action: 'DEFAULT_SAFE_SCHEMA_RESTORED' };
  }

  /**
   * Recovers interrupted pipelines post-restart (Invariant 20).
   */
  async recoverInterruptedPipelines() {
    const interrupted = await query(
      `SELECT * FROM evolution_deployments 
       WHERE deployment_status = 'PENDING' AND approval_status = 'APPROVED'`
    );

    const recovered = [];
    for (const dep of interrupted) {
      // Complete deployment safely
      const result = await this.deploySkill(dep.id);
      recovered.push(result);
    }

    return {
      success: true,
      recovered_count: recovered.length,
      deployments: recovered
    };
  }

  /**
   * Retrieves deployment history and audit trail.
   */
  async getDeploymentHistory() {
    const rows = await query('SELECT * FROM evolution_deployments ORDER BY rowid DESC');
    return rows.map(r => ({
      ...r,
      change_diff: JSON.parse(r.change_diff || '{}'),
      rollback_checkpoint: JSON.parse(r.rollback_checkpoint_json || '{}')
    }));
  }
}

let instance = null;
export function getEvolutionPipelineService() {
  if (!instance) {
    instance = new EvolutionPipelineService();
  }
  return instance;
}

export default EvolutionPipelineService;
