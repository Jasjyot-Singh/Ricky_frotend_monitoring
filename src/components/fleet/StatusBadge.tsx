import React from 'react';
import type { MarkerState } from '../../types/fleet.types';

const stateConfig: Record<
  MarkerState,
  { label: string; dotClass: string; badgeClass: string }
> = {
  healthy: {
    label: 'Online',
    dotClass: 'status-dot--online',
    badgeClass: 'badge--success',
  },
  warning: {
    label: 'Warning',
    dotClass: 'status-dot--warning',
    badgeClass: 'badge--warning',
  },
  sos: {
    label: 'SOS',
    dotClass: 'status-dot--danger',
    badgeClass: 'badge--danger',
  },
  offline: {
    label: 'Offline',
    dotClass: 'status-dot--offline',
    badgeClass: 'badge--neutral',
  },
};

interface StatusBadgeProps {
  state: MarkerState;
  variant?: 'dot' | 'badge';
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ state, variant = 'badge' }) => {
  const config = stateConfig[state];

  if (variant === 'dot') {
    return (
      <div className="flex items-center gap-2">
        <span className={`status-dot ${config.dotClass}`} />
        <span className="text-sm text-surface-300">{config.label}</span>
      </div>
    );
  }

  return (
    <span className={`badge ${config.badgeClass}`}>
      <span className={`status-dot ${config.dotClass}`} />
      {config.label}
    </span>
  );
};

export default StatusBadge;
