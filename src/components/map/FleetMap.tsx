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

/** Auto-fits the map bounds to show all markers */
const MapBoundsUpdater: React.FC = () => {
  const devices = useMapDevices();
  const map = useMap();

  useMemo(() => {
    if (devices.length === 0) return;

    const bounds = L.latLngBounds(
      devices.map((d) => [d.latitude!, d.longitude!] as [number, number]),
    );

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [devices.length]); // Only refit when device count changes

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

        {devices.map((device) => (
          <RickshawMarker
            key={device.deviceId}
            device={device}
            onClick={() => onDeviceClick?.(device.deviceId)}
          />
        ))}

        <MapBoundsUpdater />
      </MapContainer>

      {/* Map overlay: device count */}
      <div className="absolute top-4 right-4 z-[1000] glass-card px-3 py-2">
        <span className="text-xs text-surface-400">
          {devices.length} device{devices.length !== 1 ? 's' : ''} on map
        </span>
      </div>
    </div>
  );
};

export default FleetMap;
