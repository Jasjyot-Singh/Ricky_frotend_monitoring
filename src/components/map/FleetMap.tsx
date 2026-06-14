import React, { useMemo } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMapDevices, useFleetStore, computeActiveStatus } from '../../store/useFleetStore';
import RickshawMarker from './RickshawMarker';

// Fix Leaflet default icon paths
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// @ts-expect-error - Leaflet icon default override
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

import type { DeviceStatus } from '../../types/fleet.types';

/** Auto-fits the map bounds to show all markers */
const MapBoundsUpdater: React.FC<{ devices: DeviceStatus[] }> = ({ devices }) => {
  const map = useMap();

  useMemo(() => {
    if (devices.length === 0) return;

    const bounds = L.latLngBounds(
      devices.map((d) => [d.latitude!, d.longitude!] as [number, number]),
    );

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [devices, map]);

  return null;
};

interface FleetMapProps {
  className?: string;
  onDeviceClick?: (deviceId: string) => void;
}

const FleetMap: React.FC<FleetMapProps> = ({ className = '', onDeviceClick }) => {
  const rawDevices = useMapDevices();
  const serverClockOffset = useFleetStore((s) => s.serverClockOffset);
  const devices = rawDevices.map((d) => computeActiveStatus(d, serverClockOffset));

  // Filter out zero coordinates to prevent drawing incorrect map markers/bounds
  const validDevices = devices.filter((d) => d.latitude !== 0 || d.longitude !== 0);
  const zeroDevices = devices.filter((d) => d.latitude === 0 && d.longitude === 0);

  // Default center: Aurangabad, Maharashtra
  const defaultCenter: [number, number] = [19.8762, 75.3433];

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      <MapContainer
        center={defaultCenter}
        zoom={13}
        className="w-full h-full"
        style={{ minHeight: '400px' }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {validDevices.map((device) => (
          <RickshawMarker
            key={device.deviceId}
            device={device}
            onClick={() => onDeviceClick?.(device.deviceId)}
          />
        ))}

        <MapBoundsUpdater devices={validDevices} />
      </MapContainer>

      {/* Map overlay: device count */}
      <div className="absolute top-4 right-4 z-[1000] glass-card px-3 py-2 flex flex-col gap-1.5 items-end">
        <span className="text-xs text-surface-400">
          {validDevices.length} device{validDevices.length !== 1 ? 's' : ''} on map
        </span>
        {zeroDevices.map((d) => (
          <span key={d.deviceId} className="text-[10px] bg-danger-500/95 text-white font-semibold px-2 py-0.5 rounded animate-pulse">
            🚨 {d.deviceId}: Lat/Long Zero (GPS Error)
          </span>
        ))}
      </div>
    </div>
  );
};

export default FleetMap;
