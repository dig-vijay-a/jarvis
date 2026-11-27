import React from 'react';

export const GlassCard = ({ children, className = '', glow = false, title, icon: Icon, badge, action }) => {
  return (
    <div className={`relative rounded-xl overflow-hidden transition-all duration-300 ${
      glow ? 'glass-panel-glow' : 'glass-panel'
    } ${className}`}>
      {/* Decorative top cyan edge accent */}
      <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
      
      {/* Corner HUD accent */}
      <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-cyan-400/60" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-cyan-400/60" />

      {(title || Icon) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/15 bg-black/20">
          <div className="flex items-center space-x-2">
            {Icon && <Icon className="w-4 h-4 text-cyan-400" />}
            <h3 className="text-xs font-mono font-semibold tracking-wider uppercase text-cyan-100">{title}</h3>
          </div>
          <div className="flex items-center space-x-2">
            {badge && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">
                {badge}
              </span>
            )}
            {action}
          </div>
        </div>
      )}

      <div className="p-4">{children}</div>
    </div>
  );
};

export default GlassCard;
