import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  GitFork,
  Compass,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Layers,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Cpu,
  BookmarkCheck,
  HelpCircle,
  Play
} from 'lucide-react';
import {
  getPersonalTwinSnapshot,
  getDecisionHistory,
  simulateTwinDeadline,
  simulateTwinResource,
  getTwinTimelineConflicts,
  confirmTwinFact,
  triggerTwinSync,
  getGraphContradictions
} from '../../services/api';

export const PersonalDigitalTwinCard = () => {
  const [activeTab, setActiveTab] = useState('snapshot'); // snapshot | graph | decisions | simulation
  const [snapshot, setSnapshot] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [contradictions, setContradictions] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [simOffset, setSimOffset] = useState(-2);
  const [simResult, setSimResult] = useState(null);
  const [simulating, setSimulating] = useState(false);

  const fetchTwinData = async () => {
    try {
      setLoading(true);
      const [snapRes, decRes, contRes, confRes] = await Promise.all([
        getPersonalTwinSnapshot().catch(() => ({ data: { snapshot: null } })),
        getDecisionHistory({ limit: 5 }).catch(() => ({ data: { decisions: [] } })),
        getGraphContradictions().catch(() => ({ data: { contradictions: [] } })),
        getTwinTimelineConflicts().catch(() => ({ data: { conflicts: [] } }))
      ]);

      if (snapRes?.data?.snapshot) setSnapshot(snapRes.data.snapshot);
      if (decRes?.data?.decisions) setDecisions(decRes.data.decisions);
      if (contRes?.data?.contradictions) setContradictions(contRes.data.contradictions);
      if (confRes?.data?.conflicts) setConflicts(confRes.data.conflicts);
    } catch (err) {
      console.warn('[PersonalDigitalTwinCard] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTwinData();
  }, []);

  const handleSync = async () => {
    try {
      setSyncing(true);
      await triggerTwinSync();
      await fetchTwinData();
    } catch (err) {
      console.error('Twin sync error:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleConfirmFact = async (factId) => {
    try {
      await confirmTwinFact(factId);
      await fetchTwinData();
    } catch (err) {
      console.error('Fact confirmation error:', err);
    }
  };

  const handleRunDeadlineSim = async () => {
    try {
      setSimulating(true);
      const res = await simulateTwinDeadline({
        target_title: snapshot?.active_projects?.[0]?.title || 'Core Project',
        days_offset: parseInt(simOffset, 10)
      });
      if (res?.data?.simulation) {
        setSimResult(res.data.simulation);
      }
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-cyan-500/30 p-5 shadow-[0_0_25px_rgba(0,240,255,0.08)] backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-cyan-500/20 gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <UserCheck className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-mono font-bold tracking-wide text-slate-100 flex items-center gap-2">
              PERSONAL DIGITAL TWIN <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-500/30">PHASE 10 CORE</span>
            </h3>
            <p className="text-[11px] font-mono text-slate-400">
              Persistent contextual identity, personal knowledge graph, and what-if simulation sandbox
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-3 py-1.5 rounded-lg bg-slate-800/90 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 font-mono text-xs flex items-center space-x-1.5 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'SYNCING...' : 'SYNC TWIN'}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 mt-4 mb-4 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('snapshot')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'snapshot'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>CONTEXT SNAPSHOT</span>
        </button>

        <button
          onClick={() => setActiveTab('graph')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'graph'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <GitFork className="w-3.5 h-3.5" />
          <span>KNOWLEDGE GRAPH</span>
          {contradictions.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('decisions')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'decisions'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookmarkCheck className="w-3.5 h-3.5" />
          <span>DECISION MEMORY</span>
        </button>

        <button
          onClick={() => setActiveTab('simulation')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'simulation'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>WHAT-IF SIMULATION</span>
        </button>
      </div>

      {/* Tab 1: Context Snapshot */}
      {activeTab === 'snapshot' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-500 uppercase flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-cyan-400" /> ACTIVE PROJECTS
              </span>
              <p className="text-lg font-mono font-bold text-slate-200 mt-1">
                {snapshot?.active_projects?.length || 0}
              </p>
              <p className="text-[10px] font-mono text-slate-400 truncate">
                {snapshot?.active_projects?.[0]?.title || 'None active'}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-500 uppercase flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-emerald-400" /> PENDING GOALS
              </span>
              <p className="text-lg font-mono font-bold text-slate-200 mt-1">
                {snapshot?.important_pending_goals?.length || 0}
              </p>
              <p className="text-[10px] font-mono text-slate-400 truncate">
                {snapshot?.important_pending_goals?.[0]?.title || 'No pending goals'}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-500 uppercase flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-amber-400" /> APPROACHING DEADLINES
              </span>
              <p className="text-lg font-mono font-bold text-amber-300 mt-1">
                {snapshot?.approaching_deadlines?.length || 0}
              </p>
              <p className="text-[10px] font-mono text-slate-400">
                {snapshot?.approaching_deadlines?.[0]?.hours_remaining
                  ? `Due in ${snapshot.approaching_deadlines[0].hours_remaining}h`
                  : 'No immediate deadlines'}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[10px] font-mono text-slate-500 uppercase flex items-center gap-1.5">
                <Cpu className="w-3 h-3 text-blue-400" /> AVAILABLE RESOURCES
              </span>
              <p className="text-lg font-mono font-bold text-slate-200 mt-1">
                {snapshot?.available_resources?.cpu_percent ?? 15}% CPU
              </p>
              <p className="text-[10px] font-mono text-slate-400">
                {snapshot?.available_resources?.memory_percent ?? 40}% RAM | {snapshot?.available_resources?.disk_percent ?? 50}% Disk
              </p>
            </div>
          </div>

          {/* Preferences with Inferred vs Confirmed badges */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-slate-300 uppercase">
                RELEVANT USER PREFERENCES & GROUND TRUTH
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                STRICT CONFIRMATION PROTOCOL
              </span>
            </div>

            {(!snapshot?.relevant_preferences || snapshot.relevant_preferences.length === 0) ? (
              <p className="text-xs font-mono text-slate-500">No active preferences configured.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {snapshot.relevant_preferences.map((p) => (
                  <div
                    key={p.id}
                    className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-start justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-semibold text-slate-200">
                          {p.title}
                        </span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full border ${
                            p.is_confirmed
                              ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                              : 'bg-amber-950/70 border-amber-500/40 text-amber-300'
                          }`}
                        >
                          {p.is_confirmed ? 'CONFIRMED' : 'INFERRED'}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-slate-400 mt-0.5">{p.content}</p>
                    </div>

                    {!p.is_confirmed && (
                      <button
                        onClick={() => handleConfirmFact(p.id)}
                        className="px-2 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono transition-all flex items-center space-x-1 flex-shrink-0"
                        title="Explicitly confirm as personal ground truth"
                      >
                        <ShieldCheck className="w-3 h-3" />
                        <span>CONFIRM</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Knowledge Graph Analysis */}
      {activeTab === 'graph' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <div>
              <p className="text-xs font-mono font-semibold text-slate-200">
                RELATIONAL CONTRADICTION & DEPENDENCY AUDIT
              </p>
              <p className="text-[11px] font-mono text-slate-400">
                Automated detection of conflicting semantic edges and orphaned deliverables
              </p>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${
                contradictions.length === 0
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-950 text-amber-300 border-amber-500/30 animate-pulse'
              }`}
            >
              {contradictions.length === 0 ? '0 CONTRADICTIONS' : `${contradictions.length} CONFLICTS FOUND`}
            </span>
          </div>

          {contradictions.length > 0 && (
            <div className="space-y-2">
              {contradictions.map((c, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs font-mono flex items-center justify-between"
                >
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>
                      Contradiction between <strong>{c.entity_1_name}</strong> and <strong>{c.entity_2_name}</strong> ({c.contradiction_type})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs font-mono text-slate-400">
            <p className="font-semibold text-slate-300 mb-1">GRAPH TOPOLOGY STATUS:</p>
            <p>• Edge Types: GOAL_SUPPORTS_GOAL, PROJECT_CONTRIBUTES_TO_GOAL, TASK_BELONGS_TO_PROJECT, SKILL_REQUIRED_FOR_PROJECT, RESOURCE_REQUIRED_BY_TASK</p>
            <p>• Multi-hop traversals: Enabled up to 5 hops with cycle detection and confidence pruning.</p>
          </div>
        </div>
      )}

      {/* Tab 3: Decision Memory */}
      {activeTab === 'decisions' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-slate-300 uppercase">
              RECENT CONTEXTUAL DECISIONS & EMPIRICAL LESSONS
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              AUDIT TRAIL
            </span>
          </div>

          {decisions.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs font-mono text-slate-500">
              No recent decisions recorded yet.
            </div>
          ) : (
            <div className="space-y-2">
              {decisions.map((d) => (
                <div
                  key={d.id}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-mono font-bold text-slate-200">{d.decision_title}</h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/30 text-cyan-300">
                      {d.impact_rating || 'MEDIUM'}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-slate-400">
                    <strong>Selected:</strong> {d.selected_option}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500">
                    <strong>Reasoning:</strong> {d.reasoning_summary}
                  </p>
                  {d.lessons_learned && (
                    <p className="text-[10px] font-mono text-emerald-400">
                      <strong>Lesson Learned:</strong> {d.lessons_learned}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: What-If Simulation Sandbox */}
      {activeTab === 'simulation' && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-slate-200 uppercase">
                HYPOTHETICAL DEADLINE IMPACT SIMULATOR (STRICTLY READ-ONLY)
              </span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                ZERO SIDE-EFFECTS
              </span>
            </div>

            <div className="flex items-center space-x-3">
              <label className="text-xs font-mono text-slate-400">Days Offset:</label>
              <input
                type="number"
                value={simOffset}
                onChange={(e) => setSimOffset(e.target.value)}
                className="w-20 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200"
              />
              <button
                onClick={handleRunDeadlineSim}
                disabled={simulating}
                className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono font-bold text-xs flex items-center space-x-1.5 transition-all disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{simulating ? 'COMPUTING...' : 'RUN SIMULATION'}</span>
              </button>
            </div>

            {simResult && (
              <div className="p-3 rounded-lg bg-slate-900/90 border border-cyan-500/30 font-mono text-xs space-y-1">
                <p className="text-cyan-300 font-bold">
                  SIMULATION RESULTS (Scenario: {simResult.scenario_type})
                </p>
                <p className="text-slate-300">
                  Target: <strong>{simResult.target?.title}</strong>
                </p>
                <p className="text-slate-400">
                  New Simulated Deadline: {simResult.simulated_impact?.new_simulated_deadline} (Shift: {simResult.simulated_impact?.shift_days} days)
                </p>
                <p className="text-amber-300">
                  Risk Assessment: {simResult.simulated_impact?.risk_assessment}
                </p>
                {simResult.conflicts?.length > 0 && (
                  <p className="text-red-400">
                    Detected Conflicts: {simResult.conflicts.length} overlapping commitments
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonalDigitalTwinCard;
