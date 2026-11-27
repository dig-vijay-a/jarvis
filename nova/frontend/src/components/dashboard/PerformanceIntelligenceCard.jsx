import React, { useState, useEffect } from 'react';
import { Gauge, Cpu, Zap, Layers, RefreshCw, Database, CheckCircle2, Clock } from 'lucide-react';
import { getRoutingTelemetryMetrics } from '../../services/api';

export const PerformanceIntelligenceCard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const res = await getRoutingTelemetryMetrics();
      setData(res?.data || null);
      setError(null);
    } catch (err) {
      setError(err?.message || 'Telemetry endpoint unavailable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const timer = setInterval(fetchMetrics, 12000);
    return () => clearInterval(timer);
  }, []);

  const summary = data?.telemetry?.summary || {};
  const byPhase = data?.telemetry?.byPhase || [];
  const byTaskClass = data?.telemetry?.byTaskClass || [];
  const missions = data?.telemetry?.missions || {};
  const runtime = data?.runtime || {};
  const host = data?.host || {};
  const resident = Array.isArray(runtime.loadedModels) && runtime.loadedModels.length > 0
    ? runtime.loadedModels[0]
    : null;

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-emerald-500/30 rounded-xl p-5 shadow-2xl shadow-emerald-950/20 text-slate-100 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center space-x-2.5">
          <Gauge className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-emerald-300">
              Phase 15 — Local AI Performance & Intelligence Telemetry
            </h3>
            <p className="text-[11px] font-mono text-slate-400">
              {runtime.online ? 'OLLAMA ONLINE' : 'OLLAMA OFFLINE'} • {runtime.model || 'qwen3.5:4b'} • Zero-Cost Local ($0.00 Cloud Spend)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchMetrics}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center space-x-1.5 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs font-mono">
          Live telemetry unavailable: {error}
        </div>
      )}

      {/* Primary KPI Grid (all backed directly by SQLite + OS + Ollama /api/ps) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span>AVG / P95 TTFT</span>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-base font-mono font-bold text-slate-100">
            {summary.avg_ttft_ms ? `${Math.round(summary.avg_ttft_ms)} ms` : '0 ms'}
          </div>
          <div className="text-[10px] font-mono text-slate-500">
            p50: {Math.round(summary.p50_ttft_ms || 0)}ms • p95: {Math.round(summary.p95_ttft_ms || 0)}ms
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span>THROUGHPUT (TOK/S)</span>
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-base font-mono font-bold text-cyan-300">
            {summary.avg_tokens_per_sec || 0} gen/s
          </div>
          <div className="text-[10px] font-mono text-slate-500">
            prefill: {summary.avg_prompt_tokens_per_sec || 0} tok/s • threads: {runtime.resourceProfile?.numThreads || '-'}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span>HOST RAM & CONTEXT</span>
            <Database className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-base font-mono font-bold text-emerald-300">
            {host.freeRamGB ?? '-'} / {host.totalRamGB ?? '-'} GB free
          </div>
          <div className="text-[10px] font-mono text-slate-500">
            ctx={runtime.resourceProfile?.recommendedCtx || summary.max_num_ctx || '-'} • {resident ? 'RESIDENT' : 'UNLOADED'}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span>MISSION VERIFICATION</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-base font-mono font-bold text-slate-100">
            {missions.completionRatePercent ?? 0}% ({missions.statusCounts?.COMPLETED || 0}/{missions.total || 0})
          </div>
          <div className="text-[10px] font-mono text-slate-500">
            partial: {missions.statusCounts?.PARTIALLY_VERIFIED || 0} • blocked: {(missions.statusCounts?.BLOCKED_PROVIDER_UNAVAILABLE || 0) + (missions.statusCounts?.BLOCKED_LOCAL_MODEL_UNAVAILABLE || 0)}
          </div>
        </div>
      </div>

      {/* Phase Latency Breakdown + Task Complexity Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
        <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800">
          <div className="flex items-center space-x-1.5 text-[11px] text-cyan-300 uppercase mb-2 font-semibold">
            <Clock className="w-3.5 h-3.5" />
            <span>Latency by Phase (Live SQLite Traces)</span>
          </div>
          {byPhase.length === 0 ? (
            <div className="text-slate-500 text-[11px]">No inference calls recorded yet.</div>
          ) : (
            <div className="space-y-1">
              {byPhase.map((p) => (
                <div key={p.phase_type} className="flex items-center justify-between text-[11px] border-b border-slate-800/60 pb-1">
                  <span className="text-slate-300">{p.phase_type} ({p.count})</span>
                  <span className="text-emerald-300">{Math.round(p.avg_latency_ms || 0)} ms {p.avg_tokens_per_sec ? `• ${p.avg_tokens_per_sec} tok/s` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800">
          <div className="flex items-center space-x-1.5 text-[11px] text-emerald-300 uppercase mb-2 font-semibold">
            <Layers className="w-3.5 h-3.5" />
            <span>Task Complexity Classifier Distribution</span>
          </div>
          {byTaskClass.length === 0 ? (
            <div className="text-slate-500 text-[11px]">No classified turns recorded yet.</div>
          ) : (
            <div className="space-y-1">
              {byTaskClass.map((tc) => (
                <div key={tc.task_class} className="flex items-center justify-between text-[11px] border-b border-slate-800/60 pb-1">
                  <span className="text-slate-300">{tc.task_class} ({tc.count})</span>
                  <span className="text-cyan-300">ctx={tc.avg_num_ctx || '-'} • {Math.round(tc.avg_latency_ms || 0)} ms</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PerformanceIntelligenceCard;
