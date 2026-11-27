import React from 'react';
import { motion } from 'framer-motion';

export const DynamicWaveform = ({ active = false, audioLevel = 0, isListening = false, isSpeaking = false }) => {
  const barsCount = 28;
  const bars = Array.from({ length: barsCount }, (_, i) => i);

  const getBarColor = (index) => {
    if (isListening) return 'bg-emerald-400';
    if (isSpeaking) return 'bg-cyan-400';
    return 'bg-blue-500/40';
  };

  return (
    <div className="w-full flex items-center justify-center space-x-1 h-12 px-4 py-2 bg-black/40 rounded-xl border border-cyan-500/20 backdrop-blur-md">
      {bars.map((bar, i) => {
        // Calculate curve height with center peaking
        const distanceFromCenter = Math.abs(i - barsCount / 2);
        const centerWeight = Math.max(0.1, 1 - (distanceFromCenter / (barsCount / 2)));
        
        let height = 4;
        if (active || isListening || isSpeaking) {
          const randomFactor = Math.sin((i + Date.now() / 200)) * 0.4 + 0.6;
          height = Math.max(4, Math.min(38, (audioLevel * 36 * centerWeight * randomFactor)));
        }

        return (
          <motion.div
            key={i}
            animate={{ height: `${height}px` }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className={`w-1 rounded-full transition-colors duration-200 ${getBarColor(i)} shadow-[0_0_8px_currentColor]`}
          />
        );
      })}
    </div>
  );
};

export default DynamicWaveform;
