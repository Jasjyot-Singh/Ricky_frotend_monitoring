import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useDevice, useFleetStore } from '../store/useFleetStore';
import { getMarkerState, MARKER_COLORS } from '../types/fleet.types';
import type { LocationPoint, CommandType, DeviceDetailResponse, DeviceCommand } from '../types/fleet.types';
import { api } from '../lib/api';
import StatusBadge from '../components/fleet/StatusBadge';
import SystemHealthCharts from '../components/device/SystemHealthCharts';
import SosHistory from '../components/device/SosHistory';
import RemoteAccessPanel from '../components/device/RemoteAccessPanel';

function createDetailMarkerIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="position: relative; width: 40px; height: 40px;">
        <div style="
          position: absolute; inset: 0;
          background: ${color};
          border-radius: 50%;
          opacity: 0.25;
          animation: pulse 2s ease-in-out infinite;
        "></div>
        <div style="
          position: absolute; inset: 6px;
          background: ${color};
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 12px ${color}80;
        "></div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

const AVAILABLE_COMMANDS: { value: CommandType; label: string; icon: string }[] = [
  { value: 'RESET_SOS', label: 'Close SOS', icon: '🟢' },
  { value: 'REBOOT_DEVICE', label: 'Reboot Device', icon: '⚡' },
  { value: 'RESTART_PI', label: 'Restart Pi', icon: '🔄' },
  { value: 'FORCE_GPS_PING', label: 'Force GPS Ping', icon: '🛰' },
];

const DevicePage: React.FC = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const device = useDevice(deviceId || '');
  const [deviceDetail, setDeviceDetail] = useState<DeviceDetailResponse | null>(null);
  const [commandHistory, setCommandHistory] = useState<DeviceCommand[]>([]);
  const [locationHistory, setLocationHistory] = useState<LocationPoint[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sendingCommand, setSendingCommand] = useState(false);
  const [commandStatus, setCommandStatus] = useState<string | null>(null);
  const [secondsSinceLastSeen, setSecondsSinceLastSeen] = useState<number | null>(null);

  const serverClockOffset = useFleetStore((s) => s.serverClockOffset);

  // Monitor freshness against local laptop system clock
  useEffect(() => {
    const lastSeenTime = deviceDetail?.liveStatus.lastSeen ?? device.lastSeen;
    if (!lastSeenTime) return;

    const updateTimer = () => {
      let parsedTime = new Date(lastSeenTime).getTime();
      if (typeof lastSeenTime === 'string' && !lastSeenTime.endsWith('Z') && !lastSeenTime.includes('+')) {
        const cleanStr = lastSeenTime.replace(' ', 'T');
        parsedTime = new Date(cleanStr + 'Z').getTime();
      }
      const adjustedNow = Date.now() + serverClockOffset;
      const diffMs = adjustedNow - parsedTime;
      setSecondsSinceLastSeen(Math.max(0, Math.floor(diffMs / 1000)));
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
    return () => clearInterval(timerInterval);
  }, [deviceDetail?.liveStatus.lastSeen, device.lastSeen, serverClockOffset]);

  // Fetch location history once on mount
  useEffect(() => {
    if (!deviceId) return;
    const fetchHistory = async () => {
      try {
        const today = new Date();
        const from = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const to = today.toISOString();
        const data = await api.getRouteHistory(deviceId, from, to);
        setLocationHistory(data.reverse());
      } catch (err) {
        console.error('Failed to fetch location history:', err);
      } finally {
        setLoadingHistory(false);
      }
    };
    fetchHistory();
  }, [deviceId]);

  // Poll for Device Details and Command History every 5 seconds
  useEffect(() => {
    if (!deviceId) return;

    const fetchLiveData = async () => {
      try {
        const [detailData, commandsData] = await Promise.all([
          api.getDevice(deviceId),
          api.getCommandHistory(deviceId),
        ]);
        setDeviceDetail(detailData);
        setCommandHistory(commandsData);
      } catch (err) {
        console.error('Failed to fetch live device details or command history:', err);
      }
    };

    fetchLiveData(); // initial call
    const interval = setInterval(fetchLiveData, 5000);
    return () => clearInterval(interval);
  }, [deviceId]);

  const handleSendCommand = useCallback(async (command: CommandType) => {
    if (!deviceId) return;
    setSendingCommand(true);
    setCommandStatus(null);
    try {
      const res = await api.sendCommand(deviceId, command);
      setCommandStatus(`✅ ${res.message} (ID: ${res.commandId})`);
      // Immediately refresh command history
      const freshCommands = await api.getCommandHistory(deviceId);
      setCommandHistory(freshCommands);
    } catch (err) {
      setCommandStatus(`❌ ${err instanceof Error ? err.message : 'Failed to send command'}`);
    } finally {
      setSendingCommand(false);
      setTimeout(() => setCommandStatus(null), 5000);
    }
  }, [deviceId]);

  if (!device) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="text-6xl">🔍</div>
        <h2 className="text-xl font-semibold text-surface-300">Device not found</h2>
        <p className="text-surface-500">
          Device <span className="font-mono text-fleet-400">{deviceId}</span> is not in the fleet registry.
        </p>
        <Link to="/" className="btn btn--primary">
          ← Back to Fleet
        </Link>
      </div>
    );
  }

  const state = getMarkerState(device, serverClockOffset);
  const color = MARKER_COLORS[state];
  const icon = createDetailMarkerIcon(color);

  const trailPositions: [number, number][] = locationHistory
    .filter((p) => p.latitude && p.longitude)
    .map((p) => [p.latitude, p.longitude]);

  const mapCenter: [number, number] =
    device.latitude !== null && device.longitude !== null
      ? [device.latitude, device.longitude]
      : [19.8762, 75.3433];

  const timeAgo = () => {
    const dateStr = device.lastSeen;
    if (!dateStr) return 'Unknown';
    let parsedTime = new Date(dateStr).getTime();
    if (typeof dateStr === 'string' && !dateStr.endsWith('Z') && !dateStr.includes('+')) {
      const cleanStr = dateStr.replace(' ', 'T');
      parsedTime = new Date(cleanStr + 'Z').getTime();
    }
    const adjustedNow = Date.now() + serverClockOffset;
    const diff = adjustedNow - parsedTime;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  };

  // Get unified variables from local store (ws-driven) or full REST details (database-driven)
  const speed = deviceDetail?.liveStatus.speed ?? device.speed;
  const batteryPct = deviceDetail?.liveStatus.batteryPercentage ?? device.batteryPercentage;
  const batteryVolts = deviceDetail?.liveStatus.batteryVoltage ?? device.batteryVoltage;
  const charging = deviceDetail?.liveStatus.charging ?? device.charging;
  const gpsFix = deviceDetail?.liveStatus.gpsFix ?? device.gpsFix;
  const internetConnected = deviceDetail?.liveStatus.internetConnected ?? device.internetConnected;

  const sys = {
    cpu: deviceDetail?.liveStatus.cpuUsage ?? device.system?.cpu ?? 0,
    ram: deviceDetail?.liveStatus.ramUsage ?? device.system?.ram ?? 0,
    disk: deviceDetail?.liveStatus.diskUsage ?? device.system?.disk ?? 0,
    temp: deviceDetail?.liveStatus.cpuTemperature ?? device.system?.temp ?? 0,
  };



  const imu = {
    accelX: deviceDetail?.liveStatus.imuAccelX ?? device.imu?.accelX ?? null,
    accelY: deviceDetail?.liveStatus.imuAccelY ?? device.imu?.accelY ?? null,
    accelZ: deviceDetail?.liveStatus.imuAccelZ ?? device.imu?.accelZ ?? null,
    gyroX: deviceDetail?.liveStatus.imuGyroX ?? device.imu?.gyroX ?? null,
    gyroY: deviceDetail?.liveStatus.imuGyroY ?? device.imu?.gyroY ?? null,
    gyroZ: deviceDetail?.liveStatus.imuGyroZ ?? device.imu?.gyroZ ?? null,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb + Title */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-surface-500 mb-1">
            <Link to="/" className="hover:text-surface-300 transition-colors">
              Fleet Overview
            </Link>
            <span>/</span>
            <span className="text-surface-300">{device.deviceId}</span>
          </div>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white">{device.deviceId}</h1>
            <StatusBadge state={state} />
          </div>
          <p className="text-sm text-surface-400 mt-1">
            {device.vehicleNumber} · {device.driverName || 'No driver assigned'}
          </p>
        </div>
        <div className="text-right flex flex-col items-end justify-center">
          <p className="text-xs text-surface-500">Telemetry Pulse</p>
          {secondsSinceLastSeen !== null ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${
                secondsSinceLastSeen <= 7 
                  ? 'bg-fleet-400 shadow-[0_0_8px_#10b981]' 
                  : secondsSinceLastSeen <= 15 
                    ? 'bg-warning-400 animate-pulse' 
                    : 'bg-danger-400 animate-pulse'
              }`} />
              <p className={`text-sm font-semibold font-mono ${
                secondsSinceLastSeen <= 7 
                  ? 'text-fleet-400' 
                  : secondsSinceLastSeen <= 15 
                    ? 'text-warning-400' 
                    : 'text-danger-400'
              }`}>
                {secondsSinceLastSeen <= 7 
                  ? `Active (${secondsSinceLastSeen}s ago)` 
                  : secondsSinceLastSeen <= 60 
                    ? `Delayed (${secondsSinceLastSeen}s ago)` 
                    : `${Math.floor(secondsSinceLastSeen / 60)}m ago`
                }
              </p>
            </div>
          ) : (
            <p className="text-sm text-surface-300 font-mono">{timeAgo()}</p>
          )}
          <p className="text-[10px] text-surface-500 mt-0.5">Target: 5s interval</p>
        </div>
      </div>

      {/* Device Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center">
          <p className="text-xs text-surface-500 uppercase tracking-wider">Speed</p>
          <p className="text-2xl font-bold text-white mt-1">
            {speed?.toFixed(1) ?? '—'}
            <span className="text-sm text-surface-400 ml-1">km/h</span>
          </p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-xs text-surface-500 uppercase tracking-wider">Battery</p>
          <div className="flex items-center justify-center gap-2 mt-1">
            <p className={`text-2xl font-bold ${(batteryPct ?? 0) > 50
                ? 'text-fleet-400'
                : (batteryPct ?? 0) > 20
                  ? 'text-warning-400'
                  : 'text-danger-400'
              }`}>
              {batteryPct ?? '—'}%
            </p>
            {charging && <span className="text-xl charging-pulse">⚡</span>}
          </div>
          <p className="text-xs text-surface-500 mt-0.5">{batteryVolts?.toFixed(2) ?? '—'}V</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-xs text-surface-500 uppercase tracking-wider">GPS Status</p>
          <p className={`text-2xl font-bold mt-1 ${gpsFix ? 'text-fleet-400' : 'text-danger-400'}`}>
            {gpsFix ? '🛰 Fixed' : '⚠️ Lost'}
          </p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-xs text-surface-500 uppercase tracking-wider">Internet</p>
          <p className={`text-2xl font-bold mt-1 ${internetConnected ? 'text-fleet-400' : 'text-danger-400'}`}>
            {internetConnected ? '🌐 Online' : '📴 Down'}
          </p>
        </div>
      </div>


      {/* Live Track Map */}
      <div>
        <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-4">
          Live Tracking
          {!loadingHistory && trailPositions.length > 0 && (
            <span className="text-surface-500 font-normal ml-2">
              ({trailPositions.length} points, last 24h)
            </span>
          )}
        </h3>
        <div className="rounded-2xl overflow-hidden h-[400px]">
          <MapContainer
            center={mapCenter}
            zoom={15}
            className="w-full h-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            {/* Location history trail */}
            {trailPositions.length > 1 && (
              <Polyline
                positions={trailPositions}
                pathOptions={{
                  color: '#22c55e',
                  weight: 3,
                  opacity: 0.6,
                  dashArray: '8 4',
                }}
              />
            )}

            {/* Current position marker */}
            {device.latitude !== null && device.longitude !== null && (
              <Marker
                position={[device.latitude, device.longitude]}
                icon={icon}
                eventHandlers={{
                  mouseover: (e) => {
                    e.target.openPopup();
                  },
                  mouseout: (e) => {
                    e.target.closePopup();
                  },
                }}
              >
                <Popup>
                  <div className="min-w-[220px] space-y-3 py-1">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-white text-sm">{device.deviceId}</p>
                        <p className="text-xs text-surface-400">{device.vehicleNumber}</p>
                      </div>
                      <span
                        className={`badge ${
                          state === 'healthy'
                            ? 'badge--success'
                            : state === 'warning'
                            ? 'badge--warning'
                            : state === 'sos'
                            ? 'badge--danger'
                            : 'badge--neutral'
                        }`}
                      >
                        {state.toUpperCase()}
                      </span>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-surface-500">Speed</span>
                        <p className="text-white font-medium">{speed?.toFixed(1) ?? '—'} km/h</p>
                      </div>
                      <div>
                        <span className="text-surface-500">Battery</span>
                        <p className="text-white font-medium">
                          {batteryPct ?? '—'}%
                          {device.charging && ' ⚡'}
                        </p>
                      </div>
                      <div>
                        <span className="text-surface-500">Driver</span>
                        <p className="text-white font-medium">{device.driverName || '—'}</p>
                      </div>
                      <div>
                        <span className="text-surface-500">Last Seen</span>
                        <p className="text-white font-medium">{timeAgo()}</p>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>
        </div>
      </div>

      {/* System Health, IMU, and SOS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SystemHealthCharts
            cpu={sys.cpu}
            ram={sys.ram}
            disk={sys.disk}
            temp={sys.temp}
          />
        </div>

        {/* IMU Telemetry Panel */}
        <div className="glass-card p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-4">
              IMU Sensor Telemetry
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-2">Accelerometer (G-Force)</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-surface-800/50 p-2 rounded-lg border border-surface-700/50">
                    <span className="text-[9px] text-surface-500 font-mono">X-axis</span>
                    <p className="text-xs font-semibold text-white font-mono mt-0.5">
                      {imu.accelX !== null ? imu.accelX.toFixed(3) : '0.000'}
                    </p>
                  </div>
                  <div className="bg-surface-800/50 p-2 rounded-lg border border-surface-700/50">
                    <span className="text-[9px] text-surface-500 font-mono">Y-axis</span>
                    <p className="text-xs font-semibold text-white font-mono mt-0.5">
                      {imu.accelY !== null ? imu.accelY.toFixed(3) : '0.000'}
                    </p>
                  </div>
                  <div className="bg-surface-800/50 p-2 rounded-lg border border-surface-700/50">
                    <span className="text-[9px] text-surface-500 font-mono">Z-axis</span>
                    <p className="text-xs font-semibold text-white font-mono mt-0.5">
                      {imu.accelZ !== null ? imu.accelZ.toFixed(3) : '0.000'}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-2">Gyroscope (Rotational Speed)</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-surface-800/50 p-2 rounded-lg border border-surface-700/50">
                    <span className="text-[9px] text-surface-500 font-mono">Roll</span>
                    <p className="text-xs font-semibold text-white font-mono mt-0.5">
                      {imu.gyroX !== null ? imu.gyroX.toFixed(3) : '0.000'}
                    </p>
                  </div>
                  <div className="bg-surface-800/50 p-2 rounded-lg border border-surface-700/50">
                    <span className="text-[9px] text-surface-500 font-mono">Pitch</span>
                    <p className="text-xs font-semibold text-white font-mono mt-0.5">
                      {imu.gyroY !== null ? imu.gyroY.toFixed(3) : '0.000'}
                    </p>
                  </div>
                  <div className="bg-surface-800/50 p-2 rounded-lg border border-surface-700/50">
                    <span className="text-[9px] text-surface-500 font-mono">Yaw</span>
                    <p className="text-xs font-semibold text-white font-mono mt-0.5">
                      {imu.gyroZ !== null ? imu.gyroZ.toFixed(3) : '0.000'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-surface-800 text-[10px] text-surface-500 flex justify-between">
            <span>Hardware: MPU6050</span>
            <span>{imu.accelX !== null ? '📡 Streaming Active' : '💤 Sensor Offline'}</span>
          </div>
        </div>
      </div>

      {/* SOS Events Section */}
      <div>
        <SosHistory deviceId={device.deviceId} />
      </div>

      {/* Remote Commands & History */}
      <div>
        <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-4">
          Remote Management & Command Logs
        </h3>
        <div className="glass-card p-5">
          <p className="text-xs text-surface-500 mb-4">
            Send remote commands to <span className="text-fleet-400 font-mono">{device.deviceId}</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {AVAILABLE_COMMANDS.map((cmd) => (
              <button
                key={cmd.value}
                onClick={() => handleSendCommand(cmd.value)}
                disabled={sendingCommand}
                className="btn btn--ghost text-xs py-2.5 flex-col gap-1"
              >
                <span className="text-lg">{cmd.icon}</span>
                {cmd.label}
              </button>
            ))}
          </div>

          {/* Custom Command Input Form */}
          <div className="mt-4 p-4 bg-surface-800/40 rounded-xl border border-surface-700/30">
            <h4 className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider mb-2">
              Send Custom Instruction
            </h4>
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const customCmd = formData.get('customCommand') as string;
                if (customCmd.trim()) {
                  handleSendCommand(customCmd.trim().toUpperCase());
                  e.currentTarget.reset();
                }
              }}
              className="flex gap-2 max-w-lg"
            >
              <input
                type="text"
                name="customCommand"
                placeholder="Enter custom command (e.g. RESET_SOS, START_SOS, REBOOT_DEVICE)"
                className="flex-1 px-3 py-1.5 text-xs bg-surface-900 border border-surface-700 rounded-lg text-white placeholder-surface-500 focus:outline-none focus:border-fleet-400 focus:ring-1 focus:ring-fleet-400/25"
                disabled={sendingCommand}
              />
              <button
                type="submit"
                disabled={sendingCommand}
                className="btn btn--primary text-xs py-1.5 px-4"
              >
                Send
              </button>
            </form>
          </div>

          {commandStatus && (
            <p className="text-sm text-surface-300 mt-3 animate-fade-in font-mono">{commandStatus}</p>
          )}

          {/* Command History Table */}
          <div className="mt-6 pt-6 border-t border-surface-800">
            <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">
              Command Execution History
            </h4>
            {commandHistory.length === 0 ? (
              <p className="text-xs text-surface-500 italic">No remote commands sent to this device yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-surface-300">
                  <thead>
                    <tr className="border-b border-surface-800 text-surface-500 uppercase tracking-wider text-[10px]">
                      <th className="py-2">Command</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Sent At</th>
                      <th className="py-2">Executed At</th>
                      <th className="py-2">Response</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800/40">
                    {commandHistory.map((cmd) => (
                      <tr key={cmd.id} className="hover:bg-surface-800/20">
                        <td className="py-2.5 font-mono text-[11px] text-white">{cmd.command}</td>
                        <td className="py-2.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                            cmd.status === 'executed'
                              ? 'bg-fleet-500/15 text-fleet-400'
                              : cmd.status === 'failed'
                                ? 'bg-danger-500/15 text-danger-400'
                                : 'bg-warning-500/15 text-warning-400'
                          }`}>
                            {cmd.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-surface-400 font-mono text-[11px]">
                          {new Date(cmd.createdAt).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="py-2.5 text-surface-400 font-mono text-[11px]">
                          {cmd.executedAt 
                            ? new Date(cmd.executedAt).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
                            : '—'}
                        </td>
                        <td className="py-2.5 max-w-[200px] truncate text-[11px] text-surface-400" title={cmd.response || ''}>
                          {cmd.response || <span className="text-surface-600 italic">Waiting for Pi...</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <RemoteAccessPanel deviceId={device.deviceId} />
    </div>
  );
};

export default DevicePage;
