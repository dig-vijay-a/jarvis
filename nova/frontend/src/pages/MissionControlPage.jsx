import React, { useState, useEffect, useCallback } from 'react';
import { 
  Rocket, 
  Target, 
  Play, 
  Pause, 
  RotateCcw, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  XCircle, 
  Copy, 
  FileText, 
  Check, 
  Bot, 
  Layers, 
  Cpu, 
  ShieldCheck,
  ChevronRight,
  Terminal,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { 
  createMission, 
  getMissions, 
  getMission, 
  startMission, 
  pauseMission, 
  resumeMission, 
  cancelMission, 
  approveMissionStep, 
  retryMissionStep 
} from '../services/api';
import GlassCard from '../components/common/GlassCard';
import WorkflowIntelligencePanel from '../components/missions/WorkflowIntelligencePanel';

export const MissionControlPage = () => {
  const [viewMode, setViewMode] = useState('control'); // 'control' | 'workflow-dashboard'
  const [missions, setMissions] = useState([]);
  const [activeMission, setActiveMission] = useState(null);
  const [objectiveInput, setObjectiveInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [expandedStepId, setExpandedStepId] = useState(null);

  // Load all missions
  const loadMissions = useCallback(async () => {
    try {
      const res = await getMissions(20);
      if (res.data?.success) {
        setMissions(res.data.missions);
        if (res.data.missions.length > 0 && !activeMission) {
          setActiveMission(res.data.missions[0]);
        } else if (activeMission) {
          // Refresh active mission
          const updated = res.data.missions.find(m => m.id === activeMission.id);
          if (updated) setActiveMission(updated);
        }
      }
    } catch (err) {
      console.error('Error fetching missions:', err);
    }
  }, [activeMission]);

  useEffect(() => {
    loadMissions();
    const interval = setInterval(loadMissions, 3000);
    return () => clearInterval(interval);
  }, [loadMissions]);

  // Handle Create Mission
  const handleCreateMission = async (e) => {
    if (e) e.preventDefault();
    if (!objectiveInput.trim()) return;

    setLoading(true);
    try {
      const res = await createMission(objectiveInput.trim());
      if (res.data?.success) {
        setObjectiveInput('');
        await loadMissions();
        setActiveMission(res.data.mission);
      }
    } catch (err) {
      console.error('Error creating mission:', err);
    } finally {
      setLoading(false);
    }
  };

  // Quick Prompt Chips
  const quickPrompts = [
    'Research AI developments and prepare a YouTube video',
    'Open current React project and run it',
    'Find latest project presentation and summarize',
    'Audit system telemetry and optimize memory',
    'Remind me about my pending tasks tomorrow'
  ];

  // Control Handlers
  const handleStart = async (missionId) => {
    try {
      await startMission(missionId);
      loadMissions();
    } catch (err) {
      console.error('Start mission error:', err);
    }
  };

  const handlePause = async (missionId) => {
    try {
      await pauseMission(missionId);
      loadMissions();
    } catch (err) {
      console.error('Pause mission error:', err);
    }
  };

  const handleResume = async (missionId) => {
    try {
      await resumeMission(missionId);
      loadMissions();
    } catch (err) {
      console.error('Resume mission error:', err);
    }
  };

  const handleCancel = async (missionId) => {
    try {
      await cancelMission(missionId);
      loadMissions();
    } catch (err) {
      console.error('Cancel mission error:', err);
    }
  };

  const handleApprove = async (missionId, stepId) => {
    try {
      await approveMissionStep(missionId, stepId);
      loadMissions();
    } catch (err) {
      console.error('Approve step error:', err);
    }
  };

  const handleRetry = async (missionId, stepId) => {
    try {
      await retryMissionStep(missionId, stepId);
      loadMissions();
    } catch (err) {
      console.error('Retry step error:', err);
    }
  };

  const copyDeliverable = (text, id) => {
    navigator.clipboard.writeText(typeof text === 'string' ? text : JSON.stringify(text, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getAgentBadgeColor = (agentKey) => {
    switch (agentKey) {
      case 'research': return 'border-cyan-400 text-cyan-300 bg-cyan-950/60';
      case 'content': return 'border-fuchsia-400 text-fuchsia-300 bg-fuchsia-950/60';
      case 'coding': return 'border-emerald-400 text-emerald-300 bg-emerald-950/60';
      case 'productivity': return 'border-amber-400 text-amber-300 bg-amber-950/60';
      case 'files': return 'border-sky-400 text-sky-300 bg-sky-950/60';
      default: return 'border-blue-400 text-blue-300 bg-blue-950/60';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-500/40">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>COMPLETED</span>
          </span>
        );
      case 'RUNNING':
        return (
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 animate-pulse">
            <Clock className="w-3 h-3 text-cyan-400 animate-spin" />
            <span>EXECUTING</span>
          </span>
        );
      case 'WAITING_FOR_APPROVAL':
        return (
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950/80 text-amber-300 border border-amber-500/40 animate-pulse">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>APPROVAL REQUIRED</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-rose-950/80 text-rose-300 border border-rose-500/40">
            <XCircle className="w-3 h-3 text-rose-400" />
            <span>FAILED</span>
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 text-slate-400 border border-slate-700">
            <span>CANCELLED</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 text-slate-400 border border-slate-800">
            <span>PENDING</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-cyan-500/20 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Rocket className="w-6 h-6 text-cyan-400 animate-pulse" />
            <h1 className="text-xl font-display font-bold tracking-wider text-white">
              AUTONOMOUS MISSION CONTROL
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500/30">
              MODULE 1 & 9
            </span>
          </div>
          <p className="text-xs font-mono text-slate-400 mt-1">
            Autonomous multi-agent orchestration, DAG step dependencies, human-in-the-loop approvals, and deliverable synthesis.
          </p>
        </div>

        {/* View Mode Switcher & Telemetry Counters */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <div className="flex rounded-lg bg-slate-900/90 border border-slate-800 p-0.5">
            <button
              onClick={() => setViewMode('control')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                viewMode === 'control'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              MISSION CONTROL
            </button>
            <button
              onClick={() => setViewMode('workflow-dashboard')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                viewMode === 'workflow-dashboard'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              WORKFLOW INTELLIGENCE
            </button>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center space-x-2">
            <span className="text-slate-400">Total Missions:</span>
            <span className="text-cyan-400 font-bold">{missions.length}</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center space-x-2">
            <span className="text-slate-400">Active:</span>
            <span className="text-emerald-400 font-bold">
              {missions.filter(m => m.status === 'RUNNING').length}
            </span>
          </div>
        </div>
      </div>

      {viewMode === 'workflow-dashboard' ? (
        <WorkflowIntelligencePanel
          onSelectMission={(missionId) => {
            const match = missions.find(m => m.id === missionId);
            if (match) setActiveMission(match);
            setViewMode('control');
          }}
        />
      ) : (
        <>

      {/* Mission Creation Input Card */}
      <GlassCard className="p-5 border-cyan-500/30 bg-slate-950/80">
        <form onSubmit={handleCreateMission} className="space-y-3">
          <div className="flex items-center space-x-2 text-xs font-mono text-cyan-300">
            <Target className="w-4 h-4 text-cyan-400" />
            <span>DISPATCH AUTONOMOUS MISSION OBJECTIVE</span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={objectiveInput}
              onChange={(e) => setObjectiveInput(e.target.value)}
              placeholder="e.g. Research the latest AI developments and prepare a YouTube video screenplay..."
              className="flex-1 bg-slate-900/90 border border-cyan-500/30 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-400 shadow-inner"
            />
            <button
              type="submit"
              disabled={loading || !objectiveInput.trim()}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono text-xs font-semibold tracking-wider transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>{loading ? 'SYNTHESIZING PLAN...' : 'DISPATCH MISSION'}</span>
            </button>
          </div>

          {/* Quick Prompt Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[10px] font-mono text-slate-500">SUGGESTED DIRECTIVES:</span>
            {quickPrompts.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setObjectiveInput(p)}
                className="text-[11px] font-mono px-2.5 py-1 rounded bg-slate-900/70 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/30 transition-all text-left"
              >
                {p}
              </button>
            ))}
          </div>
        </form>
      </GlassCard>

      {/* Main Grid: Active Mission Details & Mission History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Mission History Selector */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-1">
            <span className="flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>MISSION DIRECTIVES</span>
            </span>
            <span>{missions.length} RECORDED</span>
          </div>

          <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
            {missions.length === 0 ? (
              <GlassCard className="p-6 text-center text-xs font-mono text-slate-500">
                No active or archived missions. Enter an objective above to dispatch JARVIS.
              </GlassCard>
            ) : (
              missions.map((m) => {
                const isSelected = activeMission?.id === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setActiveMission(m)}
                    className={`w-full text-left p-3.5 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-400/60 shadow-[0_0_15px_rgba(0,240,255,0.15)]'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-200 line-clamp-2">
                        {m.objective}
                      </span>
                      {getStatusBadge(m.status)}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-2.5">
                      <span>{m.steps?.length || 0} Steps</span>
                      <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right 2 Columns: Active Mission Execution & DAG */}
        <div className="lg:col-span-2 space-y-5">
          {activeMission ? (
            <div className="space-y-5">
              {/* Mission Control Bar */}
              <GlassCard className="p-4 border-cyan-500/20 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
                      ID: {activeMission.id}
                    </span>
                    {getStatusBadge(activeMission.status)}
                  </div>
                  <h2 className="text-sm font-bold text-white tracking-wide">
                    {activeMission.objective}
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">
                    {activeMission.plan_summary}
                  </p>
                </div>

                {/* Mission Execution Controls */}
                <div className="flex items-center space-x-2 shrink-0">
                  {activeMission.status === 'PENDING' && (
                    <button
                      onClick={() => handleStart(activeMission.id)}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-semibold flex items-center space-x-1.5 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>START</span>
                    </button>
                  )}

                  {activeMission.status === 'RUNNING' && (
                    <button
                      onClick={() => handlePause(activeMission.id)}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-mono text-xs font-semibold flex items-center space-x-1.5 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>PAUSE</span>
                    </button>
                  )}

                  {activeMission.status === 'PAUSED' && (
                    <button
                      onClick={() => handleResume(activeMission.id)}
                      className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-semibold flex items-center space-x-1.5"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>RESUME</span>
                    </button>
                  )}

                  {(activeMission.status === 'RUNNING' || activeMission.status === 'PAUSED' || activeMission.status === 'WAITING_FOR_APPROVAL') && (
                    <button
                      onClick={() => handleCancel(activeMission.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-rose-500/40 text-rose-300 hover:bg-rose-950 font-mono text-xs"
                    >
                      CANCEL
                    </button>
                  )}
                </div>
              </GlassCard>

              {/* Waiting for Approval Alert Card */}
              {activeMission.status === 'WAITING_FOR_APPROVAL' && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border border-amber-400/80 shadow-[0_0_20px_rgba(245,158,11,0.25)] space-y-2">
                  <div className="flex items-center space-x-2 text-amber-300 font-mono text-xs font-bold">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>OPERATOR APPROVAL REQUIRED FOR SENSITIVE OPERATION</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    One or more steps require explicit authorization before proceeding with external actions.
                  </p>
                  <div className="pt-2 flex items-center space-x-3">
                    {activeMission.steps.filter(s => s.status === 'WAITING_FOR_APPROVAL').map(ws => (
                      <button
                        key={ws.id}
                        onClick={() => handleApprove(activeMission.id, ws.id)}
                        className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-xs font-bold tracking-wider shadow-[0_0_15px_rgba(245,158,11,0.4)]"
                      >
                        APPROVE STEP #{ws.step_index}: {ws.title}
                      </button>
                    ))}
                    <button
                      onClick={() => handleCancel(activeMission.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs font-mono hover:text-rose-300"
                    >
                      ABORT MISSION
                    </button>
                  </div>
                </div>
              )}

              {/* Multi-Agent Execution Steps (DAG) */}
              <div className="space-y-3">
                <div className="text-xs font-mono text-slate-400 flex items-center justify-between">
                  <span>EXECUTION GRAPH & AGENT DELEGATION</span>
                  <span>{activeMission.steps?.length || 0} SEQUENTIAL / PARALLEL NODES</span>
                </div>

                <div className="space-y-3">
                  {activeMission.steps?.map((step) => {
                    const isExpanded = expandedStepId === step.id;
                    return (
                      <GlassCard 
                        key={step.id} 
                        className={`p-4 border transition-all ${
                          step.status === 'RUNNING' 
                            ? 'border-cyan-400 bg-cyan-950/20 shadow-[0_0_15px_rgba(0,240,255,0.15)]'
                            : step.status === 'WAITING_FOR_APPROVAL'
                            ? 'border-amber-400 bg-amber-950/20'
                            : 'border-slate-800/80 bg-slate-950/70'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
                                NODE #{step.step_index}
                              </span>
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase ${getAgentBadgeColor(step.agent_key)}`}>
                                <Bot className="w-3 h-3 inline mr-1" />
                                {step.agent_key} AGENT
                              </span>
                              {step.depends_on && step.depends_on.length > 0 && (
                                <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                  Prerequisites: Step {step.depends_on.join(', ')}
                                </span>
                              )}
                              {getStatusBadge(step.status)}
                            </div>

                            <h3 className="text-sm font-semibold text-slate-100">
                              {step.title}
                            </h3>
                            <p className="text-xs text-slate-400">
                              {step.description}
                            </p>
                          </div>

                          {/* Action Button for Step */}
                          <div className="flex items-center space-x-2 shrink-0">
                            {step.status === 'FAILED' && (
                              <button
                                onClick={() => handleRetry(activeMission.id, step.id)}
                                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-xs flex items-center space-x-1"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>RETRY</span>
                              </button>
                            )}
                            <button
                              onClick={() => setExpandedStepId(isExpanded ? null : step.id)}
                              className="px-2 py-1 rounded bg-slate-900 text-slate-400 hover:text-slate-200 text-xs font-mono"
                            >
                              {isExpanded ? 'COLLAPSE' : 'INSPECT'}
                            </button>
                          </div>
                        </div>

                        {/* Expanded Node Details */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2 text-xs font-mono">
                            <div className="flex items-center space-x-2 text-slate-400">
                              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Tool Invocation: <strong className="text-cyan-300">{step.tool}</strong></span>
                            </div>
                            <div className="p-2.5 rounded bg-slate-950 border border-slate-900 overflow-x-auto text-[11px] text-slate-300">
                              <span className="text-slate-500">// Arguments:</span>
                              <pre className="text-cyan-200">{JSON.stringify(step.args, null, 2)}</pre>
                            </div>

                            {step.result && (
                              <div className="p-2.5 rounded bg-slate-950 border border-emerald-900/40 overflow-x-auto text-[11px] text-emerald-300">
                                <span className="text-emerald-500">// Execution Result:</span>
                                <pre>{JSON.stringify(step.result, null, 2)}</pre>
                              </div>
                            )}

                            {step.error && (
                              <div className="p-2.5 rounded bg-rose-950/40 border border-rose-900/40 text-[11px] text-rose-300">
                                <strong>Error:</strong> {step.error}
                              </div>
                            )}
                          </div>
                        )}
                      </GlassCard>
                    );
                  })}
                </div>
              </div>

              {/* Final Deliverables Showcase */}
              {activeMission.deliverables && activeMission.deliverables.length > 0 && (
                <GlassCard className="p-5 border-emerald-500/30 bg-slate-950/90 space-y-4">
                  <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                    <div className="flex items-center space-x-2 text-emerald-300 font-mono text-xs font-bold">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span>MISSION FINAL DELIVERABLES</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                      {activeMission.deliverables.length} OUTPUT ARTIFACTS
                    </span>
                  </div>

                  <div className="space-y-3">
                    {activeMission.deliverables.map((del, idx) => (
                      <div key={idx} className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-200">
                            Artifact #{del.step_index}: {del.title}
                          </span>
                          <button
                            onClick={() => copyDeliverable(del.output, `del-${idx}`)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-mono flex items-center space-x-1"
                          >
                            {copiedId === `del-${idx}` ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>COPIED</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>COPY ARTIFACT</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="p-2.5 rounded bg-slate-950 text-[11px] font-mono text-slate-300 max-h-48 overflow-y-auto">
                          <pre className="whitespace-pre-wrap">{typeof del.output === 'string' ? del.output : JSON.stringify(del.output, null, 2)}</pre>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}
            </div>
          ) : (
            <GlassCard className="p-12 text-center text-xs font-mono text-slate-500">
              Select a mission from the directives list or dispatch a new objective above.
            </GlassCard>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
};

export default MissionControlPage;
