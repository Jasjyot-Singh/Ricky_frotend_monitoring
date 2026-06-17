import React, { useState, useEffect } from 'react';
import { useDeviceList } from '../store/useFleetStore';
import { api } from '../lib/api';
import type { LocationPoint } from '../types/fleet.types';

interface LogPoint {
  timestamp: string;
  charging: boolean;
}

interface ImpressionResult {
  impressions: Record<string, number>;
  timeline: {
    start: string;
    end: string;
    state: 'charging' | 'screen_off' | 'device_off';
    duration: number;
  }[];
  totalPlaytime: number;
  totalOffTime: number;
  totalDeviceOffTime: number;
}

const DEFAULT_PLAYLIST = [
  'Coca-Cola Summer Splash (15s)',
  'Samsung Galaxy S26 Ultra (15s)',
  'Nike - Run Your Way (15s)',
  'McDonalds Crispy Chicken Meal (15s)',
  'Netflix Stranger Things Season 5 (15s)',
  'Spotify Premium - No Ads (15s)',
];

const SAMPLE_JSON_LOGS: LogPoint[] = (() => {
  const points: LogPoint[] = [];
  const startHour = 9; // 09:00 AM
  const dateStr = '2026-06-14';

  let currentSec = startHour * 3600;
  const endSec = 18 * 3600; // 06:00 PM

  while (currentSec < endSec) {
    const currentHour = Math.floor(currentSec / 3600);
    const currentMin = Math.floor((currentSec % 3600) / 60);
    const secs = currentSec % 60;

    const timeString = `${dateStr}T${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}:${String(secs).padStart(2, '0')}Z`;

    // 1. Simulate a device switch-off (gap > 5 minutes) from 12:00 PM to 12:35 PM
    if (currentHour === 12 && currentMin < 35) {
      currentSec += 30;
      continue; // Skip logs during off time
    }

    // 2. Simulate screen off (no charging) from 02:00 PM to 02:45 PM
    let isCharging = true;
    if (currentHour === 14 && currentMin < 45) {
      isCharging = false;
    }

    points.push({
      timestamp: timeString,
      charging: isCharging,
    });

    currentSec += 30; // Telemetry ping every 30 seconds
  }
  return points;
})();

export function calculateAdImpressions(
  playlist: string[],
  logs: LogPoint[],
  adDuration: number = 15,
  offlineThreshold: number = 300
): ImpressionResult {
  if (playlist.length === 0 || logs.length === 0) {
    return {
      impressions: {},
      timeline: [],
      totalPlaytime: 0,
      totalOffTime: 0,
      totalDeviceOffTime: 0,
    };
  }

  const sortedLogs = [...logs].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const impressions: Record<string, number> = {};
  playlist.forEach((ad) => {
    impressions[ad] = 0;
  });

  let currentAdIndex = 0;
  let secondsPlayedInCurrentAd = 0;

  let totalPlaytime = 0;
  let totalOffTime = 0;
  let totalDeviceOffTime = 0;

  const timelineEvents: ImpressionResult['timeline'] = [];

  for (let i = 0; i < sortedLogs.length - 1; i++) {
    const currentLog = sortedLogs[i];
    const nextLog = sortedLogs[i + 1];

    const tStart = new Date(currentLog.timestamp).getTime();
    const tEnd = new Date(nextLog.timestamp).getTime();
    const durationSeconds = Math.max(0, Math.floor((tEnd - tStart) / 1000));

    if (durationSeconds <= 0) continue;

    if (durationSeconds > offlineThreshold) {
      // Device Switched Off
      totalDeviceOffTime += durationSeconds;
      timelineEvents.push({
        start: currentLog.timestamp,
        end: nextLog.timestamp,
        state: 'device_off',
        duration: durationSeconds,
      });

      // Reset playlist pointer
      currentAdIndex = 0;
      secondsPlayedInCurrentAd = 0;
    } else {
      const isCharging = currentLog.charging;
      if (isCharging) {
        // Screen On (Charging)
        totalPlaytime += durationSeconds;
        timelineEvents.push({
          start: currentLog.timestamp,
          end: nextLog.timestamp,
          state: 'charging',
          duration: durationSeconds,
        });

        let remainingDuration = durationSeconds;
        const secondsToFinish = adDuration - secondsPlayedInCurrentAd;
        if (remainingDuration < secondsToFinish) {
          secondsPlayedInCurrentAd += remainingDuration;
        } else {
          impressions[playlist[currentAdIndex]] = (impressions[playlist[currentAdIndex]] || 0) + 1;
          remainingDuration -= secondsToFinish;
          currentAdIndex = (currentAdIndex + 1) % playlist.length;
          secondsPlayedInCurrentAd = 0;

          const fullAdsCount = Math.floor(remainingDuration / adDuration);
          for (let k = 0; k < fullAdsCount; k++) {
            const adName = playlist[currentAdIndex];
            impressions[adName] = (impressions[adName] || 0) + 1;
            currentAdIndex = (currentAdIndex + 1) % playlist.length;
          }
          secondsPlayedInCurrentAd = remainingDuration % adDuration;
        }
      } else {
        // Screen Off (Not Charging)
        totalOffTime += durationSeconds;
        timelineEvents.push({
          start: currentLog.timestamp,
          end: nextLog.timestamp,
          state: 'screen_off',
          duration: durationSeconds,
        });

        let remainingDuration = durationSeconds;
        const secondsToFinish = adDuration - secondsPlayedInCurrentAd;
        if (remainingDuration < secondsToFinish) {
          secondsPlayedInCurrentAd += remainingDuration;
        } else {
          remainingDuration -= secondsToFinish;
          currentAdIndex = (currentAdIndex + 1) % playlist.length;
          secondsPlayedInCurrentAd = 0;

          const fullAdsCount = Math.floor(remainingDuration / adDuration);
          currentAdIndex = (currentAdIndex + fullAdsCount) % playlist.length;
          secondsPlayedInCurrentAd = remainingDuration % adDuration;
        }
      }
    }
  }

  return {
    impressions,
    timeline: timelineEvents,
    totalPlaytime,
    totalOffTime,
    totalDeviceOffTime,
  };
}

const ImpressionCalculatorPage: React.FC = () => {
  const devices = useDeviceList();
  const [playlist, setPlaylist] = useState<string[]>(() => {
    const saved = localStorage.getItem('ricky_ad_playlist');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        // Fallback on parse error
      }
    }
    return DEFAULT_PLAYLIST;
  });

  useEffect(() => {
    localStorage.setItem('ricky_ad_playlist', JSON.stringify(playlist));
  }, [playlist]);

  const [newAdName, setNewAdName] = useState('');
  
  const [selectedDevice, setSelectedDevice] = useState(devices[0]?.deviceId || '');
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const [mode, setMode] = useState<'simulation' | 'real_telemetry'>('simulation');
  const [jsonInput, setJsonInput] = useState<string>(() => JSON.stringify(SAMPLE_JSON_LOGS, null, 2));
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ImpressionResult | null>(null);

  const handleAddAd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdName.trim()) return;
    setPlaylist([...playlist, newAdName.trim()]);
    setNewAdName('');
  };

  const handleRemoveAd = (index: number) => {
    const copy = [...playlist];
    copy.splice(index, 1);
    setPlaylist(copy);
  };

  const handleMoveAd = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === playlist.length - 1) return;
    
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const copy = [...playlist];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;
    setPlaylist(copy);
  };

  const handleLoadSample = () => {
    setJsonInput(JSON.stringify(SAMPLE_JSON_LOGS, null, 2));
    setError(null);
  };

  const handleCalculate = async () => {
    if (playlist.length === 0) {
      setError('Please add at least one ad to the playlist.');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      if (mode === 'simulation') {
        const parsedLogs = JSON.parse(jsonInput);
        if (!Array.isArray(parsedLogs)) {
          throw new Error('JSON input must be a list of telemetry logs.');
        }
        for (const log of parsedLogs) {
          if (!log.timestamp || typeof log.charging !== 'boolean') {
            throw new Error('Each telemetry log point must have a "timestamp" and a "charging" boolean.');
          }
        }
        const calcRes = calculateAdImpressions(playlist, parsedLogs);
        setResults(calcRes);
      } else {
        // Real Telemetry Mode
        const from = `${selectedDate}T00:00:00`;
        const to = `${selectedDate}T23:59:59`;
        
        // Fetch location history routes
        const routes = await api.getRouteHistory(selectedDevice, from, to);
        if (!routes || routes.length === 0) {
          throw new Error('No telemetry logs found for the selected device and date.');
        }

        // Map location points to telemetry log points with simulated charging
        // Since routes don't contain charging, let's create a simulated profile where
        // we assume the screen is charging (ON) if vehicle speed > 0 or during typical active hours.
        const mappedLogs: LogPoint[] = routes.map((pt: LocationPoint) => {
          const ptTime = new Date(pt.timestamp);
          const hour = ptTime.getHours();
          
          // Let's simulate: screen is on (charging) if speed is greater than 2 km/h
          // or if it falls into standard morning/afternoon service hours
          const isCharging = (pt.speed !== null && pt.speed > 2) || (hour >= 9 && hour <= 12) || (hour >= 15 && hour <= 18);
          
          return {
            timestamp: pt.timestamp,
            charging: isCharging,
          };
        });

        const calcRes = calculateAdImpressions(playlist, mappedLogs);
        setResults(calcRes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse JSON logs.');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-white">Digital Signage Ad Impression Calculator</h1>
        <p className="text-sm text-surface-400 mt-1">
          Calculate verified ad impressions by cross-referencing telemetry logs, screen status (charging rule), and device downtime.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Playlist Editor */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card p-5 border border-surface-700/50">
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <span>📋</span> Ad Playlist Order
            </h2>
            
            <form onSubmit={handleAddAd} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Ad name or ID..."
                value={newAdName}
                onChange={(e) => setNewAdName(e.target.value)}
                className="flex-1 bg-surface-950 border border-surface-800 rounded-lg px-3 py-1.5 text-xs text-surface-200 focus:outline-none focus:border-fleet-500 transition-colors"
              />
              <button
                type="submit"
                className="btn bg-fleet-500 hover:bg-fleet-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold"
              >
                Add Slot
              </button>
            </form>

            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {playlist.map((ad, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 bg-surface-950 border border-surface-800/80 rounded-lg text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-surface-500 font-mono w-5">#{idx + 1}</span>
                    <span className="text-surface-200 truncate font-medium">{ad}</span>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    <button
                      onClick={() => handleMoveAd(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1 text-surface-400 hover:text-surface-200 disabled:opacity-30 disabled:hover:text-surface-400 transition-colors"
                      title="Move Up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => handleMoveAd(idx, 'down')}
                      disabled={idx === playlist.length - 1}
                      className="p-1 text-surface-400 hover:text-surface-200 disabled:opacity-30 disabled:hover:text-surface-400 transition-colors"
                      title="Move Down"
                    >
                      ▼
                    </button>
                    <button
                      onClick={() => handleRemoveAd(idx)}
                      className="p-1 text-danger-400 hover:text-danger-300 font-bold ml-1 transition-colors"
                      title="Remove ad"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              {playlist.length === 0 && (
                <p className="text-center py-6 text-xs text-surface-500">Playlist is empty. Add ads above.</p>
              )}
            </div>
            <p className="text-[10px] text-surface-500 mt-4 leading-relaxed bg-surface-950/50 p-2.5 rounded-lg border border-surface-800/40">
              💡 <strong>Note:</strong> Ads play in a continuous loop in the exact slot order shown. Each slot lasts exactly <strong>15 seconds</strong>. If the device restarts, it plays from #1.
            </p>
          </div>
        </div>

        {/* Right Columns: Calculator Configuration and Input */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-5 border border-surface-700/50">
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <span>⚙️</span> Calculator Configuration
            </h2>

            {/* Mode Tabs */}
            <div className="flex border-b border-surface-800 mb-5">
              <button
                onClick={() => { setMode('simulation'); setResults(null); }}
                className={`pb-2 px-4 text-xs font-semibold border-b-2 transition-all ${
                  mode === 'simulation'
                    ? 'border-fleet-500 text-fleet-400'
                    : 'border-transparent text-surface-400 hover:text-surface-200'
                }`}
              >
                💡 Telemetry Log Simulator (Developer mode)
              </button>
              <button
                onClick={() => { setMode('real_telemetry'); setResults(null); }}
                className={`pb-2 px-4 text-xs font-semibold border-b-2 transition-all ${
                  mode === 'real_telemetry'
                    ? 'border-fleet-500 text-fleet-400'
                    : 'border-transparent text-surface-400 hover:text-surface-200'
                }`}
              >
                🛰️ Real Device Telemetry
              </button>
            </div>

            {mode === 'simulation' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-surface-300">
                    Paste Telemetry Logs JSON Array:
                  </label>
                  <button
                    onClick={handleLoadSample}
                    className="text-xs text-fleet-400 hover:text-fleet-300 font-medium underline transition-all"
                  >
                    Reset to Default Simulator Data
                  </button>
                </div>
                <textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder='[ { "timestamp": "2026-06-14T09:00:00Z", "charging": true } ]'
                  rows={8}
                  className="w-full bg-surface-950 border border-surface-800 rounded-xl p-3 text-xs font-mono text-fleet-400 focus:outline-none focus:border-fleet-500 transition-colors"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-surface-400 mb-1.5">
                    Select Device
                  </label>
                  <select
                    value={selectedDevice}
                    onChange={(e) => setSelectedDevice(e.target.value)}
                    className="w-full bg-surface-950 border border-surface-800 rounded-lg px-3 py-2 text-xs text-surface-200 focus:outline-none focus:border-fleet-500"
                  >
                    {devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.deviceId} ({d.vehicleNumber})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-400 mb-1.5">
                    Select Date
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full bg-surface-950 border border-surface-800 rounded-lg px-3 py-2 text-xs text-surface-200 focus:outline-none focus:border-fleet-500"
                  />
                </div>
                <div className="md:col-span-2 bg-surface-950/50 p-3 rounded-lg border border-surface-800/40 text-[10px] text-surface-500 leading-relaxed">
                  ℹ️ <strong>Charging Status Logic:</strong> Because route breadcrumbs do not contain battery parameters, the calculator simulates charging intervals. Screen is considered <strong>ON (Charging)</strong> during typical operation hours (09:00 AM–12:00 PM and 03:00 PM–06:00 PM) or when speed exceeds 2 km/h. During other times, the screen is considered <strong>OFF</strong>.
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 bg-danger-500/10 border border-danger-500/20 text-danger-400 p-3 rounded-lg text-xs font-medium">
                ⚠️ {error}
              </div>
            )}

            <button
              onClick={handleCalculate}
              disabled={loading}
              className={`w-full btn mt-5 bg-fleet-500 hover:bg-fleet-600 text-white font-semibold text-xs py-2.5 rounded-xl shadow-lg shadow-fleet-500/20 transition-all ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'Processing Logs...' : 'Calculate Impressions'}
            </button>
          </div>

          {/* Results Section */}
          {results && (
            <div className="glass-card p-5 border border-surface-700/50 space-y-6 animate-fade-in">
              <h2 className="text-base font-semibold text-white flex items-center gap-2 border-b border-surface-800 pb-3">
                <span>📊</span> Verification Results
              </h2>

              {/* High-level stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-surface-950 p-4 rounded-xl border border-surface-800">
                  <span className="text-surface-500 text-[10px] uppercase font-bold block mb-1">
                    Playtime (Screen On)
                  </span>
                  <span className="text-fleet-400 font-bold font-mono text-base">
                    {formatDuration(results.totalPlaytime)}
                  </span>
                  <span className="text-[10px] text-surface-500 block mt-1">
                    Charging &amp; counting impressions
                  </span>
                </div>
                <div className="bg-surface-950 p-4 rounded-xl border border-surface-800">
                  <span className="text-surface-500 text-[10px] uppercase font-bold block mb-1">
                    Screen Off (Skipped)
                  </span>
                  <span className="text-warning-400 font-bold font-mono text-base">
                    {formatDuration(results.totalOffTime)}
                  </span>
                  <span className="text-[10px] text-surface-500 block mt-1">
                    Not charging &amp; ads skipped
                  </span>
                </div>
                <div className="bg-surface-950 p-4 rounded-xl border border-surface-800">
                  <span className="text-surface-500 text-[10px] uppercase font-bold block mb-1">
                    Device Off Downtime
                  </span>
                  <span className="text-danger-400 font-bold font-mono text-base">
                    {formatDuration(results.totalDeviceOffTime)}
                  </span>
                  <span className="text-[10px] text-surface-500 block mt-1">
                    Gaps &gt; 5m (resets playlist)
                  </span>
                </div>
              </div>

              {/* Visual Timeline Bar */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-surface-300 block">
                  Timeline Segment Breakdown
                </label>
                <div className="h-4 w-full rounded-full bg-surface-950 overflow-hidden flex border border-surface-800">
                  {results.timeline.map((item, idx) => {
                    const totalSec = results.totalPlaytime + results.totalOffTime + results.totalDeviceOffTime;
                    const percent = totalSec > 0 ? (item.duration / totalSec) * 100 : 0;
                    if (percent <= 0) return null;

                    const colorMap = {
                      charging: 'bg-fleet-500',
                      screen_off: 'bg-warning-500/60',
                      device_off: 'bg-danger-500/30',
                    };

                    const titleMap = {
                      charging: 'Screen On (Charging)',
                      screen_off: 'Screen Off (Not Charging)',
                      device_off: 'Device Off (Downtime)',
                    };

                    return (
                      <div
                        key={idx}
                        className={`${colorMap[item.state]} h-full transition-all`}
                        style={{ width: `${percent}%` }}
                        title={`${titleMap[item.state]}: ${formatDuration(item.duration)}`}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-4 justify-center text-[10px] text-surface-400 font-medium">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-fleet-500 inline-block" />
                    <span>Screen On (Charging)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-warning-500/60 inline-block" />
                    <span>Screen Off (Not Charging)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-danger-500/30 inline-block" />
                    <span>Device Off (Gaps &gt; 5m)</span>
                  </div>
                </div>
              </div>

              {/* Impressions Table */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-surface-300 block">
                  Verified Ad Impression Table
                </label>
                <div className="border border-surface-800 rounded-xl overflow-hidden bg-surface-950">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-surface-800 bg-surface-900/50 text-surface-400 font-medium font-mono text-[10px] uppercase">
                        <th className="p-3 w-16">Slot</th>
                        <th className="p-3">Ad Name</th>
                        <th className="p-3 text-right">Impressions Count</th>
                        <th className="p-3 text-right">Visibility Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-800/40">
                      {playlist.map((ad, idx) => {
                        const count = results.impressions[ad] || 0;
                        return (
                          <tr key={idx} className="hover:bg-surface-900/30 transition-colors">
                            <td className="p-3 font-mono text-surface-500 font-bold">#{idx + 1}</td>
                            <td className="p-3 font-medium text-surface-200">{ad}</td>
                            <td className="p-3 text-right font-mono font-bold text-fleet-400">
                              {count.toLocaleString()}
                            </td>
                            <td className="p-3 text-right font-mono text-surface-400">
                              {formatDuration(count * 15)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImpressionCalculatorPage;
