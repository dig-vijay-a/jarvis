import React, { useState } from 'react';
import { 
  Search, 
  Sparkles, 
  ExternalLink, 
  BookOpen, 
  Copy, 
  Check, 
  Download, 
  Layers, 
  Compass, 
  FileCheck
} from 'lucide-react';
import GlassCard from '../components/common/GlassCard';
import { conductDeepResearch, searchWeb } from '../services/api';

export const ResearchPage = () => {
  const [topic, setTopic] = useState('');
  const [depth, setDepth] = useState('deep');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleRunResearch = async (e) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setLoading(true);
    try {
      const res = await conductDeepResearch(topic.trim(), depth);
      if (res.data.success) {
        setReport(res.data);
      }
    } catch (err) {
      alert('Research error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!report?.report) return;
    navigator.clipboard.writeText(report.report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Research Query Console */}
      <GlassCard title="DEEP WEB RESEARCH & SYNTHESIS AGENT" icon={Compass} glow>
        <form onSubmit={handleRunResearch} className="space-y-3">
          <div className="flex flex-col md:flex-row items-center gap-2">
            <div className="relative flex-1 w-full">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Enter research topic (e.g. 'Autonomous AI Agent Architectures 2026', 'Quantum Computing in Medicine')..."
                className="w-full px-4 py-3 pl-11 rounded-xl bg-slate-900 border border-cyan-500/30 text-slate-100 placeholder-slate-500 font-mono text-xs focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_20px_rgba(0,240,255,0.2)]"
              />
              <Search className="w-4 h-4 text-cyan-400 absolute left-3.5 top-3.5" />
            </div>

            <div className="flex items-center space-x-2 w-full md:w-auto">
              <select
                value={depth}
                onChange={(e) => setDepth(e.target.value)}
                className="px-3 py-3 rounded-xl bg-slate-900 border border-cyan-500/30 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-400"
              >
                <option value="standard">Standard Scan</option>
                <option value="deep">Deep Extraction & Synthesis</option>
              </select>

              <button
                type="submit"
                disabled={loading || !topic.trim()}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 text-slate-950 font-mono font-bold text-xs flex items-center space-x-2 shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all flex-shrink-0"
              >
                {loading ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-spin" />
                    <span>INVESTIGATING...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>COMMENCE RESEARCH</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </GlassCard>

      {/* Research Output Stage */}
      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Report View */}
          <div className="lg:col-span-2">
            <GlassCard
              title={`INTELLIGENCE DOSSIER: ${report.topic}`}
              icon={BookOpen}
              badge={report.depth?.toUpperCase()}
              action={
                <button
                  onClick={handleCopy}
                  className="flex items-center space-x-1 text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'COPIED' : 'COPY REPORT'}</span>
                </button>
              }
            >
              <div className="p-4 bg-slate-950/70 rounded-xl border border-cyan-500/20 text-xs font-mono text-slate-200 leading-relaxed whitespace-pre-wrap select-text">
                {report.report}
              </div>
            </GlassCard>
          </div>

          {/* Citations & Source Links */}
          <div>
            <GlassCard title="VERIFIED SOURCE CITATIONS" icon={ExternalLink} badge={`${report.sources?.length || 0} SOURCES`}>
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto font-mono text-xs pr-1">
                {report.sources?.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block p-3 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-cyan-400/50 transition-all group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-cyan-400">SOURCE [{i + 1}]</span>
                      <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-cyan-300" />
                    </div>
                    <p className="font-semibold text-slate-200 line-clamp-1 group-hover:text-cyan-200">
                      {s.title}
                    </p>
                    <p className="text-[10px] text-slate-400 line-clamp-2 mt-1">
                      {s.snippet}
                    </p>
                  </a>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResearchPage;
