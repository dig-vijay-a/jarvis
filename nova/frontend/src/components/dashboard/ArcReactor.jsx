import React from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, Volume2, Cpu, Radio } from 'lucide-react';

export const ArcReactor = ({ state = 'idle', audioLevel = 0, isListening = false, isSpeaking = false, wakeWordDetected = false, onClick }) => {
  // Determine color palette based on state
  let primaryColor = '#00f0ff';
  let secondaryColor = '#3b82f6';
  let glowColor = 'rgba(0, 240, 255, 0.4)';
  let stateLabel = 'STANDBY (VOICE READY)';

  // Whenever the voice assistant is listening (either via wake-word or continuous listening across all commands),
  // it MUST always be in vibrant yellow/gold color palette!
  if (isListening || wakeWordDetected) {
    primaryColor = '#eab308'; // Pure vibrant yellow
    secondaryColor = '#facc15'; // Bright golden yellow
    glowColor = 'rgba(234, 179, 8, 0.85)'; // Yellow glow
    stateLabel = wakeWordDetected ? 'JARVIS LISTENING (DIRECTIVE)' : 'JARVIS LISTENING (VOICE ACTIVE)';
  } else if (isSpeaking) {
    primaryColor = '#00f0ff';
    secondaryColor = '#38bdf8';
    glowColor = 'rgba(0, 240, 255, 0.7)';
    stateLabel = 'TRANSMITTING';
  } else if (state === 'thinking') {
    primaryColor = '#a855f7';
    secondaryColor = '#3b82f6';
    glowColor = 'rgba(168, 85, 247, 0.6)';
    stateLabel = 'NEURAL PROCESSING';
  } else if (state === 'error') {
    primaryColor = '#ef4444';
    secondaryColor = '#f59e0b';
    glowColor = 'rgba(239, 68, 68, 0.6)';
    stateLabel = 'ALERT';
  }

  const scalePulse = 1 + (audioLevel * 0.18);

  return (
    <div className="relative flex flex-col items-center justify-center p-6">
      {/* Background radial glow */}
      <div 
        className="absolute w-80 h-80 rounded-full blur-3xl pointer-events-none transition-all duration-500"
        style={{
          background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
          transform: `scale(${scalePulse * 1.1})`
        }}
      />

      {/* Main Interactive Reactor Core */}
      <motion.div
        onClick={onClick}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        className="relative w-64 h-64 cursor-pointer select-none flex items-center justify-center group"
        title="Click to toggle Voice Listening"
      >
        {/* Outer Ring 1: Tick Marks (Clockwise rotation) */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: isListening ? 8 : (state === 'thinking' ? 5 : 24), repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0"
        >
          <svg viewBox="0 0 200 200" className="w-full h-full opacity-60">
            <circle
              cx="100"
              cy="100"
              r="94"
              fill="none"
              stroke={primaryColor}
              strokeWidth="1.5"
              strokeDasharray="4 8"
              opacity="0.7"
            />
            {/* 12 Concentric node marks */}
            {[...Array(12)].map((_, i) => {
              const angle = (i * 30 * Math.PI) / 180;
              const x1 = 100 + 86 * Math.cos(angle);
              const y1 = 100 + 86 * Math.sin(angle);
              const x2 = 100 + 94 * Math.cos(angle);
              const y2 = 100 + 94 * Math.sin(angle);
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={secondaryColor}
                  strokeWidth="2.5"
                />
              );
            })}
          </svg>
        </motion.div>

        {/* Middle Ring 2: Segmented Arc Rotor (Counter-clockwise rotation) */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: isSpeaking ? 10 : 30, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-4"
        >
          <svg viewBox="0 0 200 200" className="w-full h-full">
            <circle
              cx="100"
              cy="100"
              r="76"
              fill="none"
              stroke={secondaryColor}
              strokeWidth="3"
              strokeDasharray="30 20 60 15 10 30"
              opacity="0.8"
            />
          </svg>
        </motion.div>

        {/* Inner Ring 3: Power Conduit */}
        <motion.div
          animate={{ scale: [1, scalePulse, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-10 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-sm"
          style={{
            border: `1px solid ${primaryColor}66`,
            boxShadow: `0 0 20px ${glowColor}`
          }}
        >
          {/* Circular Core Plasma Center */}
          <div 
            className="w-28 h-28 rounded-full flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden"
            style={{
              background: `radial-gradient(circle, ${glowColor} 0%, rgba(3, 7, 18, 0.85) 75%)`,
              border: `2px solid ${primaryColor}`,
              boxShadow: `0 0 30px ${glowColor}, inset 0 0 15px ${glowColor}`
            }}
          >
            {/* Center icon / indicator */}
            {isListening || wakeWordDetected ? (
              <Mic className="w-8 h-8 text-yellow-400 animate-pulse" />
            ) : isSpeaking ? (
              <Volume2 className="w-8 h-8 text-cyan-400 animate-bounce" />
            ) : state === 'thinking' ? (
              <Cpu className="w-8 h-8 text-purple-400 animate-spin" />
            ) : (
              <Radio className="w-8 h-8 text-cyan-400 group-hover:scale-110 transition-transform" />
            )}

            <span 
              className="text-[10px] font-mono tracking-widest uppercase mt-1 font-semibold"
              style={{ color: isListening || wakeWordDetected ? '#fef08a' : '#a5f3fc' }}
            >
              {isListening || wakeWordDetected ? 'LISTENING' : 'JARVIS'}
            </span>
          </div>
        </motion.div>
      </motion.div>

      {/* State Badge & Prompt */}
      <div className="mt-4 flex flex-col items-center space-y-1">
        <div 
          className="px-3 py-1 rounded-full text-xs font-mono font-semibold tracking-wider flex items-center space-x-2 border"
          style={{
            borderColor: primaryColor,
            backgroundColor: `${primaryColor}15`,
            color: primaryColor,
            boxShadow: `0 0 12px ${primaryColor}40`
          }}
        >
          <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: primaryColor }} />
          <span>{stateLabel}</span>
        </div>
        <p className="text-xs text-slate-400 font-mono mt-1 text-center">
          {wakeWordDetected
            ? '⚡ "Jarvis" Recognized — Listening for your directive...'
            : isListening
            ? '⚡ Voice Active — Jarvis Listening (speak directives or say "Jarvis sleep")'
            : 'Say "Jarvis" or tap Arc Reactor to activate'}
        </p>
      </div>
    </div>
  );
};

export default ArcReactor;
