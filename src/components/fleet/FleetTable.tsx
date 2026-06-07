import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeviceList } from '../../store/useFleetStore';
import { getMarkerState } from '../../types/fleet.types';
import StatusBadge from './StatusBadge';

type SortKey =
  | 'deviceId'
  | 'vehicleNumber'
  | 'status'
  | 'speed'
  | 'batteryPercentage'
  | 'lastSeen';

const FleetTable: React.FC = () => {
  const devices = useDeviceList();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('deviceId');
  const [sortAsc, setSortAsc] = useState(true);

  const filteredDevices = useMemo(() => {
    const query = search.toLowerCase();
    let filtered = devices.filter(
      (d) =>
        d.deviceId.toLowerCase().includes(query) ||
        d.vehicleNumber.toLowerCase().includes(query) ||
        (d.driverName?.toLowerCase().includes(query) ?? false),
    );

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'deviceId':
          cmp = a.deviceId.localeCompare(b.deviceId);
          break;
        case 'vehicleNumber':
          cmp = a.vehicleNumber.localeCompare(b.vehicleNumber);
          break;
        case 'status': {
          const order = { sos: 0, warning: 1, healthy: 2, offline: 3 };
          cmp = order[getMarkerState(a)] - order[getMarkerState(b)];
          break;
        }
        case 'speed':
          cmp = (a.speed ?? 0) - (b.speed ?? 0);
          break;
        case 'batteryPercentage':
          cmp = (a.batteryPercentage ?? 0) - (b.batteryPercentage ?? 0);
          break;
        case 'lastSeen':
          cmp =
            new Date(a.lastSeen || 0).getTime() - new Date(b.lastSeen || 0).getTime();
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return filtered;
  }, [devices, search, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => (
    <span className="ml-1 text-surface-500">
      {sortKey === columnKey ? (sortAsc ? '↑' : '↓') : ''}
    </span>
  );

  const formatTime = (iso: string | null) => {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Now';
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="glass-card overflow-hidden">
      {/* Search bar */}
      <div className="p-4 border-b border-surface-700/30">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-surface-200 uppercase tracking-wider">
            Fleet Vehicles
          </h2>
          <div className="relative">
            <input
              type="text"
              placeholder="Search devices, vehicles, drivers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72 bg-surface-800/50 border border-surface-700/50 rounded-xl px-4 py-2.5 text-sm text-surface-200 placeholder-surface-500
                         focus:outline-none focus:ring-2 focus:ring-fleet-500/30 focus:border-fleet-500/50 transition-all"
            />
            <svg
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-700/30">
              {[
                { key: 'status' as SortKey, label: 'Status', width: 'w-24' },
                { key: 'deviceId' as SortKey, label: 'Device ID', width: 'w-28' },
                { key: 'vehicleNumber' as SortKey, label: 'Vehicle', width: 'w-32' },
                { key: null, label: 'Driver', width: 'w-32' },
                { key: null, label: 'Location', width: 'w-36' },
                { key: 'speed' as SortKey, label: 'Speed', width: 'w-20' },
                { key: 'batteryPercentage' as SortKey, label: 'Battery', width: 'w-24' },
                { key: null, label: 'Charging', width: 'w-20' },
                { key: null, label: 'SOS', width: 'w-16' },
                { key: null, label: 'GPS', width: 'w-16' },
                { key: null, label: 'Internet', width: 'w-20' },
                { key: 'lastSeen' as SortKey, label: 'Last Seen', width: 'w-24' },
              ].map((col, i) => (
                <th
                  key={i}
                  onClick={col.key ? () => handleSort(col.key!) : undefined}
                  className={`px-4 py-3 text-left text-xs font-semibold text-surface-400 uppercase tracking-wider
                    ${col.key ? 'cursor-pointer hover:text-surface-200 transition-colors' : ''} ${col.width}`}
                >
                  {col.label}
                  {col.key && <SortIcon columnKey={col.key} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-800/50">
            {filteredDevices.map((device) => {
              const state = getMarkerState(device);
              return (
                <tr
                  key={device.deviceId}
                  onClick={() => navigate(`/device/${device.deviceId}`)}
                  className="hover:bg-surface-800/30 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3.5">
                    <StatusBadge state={state} />
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-sm text-fleet-400 group-hover:text-fleet-300">
                      {device.deviceId}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-surface-300">{device.vehicleNumber}</td>
                  <td className="px-4 py-3.5 text-sm text-surface-400">
                    {device.driverName || '—'}
                  </td>
                  <td className="px-4 py-3.5 text-xs font-mono text-surface-400">
                    {device.latitude !== null
                      ? `${device.latitude.toFixed(4)}, ${device.longitude?.toFixed(4)}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-surface-300">
                    {device.speed?.toFixed(1) ?? '—'}
                    <span className="text-xs text-surface-500 ml-0.5">km/h</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-surface-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            (device.batteryPercentage ?? 0) > 50
                              ? 'bg-fleet-500'
                              : (device.batteryPercentage ?? 0) > 20
                              ? 'bg-warning-500'
                              : 'bg-danger-500'
                          }`}
                          style={{ width: `${device.batteryPercentage ?? 0}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-surface-300">
                        {device.batteryPercentage ?? '—'}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm">
                    {device.charging ? (
                      <span className="text-fleet-400 charging-pulse">⚡</span>
                    ) : (
                      <span className="text-surface-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {device.sosActive ? (
                      <span className="badge badge--danger text-xs">SOS</span>
                    ) : (
                      <span className="text-surface-600 text-sm">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`text-sm ${device.gpsFix ? 'text-fleet-400' : 'text-danger-400'}`}
                    >
                      {device.gpsFix ? '✓' : '✗'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`text-sm ${
                        device.internetConnected ? 'text-fleet-400' : 'text-danger-400'
                      }`}
                    >
                      {device.internetConnected ? '✓' : '✗'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-surface-500 font-mono">
                    {formatTime(device.lastSeen)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredDevices.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-surface-500">No devices match your search</p>
        </div>
      )}
    </div>
  );
};

export default FleetTable;
