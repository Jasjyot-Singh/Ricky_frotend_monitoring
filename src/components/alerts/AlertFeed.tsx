import React, { useCallback } from 'react';
import { useLatestAlerts, useFleetStore } from '../../store/useFleetStore';
import { api } from '../../lib/api';
import AlertCard from './AlertCard';

interface AlertFeedProps {
  maxAlerts?: number;
}

const AlertFeed: React.FC<AlertFeedProps> = ({ maxAlerts = 15 }) => {
  const alerts = useLatestAlerts(maxAlerts);
  const removeAlert = useFleetStore((s) => s.removeAlert);

  const handleResolve = useCallback(async (alertId: number) => {
    try {
      await api.resolveAlert(alertId);
      removeAlert(alertId);
    } catch (err) {
      console.error('Failed to resolve alert:', err);
    }
  }, [removeAlert]);

  // Count unresolved alerts
  const unresolvedCount = alerts.filter((a) => !a.resolved).length;

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {unresolvedCount > 0 && (
            <div className="w-2 h-2 rounded-full bg-danger-400 animate-pulse" />
          )}
          <h2 className="text-sm font-semibold text-surface-200 uppercase tracking-wider">
            Important Alerts
          </h2>
        </div>
        <span className="text-xs text-surface-500">
          {unresolvedCount} active alert{unresolvedCount !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
        {alerts.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-surface-500 text-sm">✅ No active alerts</p>
            <p className="text-surface-600 text-xs mt-1">All systems operational</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onResolve={handleResolve}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default AlertFeed;
