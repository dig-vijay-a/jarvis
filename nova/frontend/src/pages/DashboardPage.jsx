import React, { useState } from 'react';
import { Send, Sparkles, Mic, MicOff, Volume2, ArrowRight, Bot, BrainCircuit, AlertCircle, Check, X, Workflow } from 'lucide-react';
import ArcReactor from '../components/dashboard/ArcReactor';
import DynamicWaveform from '../components/dashboard/DynamicWaveform';
import SystemStatusCards from '../components/dashboard/SystemStatusCards';
import QuickActions from '../components/dashboard/QuickActions';
import ActivityFeed from '../components/dashboard/ActivityFeed';
import ActiveTasksCard from '../components/dashboard/ActiveTasksCard';
import MemoryPeekCard from '../components/dashboard/MemoryPeekCard';
import AnticipatoryIntelligenceCard from '../components/dashboard/AnticipatoryIntelligenceCard';
import PersonalDigitalTwinCard from '../components/dashboard/PersonalDigitalTwinCard';
import AmbientIntelligenceCard from '../components/dashboard/AmbientIntelligenceCard';
import EvolutionDashboardCard from '../components/dashboard/EvolutionDashboardCard';
import StrategicIntelligenceCard from '../components/dashboard/StrategicIntelligenceCard';
import SentinelDashboardCard from '../components/dashboard/SentinelDashboardCard';
import PerformanceIntelligenceCard from '../components/dashboard/PerformanceIntelligenceCard';
import ComputerIntelligenceCard from '../components/dashboard/ComputerIntelligenceCard';

export const DashboardPage = ({
  systemStatus,
  tasks,
  memories,
  logs,
  isListening,
  isSpeaking,
  audioLevel,
  aiState,
  activeAgent = 'JARVIS Core',
  memoryActivity = null,
  pendingApproval = null,
  onApprovePendingAction,
  onRejectPendingAction,
  onToggleVoice,
  onSendMessage,
  onToggleTask,
  onNavigateTab,
  permissionError = null,
  transcript = '',
  wakeWordDetected = false,
  onClearPermissionError
}) => {
  const [inputText, setInputText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Top Telemetry & Resource Status Bar */}
      <SystemStatusCards
        telemetry={systemStatus?.telemetry || {}}
        agentOnline={systemStatus?.agentOnline || false}
      />

      {/* Pending Approval Notification Banner */}
      {pendingApproval && (
        <div className="p-3.5 rounded-xl bg-amber-950/70 border border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)] flex flex-col sm:flex-row items-center justify-between gap-3 font-mono text-xs">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 animate-bounce" />
            <div>
              <p className="font-bold text-amber-200 uppercase">CONFIRMATION REQUIRED: {pendingApproval.tool}</p>
              <p className="text-slate-300 text-[11px]">{pendingApproval.reason}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onRejectPendingAction(pendingApproval)}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors"
            >
              REJECT
            </button>
            <button
              onClick={() => onApprovePendingAction(pendingApproval)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-[0_0_10px_rgba(16,185,129,0.4)]"
            >
              APPROVE & PROCEED
            </button>
          </div>
        </div>
      )}

      {/* Central Command Core: Arc Reactor + Live Waveform + Fast Directive Bar */}
      <div className="relative rounded-2xl glass-panel-glow p-6 overflow-hidden flex flex-col items-center justify-center">
        {/* Status Pills */}
        <div className="flex items-center space-x-3 mb-2 font-mono text-[11px]">
          <span className="px-2.5 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-400/30 text-cyan-300 flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-cyan-400" />
            <span>ACTIVE: <strong>{activeAgent}</strong></span>
          </span>

          {memoryActivity && (
            <span className="px-2.5 py-0.5 rounded-full bg-blue-950/80 border border-blue-400/30 text-blue-300 flex items-center gap-1.5">
              <BrainCircuit className="w-3.5 h-3.5 text-blue-400" />
              <span>RETRIEVED {memoryActivity.count} CONTEXT MEMORIES</span>
            </span>
          )}
        </div>

        {/* Arc Reactor Core with Audio Reactivity */}
        <ArcReactor
          state={aiState}
          audioLevel={audioLevel}
          isListening={isListening}
          isSpeaking={isSpeaking}
          wakeWordDetected={wakeWordDetected}
          onClick={onToggleVoice}
        />

        {/* Dynamic Voice Waveform */}
        <div className="w-full max-w-xl my-2">
          <DynamicWaveform
            active={isListening || isSpeaking || aiState === 'thinking'}
            audioLevel={audioLevel}
            isListening={isListening}
            isSpeaking={isSpeaking}
          />
        </div>

        {/* Microphone Permission Warning Banner */}
        {permissionError && (
          <div className="w-full max-w-xl my-2 p-3 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs font-mono flex items-start gap-2 shadow-[0_0_20px_rgba(244,63,94,0.3)] animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
            <div className="flex-1 text-left">
              <strong className="text-rose-300">MICROPHONE NOTICE:</strong> {permissionError}
              <div className="mt-1 text-[11px] text-slate-300">
                💡 In Chrome or Edge: Click the 🔒 lock/camera icon next to the URL in your browser bar, toggle <strong>Microphone</strong> to <strong>Allow</strong>, then click the Arc Reactor again.
              </div>
            </div>
            {onClearPermissionError && (
              <button onClick={onClearPermissionError} className="text-rose-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Wake-Word Recognition Status Indicator */}
        {wakeWordDetected && (
          <div className="my-2 px-4 py-1.5 rounded-full bg-amber-950/80 border border-amber-400 text-amber-200 text-xs font-mono flex items-center gap-2 animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.5)]">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>⚡ <strong>WAKE-WORD RECOGNIZED</strong> — Listening for your directive...</span>
          </div>
        )}

        {/* Live Speech Recognition Transcript Indicator */}
        {isListening && (
          <div className="my-1.5 px-3.5 py-1 rounded-full bg-slate-900/90 border border-yellow-500/40 text-yellow-300 text-xs font-mono flex items-center gap-2 shadow-[0_0_10px_rgba(234,179,8,0.3)]">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-ping shrink-0" />
            <span className="truncate max-w-md">
              {transcript ? `"${transcript}"` : 'JARVIS Voice is Live — Say "Jarvis <command>" or speak directly...'}
            </span>
          </div>
        )}

        {/* Instant Command Bar */}
        <form onSubmit={handleSubmit} className="w-full max-w-2xl mt-2 flex items-center space-x-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder='Give JARVIS a directive (e.g. "Open VS Code", "What should I work on today?", "Remind me to review code at 8 PM")...'
              className="w-full px-4 py-3 pl-11 rounded-xl bg-slate-900/90 border border-cyan-500/30 text-slate-100 placeholder-slate-500 font-mono text-xs focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_20px_rgba(0,240,255,0.25)] transition-all"
            />
            <Sparkles className="w-4 h-4 text-cyan-400 absolute left-3.5 top-3.5" />
          </div>

          <button
            type="button"
            onClick={onToggleVoice}
            className={`p-3 rounded-xl border transition-all duration-200 ${
              isListening
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                : 'bg-slate-900 border-cyan-500/30 text-cyan-400 hover:border-cyan-400'
            }`}
            title="Toggle Voice Listening"
          >
            {isListening ? <Mic className="w-4 h-4 animate-pulse" /> : <MicOff className="w-4 h-4" />}
          </button>

          <button
            type="submit"
            disabled={!inputText.trim()}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 text-slate-950 font-mono font-bold text-xs flex items-center space-x-1.5 transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)] active:scale-95"
          >
            <span>TRANSMIT</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* Anticipatory Intelligence Card (Phase 9) */}
      <AnticipatoryIntelligenceCard />

      {/* Personal Digital Twin & Knowledge Graph Card (Phase 10) */}
      <PersonalDigitalTwinCard />

      {/* Ambient Personal Intelligence Card (Phase 11) */}
      <AmbientIntelligenceCard />

      {/* Self-Evolving Intelligence Engine Card (Phase 12) */}
      <EvolutionDashboardCard />

      {/* Strategic Intelligence & General Autonomy Card (Phase 13) */}
      <StrategicIntelligenceCard />

      {/* Project Sentinel: Operational Readiness & Validation Card (Phase 14) */}
      <SentinelDashboardCard onNavigateTab={onNavigateTab} />

      {/* Performance & Intelligence Telemetry Card (Phase 15) */}
      <PerformanceIntelligenceCard />

      {/* Autonomous Computer Intelligence Card (Phase 16) */}
      <ComputerIntelligenceCard />

      {/* Quick Action Shortcuts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-mono tracking-wider uppercase text-cyan-300 font-semibold">
            RAPID DIRECTIVE PROTOCOLS
          </span>
          <span className="text-[10px] font-mono text-slate-500">1-CLICK EXECUTION</span>
        </div>
        <QuickActions onExecuteAction={(cmd) => onSendMessage(cmd)} />
      </div>

      {/* Grid: Active Tasks, Long-term Memories, Real-time Logs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ActiveTasksCard
          tasks={tasks}
          onToggleTask={onToggleTask}
          onNavigateToTasks={() => onNavigateTab('chat')}
        />
        <MemoryPeekCard
          memories={memories}
          onNavigateToMemory={() => onNavigateTab('memory')}
        />
        <ActivityFeed logs={logs} />
      </div>
    </div>
  );
};

export default DashboardPage;
