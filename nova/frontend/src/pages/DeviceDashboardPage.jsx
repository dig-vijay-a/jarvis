import React, { useState, useEffect, useCallback } from 'react';

// Phase 19: Device Dashboard Page
// Shows: Registered Devices | Sync Queue | Routing | Notifications | Security

const API_BASE = '/api/ambient';

const TRUST_COLORS = {
  FULL_TRUST: 'text-emerald-400 border-emerald-400/30 bg-emerald-900/20',
  TRUSTED: 'text-cyan-400 border-cyan-400/30 bg-cyan-900/20',
  LIMITED: 'text-yellow-400 border-yellow-400/30 bg-yellow-900/20',
  READ_ONLY: 'text-orange-400 border-orange-400/30 bg-orange-900/20',
  GUEST: 'text-red-400 border-red-400/30 bg-red-900/20'
};

const DEVICE_TYPE_ICONS = {
  desktop: '🖥️',
  laptop: '💻',
  mobile: '📱',
  android: '🤖',
  browser: '🌐',
  tablet: '📟',
  default: '📡'
};

function TrustBadge({ level }) {
  const cls = TRUST_COLORS[level] || TRUST_COLORS.GUEST;
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded border ${cls}`}>
      {level || 'UNKNOWN'}
    </span>
  );
}

function HealthBar({ score }) {
  const s = score ?? 100;
  const color = s >= 70 ? 'bg-emerald-500' : s >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${s}%` }} />
      </div>
      <span className="text-xs text-slate-400 font-mono">{s}/100</span>
    </div>
  );
}

function DeviceCard({ device, onRevoke, onSetTrust, onUpdateHealth }) {
  const icon = DEVICE_TYPE_ICONS[device.device_type] || DEVICE_TYPE_ICONS.default;
  const isOnline = device.is_online || (
    device.connectivity_status === 'ONLINE' &&
    (Date.now() - new Date(device.last_seen_at).getTime() < 300000)
  );

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4 hover:border-cyan-500/30 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{icon}</span>
          <div>
            <div className="font-mono text-sm text-slate-200 font-semibold">{device.device_name}</div>
            <div className="text-xs text-slate-500 font-mono">{device.id}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className="text-xs text-slate-400">{isOnline ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Type</span>
          <span className="text-slate-300 font-mono capitalize">{device.device_type}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Trust</span>
          <TrustBadge level={device.trust_level || 'TRUSTED'} />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Health</span>
          <HealthBar score={device.health_score} />
        </div>
        {device.battery_level !== null && device.battery_level !== undefined && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Battery</span>
            <span className={`font-mono ${device.battery_level < 20 ? 'text-red-400' : 'text-slate-300'}`}>
              {device.battery_level}%
            </span>
          </div>
        )}
        {device.cpu_load_percent !== null && device.cpu_load_percent !== undefined && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">CPU</span>
            <span className={`font-mono ${device.cpu_load_percent > 80 ? 'text-red-400' : 'text-slate-300'}`}>
              {device.cpu_load_percent}%
            </span>
          </div>
        )}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Last Seen</span>
          <span className="text-slate-400 font-mono">
            {device.last_seen_at ? new Date(device.last_seen_at).toLocaleTimeString() : 'Never'}
          </span>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <select
          className="text-xs bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-300 font-mono"
          defaultValue={device.trust_level || 'TRUSTED'}
          onChange={e => onSetTrust(device.id, e.target.value)}
        >
          {['FULL_TRUST', 'TRUSTED', 'LIMITED', 'READ_ONLY', 'GUEST'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          onClick={() => onRevoke(device.id)}
          className="text-xs px-2 py-1 bg-red-900/30 border border-red-500/30 text-red-400 rounded hover:bg-red-900/50 font-mono transition-all"
        >
          Revoke
        </button>
      </div>
    </div>
  );
}

export default function DeviceDashboardPage() {
  const [activeTab, setActiveTab] = useState('devices');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/dashboard/summary`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'API error');
      setData(json);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 5000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const handleRevoke = async (deviceId) => {
    if (!confirm(`Revoke device ${deviceId}?`)) return;
    try {
      const di = await (await import('../services/api.js')).revokeDevice;
      // Direct API call
      await fetch(`/api/mobile/revoke/${deviceId}`, { method: 'POST' });
      fetchDashboard();
    } catch (e) {
      alert(`Revoke failed: ${e.message}`);
    }
  };

  const handleSetTrust = async (deviceId, trustLevel) => {
    try {
      await fetch(`${API_BASE}/devices/${deviceId}/trust`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trustLevel })
      });
      fetchDashboard();
    } catch (e) {
      alert(`Trust update failed: ${e.message}`);
    }
  };

  const tabs = [
    { id: 'devices', label: 'Devices', icon: '📡' },
    { id: 'routing', label: 'Routing', icon: '🔀' },
    { id: 'sync', label: 'Sync Queue', icon: '🔄' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'health', label: 'Health', icon: '💊' }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-mono font-bold text-cyan-400 tracking-wider">
              🌐 DEVICE INTELLIGENCE
            </h1>
            <p className="text-slate-500 text-sm font-mono mt-1">Phase 19 — Universal Device Dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-xs text-slate-500 font-mono">
                Updated {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchDashboard}
              className="text-xs px-3 py-1.5 bg-cyan-900/30 border border-cyan-500/30 text-cyan-400 rounded font-mono hover:bg-cyan-900/50 transition-all"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Total Devices', val: data.health?.total ?? (data.devices?.length ?? 0), color: 'text-cyan-400' },
              { label: 'Online', val: data.devices?.filter(d => d.is_online).length ?? 0, color: 'text-emerald-400' },
              { label: 'Healthy', val: data.health?.healthy ?? 0, color: 'text-green-400' },
              { label: 'Sync Queue', val: data.sync_queue?.reduce((a, r) => a + r.count, 0) ?? 0, color: 'text-yellow-400' }
            ].map(s => (
              <div key={s.label} className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 text-center">
                <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.val}</div>
                <div className="text-xs text-slate-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-4 text-red-400 text-sm font-mono">
            ⚠ {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-slate-700/50 pb-2">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 rounded-t text-xs font-mono transition-all ${
                activeTab === t.id
                  ? 'bg-cyan-900/30 text-cyan-400 border-b-2 border-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {loading && !data ? (
          <div className="text-center py-16 text-slate-500 font-mono">Loading device data…</div>
        ) : (
          <>
            {/* DEVICES TAB */}
            {activeTab === 'devices' && (
              <div>
                {!data?.devices?.length ? (
                  <div className="text-center py-16 text-slate-500 font-mono">
                    No trusted devices registered.<br />
                    <span className="text-xs">Use the mobile app to pair a device.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {data.devices.map(d => (
                      <DeviceCard
                        key={d.id}
                        device={d}
                        onRevoke={handleRevoke}
                        onSetTrust={handleSetTrust}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ROUTING TAB */}
            {activeTab === 'routing' && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-700/50 text-slate-400">
                      <th className="text-left py-2 px-3">Time</th>
                      <th className="text-left py-2 px-3">Task Type</th>
                      <th className="text-left py-2 px-3">Device Selected</th>
                      <th className="text-left py-2 px-3">Score</th>
                      <th className="text-left py-2 px-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.routing?.recent_decisions || []).map((r, i) => (
                      <tr key={r.id || i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-slate-500">{new Date(r.created_at).toLocaleTimeString()}</td>
                        <td className="py-2 px-3 text-cyan-400">{r.task_type}</td>
                        <td className="py-2 px-3 text-slate-300">{r.selected_device_id || '—'}</td>
                        <td className="py-2 px-3 text-emerald-400">{r.score?.toFixed(2) || '—'}</td>
                        <td className="py-2 px-3 text-slate-400">{r.reason}</td>
                      </tr>
                    ))}
                    {!data?.routing?.recent_decisions?.length && (
                      <tr><td colSpan={5} className="text-center py-8 text-slate-600">No routing decisions yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* SYNC QUEUE TAB */}
            {activeTab === 'sync' && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-700/50 text-slate-400">
                      <th className="text-left py-2 px-3">Device ID</th>
                      <th className="text-left py-2 px-3">Status</th>
                      <th className="text-left py-2 px-3">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.sync_queue || []).map((r, i) => (
                      <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-slate-300">{r.device_id}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-xs border ${
                            r.status === 'PENDING' ? 'text-yellow-400 border-yellow-400/30 bg-yellow-900/20' :
                            r.status === 'PROCESSED' ? 'text-emerald-400 border-emerald-400/30 bg-emerald-900/20' :
                            'text-slate-400 border-slate-600'
                          }`}>{r.status}</span>
                        </td>
                        <td className="py-2 px-3 text-cyan-400">{r.count}</td>
                      </tr>
                    ))}
                    {!data?.sync_queue?.length && (
                      <tr><td colSpan={3} className="text-center py-8 text-slate-600">Sync queue is empty</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* NOTIFICATIONS TAB */}
            {activeTab === 'notifications' && (
              <div className="space-y-2">
                {(data?.notifications || []).map((n, i) => (
                  <div key={n.id || i} className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 flex items-start gap-3">
                    <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${
                      n.type === 'APPROVAL_REQUEST' ? 'bg-red-400' :
                      n.type === 'MISSION_COMPLETE' ? 'bg-emerald-400' :
                      'bg-cyan-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-200 font-mono font-semibold truncate">{n.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{n.message}</div>
                      <div className="flex gap-3 mt-1 text-xs text-slate-600">
                        <span>{n.type}</span>
                        <span>{n.priority}</span>
                        <span>{new Date(n.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded border ${
                      n.is_acknowledged ? 'text-slate-500 border-slate-700' : 'text-yellow-400 border-yellow-400/30 bg-yellow-900/20'
                    }`}>
                      {n.is_acknowledged ? 'ACK' : 'PENDING'}
                    </span>
                  </div>
                ))}
                {!data?.notifications?.length && (
                  <div className="text-center py-16 text-slate-600 font-mono">No notifications</div>
                )}
              </div>
            )}

            {/* HEALTH TAB */}
            {activeTab === 'health' && (
              <div>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[
                    { label: 'Healthy (≥70)', val: data?.health?.healthy ?? 0, color: 'text-emerald-400' },
                    { label: 'Degraded (40-69)', val: data?.health?.degraded ?? 0, color: 'text-yellow-400' },
                    { label: 'Critical (<40)', val: data?.health?.critical ?? 0, color: 'text-red-400' }
                  ].map(s => (
                    <div key={s.label} className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 text-center">
                      <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.val}</div>
                      <div className="text-xs text-slate-500 mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {(data?.health?.devices || []).map(d => (
                    <div key={d.id} className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 flex items-center gap-4">
                      <span className="text-xl">{DEVICE_TYPE_ICONS[d.device_type] || '📡'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-200 font-mono font-semibold">{d.device_name}</div>
                        <div className="text-xs text-slate-500">{d.device_type} · {d.trust_level || 'TRUSTED'}</div>
                      </div>
                      <HealthBar score={d.health_score} />
                      <span className={`text-xs font-mono ${
                        d.connectivity_status === 'ONLINE' ? 'text-emerald-400' : 'text-slate-500'
                      }`}>
                        {d.connectivity_status || 'UNKNOWN'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
