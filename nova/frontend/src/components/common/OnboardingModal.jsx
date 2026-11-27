import React, { useState } from 'react';
import { Bot, Mic, Compass, ShieldCheck, ArrowRight, Check, X } from 'lucide-react';

export const OnboardingModal = ({ isOpen = false, onClose }) => {
  const [step, setStep] = useState(0);

  if (!isOpen) return null;

  const slides = [
    {
      title: 'Welcome to JARVIS OS 2.0',
      subtitle: 'Personal AI Operating System',
      icon: Bot,
      color: 'text-cyan-400',
      description: 'JARVIS combines real-time voice orchestration, contextual long-term memory, autonomous multi-agent task planning, and local Windows computer automation into a unified personal command center.'
    },
    {
      title: 'Natural Voice & Wake-Word Interaction',
      subtitle: 'Hands-free voice command protocol with bilingual support',
      icon: Mic,
      color: 'text-emerald-400',
      description: 'Speak naturally to JARVIS using the wake-phrase "Jarvis" or "ஜார்விஸ்". JARVIS features speech interruption (barge-in), Voice Activity Detection (VAD), and fluent English & Tamil speech synthesis.'
    },
    {
      title: 'Autonomous Mission Control',
      subtitle: 'High-level objective planning with Directed Acyclic Graphs (DAG)',
      icon: Compass,
      color: 'text-sky-400',
      description: 'State your end goal (e.g. "Research recent quantum breakthroughs and prepare executive presentation"). JARVIS breaks it down into dependency graphs, delegates to specialized agents, executes asynchronously, and recovers from failures.'
    },
    {
      title: 'Zero-Trust Safety & Mobile Companion',
      subtitle: 'Human-in-the-loop approvals and salted-hash pairing',
      icon: ShieldCheck,
      color: 'text-amber-400',
      description: 'Destructive file actions and sensitive operations pause automatically for operator approval. Pair your mobile phone securely via PBKDF2-salted hashed PIN verification without exposing the local Windows agent to the internet.'
    }
  ];

  const current = slides[step];
  const Icon = current.icon;

  const handleNext = () => {
    if (step < slides.length - 1) {
      setStep(prev => prev + 1);
    } else {
      localStorage.setItem('nova_onboarding_completed', 'true');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-cyan-500/40 rounded-2xl shadow-[0_0_40px_rgba(0,240,255,0.25)] p-6 relative overflow-hidden">
        {/* Close Button */}
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-cyan-300">
          <X className="w-5 h-5" />
        </button>

        {/* Step Indicator */}
        <div className="flex space-x-1.5 mb-6">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-8 bg-cyan-400 shadow-[0_0_8px_#00f0ff]' : 'w-2 bg-slate-800'
              }`}
            />
          ))}
        </div>

        {/* Main Content */}
        <div className="flex flex-col items-center text-center space-y-4 my-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-950 border border-cyan-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(0,240,255,0.15)]">
            <Icon className={`w-8 h-8 ${current.color}`} />
          </div>
          <div>
            <h2 className="text-xl font-bold font-display text-white tracking-wide">{current.title}</h2>
            <p className="text-xs font-mono text-cyan-400/90 mt-1">{current.subtitle}</p>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed font-sans px-2">
            {current.description}
          </p>
        </div>

        {/* Bottom Navigation */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-800/80 mt-6">
          <button
            onClick={() => {
              localStorage.setItem('nova_onboarding_completed', 'true');
              onClose();
            }}
            className="text-xs font-mono text-slate-500 hover:text-slate-300 transition-colors"
          >
            Skip Tour
          </button>
          <button
            onClick={handleNext}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold font-mono text-xs shadow-[0_0_15px_rgba(0,240,255,0.4)] transition-all active:scale-95"
          >
            <span>{step === slides.length - 1 ? 'Engage JARVIS Core' : 'Next Protocol'}</span>
            {step === slides.length - 1 ? <Check className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;
