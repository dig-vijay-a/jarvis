import React, { useState, useEffect } from 'react';
import { 
  TerminalSquare, 
  Cpu, 
  Folder, 
  FileText, 
  Globe, 
  Play, 
  Search, 
  Plus, 
  ShieldCheck, 
  ShieldAlert, 
  Activity, 
  RefreshCw,
  Eye,
  X
} from 'lucide-react';
import GlassCard from '../components/common/GlassCard';
import ComputerIntelligenceCard from '../components/dashboard/ComputerIntelligenceCard';
import { 
  getSystemStatus, 
  getSystemProcesses, 
  getAllowedApps, 
  openApplication, 
  openWebsite, 
  searchFiles, 
  readFileContent, 
  createFolder 
} from '../services/api';

export const ComputerControlPage = () => {
  const [status, setStatus] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [allowedApps, setAllowedApps] = useState([]);
  const [loading, setLoading] = useState(false);

  // File explorer states
  const [fileSearchQuery, setFileSearchQuery] = useState('*');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedFileContent, setSelectedFileContent] = useState(null);
  const [customUrl, setCustomUrl] = useState('');
  const [newFolderName, setNewFolderName] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const statusRes = await getSystemStatus();
      setStatus(statusRes.data);

      const procRes = await getSystemProcesses();
      if (procRes.data.success) {
        setProcesses(procRes.data.processes || []);
      }

      const appsRes = await getAllowedApps();
      if (appsRes.data.success) {
        setAllowedApps(appsRes.data.apps || []);
      }
    } catch (err) {
      console.error('Failed to load computer telemetry:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleLaunchApp = async (appName) => {
    try {
      const res = await openApplication(appName);
      alert(res.data.message || `Successfully launched ${appName}`);
    } catch (err) {
      alert(`Launch error: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleOpenUrl = async (e) => {
    e.preventDefault();
    if (!customUrl.trim()) return;
    try {
      let url = customUrl.trim();
      if (!url.startsWith('http')) url = 'https://' + url;
      await openWebsite(url);
      setCustomUrl('');
    } catch (err) {
      alert(`URL launch error: ${err.message}`);
    }
  };

  const handleSearchFiles = async (e) => {
    e.preventDefault();
    try {
      const res = await searchFiles('.', fileSearchQuery || '*', 30);
      if (res.data.success) {
        setSearchResults(res.data.files || []);
      }
    } catch (err) {
      alert('File search error: ' + err.message);
    }
  };

  const handleReadFile = async (filePath) => {
    try {
      const res = await readFileContent(filePath);
      if (res.data.success) {
        setSelectedFileContent(res.data);
      }
    } catch (err) {
      alert('Read error: ' + err.message);
    }
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const res = await createFolder(newFolderName.trim());
      alert(res.data.message || 'Folder created');
      setNewFolderName('');
    } catch (err) {
      alert('Create folder error: ' + err.message);
    }
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Agent Health Status Banner */}
      <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/20 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className={`p-2.5 rounded-lg border ${
            status?.agentOnline 
              ? 'bg-emerald-950/80 border-emerald-400 text-emerald-400'
              : 'bg-amber-950/80 border-amber-400 text-amber-400'
          }`}>
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="font-mono font-bold text-sm text-cyan-200">
                PYTHON LOCAL AGENT: {status?.agentOnline ? 'ONLINE' : 'STANDBY'}
              </h2>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase ${
                status?.agentOnline ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40' : 'bg-amber-950 text-amber-300 border-amber-500/40'
              }`}>
                {status?.agentUrl || 'http://localhost:8000'}
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-0.5">
              Secure sandbox active: strict allowlist, token authentication, and path boundary constraints enforced.
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-cyan-500/30 text-cyan-300 hover:border-cyan-400 text-xs font-mono transition-all flex-shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>POLL TELEMETRY</span>
        </button>
      </div>

      {/* Phase 16: Autonomous Computer Intelligence Dashboard */}
      <ComputerIntelligenceCard />

      {/* Allowed Applications Launcher Grid */}
      <GlassCard title="PERMITTED APPLICATION LAUNCHER" icon={TerminalSquare} badge="ALLOWLIST ENFORCED">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 mt-2">
          {allowedApps.map((app) => (
            <button
              key={app}
              onClick={() => handleLaunchApp(app)}
              className="p-3 rounded-xl bg-slate-900/80 border border-cyan-500/20 hover:border-cyan-400 text-left font-mono transition-all hover:scale-[1.02] active:scale-95 group"
            >
              <div className="flex items-center justify-between mb-1">
                <TerminalSquare className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                <Play className="w-3 h-3 text-slate-500 group-hover:text-cyan-300" />
              </div>
              <p className="text-xs font-bold text-slate-200 uppercase truncate">{app}</p>
              <span className="text-[9px] text-slate-500">Approved Executable</span>
            </button>
          ))}
        </div>

        {/* Safe Browser URL Launcher */}
        <form onSubmit={handleOpenUrl} className="mt-4 pt-3 border-t border-slate-800 flex items-center space-x-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="Launch web URL in default browser (e.g. https://github.com)..."
              className="w-full px-3 py-2 pl-9 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-xs font-mono focus:outline-none focus:border-cyan-400"
            />
            <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs"
          >
            OPEN URL
          </button>
        </form>
      </GlassCard>

      {/* Safe File Search & Reader Explorer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <GlassCard title="SECURE FILE EXPLORER" icon={Folder} badge="SANDBOXED">
            <form onSubmit={handleSearchFiles} className="flex items-center space-x-2 mb-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={fileSearchQuery}
                  onChange={(e) => setFileSearchQuery(e.target.value)}
                  placeholder="Search pattern (e.g. *.js, *package*, *.md)..."
                  className="w-full px-3 py-2 pl-9 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-xs font-mono focus:outline-none focus:border-cyan-400"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-mono font-semibold text-xs"
              >
                SCAN FILES
              </button>
            </form>

            {/* File List */}
            <div className="max-h-60 overflow-y-auto space-y-1.5 font-mono text-xs pr-1">
              {searchResults.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
                  Click 'Scan Files' to index files inside permitted workspace boundaries.
                </div>
              ) : (
                searchResults.map((f, i) => (
                  <div
                    key={i}
                    onClick={() => handleReadFile(f.path)}
                    className="p-2 rounded bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <FileText className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                      <span className="text-slate-200 truncate">{f.name}</span>
                    </div>
                    <div className="flex items-center space-x-3 text-[10px] text-slate-400 flex-shrink-0">
                      <span>{(f.size / 1024).toFixed(1)} KB</span>
                      <Eye className="w-3 h-3 text-cyan-400" />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Quick Folder Creator */}
            <form onSubmit={handleCreateFolder} className="mt-3 pt-3 border-t border-slate-800 flex items-center space-x-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="New directory name (e.g. my_project_notes)..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-xs font-mono focus:outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-xs flex items-center space-x-1"
              >
                <Plus className="w-3 h-3" />
                <span>MKDIR</span>
              </button>
            </form>
          </GlassCard>
        </div>

        {/* Active Top Processes */}
        <div>
          <GlassCard title="ACTIVE SYSTEM PROCESSES" icon={Cpu} badge="TOP CPU CONSUMERS">
            <div className="space-y-1.5 max-h-80 overflow-y-auto font-mono text-[11px] pr-1">
              {processes.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
                  Process polling standing by.
                </div>
              ) : (
                processes.map((p) => (
                  <div
                    key={p.pid}
                    className="p-2 rounded bg-slate-900/60 border border-slate-800/80 flex items-center justify-between"
                  >
                    <div className="truncate mr-2">
                      <p className="font-semibold text-slate-200 truncate">{p.name}</p>
                      <span className="text-[9px] text-slate-400">PID: {p.pid}</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-cyan-300 font-bold">{p.cpu}% CPU</span>
                      <p className="text-[9px] text-slate-400">{p.memory}% RAM</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* File Viewer Modal */}
      {selectedFileContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-950 border border-cyan-500/40 p-5 font-mono text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-cyan-500/20 mb-3">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-cyan-200">{selectedFileContent.path}</span>
              </div>
              <button
                onClick={() => setSelectedFileContent(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <pre className="p-3 bg-black/80 rounded-lg text-slate-200 max-h-96 overflow-y-auto whitespace-pre-wrap text-[11px]">
              {selectedFileContent.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComputerControlPage;
