import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Laptop,
  Radio,
  Shield,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Bell,
  Mic,
  MicOff,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  AlertCircle,
  Plus,
  Wifi,
  WifiOff,
  Moon,
  Sun
} from 'lucide-react';
import {
  getTrustedDevices,
  generateDeviceEnrollment,
  revokeTrustedDevice,
  getAmbientContexts,
  setDevicePrivacyPermissions,
  getUnifiedNotifications,
  acknowledgeUnifiedNotification,
  getAmbientSyncPayload,
  drainAmbientOfflineQueue
} from '../../services/api';

export const AmbientIntelligenceCard = () => {
  const [activeTab, setActiveTab] = useState('devices'); // devices | sync | privacy | notifications
  const [devices, setDevices] = useState([]);
  const [contexts, setContexts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [drainingQueue, setDrainingQueue] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [screenAllowed, setScreenAllowed] = useState(false);

  const fetchAmbientData = async () => {
    try {
      setLoading(true);
      const [devRes, ctxRes, notifRes] = await Promise.all([
        getTrustedDevices().catch(() => ({ data: { devices: [] } })),
        getAmbientContexts().catch(() => ({ data: { contexts: [] } })),
        getUnifiedNotifications({ limit: 10 }).catch(() => ({ data: { notifications: [] } }))
      ]);

      if (devRes?.data?.devices) setDevices(devRes.data.devices);
      if (ctxRes?.data?.contexts) {
        setContexts(ctxRes.data.contexts);
        if (ctxRes.data.contexts.length > 0) {
          const first = ctxRes.data.contexts[0];
          setMicMuted(!first.microphone_enabled);
          setScreenAllowed(first.screen_observation_allowed);
        }
      }
      if (notifRes?.data?.notifications) setNotifications(notifRes.data.notifications);
    } catch (err) {
      console.warn('[AmbientIntelligenceCard] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAmbientData();
  }, []);

  const handleGenerateEnrollment = async () => {
    try {
      setGeneratingCode(true);
      const res = await generateDeviceEnrollment({ device_name: 'Companion Phone' });
      if (res?.data?.enrollment_code) {
        setEnrollment(res.data);
      }
    } catch (err) {
      console.error('Enrollment error:', err);
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleRevokeDevice = async (deviceId) => {
    try {
      await revokeTrustedDevice(deviceId, 'Revoked by user via HUD');
      await fetchAmbientData();
    } catch (err) {
      console.error('Revoke error:', err);
    }
  };

  const handleToggleMic = async () => {
    const newMute = !micMuted;
    setMicMuted(newMute);
    if (devices.length > 0) {
      await setDevicePrivacyPermissions(devices[0].id, { microphone_enabled: !newMute });
    }
  };

  const handleToggleScreen = async () => {
    const newScreen = !screenAllowed;
    setScreenAllowed(newScreen);
    if (devices.length > 0) {
      await setDevicePrivacyPermissions(devices[0].id, { screen_observation_allowed: newScreen });
    }
  };

  const handleAcknowledgeNotification = async (notifId) => {
    try {
      await acknowledgeUnifiedNotification(notifId, 'desktop-hud');
      await fetchAmbientData();
    } catch (err) {
      console.error('Ack error:', err);
    }
  };

  const handleDrainQueue = async () => {
    try {
      setDrainingQueue(true);
      if (devices.length > 0) {
        await drainAmbientOfflineQueue(devices[0].id);
      }
      await fetchAmbientData();
    } catch (err) {
      console.error('Drain error:', err);
    } finally {
      setDrainingQueue(false);
    }
  };

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-emerald-500/30 p-5 shadow-[0_0_25px_rgba(16,185,129,0.08)] backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-emerald-500/20 gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-mono font-bold tracking-wide text-slate-100 flex items-center gap-2">
              AMBIENT PERSONAL INTELLIGENCE <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30">PHASE 11 CORE</span>
            </h3>
            <p className="text-[11px] font-mono text-slate-400">
              Cross-device contextual continuity, dynamic enrollment, voice handoff & unified notifications
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={fetchAmbientData}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-slate-800/90 border border-emerald-500/30 hover:border-emerald-400 text-emerald-300 font-mono text-xs flex items-center space-x-1.5 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>REFRESH</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 mt-4 mb-4 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('devices')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center space-x-1.5 flex-shrink-0 ${
            activeTab === 'devices'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>TRUSTED DEVICES ({devices.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('sync')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center space-x-1.5 flex-shrink-0 ${
            activeTab === 'sync'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wifi className="w-3.5 h-3.5" />
          <span>CROSS-DEVICE SYNC</span>
        </button>

        <button
          onClick={() => setActiveTab('privacy')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center space-x-1.5 flex-shrink-0 ${
            activeTab === 'privacy'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>PRIVACY & SENSORS</span>
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center space-x-1.5 flex-shrink-0 ${
            activeTab === 'notifications'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>UNIFIED NOTIFICATIONS</span>
          {notifications.filter(n => !n.is_read).length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-red-950 text-red-400 text-[10px] font-bold border border-red-500/40 animate-pulse">
              {notifications.filter(n => !n.is_read).length}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Trusted Devices */}
      {activeTab === 'devices' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div>
              <p className="text-xs font-mono font-semibold text-slate-200">
                DYNAMIC ONE-TIME ENROLLMENT (ZERO HARDCODED PINs)
              </p>
              <p className="text-[11px] font-mono text-slate-400">
                Issue a 5-minute cryptographic pairing code for mobile and connected services
              </p>
            </div>

            <button
              onClick={handleGenerateEnrollment}
              disabled={generatingCode}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-mono font-bold text-xs flex items-center space-x-1.5 transition-all disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{generatingCode ? 'GENERATING...' : 'ENROLL NEW DEVICE'}</span>
            </button>
          </div>

          {enrollment && (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 font-mono text-xs space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> ACTIVE ENROLLMENT CODE
                </span>
                <span className="text-[10px] text-slate-400">Expires in 5 minutes</span>
              </div>
              <div className="text-2xl font-bold tracking-widest text-emerald-200 bg-slate-950/80 p-2.5 rounded-lg border border-emerald-500/30 text-center">
                {enrollment.enrollment_code}
              </div>
              <p className="text-[10px] text-slate-400 text-center">
                Enter this code on your mobile device or scan the pairing QR code to enroll.
              </p>
            </div>
          )}

          {devices.length === 0 ? (
            <div className="p-5 rounded-xl bg-slate-950/40 border border-slate-800 text-center text-xs font-mono text-slate-500">
              No remote devices paired yet. Click "ENROLL NEW DEVICE" to link your phone or tablet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {devices.map((d) => (
                <div
                  key={d.id}
                  className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-2 rounded-lg bg-slate-800 text-emerald-400">
                        {d.device_type === 'desktop' ? <Laptop className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
                      </div>
                      <div>
                        <h4 className="text-xs font-mono font-bold text-slate-200">{d.device_name}</h4>
                        <span className="text-[10px] font-mono text-slate-500">{d.id}</span>
                      </div>
                    </div>

                    <span
                      className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${
                        d.pairing_status === 'PAIRED'
                          ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                          : 'bg-red-950/70 border-red-500/40 text-red-300'
                      }`}
                    >
                      {d.pairing_status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-900">
                    <span>Last Seen: {new Date(d.last_seen_at).toLocaleTimeString()}</span>
                    {d.pairing_status === 'PAIRED' && (
                      <button
                        onClick={() => handleRevokeDevice(d.id)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                      >
                        REVOKE
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Cross-Device Sync */}
      {activeTab === 'sync' && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 uppercase">
                STATE RECONCILIATION & OFFLINE QUEUE
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                ACTIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Synchronizes missions, goals, memory updates, and conversation context with zero duplicate execution.
            </p>
            <div className="pt-2 flex items-center space-x-3">
              <button
                onClick={handleDrainQueue}
                disabled={drainingQueue}
                className="px-3 py-1.5 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-slate-100 font-mono text-xs flex items-center space-x-1.5 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${drainingQueue ? 'animate-spin' : ''}`} />
                <span>{drainingQueue ? 'DRAINING...' : 'DRAIN OFFLINE QUEUE'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Privacy & Sensors */}
      {activeTab === 'privacy' && (
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 uppercase">
                STRICT PRIVACY BARRIERS & SENSOR CONTROLS
              </span>
              <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30">
                ZERO INVASIVE MONITORING
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-200">Microphone Input</p>
                  <p className="text-[10px] text-slate-400">{micMuted ? 'Muted (Strictly blocked)' : 'Listening authorized'}</p>
                </div>
                <button
                  onClick={handleToggleMic}
                  className={`p-2 rounded-lg border transition-all ${
                    micMuted ? 'bg-red-950/80 border-red-500 text-red-300' : 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                  }`}
                  title={micMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                >
                  {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-200">Screen Observation</p>
                  <p className="text-[10px] text-slate-400">{screenAllowed ? 'Authorized' : 'Disallowed (Vision blocked)'}</p>
                </div>
                <button
                  onClick={handleToggleScreen}
                  className={`p-2 rounded-lg border transition-all ${
                    screenAllowed ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300' : 'bg-red-950/80 border-red-500 text-red-300'
                  }`}
                  title={screenAllowed ? 'Disable Screen Observation' : 'Enable Screen Observation'}
                >
                  {screenAllowed ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Unified Notifications */}
      {activeTab === 'notifications' && (
        <div className="space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-300 uppercase">
              CROSS-DEVICE NOTIFICATION FEED
            </span>
            <span className="text-[10px] text-slate-500">
              WITH DEDUPLICATION & ACKNOWLEDGMENT
            </span>
          </div>

          {notifications.length === 0 ? (
            <div className="p-5 rounded-xl bg-slate-950/40 border border-slate-800 text-center text-slate-500">
              No notifications pending acknowledgment.
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-200">{n.title}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded-full border ${
                          n.priority === 'CRITICAL'
                            ? 'bg-red-950 text-red-300 border-red-500/40'
                            : 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                        }`}
                      >
                        {n.priority}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">{n.message}</p>
                    <span className="text-[9px] text-slate-500">{new Date(n.created_at).toLocaleTimeString()}</span>
                  </div>

                  {!n.is_acknowledged && (
                    <button
                      onClick={() => handleAcknowledgeNotification(n.id)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[10px] font-mono flex items-center space-x-1 flex-shrink-0"
                    >
                      <CheckCircle className="w-3 h-3" />
                      <span>ACK</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AmbientIntelligenceCard;
