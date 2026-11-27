import React, { useState, useEffect } from 'react';
import { 
  Workflow, 
  Play, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Plus, 
  RotateCcw, 
  Terminal, 
  ShieldAlert,
  Youtube,
  Sparkles,
  FileText,
  Pause,
  RotateCw,
  XCircle,
  Calendar,
  Bell,
  Check,
  ListTodo
} from 'lucide-react';
import GlassCard from '../components/common/GlassCard';
import { 
  getWorkflows, 
  runWorkflow, 
  createWorkflow, 
  triggerEmergencyStop,
  createTaskPlan,
  getPlannedTasks,
  executePlannedTask,
  approvePlannedTaskStep,
  pausePlannedTask,
  resumePlannedTask,
  cancelPlannedTask,
  retryPlannedTaskStep,
  getScheduledJobs,
  createScheduledJob,
  deleteScheduledJob,
  getNotifications
} from '../services/api';
import novaSocket from '../services/websocket';

export const AutomationsPage = () => {
  const [activeTab, setActiveTab] = useState('planner'); // 'planner', 'workflows', 'scheduler'

  // Task Planner state
  const [plannedTasks, setPlannedTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [newInstruction, setNewInstruction] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);

  // Workflows state
  const [workflows, setWorkflows] = useState([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState(null);
  const [deliverables, setDeliverables] = useState(null);

  // Scheduler state
  const [scheduledJobs, setScheduledJobs] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobType, setNewJobType] = useState('AI_BRIEFING');

  const loadData = async () => {
    try {
      const [wfRes, planRes, jobRes, notifRes] = await Promise.allSettled([
        getWorkflows(),
        getPlannedTasks(),
        getScheduledJobs(),
        getNotifications()
      ]);

      if (wfRes.status === 'fulfilled' && wfRes.value.data.success) {
        setWorkflows(wfRes.value.data.workflows);
        if (!activeWorkflowId && wfRes.value.data.workflows.length > 0) {
          setActiveWorkflowId(wfRes.value.data.workflows[0].id);
        }
      }

      if (planRes.status === 'fulfilled' && planRes.value.data.success) {
        setPlannedTasks(planRes.value.data.tasks);
        if (!selectedTaskId && planRes.value.data.tasks.length > 0) {
          setSelectedTaskId(planRes.value.data.tasks[0].id);
        }
      }

      if (jobRes.status === 'fulfilled' && jobRes.value.data.success) {
        setScheduledJobs(jobRes.value.data.jobs);
      }

      if (notifRes.status === 'fulfilled' && notifRes.value.data.success) {
        setNotifications(notifRes.value.data.notifications);
      }
    } catch (err) {
      console.error('Failed to load automation data:', err);
    }
  };

  useEffect(() => {
    loadData();

    // WebSocket Listeners for Task Planner
    const unsubTaskStatus = novaSocket.on('TASK_PLAN_STATUS', (data) => {
      setPlannedTasks(prev => prev.map(t => t.id === data.id ? { ...t, status: data.status, error: data.error } : t));
    });

    const unsubTaskStep = novaSocket.on('TASK_PLAN_STEP_UPDATE', (data) => {
      setPlannedTasks(prev => prev.map(t => {
        if (t.id === data.id) {
          const steps = [...t.steps];
          steps[data.stepIndex] = data.step;
          return { ...t, steps, current_step_index: data.stepIndex };
        }
        return t;
      }));
    });

    const unsubWorkflowStep = novaSocket.on('WORKFLOW_STEP_UPDATE', (data) => {
      setWorkflows(prev => prev.map(wf => {
        if (wf.id === data.id) {
          const updatedSteps = [...wf.steps];
          if (updatedSteps[data.stepIndex]) {
            updatedSteps[data.stepIndex] = data.step;
          }
          return {
            ...wf,
            status: 'running',
            progress: data.progress,
            steps: updatedSteps,
            logs: data.logs || wf.logs
          };
        }
        return wf;
      }));
    });

    const unsubWorkflowStatus = novaSocket.on('WORKFLOW_STATUS', (data) => {
      setWorkflows(prev => prev.map(wf => {
        if (wf.id === data.id) {
          return {
            ...wf,
            status: data.status,
            progress: data.progress ?? wf.progress,
            logs: data.logs || wf.logs
          };
        }
        return wf;
      }));
      if (data.deliverables) {
        setDeliverables(data.deliverables);
      }
    });

    return () => {
      unsubTaskStatus();
      unsubTaskStep();
      unsubWorkflowStep();
      unsubWorkflowStatus();
    };
  }, [activeWorkflowId, selectedTaskId]);

  // Task Planner Handlers
  const handleCreatePlan = async (e) => {
    e.preventDefault();
    if (!newInstruction.trim()) return;

    setIsPlanning(true);
    try {
      const res = await createTaskPlan(newInstruction.trim());
      if (res.data.success) {
        setPlannedTasks(prev => [res.data.task, ...prev]);
        setSelectedTaskId(res.data.task.id);
        setNewInstruction('');
      }
    } catch (err) {
      alert('Error creating task plan: ' + err.message);
    } finally {
      setIsPlanning(false);
    }
  };

  const handleExecuteTask = async (id) => {
    try {
      await executePlannedTask(id);
    } catch (err) {
      alert('Execute error: ' + err.message);
    }
  };

  const handleApproveStep = async (taskId, stepIndex) => {
    try {
      await approvePlannedTaskStep(taskId, stepIndex);
    } catch (err) {
      alert('Approve error: ' + err.message);
    }
  };

  const handlePauseTask = async (taskId) => {
    try {
      await pausePlannedTask(taskId);
    } catch (err) {
      alert('Pause error: ' + err.message);
    }
  };

  const handleResumeTask = async (taskId) => {
    try {
      await resumePlannedTask(taskId);
    } catch (err) {
      alert('Resume error: ' + err.message);
    }
  };

  const handleCancelTask = async (taskId) => {
    try {
      await cancelPlannedTask(taskId);
    } catch (err) {
      alert('Cancel error: ' + err.message);
    }
  };

  const handleRetryStep = async (taskId, stepIndex) => {
    try {
      await retryPlannedTaskStep(taskId, stepIndex);
    } catch (err) {
      alert('Retry error: ' + err.message);
    }
  };

  // Workflow Runner
  const handleRunWorkflow = async (id) => {
    try {
      setDeliverables(null);
      await runWorkflow(id);
    } catch (err) {
      alert('Failed to launch workflow: ' + err.message);
    }
  };

  // Scheduled Jobs Handler
  const handleCreateJob = async (e) => {
    e.preventDefault();
    if (!newJobTitle.trim()) return;
    try {
      const res = await createScheduledJob({
        title: newJobTitle.trim(),
        type: newJobType,
        schedule_type: 'RECURRING',
        schedule_value: 'every_24h',
        action_type: newJobType
      });
      if (res.data.success) {
        setScheduledJobs(prev => [res.data.job, ...prev]);
        setNewJobTitle('');
      }
    } catch (err) {
      alert('Create job error: ' + err.message);
    }
  };

  const handleDeleteJob = async (id) => {
    try {
      await deleteScheduledJob(id);
      setScheduledJobs(prev => prev.filter(j => j.id !== id));
    } catch (err) {
      alert('Delete error: ' + err.message);
    }
  };

  const selectedPlannedTask = plannedTasks.find(t => t.id === selectedTaskId) || plannedTasks[0];
  const selectedWorkflow = workflows.find(w => w.id === activeWorkflowId) || workflows[0];

  return (
    <div className="space-y-5 pb-6">
      {/* Top Automation Category Tabs */}
      <div className="flex items-center space-x-2 p-1.5 rounded-xl bg-slate-950/80 border border-cyan-500/20 font-mono text-xs select-none">
        <button
          onClick={() => setActiveTab('planner')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
            activeTab === 'planner'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400 font-bold shadow-[0_0_12px_rgba(0,240,255,0.25)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ListTodo className="w-4 h-4" />
          <span>AUTONOMOUS TASK PLANNER (MODULE 3)</span>
        </button>

        <button
          onClick={() => setActiveTab('workflows')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
            activeTab === 'workflows'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400 font-bold shadow-[0_0_12px_rgba(0,240,255,0.25)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Workflow className="w-4 h-4" />
          <span>WORKFLOW PIPELINES</span>
        </button>

        <button
          onClick={() => setActiveTab('scheduler')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
            activeTab === 'scheduler'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400 font-bold shadow-[0_0_12px_rgba(0,240,255,0.25)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>PERSISTENT SCHEDULER (MODULE 6)</span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: AUTONOMOUS TASK PLANNER                                 */}
      {/* ============================================================== */}
      {activeTab === 'planner' && (
        <div className="space-y-4">
          {/* Create Plan Bar */}
          <GlassCard title="DECOMPOSE INSTRUCTION INTO AUTONOMOUS PLAN" icon={Sparkles} glow>
            <form onSubmit={handleCreatePlan} className="flex items-center space-x-2 font-mono text-xs">
              <input
                type="text"
                value={newInstruction}
                onChange={(e) => setNewInstruction(e.target.value)}
                placeholder='Enter complex goal (e.g. "Conduct competitive analysis of AI agent platforms and save report to memory")...'
                className="flex-1 px-4 py-3 rounded-xl bg-slate-900 border border-cyan-500/30 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                disabled={isPlanning || !newInstruction.trim()}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 text-slate-950 font-bold flex items-center space-x-2 shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all flex-shrink-0"
              >
                {isPlanning ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span>SYNTHESIZING PLAN...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>GENERATE PLAN</span>
                  </>
                )}
              </button>
            </form>
          </GlassCard>

          {/* Planned Tasks Grid & Selected Task Stepper */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left Column: Planned Tasks List */}
            <div className="space-y-2">
              <div className="text-[11px] font-mono text-slate-400 uppercase font-semibold px-1">
                REGISTERED EXECUTION PLANS ({plannedTasks.length})
              </div>

              {plannedTasks.length === 0 ? (
                <div className="p-8 text-center glass-panel rounded-xl text-slate-500 font-mono text-xs">
                  No execution plans generated yet. Enter an instruction above to create an autonomous plan.
                </div>
              ) : (
                plannedTasks.map((t) => {
                  const isSelected = t.id === selectedTaskId;
                  const isRunning = t.status === 'RUNNING';
                  const isWaiting = t.status === 'WAITING_FOR_APPROVAL';

                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTaskId(t.id)}
                      className={`p-3 rounded-xl cursor-pointer border transition-all font-mono text-xs ${
                        isSelected
                          ? 'glass-panel-glow border-cyan-400/60 shadow-[0_0_20px_rgba(0,240,255,0.15)]'
                          : 'glass-panel border-cyan-500/20 hover:border-cyan-500/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-slate-200 line-clamp-1">{t.instruction}</p>
                        <span className={`text-[9px] px-2 py-0.5 rounded uppercase font-bold border flex-shrink-0 ${
                          isWaiting
                            ? 'bg-amber-950 border-amber-400 text-amber-300 animate-pulse'
                            : isRunning
                            ? 'bg-cyan-950 border-cyan-400 text-cyan-300 animate-pulse'
                            : t.status === 'COMPLETED'
                            ? 'bg-emerald-950 border-emerald-400 text-emerald-300'
                            : 'bg-slate-900 border-slate-700 text-slate-400'
                        }`}>
                          {t.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-1 mt-1">{t.plan}</p>
                    </div>
                  );
                })
              )}
            </div>

            {/* Right 2 Columns: Detailed Stepper for Selected Task */}
            {selectedPlannedTask && (
              <div className="lg:col-span-2 space-y-4">
                <GlassCard
                  title={`EXECUTION PLAN: ${selectedPlannedTask.instruction}`}
                  icon={Workflow}
                  badge={`${selectedPlannedTask.status}`}
                  action={
                    <div className="flex items-center space-x-2">
                      {selectedPlannedTask.status === 'PENDING' && (
                        <button
                          onClick={() => handleExecuteTask(selectedPlannedTask.id)}
                          className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs shadow-[0_0_12px_rgba(0,240,255,0.3)]"
                        >
                          <Play className="w-3.5 h-3.5 fill-slate-950" />
                          <span>EXECUTE ALL</span>
                        </button>
                      )}

                      {selectedPlannedTask.status === 'RUNNING' && (
                        <button
                          onClick={() => handlePauseTask(selectedPlannedTask.id)}
                          className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-mono font-bold text-xs"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          <span>PAUSE</span>
                        </button>
                      )}

                      {selectedPlannedTask.status === 'PAUSED' && (
                        <button
                          onClick={() => handleResumeTask(selectedPlannedTask.id)}
                          className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>RESUME</span>
                        </button>
                      )}

                      {(selectedPlannedTask.status === 'RUNNING' || selectedPlannedTask.status === 'WAITING_FOR_APPROVAL') && (
                        <button
                          onClick={() => handleCancelTask(selectedPlannedTask.id)}
                          className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-rose-950 border border-rose-500/60 text-rose-300 font-mono text-xs hover:bg-rose-900"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>CANCEL</span>
                        </button>
                      )}
                    </div>
                  }
                >
                  <p className="text-xs font-mono text-cyan-200 mb-3 bg-slate-900/60 p-2.5 rounded-lg border border-cyan-500/20">
                    Strategy: {selectedPlannedTask.plan}
                  </p>

                  <div className="space-y-2.5">
                    {selectedPlannedTask.steps?.map((step, idx) => {
                      const isStepRunning = step.status === 'RUNNING';
                      const isStepDone = step.status === 'COMPLETED';
                      const isStepFailed = step.status === 'FAILED';
                      const isAwaitingApproval = selectedPlannedTask.status === 'WAITING_FOR_APPROVAL' && idx === selectedPlannedTask.current_step_index;

                      return (
                        <div
                          key={step.id || idx}
                          className={`p-3 rounded-xl border transition-all font-mono text-xs ${
                            isAwaitingApproval
                              ? 'bg-amber-950/60 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                              : isStepRunning
                              ? 'bg-cyan-950/60 border-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.2)]'
                              : isStepDone
                              ? 'bg-slate-950/60 border-emerald-500/30'
                              : isStepFailed
                              ? 'bg-rose-950/60 border-rose-500/40'
                              : 'bg-slate-900/40 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2.5">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                                isStepDone
                                  ? 'bg-emerald-500 text-slate-950'
                                  : isStepRunning
                                  ? 'bg-cyan-400 text-slate-950 animate-pulse'
                                  : isStepFailed
                                  ? 'bg-rose-500 text-white'
                                  : 'bg-slate-800 text-slate-400'
                              }`}>
                                {isStepDone ? <CheckCircle className="w-4 h-4" /> : idx + 1}
                              </span>
                              <div>
                                <p className="font-semibold text-slate-200">{step.name}</p>
                                <span className="text-[10px] text-slate-400 uppercase">
                                  TOOL: {step.tool || 'Autonomous Reasoning'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center space-x-2">
                              {isAwaitingApproval && (
                                <button
                                  onClick={() => handleApproveStep(selectedPlannedTask.id, idx)}
                                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                >
                                  APPROVE STEP
                                </button>
                              )}

                              {isStepFailed && (
                                <button
                                  onClick={() => handleRetryStep(selectedPlannedTask.id, idx)}
                                  className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px]"
                                >
                                  RETRY STEP
                                </button>
                              )}

                              <span className={`text-[9px] px-2 py-0.5 rounded uppercase font-bold border ${
                                isStepDone
                                  ? 'bg-emerald-950 border-emerald-400 text-emerald-400'
                                  : isStepRunning
                                  ? 'bg-cyan-950 border-cyan-400 text-cyan-300 animate-pulse'
                                  : isStepFailed
                                  ? 'bg-rose-950 border-rose-400 text-rose-300'
                                  : 'bg-slate-900 border-slate-700 text-slate-500'
                              }`}>
                                {step.status}
                              </span>
                            </div>
                          </div>

                          {/* Step Result Payload if available */}
                          {step.result && (
                            <div className="mt-2 pt-2 border-t border-slate-800/80">
                              <span className="text-[10px] text-slate-400 uppercase font-semibold">OUTPUT:</span>
                              <pre className="mt-1 p-2 bg-black/60 rounded text-emerald-200 text-[10px] overflow-x-auto">
                                {JSON.stringify(step.result, null, 2)}
                              </pre>
                            </div>
                          )}

                          {step.error && (
                            <div className="mt-2 p-2 rounded bg-rose-950/60 border border-rose-500/40 text-rose-300 text-[10px]">
                              Error: {step.error}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </GlassCard>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: WORKFLOW PIPELINES (Prebuilt workflows)                */}
      {/* ============================================================== */}
      {activeTab === 'workflows' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workflows.map((wf) => {
              const isSelected = wf.id === activeWorkflowId;
              const isRunning = wf.status === 'running';

              return (
                <div
                  key={wf.id}
                  onClick={() => setActiveWorkflowId(wf.id)}
                  className={`p-4 rounded-xl cursor-pointer border transition-all ${
                    isSelected
                      ? 'glass-panel-glow border-cyan-400/60 shadow-[0_0_20px_rgba(0,240,255,0.15)]'
                      : 'glass-panel border-cyan-500/20 hover:border-cyan-500/40'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-2 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
                        <Workflow className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-mono font-bold text-sm text-cyan-200">{wf.name}</h3>
                        <p className="text-[11px] font-mono text-slate-400 line-clamp-1">{wf.description}</p>
                      </div>
                    </div>

                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase font-bold ${
                      isRunning 
                        ? 'bg-amber-950/80 border-amber-400 text-amber-300 animate-pulse'
                        : wf.status === 'completed'
                        ? 'bg-emerald-950/80 border-emerald-400 text-emerald-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}>
                      {wf.status}
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                      <span>PROGRESS</span>
                      <span className="text-cyan-300 font-bold">{wf.progress}%</span>
                    </div>
                    <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${wf.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedWorkflow && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-4">
                <GlassCard
                  title={`PIPELINE: ${selectedWorkflow.name}`}
                  icon={Workflow}
                  badge={`${selectedWorkflow.steps?.length || 0} STAGES`}
                  action={
                    <button
                      onClick={() => handleRunWorkflow(selectedWorkflow.id)}
                      disabled={selectedWorkflow.status === 'running'}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 text-slate-950 font-mono font-bold text-xs shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all"
                    >
                      <Play className="w-3 h-3 fill-slate-950" />
                      <span>LAUNCH AGENT</span>
                    </button>
                  }
                >
                  <div className="space-y-2 mt-2">
                    {selectedWorkflow.steps?.map((st, idx) => (
                      <div
                        key={st.id || idx}
                        className="p-3 rounded-lg border bg-slate-900/40 border-slate-800 flex items-center justify-between font-mono text-xs"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="text-cyan-400 font-bold">{idx + 1}.</span>
                          <span>{st.name}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 uppercase">{st.action}</span>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                {deliverables && (
                  <GlassCard title="GENERATED ARTIFACTS & SCRIPTS" icon={FileText} glow>
                    <div className="space-y-3 font-mono text-xs">
                      {deliverables.shortScript && (
                        <div className="p-3 rounded-lg bg-slate-900 border border-cyan-500/30">
                          <p className="text-cyan-400 font-bold mb-1">VIRAL YOUTUBE SHORTS SCREENPLAY:</p>
                          <pre className="text-slate-200 whitespace-pre-wrap text-[11px] bg-black/40 p-2.5 rounded">
                            {deliverables.shortScript}
                          </pre>
                        </div>
                      )}
                      {deliverables.longScript && (
                        <div className="p-3 rounded-lg bg-slate-900 border border-blue-500/30">
                          <p className="text-blue-400 font-bold mb-1">LONG-FORM VIDEO SCRIPT:</p>
                          <pre className="text-slate-200 whitespace-pre-wrap text-[11px] bg-black/40 p-2.5 rounded max-h-48 overflow-y-auto">
                            {deliverables.longScript}
                          </pre>
                        </div>
                      )}
                    </div>
                  </GlassCard>
                )}
              </div>

              <div>
                <GlassCard title="EXECUTION TELEMETRY" icon={Terminal} className="h-[420px] flex flex-col">
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-[11px]">
                    {selectedWorkflow.logs?.map((lg, i) => (
                      <div key={i} className="p-2 rounded bg-black/50 border border-cyan-500/10 text-cyan-300">
                        {lg}
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: PERSISTENT SCHEDULER & NOTIFICATIONS (MODULE 6)        */}
      {/* ============================================================== */}
      {activeTab === 'scheduler' && (
        <div className="space-y-4 font-mono text-xs">
          <GlassCard title="SCHEDULE AUTOMATED BACKGROUND JOB" icon={Calendar} glow>
            <form onSubmit={handleCreateJob} className="flex flex-col sm:flex-row items-center gap-3">
              <input
                type="text"
                required
                value={newJobTitle}
                onChange={(e) => setNewJobTitle(e.target.value)}
                placeholder="Job description (e.g. Daily morning executive status summary)..."
                className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
              />
              <select
                value={newJobType}
                onChange={(e) => setNewJobType(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-cyan-300 focus:outline-none focus:border-cyan-400"
              >
                <option value="AI_BRIEFING">Daily AI Briefing</option>
                <option value="DAILY_TASK_SUMMARY">Daily Task Summary</option>
                <option value="RECURRING_REMINDER">Recurring Reminder</option>
              </select>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-all shadow-[0_0_12px_rgba(0,240,255,0.3)] flex-shrink-0"
              >
                SCHEDULE JOB
              </button>
            </form>
          </GlassCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Active Scheduled Jobs */}
            <GlassCard title="ACTIVE PERSISTENT JOBS (SURVIVES RESTARTS)" icon={Calendar} badge={`${scheduledJobs.length} JOBS`}>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {scheduledJobs.length === 0 ? (
                  <div className="py-8 text-center text-slate-500">
                    No scheduled jobs active. Use the form above to register automated background jobs.
                  </div>
                ) : (
                  scheduledJobs.map((job) => (
                    <div
                      key={job.id}
                      className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-bold text-slate-200">{job.title}</p>
                        <span className="text-[10px] text-cyan-400">TYPE: {job.type} • FREQ: {job.schedule_value}</span>
                        <p className="text-[9px] text-slate-500">Next Run: {new Date(job.next_run_at).toLocaleString()}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteJob(job.id)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors text-[10px]"
                      >
                        REMOVE
                      </button>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>

            {/* Notification History Log */}
            <GlassCard title="NOTIFICATION AUDIT HISTORY" icon={Bell} badge={`${notifications.length} NOTIFICATIONS`}>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-slate-500">
                    No background notifications dispatched yet.
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 flex items-start justify-between"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                            {notif.type}
                          </span>
                          <span className="font-semibold text-slate-200">{notif.title}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">{notif.message}</p>
                      </div>
                      <span className="text-[9px] text-slate-500 flex-shrink-0">
                        {new Date(notif.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutomationsPage;
