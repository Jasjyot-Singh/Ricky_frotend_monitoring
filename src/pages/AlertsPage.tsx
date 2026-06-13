import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useFleetStore, useDeviceList } from '../store/useFleetStore';
import type { Alert } from '../types/fleet.types';

const typeIcons: Record<string, string> = {
  SOS: '🚨',
  LOW_BATTERY: '🔋',
  DEVICE_OFFLINE: '📴',
  GPS_FAILURE: '📡',
  INTERNET_FAILURE: '🌐',
  ESP_DISCONNECTED: '🔌',
  DISPLAY_FAILURE: '🖥️',
  POSTER_SERVICE_DOWN: '📋',
  TELEMETRY_SERVICE_DOWN: '📊',
};

const severityStyles: Record<string, string> = {
  CRITICAL: 'border-l-danger-500 bg-danger-500/5',
  WARNING: 'border-l-warning-500 bg-warning-500/5',
  INFO: 'border-l-fleet-500 bg-fleet-500/5',
};

const AlertsPage: React.FC = () => {
  const alertsFromStore = useFleetStore((s) => s.alerts);
  const serverClockOffset = useFleetStore((s) => s.serverClockOffset);
  const resolveAlertInStore = useFleetStore((s) => s.resolveAlertInStore);
  const globalManuallyResolvedIds = useFleetStore((s) => s.globalManuallyResolvedIds);
  const devices = useDeviceList();
  
  const [allAlerts, setAllAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const isInitialLoadRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'RESOLVED'>('ALL');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [layoutMode, setLayoutMode] = useState<'card' | 'table' | 'grouped'>('card');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [expandedAlerts, setExpandedAlerts] = useState<Record<number, boolean>>({});
  const [resolvedCoords, setResolvedCoords] = useState<Record<number, { latitude: number; longitude: number }>>({});
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const [searchParams] = useSearchParams();
  const alertIdParam = searchParams.get('id');

  useEffect(() => {
    if (alertIdParam && !loading && allAlerts.length > 0) {
      const id = parseInt(alertIdParam, 10);
      if (!isNaN(id)) {
        setExpandedAlerts((prev) => ({ ...prev, [id]: true }));
        setTimeout(() => {
          const element = document.getElementById(`alert-row-${id}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);
      }
    }
  }, [alertIdParam, loading, allAlerts]);

  // Fetch all alerts on mount
  useEffect(() => {
    let active = true;
    const fetchAlerts = async () => {
      try {
        if (isInitialLoadRef.current) {
          setLoading(true);
        }
        const data = await api.getAllAlerts();
        if (!active) return;
        // Sync resolved state from database, or check if operator manually resolved it in this session
        const enriched = data.map((a) => ({
          ...a,
          latitude: a.alertLat !== undefined && a.alertLat !== null ? a.alertLat : null,
          longitude: a.alertLng !== undefined && a.alertLng !== null ? a.alertLng : null,
          resolved: a.resolved || globalManuallyResolvedIds.has(a.id),
          resolvedAt: a.resolved ? (a.resolvedAt || a.createdAt) : (globalManuallyResolvedIds.has(a.id) ? (a.resolvedAt || a.createdAt) : null),
        }));
        setAllAlerts(enriched);
        setError(null);
      } catch (err: any) {
        console.error('Failed to fetch all alerts history:', err);
        if (isInitialLoadRef.current) {
          setError(err.message || 'Failed to load alerts.');
        }
      } finally {
        if (active) {
          setLoading(false);
          isInitialLoadRef.current = false;
        }
      }
    };
    fetchAlerts();
    return () => {
      active = false;
    };
  }, [alertsFromStore, globalManuallyResolvedIds]); // Refresh if store alerts or global resolutions change

  // Handle resolving an alert (only called by explicit operator button click)
  const handleResolve = async (alertId: number) => {
    try {
      const alert = allAlerts.find((a) => a.id === alertId);
      if (!alert) return;

      setResolvingId(alertId);
      const res = await api.resolveAlert(alertId);
      if (res.resolved) {
        // Update local state to show as resolved immediately
        setAllAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId ? { ...a, resolved: true, resolvedAt: res.resolvedAt } : a
          )
        );
        // Sync with global store so sidebar and overview alerts clear too
        resolveAlertInStore(alertId, res.resolvedAt);
      }
    } catch (err: any) {
      alert(`Error resolving alert: ${err.message || 'Unknown error'}`);
    } finally {
      setResolvingId(null);
    }
  };

  // Toggle alert expansion and fetch location if missing
  const toggleExpand = async (id: number) => {
    const isExpanding = !expandedAlerts[id];
    setExpandedAlerts((prev) => ({ ...prev, [id]: isExpanding }));

    if (isExpanding) {
      const alertObj = allAlerts.find((a) => a.id === id);
      if (alertObj && (alertObj.latitude === null || alertObj.latitude === undefined) && !resolvedCoords[id]) {
        try {
          const alertTime = new Date(alertObj.createdAt).getTime();
          const from = new Date(alertTime - 12 * 60 * 60 * 1000).toISOString();
          const to = new Date(alertTime + 12 * 60 * 60 * 1000).toISOString();
          const route = await api.getRouteHistory(alertObj.deviceId, from, to);

          if (route && route.length > 0) {
            let nearestPoint = route[0];
            let minDiff = Math.abs(new Date(nearestPoint.timestamp).getTime() - alertTime);
            for (const pt of route) {
              const diff = Math.abs(new Date(pt.timestamp).getTime() - alertTime);
              if (diff < minDiff) {
                minDiff = diff;
                nearestPoint = pt;
              }
            }
            setResolvedCoords((prev) => ({
              ...prev,
              [id]: { latitude: nearestPoint.latitude, longitude: nearestPoint.longitude }
            }));
          }
        } catch (err) {
          console.error('Failed to resolve nearest location for historical alert:', err);
        }
      }
    }
  };

  // Background pre-fetch: resolve coordinates for ALL alerts that lack lat/lng
  // so table and grouped views always show location without requiring card expansion.
  useEffect(() => {
    if (allAlerts.length === 0) return;

    const alertsNeedingCoords = allAlerts.filter(
      (a) => (a.latitude === null || a.latitude === undefined) && !resolvedCoords[a.id]
    );
    if (alertsNeedingCoords.length === 0) return;

    // Group by deviceId to batch requests
    const byDevice: Record<string, typeof alertsNeedingCoords> = {};
    for (const a of alertsNeedingCoords) {
      if (!byDevice[a.deviceId]) byDevice[a.deviceId] = [];
      byDevice[a.deviceId].push(a);
    }

    const resolveAll = async () => {
      const updates: Record<number, { latitude: number; longitude: number }> = {};

      for (const [deviceId, deviceAlerts] of Object.entries(byDevice)) {
        // Find min/max time range covering all alerts for this device
        const times = deviceAlerts.map((a) => new Date(a.createdAt).getTime());
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        const from = new Date(minTime - 12 * 60 * 60 * 1000).toISOString();
        const to = new Date(maxTime + 12 * 60 * 60 * 1000).toISOString();

        try {
          const route = await api.getRouteHistory(deviceId, from, to);
          if (!route || route.length === 0) continue;

          for (const a of deviceAlerts) {
            const alertTime = new Date(a.createdAt).getTime();
            let nearestPoint = route[0];
            let minDiff = Math.abs(new Date(nearestPoint.timestamp).getTime() - alertTime);
            for (const pt of route) {
              const diff = Math.abs(new Date(pt.timestamp).getTime() - alertTime);
              if (diff < minDiff) { minDiff = diff; nearestPoint = pt; }
            }
            if (nearestPoint.latitude && nearestPoint.longitude) {
              updates[a.id] = { latitude: nearestPoint.latitude, longitude: nearestPoint.longitude };
            }
          }
        } catch { /* skip device if route fetch fails */ }
      }

      if (Object.keys(updates).length > 0) {
        setResolvedCoords((prev) => ({ ...prev, ...updates }));
      }
    };

    resolveAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAlerts]);

  // Filter and search logic
  const processedAlerts = useMemo(() => {
    let list = [...allAlerts];
    
    // 1. Filter by status (active vs resolved)
    list = list.filter((a) => {
      if (filter === 'ACTIVE') return !a.resolved;
      if (filter === 'RESOLVED') return a.resolved;
      return true;
    });

    // 2. Filter by device-wise scroll selector
    if (selectedDeviceId !== 'ALL') {
      list = list.filter((a) => a.deviceId === selectedDeviceId);
    }

    // 3. Filter by search query
    if (search) {
      const query = search.toLowerCase();
      list = list.filter((a) => 
        a.deviceId.toLowerCase().includes(query) ||
        a.type.toLowerCase().includes(query) ||
        a.message.toLowerCase().includes(query)
      );
    }

    // 4. Sort
    list.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortBy === 'newest' ? timeB - timeA : timeA - timeB;
    });

    return list;
  }, [allAlerts, filter, selectedDeviceId, search, sortBy]);

  // Grouped alerts computed state
  const groupedAlerts = useMemo(() => {
    const groups: Record<string, Alert[]> = {};
    for (const a of processedAlerts) {
      const key = a.type;
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    }
    return groups;
  }, [processedAlerts]);



  // Format relative timestamp
  const getRelativeTime = (dateStr: string) => {
    let alertTime = new Date(dateStr).getTime();
    if (typeof dateStr === 'string' && !dateStr.endsWith('Z') && !dateStr.includes('+')) {
      alertTime = new Date(dateStr.replace(' ', 'T') + 'Z').getTime();
    }
    const diff = (Date.now() + serverClockOffset) - alertTime;
    const secs = Math.max(0, Math.floor(diff / 1000));
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(alertTime).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">System Diagnostics Alerts</h1>
          <p className="text-sm text-surface-400 mt-1">
            Analyze historical failures, safety incidents, and resolve diagnostic notifications.
          </p>
        </div>
      </div>

      {/* Device-Wise Horizontal Scroll Selector */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-surface-500 uppercase tracking-wider block">Filter by Active Device</label>
        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-surface-700 scrollbar-track-transparent">
          <button
            onClick={() => setSelectedDeviceId('ALL')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
              selectedDeviceId === 'ALL'
                ? 'bg-fleet-600/30 text-fleet-400 border-fleet-500/30 shadow-md'
                : 'bg-surface-800/40 text-surface-400 border-surface-700/30 hover:text-surface-200 hover:border-surface-600'
            }`}
          >
            All Devices
          </button>
          {devices.map((d) => (
            <button
              key={d.deviceId}
              onClick={() => setSelectedDeviceId(d.deviceId)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                selectedDeviceId === d.deviceId
                  ? 'bg-fleet-600/30 text-fleet-400 border-fleet-500/30 shadow-md'
                  : 'bg-surface-800/40 text-surface-400 border-surface-700/30 hover:text-surface-200 hover:border-surface-600'
              }`}
            >
              {d.deviceId}
            </button>
          ))}
        </div>
      </div>

      {/* Filters, Customize, Sort, Layout & Search Toolbar */}
      <div className="glass-card p-4 flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Toggle Filters & Sort & Layout Mode controls */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Status Filter */}
          <div className="flex bg-surface-900/50 p-1 rounded-xl border border-surface-800">
            {(['ALL', 'ACTIVE', 'RESOLVED'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setFilter(opt)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all ${
                  filter === opt
                    ? 'bg-fleet-600/30 text-fleet-400 border border-fleet-500/20 shadow-md'
                    : 'text-surface-400 hover:text-surface-200'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>

          {/* Sort Controller */}
          <div className="flex bg-surface-900/50 p-1 rounded-xl border border-surface-800">
            <button
              onClick={() => setSortBy('newest')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                sortBy === 'newest'
                  ? 'bg-fleet-600/30 text-fleet-400 border border-fleet-500/20 shadow-md'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              Newest First
            </button>
            <button
              onClick={() => setSortBy('oldest')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                sortBy === 'oldest'
                  ? 'bg-fleet-600/30 text-fleet-400 border border-fleet-500/20 shadow-md'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              Oldest First
            </button>
          </div>

          {/* Layout Controller */}
          <div className="flex bg-surface-900/50 p-1 rounded-xl border border-surface-800 font-medium">
            <button
              onClick={() => setLayoutMode('card')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 ${
                layoutMode === 'card'
                  ? 'bg-fleet-600/30 text-fleet-400 border border-fleet-500/20 shadow-md'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              🗂️ Cards
            </button>
            <button
              onClick={() => setLayoutMode('table')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 ${
                layoutMode === 'table'
                  ? 'bg-fleet-600/30 text-fleet-400 border border-fleet-500/20 shadow-md'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              📋 Table
            </button>
            <button
              onClick={() => setLayoutMode('grouped')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 ${
                layoutMode === 'grouped'
                  ? 'bg-fleet-600/30 text-fleet-400 border border-fleet-500/20 shadow-md'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              📂 Grouped
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full lg:w-72">
          <input
            type="text"
            placeholder="Search by Type, message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-800/50 border border-surface-700/50 rounded-xl px-4 py-2.5 text-sm text-surface-200 placeholder-surface-500
                       focus:outline-none focus:ring-2 focus:ring-fleet-500/30 focus:border-fleet-500/50 transition-all"
          />
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Main Diagnostics Display Container */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="w-10 h-10 border-4 border-fleet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-surface-500">Loading alerts diagnostic database...</p>
        </div>
      ) : error ? (
        <div className="glass-card p-6 border-l-4 border-l-danger-500 text-center">
          <p className="text-danger-400 font-semibold mb-2">Error Loading Alerts</p>
          <p className="text-surface-400 text-sm">{error}</p>
        </div>
      ) : processedAlerts.length === 0 ? (
        <div className="glass-card py-16 text-center">
          <span className="text-3xl">📭</span>
          <p className="text-surface-400 mt-2 font-medium">No alerts matching filters found.</p>
        </div>
      ) : layoutMode === 'table' ? (
        /* Table Layout View */
        <div className="overflow-x-auto bg-surface-900/40 border border-surface-700/20 rounded-xl">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-surface-800 text-xs text-surface-500 font-semibold uppercase tracking-wider bg-surface-900/80">
                <th className="px-6 py-4">Severity</th>
                <th className="px-6 py-4">Device</th>
                <th className="px-6 py-4">Alert Type</th>
                <th className="px-6 py-4">Message</th>
                <th className="px-6 py-4">Location Capture</th>
                <th className="px-6 py-4">Time Triggered</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800/40 text-sm">
              {processedAlerts.map((rawAlert) => {
                const alert = {
                  ...rawAlert,
                  latitude: resolvedCoords[rawAlert.id]?.latitude ?? rawAlert.latitude,
                  longitude: resolvedCoords[rawAlert.id]?.longitude ?? rawAlert.longitude,
                };
                const severity = alert.type === 'SOS' || alert.type === 'DEVICE_OFFLINE' ? 'CRITICAL' : 'WARNING';
                const icon = typeIcons[alert.type] || '⚠️';
                return (
                  <tr key={alert.id} id={`alert-row-${alert.id}`} className="hover:bg-surface-800/25 transition-all">
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        severity === 'CRITICAL' ? 'bg-danger-500/10 text-danger-400' : 'bg-warning-500/10 text-warning-400'
                      }`}>
                        {severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-white">{alert.deviceId}</td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-2 font-medium text-surface-200">
                        <span>{icon}</span>
                        <span>{alert.type.replace('_', ' ')}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 text-surface-300 max-w-xs truncate" title={alert.message}>
                      {alert.message}
                    </td>
                    <td className="px-6 py-4">
                      {alert.latitude !== null && alert.longitude !== null && alert.latitude !== undefined && alert.longitude !== undefined ? (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${alert.latitude},${alert.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-fleet-400 hover:text-fleet-300 underline font-mono text-xs flex items-center gap-1"
                        >
                          📍 {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}
                        </a>
                      ) : (
                        <span className="text-surface-600 italic">No Location</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-surface-400 font-mono text-xs">
                      {getRelativeTime(alert.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {alert.resolved ? (
                        <span className="text-xs text-fleet-400 font-semibold bg-fleet-500/10 px-2 py-1 rounded-full">✓ Resolved</span>
                      ) : (
                        <button
                          onClick={() => handleResolve(alert.id)}
                          disabled={resolvingId === alert.id}
                          className="text-xs font-bold text-danger-400 hover:text-danger-300 disabled:opacity-50 transition-all border border-danger-500/20 px-3 py-1.5 rounded-lg bg-danger-500/5 hover:bg-danger-500/10"
                        >
                          {resolvingId === alert.id ? 'Resolving...' : '🔧 Resolve'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : layoutMode === 'grouped' ? (
        /* Grouped by Alert Type View */
        <div className="space-y-6">
          {Object.entries(groupedAlerts).map(([type, list]) => {
            const icon = typeIcons[type] || '⚠️';
            return (
              <div key={type} className="glass-card p-5 border border-surface-700/20 space-y-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-surface-800 pb-3">
                  <span>{icon}</span>
                  <span>{type.replace('_', ' ')}</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-surface-900 text-surface-400 font-mono font-normal">
                    {list.length} alert{list.length !== 1 ? 's' : ''}
                  </span>
                </h3>
                <div className="space-y-3">
                  {list.map((rawAlert) => {
                    const alert = {
                      ...rawAlert,
                      latitude: resolvedCoords[rawAlert.id]?.latitude ?? rawAlert.latitude,
                      longitude: resolvedCoords[rawAlert.id]?.longitude ?? rawAlert.longitude,
                    };
                    const isExpanded = !!expandedAlerts[alert.id];
                    const severity = alert.type === 'SOS' || alert.type === 'DEVICE_OFFLINE' ? 'CRITICAL' : 'WARNING';

                    return (
                      <div
                        key={alert.id}
                        id={`alert-row-${alert.id}`}
                        onClick={() => toggleExpand(alert.id)}
                        className={`border-l-4 rounded-xl px-5 py-4 transition-all cursor-pointer hover:bg-surface-800/20 border border-surface-700/20 ${
                          severityStyles[severity] || severityStyles.INFO
                        }`}
                      >
                        {/* Header Line */}
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-white uppercase tracking-wider">
                                  Device: {alert.deviceId}
                                </span>
                              </div>
                              <p className="text-sm text-surface-300 mt-0.5">
                                {alert.message}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-xs text-surface-500 font-mono">
                              {getRelativeTime(alert.createdAt)}
                            </span>
                            {alert.resolved ? (
                              <span className="text-xs px-2.5 py-1 rounded-full bg-fleet-500/10 text-fleet-400 font-medium">
                                ✓ Resolved
                              </span>
                            ) : (
                              <span className="text-xs px-2.5 py-1 rounded-full bg-danger-500/10 text-danger-400 font-medium animate-pulse">
                                ● Active
                              </span>
                            )}
                            <span className="text-surface-500 text-xs transition-transform duration-200">
                              {isExpanded ? '▲' : '▼'}
                            </span>
                          </div>
                        </div>

                        {/* Expanded Section */}
                        {isExpanded && (
                          <div 
                            className="mt-4 pt-4 border-t border-surface-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-slide-down"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="space-y-2 text-xs text-surface-400">
                              <p>
                                <strong className="text-surface-300">Device Target ID:</strong>{' '}
                                <span className="font-mono text-fleet-400">{alert.deviceId}</span>
                              </p>
                              <p>
                                <strong className="text-surface-300">Detailed Message:</strong> {alert.message}
                              </p>
                              {alert.latitude !== null && alert.longitude !== null && alert.latitude !== undefined && alert.longitude !== undefined ? (
                                <p>
                                  <strong className="text-surface-300">Location Capture:</strong>{' '}
                                  <span className="font-mono text-fleet-400">
                                    {alert.latitude.toFixed(6)}, {alert.longitude.toFixed(6)}
                                  </span>{' '}
                                  <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${alert.latitude},${alert.longitude}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-fleet-400 hover:text-fleet-300 underline ml-2 text-xs"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    📍 Open in Google Maps
                                  </a>
                                </p>
                              ) : (
                                <p>
                                  <strong className="text-surface-300">Location Capture:</strong>{' '}
                                  <span className="text-surface-500 italic">No GPS coordinates available</span>
                                </p>
                              )}
                              <p>
                                <strong className="text-surface-300">Trigger Timestamp:</strong>{' '}
                                {new Date(alert.createdAt).toLocaleString()}
                              </p>
                              {alert.resolved && alert.resolvedAt && (
                                <p>
                                  <strong className="text-surface-300">Resolution Timestamp:</strong>{' '}
                                  {new Date(alert.resolvedAt).toLocaleString()}
                                </p>
                              )}
                            </div>

                            {!alert.resolved && (
                              <button
                                onClick={() => handleResolve(alert.id)}
                                disabled={resolvingId === alert.id}
                                className="btn btn--primary text-xs py-2 px-4 whitespace-nowrap self-end md:self-center bg-danger-500/20 text-danger-400 border border-danger-500/30 hover:bg-danger-500 hover:text-white"
                              >
                                {resolvingId === alert.id ? 'Resolving...' : '🔧 Mark as Resolved'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Original Card Layout View */
        <div className="space-y-3">
          {processedAlerts.map((rawAlert) => {
            const alert = {
              ...rawAlert,
              latitude: resolvedCoords[rawAlert.id]?.latitude ?? rawAlert.latitude,
              longitude: resolvedCoords[rawAlert.id]?.longitude ?? rawAlert.longitude,
            };
            const isExpanded = !!expandedAlerts[alert.id];
            const severity = alert.type === 'SOS' || alert.type === 'DEVICE_OFFLINE' ? 'CRITICAL' : 'WARNING';
            const icon = typeIcons[alert.type] || '⚠️';

            return (
              <div
                key={alert.id}
                id={`alert-row-${alert.id}`}
                onClick={() => toggleExpand(alert.id)}
                className={`border-l-4 rounded-xl px-5 py-4 transition-all cursor-pointer hover:bg-surface-800/20 border border-surface-700/20 ${
                  severityStyles[severity] || severityStyles.INFO
                }`}
              >
                {/* Header Line */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white uppercase tracking-wider">
                          {alert.type.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-surface-500 font-mono">
                          ({alert.deviceId})
                        </span>
                      </div>
                      <p className="text-sm text-surface-300 mt-0.5 line-clamp-1 sm:line-clamp-none">
                        {alert.message}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-surface-500 font-mono">
                      {getRelativeTime(alert.createdAt)}
                    </span>
                    {alert.resolved ? (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-fleet-500/10 text-fleet-400 font-medium">
                        ✓ Resolved
                      </span>
                    ) : (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-danger-500/10 text-danger-400 font-medium animate-pulse">
                        ● Active
                      </span>
                    )}
                    <span className="text-surface-500 text-xs transition-transform duration-200">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {/* Expanded Section */}
                {isExpanded && (
                  <div 
                    className="mt-4 pt-4 border-t border-surface-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-slide-down"
                    onClick={(e) => e.stopPropagation()} // Prevent collapse when clicking details
                  >
                    <div className="space-y-2 text-xs text-surface-400">
                      <p>
                        <strong className="text-surface-300">Device Target ID:</strong>{' '}
                        <span className="font-mono text-fleet-400">{alert.deviceId}</span>
                      </p>
                      <p>
                        <strong className="text-surface-300">Detailed Message:</strong> {alert.message}
                      </p>
                      {alert.latitude !== null && alert.longitude !== null && alert.latitude !== undefined && alert.longitude !== undefined ? (
                        <p>
                          <strong className="text-surface-300">Location Capture:</strong>{' '}
                          <span className="font-mono text-fleet-400">
                            {alert.latitude.toFixed(6)}, {alert.longitude.toFixed(6)}
                          </span>{' '}
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${alert.latitude},${alert.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-fleet-400 hover:text-fleet-300 underline ml-2 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            📍 Open in Google Maps
                          </a>
                        </p>
                      ) : (
                        <p>
                          <strong className="text-surface-300">Location Capture:</strong>{' '}
                          <span className="text-surface-500 italic">No GPS coordinates available</span>
                        </p>
                      )}
                      <p>
                        <strong className="text-surface-300">Trigger Timestamp:</strong>{' '}
                        {new Date(alert.createdAt).toLocaleString()}
                      </p>
                      {alert.resolved && alert.resolvedAt && (
                        <p>
                          <strong className="text-surface-300">Resolution Timestamp:</strong>{' '}
                          {new Date(alert.resolvedAt).toLocaleString()}
                        </p>
                      )}
                    </div>

                    {!alert.resolved && (
                      <button
                        onClick={() => handleResolve(alert.id)}
                        disabled={resolvingId === alert.id}
                        className="btn btn--primary text-xs py-2 px-4 whitespace-nowrap self-end md:self-center bg-danger-500/20 text-danger-400 border border-danger-500/30 hover:bg-danger-500 hover:text-white"
                      >
                        {resolvingId === alert.id ? 'Resolving...' : '🔧 Mark as Resolved'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AlertsPage;
