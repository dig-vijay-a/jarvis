import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Eye,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  ListChecks,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Play,
  Activity
} from 'lucide-react';
import GlassCard from '../common/GlassCard';
import {
  getComputerIntelligenceState,
  setScreenObservationPermission,
  observeDesktopScreen,
  executeClosedLoopComputerTask
} from '../../services/api';

export const ComputerIntelligenceCard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [taskInput, setTaskInput] = useState('');
  const [executing, setExecuting] = useState(false);
  const [statusNote, setStatusNote] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await getComputerIntelligenceState();
      if (res.data?.success) setData(res.data);
    } catch (err) {
      console.error('[ComputerIntelligence] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 7000);
    return () => clearInterval(id);
  }, []);

  const st = data?.state || {};
  const perm = Boolean(st.screen_permission_granted);
  const elements = st.detected_elements || [];
  const planned = st.planned_actions || [];
  const recovery = st.recovery_history || [];
  const audit = data?.recentAudit || [];

  const handleTogglePermission = async () => {
    setStatusNote(null);
    try {
      await setScreenObservationPermission(!perm);
      await refresh();
    } catch (err) {
      setStatusNote(err.response?.data?.error || err.message);
    }
  };

  const handleObserve = async () => {
    setStatusNote(null);
    setLoading(true);
    try {
      const res = await observeDesktopScreen({ mode: 'desktop', includeOcr: true, includeUiTree: true });
      if (res.data?.success) {
        setStatusNote(`Observed ${res.data.observation?.elements_count || 0} UI elements (${res.data.observation?.capture_method})`);
      }
      await refresh();
    } catch (err) {
      setStatusNote(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRunTask = async (e) => {
    e.preventDefault();
    if (!taskInput.trim()) return;
    setExecuting(true);
    setStatusNote(null);
    try {
      const res = await executeClosedLoopComputerTask({ instruction: taskInput.trim() });
      setStatusNote(res.data?.verificationReason || res.data?.status || 'Executed');
      setTaskInput('');
      await refresh();
    } catch (err) {
      setStatusNote(err.response?.data?.error || err.message);
      await refresh();
    } finally {
      setExecuting(false);
    }
  };

  return (
    <GlassCard
      title="AUTONOMOUS COMPUTER INTELLIGENCE"
      icon={Monitor}
      badge={perm ? 'SCREEN PERMISSION: GRANTED' : 'PERMISSION: EXPLICIT OPT-IN REQUIRED'}
    >
      <div className="space-y-4 font-mono text-xs">
        {/* Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-900/80 border border-cyan-500/20">
          <div className="flex items-center gap-2.5">
            {perm ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-400" />
            )}
            <div>
              <p className="text-slate-200 font-bold">
                Observation State: <span className="text-cyan-300">{st.status || 'IDLE'}</span>
              </p>
              <p className="text-[10px] text-slate-400">
                Verification: {st.verification_status || 'NONE'} | Confidence: {Math.round((st.last_confidence || 0) * 100)}%
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTogglePermission}
              className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${
                perm
                  ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/80'
                  : 'bg-amber-950/70 border-amber-500/50 text-amber-300 hover:bg-amber-900/80'
              }`}
            >
              {perm ? 'REVOKE SCREEN PERMISSION' : 'GRANT SCREEN PERMISSION'}
            </button>
            <button
              onClick={handleObserve}
              disabled={loading || !perm}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-slate-950 font-bold text-[11px]"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>OBSERVE SCREEN</span>
            </button>
            <button
              onClick={refresh}
              className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-cyan-300 hover:border-cyan-400"
              title="Refresh Computer Intelligence State"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {statusNote && (
          <div className="px-3 py-2 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-200 text-[11px]">
            {statusNote}
          </div>
        )}

        {/* Closed-Loop Task Input */}
        <form onSubmit={handleRunTask} className="flex items-center gap-2">
          <input
            type="text"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            placeholder='Closed-loop directive (e.g. "Switch to Notepad", "Click Save", "Scroll down")...'
            className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-cyan-400"
          />
          <button
            type="submit"
            disabled={executing || !taskInput.trim()}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{executing ? 'EXECUTING...' : 'RUN CLOSED LOOP'}</span>
          </button>
        </form>

        {/* Live State Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>ACTIVE APPLICATION & WINDOW</span>
            </div>
            <p className="text-slate-100 font-bold truncate">{st.active_app || 'None observed yet'}</p>
            <p className="text-[11px] text-cyan-300 truncate">{st.active_title || '—'}</p>
            <p className="text-[10px] text-slate-500">HWND: {st.active_hwnd || '—'}</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5 text-cyan-400" />
              <span>CURRENT TASK & PLANNED ACTIONS</span>
            </div>
            <p className="text-slate-100 truncate">{st.current_task || 'Standing by'}</p>
            {planned.length === 0 ? (
              <p className="text-[10px] text-slate-500">No pending actions queued.</p>
            ) : (
              <ul className="space-y-0.5 text-[10px] text-cyan-200 max-h-14 overflow-y-auto">
                {planned.map((p, idx) => (
                  <li key={idx} className="truncate">• [{p.type}] {p.description || p.target || p.element_name}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>CONFIDENCE & ADAPTIVE RECOVERY</span>
            </div>
            <p className="text-slate-100 font-bold">
              {Math.round((st.last_confidence || 0) * 100)}% Confidence — {st.verification_status || 'NONE'}
            </p>
            {recovery.length === 0 ? (
              <p className="text-[10px] text-slate-500">Recovery Events: 0 (nominal path)</p>
            ) : (
              <ul className="space-y-0.5 text-[10px] text-amber-300 max-h-14 overflow-y-auto">
                {recovery.map((r, i) => (
                  <li key={i} className="truncate">• {r.type}: {r.reason}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Detected UI Elements & Audit Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <p className="text-[10px] text-slate-400 mb-2">DETECTED UI ELEMENTS ({elements.length})</p>
            <div className="max-h-36 overflow-y-auto flex flex-wrap gap-1.5">
              {elements.length === 0 ? (
                <span className="text-[11px] text-slate-500">Click Observe Screen to extract live Win32/UIA elements.</span>
              ) : (
                elements.slice(0, 18).map((el, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-slate-950 border border-cyan-500/20 text-[10px] text-cyan-200 truncate max-w-[200px]">
                    [{el.control_type}] {el.name || '(control)'}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <p className="text-[10px] text-slate-400 mb-2 flex items-center gap-1">
              <Activity className="w-3 h-3 text-cyan-400" />
              <span>COMPUTER ACTION AUDIT TRAIL ({audit.length})</span>
            </p>
            <div className="max-h-36 overflow-y-auto space-y-1">
              {audit.length === 0 ? (
                <span className="text-[11px] text-slate-500">No closed-loop computer actions logged yet.</span>
              ) : (
                audit.slice(0, 8).map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-slate-950/70 border border-slate-800">
                    <span className="truncate text-slate-200">
                      [{a.phase}] {a.action_type} {a.target_element ? `→ ${a.target_element}` : ''}
                    </span>
                    <span className={a.outcome_verified ? 'text-emerald-400' : (a.blocked_reason ? 'text-rose-400' : 'text-amber-300')}>
                      {a.outcome_verified ? 'VERIFIED' : (a.blocked_reason || a.approval_status || 'LOGGED')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
};

export default ComputerIntelligenceCard;
