import React from 'react';
import { useNavigate } from 'react-router-dom';
import FleetMap from '../components/map/FleetMap';
import AlertFeed from '../components/alerts/AlertFeed';
import FleetTable from '../components/fleet/FleetTable';

const FleetOverview: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-white">Fleet Overview</h1>
        <p className="text-sm text-surface-400 mt-1">
          Real-time monitoring of all fleet vehicles
        </p>
      </div>

      {/* Top Section: Map + Alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Map — takes 2/3 width on large screens */}
        <div className="xl:col-span-2">
          <FleetMap
            className="h-[480px]"
            onDeviceClick={(deviceId) => navigate(`/device/${deviceId}`)}
          />
        </div>

        {/* Alerts — takes 1/3 width */}
        <div className="xl:col-span-1">
          <AlertFeed maxAlerts={3} />
        </div>
      </div>

      {/* Fleet Table */}
      <FleetTable />
    </div>
  );
};

export default FleetOverview;
