import React, { useState, useEffect, useMemo } from 'react';
import { useFleetStore } from '../store/useFleetStore';
import { api } from '../lib/api';

interface LogPoint {
  timestamp: string;
  charging: boolean;
}

interface TimelineSegment {
  start: string;
  end: string;
  type: 'ON' | 'OFF' | 'OFFLINE';
  duration: number; // in seconds
}

export default function CalculatorPage() {
  const devices = useFleetStore((state) => Object.values(state.devices));
  
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const [playlist, setPlaylist] = useState<string[]>(() => {
    const saved = localStorage.getItem('ricky_playlist_template');
    return saved ? JSON.parse(saved) : ['Adidas Prime Ad', 'Coca-Cola Zero Ad', 'Samsung Ultra Ad', 'Netflix Premium Ad'];
  });
  
  const [newAdName, setNewAdName] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogPoint[]>([]);
  const [calculated, setCalculated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set initial device if available
  useEffect(() => {
    if (devices.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(devices[0].deviceId);
    }
  }, [devices, selectedDeviceId]);

  // Save playlist template to localStorage
  const savePlaylistTemplate = () => {
    localStorage.setItem('ricky_playlist_template', JSON.stringify(playlist));
    alert('Playlist template saved successfully!');
  };

  const addAd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdName.trim()) return;
    setPlaylist([...playlist, newAdName.trim()]);
    setNewAdName('');
  };

  const removeAd = (index: number) => {
    const updated = [...playlist];
    updated.splice(index, 1);
    setPlaylist(updated);
  };

  const moveAd = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === playlist.length - 1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...playlist];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setPlaylist(updated);
  };

  // Perform Calculation
  const handleCalculate = async () => {
    if (!selectedDeviceId) {
      setError('Please select a device first.');
      return;
    }
    setLoading(true);
    setError(null);
    setCalculated(false);

    try {
      const fromDate = `${selectedDate}T00:00:00`;
      const toDate = `${selectedDate}T23:59:59`;
      const fetchedLogs = await api.getTelemetryLogs(selectedDeviceId, fromDate, toDate);
      setLogs(fetchedLogs);
      setCalculated(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch telemetry logs for the selected date.');
    } finally {
      setLoading(false);
    }
  };

  // Run business logic calculations
  const results = useMemo(() => {
    if (!calculated || logs.length === 0 || playlist.length === 0) {
      return {
        impressions: {} as Record<string, number>,
        adPlaytimes: {} as Record<string, number>,
        totalOnDuration: 0,
        totalOffDuration: 0,
        totalOfflineDuration: 0,
        totalLoops: 0,
        totalImpressions: 0,
        timelineSegments: [] as TimelineSegment[]
      };
    }

    const impressions: Record<string, number> = {};
    const adPlaytimes: Record<string, number> = {};
    for (const ad of playlist) {
      impressions[ad] = 0;
      adPlaytimes[ad] = 0;
    }

    // Sort logs chronologically
    const sortedLogs = [...logs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let currentAdIndex = 0;
    let carryOverSeconds = 0;

    let totalOnDuration = 0;
    let totalOffDuration = 0;
    let totalOfflineDuration = 0;
    let totalLoops = 0;
    let totalImpressions = 0;

    const timelineSegments: TimelineSegment[] = [];
    const addSegment = (start: string, end: string, type: 'ON' | 'OFF' | 'OFFLINE') => {
      const sTime = new Date(start).getTime();
      const eTime = new Date(end).getTime();
      const duration = Math.max(0, (eTime - sTime) / 1000);
      if (duration > 0 || start === end) {
        timelineSegments.push({ start, end, type, duration });
      }
    };

    let i = 0;
    while (i < sortedLogs.length) {
      const startLog = sortedLogs[i];
      const currentCharging = startLog.charging;
      const segmentStart = startLog.timestamp;
      let segmentEnd = startLog.timestamp;

      let j = i + 1;
      while (j < sortedLogs.length) {
        const prevLog = sortedLogs[j - 1];
        const nextLog = sortedLogs[j];

        const gapMs = new Date(nextLog.timestamp).getTime() - new Date(prevLog.timestamp).getTime();
        
        // 5-minute telemetry gap indicates complete device shutoff
        if (gapMs >= 5 * 60 * 1000) {
          break;
        }

        // Charging status change indicates screen turned on/off
        if (nextLog.charging !== currentCharging) {
          break;
        }

        segmentEnd = nextLog.timestamp;
        j++;
      }

      const segmentType = currentCharging ? 'ON' : 'OFF';
      addSegment(segmentStart, segmentEnd, segmentType);

      const sTime = new Date(segmentStart).getTime();
      const eTime = new Date(segmentEnd).getTime();
      const durationSeconds = (eTime - sTime) / 1000;

      if (segmentType === 'ON') {
        totalOnDuration += durationSeconds;

        let remainingTime = durationSeconds + carryOverSeconds;
        while (remainingTime >= 15) {
          const ad = playlist[currentAdIndex];
          if (ad !== undefined) {
            impressions[ad] = (impressions[ad] || 0) + 1;
            adPlaytimes[ad] = (adPlaytimes[ad] || 0) + 15;
            totalImpressions++;
          }

          currentAdIndex++;
          if (currentAdIndex >= playlist.length) {
            currentAdIndex = 0;
            totalLoops++;
          }
          remainingTime -= 15;
        }
        carryOverSeconds = remainingTime;
      } else {
        totalOffDuration += durationSeconds;

        // Screen is OFF, calculate skipped ads during this offline duration
        const remainingTime = durationSeconds + carryOverSeconds;
        const skippedAds = Math.floor(remainingTime / 15);
        if (skippedAds > 0) {
          currentAdIndex = (currentAdIndex + skippedAds) % playlist.length;
        }
        carryOverSeconds = remainingTime % 15;
      }

      // Check gap between current segment end and next log timestamp
      if (j < sortedLogs.length) {
        const gapStart = segmentEnd;
        const gapEnd = sortedLogs[j].timestamp;
        const gapMs = new Date(gapEnd).getTime() - new Date(gapStart).getTime();

        if (gapMs >= 5 * 60 * 1000) {
          addSegment(gapStart, gapEnd, 'OFFLINE');
          totalOfflineDuration += gapMs / 1000;

          // Power cycle resets playlist index back to 0
          currentAdIndex = 0;
          carryOverSeconds = 0;
        }
      }

      i = j;
    }

    return {
      impressions,
      adPlaytimes,
      totalOnDuration,
      totalOffDuration,
      totalOfflineDuration,
      totalLoops,
      totalImpressions,
      timelineSegments
    };
  }, [calculated, logs, playlist]);

  // Utility to format seconds to human-readable time
  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    const parts = [];
    if (hrs > 0) parts.push(`${hrs}h`);
    if (mins > 0) parts.push(`${mins}m`);
    parts.push(`${secs}s`);
    return parts.join(' ');
  };

  // Copy proof of play report to clipboard
  const copyReportToClipboard = () => {
    const selectedDevice = devices.find((d) => d.deviceId === selectedDeviceId);
    const label = selectedDevice ? `${selectedDevice.vehicleNumber} (${selectedDevice.deviceId})` : selectedDeviceId;

    let text = `========================================\n`;
    text += `PROOF OF PLAY & AD IMPRESSION REPORT\n`;
    text += `========================================\n`;
    text += `Device: ${label}\n`;
    text += `Date: ${selectedDate}\n`;
    text += `Generated At: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)\n\n`;
    text += `SUMMARY METRICS:\n`;
    text += `- Active Screen Playing Time (Charging): ${formatDuration(results.totalOnDuration)}\n`;
    text += `- Screen Idle Time (On Battery): ${formatDuration(results.totalOffDuration)}\n`;
    text += `- Offline/Power Down Time: ${formatDuration(results.totalOfflineDuration)}\n`;
    text += `- Total Ad Playback Loops Completed: ${results.totalLoops}\n`;
    text += `- Total Impressions Logged: ${results.totalImpressions}\n\n`;
    text += `PLAYLIST SEQUENCE BREAKDOWN:\n`;
    playlist.forEach((ad, idx) => {
      const count = results.impressions[ad] || 0;
      const playTime = results.adPlaytimes[ad] || 0;
      text += `${idx + 1}. ${ad}: ${count} impressions (${formatDuration(playTime)})\n`;
    });
    text += `========================================\n`;

    navigator.clipboard.writeText(text);
    alert('Report copied to clipboard! You can now paste it directly into WhatsApp, Slack, or Email.');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Impression Calculator</h1>
        <p className="text-sm text-surface-400 mt-1">
          Calculate verified screen play impressions for brands based on battery charging telemetry
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Panel: Configuration */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Form parameters */}
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Calculation Parameters</h2>
            
            <div className="space-y-2">
              <label className="text-xs font-medium text-surface-400 uppercase tracking-wider">Select Device</label>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-fleet-500"
              >
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.vehicleNumber} ({d.deviceId})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-surface-400 uppercase tracking-wider">Select Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-fleet-500"
              />
            </div>

            <button
              onClick={handleCalculate}
              disabled={loading || !selectedDeviceId}
              className="w-full btn btn--primary py-3"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing Logs...
                </span>
              ) : (
                'Calculate Impressions'
              )}
            </button>
          </div>

          {/* Playlist Manager */}
          <div className="glass-card p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">Playlist Slot (15s)</h2>
              <button
                onClick={savePlaylistTemplate}
                className="text-xs text-fleet-400 hover:text-fleet-300 font-semibold"
              >
                Save Template
              </button>
            </div>

            <form onSubmit={addAd} className="flex gap-2">
              <input
                type="text"
                value={newAdName}
                onChange={(e) => setNewAdName(e.target.value)}
                placeholder="Add Ad Name (e.g. Nike Ad)"
                className="flex-1 bg-surface-800 border border-surface-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-fleet-500"
              />
              <button type="submit" className="btn btn--primary px-3 py-2 text-xs">
                Add
              </button>
            </form>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {playlist.map((ad, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-surface-800/50 border border-surface-700/30 p-2.5 rounded-xl text-xs"
                >
                  <span className="truncate max-w-[140px] text-surface-200 font-medium">
                    {idx + 1}. {ad}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => moveAd(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1 text-surface-400 hover:text-white disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveAd(idx, 'down')}
                      disabled={idx === playlist.length - 1}
                      className="p-1 text-surface-400 hover:text-white disabled:opacity-30"
                    >
                      ▼
                    </button>
                    <button
                      onClick={() => removeAd(idx)}
                      className="p-1 text-danger-400 hover:text-danger-300 ml-1"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              {playlist.length === 0 && (
                <p className="text-xs text-center text-surface-500 py-4">No ads in the playlist slots.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Results & Visualization */}
        <div className="lg:col-span-2 space-y-6">
          {error && (
            <div className="bg-danger-500/10 border border-danger-500/20 text-danger-400 p-4 rounded-xl text-sm">
              {error}
            </div>
          )}

          {!calculated && !loading && (
            <div className="glass-card p-12 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto text-surface-400">
                📊
              </div>
              <h3 className="text-lg font-semibold text-white">No Calculation Made</h3>
              <p className="text-sm text-surface-400 max-w-md mx-auto">
                Select a device and select the date for which you want to calculate active ad impressions, then click calculate.
              </p>
            </div>
          )}

          {calculated && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-card p-4 space-y-1">
                  <p className="text-xs text-surface-400 uppercase tracking-wider">Screen ON Time</p>
                  <p className="text-xl font-bold text-fleet-400">{formatDuration(results.totalOnDuration)}</p>
                  <p className="text-[10px] text-surface-500">Charging active</p>
                </div>
                <div className="glass-card p-4 space-y-1">
                  <p className="text-xs text-surface-400 uppercase tracking-wider">Screen OFF Time</p>
                  <p className="text-xl font-bold text-warning-400">{formatDuration(results.totalOffDuration)}</p>
                  <p className="text-[10px] text-surface-500">On Battery / Idle</p>
                </div>
                <div className="glass-card p-4 space-y-1">
                  <p className="text-xs text-surface-400 uppercase tracking-wider">Offline Time</p>
                  <p className="text-xl font-bold text-surface-400">{formatDuration(results.totalOfflineDuration)}</p>
                  <p className="text-[10px] text-surface-500">Shut down/No logs</p>
                </div>
                <div className="glass-card p-4 space-y-1">
                  <p className="text-xs text-surface-400 uppercase tracking-wider">Total Impressions</p>
                  <p className="text-xl font-bold text-white">{results.totalImpressions}</p>
                  <p className="text-[10px] text-fleet-400">{results.totalLoops} Full Loops</p>
                </div>
              </div>

              {/* Timeline Visualizer */}
              <div className="glass-card p-6 space-y-3">
                <h3 className="text-sm font-semibold text-white">Daily Screen Activity Timeline</h3>
                
                {results.timelineSegments.length > 0 ? (
                  <div className="space-y-4">
                    {/* Visual Segment bar */}
                    <div className="w-full h-8 rounded-xl overflow-hidden flex bg-surface-800 border border-surface-700/50">
                      {results.timelineSegments.map((seg, idx) => {
                        const totalDuration = results.totalOnDuration + results.totalOffDuration + results.totalOfflineDuration;
                        const pct = totalDuration > 0 ? (seg.duration / totalDuration) * 100 : 100 / results.timelineSegments.length;
                        
                        let colorClass = 'bg-surface-600'; // OFFLINE
                        let titleText = `Offline: ${formatDuration(seg.duration)}`;
                        if (seg.type === 'ON') {
                          colorClass = 'bg-fleet-500';
                          titleText = `Screen ON (Charging): ${formatDuration(seg.duration)}`;
                        } else if (seg.type === 'OFF') {
                          colorClass = 'bg-warning-500/70';
                          titleText = `Screen OFF (Battery): ${formatDuration(seg.duration)}`;
                        }

                        return (
                          <div
                            key={idx}
                            style={{ width: `${pct}%` }}
                            className={`${colorClass} h-full border-r border-surface-950/20 hover:brightness-110 transition-all cursor-pointer`}
                            title={titleText}
                          />
                        );
                      })}
                    </div>

                    {/* Timeline Legend */}
                    <div className="flex flex-wrap gap-4 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-fleet-500 inline-block" />
                        <span className="text-surface-300">Screen ON & Recording Impressions</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-warning-500/70 inline-block" />
                        <span className="text-surface-300">Screen OFF (Discharging/Skipped)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-surface-600 inline-block" />
                        <span className="text-surface-300">Device Offline (Shutdown)</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-surface-500 py-2">No activity segments detected in logs.</p>
                )}
              </div>

              {/* Verified Impression Table */}
              <div className="glass-card p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-white">Verified Brand Play Breakdown</h3>
                  <button
                    onClick={copyReportToClipboard}
                    className="btn btn--ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
                  >
                    <span>📋</span> Copy Report
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-surface-700 text-surface-400">
                        <th className="py-3 font-semibold">Ad Slot / Brand Name</th>
                        <th className="py-3 font-semibold">Verified Impressions</th>
                        <th className="py-3 font-semibold">Total Display Time</th>
                        <th className="py-3 font-semibold">Share of Voice</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-800/40">
                      {playlist.map((ad) => {
                        const count = results.impressions[ad] || 0;
                        const displaySecs = results.adPlaytimes[ad] || 0;
                        const pct = results.totalImpressions > 0 ? (count / results.totalImpressions) * 100 : 0;
                        
                        return (
                          <tr key={ad} className="text-surface-200">
                            <td className="py-3.5 font-medium">{ad}</td>
                            <td className="py-3.5 font-bold text-white">{count}</td>
                            <td className="py-3.5">{formatDuration(displaySecs)}</td>
                            <td className="py-3.5">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold w-10">{pct.toFixed(1)}%</span>
                                <div className="w-24 h-1.5 bg-surface-800 rounded-full overflow-hidden">
                                  <div
                                    style={{ width: `${pct}%` }}
                                    className="bg-fleet-500 h-full rounded-full"
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

        </div>

      </div>
    </div>
  );
}
