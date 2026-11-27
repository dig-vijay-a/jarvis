import React, { useState } from 'react';
import { 
  Eye, 
  Camera, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle, 
  X, 
  Layers, 
  HelpCircle,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { analyzeScreen } from '../../services/api';

export const ScreenIntelligenceModal = ({ isOpen, onClose }) => {
  const [screenshotData, setScreenshotData] = useState(null);
  const [selectedMode, setSelectedMode] = useState('summarize');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  if (!isOpen) return null;

  // Screen capture via Web Browser DisplayMedia API with explicit user authorization
  const handleCaptureScreen = async () => {
    setErrorMsg(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('Screen capture API not supported in this browser environment.');
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      await new Promise(r => video.onloadedmetadata = r);

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const base64Data = canvas.toDataURL('image/png');
      setScreenshotData(base64Data);

      // Stop stream tracks
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      console.warn('Screen capture issue:', err);
      setErrorMsg(err.message || 'Permission was denied or capture failed.');
    }
  };

  const handleRunAnalysis = async () => {
    if (!screenshotData) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setErrorMsg(null);

    try {
      const res = await analyzeScreen(screenshotData, selectedMode, customPrompt);
      if (res.data.success) {
        setAnalysisResult(res.data);
      } else {
        setErrorMsg(res.data.error || 'Vision analysis failed.');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-950 border border-cyan-500/40 shadow-[0_0_50px_rgba(0,240,255,0.25)] overflow-hidden font-mono text-xs">
        {/* Modal Top Bar */}
        <div className="px-5 py-3 border-b border-cyan-500/20 bg-slate-900/80 flex items-center justify-between select-none">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-950/80 border border-cyan-400/40 text-cyan-400">
              <Eye className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h2 className="font-display font-bold text-sm text-cyan-200">
                JARVIS SCREEN INTELLIGENCE & COMPUTER VISION
              </h2>
              <p className="text-[10px] text-slate-400">
                On-demand screen inspection, UI element detection & automated error diagnosis
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Capture Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-cyan-500/20">
            <div>
              <p className="font-semibold text-slate-200">User-Authorized Screen Capture</p>
              <span className="text-[11px] text-slate-400">
                JARVIS captures screen frames strictly upon your explicit command. Zero background surveillance.
              </span>
            </div>

            <button
              onClick={handleCaptureScreen}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all flex-shrink-0"
            >
              <Camera className="w-4 h-4" />
              <span>CAPTURE SCREEN / WINDOW</span>
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-300 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Screenshot Preview & Options */}
          {screenshotData && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Preview Thumbnail */}
              <div className="space-y-2">
                <span className="text-slate-400 text-[10px] uppercase font-semibold">SCREEN CAPTURE BUFFER:</span>
                <div className="rounded-xl border border-cyan-500/30 overflow-hidden bg-black max-h-56 flex items-center justify-center">
                  <img src={screenshotData} alt="Screen capture" className="w-full h-auto object-contain max-h-56" />
                </div>
              </div>

              {/* Analysis Mode Options */}
              <div className="space-y-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">ANALYSIS PROTOCOL</label>
                  <select
                    value={selectedMode}
                    onChange={(e) => setSelectedMode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-cyan-300 focus:outline-none focus:border-cyan-400"
                  >
                    <option value="summarize">Workspace Summary (Overview of open windows)</option>
                    <option value="explain_error">Explain Visible Errors (Tracebacks & dialogs)</option>
                    <option value="identify_ui">Identify UI Elements (Actionable controls)</option>
                    <option value="suggest_actions">Suggest Strategic Next Actions</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">OPTIONAL DIRECTIVE OR FOCUS</label>
                  <input
                    type="text"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="e.g. What is causing this red error in the terminal?..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <button
                  onClick={handleRunAnalysis}
                  disabled={isAnalyzing}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)]"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>PROCESSING VISUAL TELEMETRY...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>ANALYZE WITH VISION CORE</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Analysis Report Output */}
          {analysisResult && (
            <div className="p-4 rounded-xl bg-slate-900/80 border border-cyan-500/40 shadow-[0_0_20px_rgba(0,240,255,0.15)] space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-cyan-300 font-bold flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  NEURAL VISION REPORT ({analysisResult.provider?.toUpperCase()})
                </span>
                <span className="text-[10px] text-slate-500">
                  {new Date(analysisResult.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <pre className="text-slate-200 text-xs whitespace-pre-wrap leading-relaxed select-text bg-black/40 p-3 rounded-lg max-h-60 overflow-y-auto">
                {analysisResult.analysis}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScreenIntelligenceModal;
