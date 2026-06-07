import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { SosEvent } from '../../types/fleet.types';

interface SosHistoryProps {
  deviceId: string;
}

const SosHistory: React.FC<SosHistoryProps> = ({ deviceId }) => {
  const [events, setEvents] = useState<SosEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const data = await api.getSosHistory(deviceId);
        setEvents(data);
      } catch (err) {
        console.error('Failed to fetch SOS events:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [deviceId]);

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-4 w-32 bg-surface-700 rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-surface-800 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-4">
        SOS Event History
      </h3>

      {events.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-surface-500">No SOS events recorded</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <div
              key={event.id}
              className={`glass-card p-4 flex items-center justify-between ${
                !event.resolved ? 'border-l-4 border-l-danger-500' : ''
              }`}
            >
              <div className="flex items-center gap-4">
                <span className={`text-2xl ${event.resolved ? 'opacity-40' : ''}`}>
                  {event.resolved ? '✅' : '🚨'}
                </span>
                <div>
                  <p className="text-sm text-surface-200 font-medium">
                    SOS Event #{event.id}
                    {event.source && (
                      <span className="text-surface-500 ml-2">Source: {event.source}</span>
                    )}
                  </p>
                  <p className="text-xs text-surface-500 mt-0.5">{formatDate(event.timestamp)}</p>
                  {event.resolved && event.resolvedAt && (
                    <p className="text-xs text-fleet-500 mt-0.5">
                      Resolved: {formatDate(event.resolvedAt)}
                    </p>
                  )}
                </div>
              </div>

              {event.resolved ? (
                <span className="badge badge--success">Resolved</span>
              ) : (
                <span className="badge badge--danger">Active</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SosHistory;
