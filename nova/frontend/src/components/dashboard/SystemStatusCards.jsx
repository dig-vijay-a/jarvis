import React from 'react';
import { Cpu, HardDrive, Database, ShieldCheck, ShieldAlert, Activity } from 'lucide-react';
import GlassCard from '../common/GlassCard';

export const SystemStatusCards = ({ telemetry = {}, agentOnline = false }) => {
  const cpuPercent = telemetry.cpu?.percent ?? 14;
  const memoryPercent = telemetry.memory?.percent ?? 42;
  const diskPercent = telemetry.disk?.percent ?? 48;
  const usedRam = telemetry.memory?.used_gb ?? 6.8;
  const totalRam = telemetry.memory?.total_gb ?? 16.0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* CPU Card */}
      <GlassCard className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" /> CPU LOAD
          </span>
          <span className="text-xs font-mono text-cyan-300 font-bold">{cpuPercent}%</span>
        </div>
        <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(5, cpuPercent))}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1.5">
          <span>{telemetry.cpu?.cores || 8} Cores</span>
          <span>{telemetry.cpu?.freq_mhz || 3200} MHz</span>
        </div>
      </GlassCard>

      {/* Memory Card */}
      <GlassCard className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-blue-400" /> RAM TELEMETRY
          </span>
          <span className="text-xs font-mono text-blue-300 font-bold">{memoryPercent}%</span>
        </div>
        <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(5, memoryPercent))}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1.5">
          <span>{usedRam} GB</span>
          <span>{totalRam} GB</span>
        </div>
      </GlassCard>

      {/* Disk Card */}
      <GlassCard className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-indigo-400" /> PRIMARY DISK
          </span>
          <span className="text-xs font-mono text-indigo-300 font-bold">{diskPercent}%</span>
        </div>
        <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(5, diskPercent))}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1.5">
          <span>{telemetry.disk?.used_gb || 240} GB</span>
          <span>{telemetry.disk?.total_gb || 512} GB</span>
        </div>
      </GlassCard>

      {/* Agent Link Card */}
      <GlassCard className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400" /> PYTHON AGENT
          </span>
          {agentOnline ? (
            <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> LINKED
            </span>
          ) : (
            <span className="text-[11px] font-mono text-amber-400 font-bold">
              STANDBY
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2 mt-1">
          {agentOnline ? (
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
          )}
          <span className="text-[11px] font-mono text-slate-300 truncate">
            {agentOnline ? 'Hardware API Ready' : 'Port 8000 Polling'}
          </span>
        </div>
        <div className="text-[9px] font-mono text-slate-500 mt-1 truncate">
          {telemetry.os || 'Windows 11 x64'}
        </div>
      </GlassCard>
    </div>
  );
};

export default SystemStatusCards;
