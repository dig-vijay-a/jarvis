import React, { useState, useEffect } from 'react';
import { 
  SlidersHorizontal, 
  Key, 
  Cpu, 
  Volume2, 
  Shield, 
  Save, 
  Check, 
  RefreshCw, 
  Eye, 
  EyeOff,
  User,
  Radio,
  Server,
  Zap,
  Activity,
  Layers
} from 'lucide-react';
import GlassCard from '../components/common/GlassCard';
import { getSettings, updateSettings, testAiConnection, getAiUsage, getProviderStatus } from '../services/api';

export const SettingsPage = ({ onSpeakTest }) => {
  const [settings, setSettings] = useState({
    primary_provider: 'groq',
    secondary_provider: 'openrouter',
    fallback_provider: 'ollama',
    ai_provider: 'groq',
    local_inference_enabled: 'true',
    
    // Groq
    groq_api_key: '',
    groq_model: 'llama-3.3-70b-versatile',
    
    // OpenRouter
    openrouter_api_key: '',
    openrouter_model: 'meta-llama/llama-3.3-70b-instruct',
    
    // Gemini
    gemini_api_key: '',
    gemini_model: 'gemini-2.5-flash',
    
    // Mistral
    mistral_api_key: '',
    mistral_model: 'mistral-small-latest',
    
    // Ollama
    ollama_endpoint: 'http://localhost:11434',
    ollama_model: 'llama3:latest',
    
    // Voice & General
    tts_enabled: 'true',
    tts_rate: '1.05',
    tts_pitch: '1.0',
    continuous_listening: 'false',
    python_agent_url: 'http://localhost:8000',
    python_agent_token: 'nova-local-agent-secure-token-2026',
    system_user_name: 'Commander Digvijay'
  });

  const [activeTab, setActiveTab] = useState('groq');
  const [showKeys, setShowKeys] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testingProvider, setTestingProvider] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [usageMetrics, setUsageMetrics] = useState([]);
  const [providersStatus, setProvidersStatus] = useState(null);

  useEffect(() => {
    loadSettings();
    loadDiagnostics();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await getSettings();
      if (res.data.success) {
        setSettings(prev => ({ ...prev, ...res.data.settings }));
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const loadDiagnostics = async () => {
    try {
      const [usageRes, statusRes] = await Promise.allSettled([
        getAiUsage(),
        getProviderStatus()
      ]);
      if (usageRes.status === 'fulfilled' && usageRes.value.data.success) {
        setUsageMetrics(usageRes.value.data.metrics || []);
      }
      if (statusRes.status === 'fulfilled' && statusRes.value.data.success) {
        setProvidersStatus(statusRes.value.data);
      }
    } catch (_) {}
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateSettings(settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      loadDiagnostics();
    } catch (err) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestProvider = async (providerName) => {
    setTestingProvider(providerName);
    try {
      const res = await testAiConnection(providerName);
      setTestResults(prev => ({
        ...prev,
        [providerName]: res.data
      }));
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [providerName]: { success: false, error: err.message }
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const toggleShowKey = (providerName) => {
    setShowKeys(prev => ({ ...prev, [providerName]: !prev[providerName] }));
  };

  return (
    <form onSubmit={handleSave} className="space-y-5 pb-8 font-mono text-xs select-text">
      {/* Save Button Top Bar */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-cyan-500/20 select-none">
        <div>
          <h2 className="font-display font-bold text-sm text-cyan-200">
            JARVIS MULTI-PROVIDER AI INTELLIGENCE ENGINE
          </h2>
          <p className="text-[11px] text-slate-400">
            Provider-independent architecture with autonomous error classification, backoff & transparent fallback.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center space-x-1.5 px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all"
        >
          {saveSuccess ? (
            <>
              <Check className="w-4 h-4" />
              <span>SAVED & COMMITTED</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>SAVE CONFIGURATION</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Multi-Provider Intelligence Core */}
        <GlassCard title="MULTI-PROVIDER INTELLIGENCE CORE" icon={Cpu} badge="ADAPTIVE ROUTER">
          <div className="space-y-4">
            {/* Priority Selectors */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">PRIMARY PROVIDER</label>
                <select
                  value={settings.primary_provider || 'groq'}
                  onChange={(e) => setSettings({ ...settings, primary_provider: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-cyan-300 font-bold focus:outline-none focus:border-cyan-400"
                >
                  <option value="groq">Groq (Ultra Low-Latency - Primary)</option>
                  <option value="openrouter">OpenRouter (Secondary Aggregator)</option>
                  <option value="gemini">Google Gemini (Multimodal Pro/Flash)</option>
                  <option value="mistral">Mistral AI (European Cloud)</option>
                  <option value="ollama">Ollama (Private Local LLM)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">FALLBACK PROVIDER</label>
                <select
                  value={settings.fallback_provider || 'ollama'}
                  onChange={(e) => setSettings({ ...settings, fallback_provider: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                >
                  <option value="ollama">Ollama (Local Private Fallback)</option>
                  <option value="openrouter">OpenRouter (High-Reliability Fallback)</option>
                  <option value="gemini">Google Gemini (Optional Fallback)</option>
                  <option value="mistral">Mistral AI (Fallback)</option>
                  <option value="groq">Groq</option>
                </select>
              </div>
            </div>

            {/* Local Inference Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
              <div>
                <p className="font-semibold text-slate-200">Local Inference Engine (Ollama)</p>
                <span className="text-[10px] text-slate-400">Zero cloud leakage fallback for sensitive operations</span>
              </div>
              <input
                type="checkbox"
                checked={settings.local_inference_enabled === 'true'}
                onChange={(e) => setSettings({ ...settings, local_inference_enabled: e.target.checked ? 'true' : 'false' })}
                className="w-4 h-4 rounded text-cyan-500 focus:ring-0 bg-slate-900"
              />
            </div>

            {/* Provider Tabs */}
            <div className="pt-2">
              <div className="flex space-x-1 border-b border-slate-800 pb-2 mb-3">
                {['groq', 'openrouter', 'gemini', 'mistral', 'ollama'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setActiveTab(p)}
                    className={`px-3 py-1 rounded text-[11px] font-semibold transition-all uppercase ${
                      activeTab === p
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              {/* Tab 1: Groq */}
              {activeTab === 'groq' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">GROQ API KEY</label>
                    <div className="relative">
                      <input
                        type={showKeys.groq ? 'text' : 'password'}
                        value={settings.groq_api_key || ''}
                        onChange={(e) => setSettings({ ...settings, groq_api_key: e.target.value })}
                        placeholder="gsk_... (stored encrypted AES-256-GCM)"
                        className="w-full px-3 py-2 pr-10 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                      />
                      <button
                        type="button"
                        onClick={() => toggleShowKey('groq')}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                      >
                        {showKeys.groq ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">GROQ MODEL</label>
                    <select
                      value={settings.groq_model || 'llama-3.3-70b-versatile'}
                      onChange={(e) => setSettings({ ...settings, groq_model: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                    >
                      <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Fastest & High Capability)</option>
                      <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (Ultra-Fast Reflex)</option>
                      <option value="mixtral-8x7b-32768">mixtral-8x7b-32768 (Long Context MoE)</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestProvider('groq')}
                    disabled={testingProvider === 'groq'}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-cyan-500/30 text-cyan-300 hover:border-cyan-400 transition-all text-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingProvider === 'groq' ? 'animate-spin' : ''}`} />
                    <span>TEST GROQ CONNECTION</span>
                  </button>
                </div>
              )}

              {/* Tab 2: OpenRouter */}
              {activeTab === 'openrouter' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">OPENROUTER API KEY</label>
                    <div className="relative">
                      <input
                        type={showKeys.openrouter ? 'text' : 'password'}
                        value={settings.openrouter_api_key || ''}
                        onChange={(e) => setSettings({ ...settings, openrouter_api_key: e.target.value })}
                        placeholder="sk-or-... (stored encrypted AES-256-GCM)"
                        className="w-full px-3 py-2 pr-10 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                      />
                      <button
                        type="button"
                        onClick={() => toggleShowKey('openrouter')}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                      >
                        {showKeys.openrouter ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">OPENROUTER MODEL</label>
                    <input
                      type="text"
                      value={settings.openrouter_model || 'meta-llama/llama-3.3-70b-instruct'}
                      onChange={(e) => setSettings({ ...settings, openrouter_model: e.target.value })}
                      placeholder="e.g. meta-llama/llama-3.3-70b-instruct, anthropic/claude-3.5-sonnet"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestProvider('openrouter')}
                    disabled={testingProvider === 'openrouter'}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-cyan-500/30 text-cyan-300 hover:border-cyan-400 transition-all text-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingProvider === 'openrouter' ? 'animate-spin' : ''}`} />
                    <span>TEST OPENROUTER CONNECTION</span>
                  </button>
                </div>
              )}

              {/* Tab 3: Gemini */}
              {activeTab === 'gemini' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">GEMINI API KEY</label>
                    <div className="relative">
                      <input
                        type={showKeys.gemini ? 'text' : 'password'}
                        value={settings.gemini_api_key || ''}
                        onChange={(e) => setSettings({ ...settings, gemini_api_key: e.target.value })}
                        placeholder="AIzaSy... (stored encrypted AES-256-GCM)"
                        className="w-full px-3 py-2 pr-10 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                      />
                      <button
                        type="button"
                        onClick={() => toggleShowKey('gemini')}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                      >
                        {showKeys.gemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">GEMINI MODEL</label>
                    <select
                      value={settings.gemini_model || 'gemini-2.5-flash'}
                      onChange={(e) => setSettings({ ...settings, gemini_model: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                    >
                      <option value="gemini-2.5-flash">gemini-2.5-flash (Fast Multimodal)</option>
                      <option value="gemini-1.5-pro">gemini-1.5-pro (Deep Reasoning)</option>
                      <option value="gemini-1.5-flash">gemini-1.5-flash (Standard)</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestProvider('gemini')}
                    disabled={testingProvider === 'gemini'}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-cyan-500/30 text-cyan-300 hover:border-cyan-400 transition-all text-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingProvider === 'gemini' ? 'animate-spin' : ''}`} />
                    <span>TEST GEMINI CONNECTION</span>
                  </button>
                </div>
              )}

              {/* Tab 4: Mistral */}
              {activeTab === 'mistral' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">MISTRAL API KEY</label>
                    <div className="relative">
                      <input
                        type={showKeys.mistral ? 'text' : 'password'}
                        value={settings.mistral_api_key || ''}
                        onChange={(e) => setSettings({ ...settings, mistral_api_key: e.target.value })}
                        placeholder="Paste Mistral API Key (stored encrypted AES-256-GCM)..."
                        className="w-full px-3 py-2 pr-10 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                      />
                      <button
                        type="button"
                        onClick={() => toggleShowKey('mistral')}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                      >
                        {showKeys.mistral ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">MISTRAL MODEL</label>
                    <select
                      value={settings.mistral_model || 'mistral-small-latest'}
                      onChange={(e) => setSettings({ ...settings, mistral_model: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                    >
                      <option value="mistral-small-latest">mistral-small-latest (Fast & Cost Efficient)</option>
                      <option value="mistral-large-latest">mistral-large-latest (Top Reasoning)</option>
                      <option value="codestral-latest">codestral-latest (Code Specialist)</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestProvider('mistral')}
                    disabled={testingProvider === 'mistral'}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-cyan-500/30 text-cyan-300 hover:border-cyan-400 transition-all text-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingProvider === 'mistral' ? 'animate-spin' : ''}`} />
                    <span>TEST MISTRAL CONNECTION</span>
                  </button>
                </div>
              )}

              {/* Tab 5: Ollama */}
              {activeTab === 'ollama' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">OLLAMA HOST URL</label>
                    <input
                      type="text"
                      value={settings.ollama_endpoint || 'http://localhost:11434'}
                      onChange={(e) => setSettings({ ...settings, ollama_endpoint: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">OLLAMA MODEL NAME</label>
                    <input
                      type="text"
                      value={settings.ollama_model || 'llama3:latest'}
                      onChange={(e) => setSettings({ ...settings, ollama_model: e.target.value })}
                      placeholder="llama3:latest, mistral, deepseek-r1..."
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestProvider('ollama')}
                    disabled={testingProvider === 'ollama'}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-cyan-500/30 text-cyan-300 hover:border-cyan-400 transition-all text-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingProvider === 'ollama' ? 'animate-spin' : ''}`} />
                    <span>TEST OLLAMA CONNECTION</span>
                  </button>
                </div>
              )}

              {/* Diagnostic Test Feedback Box */}
              {testResults[activeTab] && (
                <div className={`mt-3 p-2.5 rounded text-[11px] border ${
                  testResults[activeTab].success
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                }`}>
                  {testResults[activeTab].success ? (
                    <div>
                      <p className="font-bold">Operational Verification Succeeded ({testResults[activeTab].latencyMs}ms)</p>
                      <p className="text-[10px] mt-0.5 text-slate-300">Model: {testResults[activeTab].model} | Response: "{testResults[activeTab].message}"</p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-bold">Verification Failed ({testResults[activeTab].errorType || 'ERROR'})</p>
                      <p className="text-[10px] mt-0.5 text-rose-200">{testResults[activeTab].error}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </GlassCard>

        {/* AI Observability & Token Metrics */}
        <GlassCard title="PROVIDER OBSERVABILITY & TOKEN USAGE" icon={Activity} badge="METRICS">
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 font-bold uppercase">Multi-Provider Live Telemetry</span>
                <span className="text-cyan-400 font-bold">Auto-Logged</span>
              </div>
              {usageMetrics.length === 0 ? (
                <p className="text-slate-500 text-[10px]">No inference sessions recorded yet. Execute queries to monitor token usage and latency.</p>
              ) : (
                <div className="space-y-2">
                  {usageMetrics.map((m, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800">
                      <div>
                        <span className="text-cyan-300 font-bold uppercase">{m.provider}</span>
                        <p className="text-[10px] text-slate-400">{m.total_requests} requests ({m.successful_requests} successful)</p>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-200 font-mono font-semibold">{m.total_tokens?.toLocaleString() || 0} tokens</span>
                        <p className="text-[10px] text-slate-500">~{Math.round(m.avg_latency_ms || 0)}ms avg latency</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <p className="text-cyan-300 font-semibold">SECURITY AT REST</p>
              <p>All provider credentials are encrypted using AES-256-GCM authenticated encryption before persisting to disk. Keys are never transmitted in plaintext.</p>
            </div>
          </div>
        </GlassCard>

        {/* Voice & Synthesis Config */}
        <GlassCard title="VOX & SPEECH SYNTHESIS" icon={Volume2} badge="WEB SPEECH API">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-200">Text-To-Speech (TTS)</p>
                <span className="text-[10px] text-slate-500">Vocalize assistant replies automatically</span>
              </div>
              <input
                type="checkbox"
                checked={settings.tts_enabled === 'true'}
                onChange={(e) => setSettings({ ...settings, tts_enabled: e.target.checked ? 'true' : 'false' })}
                className="w-4 h-4 rounded text-cyan-500 focus:ring-0 bg-slate-900"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-200">Continuous Listening Mode</p>
                <span className="text-[10px] text-slate-500">Keep microphone alive for successive directives</span>
              </div>
              <input
                type="checkbox"
                checked={settings.continuous_listening === 'true'}
                onChange={(e) => setSettings({ ...settings, continuous_listening: e.target.checked ? 'true' : 'false' })}
                className="w-4 h-4 rounded text-cyan-500 focus:ring-0 bg-slate-900"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-300 font-semibold">SPEECH RATE: {settings.tts_rate}x</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="1.4"
                step="0.05"
                value={settings.tts_rate}
                onChange={(e) => setSettings({ ...settings, tts_rate: e.target.value })}
                className="w-full accent-cyan-400"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-300 font-semibold">SPEECH PITCH: {settings.tts_pitch}</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="1.3"
                step="0.05"
                value={settings.tts_pitch}
                onChange={(e) => setSettings({ ...settings, tts_pitch: e.target.value })}
                className="w-full accent-cyan-400"
              />
            </div>

            <button
              type="button"
              onClick={() => onSpeakTest && onSpeakTest("Good day, Commander. JARVIS voice modulation verified at peak fidelity.")}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/60 transition-all text-xs"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>TEST VOICE SYNTHESIS</span>
            </button>
          </div>
        </GlassCard>

        {/* Python Agent Security */}
        <GlassCard title="PYTHON AGENT SECURITY" icon={Shield} badge="HOST INTEGRATION">
          <div className="space-y-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">AGENT ENDPOINT URL</label>
              <input
                type="text"
                value={settings.python_agent_url}
                onChange={(e) => setSettings({ ...settings, python_agent_url: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">AGENT AUTH TOKEN</label>
              <input
                type="text"
                value={settings.python_agent_token}
                onChange={(e) => setSettings({ ...settings, python_agent_token: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <p className="text-[10px] text-slate-500">
              Only authorized requests from this backend with the matching Bearer token are accepted by the Python daemon.
            </p>
          </div>
        </GlassCard>

        {/* User Identity Profile */}
        <GlassCard title="COMMANDER PROFILE" icon={User} badge="IDENTITY">
          <div className="space-y-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">COMMANDER NAME</label>
              <input
                type="text"
                value={settings.system_user_name}
                onChange={(e) => setSettings({ ...settings, system_user_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <p className="text-cyan-300 font-semibold">JARVIS DIRECTIVE PROTOCOL</p>
              <p>JARVIS addresses you as "{settings.system_user_name}" across vocal speech and visual logs.</p>
            </div>
          </div>
        </GlassCard>
      </div>
    </form>
  );
};

export default SettingsPage;
