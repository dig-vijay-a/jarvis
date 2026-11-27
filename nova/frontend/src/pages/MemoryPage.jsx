import React, { useState, useEffect } from 'react';
import { 
  BrainCircuit, 
  Search, 
  Plus, 
  Trash2, 
  Edit3, 
  Star, 
  Bookmark, 
  X, 
  Check, 
  Filter, 
  Database,
  Layers,
  Sparkles,
  AlertTriangle,
  History,
  Tag
} from 'lucide-react';
import GlassCard from '../components/common/GlassCard';
import { 
  getMemories, 
  createMemory, 
  updateMemory, 
  deleteMemory, 
  getMemoryStats,
  checkMemoryDuplicate,
  retrieveMemoryContext
} from '../services/api';

export const MemoryPage = () => {
  const [memories, setMemories] = useState([]);
  const [stats, setStats] = useState({ total: 0, categories: [], sources: [] });
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState(null);
  const [formData, setFormData] = useState({
    key: '',
    value: '',
    category: 'Preferences',
    importance: 3,
    source: 'user_explicit'
  });
  const [duplicateWarning, setDuplicateWarning] = useState(null);

  // Context Relevance Testing State
  const [testPrompt, setTestPrompt] = useState('');
  const [testResults, setTestResults] = useState(null);
  const [isTestingRelevance, setIsTestingRelevance] = useState(false);

  const categories = ['All', 'Identity', 'Preferences', 'Work', 'Routine', 'Projects', 'General'];

  const loadMemories = async () => {
    setIsLoading(true);
    try {
      const res = await getMemories({
        category: selectedCategory === 'All' ? undefined : selectedCategory,
        search: searchQuery || undefined
      });
      if (res.data.success) {
        setMemories(res.data.memories);
      }
      const statsRes = await getMemoryStats();
      if (statsRes.data.success) {
        setStats(statsRes.data);
      }
    } catch (err) {
      console.error('Failed to load memories:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMemories();
  }, [selectedCategory, searchQuery]);

  // Check duplicate as user types memory key
  useEffect(() => {
    if (!formData.key.trim() || editingMemory) {
      setDuplicateWarning(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await checkMemoryDuplicate(formData.key, formData.value);
        if (res.data.isDuplicate) {
          setDuplicateWarning(res.data);
        } else {
          setDuplicateWarning(null);
        }
      } catch (e) {}
    }, 400);

    return () => clearTimeout(timer);
  }, [formData.key, formData.value, editingMemory]);

  const handleOpenAdd = () => {
    setEditingMemory(null);
    setFormData({ key: '', value: '', category: 'Preferences', importance: 3, source: 'user_explicit' });
    setDuplicateWarning(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (mem) => {
    setEditingMemory(mem);
    setFormData({
      key: mem.key,
      value: mem.value,
      category: mem.category,
      importance: mem.importance,
      source: mem.source || 'user_explicit'
    });
    setDuplicateWarning(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.key.trim() || !formData.value.trim()) return;

    try {
      if (editingMemory) {
        await updateMemory(editingMemory.id, formData);
      } else {
        await createMemory({
          ...formData,
          forceUpdate: duplicateWarning?.isDuplicate ? true : false
        });
      }
      setIsModalOpen(false);
      loadMemories();
    } catch (err) {
      alert('Error saving memory: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Erase this memory from the neural bank?')) return;
    try {
      await deleteMemory(id);
      loadMemories();
    } catch (err) {
      alert('Error deleting memory: ' + err.message);
    }
  };

  const handleTestRelevance = async (e) => {
    e.preventDefault();
    if (!testPrompt.trim()) return;
    setIsTestingRelevance(true);
    try {
      const res = await retrieveMemoryContext(testPrompt.trim(), 5);
      if (res.data.success) {
        setTestResults(res.data.memories);
      }
    } catch (err) {
      alert('Relevance test error: ' + err.message);
    } finally {
      setIsTestingRelevance(false);
    }
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Header and Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <GlassCard className="p-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-mono text-slate-400 uppercase">STORED MEMORY UNITS</p>
              <h3 className="text-xl font-bold font-mono text-cyan-200">{stats.total}</h3>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-950/80 border border-blue-500/40 text-blue-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-mono text-slate-400 uppercase">TAXONOMIES</p>
              <h3 className="text-xl font-bold font-mono text-blue-200">
                {stats.categories?.length || 6} CATEGORIES
              </h3>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-mono text-slate-400 uppercase">DUPLICATE DEFENSE</p>
              <h3 className="text-xl font-bold font-mono text-emerald-200">ACTIVE</h3>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-purple-950/80 border border-purple-500/40 text-purple-400">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-mono text-slate-400 uppercase">CONTEXT RETRIEVAL</p>
              <h3 className="text-xl font-bold font-mono text-purple-200">DYNAMIC SCORING</h3>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Control Bar: Categories Filter & Search & Add Button */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/80 border border-cyan-500/20">
        <div className="flex items-center space-x-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 font-mono">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                selectedCategory === cat
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400 font-semibold shadow-[0_0_12px_rgba(0,240,255,0.25)]'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search neural memories..."
              className="w-full px-3 py-2 pl-9 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-cyan-400"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-mono font-bold text-xs shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>RECORD MEMORY</span>
          </button>
        </div>
      </div>

      {/* Memory Relevance Simulator / Tester */}
      <GlassCard title="DYNAMIC MEMORY RETRIEVAL SIMULATOR" icon={BrainCircuit}>
        <form onSubmit={handleTestRelevance} className="flex items-center space-x-2 font-mono text-xs">
          <input
            type="text"
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            placeholder="Simulate prompt to see which memories JARVIS would retrieve into context (e.g. 'What framework should we use for the new UI?')..."
            className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
          />
          <button
            type="submit"
            disabled={isTestingRelevance}
            className="px-4 py-2 rounded-lg bg-slate-800 border border-cyan-500/40 text-cyan-300 hover:bg-slate-700 font-bold"
          >
            TEST RETRIEVAL
          </button>
        </form>

        {testResults && (
          <div className="mt-3 p-3 rounded-lg bg-slate-950 border border-cyan-500/20 font-mono text-xs space-y-1.5">
            <span className="text-[10px] text-cyan-400 font-bold uppercase">
              RELEVANT MEMORIES SCORED FOR PROMPT ({testResults.length} MATCHES):
            </span>
            <div className="space-y-1">
              {testResults.map((m, idx) => (
                <div key={m.id} className="flex items-center justify-between p-1.5 bg-slate-900/60 rounded text-[11px]">
                  <span className="text-slate-200">
                    {idx + 1}. <strong className="text-cyan-300">[{m.category}] {m.key}</strong>: {m.value.slice(0, 60)}...
                  </span>
                  <span className="text-emerald-400 font-bold text-[10px]">
                    SCORE: {m.relevanceScore}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </GlassCard>

      {/* Memory Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {memories.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-500 font-mono text-xs">
            No memories match current filter. Use "Record Memory" or tell JARVIS "Remember that..." in chat.
          </div>
        ) : (
          memories.map((mem) => (
            <GlassCard key={mem.id} className="p-4 flex flex-col justify-between hover:border-cyan-500/50 transition-all font-mono">
              <div>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Bookmark className="w-4 h-4 text-cyan-400" />
                    <h4 className="font-bold text-sm text-cyan-200">{mem.key}</h4>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                      {mem.category}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                      {mem.source || 'user_explicit'}
                    </span>
                    {mem.importance >= 4 && (
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" title={`Importance ${mem.importance}/5`} />
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mt-2 whitespace-pre-wrap">
                  {mem.value}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                <span>Rank: {mem.importance || 2}/5 • Accessed: {mem.access_count || 0}x</span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleOpenEdit(mem)}
                    className="p-1 text-slate-400 hover:text-cyan-300 transition-colors"
                    title="Edit Memory"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(mem.id)}
                    className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Erase Memory"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </GlassCard>
          ))
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl bg-slate-950 border border-cyan-500/40 shadow-[0_0_40px_rgba(0,240,255,0.2)] p-6">
            <div className="flex items-center justify-between mb-4 border-b border-cyan-500/20 pb-3">
              <h3 className="font-display font-bold text-base text-cyan-200">
                {editingMemory ? 'UPDATE MEMORY REGISTER' : 'COMMIT NEW MEMORY TO CORE'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">MEMORY KEY / SUBJECT</label>
                <input
                  type="text"
                  required
                  value={formData.key}
                  onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                  placeholder="e.g. Preferred Coding Style, Meeting Schedule"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {duplicateWarning && (
                <div className="p-2.5 rounded-lg bg-amber-950/70 border border-amber-500/40 text-amber-300 flex items-start space-x-2 text-[11px]">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Duplicate Detected ({Math.round(duplicateWarning.similarity * 100)}% match):</span>
                    <p>Existing key: "{duplicateWarning.existingMemory?.key}". Saving will update the existing entry.</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">MEMORY CONTENT / FACTS</label>
                <textarea
                  required
                  rows={4}
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  placeholder="Enter detailed facts or preferences for JARVIS to remember..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">CATEGORY</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                  >
                    <option value="Preferences">Preferences</option>
                    <option value="Identity">Identity</option>
                    <option value="Work">Work</option>
                    <option value="Routine">Routine</option>
                    <option value="Projects">Projects</option>
                    <option value="General">General</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">IMPORTANCE (1-5)</label>
                  <select
                    value={formData.importance}
                    onChange={(e) => setFormData({ ...formData, importance: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                  >
                    <option value={1}>1 - Low</option>
                    <option value={2}>2 - Standard</option>
                    <option value={3}>3 - Important</option>
                    <option value={4}>4 - High Priority</option>
                    <option value={5}>5 - Critical / Always Inject</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-[0_0_15px_rgba(0,240,255,0.3)]"
                >
                  COMMIT TO MEMORY
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemoryPage;
