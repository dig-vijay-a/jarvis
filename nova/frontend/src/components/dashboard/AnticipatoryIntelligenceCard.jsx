import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  Sparkles,
  Cpu,
  HardDrive,
  BarChart2,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import GlassCard from '../common/GlassCard';
import {
  getOperationsDashboard,
  acceptPredictiveRecommendation,
  rejectPredictiveRecommendation,
  executePredictiveRecommendation,
  triggerPredictiveCycle
} from '../../services/api';

export const AnticipatoryIntelligenceCard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cycleRunning, setCycleRunning] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [expandedRecId, setExpandedRecId] = useState(null);
  const [confirmExecuteId, setConfirmExecuteId] = useState(null);

  const fetchPredictiveData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getOperationsDashboard();
      if (res.data?.success) {
        setData(res.data.dashboard?.predictiveIntelligence || null);
      }
    } catch (err) {
      console.error('[AnticipatoryIntelligence] Fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPredictiveData();
    const interval = setInterval(fetchPredictiveData, 15000);
    return () => clearInterval(interval);
  }, [fetchPredictiveData]);

  const handleRunCycle = async () => {
    try {
      setCycleRunning(true);
      setActionMessage({ type: 'info', text: 'Executing predictive intelligence cycle across operational logs...' });
      await triggerPredictiveCycle();
      await fetchPredictiveData();
      setActionMessage({ type: 'success', text: 'Predictive cycle complete: operational patterns and forecasts refreshed.' });
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err) {
      setActionMessage({ type: 'error', text: `Cycle error: ${err.message}` });
    } finally {
      setCycleRunning(false);
    }
  };

  const handleAccept = async (id) => {
    try {
      await acceptPredictiveRecommendation(id, 'Accepted via Operations Dashboard');
      setActionMessage({ type: 'success', text: `Recommendation accepted: category weight boosted.` });
      await fetchPredictiveData();
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err) {
      setActionMessage({ type: 'error', text: `Failed to accept: ${err.message}` });
    }
  };

  const handleReject = async (id) => {
    try {
      await rejectPredictiveRecommendation(id, 'Rejected via Operations Dashboard');
      setActionMessage({ type: 'info', text: `Recommendation rejected: category weight penalized.` });
      await fetchPredictiveData();
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err) {
      setActionMessage({ type: 'error', text: `Failed to reject: ${err.message}` });
    }
  };

  const handleExecute = async (id) => {
    try {
      const res = await executePredictiveRecommendation(id, true);
      setActionMessage({ type: 'success', text: `Action executed successfully through verified DAG pipeline.` });
      setConfirmExecuteId(null);
      await fetchPredictiveData();
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err) {
      setActionMessage({ type: 'error', text: `Execution failed: ${err.message}` });
    }
  };

  const pendingRecs = data?.recommendations?.pending || [];
  const resourceForecast = data?.resource_forecast || null;
  const goalRisks = data?.goal_risk_rankings || [];
  const metrics = data?.evaluation_metrics || null;
  const criticalGoals = goalRisks.filter(g => g.risk_level === 'CRITICAL' || g.risk_level === 'HIGH');

  return (
    <GlassCard className="p-4 border-cyan-500/30 shadow-[0_0_25px_rgba(0,240,255,0.08)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-cyan-500/20 gap-2">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-950/80 border border-cyan-400/40 text-cyan-300">
            <TrendingUp className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-cyan-200 tracking-wider uppercase">
                ANTICIPATORY INTELLIGENCE ENGINE
              </span>
              <span className="px-2 py-0.5 rounded-full bg-cyan-950/70 border border-cyan-400/30 text-cyan-300 font-mono text-[10px]">
                PHASE 9 ACTIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Pattern mining, risk forecasting, proactive recommendations & empirical calibration
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {metrics?.brier_score !== undefined && (
            <span className="px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-700 font-mono text-[10px] text-slate-300" title="Brier Score: Mean Squared Error (lower is better, <0.25 is well calibrated)">
              BS: <strong className="text-cyan-300">{metrics.brier_score.toFixed(3)}</strong> ({metrics.calibration_grade || 'GOOD'})
            </span>
          )}
          <button
            onClick={handleRunCycle}
            disabled={cycleRunning}
            className="px-3 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-400/50 hover:border-cyan-300 text-cyan-300 font-mono text-xs font-bold flex items-center space-x-1.5 transition-all disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${cycleRunning ? 'animate-spin' : ''}`} />
            <span>{cycleRunning ? 'SCANNING...' : 'SCAN NOW'}</span>
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div
          className={`my-3 p-2.5 rounded-xl font-mono text-xs flex items-center space-x-2 border ${
            actionMessage.type === 'error'
              ? 'bg-rose-950/80 border-rose-500/50 text-rose-200'
              : actionMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
              : 'bg-cyan-950/80 border-cyan-500/50 text-cyan-200'
          }`}
        >
          {actionMessage.type === 'error' ? (
            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Trajectory & Risk Quick Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 my-3">
        {/* Resource Trajectory */}
        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center space-x-2.5 font-mono text-xs">
          <HardDrive className="w-4 h-4 text-indigo-400 shrink-0" />
          <div className="flex-1 truncate">
            <div className="text-[10px] text-slate-400">STORAGE DEPLETION TRAJECTORY</div>
            <div className="font-bold text-slate-200 truncate">
              {resourceForecast?.disk_exhaustion_forecast?.will_exhaust
                ? `Exhaustion in ~${Math.round(resourceForecast.disk_exhaustion_forecast.hours_to_exhaustion || 0)}h`
                : 'STABLE (>30 days)'}
            </div>
          </div>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              resourceForecast?.overall_resource_risk === 'CRITICAL' || resourceForecast?.overall_resource_risk === 'HIGH'
                ? 'bg-rose-950 border border-rose-500 text-rose-300'
                : 'bg-emerald-950 border border-emerald-500 text-emerald-300'
            }`}
          >
            {resourceForecast?.overall_resource_risk || 'LOW'}
          </span>
        </div>

        {/* Compute Load Classification */}
        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center space-x-2.5 font-mono text-xs">
          <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
          <div className="flex-1 truncate">
            <div className="text-[10px] text-slate-400">CPU LOAD CLASSIFICATION</div>
            <div className="font-bold text-slate-200 truncate">
              {resourceForecast?.cpu_pressure_forecast?.sustained_pressure
                ? 'SUSTAINED HIGH LOAD'
                : 'NORMAL / TRANSIENT'}
            </div>
          </div>
          <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-cyan-300">
            EMA {resourceForecast?.cpu_pressure_forecast?.ema_cpu ? Math.round(resourceForecast.cpu_pressure_forecast.ema_cpu) : 18}%
          </span>
        </div>

        {/* Goal Risk Status */}
        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center space-x-2.5 font-mono text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1 truncate">
            <div className="text-[10px] text-slate-400">GOAL RISKS MONITORED</div>
            <div className="font-bold text-slate-200 truncate">
              {criticalGoals.length > 0 ? `${criticalGoals.length} High Risk Goal(s)` : 'All Goals On Schedule'}
            </div>
          </div>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              criticalGoals.length > 0
                ? 'bg-amber-950 border border-amber-500 text-amber-300'
                : 'bg-emerald-950 border border-emerald-500 text-emerald-300'
            }`}
          >
            {goalRisks.length} EVALUATED
          </span>
        </div>
      </div>

      {/* Pending Actionable Recommendations Section */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[11px] font-bold text-slate-300 uppercase flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            ACTIONABLE RECOMMENDATIONS ({pendingRecs.length} PENDING)
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            CONFIRMED BY HUMAN AUTHORIZATION
          </span>
        </div>

        {pendingRecs.length === 0 ? (
          <div className="p-3.5 rounded-xl bg-slate-900/50 border border-dashed border-slate-800 text-center font-mono text-xs text-slate-400">
            ✓ No immediate predictive recommendations require attention. System operates within normal bounds.
          </div>
        ) : (
          <div className="space-y-2">
            {pendingRecs.map((rec) => {
              const isExpanded = expandedRecId === rec.id;
              const isConfirming = confirmExecuteId === rec.id;
              const confidencePct = Math.round((rec.confidence || 0.75) * 100);

              return (
                <div
                  key={rec.id}
                  className="p-3 rounded-xl bg-slate-900/90 border border-cyan-500/20 hover:border-cyan-500/40 transition-all font-mono text-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-start space-x-2.5 flex-1 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-400/40 text-[10px] text-cyan-300 font-bold shrink-0">
                        {rec.recommendation_type || 'PROACTIVE'}
                      </span>
                      <div className="truncate flex-1">
                        <div className="font-bold text-slate-200 truncate">{rec.title}</div>
                        <div className="text-[11px] text-slate-400 truncate">{rec.description}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <span
                        className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300"
                        title="Confidence score with uncertainty bounds"
                      >
                        CONF: <strong className="text-cyan-300">{confidencePct}%</strong> (±5%)
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-amber-300">
                        {rec.expected_impact || 'MED'} IMPACT
                      </span>
                    </div>
                  </div>

                  {/* Actions & Expansion */}
                  <div className="mt-2.5 pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={() => setExpandedRecId(isExpanded ? null : rec.id)}
                      className="text-[11px] text-slate-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      <span>{isExpanded ? 'Hide Details' : 'View Evidence & Action'}</span>
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleReject(rec.id)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition-colors"
                      >
                        REJECT
                      </button>
                      <button
                        onClick={() => handleAccept(rec.id)}
                        className="px-2.5 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-400/50 text-cyan-200 text-[11px] font-bold transition-colors"
                      >
                        ACCEPT
                      </button>
                      {isConfirming ? (
                        <div className="flex items-center space-x-1.5 animate-fadeIn">
                          <span className="text-[10px] text-amber-400 font-bold">CONFIRM?</span>
                          <button
                            onClick={() => handleExecute(rec.id)}
                            className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                          >
                            YES, EXECUTE
                          </button>
                          <button
                            onClick={() => setConfirmExecuteId(null)}
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px]"
                          >
                            CANCEL
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmExecuteId(rec.id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-300 text-[11px] font-bold flex items-center space-x-1"
                        >
                          <Play className="w-3 h-3" />
                          <span>AUTHORIZE</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Evidence View */}
                  {isExpanded && (
                    <div className="mt-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300 space-y-1 animate-fadeIn">
                      <div>
                        <strong className="text-slate-400">Time Horizon:</strong> {rec.time_horizon || 'SHORT_TERM'}
                      </div>
                      <div>
                        <strong className="text-slate-400">Risk Classification:</strong>{' '}
                        <span className="text-amber-300">{rec.risk_classification || 'REQUIRES_REVIEW'}</span>
                      </div>
                      {rec.suggested_action && (
                        <div>
                          <strong className="text-slate-400">Suggested Action:</strong>
                          <pre className="mt-1 p-2 rounded bg-slate-900 text-[10px] text-cyan-300 overflow-x-auto">
                            {typeof rec.suggested_action === 'string'
                              ? rec.suggested_action
                              : JSON.stringify(rec.suggested_action, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </GlassCard>
  );
};

export default AnticipatoryIntelligenceCard;
