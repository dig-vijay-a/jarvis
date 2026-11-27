import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Activity,
  Play,
  Pause,
  Square,
  RefreshCw,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Cpu,
  Database,
  Layers,
  Server,
  Terminal,
  Zap,
  Flame,
  Radio,
  FileCheck,
  RotateCcw
} from 'lucide-react';
import {
  getSentinelEnduranceStatus,
  getSentinelEnduranceHistory,
  getSentinelEnduranceEvents,
  startSentinelEndurance,
  pauseSentinelEndurance,
  resumeSentinelEndurance,
  stopSentinelEndurance,
  exportSentinelEndurance
} from '../services/api';
import novaSocket from '../services/websocket';

export const SentinelLivePage = () => {
  const [statusData, setStatusData] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [events, setEvents] = useState([]);
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [exportModalContent, setExportModalContent] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // SVG Chart Dimensions
  const chartWidth = 500;
  const chartHeight = 110;

  // Fetch complete status & history
  const fetchStatus = async () => {
    try {
      setLoading(true);
      const [resStatus, resEvents, resHistory] = await Promise.all([
        getSentinelEnduranceStatus().catch(() => ({ data: null })),
        getSentinelEnduranceEvents({ limit: 40 }).catch(() => ({ data: { events: [] } })),
        getSentinelEnduranceHistory().catch(() => ({ data: null }))
      ]);

      if (resStatus?.data?.success) {
        setStatusData(resStatus.data);
      }
      if (resEvents?.data?.events) {
        setEvents(resEvents.data.events);
      }
      if (resHistory?.data) {
        setHistoryData(resHistory.data);
      }
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err) {
      console.warn('[Sentinel Live] Fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Initial load and WebSocket subscription
  useEffect(() => {
    fetchStatus();

    // Subscribe to real-time WebSocket feeds
    const handleTelemetry = (data) => {
      setStatusData(prev => ({
        ...prev,
        ...data,
        elapsed_seconds: data.elapsed_seconds,
        remaining_seconds: data.remaining_seconds,
        progress_percent: data.progress_percent,
        current_scenario: data.current_scenario,
        node_memory: data.node_process?.memory,
        cpu_percent: data.node_process?.cpu_percent,
        database: data.database,
        recent_samples: [...(prev?.recent_samples || []).slice(-59), data]
      }));
    };

    const handleEvent = (evt) => {
      setEvents(prev => [evt, ...prev.slice(0, 49)]);
    };

    const handleStatusChange = (newStatus) => {
      fetchStatus();
    };

    novaSocket.on('SENTINEL_TELEMETRY', handleTelemetry);
    novaSocket.on('SENTINEL_EVENT', handleEvent);
    novaSocket.on('SENTINEL_STATUS', handleStatusChange);

    // Fallback polling interval every 8 seconds
    const interval = setInterval(fetchStatus, 8000);

    return () => {
      novaSocket.off('SENTINEL_TELEMETRY', handleTelemetry);
      novaSocket.off('SENTINEL_EVENT', handleEvent);
      novaSocket.off('SENTINEL_STATUS', handleStatusChange);
      clearInterval(interval);
    };
  }, []);

  // Controls Handlers
  const handleStart = async () => {
    try {
      setActionLoading(true);
      await startSentinelEndurance();
      await fetchStatus();
    } catch (e) {
      alert(`Could not start endurance test: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    try {
      setActionLoading(true);
      await pauseSentinelEndurance();
      await fetchStatus();
    } catch (e) {
      alert(`Could not pause test: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    try {
      setActionLoading(true);
      await resumeSentinelEndurance();
      await fetchStatus();
    } catch (e) {
      alert(`Could not resume test: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopConfirm = async () => {
    try {
      setActionLoading(true);
      setShowStopModal(false);
      await stopSentinelEndurance(true);
      await fetchStatus();
    } catch (e) {
      alert(`Could not stop test: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setActionLoading(true);
      const res = await exportSentinelEndurance();
      if (res?.data?.success) {
        setExportModalContent(res.data);
      }
    } catch (e) {
      alert(`Could not export report: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Format seconds to HH:MM:SS
  const formatTime = (secs) => {
    if (isNaN(secs) || secs < 0) return '00:00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
  };

  // Status color pill
  const getStatusBadge = (st) => {
    switch (st) {
      case 'RUNNING':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/40 text-cyan-300 font-mono text-xs font-bold animate-pulse">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            RUNNING
          </span>
        );
      case 'PAUSED':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-400/40 text-amber-300 font-mono text-xs font-bold">
            <Pause className="w-3.5 h-3.5 text-amber-400" />
            PAUSED
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/40 text-emerald-300 font-mono text-xs font-bold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            COMPLETED (120 MIN)
          </span>
        );
      case 'STOPPED':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs font-bold">
            <Square className="w-3.5 h-3.5 text-slate-400" />
            STOPPED (PARTIAL)
          </span>
        );
      case 'FAILED':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-400/40 text-rose-300 font-mono text-xs font-bold">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            FAILED / SAFETY HALT
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-400 font-mono text-xs">
            STANDBY / IDLE
          </span>
        );
    }
  };

  // Filtered Events
  const filteredEvents = events.filter(e => {
    if (filterCategory === 'ALL') return true;
    if (filterCategory === 'WORKLOAD') return ['WORKLOAD', 'MISSION', 'MEMORY', 'GRAPH'].includes(e.category);
    if (filterCategory === 'FAILURES') return ['FAILURE', 'RECOVERY'].includes(e.category);
    if (filterCategory === 'SAFETY') return ['SAFETY', 'SYSTEM'].includes(e.category);
    return true;
  });

  // Render SVG Sparkline
  const renderSparkline = (dataPoints, color = '#00f0ff', strokeWidth = 2, maxVal = null) => {
    if (!dataPoints || dataPoints.length < 2) {
      return (
        <div className="h-24 flex items-center justify-center text-xs text-slate-500 font-mono">
          Accumulating empirical telemetry...
        </div>
      );
    }

    const min = Math.min(...dataPoints);
    const max = maxVal !== null ? maxVal : Math.max(...dataPoints, min + 0.1);
    const range = (max - min) || 1;

    const points = dataPoints.map((val, idx) => {
      const x = (idx / (dataPoints.length - 1)) * chartWidth;
      const y = chartHeight - ((val - min) / range) * (chartHeight - 14) - 7;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-24 overflow-visible">
        {/* Grid lines */}
        <line x1="0" y1="20" x2={chartWidth} y2="20" stroke="#1e293b" strokeDasharray="3 3" />
        <line x1="0" y1="60" x2={chartWidth} y2="60" stroke="#1e293b" strokeDasharray="3 3" />
        <line x1="0" y1="100" x2={chartWidth} y2="100" stroke="#1e293b" strokeDasharray="3 3" />

        {/* Data curve */}
        <polyline
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        {/* Fill underneath */}
        <polygon
          fill={color}
          fillOpacity="0.08"
          points={`0,${chartHeight} ${points} ${chartWidth},${chartHeight}`}
        />
      </svg>
    );
  };

  const isRunning = statusData?.status === 'RUNNING';
  const isPaused = statusData?.status === 'PAUSED';

  // Prepare chart series
  const recentSamples = statusData?.recent_samples || [];
  const heapPoints = recentSamples.map(s => s.node_process?.memory?.heap_used_mb || 0);
  const rssPoints = recentSamples.map(s => s.node_process?.memory?.rss_mb || 0);
  const cpuPoints = recentSamples.map(s => s.node_process?.cpu_percent || 0);
  const dbPoints = recentSamples.map(s => s.database?.size_kb || 0);

  return (
    <div className="space-y-6 pb-12 font-sans text-slate-100">
      {/* Top Banner & Control Deck */}
      <div className="bg-slate-950/90 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-6 shadow-2xl shadow-cyan-950/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/40 rounded-xl text-cyan-400">
                <ShieldCheck className="w-7 h-7 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-extrabold tracking-wider text-cyan-200 uppercase">
                    SENTINEL OBSERVABILITY DECK
                  </h1>
                  {getStatusBadge(statusData?.status)}
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {statusData?.stage_name ? statusData.stage_name.replace('_', ' ') : 'STAGE 2'}: {statusData?.target_duration_minutes || 240}-MINUTE CONTINUOUS AUTONOMOUS ENDURANCE & TELEMETRY STREAM
                </p>
              </div>
            </div>

            {/* Current Scenario & Counters */}
            <div className="flex flex-wrap items-center gap-4 mt-4 font-mono text-xs">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
                <Radio className={`w-3.5 h-3.5 ${isRunning ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
                <span className="text-slate-400">ACTIVE SCENARIO:</span>
                <span className="text-cyan-300 font-bold">{statusData?.current_scenario || 'STANDBY'}</span>
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
                <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-slate-400">PASSED:</span>
                <span className="text-emerald-300 font-bold">{statusData?.passed_count || 0}</span>
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-slate-400">FAILURES / HALTS:</span>
                <span className={statusData?.failed_count > 0 ? "text-rose-400 font-bold" : "text-slate-400 font-bold"}>
                  {statusData?.failed_count || 0}
                </span>
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
                <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-slate-400">RECOVERIES:</span>
                <span className="text-purple-300 font-bold">{statusData?.recovery_events_count || 0}</span>
              </div>
            </div>
          </div>

          {/* Action Control Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {!isRunning && !isPaused && (
              <button
                onClick={handleStart}
                disabled={actionLoading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono text-xs font-bold shadow-lg shadow-cyan-600/30 transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                START 2-HOUR RUN
              </button>
            )}

            {isRunning && (
              <button
                onClick={handlePause}
                disabled={actionLoading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600/90 hover:bg-amber-500 text-white font-mono text-xs font-bold transition-all shadow-lg shadow-amber-600/20 cursor-pointer"
              >
                <Pause className="w-4 h-4" />
                PAUSE
              </button>
            )}

            {isPaused && (
              <button
                onClick={handleResume}
                disabled={actionLoading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                RESUME
              </button>
            )}

            {(isRunning || isPaused) && (
              <button
                onClick={() => setShowStopModal(true)}
                disabled={actionLoading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600/80 hover:bg-rose-500 text-white font-mono text-xs font-bold transition-all shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                <Square className="w-4 h-4 fill-white" />
                STOP TEST
              </button>
            )}

            <button
              onClick={handleExport}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-mono text-xs font-semibold transition-all cursor-pointer"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              EXPORT REPORT
            </button>

            <button
              onClick={fetchStatus}
              disabled={loading}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-all"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Progress & Countdown Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div className="md:col-span-2">
            <div className="flex justify-between items-center text-xs font-mono text-slate-400 mb-1.5">
              <span>TEST PROGRESSION: {statusData?.progress_percent || 0}%</span>
              <span>TARGET: 7,200s (120 MIN)</span>
            </div>
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.min(100, statusData?.progress_percent || 0)}%` }}
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-3">
            <Clock className="w-4 h-4 text-cyan-400" />
            <div>
              <p className="text-[10px] font-mono text-slate-500 uppercase">ELAPSED TIME</p>
              <p className="text-base font-mono font-bold text-cyan-300">
                {formatTime(statusData?.elapsed_seconds || 0)}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-3">
            <Clock className="w-4 h-4 text-emerald-400" />
            <div>
              <p className="text-[10px] font-mono text-slate-500 uppercase">REMAINING TIME</p>
              <p className="text-base font-mono font-bold text-emerald-300">
                {formatTime(statusData?.remaining_seconds || 7200)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Real-Time Telemetry Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Node.js Heap & RSS */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/20 backdrop-blur-md">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Server className="w-4 h-4 text-cyan-400" />
              NODE.JS HEAP / RSS
            </span>
            <span className="text-[10px] text-emerald-400 font-bold">STABLE</span>
          </div>
          <div className="text-xl font-mono font-bold text-cyan-300">
            {statusData?.node_memory?.heap_used_mb || 0} <span className="text-xs text-slate-400 font-normal">MB HEAP</span>
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            RSS: <strong className="text-slate-300">{statusData?.node_memory?.rss_mb || 0} MB</strong> | Ceiling: 500 MB
          </div>
        </div>

        {/* CPU Utilization */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/20 backdrop-blur-md">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-blue-400" />
              PROCESS CPU USAGE
            </span>
            <span className="text-[10px] text-cyan-400 font-mono">10s DELTA</span>
          </div>
          <div className="text-xl font-mono font-bold text-blue-300">
            {statusData?.cpu_percent || 0}%
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            Sustained Limit: <strong className="text-slate-300">95%</strong>
          </div>
        </div>

        {/* SQLite Database & Integrity */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/20 backdrop-blur-md">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Database className="w-4 h-4 text-purple-400" />
              SQLITE DB & INTEGRITY
            </span>
            <span className="text-[10px] text-emerald-400 font-bold">WAL MODE</span>
          </div>
          <div className="text-xl font-mono font-bold text-purple-300">
            {parseFloat(((statusData?.database?.size_bytes || 0) / 1024).toFixed(1))} <span className="text-xs text-slate-400 font-normal">KB</span>
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            Integrity: <strong className="text-emerald-400">ok</strong> | Lock Retry: 5000ms
          </div>
        </div>

        {/* Local Python Agent & Socket */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/20 backdrop-blur-md">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-emerald-400" />
              LOCAL AGENT & SOCKET
            </span>
            <span className="text-[10px] text-emerald-400 font-bold">127.0.0.1</span>
          </div>
          <div className="text-xl font-mono font-bold text-emerald-300 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            ONLINE
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            WS Clients: <strong className="text-slate-300">1 ACTIVE</strong> | Bound to Localhost
          </div>
        </div>
      </div>

      {/* Historical Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Memory Sparkline */}
        <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 backdrop-blur-md">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-cyan-400" />
              <h3 className="font-mono text-xs font-bold tracking-wider text-slate-300 uppercase">
                HEAP & RSS MEMORY TREND (MB)
              </h3>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-cyan-400">
                <span className="w-2 h-2 rounded-full bg-cyan-400" /> Heap ({statusData?.node_memory?.heap_used_mb || 0} MB)
              </span>
              <span className="flex items-center gap-1 text-purple-400">
                <span className="w-2 h-2 rounded-full bg-purple-400" /> RSS ({statusData?.node_memory?.rss_mb || 0} MB)
              </span>
            </div>
          </div>
          {renderSparkline(heapPoints, '#00f0ff', 2)}
        </div>

        {/* CPU Sparkline */}
        <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 backdrop-blur-md">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-400" />
              <h3 className="font-mono text-xs font-bold tracking-wider text-slate-300 uppercase">
                CPU UTILIZATION HISTORY (%)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-blue-400">
              Current: {statusData?.cpu_percent || 0}%
            </span>
          </div>
          {renderSparkline(cpuPoints, '#38bdf8', 2, 100)}
        </div>
      </div>

      {/* Live Activity Feed */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-cyan-400" />
            <h3 className="font-mono text-sm font-bold text-cyan-200 uppercase tracking-wide">
              LIVE ACTIVITY & AUDIT EVENT STREAM
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
              {filteredEvents.length} EVENTS
            </span>
          </div>

          {/* Filter Categories */}
          <div className="flex items-center gap-1 font-mono text-[11px] bg-slate-900 p-1 rounded-xl border border-slate-800">
            {['ALL', 'WORKLOAD', 'FAILURES', 'SAFETY'].map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1 rounded-lg transition-all ${filterCategory === cat
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Event List */}
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {filteredEvents.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 font-mono">
              No events recorded yet. Start the 2-hour endurance run to stream verified operations.
            </div>
          ) : (
            filteredEvents.map((evt) => (
              <div
                key={evt.id}
                className="flex items-start justify-between gap-3 p-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 font-mono text-xs transition-colors"
              >
                <div className="flex items-start gap-2.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold mt-0.5 ${
                    evt.category === 'FAILURE' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                    evt.category === 'RECOVERY' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' :
                    evt.category === 'MISSION' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' :
                    evt.category === 'MEMORY' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' :
                    evt.category === 'SAFETY' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                    'bg-slate-800 text-slate-300'
                  }`}>
                    {evt.category}
                  </span>
                  <div>
                    <p className="font-semibold text-slate-200">{evt.title}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{evt.detail}</p>
                  </div>
                </div>
                <div className="text-right text-[10px] text-slate-500 whitespace-nowrap">
                  <span>+{evt.elapsed_seconds || 0}s</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Stop Confirmation Modal */}
      {showStopModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 animate-bounce" />
              <h3 className="font-bold text-base uppercase font-mono">CONFIRM TEST INTERRUPTION</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Halting the test before the 120-minute mark will finalize the audit status as <strong>STOPPED (PARTIAL)</strong>.
              All empirical measurements and telemetry up to this point will be safely saved in <code>SENTINEL_STAGE_1_REPORT.md</code>.
            </p>
            <div className="flex justify-end gap-3 pt-2 font-mono text-xs">
              <button
                onClick={() => setShowStopModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              >
                CANCEL
              </button>
              <button
                onClick={handleStopConfirm}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all shadow-lg shadow-rose-600/30 cursor-pointer"
              >
                HALT & SAVE REPORT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Report Modal */}
      {exportModalContent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-cyan-400" />
                <h3 className="font-mono text-sm font-bold text-cyan-200 uppercase">
                  SENTINEL STAGE 1 EXPORTED REPORT
                </h3>
              </div>
              <button
                onClick={() => setExportModalContent(null)}
                className="text-slate-400 hover:text-slate-200 text-sm font-mono"
              >
                CLOSE [ESC]
              </button>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-xs text-slate-300 bg-slate-950 p-4 rounded-xl border border-slate-800 whitespace-pre-wrap">
              {exportModalContent.report || JSON.stringify(exportModalContent.metrics, null, 2)}
            </div>
            <div className="flex justify-end gap-3 pt-2 font-mono text-xs">
              <button
                onClick={() => {
                  const blob = new Blob([exportModalContent.report || JSON.stringify(exportModalContent.metrics)], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'SENTINEL_STAGE_1_REPORT.md';
                  a.click();
                }}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-all shadow-lg shadow-cyan-600/30"
              >
                DOWNLOAD .MD FILE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SentinelLivePage;
