import React from 'react';
import type { Alert } from '../../types/fleet.types';
import { getAlertSeverity } from '../../types/fleet.types';

const severityStyles: Record<string, string> = {
  CRITICAL: 'border-l-danger-500 bg-danger-500/5',
  WARNING: 'border-l-warning-500 bg-warning-500/5',
  INFO: 'border-l-fleet-500 bg-fleet-500/5',
};

const typeIcons: Record<string, string> = {
  SOS: '🚨',
  LOW_BATTERY: '🔋',
  DEVICE_OFFLINE: '📴',
  GPS_FAILURE: '📡',
  INTERNET_FAILURE: '🌐',
  ESP_DISCONNECTED: '🔌',
  DISPLAY_FAILURE: '🖥️',
  POSTER_SERVICE_DOWN: '📋',
  TELEMETRY_SERVICE_DOWN: '📊',
};

interface AlertCardProps {
  alert: Alert;
  onResolve?: (alertId: number) => void;
}

const AlertCard: React.FC<AlertCardProps> = React.memo(({ alert, onResolve }) => {
  const severity = getAlertSeverity(alert.type);

  const timeAgo = () => {
    const diff = Date.now() - new Date(alert.createdAt).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  return (
    <div
      className={`border-l-4 rounded-r-lg px-4 py-3 animate-slide-up ${
        severityStyles[severity] || severityStyles.INFO
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="text-lg mt-0.5">{typeIcons[alert.type] || '⚠️'}</span>
          <div>
            <p className="text-sm text-surface-200 font-medium">{alert.message}</p>
            <p className="text-xs text-surface-500 mt-1 font-mono">{alert.deviceId}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-surface-500 whitespace-nowrap">{timeAgo()}</span>
          {!alert.resolved && onResolve && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResolve(alert.id);
              }}
              className="text-xs text-fleet-400 hover:text-fleet-300 transition-colors font-medium"
            >
              Resolve
            </button>
          )}
          {alert.resolved && (
            <span className="text-xs text-fleet-500">✓ Resolved</span>
          )}
        </div>
      </div>
    </div>
  );
});

AlertCard.displayName = 'AlertCard';

export default AlertCard;
