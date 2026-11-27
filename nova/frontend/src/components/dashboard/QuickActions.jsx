import React from 'react';
import { Play, Code, Timer, Sparkles, Youtube, Search, CheckSquare } from 'lucide-react';

export const QuickActions = ({ onExecuteAction }) => {
  const actions = [
    {
      id: 'briefing',
      label: 'Executive Briefing',
      icon: Sparkles,
      color: 'from-cyan-500/20 to-blue-500/20 text-cyan-300 border-cyan-500/30 hover:border-cyan-400',
      command: 'Prepare my daily executive briefing and priority checklist.'
    },
    {
      id: 'vscode',
      label: 'Launch VS Code',
      icon: Code,
      color: 'from-blue-500/20 to-indigo-500/20 text-blue-300 border-blue-500/30 hover:border-blue-400',
      command: 'Open VS Code'
    },
    {
      id: 'focus',
      label: '45-Min Focus',
      icon: Timer,
      color: 'from-purple-500/20 to-indigo-500/20 text-purple-300 border-purple-500/30 hover:border-purple-400',
      command: 'Start a 45-minute focus session for deep work.'
    },
    {
      id: 'youtube',
      label: 'YouTube Pipeline',
      icon: Youtube,
      color: 'from-rose-500/20 to-amber-500/20 text-rose-300 border-rose-500/30 hover:border-rose-400',
      command: 'Prepare my YouTube content for today.'
    },
    {
      id: 'search',
      label: 'Research Trends',
      icon: Search,
      color: 'from-teal-500/20 to-emerald-500/20 text-teal-300 border-teal-500/30 hover:border-teal-400',
      command: 'Search the web for top AI agent architecture trends 2026'
    },
    {
      id: 'tasks',
      label: 'Review Tasks',
      icon: CheckSquare,
      color: 'from-amber-500/20 to-orange-500/20 text-amber-300 border-amber-500/30 hover:border-amber-400',
      command: 'What should I work on today?'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
      {actions.map((act) => {
        const Icon = act.icon;
        return (
          <button
            key={act.id}
            onClick={() => onExecuteAction(act.command)}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg bg-gradient-to-r border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${act.color} text-left group`}
          >
            <Icon className="w-4 h-4 flex-shrink-0 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-mono font-medium truncate">{act.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default QuickActions;
