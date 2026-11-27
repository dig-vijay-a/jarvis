import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  Cpu,
  GitBranch,
  Layers,
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle
} from 'lucide-react';
import GlassCard from '../common/GlassCard';
import {
  getWorkflowDashboard,
  getRepeatedWorkflowPatterns,
  getOutdatedWorkflowSkills,
  approveMissionStep,
  cancelMission,
  rollbackMissionWorkflow,
  resolveMissionEscalation
} from '../../services/api';

const AGENT_STYLES = {
  research: 'border-cyan-400/60 bg-cyan-950/50 text-cyan-300',
  coding: 'border-emerald-400/60 bg-emerald-950/50 text-emerald-300',
  productivity: 'border-amber-400/60 bg-amber-950/50 text-amber-300',
  files: 'border-sky-400/60 bg-sky-950/50 text-sky-300',
  content: 'border-fuchsia-400/60 bg-fuchsia-950/50 text-fuchsia-300',
  system: 'border-indigo-400/60 bg-indigo-950/50 text-indigo-300'
};

const STEP_STATUS_STYLES = {
  VERIFIED: 'border-emerald-500/60 bg-emerald-950/60 text-emerald-300',
  COMPLETED: 'border-emerald-500/60 bg-emerald-950/60 text-emerald-300',
  RUNNING: 'border-cyan-400 bg-cyan-950/70 text-cyan-200 animate-pulse',
  WAITING_FOR_APPROVAL: 'border-amber-400 bg-amber-950/70 text-amber-300',
  FAILED: 'border-rose-500/70 bg-rose-950/70 text-rose-300',
  BLOCKED: 'border-rose-500/50 bg-rose-950/40 text-rose-300',
  CANCELLED: 'border-slate-700 bg-slate-900/70 text-slate-400',
  PENDING: 'border-slate-700 bg-slate-900/80 text-slate-300'
};

export const WorkflowIntelligencePanel = ({ onSelectMission }) => {
  const [dashboard, setDashboard] = useState(null);
  const [patterns, setPatterns] = useState([]);
  const [outdatedSkills, setOutdatedSkills] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    try {
      const [dashRes, patRes, outRes] = await Promise.allSettled([
        getWorkflowDashboard(),
        getRepeatedWorkflowPatterns({ minOccurrences: 2, minConfidence: 0.5 }),
        getOutdatedWorkflowSkills()
      ]);

      if (dashRes.status === 'fulfilled' && dashRes.value.data?.success) {
        const d = dashRes.value.data.dashboard;
        setDashboard(d);
        if (!selectedWorkflowId && d.workflows?.length > 0) {
          setSelectedWorkflowId(d.workflows[0].id);
        }
      }
      if (patRes.status === 'fulfilled' && patRes.value.data?.success) {
        setPatterns(patRes.value.data.candidates || []);
      }
      if (outRes.status === 'fulfilled' && outRes.value.data?.success) {
        setOutdatedSkills(outRes.value.data.outdated_skills || []);
      }
    } catch (err) {
      console.error('Error loading workflow intelligence dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedWorkflowId]);

  useEffect(() => {
    loadDashboard();
    const timer = setInterval(loadDashboard, 4000);
    return () => clearInterval(timer);
  }, [loadDashboard]);

  if (loading && !dashboard) {
    return (
      <GlassCard className="p-10 text-center text-xs font-mono text-cyan-300">
        INITIALIZING WORKFLOW INTELLIGENCE TELEMETRY...
      </GlassCard>
    );
  }

  const workflows = dashboard?.workflows || [];
  const activeWorkflows = dashboard?.active_workflows || [];
  const pool = dashboard?.worker_utilization || {};
  const agents = dashboard?.specialist_agents || [];
  const agentMetrics = dashboard?.agent_metrics || [];
  const blockedTasks = dashboard?.blocked_tasks || [];
  const recoveryEvents = dashboard?.recovery_events || [];
  const verifications = dashboard?.verification_results || [];
  const benchmarks = dashboard?.skill_benchmarks || [];
  const selectedWf = workflows.find(w => w.id === selectedWorkflowId) || workflows[0] || null;
  const dagLayers = selectedWf?.dag?.parallel_layers || [];
  const stepsByIndex = new Map((selectedWf?.steps || []).map(s => [s.step_index, s]));

  return (
    <div className="space-y-6">
      {/* Top KPI Strip: Worker Utilization & Ecosystem Telemetry */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassCard className="p-4 border-cyan-500/30">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>ACTIVE WORKFLOWS</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-display font-bold text-white mt-1">
            {activeWorkflows.length}
            <span className="text-xs font-mono text-slate-400 ml-2">/ {workflows.length} total</span>
          </div>
        </GlassCard>

        <GlassCard className="p-4 border-emerald-500/30">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>WORKER UTILIZATION</span>
            <Cpu className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-display font-bold text-emerald-300 mt-1">
            {pool.active_workers || 0} / {pool.max_concurrent_workers || 4}
            <span className="text-xs font-mono text-slate-400 ml-2">queued: {pool.queued_workers || 0}</span>
          </div>
        </GlassCard>

        <GlassCard className="p-4 border-amber-500/30">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>BLOCKED / APPROVAL</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-display font-bold text-amber-300 mt-1">
            {blockedTasks.length}
            <span className="text-xs font-mono text-slate-400 ml-2">peak q: {pool.peak_queue_depth || 0}</span>
          </div>
        </GlassCard>

        <GlassCard className="p-4 border-sky-500/30">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>RECOVERY & BENCHMARKS</span>
            <ShieldCheck className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-display font-bold text-sky-300 mt-1">
            {recoveryEvents.length}
            <span className="text-xs font-mono text-slate-400 ml-2">skills: {benchmarks.length}</span>
          </div>
        </GlassCard>
      </div>

      {/* Execution Progress & Active DAG Visualizer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Workflows & Execution Progress */}
        <GlassCard className="p-4 border-cyan-500/20 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-mono font-bold text-cyan-300 flex items-center gap-1.5">
              <Layers className="w-4 h-4" /> WORKFLOW EXECUTION PROGRESS
            </span>
            <button onClick={loadDashboard} className="text-slate-400 hover:text-cyan-300" title="Refresh Dashboard">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {workflows.length === 0 ? (
              <p className="text-xs font-mono text-slate-500 py-4 text-center">No workflows recorded yet.</p>
            ) : workflows.map(wf => (
              <button
                key={wf.id}
                onClick={() => setSelectedWorkflowId(wf.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedWf?.id === wf.id
                    ? 'bg-cyan-950/40 border-cyan-400/60'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-100 line-clamp-1">{wf.objective}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-300 shrink-0">
                    {wf.status}
                  </span>
                </div>
                <div className="mt-2 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all"
                    style={{ width: `${wf.progress_percent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1.5">
                  <span>{wf.verified_steps}/{wf.total_steps} Verified</span>
                  <span>Layers: {wf.dag?.parallel_layers?.length || 0} (Max //: {wf.dag?.max_parallelism || 1})</span>
                </div>
              </button>
            ))}
          </div>
        </GlassCard>

        {/* Right 2 Cols: Visual DAG Topology */}
        <GlassCard className="lg:col-span-2 p-4 border-cyan-500/20 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-cyan-300">
              <GitBranch className="w-4 h-4" />
              <span>WORKFLOW DAG TOPOLOGY</span>
            </div>
            {selectedWf && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-400">
                  Critical Path: {selectedWf.dag?.critical_path_length || 0} stages | Edges: {selectedWf.dag?.edges?.length || 0}
                </span>
                {onSelectMission && (
                  <button
                    onClick={() => onSelectMission(selectedWf.id)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-cyan-300"
                  >
                    OPEN IN INSPECTOR
                  </button>
                )}
                {selectedWf.status !== 'CANCELLED' && (
                  <button
                    onClick={() => rollbackMissionWorkflow(selectedWf.id, 'Dashboard rollback').then(loadDashboard)}
                    className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/30 text-[10px] font-mono text-rose-300"
                  >
                    ROLLBACK
                  </button>
                )}
              </div>
            )}
          </div>

          {!selectedWf || dagLayers.length === 0 ? (
            <div className="text-xs font-mono text-slate-500 py-10 text-center">
              Select a workflow with planned DAG steps to visualize parallel layers and dependencies.
            </div>
          ) : (
            <div className="overflow-x-auto pb-2">
              <div className="flex items-start gap-4 min-w-max">
                {dagLayers.map((layerIndices, layerIdx) => (
                  <div key={layerIdx} className="w-56 shrink-0 space-y-2.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                    <div className="text-[10px] font-mono text-cyan-400 tracking-wider uppercase flex items-center justify-between">
                      <span>STAGE {layerIdx + 1}</span>
                      <span>{layerIndices.length > 1 ? 'PARALLEL' : 'SERIAL'}</span>
                    </div>
                    {layerIndices.map(sIdx => {
                      const st = stepsByIndex.get(sIdx);
                      if (!st) return null;
                      return (
                        <div
                          key={sIdx}
                          className={`p-2.5 rounded-lg border text-xs space-y-1 ${STEP_STATUS_STYLES[st.status] || STEP_STATUS_STYLES.PENDING}`}
                        >
                          <div className="flex items-center justify-between font-mono text-[10px]">
                            <span className="font-bold">#{st.step_index} • {st.tool}</span>
                            <span>{st.status}</span>
                          </div>
                          <div className="font-semibold text-slate-100 line-clamp-2">{st.title}</div>
                          <div className="flex items-center justify-between text-[10px] font-mono pt-1">
                            <span className={`px-1.5 py-0.5 rounded border uppercase ${AGENT_STYLES[st.agent_key] || 'border-slate-700 text-slate-300'}`}>
                              {st.agent_key}
                            </span>
                            {st.depends_on?.length > 0 && (
                              <span className="text-slate-400">deps: {st.depends_on.join(',')}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Specialist Agent Ecosystem + Blocked Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="p-4 border-cyan-500/20 space-y-3">
          <div className="text-xs font-mono font-bold text-cyan-300 flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <Bot className="w-4 h-4" /> SPECIALIST AGENT ASSIGNMENTS & CONTRACTS
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {agents.map(ag => {
              const perf = agentMetrics.find(m => m.agent_key === ag.key);
              return (
                <div key={ag.key} className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase ${AGENT_STYLES[ag.key] || 'border-slate-700 text-slate-300'}`}>
                      {ag.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      load {ag.activeTasks || 0}/{ag.resourceLimits?.maxConcurrentTasks || 2}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2">{ag.role}</p>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1">
                    <span>Tools: {ag.allowedTools?.length || 0}</span>
                    <span>
                      Runs: {perf?.total_actions || 0} ({perf?.successful_actions || 0} ok)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>

        <GlassCard className="p-4 border-amber-500/20 space-y-3">
          <div className="text-xs font-mono font-bold text-amber-300 flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <AlertTriangle className="w-4 h-4" /> BLOCKED TASKS & GOVERNANCE GATES
          </div>
          <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
            {blockedTasks.length === 0 ? (
              <div className="text-xs font-mono text-emerald-400/80 py-6 text-center">
                No blocked tasks or pending approval gates.
              </div>
            ) : blockedTasks.map((bt, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-100 line-clamp-1">{bt.objective}</span>
                  <span className="text-[10px] font-mono text-amber-300">{bt.mission_status}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {bt.steps?.map(st => st.status === 'WAITING_FOR_APPROVAL' && (
                    <button
                      key={st.id}
                      onClick={() => approveMissionStep(bt.mission_id, st.id).then(loadDashboard)}
                      className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-[10px] font-bold"
                    >
                      APPROVE #{st.step_index} ({st.tool})
                    </button>
                  ))}
                  {bt.mission_status === 'WAITING_FOR_APPROVAL' && (!bt.steps || bt.steps.every(s => s.status !== 'WAITING_FOR_APPROVAL')) && (
                    <button
                      onClick={() => resolveMissionEscalation(bt.mission_id, { decisionNote: 'Approved from dashboard' }).then(loadDashboard)}
                      className="px-2.5 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono text-[10px] font-bold"
                    >
                      RESOLVE ESCALATION
                    </button>
                  )}
                  <button
                    onClick={() => cancelMission(bt.mission_id).then(loadDashboard)}
                    className="px-2.5 py-1 rounded bg-slate-900 border border-rose-500/40 text-rose-300 font-mono text-[10px]"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Recovery Events, Verification Results & Skill Evolution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlassCard className="p-4 border-sky-500/20 space-y-3">
          <div className="text-xs font-mono font-bold text-sky-300 flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <RotateCcw className="w-4 h-4" /> RECOVERY & COORDINATION EVENTS
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1 text-[11px] font-mono">
            {recoveryEvents.length === 0 ? (
              <p className="text-slate-500 py-4 text-center">No recovery/escalation events logged.</p>
            ) : recoveryEvents.map(ev => (
              <div key={ev.id} className="p-2.5 rounded bg-slate-950/70 border border-slate-800">
                <div className="flex items-center justify-between text-sky-300">
                  <span>{ev.event_type}</span>
                  <span className="text-[10px] text-slate-400">{ev.resolution_status}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Mission: {ev.mission_id} | {new Date(ev.created_at).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-4 border-emerald-500/20 space-y-3">
          <div className="text-xs font-mono font-bold text-emerald-300 flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <CheckCircle2 className="w-4 h-4" /> INDEPENDENT VERIFICATION RESULTS
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1 text-[11px] font-mono">
            {verifications.length === 0 ? (
              <p className="text-slate-500 py-4 text-center">No verification reports finalized yet.</p>
            ) : verifications.map((v, idx) => (
              <div key={idx} className="p-2.5 rounded bg-slate-950/70 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-200 line-clamp-1">{v.objective}</span>
                  {v.report?.passed ? (
                    <span className="text-emerald-400 font-bold shrink-0">PASS</span>
                  ) : (
                    <span className="text-rose-400 font-bold shrink-0">{v.status}</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400">
                  Checks: {v.report?.passedChecks || 0}/{v.report?.totalChecks || 0} | Artifacts: {v.report?.deliverableArtifacts?.length || 0}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-4 border-fuchsia-500/20 space-y-3">
          <div className="text-xs font-mono font-bold text-fuchsia-300 flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <Wrench className="w-4 h-4" /> LEARNED WORKFLOW SKILLS & BENCHMARKS
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1 text-[11px] font-mono">
            {benchmarks.map(b => (
              <div key={b.id} className="p-2.5 rounded bg-slate-950/70 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-fuchsia-300 font-bold">{b.skill_key} v{b.version}</span>
                  <span className={b.is_outdated ? 'text-amber-400' : 'text-emerald-400'}>
                    {b.is_outdated ? 'OUTDATED' : b.status}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Pass: {(b.pass_rate * 100).toFixed(0)}% | Latency: {b.benchmark_latency_ms}ms
                </div>
              </div>
            ))}
            {patterns.slice(0, 3).map((p, idx) => (
              <div key={idx} className="p-2 rounded bg-cyan-950/20 border border-cyan-500/20 text-[10px] text-cyan-200 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 shrink-0" />
                <span className="line-clamp-1">Candidate: {p.signature} ({p.occurrences}x)</span>
              </div>
            ))}
            {outdatedSkills.length > 0 && (
              <div className="p-2 rounded bg-amber-950/30 border border-amber-500/30 text-[10px] text-amber-300 flex items-center gap-1.5">
                <XCircle className="w-3 h-3 shrink-0" />
                <span>{outdatedSkills.length} outdated skill(s) flagged for re-benchmarking.</span>
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default WorkflowIntelligencePanel;
