import React, { useState, useEffect } from 'react';
import { ShieldAlert, Radio, Volume2, Mic, MicOff, Wifi, WifiOff, Power, Eye, Bot, AlertCircle, Search, Globe, HelpCircle } from 'lucide-react';

export const Header = ({ 
  isListening = false, 
  isSpeaking = false, 
  isMicMuted = false,
  wakeWordEnabled = true,
  wakeWordPhrase = 'Jarvis',
  language = 'en-US',
  onToggleLanguage,
  onOpenCommandBar,
  onOpenOnboarding,
  wsConnected = false, 
  activeAgent = 'JARVIS Core',
  pendingApprovalsCount = 0,
  onToggleVoice, 
  onToggleMicMute,
  onTriggerEmergencyStop,
  onOpenVision,
  onOpenApprovals
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = currentTime.toLocaleTimeString([], { hour12: false });
  const formattedDate = currentTime.toLocaleDateString([], { 
    weekday: 'short', 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });

  return (
    <header className="h-16 border-b border-cyan-500/20 bg-slate-950/80 backdrop-blur-xl px-6 flex items-center justify-between select-none relative z-20">
      {/* Top subtle cyan scanline bar */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

      {/* Brand & HUD Status */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2.5">
          <div className="relative w-8 h-8 rounded-full border border-cyan-400/60 flex items-center justify-center shadow-[0_0_12px_rgba(0,240,255,0.4)]">
            <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#00f0ff]" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-display font-black tracking-widest text-lg bg-gradient-to-r from-cyan-300 via-sky-200 to-blue-400 bg-clip-text text-transparent">
                JARVIS
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500/30">
                v2.0
              </span>
            </div>
            <p className="text-[10px] font-mono text-slate-400 tracking-wider">
              PERSONAL AI OPERATING SYSTEM
            </p>
          </div>
        </div>

        {/* Live System Link Pill */}
        <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] font-mono">
          {wsConnected ? (
            <>
              <Wifi className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-semibold">SYNCHRONIZED</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3 text-rose-400" />
              <span className="text-rose-400 font-semibold">OFFLINE</span>
            </>
          )}
        </div>

        {/* Active Specialized Agent Pill */}
        <div className="hidden lg:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-[11px] font-mono text-cyan-300">
          <Bot className="w-3.5 h-3.5 text-cyan-400" />
          <span>AGENT: <strong className="font-bold text-white">{activeAgent}</strong></span>
        </div>
      </div>

      {/* Center Live HUD Clock */}
      <div className="hidden md:flex flex-col items-center justify-center">
        <div className="font-mono text-lg font-bold tracking-widest text-cyan-200 drop-shadow-[0_0_10px_rgba(0,240,255,0.4)]">
          {formattedTime}
        </div>
        <div className="text-[10px] font-mono tracking-wider text-slate-400 uppercase">
          {formattedDate} • STARK OS NET
        </div>
      </div>

      {/* Right Controls: Vision + Pending Approvals + Voice + Kill Switch */}
      <div className="flex items-center space-x-2.5">
        {/* Global Command Bar Shortcut */}
        <button
          onClick={onOpenCommandBar}
          className="hidden md:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-500/50 text-slate-400 hover:text-cyan-300 font-mono text-xs transition-all shadow-[0_0_10px_rgba(0,240,255,0.05)]"
          title="Global Command Palette (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-semibold">Ctrl+K</span>
        </button>

        {/* Bilingual Language Switcher (EN / தமிழ்) */}
        <button
          onClick={onToggleLanguage}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 text-cyan-300 font-mono text-xs transition-all"
          title={`Active Language: ${language === 'ta-IN' ? 'Tamil (தமிழ்)' : 'English (US)'}. Click to switch.`}
        >
          <Globe className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-bold text-[11px]">{language === 'ta-IN' ? 'தமிழ்' : 'EN'}</span>
        </button>

        {/* Onboarding Tour Help Button */}
        <button
          onClick={onOpenOnboarding}
          className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400 text-slate-400 hover:text-cyan-300 transition-all"
          title="Launch JARVIS System Guide & Onboarding Tour"
        >
          <HelpCircle className="w-4 h-4 text-cyan-400" />
        </button>

        {/* Screen Intelligence Button */}
        <button
          onClick={onOpenVision}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 font-mono text-xs transition-all shadow-[0_0_10px_rgba(0,240,255,0.15)]"
          title="Open Screen Intelligence & Computer Vision"
        >
          <Eye className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">VISION</span>
        </button>

        {/* Pending Approvals Badge */}
        {pendingApprovalsCount > 0 && (
          <button
            onClick={onOpenApprovals}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-amber-950/80 border border-amber-400 text-amber-300 font-mono text-xs animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.4)]"
            title="Approvals Waiting"
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>{pendingApprovalsCount} PENDING</span>
          </button>
        )}

        {/* Microphone Privacy Mute Toggle (Module 3) */}
        <button
          onClick={onToggleMicMute}
          title={isMicMuted ? "Unmute Microphone (Privacy Mode Disabled)" : "Mute Microphone (Hardware Privacy Mode)"}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border font-mono text-xs transition-all ${
            isMicMuted 
              ? 'bg-rose-950/80 border-rose-400 text-rose-300 shadow-[0_0_12px_rgba(239,68,68,0.3)]' 
              : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
          }`}
        >
          {isMicMuted ? (
            <>
              <MicOff className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline">MUTED</span>
            </>
          ) : (
            <>
              <Mic className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">MIC LIVE</span>
            </>
          )}
        </button>

        {/* Voice Status Indicator / Toggle */}
        <button
          onClick={onToggleVoice}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border font-mono text-xs transition-all duration-200 ${
            isListening 
              ? 'bg-emerald-950/60 border-emerald-400 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
              : isSpeaking
              ? 'bg-cyan-950/60 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.3)]'
              : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-500/40'
          }`}
        >
          {isListening ? (
            <>
              <Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>VOX ON</span>
            </>
          ) : isSpeaking ? (
            <>
              <Volume2 className="w-3.5 h-3.5 text-cyan-400 animate-bounce" />
              <span>SPEAKING</span>
            </>
          ) : (
            <>
              <Radio className="w-3.5 h-3.5 text-slate-400" />
              <span>VOX STANDBY</span>
            </>
          )}
        </button>

        {/* Emergency Stop Button */}
        <button
          onClick={onTriggerEmergencyStop}
          title="Emergency Stop: Abort all automated agent tasks"
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-950/40 border border-rose-500/40 hover:border-rose-400 text-rose-300 hover:bg-rose-900/60 font-mono text-xs tracking-wider transition-all duration-200 hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] active:scale-95"
        >
          <Power className="w-3.5 h-3.5 text-rose-400" />
          <span className="font-semibold">KILL SWITCH</span>
        </button>
      </div>
    </header>
  );
};

export default Header;
