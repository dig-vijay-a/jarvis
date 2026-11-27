import React from 'react';
import { Brain, Star, Bookmark } from 'lucide-react';
import GlassCard from '../common/GlassCard';

export const MemoryPeekCard = ({ memories = [], onNavigateToMemory }) => {
  return (
    <GlassCard
      title="LONG-TERM MEMORY REGISTERS"
      icon={Brain}
      badge={`${memories.length} FACTS`}
      action={
        <button
          onClick={onNavigateToMemory}
          className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          MANAGE →
        </button>
      }
      className="h-[320px] flex flex-col"
    >
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {memories.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 font-mono text-xs">
            Neural memory banks awaiting user facts & preferences.
          </div>
        ) : (
          memories.slice(0, 5).map((mem) => (
            <div
              key={mem.id}
              className="p-2.5 rounded-lg bg-slate-900/60 border border-cyan-500/15 hover:border-cyan-500/35 transition-all text-xs"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-cyan-300 font-mono flex items-center gap-1">
                  <Bookmark className="w-3 h-3 text-cyan-400" />
                  {mem.key}
                </span>
                <div className="flex items-center space-x-1">
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                    {mem.category}
                  </span>
                  {mem.importance >= 3 && (
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                  )}
                </div>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed line-clamp-2">
                {mem.value}
              </p>
            </div>
          ))
        )}
      </div>
    </GlassCard>
  );
};

export default MemoryPeekCard;
