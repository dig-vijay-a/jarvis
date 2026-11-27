import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Mic, 
  MicOff, 
  Volume2, 
  Plus, 
  Trash2, 
  Terminal, 
  ChevronDown, 
  ChevronRight, 
  CheckCircle, 
  XCircle,
  Sparkles,
  Bot,
  User
} from 'lucide-react';
import GlassCard from '../components/common/GlassCard';
import DynamicWaveform from '../components/dashboard/DynamicWaveform';

export const ChatPage = ({
  conversations = [],
  currentConversationId,
  messages = [],
  isListening,
  isSpeaking,
  audioLevel,
  aiState,
  onSelectConversation,
  onCreateConversation,
  onDeleteConversation,
  onSendMessage,
  onToggleVoice,
  onSpeakText
}) => {
  const [inputText, setInputText] = useState('');
  const [expandedTools, setExpandedTools] = useState({});
  const [expandedTraces, setExpandedTraces] = useState({});
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, aiState]);

  const toggleToolExpand = (toolId) => {
    setExpandedTools(prev => ({ ...prev, [toolId]: !prev[toolId] }));
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  return (
    <div className="h-[calc(100vh-100px)] flex space-x-4 select-text">
      {/* Conversation Sessions Sidebar */}
      <div className="w-64 flex flex-col glass-panel rounded-xl p-3 border border-cyan-500/20 select-none">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono font-semibold tracking-wider text-cyan-300 uppercase">
            DIRECTIVE CHANNELS
          </span>
          <button
            onClick={() => onCreateConversation()}
            className="p-1 rounded-md bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900 transition-colors"
            title="Create New Channel"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 font-mono text-xs">
          {conversations.map((conv) => {
            const isSelected = conv.id === currentConversationId;
            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-cyan-950/60 border border-cyan-400/40 text-cyan-300 font-semibold'
                    : 'bg-slate-900/40 border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <span className="truncate flex-1">{conv.title}</span>
                {conversations.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conv.id);
                    }}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                    title="Delete Channel"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Chat Terminal */}
      <div className="flex-1 flex flex-col glass-panel-glow rounded-xl border border-cyan-500/30 overflow-hidden">
        {/* Terminal Header */}
        <div className="px-4 py-3 border-b border-cyan-500/20 bg-slate-950/80 flex items-center justify-between select-none">
          <div className="flex items-center space-x-2">
            <Bot className="w-4 h-4 text-cyan-400" />
            <span className="font-mono text-xs font-semibold tracking-wider text-cyan-200 uppercase">
              JARVIS NEURAL CHAT INTERFACE
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
              STARK PROTOCOL ACTIVE
            </span>
          </div>

          <div className="flex items-center space-x-3 text-xs font-mono text-slate-400">
            {aiState === 'thinking' && (
              <span className="flex items-center gap-1.5 text-purple-400 animate-pulse">
                <Sparkles className="w-3.5 h-3.5" /> REASONING...
              </span>
            )}
            {isSpeaking && (
              <span className="flex items-center gap-1.5 text-cyan-400 animate-bounce">
                <Volume2 className="w-3.5 h-3.5" /> SPEAKING
              </span>
            )}
          </div>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, index) => {
            const isUser = msg.sender === 'user';
            const toolCalls = msg.tool_calls || [];
            const toolResults = msg.tool_results || [];

            return (
              <div
                key={msg.id || index}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center space-x-2 mb-1 px-1">
                  {isUser ? (
                    <>
                      <span className="text-[10px] font-mono text-slate-400">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-xs font-mono font-semibold text-blue-400 flex items-center gap-1">
                        COMMANDER <User className="w-3 h-3" />
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-xs font-mono font-semibold text-cyan-400 flex items-center gap-1">
                        <Bot className="w-3 h-3" /> JARVIS
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </>
                  )}
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-2xl rounded-xl p-3.5 text-xs font-mono leading-relaxed shadow-lg ${
                    isUser
                      ? 'bg-blue-950/70 border border-blue-500/40 text-blue-100 rounded-tr-none'
                      : 'bg-slate-900/90 border border-cyan-500/30 text-slate-200 rounded-tl-none shadow-[0_0_15px_rgba(0,240,255,0.08)]'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {/* If assistant, provide voice repeat button */}
                  {!isUser && (
                    <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-[9px] text-slate-400 font-mono">NEURAL VERIFIED</span>
                      <button
                        onClick={() => onSpeakText(msg.content)}
                        className="text-cyan-400 hover:text-cyan-300 p-1 rounded hover:bg-cyan-950/40 transition-colors"
                        title="Vocalize response"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Tool Executions Cards */}
                {toolCalls.length > 0 && (
                  <div className="mt-2 space-y-1.5 max-w-2xl w-full">
                    {toolCalls.map((tc, tIdx) => {
                      const tResult = toolResults[tIdx] || tc.result;
                      const isExpanded = expandedTools[`${msg.id}-${tIdx}`];
                      const isSuccess = tResult?.success !== false;

                      return (
                        <div
                          key={tIdx}
                          className="rounded-lg border border-cyan-500/20 bg-slate-950/80 text-xs font-mono overflow-hidden"
                        >
                          <div
                            onClick={() => toggleToolExpand(`${msg.id}-${tIdx}`)}
                            className="p-2 bg-slate-900/90 flex items-center justify-between cursor-pointer hover:bg-slate-850"
                          >
                            <div className="flex items-center space-x-2">
                              <Terminal className="w-3.5 h-3.5 text-purple-400" />
                              <span className="text-cyan-300 font-semibold">{tc.name || tc.tool}</span>
                              <span className="text-slate-400 text-[10px]">({JSON.stringify(tc.args).slice(0, 40)}...)</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              {isSuccess ? (
                                <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                                  <CheckCircle className="w-3 h-3" /> EXECUTED
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-[10px] text-rose-400">
                                  <XCircle className="w-3 h-3" /> FAILED
                                </span>
                              )}
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="p-3 bg-slate-950 border-t border-cyan-500/10 space-y-2 text-[11px]">
                              <div>
                                <span className="text-slate-400">PARAMETERS:</span>
                                <pre className="mt-1 p-2 bg-black/60 rounded text-cyan-200 overflow-x-auto text-[10px]">
                                  {JSON.stringify(tc.args, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <span className="text-slate-400">RESULT PAYLOAD:</span>
                                <pre className="mt-1 p-2 bg-black/60 rounded text-emerald-200 overflow-x-auto text-[10px]">
                                  {JSON.stringify(tResult, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 15-Field Structured Execution Details (Rule 3) */}
                {msg.execution_trace && (
                  <div className="mt-2 max-w-2xl w-full rounded-lg border border-cyan-500/30 bg-slate-950/90 text-xs font-mono overflow-hidden">
                    <div
                      onClick={() => setExpandedTraces(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                      className="p-2 bg-cyan-950/40 flex items-center justify-between cursor-pointer hover:bg-cyan-900/40 transition-colors select-none"
                    >
                      <div className="flex items-center space-x-2">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-cyan-300 font-semibold uppercase tracking-wider text-[11px]">⚡ Execution Details</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded border ${
                          msg.execution_trace.contract_status === 'COMPLETED'
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                            : msg.execution_trace.contract_status === 'WAITING_FOR_APPROVAL'
                            ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                            : 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                        }`}>
                          {msg.execution_trace.contract_status || 'COMPLETED'}
                        </span>
                        <span className="text-[10px] text-slate-400 hidden sm:inline">
                          Mode: {msg.execution_trace.selected_execution_mode}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-slate-400">
                        <span className="text-[10px] text-purple-300">
                          {msg.execution_trace.selected_agent}
                        </span>
                        {expandedTraces[msg.id] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </div>
                    </div>

                    {expandedTraces[msg.id] && (
                      <div className="p-3 bg-slate-950 border-t border-cyan-500/20 space-y-2 text-[11px] text-slate-300">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Request ID</span>
                            <span className="text-cyan-300 font-mono text-[10px]">{msg.execution_trace.request_id}</span>
                          </div>
                          <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Detected Intent</span>
                            <span className="text-emerald-400 font-mono text-[10px]">
                              {msg.execution_trace.detected_intent} ({Math.round((msg.execution_trace.intent_confidence || 1) * 100)}%)
                            </span>
                          </div>
                          <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Assigned Agent</span>
                            <span className="text-purple-300 font-mono text-[10px]">{msg.execution_trace.selected_agent}</span>
                          </div>
                          <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Approval Status</span>
                            <span className={`font-mono text-[10px] ${msg.execution_trace.approval_status === 'PENDING_APPROVAL' ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>
                              {msg.execution_trace.approval_status}
                            </span>
                          </div>
                        </div>

                        <div>
                          <span className="text-slate-400 text-[10px] uppercase font-semibold">Generated Plan & Selected Tools:</span>
                          <pre className="mt-1 p-2 bg-black/70 rounded text-cyan-200 overflow-x-auto text-[10px] border border-cyan-900/40">
                            {JSON.stringify(msg.execution_trace.generated_plan || msg.execution_trace.selected_tools, null, 2)}
                          </pre>
                        </div>

                        {msg.execution_trace.execution_result && (
                          <div>
                            <span className="text-slate-400 text-[10px] uppercase font-semibold">Execution Outcome & Validation:</span>
                            <pre className="mt-1 p-2 bg-black/70 rounded text-emerald-300 overflow-x-auto text-[10px] border border-emerald-900/40">
                              {JSON.stringify({ validation: msg.execution_trace.validation_result, results: msg.execution_trace.execution_result }, null, 2)}
                            </pre>
                          </div>
                        )}

                        {msg.execution_trace.failure_reason && (
                          <div className="p-2 rounded bg-rose-950/60 border border-rose-500/40 text-rose-300 text-[10px]">
                            <strong>Failure Reason:</strong> {msg.execution_trace.failure_reason}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Live Reactive Waveform Bar */}
        {(isListening || isSpeaking || aiState === 'thinking') && (
          <div className="px-4 py-1.5 border-t border-cyan-500/20 bg-slate-950/90">
            <DynamicWaveform
              active={true}
              audioLevel={audioLevel}
              isListening={isListening}
              isSpeaking={isSpeaking}
            />
          </div>
        )}

        {/* Chat Input Bar */}
        <form onSubmit={handleSend} className="p-3 border-t border-cyan-500/20 bg-slate-950/90 flex items-center space-x-2">
          <button
            type="button"
            onClick={onToggleVoice}
            className={`p-3 rounded-xl border transition-all ${
              isListening
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                : 'bg-slate-900 border-cyan-500/30 text-cyan-400 hover:border-cyan-400'
            }`}
            title="Toggle Voice Input"
          >
            {isListening ? <Mic className="w-4 h-4 animate-pulse" /> : <MicOff className="w-4 h-4" />}
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Transmit command to JARVIS..."
            className="flex-1 px-4 py-3 rounded-xl bg-slate-900 border border-cyan-500/30 text-slate-100 placeholder-slate-500 font-mono text-xs focus:outline-none focus:border-cyan-400 transition-all"
          />

          <button
            type="submit"
            disabled={!inputText.trim()}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 text-slate-950 font-mono font-bold text-xs flex items-center space-x-1.5 transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)]"
          >
            <span>TRANSMIT</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatPage;
