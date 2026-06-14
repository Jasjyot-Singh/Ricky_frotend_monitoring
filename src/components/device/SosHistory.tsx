import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useFleetStore } from '../../store/useFleetStore';
import type { SosEvent } from '../../types/fleet.types';

interface SosHistoryProps {
  deviceId: string;
}

const parseAsUTC = (dateStr: string) => {
  if (!dateStr) return 0;
  let clean = dateStr;
  if (typeof clean === 'string') {
    clean = clean.trim().replace(' ', 'T');
    if (!clean.endsWith('Z') && !clean.includes('+') && !clean.includes('-')) {
      clean += 'Z';
    }
  }
  return new Date(clean).getTime();
};

const SosHistory: React.FC<SosHistoryProps> = ({ deviceId }) => {
  const [events, setEvents] = useState<SosEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const alertsFromStore = useFleetStore((s) => s.alerts);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const [sosData, alertsData] = await Promise.all([
          api.getSosHistory(deviceId),
          api.getDeviceAlerts(deviceId),
        ]);

        const sosAlerts = alertsData.filter((a) => a.type === 'SOS');
        const matchedAlertIds = new Set<number>();

        const enrichedEvents = sosData.map((event) => {
          // Find matching SOS alert by UTC timestamp (within 5-minute window)
          const matchedAlert = sosAlerts.find((a) => {
            const eventTime = parseAsUTC(event.timestamp);
            const alertTime = parseAsUTC(a.createdAt);
            return Math.abs(eventTime - alertTime) < 5 * 60 * 1000;
          });

          if (matchedAlert) {
            matchedAlertIds.add(matchedAlert.id);
            const isResolved = matchedAlert.resolved;
            return {
              ...event,
              resolved: isResolved,
              resolvedAt: isResolved ? (event.resolvedAt || matchedAlert.resolvedAt || event.timestamp) : null,
              alertId: matchedAlert.id,
            };
          }

          // Fallback to the raw sos_event values from DB
          return {
            ...event,
            resolved: event.resolved,
            resolvedAt: event.resolved ? (event.resolvedAt || event.timestamp) : null,
          };
        });

        // Add synthetic events for any unmatched SOS alerts
        const unmatchedEvents = sosAlerts
          .filter((a) => !matchedAlertIds.has(a.id))
          .map((a) => {
            const isResolved = a.resolved;
            return {
              id: -a.id,
              deviceId: a.deviceId,
              source: 'Panic Warning',
              resolved: isResolved,
              timestamp: a.createdAt,
              resolvedAt: isResolved ? (a.resolvedAt || a.createdAt) : null,
              alertId: a.id,
            };
          });

        const allMergedEvents = [...enrichedEvents, ...unmatchedEvents];
        allMergedEvents.sort((a, b) => parseAsUTC(b.timestamp) - parseAsUTC(a.timestamp));

        setEvents(allMergedEvents);
      } catch (err) {
        console.error('Failed to fetch SOS events:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [deviceId, alertsFromStore]);

  const formatDate = (iso: string) => {
    let clean = iso;
    if (typeof clean === 'string' && !clean.endsWith('Z') && !clean.includes('+') && !clean.includes('-')) {
      clean = clean.trim().replace(' ', 'T') + 'Z';
    }
    return new Date(clean).toLocaleString('en-IN', {
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
          {events.map((event, index) => (
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
                    SOS Event #{events.length - index}
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
