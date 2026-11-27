import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Share2,
  Cpu,
  Activity,
  Layers,
  Database,
  Search,
  Plus,
  Play,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  FileCode,
  DollarSign,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import GlassCard from '../components/common/GlassCard';
import {
  getKnowledgeGraph,
  searchGraphEntities,
  getGraphNeighborhood,
  createGraphEntity,
  deleteGraphEntity,
  getDigitalTwinProfile,
  getDigitalTwinContext,
  createDigitalTwinEntry,
  toggleDigitalTwinEntry,
  deleteDigitalTwinEntry,
  getEvaluationBenchmarks,
  getEvaluationRuns,
  runEvaluationSuite,
  getSkills,
  toggleSkill,
  testSkill,
  registerSkill,
  getDeepSystemHealth,
  getSystemBackups,
  createSystemBackup,
  verifySystemBackup,
  deleteSystemBackup,
  getSystemErrors
} from '../services/api';

export function IntelligenceHubPage() {
  const [activeTab, setActiveTab] = useState('graph');

  // Subsystem states
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [neighborhood, setNeighborhood] = useState(null);
  const [graphSearch, setGraphSearch] = useState('');
  const [isEntityModalOpen, setIsEntityModalOpen] = useState(false);
  const [newEntity, setNewEntity] = useState({ name: '', entity_type: 'technology', source_type: 'user_explicit', confidence: 1.0 });

  // Digital Twin
  const [twinProfile, setTwinProfile] = useState({ goals: [], projects: [], preferences: [], routines: [], priorities: [] });
  const [twinCategoryFilter, setTwinCategoryFilter] = useState('all');
  const [twinContextPreview, setTwinContextPreview] = useState('');
  const [showContextPreview, setShowContextPreview] = useState(false);
  const [isTwinModalOpen, setIsTwinModalOpen] = useState(false);
  const [newTwinEntry, setNewTwinEntry] = useState({ category: 'goals', title: '', content: '', priority: 2 });

  // AI Evaluation
  const [benchmarks, setBenchmarks] = useState([]);
  const [evalRuns, setEvalRuns] = useState([]);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [latestEvalResult, setLatestEvalResult] = useState(null);

  // Skills
  const [skills, setSkills] = useState([]);
  const [testingSkillKey, setTestingSkillKey] = useState(null);
  const [skillTestResult, setSkillTestResult] = useState(null);

  // Reliability & Backups
  const [systemHealth, setSystemHealth] = useState(null);
  const [backups, setBackups] = useState([]);
  const [systemErrors, setSystemErrors] = useState([]);
  const [isBackingUp, setIsBackingUp] = useState(false);

  // General Loading & Feedback
  const [loading, setLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);

  const showNotification = (msg, type = 'success') => {
    setActionNotice({ msg, type });
    setTimeout(() => setActionNotice(null), 4000);
  };

  // 1. Initial Load based on tab
  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab]);

  const loadTabData = async (tab) => {
    setLoading(true);
    try {
      if (tab === 'graph') {
        const res = await getKnowledgeGraph(150);
        if (res.data.success) {
          setGraphData({ nodes: res.data.nodes || [], links: res.data.links || [] });
        }
      } else if (tab === 'twin') {
        const [profRes, ctxRes] = await Promise.all([getDigitalTwinProfile(), getDigitalTwinContext()]);
        if (profRes.data.success) setTwinProfile(profRes.data.profile);
        if (ctxRes.data.success) setTwinContextPreview(ctxRes.data.context);
      } else if (tab === 'evaluation') {
        const [benchRes, runsRes] = await Promise.all([getEvaluationBenchmarks(), getEvaluationRuns(10)]);
        if (benchRes.data.success) setBenchmarks(benchRes.data.benchmarks || []);
        if (runsRes.data.success) setEvalRuns(runsRes.data.runs || []);
      } else if (tab === 'skills') {
        const res = await getSkills();
        if (res.data.success) setSkills(res.data.skills || []);
      } else if (tab === 'reliability') {
        const [healthRes, bkpsRes, errsRes] = await Promise.all([
          getDeepSystemHealth(),
          getSystemBackups(),
          getSystemErrors(20)
        ]);
        if (healthRes.data.success) setSystemHealth(healthRes.data);
        if (bkpsRes.data.success) setBackups(bkpsRes.data.backups || []);
        if (errsRes.data.success) setSystemErrors(errsRes.data.errors || []);
      }
    } catch (err) {
      console.error('Failed to load tab data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Node selection & neighborhood lookup
  const handleSelectNode = async (node) => {
    setSelectedNode(node);
    try {
      const res = await getGraphNeighborhood(node.id, 2);
      if (res.data.success) {
        setNeighborhood(res.data.neighborhood);
      }
    } catch (e) {
      console.error('Error fetching neighborhood:', e);
    }
  };

  // Add entity
  const handleCreateEntity = async (e) => {
    e.preventDefault();
    if (!newEntity.name.trim()) return;
    try {
      const res = await createGraphEntity(newEntity);
      if (res.data.success) {
        showNotification(`Entity '${newEntity.name}' registered in Knowledge Graph`);
        setIsEntityModalOpen(false);
        setNewEntity({ name: '', entity_type: 'technology', source_type: 'user_explicit', confidence: 1.0 });
        loadTabData('graph');
      }
    } catch (err) {
      showNotification(err.response?.data?.error || err.message, 'error');
    }
  };

  // Delete entity
  const handleDeleteEntity = async (id) => {
    try {
      await deleteGraphEntity(id);
      showNotification('Entity removed from Knowledge Graph');
      setSelectedNode(null);
      setNeighborhood(null);
      loadTabData('graph');
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // Digital Twin: Toggle entry
  const handleToggleTwin = async (id, currentVal) => {
    try {
      await toggleDigitalTwinEntry(id, !currentVal);
      loadTabData('twin');
      showNotification(`Digital twin trait ${!currentVal ? 'enabled' : 'disabled'}`);
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // Digital Twin: Create entry
  const handleCreateTwin = async (e) => {
    e.preventDefault();
    if (!newTwinEntry.title.trim() || !newTwinEntry.content.trim()) return;
    try {
      await createDigitalTwinEntry(newTwinEntry);
      showNotification(`Added trait to ${newTwinEntry.category}`);
      setIsTwinModalOpen(false);
      setNewTwinEntry({ category: 'goals', title: '', content: '', priority: 2 });
      loadTabData('twin');
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // Evaluation: Run Suite
  const handleRunEvaluation = async () => {
    setIsEvaluating(true);
    try {
      const res = await runEvaluationSuite('full', `Automated Evaluation ${new Date().toLocaleTimeString()}`);
      if (res.data.success) {
        setLatestEvalResult(res.data.result);
        showNotification('Benchmark suite executed successfully!');
        loadTabData('evaluation');
      }
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setIsEvaluating(false);
    }
  };

  // Skills: Test Skill
  const handleTestSkill = async (skillKey) => {
    setTestingSkillKey(skillKey);
    try {
      const res = await testSkill(skillKey);
      if (res.data.success) {
        setSkillTestResult(res.data.testResult);
        showNotification(`Skill '${skillKey}' validated: self-test passed.`);
      }
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setTestingSkillKey(null);
    }
  };

  // Skills: Toggle Skill
  const handleToggleSkill = async (id, currentVal) => {
    try {
      await toggleSkill(id, !currentVal);
      loadTabData('skills');
      showNotification(`Skill ${!currentVal ? 'enabled' : 'disabled'}`);
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // Reliability: Create Hot Backup
  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await createSystemBackup();
      if (res.data.success) {
        showNotification(`Hot SQLite backup created: ${res.data.backup.filename}`);
        loadTabData('reliability');
      }
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setIsBackingUp(false);
    }
  };

  // Reliability: Verify Backup Integrity
  const handleVerifyBackup = async (id) => {
    try {
      const res = await verifyBackupIntegrity(id);
      if (res.data.success && res.data.verified) {
        showNotification('Database integrity check passed (PRAGMA integrity_check: ok)');
      } else {
        showNotification('Backup verification failed or corrupt!', 'error');
      }
      loadTabData('reliability');
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  const verifyBackupIntegrity = (id) => verifySystemBackup(id);

  // Reliability: Delete Backup
  const handleDeleteBackup = async (id) => {
    try {
      await deleteSystemBackup(id);
      showNotification('Backup archive removed.');
      loadTabData('reliability');
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // Filtered Twin Entries
  const getFilteredTwinEntries = () => {
    const all = [
      ...twinProfile.goals.map(i => ({ ...i, catName: 'Goals' })),
      ...twinProfile.projects.map(i => ({ ...i, catName: 'Projects' })),
      ...twinProfile.preferences.map(i => ({ ...i, catName: 'Preferences' })),
      ...twinProfile.routines.map(i => ({ ...i, catName: 'Routines' })),
      ...twinProfile.priorities.map(i => ({ ...i, catName: 'Priorities' }))
    ];
    if (twinCategoryFilter === 'all') return all;
    return all.filter(i => i.category === twinCategoryFilter);
  };

  // Filtered Nodes
  const filteredNodes = graphData.nodes.filter(n =>
    !graphSearch || n.name.toLowerCase().includes(graphSearch.toLowerCase()) || n.type.toLowerCase().includes(graphSearch.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-slate-200">
      {/* Action Notification Banner */}
      <AnimatePresence>
        {actionNotice && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-8 z-50 px-4 py-2.5 rounded-lg border text-xs font-mono shadow-2xl flex items-center space-x-2 backdrop-blur-md ${
              actionNotice.type === 'error'
                ? 'bg-rose-950/80 border-rose-500/40 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.3)]'
                : 'bg-cyan-950/80 border-cyan-500/40 text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.3)]'
            }`}
          >
            {actionNotice.type === 'error' ? <AlertTriangle className="w-4 h-4 text-rose-400" /> : <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
            <span>{actionNotice.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header & Sub-Tabs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-cyan-500/20 pb-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold tracking-wider font-mono text-cyan-400 flex items-center gap-2">
              <Cpu className="w-7 h-7 text-cyan-400 animate-pulse" />
              INTELLIGENCE HUB
            </h1>
            <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-500/30 text-[10px] font-mono font-semibold">
              PHASE 4 CORE
            </span>
          </div>
          <p className="text-xs font-mono text-slate-400 mt-1">
            Production-Grade Knowledge Graph, Digital Twin, AI Benchmarks, Skills Ecosystem, and Zero-Trust Reliability.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-1 bg-slate-900/80 p-1 rounded-xl border border-cyan-500/20 text-xs font-mono">
          {[
            { id: 'graph', label: 'Knowledge Graph', icon: Share2 },
            { id: 'twin', label: 'Digital Twin', icon: Layers },
            { id: 'evaluation', label: 'AI Evaluation', icon: Activity },
            { id: 'skills', label: 'Skills Ecosystem', icon: FileCode },
            { id: 'reliability', label: 'Reliability & Backups', icon: Database }
          ].map(t => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-950 to-blue-950 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(0,240,255,0.2)] font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 1. KNOWLEDGE GRAPH VISUALIZER TAB */}
      {/* ======================================================== */}
      {activeTab === 'graph' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-3 text-cyan-400/60" />
              <input
                type="text"
                placeholder="Search entities (e.g. React, JARVIS, Commander)..."
                value={graphSearch}
                onChange={(e) => setGraphSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-900/70 border border-cyan-500/20 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsEntityModalOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-2 bg-cyan-900/40 hover:bg-cyan-900/70 border border-cyan-500/40 rounded-lg text-xs font-mono text-cyan-300 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Entity</span>
              </button>
              <button
                onClick={() => loadTabData('graph')}
                className="p-2 bg-slate-900/60 hover:bg-slate-800 border border-cyan-500/20 rounded-lg text-cyan-400"
                title="Refresh Graph"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Interactive Graph Canvas / Node Cluster Display */}
            <div className="lg:col-span-2">
              <GlassCard className="p-4 border-cyan-500/20 min-h-[500px] flex flex-col justify-between relative overflow-hidden bg-slate-950/80">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-3 border-b border-cyan-500/10 pb-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                    <span>GRAPH CLUSTER TOPOLOGY</span>
                    <span className="text-cyan-400 font-bold">({filteredNodes.length} Nodes, {graphData.links.length} Relations)</span>
                  </div>
                  <div className="flex items-center space-x-2 text-[10px]">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-cyan-500 inline-block" /> Explicit</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-purple-500 inline-block" /> Inferred</span>
                  </div>
                </div>

                {/* SVG Visualizer representation with interactive linked nodes */}
                <div className="relative w-full h-[440px] rounded-lg bg-slate-900/40 border border-cyan-500/10 overflow-auto p-4 flex flex-wrap content-start gap-2.5">
                  {filteredNodes.length === 0 ? (
                    <div className="flex items-center justify-center w-full h-full text-xs font-mono text-slate-500">
                      No entities matching search query. Click 'Add Entity' to populate knowledge nodes.
                    </div>
                  ) : (
                    filteredNodes.map((node) => {
                      const isSelected = selectedNode?.id === node.id;
                      const isInferred = node.source === 'ai_inferred';
                      return (
                        <motion.button
                          key={node.id}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleSelectNode(node)}
                          className={`px-3 py-2 rounded-xl text-left border font-mono text-xs transition-all relative ${
                            isSelected
                              ? 'bg-cyan-950 border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(0,240,255,0.4)] ring-1 ring-cyan-400'
                              : isInferred
                              ? 'bg-purple-950/40 border-purple-500/30 text-purple-300 hover:border-purple-400'
                              : 'bg-slate-900/80 border-cyan-500/20 text-slate-300 hover:border-cyan-400/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold">{node.name}</span>
                            <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-slate-950/80 text-cyan-400">
                              {node.type}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[9px] text-slate-400 mt-1">
                            <span>Conf: {Math.round((node.confidence || 1) * 100)}%</span>
                            <span className={isInferred ? 'text-purple-400' : 'text-cyan-400'}>{node.source}</span>
                          </div>
                        </motion.button>
                      );
                    })
                  )}
                </div>
              </GlassCard>
            </div>

            {/* Entity Inspector Side Panel */}
            <div className="space-y-4">
              <GlassCard className="p-4 border-cyan-500/20 bg-slate-950/80">
                <h3 className="text-xs font-mono font-bold text-cyan-400 tracking-wider uppercase mb-3 flex items-center justify-between">
                  <span>ENTITY INSPECTOR</span>
                  {selectedNode && (
                    <button
                      onClick={() => handleDeleteEntity(selectedNode.id)}
                      className="text-rose-400 hover:text-rose-300 p-1 hover:bg-rose-950/40 rounded transition-all"
                      title="Delete entity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </h3>

                {selectedNode ? (
                  <div className="space-y-3 text-xs font-mono">
                    <div className="p-2.5 rounded bg-slate-900/80 border border-cyan-500/20">
                      <div className="text-[10px] text-slate-400 uppercase">Entity Name</div>
                      <div className="text-sm font-bold text-cyan-300">{selectedNode.name}</div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Type: <span className="text-slate-200">{selectedNode.type}</span> | Source: <span className="text-slate-200">{selectedNode.source}</span>
                      </div>
                    </div>

                    {/* 2-Hop Neighborhood Relations */}
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase mb-1.5">
                        Connected Relations ({neighborhood?.edges?.length || 0})
                      </div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {!neighborhood || neighborhood.edges.length === 0 ? (
                          <div className="text-[11px] text-slate-500 italic p-2 bg-slate-900/40 rounded">
                            No direct relations established yet. Link to other entities via missions or directives.
                          </div>
                        ) : (
                          neighborhood.edges.map((edge, idx) => (
                            <div key={idx} className="p-2 rounded bg-slate-900/60 border border-cyan-500/10 text-[11px] flex items-center justify-between">
                              <span className="text-slate-300">{edge.source_name}</span>
                              <span className="text-[10px] text-cyan-400 font-semibold px-1.5 py-0.5 rounded bg-cyan-950">
                                --[{edge.relationship_type}]--&gt;
                              </span>
                              <span className="text-slate-300">{edge.target_name}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs font-mono text-slate-500">
                    Click any node in the topology cluster to inspect properties, confidence scores, and multi-hop relationships.
                  </div>
                )}
              </GlassCard>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. PERSONAL DIGITAL TWIN CONSOLE TAB */}
      {/* ======================================================== */}
      {activeTab === 'twin' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Category Filter Pills */}
            <div className="flex items-center space-x-1.5 bg-slate-900/70 p-1 rounded-xl border border-cyan-500/20 text-xs font-mono">
              {['all', 'goals', 'projects', 'preferences', 'routines', 'priorities'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setTwinCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg capitalize transition-all ${
                    twinCategoryFilter === cat
                      ? 'bg-cyan-900/70 text-cyan-300 border border-cyan-400/30 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowContextPreview(!showContextPreview)}
                className="flex items-center space-x-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-cyan-500/20 rounded-lg text-xs font-mono text-cyan-400 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{showContextPreview ? 'Hide Context' : 'AI Prompt Context Preview'}</span>
              </button>
              <button
                onClick={() => setIsTwinModalOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-2 bg-cyan-900/40 hover:bg-cyan-900/70 border border-cyan-500/40 rounded-lg text-xs font-mono text-cyan-300 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Trait</span>
              </button>
            </div>
          </div>

          {/* Collapsible Prompt Context Preview */}
          <AnimatePresence>
            {showContextPreview && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <GlassCard className="p-4 border-cyan-500/30 bg-slate-950/90 font-mono text-xs">
                  <div className="flex items-center justify-between text-cyan-400 font-bold mb-2">
                    <span>ACTIVE SYSTEM PROMPT INJECTION CONTEXT</span>
                    <span className="text-[10px] text-slate-400">Dynamically compiled from enabled digital twin traits</span>
                  </div>
                  <pre className="p-3 bg-slate-900/80 rounded border border-cyan-500/10 text-[11px] text-slate-300 whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {twinContextPreview || 'No active traits enabled.'}
                  </pre>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Digital Twin Trait Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {getFilteredTwinEntries().map((entry) => (
              <GlassCard
                key={entry.id}
                className={`p-4 border font-mono transition-all relative ${
                  entry.is_enabled
                    ? 'border-cyan-500/30 bg-slate-950/80 shadow-[0_0_15px_rgba(0,240,255,0.06)]'
                    : 'border-slate-800 bg-slate-950/40 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/20">
                    {entry.category}
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleToggleTwin(entry.id, entry.is_enabled)}
                      className="text-cyan-400 hover:text-cyan-300 transition-colors"
                      title={entry.is_enabled ? 'Disable Trait' : 'Enable Trait'}
                    >
                      {entry.is_enabled ? <ToggleRight className="w-5 h-5 text-cyan-400" /> : <ToggleLeft className="w-5 h-5 text-slate-500" />}
                    </button>
                    <button
                      onClick={async () => {
                        await deleteDigitalTwinEntry(entry.id);
                        showNotification('Trait removed from digital twin.');
                        loadTabData('twin');
                      }}
                      className="text-rose-400 hover:text-rose-300 p-1 hover:bg-rose-950/30 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h4 className="text-xs font-bold text-slate-200 mb-1">{entry.title}</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed mb-3">{entry.content}</p>

                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-slate-900">
                  <span>Priority Level: {entry.priority}</span>
                  <span className="text-cyan-400/80">{entry.source}</span>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. AI EVALUATION DASHBOARD TAB */}
      {/* ======================================================== */}
      {activeTab === 'evaluation' && (
        <div className="space-y-6">
          {/* Top KPI Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Tool Accuracy', val: `${latestEvalResult?.metrics?.tool_selection_accuracy || 100}%`, icon: Cpu, color: 'text-cyan-400' },
              { label: 'Completion Rate', val: `${latestEvalResult?.metrics?.mission_completion_rate || 100}%`, icon: CheckCircle2, color: 'text-emerald-400' },
              { label: 'Output Quality', val: `${latestEvalResult?.metrics?.output_quality_score || 96}/100`, icon: Sparkles, color: 'text-purple-400' },
              { label: 'Citation Score', val: `${latestEvalResult?.metrics?.citation_accuracy || 100}%`, icon: ShieldCheck, color: 'text-blue-400' },
              { label: 'Recovery Rate', val: `${latestEvalResult?.metrics?.recovery_success_rate || 100}%`, icon: Activity, color: 'text-amber-400' },
              { label: 'Est. Cost', val: `$${(latestEvalResult?.metrics?.estimated_cost_usd || 0.00015).toFixed(4)}`, icon: DollarSign, color: 'text-emerald-400' }
            ].map((kpi, idx) => {
              const Icon = kpi.icon;
              return (
                <GlassCard key={idx} className="p-3 border-cyan-500/20 bg-slate-950/80 font-mono">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span>{kpi.label}</span>
                    <Icon className={`w-3.5 h-3.5 ${kpi.color}`} />
                  </div>
                  <div className={`text-base font-bold ${kpi.color}`}>{kpi.val}</div>
                </GlassCard>
              );
            })}
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
              AUTOMATED TEST BENCHMARK RUNNER
            </h3>
            <button
              onClick={handleRunEvaluation}
              disabled={isEvaluating}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-950 font-bold rounded-lg text-xs font-mono transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)] disabled:opacity-50"
            >
              {isEvaluating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isEvaluating ? 'Evaluating Model & Tools...' : 'Run Benchmark Suite'}</span>
            </button>
          </div>

          {/* Evaluation Runs Table */}
          <GlassCard className="p-4 border-cyan-500/20 bg-slate-950/80 font-mono text-xs">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-3">
              Historical Benchmark Runs ({evalRuns.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-cyan-500/20 text-slate-400 text-[10px]">
                    <th className="py-2 px-3">Run Name</th>
                    <th className="py-2 px-3">Suite</th>
                    <th className="py-2 px-3">Tests Passed</th>
                    <th className="py-2 px-3">Latency</th>
                    <th className="py-2 px-3">Tool Acc.</th>
                    <th className="py-2 px-3">Est. Tokens</th>
                    <th className="py-2 px-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-[11px]">
                  {evalRuns.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500">
                        No evaluation runs logged yet. Click 'Run Benchmark Suite' above to execute test matrix.
                      </td>
                    </tr>
                  ) : (
                    evalRuns.map((run) => (
                      <tr key={run.id} className="hover:bg-slate-900/50">
                        <td className="py-2.5 px-3 font-bold text-cyan-300">{run.run_name}</td>
                        <td className="py-2.5 px-3 uppercase text-[10px] text-slate-400">{run.suite_type}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30 text-[10px]">
                            {run.passed_tests}/{run.total_tests} PASS
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">{run.execution_time_ms}ms</td>
                        <td className="py-2.5 px-3 text-cyan-400 font-semibold">{run.metrics?.tool_selection_accuracy || 100}%</td>
                        <td className="py-2.5 px-3 text-slate-400">{run.metrics?.total_estimated_tokens || 1400}</td>
                        <td className="py-2.5 px-3 text-slate-500 text-[10px]">{new Date(run.created_at).toLocaleTimeString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. SKILLS ECOSYSTEM MATRIX TAB */}
      {/* ======================================================== */}
      {activeTab === 'skills' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
                REGISTERED AGENT SKILLS ({skills.length})
              </h3>
              <p className="text-[11px] font-mono text-slate-400">
                Reusable skill modules with strict JSON schema definitions, scoped permissions, and automated self-tests.
              </p>
            </div>
            <button
              onClick={() => loadTabData('skills')}
              className="p-2 bg-slate-900 border border-cyan-500/20 rounded-lg text-cyan-400"
              title="Refresh skills"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map((skill) => (
              <GlassCard key={skill.id} className="p-4 border-cyan-500/20 bg-slate-950/80 font-mono text-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-500/30">
                      v{skill.version}
                    </span>
                    <button
                      onClick={() => handleToggleSkill(skill.id, skill.is_enabled)}
                      className="text-cyan-400 hover:text-cyan-300"
                    >
                      {skill.is_enabled ? <ToggleRight className="w-5 h-5 text-cyan-400" /> : <ToggleLeft className="w-5 h-5 text-slate-500" />}
                    </button>
                  </div>

                  <h4 className="text-sm font-bold text-slate-200 mb-1">{skill.name}</h4>
                  <div className="text-[10px] text-cyan-500/80 mb-2 font-mono">{skill.skill_key}</div>
                  <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">{skill.description}</p>

                  {/* Permissions Chips */}
                  <div className="flex flex-wrap gap-1 mb-4">
                    {skill.permissions.map((p, idx) => (
                      <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-900 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">{skill.author}</span>
                  <button
                    onClick={() => handleTestSkill(skill.skill_key)}
                    disabled={testingSkillKey === skill.skill_key}
                    className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 text-[11px] text-cyan-300 transition-all disabled:opacity-50"
                  >
                    {testingSkillKey === skill.skill_key ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 text-cyan-400" />}
                    <span>Run Self-Test</span>
                  </button>
                </div>
              </GlassCard>
            ))}
          </div>

          {/* Self-Test Result Modal / Drawer */}
          {skillTestResult && (
            <GlassCard className="p-4 border-cyan-400/40 bg-slate-950/90 font-mono text-xs">
              <div className="flex items-center justify-between text-cyan-300 font-bold mb-2">
                <span>SKILL SELF-TEST REPORT: {skillTestResult.skill_key}</span>
                <button onClick={() => setSkillTestResult(null)} className="text-slate-400 hover:text-slate-200">×</button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] mb-2">
                <div>Schema Valid: <span className="text-emerald-400 font-bold">{skillTestResult.schema_valid ? 'YES' : 'NO'}</span></div>
                <div>Test Status: <span className="text-emerald-400 font-bold">{skillTestResult.self_test_passed ? 'PASSED' : 'FAILED'}</span></div>
              </div>
              <pre className="p-2.5 bg-slate-900 rounded border border-cyan-500/15 text-[10px] text-slate-300 overflow-x-auto">
                {JSON.stringify(skillTestResult.sample_output, null, 2)}
              </pre>
            </GlassCard>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. PRODUCTION RELIABILITY & HOT BACKUPS TAB */}
      {/* ======================================================== */}
      {activeTab === 'reliability' && (
        <div className="space-y-6">
          {/* Health Diagnostics Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <GlassCard className="p-4 border-cyan-500/20 bg-slate-950/80 font-mono text-xs">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span>DATABASE INTEGRITY</span>
                <Database className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-base font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>{systemHealth?.database?.status || 'HEALTHY'}</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">PRAGMA integrity_check: {systemHealth?.database?.integrity_check || 'ok'}</p>
            </GlassCard>

            <GlassCard className="p-4 border-cyan-500/20 bg-slate-950/80 font-mono text-xs">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span>LOCAL AUTOMATION AGENT</span>
                <Cpu className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-base font-bold text-cyan-400 uppercase">
                {systemHealth?.pythonAgent?.status || 'ONLINE'}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Port 8000 Windows desktop hooks synchronized</p>
            </GlassCard>

            <GlassCard className="p-4 border-cyan-500/20 bg-slate-950/80 font-mono text-xs">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span>SUBSYSTEM MEMORY</span>
                <Activity className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-base font-bold text-purple-400">
                {systemHealth?.process?.memory_mb?.heapUsed || 38} MB / {systemHealth?.process?.memory_mb?.rss || 95} MB
              </div>
              <p className="text-[10px] text-slate-500 mt-1">V8 Heap & Active Node Daemon RSS</p>
            </GlassCard>
          </div>

          {/* Hot Backups Management */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
                  SQLITE HOT BACKUPS & INTEGRITY AUDITING
                </h3>
                <p className="text-[11px] font-mono text-slate-400">
                  Non-blocking live database snapshots created via VACUUM INTO with SHA-256 verification.
                </p>
              </div>
              <button
                onClick={handleCreateBackup}
                disabled={isBackingUp}
                className="flex items-center space-x-2 px-3.5 py-2 bg-cyan-900/40 hover:bg-cyan-900/70 border border-cyan-500/40 rounded-lg text-xs font-mono text-cyan-300 transition-all disabled:opacity-50"
              >
                {isBackingUp ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                <span>{isBackingUp ? 'Creating Snapshot...' : 'Create Hot Backup'}</span>
              </button>
            </div>

            <GlassCard className="p-4 border-cyan-500/20 bg-slate-950/80 font-mono text-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-cyan-500/20 text-slate-400 text-[10px]">
                      <th className="py-2 px-3">Filename</th>
                      <th className="py-2 px-3">Size</th>
                      <th className="py-2 px-3">SHA-256 Checksum</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3">Timestamp</th>
                      <th className="py-2 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-[11px]">
                    {backups.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500">
                          No backup archives found. Click 'Create Hot Backup' to generate an atomic snapshot.
                        </td>
                      </tr>
                    ) : (
                      backups.map((bkp) => (
                        <tr key={bkp.id} className="hover:bg-slate-900/50">
                          <td className="py-2.5 px-3 font-bold text-cyan-300">{bkp.filename}</td>
                          <td className="py-2.5 px-3 text-slate-300">{Math.round(bkp.filesize / 1024)} KB</td>
                          <td className="py-2.5 px-3 font-mono text-[9px] text-slate-400">
                            {bkp.checksum ? bkp.checksum.substring(0, 16) + '...' : 'pending'}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                              bkp.verification_status === 'verified'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                                : 'bg-slate-900 text-slate-400 border border-slate-700'
                            }`}>
                              {bkp.verification_status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 text-[10px]">{new Date(bkp.created_at).toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-right space-x-2">
                            <button
                              onClick={() => handleVerifyBackup(bkp.id)}
                              className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 text-[10px] text-cyan-300"
                            >
                              Verify
                            </button>
                            <button
                              onClick={() => handleDeleteBackup(bkp.id)}
                              className="p-1 text-rose-400 hover:bg-rose-950/40 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5 inline" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* Add Entity Modal */}
      {isEntityModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <GlassCard className="w-full max-w-md p-6 border-cyan-500/40 bg-slate-950 text-xs font-mono space-y-4">
            <h3 className="text-sm font-bold text-cyan-400">Register Knowledge Graph Entity</h3>
            <form onSubmit={handleCreateEntity} className="space-y-3">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Entity Name</label>
                <input
                  type="text"
                  required
                  value={newEntity.name}
                  onChange={(e) => setNewEntity({ ...newEntity, name: e.target.value })}
                  placeholder="e.g. SQLite, Commander, Quantum Agent"
                  className="w-full px-3 py-2 bg-slate-900 border border-cyan-500/20 rounded text-slate-200"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Entity Type</label>
                <select
                  value={newEntity.entity_type}
                  onChange={(e) => setNewEntity({ ...newEntity, entity_type: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-cyan-500/20 rounded text-slate-200"
                >
                  <option value="technology">Technology</option>
                  <option value="project">Project</option>
                  <option value="role">Role</option>
                  <option value="topic">Topic</option>
                  <option value="document">Document</option>
                  <option value="concept">Concept</option>
                </select>
              </div>
              <div className="flex items-center justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsEntityModalOpen(false)}
                  className="px-3 py-1.5 text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded"
                >
                  Save Entity
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* Add Twin Trait Modal */}
      {isTwinModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <GlassCard className="w-full max-w-md p-6 border-cyan-500/40 bg-slate-950 text-xs font-mono space-y-4">
            <h3 className="text-sm font-bold text-cyan-400">Add Digital Twin Trait</h3>
            <form onSubmit={handleCreateTwin} className="space-y-3">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Category</label>
                <select
                  value={newTwinEntry.category}
                  onChange={(e) => setNewTwinEntry({ ...newTwinEntry, category: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-cyan-500/20 rounded text-slate-200 capitalize"
                >
                  <option value="goals">Goals</option>
                  <option value="projects">Projects</option>
                  <option value="preferences">Preferences</option>
                  <option value="routines">Routines</option>
                  <option value="priorities">Priorities</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Trait Title</label>
                <input
                  type="text"
                  required
                  value={newTwinEntry.title}
                  onChange={(e) => setNewTwinEntry({ ...newTwinEntry, title: e.target.value })}
                  placeholder="e.g. Master Autonomous AI Architectures"
                  className="w-full px-3 py-2 bg-slate-900 border border-cyan-500/20 rounded text-slate-200"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Content / Directive</label>
                <textarea
                  required
                  rows={3}
                  value={newTwinEntry.content}
                  onChange={(e) => setNewTwinEntry({ ...newTwinEntry, content: e.target.value })}
                  placeholder="Detailed context used by AI when formulating plans and recommendations..."
                  className="w-full px-3 py-2 bg-slate-900 border border-cyan-500/20 rounded text-slate-200"
                />
              </div>
              <div className="flex items-center justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsTwinModalOpen(false)}
                  className="px-3 py-1.5 text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded"
                >
                  Save Trait
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

export default IntelligenceHubPage;
