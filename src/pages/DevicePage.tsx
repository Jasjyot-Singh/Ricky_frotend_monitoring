import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useDevice, useFleetStore, useActiveSosDeviceIds, useActiveWarningDeviceIds, computeActiveStatus } from '../store/useFleetStore';
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
  const rawDevice = useDevice(deviceId || '');
  const serverClockOffset = useFleetStore((s) => s.serverClockOffset);
  const device = rawDevice ? computeActiveStatus(rawDevice, serverClockOffset) : null;
  const sosDeviceIds = useActiveSosDeviceIds();
  const warningDeviceIds = useActiveWarningDeviceIds();

  const { sosSet, warningSet } = useMemo(() => {
    return {
      sosSet: new Set(sosDeviceIds),
      warningSet: new Set(warningDeviceIds),
    };
  }, [sosDeviceIds, warningDeviceIds]);
  const [deviceDetail, setDeviceDetail] = useState<DeviceDetailResponse | null>(null);
  const [commandHistory, setCommandHistory] = useState<DeviceCommand[]>([]);
  const [locationHistory, setLocationHistory] = useState<LocationPoint[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sendingCommand, setSendingCommand] = useState(false);
  const [commandStatus, setCommandStatus] = useState<string | null>(null);
  const [secondsSinceLastSeen, setSecondsSinceLastSeen] = useState<number | null>(null);

  useEffect(() => {
    const lastSeenTime = deviceDetail?.liveStatus.lastSeen ?? device?.lastSeen;
    if (!lastSeenTime) return;

    const updateTimer = () => {
      let parsedTime = new Date(lastSeenTime).getTime();
      if (typeof lastSeenTime === 'string' && !lastSeenTime.endsWith('Z') && !lastSeenTime.includes('+')) {
        const cleanStr = lastSeenTime.replace(' ', 'T');
        parsedTime = new Date(cleanStr + 'Z').getTime();
      }
      const diffMs = (Date.now() + serverClockOffset) - parsedTime;
      setSecondsSinceLastSeen(Math.max(0, Math.floor(diffMs / 1000)));
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
    return () => clearInterval(timerInterval);
  }, [deviceDetail?.liveStatus.lastSeen, device?.lastSeen, serverClockOffset]);
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

  const state = getMarkerState(device, serverClockOffset, sosSet, warningSet);
  const color = MARKER_COLORS[state];
  const icon = createDetailMarkerIcon(color);

  const latitude = deviceDetail?.liveStatus.latitude ?? device.latitude;
  const longitude = deviceDetail?.liveStatus.longitude ?? device.longitude;

  const trailPositions: [number, number][] = locationHistory
    .filter((p) => p.latitude && p.longitude)
    .map((p) => [p.latitude, p.longitude]);

  const mapCenter: [number, number] =
    latitude !== null && longitude !== null
      ? [latitude, longitude]
      : [19.8762, 75.3433];

  const timeAgo = () => {
    const dateStr = device.lastSeen;
    if (!dateStr) return 'Unknown';
    let parsedTime = new Date(dateStr).getTime();
    if (typeof dateStr === 'string' && !dateStr.endsWith('Z') && !dateStr.includes('+')) {
      const cleanStr = dateStr.replace(' ', 'T');
      parsedTime = new Date(cleanStr + 'Z').getTime();
    }
    const diff = (Date.now() + serverClockOffset) - parsedTime;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  };

  // Get unified variables from local store (ws-driven) or full REST details (database-driven)
  const speed = device?.speed ?? deviceDetail?.liveStatus.speed;
  const batteryPct = device?.batteryPercentage ?? deviceDetail?.liveStatus.batteryPercentage;
  const batteryVolts = device?.batteryVoltage ?? deviceDetail?.liveStatus.batteryVoltage;
  const charging = device?.charging ?? deviceDetail?.liveStatus.charging;
  const gpsFix = device?.gpsFix ?? deviceDetail?.liveStatus.gpsFix;
  const internetConnected = device?.internetConnected ?? deviceDetail?.liveStatus.internetConnected;

  const sys = {
    cpu: device?.system?.cpu ?? deviceDetail?.liveStatus.cpuUsage ?? 0,
    ram: device?.system?.ram ?? deviceDetail?.liveStatus.ramUsage ?? 0,
    disk: device?.system?.disk ?? deviceDetail?.liveStatus.diskUsage ?? 0,
    temp: device?.system?.temp ?? deviceDetail?.liveStatus.cpuTemperature ?? 0,
  };

  const imu = {
    accelX: device?.imu?.accelX ?? deviceDetail?.liveStatus.imuAccelX ?? null,
    accelY: device?.imu?.accelY ?? deviceDetail?.liveStatus.imuAccelY ?? null,
    accelZ: device?.imu?.accelZ ?? deviceDetail?.liveStatus.imuAccelZ ?? null,
    gyroX: device?.imu?.gyroX ?? deviceDetail?.liveStatus.imuGyroX ?? null,
    gyroY: device?.imu?.gyroY ?? deviceDetail?.liveStatus.imuGyroY ?? null,
    gyroZ: device?.imu?.gyroZ ?? deviceDetail?.liveStatus.imuGyroZ ?? null,
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
            {latitude !== null && longitude !== null && (
              <Marker
                position={[latitude, longitude]}
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

      {/* SOS Events Section (Removed from UI) */}

      {/* Remote Commands & History (Removed from UI) */}

      <RemoteAccessPanel deviceId={device.deviceId} />
    </div>
  );
};

export default DevicePage;
