import React from 'react';
import { ShieldAlert, AlertTriangle, X } from 'lucide-react';

export const EmergencyModal = ({ isOpen, onClose, onConfirm }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-md rounded-2xl bg-slate-950 border-2 border-rose-500 shadow-[0_0_50px_rgba(239,68,68,0.4)] p-6 overflow-hidden">
        {/* Top warning stripe */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500" />

        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-full bg-rose-950 border border-rose-500 text-rose-400">
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-display text-rose-200 tracking-wider">
                EMERGENCY OVERRIDE
              </h2>
              <p className="text-xs font-mono text-rose-400">IMMEDIATE AGENT SUSPENSION</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-6 space-y-2 text-xs font-mono text-slate-300 bg-rose-950/20 p-3 rounded-lg border border-rose-900/50">
          <p className="flex items-center gap-1.5 text-rose-300 font-semibold">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            CONFIRM PROTOCOL TERMINATION
          </p>
          <p>
            Triggering the Emergency Kill Switch will immediately:
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
            <li>Halt all running autonomous agent workflows.</li>
            <li>Abort pending local automation scripts.</li>
            <li>Mute audio transmissions and lock agent execution.</li>
          </ul>
        </div>

        <div className="flex items-center justify-end space-x-3 font-mono text-xs">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
          >
            CANCEL
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all shadow-[0_0_15px_rgba(239,68,68,0.5)] active:scale-95"
          >
            ENGAGE KILL SWITCH
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmergencyModal;
