import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  Copy,
  Play,
  RefreshCw,
  Lock,
  Activity,
  FileText,
  Terminal
} from 'lucide-react';
import {
  getAegisStatus,
  runAegisReadinessCheck,
  approveAegisGate,
  toggleAegisChecklist
} from '../services/api';

const VERDICT_BADGES = {
  PASS: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  FAIL: 'bg-red-500/20 text-red-300 border-red-500/40',
  PARTIALLY_VERIFIED: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  NOT_TESTED: 'bg-slate-700/40 text-slate-300 border-slate-600',
  BLOCKED: 'bg-rose-900/40 text-rose-300 border-rose-500/40'
};

export default function AegisTestingPage() {
  const [statusData, setStatusData] = useState(null);
  const [selectedGateId, setSelectedGateId] = useState('gate-0');
  const [readiness, setReadiness] = useState(null);
  const [copiedCmd, setCopiedCmd] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState('guide'); // guide | telemetry | evidence | failures

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getAegisStatus();
      setStatusData(res.data);
    } catch (e) {
      console.error('Failed to load AEGIS status:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleCopy = (cmd) => {
    navigator.clipboard?.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 1500);
  };

  const handleReadinessCheck = async (gateId) => {
    try {
      const res = await runAegisReadinessCheck(gateId);
      setReadiness(res.data);
    } catch (e) {
      setReadiness({ gate_id: gateId, ready: false, verdict: 'ERROR', checks: [{ name: 'API', ok: false, detail: e.message }] });
    }
  };

  const handleApproveGate = async (gateId) => {
    await approveAegisGate(gateId, 'Operator');
    await loadStatus();
  };

  const handleToggleChecklist = async (itemId, current) => {
    await toggleAegisChecklist(itemId, !current);
    await loadStatus();
  };

  const gates = statusData?.gates || [];
  const selectedGate = gates.find(g => g.id === selectedGateId) || gates[0];
  const gateResult = statusData?.test_results?.gates?.[selectedGateId];
  const isApproved = statusData?.approvals?.[selectedGateId]?.approved;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cyan-500/20 pb-4">
        <div>
          <h1 className="text-2xl font-mono font-bold text-cyan-400 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            PHASE 21 — PROJECT AEGIS TESTING CENTRE
          </h1>
          <p className="text-xs font-mono text-slate-400 mt-1">
            Human-Guided, AI-Executed Production Readiness Programme (Gates 0–7)
          </p>
        </div>
        <button
          onClick={loadStatus}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-cyan-500/30 rounded-lg text-xs font-mono text-cyan-300"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Evidence
        </button>
      </div>

      {/* Gate Progress Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {gates.map(g => {
          const res = statusData?.test_results?.gates?.[g.id];
          const verdict = res?.verdict || 'NOT_TESTED';
          const isSelected = selectedGateId === g.id;
          return (
            <button
              key={g.id}
              onClick={() => { setSelectedGateId(g.id); setReadiness(null); }}
              className={`p-2.5 rounded-lg border text-left transition ${
                isSelected ? 'border-cyan-400 bg-cyan-950/40' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
              }`}
            >
              <div className="text-[10px] font-mono text-slate-400">GATE {g.number}</div>
              <div className="text-xs font-semibold text-slate-200 truncate">{g.title}</div>
              <span className={`inline-block mt-1.5 text-[9px] font-mono px-1.5 py-0.5 rounded border ${VERDICT_BADGES[verdict] || VERDICT_BADGES.NOT_TESTED}`}>
                {verdict}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Gate Panel */}
      {selectedGate && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-mono font-bold text-cyan-300">
                Gate {selectedGate.number}: {selectedGate.title}
              </h2>
              <p className="text-xs text-slate-300 mt-1">{selectedGate.purpose}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleReadinessCheck(selectedGate.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/80 hover:bg-blue-500 text-xs font-mono rounded-lg text-white"
              >
                <Activity className="w-3.5 h-3.5" />
                Run Readiness Check
              </button>
              <button
                onClick={() => handleApproveGate(selectedGate.id)}
                disabled={isApproved}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg ${
                  isApproved
                    ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-500/30 cursor-default'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                {isApproved ? 'Authorized by Operator' : 'Authorize Gate'}
              </button>
            </div>
          </div>

          {/* Readiness Verdict */}
          {readiness && readiness.gate_id === selectedGate.id && (
            <div className={`p-3 rounded-lg border text-xs space-y-2 ${
              readiness.ready ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-amber-950/30 border-amber-500/30'
            }`}>
              <div className="font-mono font-bold">
                Readiness Verdict: {readiness.verdict}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {readiness.checks.map((c, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-900/70 p-2 rounded">
                    {c.ok ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />}
                    <div>
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-slate-400 text-[11px]">{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sub-tabs */}
          <div className="flex gap-2 border-b border-slate-800 pb-2 text-xs font-mono">
            {[
              { id: 'guide', label: 'Preparation Guide & Checklist', icon: Play },
              { id: 'telemetry', label: `Live Telemetry (${statusData?.telemetry?.length || 0})`, icon: Activity },
              { id: 'evidence', label: 'Gate Results & Evidence', icon: FileText },
              { id: 'failures', label: 'Failure Explanations', icon: AlertTriangle }
            ].map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveSubTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${
                    activeSubTab === t.id ? 'bg-slate-800 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Subtab 1: Preparation Steps */}
          {activeSubTab === 'guide' && (
            <div className="space-y-3">
              {selectedGate.steps.map(s => {
                const itemId = `${selectedGate.id}-step-${s.step}`;
                const checked = !!statusData?.checklist?.[itemId];
                return (
                  <div key={itemId} className="p-3 bg-slate-800/50 border border-slate-700/60 rounded-lg text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-100">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleChecklist(itemId, checked)}
                          className="accent-cyan-400"
                        />
                        Step {s.step}: {s.title}
                      </label>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        s.automatable ? 'bg-cyan-500/20 text-cyan-300' : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {s.automatable ? 'JARVIS Automatable' : 'Manual Operator Step'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-300">
                      <div><span className="text-slate-400">What:</span> {s.what}</div>
                      <div><span className="text-slate-400">Why:</span> {s.why}</div>
                      <div><span className="text-slate-400">Where:</span> {s.where}</div>
                      <div><span className="text-slate-400">Expected:</span> {s.expected}</div>
                    </div>
                    <div className="flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded p-2 font-mono text-[11px]">
                      <span className="truncate text-emerald-300 flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 flex-shrink-0" />
                        {s.command}
                      </span>
                      <button
                        onClick={() => handleCopy(s.command)}
                        className="ml-2 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        {copiedCmd === s.command ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="text-[11px] text-amber-300/90">
                      If it fails: {s.on_fail}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Subtab 2: Telemetry */}
          {activeSubTab === 'telemetry' && (
            <div className="space-y-1.5 max-h-80 overflow-y-auto font-mono text-[11px]">
              {(statusData?.telemetry || []).map((t, i) => (
                <div key={i} className="p-2 bg-slate-950/70 border border-slate-800 rounded flex justify-between">
                  <span className="text-cyan-300">{t.gate || t.event || 'TELEMETRY'}</span>
                  <span className="text-slate-400">{JSON.stringify(t)}</span>
                </div>
              ))}
              {!statusData?.telemetry?.length && <p className="text-slate-500 italic">No telemetry recorded yet.</p>}
            </div>
          )}

          {/* Subtab 3: Gate Evidence */}
          {activeSubTab === 'evidence' && (
            <div className="space-y-3 text-xs">
              {gateResult ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 font-mono">
                    <span>Verdict:</span>
                    <span className={`px-2 py-0.5 rounded border ${VERDICT_BADGES[gateResult.verdict] || ''}`}>
                      {gateResult.verdict}
                    </span>
                    <span className="text-slate-400">{gateResult.summary}</span>
                  </div>
                  {(gateResult.checks || []).map((c, idx) => (
                    <div key={idx} className="p-2 bg-slate-800/50 border border-slate-800 rounded flex justify-between">
                      <span>{c.id}: {c.name}</span>
                      <span className={`font-mono text-[11px] px-2 py-0.5 rounded border ${VERDICT_BADGES[c.status] || ''}`}>
                        {c.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 italic">This gate has not been executed yet.</p>
              )}
            </div>
          )}

          {/* Subtab 4: Failures */}
          {activeSubTab === 'failures' && (
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-slate-300 whitespace-pre-wrap max-h-80 overflow-y-auto">
              {statusData?.failures_md || 'No failures recorded.'}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
