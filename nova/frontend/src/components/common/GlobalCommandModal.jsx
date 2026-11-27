import React, { useState, useEffect, useRef } from 'react';
import { Search, Command, Navigation, CheckSquare, Brain, Compass, FileText, Power, Mic, Globe, X } from 'lucide-react';

export const GlobalCommandModal = ({
  isOpen = false,
  onClose,
  onNavigate,
  language = 'en-US',
  onToggleLanguage,
  onTriggerEmergencyStop
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Static navigation and quick actions
  const defaultActions = [
    { id: 'nav-dash', category: 'Navigation', label: 'Go to HUD Dashboard', icon: Navigation, action: () => onNavigate('dashboard') },
    { id: 'nav-chat', category: 'Navigation', label: 'Go to Neural Chat', icon: Command, action: () => onNavigate('chat') },
    { id: 'nav-missions', category: 'Navigation', label: 'Go to Autonomous Mission Control', icon: Compass, action: () => onNavigate('missions') },
    { id: 'nav-memory', category: 'Navigation', label: 'Go to Contextual Memory Matrix', icon: Brain, action: () => onNavigate('memory') },
    { id: 'nav-automations', category: 'Navigation', label: 'Go to Scheduled Automations', icon: CheckSquare, action: () => onNavigate('automations') },
    { id: 'nav-intel', category: 'Navigation', label: 'Go to Intelligence Hub (Graph & Twin)', icon: Brain, action: () => onNavigate('intelligence') },
    { id: 'nav-settings', category: 'Navigation', label: 'Go to System Settings', icon: Command, action: () => onNavigate('settings') },
    { 
      id: 'act-lang', 
      category: 'System Action', 
      label: `Switch Language (Current: ${language === 'ta-IN' ? 'தமிழ் (Tamil)' : 'English'})`, 
      icon: Globe, 
      action: () => { if (onToggleLanguage) onToggleLanguage(); } 
    },
    { 
      id: 'act-kill', 
      category: 'Safety', 
      label: 'Emergency Kill Switch (Abort All Operations)', 
      icon: Power, 
      danger: true, 
      action: () => { if (onTriggerEmergencyStop) onTriggerEmergencyStop(); } 
    }
  ];

  const filtered = defaultActions.filter(item =>
    item.label.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-start justify-center pt-20 px-4">
      <div 
        className="w-full max-w-2xl bg-slate-900 border border-cyan-500/40 rounded-xl shadow-[0_0_30px_rgba(0,240,255,0.25)] overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-cyan-500/20 bg-slate-950/50">
          <Search className="w-5 h-5 text-cyan-400 mr-3" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands, pages, tasks, or system directives... (Ctrl+K)"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            className="w-full bg-transparent text-cyan-100 placeholder-slate-500 font-mono text-sm outline-none"
          />
          <button onClick={onClose} className="text-slate-400 hover:text-cyan-300 ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-500 font-mono text-xs">
              No matching directives found for "{query}".
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={() => { item.action(); onClose(); }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg font-mono text-xs text-left transition-all ${
                    isSelected 
                      ? item.danger 
                        ? 'bg-rose-950/70 border border-rose-500 text-rose-200' 
                        : 'bg-cyan-950/70 border border-cyan-500/60 text-cyan-200 shadow-[0_0_12px_rgba(0,240,255,0.2)]'
                      : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-4 h-4 ${item.danger ? 'text-rose-400' : 'text-cyan-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800">
                    {item.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hotkey Helper */}
        <div className="px-4 py-2 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
          <div className="flex items-center space-x-3">
            <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">↑↓</kbd> to navigate</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">Enter</kbd> to select</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">Esc</kbd> to close</span>
          </div>
          <span className="text-cyan-400/80 font-bold">JARVIS OS 2.0</span>
        </div>
      </div>
    </div>
  );
};

export default GlobalCommandModal;
