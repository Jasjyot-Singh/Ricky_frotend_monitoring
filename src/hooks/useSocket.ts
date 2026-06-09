import { useEffect } from 'react';
import { fleetSocket } from '../lib/socket';
import { useFleetStore } from '../store/useFleetStore';
import { api } from '../lib/api';
import { isAuthenticated } from '../lib/auth';
import type { DeviceStatus, Alert } from '../types/fleet.types';

/**
 * Hook that manages the native WebSocket connection lifecycle.
 * Registers event handlers for fleet updates and syncs to Zustand store.
 * Also fetches initial fleet snapshot via REST (no Socket.IO fleet:subscribe).
 * Should be called once at the app root level.
 */
export function useSocket() {
  const {
    setFleetSnapshot,
    updateDevice,
    markDeviceOffline,
    addAlert,
    setConnected,
    setFleetStats,
    setAlertsSnapshot,
    setServerClockOffset,
  } = useFleetStore();

  useEffect(() => {
    if (!isAuthenticated()) return;

    // ── Initial REST fetch for fleet data ──────────────────
    const fetchInitialData = async () => {
      try {
        const [devices, stats, alerts] = await Promise.all([
          api.getFleet(),
          api.getFleetStats(),
          api.getFleetAlerts(),
        ]);
        setFleetSnapshot(devices);
        setFleetStats(stats);
        // Sync active alerts snapshot and attach device location at the time
        const alertsWithLocation = alerts.map((a) => {
          const dev = devices.find((d) => d.deviceId === a.deviceId);
          return {
            ...a,
            latitude: a.latitude !== undefined && a.latitude !== null ? a.latitude : (dev?.latitude ?? null),
            longitude: a.longitude !== undefined && a.longitude !== null ? a.longitude : (dev?.longitude ?? null),
          };
        });
        setAlertsSnapshot(alertsWithLocation);
        // Since we successfully reached the backend, set connection state to true
        setConnected(true);

        // Dynamically compute the server-client clock offset based on the latest timestamps
        let maxTime = 0;
        for (const d of devices) {
          if (d.lastSeen) {
            let t = new Date(d.lastSeen).getTime();
            if (typeof d.lastSeen === 'string' && !d.lastSeen.endsWith('Z') && !d.lastSeen.includes('+')) {
              t = new Date(d.lastSeen.replace(' ', 'T') + 'Z').getTime();
            }
            if (t > maxTime) maxTime = t;
          }
        }
        for (const a of alerts) {
          if (a.createdAt) {
            let t = new Date(a.createdAt).getTime();
            if (typeof a.createdAt === 'string' && !a.createdAt.endsWith('Z') && !a.createdAt.includes('+')) {
              t = new Date(a.createdAt.replace(' ', 'T') + 'Z').getTime();
            }
            if (t > maxTime) maxTime = t;
          }
        }
        const currentRef = Date.now() + useFleetStore.getState().serverClockOffset;
        if (maxTime > currentRef) {
          const newOffset = maxTime - Date.now() + 1000;
          setServerClockOffset(newOffset);
        }
      } catch (err) {
        console.error('Failed to fetch initial fleet data:', err);
        // If REST call fails and WebSocket is also disconnected, backend is unreachable
        if (!fleetSocket.connected) {
          setConnected(false);
        }
      }
    };

    fetchInitialData();

    // Fallback polling loop (every 5 seconds) to guarantee real-time updates
    // even if WebSocket handshake is blocked by self-signed SSL certificate bypass constraints.
    const fallbackPoll = setInterval(() => {
      fetchInitialData();
    }, 5000);

    // ── WebSocket event handlers ──────────────────────────
    const handleTelemetryUpdate = (data: unknown) => {
      const d = data as DeviceStatus;
      updateDevice(d);
      if (d.lastSeen) {
        let t = new Date(d.lastSeen).getTime();
        if (typeof d.lastSeen === 'string' && !d.lastSeen.endsWith('Z') && !d.lastSeen.includes('+')) {
          t = new Date(d.lastSeen.replace(' ', 'T') + 'Z').getTime();
        }
        const currentRef = Date.now() + useFleetStore.getState().serverClockOffset;
        if (t > currentRef) {
          setServerClockOffset(t - Date.now() + 1000);
        }
      }
    };

    const handleLocationUpdate = (data: unknown) => {
      // Location updates carry full status; update the device
      const d = data as DeviceStatus;
      updateDevice(d);
      if (d.lastSeen) {
        let t = new Date(d.lastSeen).getTime();
        if (typeof d.lastSeen === 'string' && !d.lastSeen.endsWith('Z') && !d.lastSeen.includes('+')) {
          t = new Date(d.lastSeen.replace(' ', 'T') + 'Z').getTime();
        }
        const currentRef = Date.now() + useFleetStore.getState().serverClockOffset;
        if (t > currentRef) {
          setServerClockOffset(t - Date.now() + 1000);
        }
      }
    };

    const handleSosAlert = (_data: unknown) => {
      // SOS events are also pushed as alerts, handled by alert-created
    };

    const handleDeviceOnline = (data: unknown) => {
      updateDevice(data as DeviceStatus);
    };

    const handleDeviceOffline = (data: unknown) => {
      const d = data as { deviceId?: string };
      if (d.deviceId) {
        markDeviceOffline(d.deviceId);
      }
    };

    const handleAlertCreated = (data: unknown) => {
      const a = data as Alert;
      const dev = useFleetStore.getState().devices[a.deviceId];
      const alertWithLocation = {
        ...a,
        latitude: a.latitude !== undefined && a.latitude !== null ? a.latitude : (dev?.latitude ?? null),
        longitude: a.longitude !== undefined && a.longitude !== null ? a.longitude : (dev?.longitude ?? null),
      };
      addAlert(alertWithLocation);
      if (a.createdAt) {
        let t = new Date(a.createdAt).getTime();
        if (typeof a.createdAt === 'string' && !a.createdAt.endsWith('Z') && !a.createdAt.includes('+')) {
          t = new Date(a.createdAt.replace(' ', 'T') + 'Z').getTime();
        }
        const currentRef = Date.now() + useFleetStore.getState().serverClockOffset;
        if (t > currentRef) {
          setServerClockOffset(t - Date.now() + 1000);
        }
      }
    };

    // ── Connection state tracking ─────────────────────────
    const unsubConnection = fleetSocket.onConnectionChange((connected) => {
      if (connected) {
        setConnected(true);
        // Refresh fleet data on reconnection
        fetchInitialData();
      }
    });

    // Register WebSocket event listeners
    fleetSocket.on('telemetry-update', handleTelemetryUpdate);
    fleetSocket.on('location-update', handleLocationUpdate);
    fleetSocket.on('sos-alert', handleSosAlert);
    fleetSocket.on('device-online', handleDeviceOnline);
    fleetSocket.on('device-offline', handleDeviceOffline);
    fleetSocket.on('alert-created', handleAlertCreated);

    // Connect
    fleetSocket.connect();

    // If already connected, sync
    if (fleetSocket.connected) {
      setConnected(true);
    }

    return () => {
      clearInterval(fallbackPoll);
      fleetSocket.off('telemetry-update', handleTelemetryUpdate);
      fleetSocket.off('location-update', handleLocationUpdate);
      fleetSocket.off('sos-alert', handleSosAlert);
      fleetSocket.off('device-online', handleDeviceOnline);
      fleetSocket.off('device-offline', handleDeviceOffline);
      fleetSocket.off('alert-created', handleAlertCreated);
      unsubConnection();
    };
  }, [setFleetSnapshot, updateDevice, markDeviceOffline, addAlert, setConnected, setFleetStats, setAlertsSnapshot]);
}
