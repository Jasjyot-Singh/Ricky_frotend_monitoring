import React, { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import type { DeviceStatus } from '../../types/fleet.types';
import { getMarkerState, MARKER_COLORS } from '../../types/fleet.types';
import { useFleetStore } from '../../store/useFleetStore';

/**
 * Creates a custom circular SVG marker icon with color based on device state.
 */
function createMarkerIcon(color: string, pulseClass = ''): L.DivIcon {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="position: relative; width: 32px; height: 32px;">
        <div class="${pulseClass}" style="
          position: absolute; inset: 0;
          background: ${color};
          border-radius: 50%;
          opacity: 0.3;
        "></div>
        <div style="
          position: absolute; inset: 4px;
          background: ${color};
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px ${color}80;
        "></div>
        <svg viewBox="0 0 24 24" fill="white" style="
          position: absolute; inset: 8px;
          width: 16px; height: 16px;
        ">
          <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
  });
}

interface RickshawMarkerProps {
  device: DeviceStatus;
  onClick?: () => void;
}

const RickshawMarker: React.FC<RickshawMarkerProps> = React.memo(({ device, onClick }) => {
  const navigate = useNavigate();
  const serverClockOffset = useFleetStore((s) => s.serverClockOffset);
  const state = getMarkerState(device, serverClockOffset);
  const color = MARKER_COLORS[state];

  const icon = useMemo(
    () => createMarkerIcon(color, state === 'sos' ? 'sos-pulse' : ''),
    [color, state],
  );

  if (device.latitude === null || device.longitude === null) return null;

  const timeSinceLastSeen = () => {
    if (!device.lastSeen) return 'Unknown';
    let lastSeenTime = new Date(device.lastSeen).getTime();
    if (typeof device.lastSeen === 'string' && !device.lastSeen.endsWith('Z') && !device.lastSeen.includes('+')) {
      lastSeenTime = new Date(device.lastSeen.replace(' ', 'T') + 'Z').getTime();
    }
    const adjustedNow = Date.now() + serverClockOffset;
    const diff = adjustedNow - lastSeenTime;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  };

  return (
    <Marker
      position={[device.latitude, device.longitude]}
      icon={icon}
      eventHandlers={{
        click: () => onClick?.(),
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
              <p className="text-white font-medium">{device.speed != null ? `${device.speed.toFixed(1)} km/h` : '— km/h'}</p>
            </div>
            <div>
              <span className="text-surface-500">Battery</span>
              <p
                className="font-medium"
                style={{
                  color: device.batteryPercentage == null
                    ? '#94a3b8'
                    : device.batteryPercentage > 50
                    ? '#22c55e'
                    : device.batteryPercentage > 20
                    ? '#f59e0b'
                    : '#ef4444',
                }}
              >
                {device.batteryPercentage != null ? `${device.batteryPercentage}%` : '—'}
                {device.charging && ' ⚡'}
              </p>
            </div>
            <div>
              <span className="text-surface-500">Driver</span>
              <p className="text-white font-medium">{device.driverName || '—'}</p>
            </div>
            <div>
              <span className="text-surface-500">Last Seen</span>
              <p className="text-white font-medium">{timeSinceLastSeen()}</p>
            </div>
          </div>

          {/* Action */}
          <button
            onClick={() => navigate(`/device/${device.deviceId}`)}
            className="w-full btn btn--primary text-xs py-2"
          >
            View Details →
          </button>
        </div>
      </Popup>
    </Marker>
  );
});

RickshawMarker.displayName = 'RickshawMarker';

export default RickshawMarker;
