import React from 'react';
import { CheckSquare, Square, Plus, AlertCircle } from 'lucide-react';
import GlassCard from '../common/GlassCard';

export const ActiveTasksCard = ({ tasks = [], onToggleTask, onNavigateToTasks }) => {
  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'high':
        return 'bg-rose-950/60 text-rose-300 border-rose-500/40';
      case 'medium':
        return 'bg-amber-950/60 text-amber-300 border-amber-500/40';
      default:
        return 'bg-blue-950/60 text-blue-300 border-blue-500/40';
    }
  };

  return (
    <GlassCard
      title="ACTIVE DIRECTIVES"
      icon={CheckSquare}
      badge={`${tasks.filter(t => t.status !== 'completed').length} PENDING`}
      action={
        <button
          onClick={onNavigateToTasks}
          className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          VIEW ALL →
        </button>
      }
      className="h-[320px] flex flex-col"
    >
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {tasks.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 font-mono text-xs">
            No active directives logged in task registers.
          </div>
        ) : (
          tasks.slice(0, 5).map((task) => {
            const isCompleted = task.status === 'completed';
            return (
              <div
                key={task.id}
                onClick={() => onToggleTask(task)}
                className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-start space-x-2.5 ${
                  isCompleted
                    ? 'bg-slate-950/40 border-slate-800 text-slate-500 line-through'
                    : 'bg-slate-900/60 border-cyan-500/15 hover:border-cyan-500/40 text-slate-200'
                }`}
              >
                <button className="mt-0.5 text-cyan-400 hover:text-cyan-300 flex-shrink-0">
                  {isCompleted ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Square className="w-4 h-4 text-cyan-500/60" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold truncate">{task.title}</p>
                    <span className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded border ${getPriorityBadge(task.priority)}`}>
                      {task.priority}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{task.description}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </GlassCard>
  );
};

export default ActiveTasksCard;
