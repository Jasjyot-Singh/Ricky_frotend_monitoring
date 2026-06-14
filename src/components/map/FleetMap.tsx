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
  const allDevices = useMapDevices();
  const devices = useMemo(() => {
    return allDevices.filter((d) => !(d.latitude === 0 && d.longitude === 0));
  }, [allDevices]);

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
  const devices = useMemo(() => {
    return rawDevices.map((d) => computeActiveStatus(d, serverClockOffset));
  }, [rawDevices, serverClockOffset]);

  // Find any devices that have coordinates (0, 0)
  const zeroDevices = useMemo(() => {
    return devices.filter((d) => d.latitude === 0 && d.longitude === 0);
  }, [devices]);

  // Only render devices with valid coordinates (not 0, 0)
  const validDevices = useMemo(() => {
    return devices.filter((d) => !(d.latitude === 0 && d.longitude === 0));
  }, [devices]);

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

        <MapBoundsUpdater />
      </MapContainer>

      {/* Map overlay: device count & zero coordinates warnings */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col items-end gap-2 pointer-events-none">
        <div className="glass-card px-3 py-2 bg-surface-900/80 backdrop-blur-md">
          <span className="text-xs text-surface-200">
            {validDevices.length} device{validDevices.length !== 1 ? 's' : ''} on map
          </span>
        </div>
        {zeroDevices.map((d) => (
          <div key={d.deviceId} className="glass-card border border-danger-500/30 bg-danger-950/80 backdrop-blur-md px-3 py-2 flex items-center gap-2 animate-pulse">
            <span className="text-xs text-danger-400 font-semibold">
              ⚠️ Auto {d.vehicleNumber || d.deviceId}: Lat, Long zero
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FleetMap;
