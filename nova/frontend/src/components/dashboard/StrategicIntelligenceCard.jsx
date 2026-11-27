import React, { useState, useEffect } from 'react';
import {
  Compass,
  Brain,
  Scale,
  GitBranch,
  ShieldAlert,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  RefreshCw,
  Search,
  Eye,
  Sliders,
  Layers,
  ArrowRight,
  TrendingUp,
  FileText
} from 'lucide-react';
import {
  createStrategicObjective,
  getStrategicObjectives,
  getStrategicConflicts,
  performDeepReasoning,
  evaluateStrategicDecision,
  runStrategicSimulation,
  runPreExecutionReview,
  checkAutonomyGovernance
} from '../../services/api';

export const StrategicIntelligenceCard = () => {
  const [activeTab, setActiveTab] = useState('objectives'); // objectives | reasoning | decisions | simulations | reviews
  const [objectives, setObjectives] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [reasoningResult, setReasoningResult] = useState(null);
  const [decisionResult, setDecisionResult] = useState(null);
  const [simulationResult, setSimulationResult] = useState(null);
  const [reviewResult, setReviewResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [inputQuery, setInputQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [objsRes, confRes] = await Promise.all([
        getStrategicObjectives().catch(() => ({ data: { objectives: [] } })),
        getStrategicConflicts().catch(() => ({ data: { conflicts: [] } }))
      ]);
      setObjectives(objsRes.data?.objectives || []);
      setConflicts(confRes.data?.conflicts || []);
    } catch (err) {
      console.error('Failed to load strategic data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInterpretObjective = async (e) => {
    e.preventDefault();
    if (!inputQuery.trim()) return;

    try {
      setLoading(true);
      const res = await createStrategicObjective({ rawInput: inputQuery.trim() });
      setStatusMessage(`Objective parsed: "${res.data.objective.title}" with ${res.data.objective.initiatives?.length || 2} initiatives.`);
      setInputQuery('');
      await fetchData();
    } catch (err) {
      setStatusMessage(`Failed to interpret objective: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunSampleReasoning = async () => {
    try {
      setLoading(true);
      const res = await performDeepReasoning({
        question: 'Should JARVIS deploy automated database checkpoint compactors during peak hours?',
        context: { environment: 'production', active_missions: 3 },
        availableEvidence: [
          { content: 'Historical I/O metrics show 45% latency spike during unthrottled vacuuming', type: 'HISTORICAL_TELEMETRY' }
        ],
        constraints: ['Zero impact to user chat latency']
      });
      setReasoningResult(res.data.reasoning);
      setStatusMessage('Deep reasoning analysis completed across 10 structured stages.');
    } catch (err) {
      setStatusMessage(`Reasoning failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunSampleDecision = async () => {
    try {
      setLoading(true);
      const res = await evaluateStrategicDecision({
        decision_context: 'Select caching architecture for multi-device ambient synchronization',
        options: [
          { name: 'In-Memory LRU with SQLite WAL', scores: { security_implications: 9.0, reversibility: 9.0, cost_and_resources: 9.0 } },
          { name: 'External Redis Cloud Cluster', scores: { security_implications: 6.5, reversibility: 6.0, cost_and_resources: 4.5 } }
        ]
      });
      setDecisionResult(res.data.decision);
      setStatusMessage(`MCDA completed: Recommended '${res.data.decision.recommended_option}'.`);
    } catch (err) {
      setStatusMessage(`Decision evaluation failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunSampleSimulation = async () => {
    try {
      setLoading(true);
      const res = await runStrategicSimulation({
        scenario_name: 'Simulated 50% Resource Constraint & 2-day Deadline Acceleration',
        simulation_type: 'DEADLINE_SHIFT',
        parameters: { resource_strain: 1.5, deadline_shift_days: -2, simulated_failure_rate: 0.1 }
      });
      setSimulationResult(res.data.simulation);
      setStatusMessage('Counterfactual scenario simulation generated (Strictly Read-Only).');
    } catch (err) {
      setStatusMessage(`Simulation failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunSampleReview = async () => {
    try {
      setLoading(true);
      const res = await runPreExecutionReview({
        target_id: 'sample-mission-plan-01',
        target_type: 'PLAN',
        assumptions: [
          'External network endpoints are 100% available without throttling',
          'Disk write operations require no human confirmation'
        ],
        proposed_actions: [
          { tool: 'read_file' },
          { tool: 'format_disk' } // Irreversible gate
        ]
      });
      setReviewResult(res.data.review);
      setStatusMessage(`Critical review finished: Verdict '${res.data.review.verdict}'.`);
    } catch (err) {
      setStatusMessage(`Review failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl text-slate-100 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-400">
            <Compass className="w-5 h-5 animate-spin-slow" />
          </div>
          <div>
            <h3 className="font-semibold text-lg tracking-wide text-slate-100 flex items-center gap-2">
              Strategic Intelligence & General Autonomy
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Phase 13
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              High-level objective deconstruction, cross-domain reasoning, MCDA decisions & counterfactuals
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
          title="Refresh Strategic Space"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {statusMessage && (
        <div className="text-xs bg-slate-800/80 border border-slate-700 text-indigo-300 px-3 py-2 rounded-lg flex items-center justify-between">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-200">
            &times;
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-2 text-xs font-medium">
        {[
          { id: 'objectives', label: `Objectives & Initiatives (${objectives.length})` },
          { id: 'reasoning', label: 'Deep Reasoning (10 Stages)' },
          { id: 'decisions', label: 'Decision Intelligence (MCDA)' },
          { id: 'simulations', label: 'Counterfactual Simulations' },
          { id: 'reviews', label: 'Critical Reviews & Gates' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === tab.id
                ? 'bg-slate-800 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Strategic Objectives */}
      {activeTab === 'objectives' && (
        <div className="space-y-4">
          <form onSubmit={handleInterpretObjective} className="flex gap-2">
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Enter ambiguous or complex strategic directive (e.g. 'Audit repository resilience and establish multi-region redundancy')..."
              className="flex-1 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={loading || !inputQuery.trim()}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white rounded-lg transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Deconstruct Objective
            </button>
          </form>

          {conflicts.length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Strategic Conflicts Detected ({conflicts.length})
              </div>
              {conflicts.map((c, i) => (
                <p key={i} className="text-slate-300 text-[11px]">
                  Conflict between "{c.objective_a?.title}" and "{c.objective_b?.title}": {c.reason}
                </p>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {objectives.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4 text-center">No strategic objectives analyzed yet.</p>
            ) : (
              objectives.map(obj => (
                <div key={obj.id} className="p-3 bg-slate-800/40 border border-slate-800 rounded-lg text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-100 flex items-center gap-2">
                      <Compass className="w-4 h-4 text-indigo-400" />
                      {obj.title}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                      obj.status === 'ACHIEVED' ? 'bg-emerald-500/20 text-emerald-300' :
                      obj.status === 'IN_PROGRESS' ? 'bg-cyan-500/20 text-cyan-300' :
                      'bg-slate-700 text-slate-300'
                    }`}>
                      {obj.status} ({(obj.progress * 100).toFixed(0)}%)
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-800 rounded-full h-1.5">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.round(obj.progress * 100)}%` }}
                    />
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1">
                    <span>Confidence: <strong className="text-slate-200">{(obj.confidence * 100).toFixed(0)}%</strong></span>
                    <span>Constraints: <strong className="text-slate-200">{obj.constraints?.length || 0}</strong></span>
                    <span>Risks: <strong className="text-slate-200">{obj.risks?.length || 0}</strong></span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Deep Reasoning */}
      {activeTab === 'reasoning' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Multi-step structured reasoning: distinguishes correlation vs causation and tracks uncertainty.
            </p>
            <button
              onClick={handleRunSampleReasoning}
              disabled={loading}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-medium rounded-lg text-white transition flex items-center gap-1.5"
            >
              <Brain className="w-3.5 h-3.5" />
              Run Deep Reasoning Probe
            </button>
          </div>

          {reasoningResult ? (
            <div className="p-4 bg-slate-800/40 border border-slate-800 rounded-lg space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-semibold text-indigo-300">{reasoningResult.intent_type}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                  Confidence: {(reasoningResult.confidence * 100).toFixed(0)}% | Uncertainty: {(reasoningResult.uncertainty_score * 100).toFixed(0)}%
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Question:</span>
                <p className="text-slate-200">{reasoningResult.question}</p>
              </div>
              <div className="p-2.5 bg-slate-900/60 rounded border border-slate-800">
                <span className="text-emerald-400 font-medium">Conclusion:</span>
                <p className="text-slate-100 mt-1">{reasoningResult.conclusion}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                <div className="p-2 bg-slate-900/40 rounded border border-slate-800">
                  <span className="text-indigo-400 font-medium">Causal Distinction:</span>
                  <p className="text-slate-400 mt-0.5">{reasoningResult.correlation_vs_causation?.distinction_rationale}</p>
                </div>
                <div className="p-2 bg-slate-900/40 rounded border border-slate-800">
                  <span className="text-amber-400 font-medium">Identified Knowledge Gaps:</span>
                  <p className="text-slate-400 mt-0.5">{reasoningResult.knowledge_gaps?.join(', ') || 'None'}</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-4 text-center">Click 'Run Deep Reasoning Probe' to execute multi-step causal reasoning.</p>
          )}
        </div>
      )}

      {/* Tab 3: Decision Intelligence (MCDA) */}
      {activeTab === 'decisions' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Multi-Criteria Decision Analysis evaluating alternatives, trade-offs, and conditions changing recommendation.
            </p>
            <button
              onClick={handleRunSampleDecision}
              disabled={loading}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-medium rounded-lg text-white transition flex items-center gap-1.5"
            >
              <Scale className="w-3.5 h-3.5" />
              Evaluate Decision (MCDA)
            </button>
          </div>

          {decisionResult ? (
            <div className="p-4 bg-slate-800/40 border border-slate-800 rounded-lg space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-semibold text-slate-100">Context: {decisionResult.decision_context}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                  Confidence: {(decisionResult.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded">
                <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Recommended Alternative: {decisionResult.recommended_option} (Score: {decisionResult.recommended_composite_score}/10)
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-medium">MCDA Evaluated Options:</span>
                <div className="mt-1 space-y-1">
                  {decisionResult.options?.map((opt, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-slate-900/40 rounded border border-slate-800">
                      <span className="text-slate-200">{opt.name}</span>
                      <span className="font-mono text-indigo-300 font-semibold">{opt.composite_score} pts</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-[11px] text-slate-400 space-y-1">
                <span className="text-slate-300 font-medium">Conditions that would change recommendation:</span>
                {decisionResult.conditions_changing_recommendation?.map((c, i) => (
                  <p key={i} className="text-slate-400">&bull; {c}</p>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-4 text-center">Click 'Evaluate Decision (MCDA)' to generate multi-criteria scoring.</p>
          )}
        </div>
      )}

      {/* Tab 4: Counterfactual Simulations */}
      {activeTab === 'simulations' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Counterfactual what-if projections (Best, Expected, Worst Case) with zero state mutation.
            </p>
            <button
              onClick={handleRunSampleSimulation}
              disabled={loading}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-medium rounded-lg text-white transition flex items-center gap-1.5"
            >
              <GitBranch className="w-3.5 h-3.5" />
              Run Scenario Simulation
            </button>
          </div>

          {simulationResult ? (
            <div className="p-4 bg-slate-800/40 border border-slate-800 rounded-lg space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-semibold text-slate-100">{simulationResult.scenario_name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono uppercase">
                  Strictly Read-Only Guarantee
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {/* Best Case */}
                <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-lg space-y-1">
                  <div className="font-semibold text-emerald-400 text-xs">{simulationResult.best_case?.label}</div>
                  <p className="text-[11px] text-slate-300">Completion Prob: <strong className="text-emerald-300">{(simulationResult.best_case?.completion_probability * 100).toFixed(0)}%</strong></p>
                  <p className="text-[11px] text-slate-400">Duration: ~{simulationResult.best_case?.estimated_duration_hours}h</p>
                </div>
                {/* Expected Case */}
                <div className="p-3 bg-blue-950/20 border border-blue-500/30 rounded-lg space-y-1">
                  <div className="font-semibold text-blue-400 text-xs">{simulationResult.expected_case?.label}</div>
                  <p className="text-[11px] text-slate-300">Completion Prob: <strong className="text-blue-300">{(simulationResult.expected_case?.completion_probability * 100).toFixed(0)}%</strong></p>
                  <p className="text-[11px] text-slate-400">Duration: ~{simulationResult.expected_case?.estimated_duration_hours}h</p>
                </div>
                {/* Worst Case */}
                <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-lg space-y-1">
                  <div className="font-semibold text-rose-400 text-xs">{simulationResult.worst_case?.label}</div>
                  <p className="text-[11px] text-slate-300">Completion Prob: <strong className="text-rose-300">{(simulationResult.worst_case?.completion_probability * 100).toFixed(0)}%</strong></p>
                  <p className="text-[11px] text-slate-400">Duration: ~{simulationResult.worst_case?.estimated_duration_hours}h</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-4 text-center">Click 'Run Scenario Simulation' to project multi-scenario outcomes.</p>
          )}
        </div>
      )}

      {/* Tab 5: Critical Reviews & Governance */}
      {activeTab === 'reviews' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Autonomous self-critique: actively challenges assumptions and identifies mandatory human approval gates.
            </p>
            <button
              onClick={handleRunSampleReview}
              disabled={loading}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-medium rounded-lg text-white transition flex items-center gap-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Conduct Pre-Execution Critique
            </button>
          </div>

          {reviewResult ? (
            <div className="p-4 bg-slate-800/40 border border-slate-800 rounded-lg space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-semibold text-slate-100">Review for: {reviewResult.target_id}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                  reviewResult.verdict === 'REVIEWED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                }`}>
                  Verdict: {reviewResult.verdict}
                </span>
              </div>
              {reviewResult.requires_human_approval && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded text-rose-300 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>Mandatory Human Approval Required: {reviewResult.approval_reasons?.join(', ')}</span>
                </div>
              )}
              <div>
                <span className="text-slate-300 font-medium">Challenged Assumptions ({reviewResult.challenged_assumptions?.length || 0}):</span>
                <div className="mt-1 space-y-1">
                  {reviewResult.challenged_assumptions?.map((c, i) => (
                    <div key={i} className="p-2 bg-slate-900/40 rounded border border-slate-800 flex items-start gap-2">
                      <span className={c.is_valid ? 'text-emerald-400' : 'text-amber-400'}>
                        {c.is_valid ? '✓' : '⚠'}
                      </span>
                      <div>
                        <div className="text-slate-200">{c.assumption}</div>
                        <div className="text-[10px] text-slate-400">{c.challenge}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-4 text-center">Click 'Conduct Pre-Execution Critique' to challenge assumptions and inspect gates.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default StrategicIntelligenceCard;
