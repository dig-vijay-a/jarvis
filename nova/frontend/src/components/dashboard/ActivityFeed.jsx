import React, { useEffect, useRef } from 'react';
import { Terminal, Shield, Cpu, Activity, Clock } from 'lucide-react';
import GlassCard from '../common/GlassCard';

export const ActivityFeed = ({ logs = [] }) => {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs]);

  const getCategoryColor = (category) => {
    switch (category) {
      case 'AI_TOOL': return 'text-purple-400 border-purple-500/30 bg-purple-950/40';
      case 'AUTOMATION': return 'text-cyan-400 border-cyan-500/30 bg-cyan-950/40';
      case 'SECURITY': return 'text-rose-400 border-rose-500/30 bg-rose-950/40';
      case 'REMINDER': return 'text-amber-400 border-amber-500/30 bg-amber-950/40';
      case 'RESEARCH': return 'text-emerald-400 border-emerald-500/30 bg-emerald-950/40';
      default: return 'text-blue-400 border-blue-500/30 bg-blue-950/40';
    }
  };

  return (
    <GlassCard
      title="NEURAL ACTIVITY TELEMETRY"
      icon={Terminal}
      badge={`${logs.length} EVENTS`}
      className="h-[320px] flex flex-col"
    >
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-xs select-text"
      >
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 font-mono text-xs">
            Telemetry stream standing by. No anomalies recorded.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="p-2 rounded bg-slate-900/60 border border-slate-800/80 hover:border-cyan-500/30 transition-colors flex items-start justify-between space-x-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-0.5">
                  <span className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-semibold border ${getCategoryColor(log.category)}`}>
                    {log.category}
                  </span>
                  <span className="font-semibold text-slate-200 truncate">{log.action}</span>
                </div>
                <p className="text-slate-400 text-[11px] truncate">{log.details}</p>
              </div>
              <div className="flex items-center text-[10px] text-slate-500 flex-shrink-0 pt-0.5">
                <Clock className="w-3 h-3 mr-1 opacity-70" />
                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            </div>
          ))
        )}
      </div>
    </GlassCard>
  );
};

export default ActivityFeed;
