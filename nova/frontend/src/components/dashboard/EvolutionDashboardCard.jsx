import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Cpu,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Play,
  Layers,
  TrendingUp,
  Activity,
  Code,
  FileText,
  Clock,
  ArrowRight,
  RefreshCw,
  Sliders
} from 'lucide-react';
import {
  runEvolutionAnalysis,
  getEvolutionWeaknesses,
  getCapabilityProposals,
  detectCapabilityGaps,
  getEvolvingSkills,
  getEvolutionDeployments,
  grantDeploymentApproval,
  revokeDeploymentApproval,
  deployEvolvingSkill,
  rollbackEvolvingDeployment,
  getEvolutionMetricsSummary,
  getEvolutionDashboardSummary
} from '../../services/api';

export const EvolutionDashboardCard = () => {
  const [activeTab, setActiveTab] = useState('opportunities'); // opportunities | skills | experiments | memory | pipeline | deployments | metrics
  const [weaknesses, setWeaknesses] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [skills, setSkills] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [experiments, setExperiments] = useState([]);
  const [validations, setValidations] = useState([]);
  const [improvementMemory, setImprovementMemory] = useState([]);
  const [systemHealth, setSystemHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [wRes, pRes, sRes, dRes, mRes, sumRes] = await Promise.all([
        getEvolutionWeaknesses().catch(() => ({ data: { weaknesses: [] } })),
        getCapabilityProposals().catch(() => ({ data: { proposals: [] } })),
        getEvolvingSkills().catch(() => ({ data: { skills: [] } })),
        getEvolutionDeployments().catch(() => ({ data: { deployments: [] } })),
        getEvolutionMetricsSummary().catch(() => ({ data: { metrics: [] } })),
        getEvolutionDashboardSummary().catch(() => ({ data: {} }))
      ]);

      setWeaknesses(wRes.data?.weaknesses || []);
      setProposals(pRes.data?.proposals || []);
      setSkills(sRes.data?.skills || []);
      setDeployments(dRes.data?.deployments || []);
      setMetrics(mRes.data?.metrics || []);
      setExperiments(sumRes.data?.experiments || []);
      setValidations(sumRes.data?.validations || []);
      setImprovementMemory(sumRes.data?.improvement_memory || []);
      setSystemHealth(sumRes.data?.health || null);
    } catch (err) {
      console.error('Failed to load evolution data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRunAnalysis = async () => {
    try {
      setLoading(true);
      await runEvolutionAnalysis({ windowHours: 72 });
      await detectCapabilityGaps({ windowHours: 72 });
      setActionMessage('Operational self-analysis completed. Discovered weaknesses and proposals updated.');
      await fetchData();
    } catch (err) {
      setActionMessage(`Analysis failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (deploymentId) => {
    try {
      await grantDeploymentApproval(deploymentId, { approvedBy: 'Commander' });
      setActionMessage(`Deployment ${deploymentId} approved.`);
      await fetchData();
    } catch (err) {
      setActionMessage(`Approval failed: ${err.message}`);
    }
  };

  const handleRevoke = async (deploymentId) => {
    try {
      await revokeDeploymentApproval(deploymentId, { reason: 'User revoked from UI' });
      setActionMessage(`Deployment ${deploymentId} revoked.`);
      await fetchData();
    } catch (err) {
      setActionMessage(`Revocation failed: ${err.message}`);
    }
  };

  const handleDeploy = async (deploymentId) => {
    try {
      await deployEvolvingSkill(deploymentId);
      setActionMessage(`Skill deployed to production!`);
      await fetchData();
    } catch (err) {
      setActionMessage(`Deployment failed: ${err.message}`);
    }
  };

  const handleRollback = async (deploymentId) => {
    try {
      await rollbackEvolvingDeployment(deploymentId, { reason: 'Manual operator rollback' });
      setActionMessage(`Skill rolled back to previous checkpoint.`);
      await fetchData();
    } catch (err) {
      setActionMessage(`Rollback failed: ${err.message}`);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl text-slate-100 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="font-semibold text-lg tracking-wide text-slate-100 flex items-center gap-2">
              Self-Evolving Intelligence Engine
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Phase 12 / 20
              </span>
              {systemHealth && (
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  systemHealth.status === 'HEALTHY'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}>
                  {systemHealth.status} · Sec {systemHealth.security_pass_rate}%
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              Autonomous self-analysis, sandboxed skill generation, validation & guarded deployment
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunAnalysis}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-medium rounded-lg text-white transition disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            Analyze & Propose
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="text-xs bg-slate-800/80 border border-slate-700 text-emerald-300 px-3 py-2 rounded-lg flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-200">
            &times;
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2 text-xs font-medium">
        {[
          { id: 'opportunities', label: `Weaknesses & Gaps (${weaknesses.length + proposals.length})` },
          { id: 'skills', label: `Evolving Skills (${skills.length})` },
          { id: 'experiments', label: `Experiments & Security (${experiments.length})` },
          { id: 'memory', label: `Improvement Memory (${improvementMemory.length})` },
          { id: 'pipeline', label: `Approvals & Pipeline (${deployments.filter(d => d.deployment_status === 'PENDING').length})` },
          { id: 'deployments', label: `Deployments & Rollbacks (${deployments.filter(d => d.deployment_status === 'DEPLOYED' || d.deployment_status === 'ROLLED_BACK').length})` },
          { id: 'metrics', label: `Continuous Metrics (${metrics.length})` }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === tab.id
                ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Opportunities & Weaknesses */}
      {activeTab === 'opportunities' && (
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Systemic Weaknesses ({weaknesses.length})
            </h4>
            {weaknesses.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">No active weaknesses detected in current evaluation window.</p>
            ) : (
              <div className="space-y-2">
                {weaknesses.map(w => (
                  <div key={w.id} className="p-3 bg-slate-800/40 border border-slate-800 rounded-lg text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        {w.weakness_type} — {w.subsystem}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                        Confidence: {(w.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-slate-300">{w.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Capability Gap Proposals ({proposals.length})
            </h4>
            {proposals.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">No pending capability gap proposals.</p>
            ) : (
              <div className="space-y-2">
                {proposals.map(p => (
                  <div key={p.id} className="p-3 bg-slate-800/40 border border-slate-800 rounded-lg text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-100">{p.title}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                        {p.status}
                      </span>
                    </div>
                    <p className="text-slate-400">{p.problem_statement}</p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1">
                      <span>Benefit: <span className="text-slate-200">{p.expected_benefit}</span></span>
                      <span>Complexity: <span className="text-slate-200">{p.complexity}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Evolving Skills */}
      {activeTab === 'skills' && (
        <div className="space-y-3">
          {skills.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-4 text-center">No evolving skills designed yet.</p>
          ) : (
            skills.map(s => (
              <div key={s.id} className="p-3 bg-slate-800/40 border border-slate-800 rounded-lg text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-cyan-400" />
                    <span className="font-semibold text-slate-100">{s.name}</span>
                    <span className="text-[10px] text-slate-400">v{s.version}</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                    s.status === 'DEPLOYED' ? 'bg-emerald-500/20 text-emerald-300' :
                    s.status === 'VALIDATED' ? 'bg-blue-500/20 text-blue-300' :
                    'bg-slate-700 text-slate-300'
                  }`}>
                    {s.status}
                  </span>
                </div>
                <p className="text-slate-300">{s.description}</p>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span>Permissions: {s.permissions?.join(', ') || 'None'}</span>
                  <span>|</span>
                  <span>Author: {s.author}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Pipeline & Approvals */}
      {activeTab === 'pipeline' && (
        <div className="space-y-3">
          {deployments.filter(d => d.deployment_status === 'PENDING').length === 0 ? (
            <p className="text-xs text-slate-500 italic py-4 text-center">No skills pending human deployment approval.</p>
          ) : (
            deployments.filter(d => d.deployment_status === 'PENDING').map(d => (
              <div key={d.id} className="p-3 bg-slate-800/40 border border-slate-800 rounded-lg text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-100">
                    Deployment Request: {d.id} (Version {d.version})
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                    d.approval_status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400' :
                    d.approval_status === 'REVOKED' ? 'bg-rose-500/20 text-rose-400' :
                    'bg-amber-500/20 text-amber-300'
                  }`}>
                    {d.approval_status}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px]">Skill ID: {d.skill_id}</p>
                <div className="flex items-center gap-2 pt-2">
                  {d.approval_status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => handleApprove(d.id)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-[11px] font-medium text-white transition"
                      >
                        Approve Deployment
                      </button>
                      <button
                        onClick={() => handleRevoke(d.id)}
                        className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[11px] text-slate-300 transition"
                      >
                        Revoke
                      </button>
                    </>
                  )}
                  {d.approval_status === 'APPROVED' && (
                    <button
                      onClick={() => handleDeploy(d.id)}
                      className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 rounded text-[11px] font-medium text-white transition flex items-center gap-1"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Deploy to Production
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 4: Deployments & Rollbacks */}
      {activeTab === 'deployments' && (
        <div className="space-y-3">
          {deployments.filter(d => d.deployment_status === 'DEPLOYED' || d.deployment_status === 'ROLLED_BACK').length === 0 ? (
            <p className="text-xs text-slate-500 italic py-4 text-center">No deployment or rollback history recorded.</p>
          ) : (
            deployments.filter(d => d.deployment_status === 'DEPLOYED' || d.deployment_status === 'ROLLED_BACK').map(d => (
              <div key={d.id} className="p-3 bg-slate-800/40 border border-slate-800 rounded-lg text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {d.deployment_status === 'DEPLOYED' ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <RotateCcw className="w-4 h-4 text-amber-400" />
                    )}
                    <span className="font-semibold text-slate-100">{d.skill_id} (v{d.version})</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                    d.deployment_status === 'DEPLOYED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    {d.deployment_status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>Approved by: {d.approved_by || 'Unknown'}</span>
                  {d.deployment_status === 'DEPLOYED' && (
                    <button
                      onClick={() => handleRollback(d.id)}
                      className="px-2 py-0.5 bg-rose-600/80 hover:bg-rose-500 rounded text-[10px] font-medium text-white transition flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Rollback Checkpoint
                    </button>
                  )}
                  {d.deployment_status === 'ROLLED_BACK' && (
                    <span className="text-rose-400 text-[10px]">Reason: {d.rollback_reason}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab: Experiments & Security */}
      {activeTab === 'experiments' && (
        <div className="space-y-3">
          {experiments.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-4 text-center">No sandbox experiments recorded yet.</p>
          ) : (
            experiments.map(exp => (
              <div key={exp.id} className="p-3 bg-slate-800/40 border border-slate-800 rounded-lg text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-slate-200">{exp.id} · {exp.skill_id}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${
                    exp.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                  }`}>{exp.status}</span>
                </div>
                {exp.error && <p className="text-red-400 text-[11px]">{exp.error}</p>}
              </div>
            ))
          )}
          {validations.length > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <div className="text-[11px] text-slate-400 mb-1">Recent Security & Independent Validations ({validations.length})</div>
              {validations.slice(0, 5).map(v => (
                <div key={v.id} className="text-[11px] flex justify-between text-slate-300 py-0.5">
                  <span className="font-mono">{v.skill_id}</span>
                  <span className={v.independent_verification_pass ? 'text-emerald-400' : 'text-red-400'}>{v.verdict}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Improvement Memory */}
      {activeTab === 'memory' && (
        <div className="space-y-2">
          {improvementMemory.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-4 text-center">No improvement memory entries recorded yet.</p>
          ) : (
            improvementMemory.map(mem => (
              <div key={mem.id} className="p-3 bg-slate-800/40 border border-slate-800 rounded-lg text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">{mem.proposed_improvement}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-700 text-slate-300">{mem.deployment_result}</span>
                </div>
                <p className="text-slate-400 text-[11px]">Problem: {mem.original_problem}</p>
                {mem.lessons_learned && <p className="text-emerald-300/80 text-[11px]">Lessons: {mem.lessons_learned}</p>}
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 5: Continuous Metrics */}
      {activeTab === 'metrics' && (
        <div className="space-y-3">
          {metrics.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-4 text-center">No continuous improvement metrics tracked yet.</p>
          ) : (
            metrics.map(m => (
              <div key={m.id} className="p-3 bg-slate-800/40 border border-slate-800 rounded-lg text-xs flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">{m.metric_name}</div>
                  <div className="text-[11px] text-slate-400">
                    Pre: {m.pre_evolution_value} &rarr; Post: {m.post_evolution_value} (Delta: {m.delta > 0 ? `+${m.delta}` : m.delta})
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded ${
                  m.is_statistically_significant ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'
                }`}>
                  {m.is_statistically_significant ? 'Statistically Significant' : 'Pending Sample Growth'}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default EvolutionDashboardCard;
