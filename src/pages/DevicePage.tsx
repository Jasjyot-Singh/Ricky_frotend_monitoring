import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useDevice } from '../store/useFleetStore';
import { getMarkerState, MARKER_COLORS } from '../types/fleet.types';
import type { LocationPoint, CommandType } from '../types/fleet.types';
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
  { value: 'RESTART_PI', label: 'Restart Pi', icon: '🔄' },
  { value: 'RESTART_TELEMETRY', label: 'Restart Telemetry', icon: '📡' },
  { value: 'SYNC_POSTERS', label: 'Sync Posters', icon: '📋' },
  { value: 'FETCH_LOGS', label: 'Fetch Logs', icon: '📄' },
  { value: 'REBOOT_DEVICE', label: 'Reboot Device', icon: '⚡' },
];

const DevicePage: React.FC = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const device = useDevice(deviceId || '');
  const [locationHistory, setLocationHistory] = useState<LocationPoint[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sendingCommand, setSendingCommand] = useState(false);
  const [commandStatus, setCommandStatus] = useState<string | null>(null);

  // Fetch location history
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

  const handleSendCommand = useCallback(async (command: CommandType) => {
    if (!deviceId) return;
    setSendingCommand(true);
    setCommandStatus(null);
    try {
      const res = await api.sendCommand(deviceId, command);
      setCommandStatus(`✅ ${res.message} (ID: ${res.commandId})`);
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

  const state = getMarkerState(device);
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
    if (!device.lastSeen) return 'Unknown';
    const diff = Date.now() - new Date(device.lastSeen).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  };

  // Get system metrics — from fleet endpoint's nested system object
  const sys = device.system;
  const hw = device.hardware;

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
        <div className="text-right">
          <p className="text-xs text-surface-500">Last seen</p>
          <p className="text-sm text-surface-300 font-mono">{timeAgo()}</p>
        </div>
      </div>

      {/* Device Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center">
          <p className="text-xs text-surface-500 uppercase tracking-wider">Speed</p>
          <p className="text-2xl font-bold text-white mt-1">
            {device.speed?.toFixed(1) ?? '—'}
            <span className="text-sm text-surface-400 ml-1">km/h</span>
          </p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-xs text-surface-500 uppercase tracking-wider">Battery</p>
          <div className="flex items-center justify-center gap-2 mt-1">
            <p className={`text-2xl font-bold ${(device.batteryPercentage ?? 0) > 50
                ? 'text-fleet-400'
                : (device.batteryPercentage ?? 0) > 20
                  ? 'text-warning-400'
                  : 'text-danger-400'
              }`}>
              {device.batteryPercentage ?? '—'}%
            </p>
            {device.charging && <span className="text-xl charging-pulse">⚡</span>}
          </div>
          <p className="text-xs text-surface-500 mt-0.5">{device.batteryVoltage?.toFixed(1) ?? '—'}V</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-xs text-surface-500 uppercase tracking-wider">GPS</p>
          <p className={`text-2xl font-bold mt-1 ${device.gpsFix ? 'text-fleet-400' : 'text-danger-400'}`}>
            {device.gpsFix ? '🛰 Fixed' : '⚠️ Lost'}
          </p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-xs text-surface-500 uppercase tracking-wider">Internet</p>
          <p className={`text-2xl font-bold mt-1 ${device.internetConnected ? 'text-fleet-400' : 'text-danger-400'}`}>
            {device.internetConnected ? '🌐 Online' : '📴 Down'}
          </p>
        </div>
      </div>

      {/* Hardware Status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'ESP32', connected: hw.espConnected },
          { label: 'GPS Module', connected: hw.gpsConnected },
          { label: 'IMU', connected: hw.imuConnected },
          { label: 'Display', connected: hw.displayConnected },
        ].map((item) => (
          <div key={item.label} className="glass-card p-3 flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${item.connected ? 'bg-fleet-400 shadow-lg shadow-fleet-400/50' : 'bg-danger-400 animate-pulse'}`} />
            <div>
              <p className="text-xs text-surface-400 uppercase">{item.label}</p>
              <p className={`text-sm font-medium ${item.connected ? 'text-fleet-400' : 'text-danger-400'}`}>
                {item.connected ? 'Connected' : 'Disconnected'}
              </p>
            </div>
          </div>
        ))}
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
              />
            )}
          </MapContainer>
        </div>
      </div>

      {/* System Health + SOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SystemHealthCharts
          cpu={sys.cpu}
          ram={sys.ram}
          disk={sys.disk}
          temp={sys.temp}
        />
        <SosHistory deviceId={device.deviceId} />
      </div>

      {/* Remote Commands */}
      <div>
        <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-4">
          Remote Commands
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
          {commandStatus && (
            <p className="text-sm text-surface-300 mt-3 animate-fade-in">{commandStatus}</p>
          )}
        </div>
      </div>

      <RemoteAccessPanel deviceId={device.deviceId} />
    </div>
  );
};

export default DevicePage;
