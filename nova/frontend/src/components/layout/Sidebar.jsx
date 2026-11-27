import React from 'react';
import {
  LayoutDashboard,
  MessageSquareCode,
  BrainCircuit,
  Workflow,
  TerminalSquare,
  Search,
  SlidersHorizontal,
  ChevronRight,
  Rocket,
  Cpu,
  ShieldCheck,
  Smartphone
} from 'lucide-react';

export const Sidebar = ({ activeTab = 'dashboard', onSelectTab }) => {
  const navItems = [
    { id: 'dashboard', label: 'Command HUD', icon: LayoutDashboard, shortcut: '1' },
    { id: 'sentinel', label: 'Sentinel Live', icon: ShieldCheck, shortcut: 'S' },
    { id: 'missions', label: 'Mission Control', icon: Rocket, shortcut: '2' },
    { id: 'intelligence', label: 'Intelligence Hub', icon: Cpu, shortcut: '3' },
    { id: 'devices', label: 'Device Ecosystem', icon: Smartphone, shortcut: 'D' },
    { id: 'chat', label: 'Neural Chat', icon: MessageSquareCode, shortcut: '4' },
    { id: 'memory', label: 'Memory Banks', icon: BrainCircuit, shortcut: '5' },
    { id: 'automations', label: 'Workflows', icon: Workflow, shortcut: '6' },
    { id: 'computer', label: 'Computer Link', icon: TerminalSquare, shortcut: '7' },
    { id: 'research', label: 'Web Research', icon: Search, shortcut: '8' },
    { id: 'settings', label: 'Core Settings', icon: SlidersHorizontal, shortcut: '9' },
  ];

  return (
    <aside className="w-60 border-r border-cyan-500/20 bg-slate-950/70 backdrop-blur-xl flex flex-col justify-between p-3 select-none z-10">
      <div className="space-y-1">
        <div className="px-3 py-2 text-[10px] font-mono tracking-widest text-slate-500 uppercase">
          NAVIGATION SYSTEMS
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-mono text-xs transition-all duration-200 group relative ${isActive
                ? 'bg-gradient-to-r from-cyan-950/80 to-blue-950/60 text-cyan-300 border border-cyan-400/40 shadow-[0_0_15px_rgba(0,240,255,0.15)] font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-cyan-300'
                  }`} />
                <span>{item.label}</span>
              </div>

              <div className="flex items-center space-x-1.5">
                <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded ${isActive ? 'bg-cyan-900/50 text-cyan-300' : 'bg-slate-800/60 text-slate-500'
                  }`}>
                  {item.shortcut}
                </span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-cyan-400" />}
              </div>

              {/* Active left indicator bar */}
              {isActive && (
                <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-cyan-400 rounded-r-full shadow-[0_0_8px_#00f0ff]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Diagnostics Summary */}
      <div className="p-3 rounded-xl bg-slate-900/60 border border-cyan-500/15">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1.5">
          <span>AI CORE STATUS</span>
          <span className="text-emerald-400 font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> OPERATIONAL
          </span>
        </div>
        <p className="text-[10px] font-mono text-slate-400 leading-tight">
          Neural model and tool calling matrix ready for voice directives.
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;
