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
  const setFleetSnapshot = useFleetStore((s) => s.setFleetSnapshot);
  const updateDevice = useFleetStore((s) => s.updateDevice);
  const markDeviceOffline = useFleetStore((s) => s.markDeviceOffline);
  const addAlert = useFleetStore((s) => s.addAlert);
  const setConnected = useFleetStore((s) => s.setConnected);
  const setFleetStats = useFleetStore((s) => s.setFleetStats);
  const setAlertsSnapshot = useFleetStore((s) => s.setAlertsSnapshot);
  const setServerClockOffset = useFleetStore((s) => s.setServerClockOffset);
  const setGlobalManuallyResolvedIds = useFleetStore((s) => s.setGlobalManuallyResolvedIds);

  useEffect(() => {
    if (!isAuthenticated()) return;

    // ── Initial REST fetch for fleet data ──────────────────
    const fetchInitialData = async () => {
      try {
        const [devices, stats, alerts] = await Promise.all([
          api.getFleet(),
          api.getFleetStats(),
          api.getAllAlerts(),
        ]);
        setFleetSnapshot(devices);
        setFleetStats(stats);
        setAlertsSnapshot(alerts);
        setConnected(true);

        // Fetch command history for all devices to sync manually resolved alerts across sessions
        try {
          const commandHistories = await Promise.all(
            devices.map((d) => api.getCommandHistory(d.deviceId).catch(() => []))
          );
          const manualResolved = new Set<number>();
          for (const history of commandHistories) {
            for (const cmd of history) {
              if (cmd.command.startsWith('RESOLVE_ALERT_')) {
                const id = parseInt(cmd.command.replace('RESOLVE_ALERT_', ''), 10);
                if (!isNaN(id)) {
                  manualResolved.add(id);
                }
              }
            }
          }
          setGlobalManuallyResolvedIds(manualResolved);
        } catch (err) {
          console.warn('Failed to sync manually resolved alerts from command history:', err);
        }

        // Dynamically compute the server-client clock offset based on the latest timestamps
        let maxOnlineTime = 0;
        for (const d of devices) {
          if (d.online && d.lastSeen) {
            let lastSeenTime = new Date(d.lastSeen).getTime();
            if (typeof d.lastSeen === 'string' && !d.lastSeen.endsWith('Z') && !d.lastSeen.includes('+')) {
              lastSeenTime = new Date(d.lastSeen.replace(' ', 'T') + 'Z').getTime();
            }
            if (lastSeenTime > maxOnlineTime) maxOnlineTime = lastSeenTime;
          }
        }

        if (maxOnlineTime > 0) {
          // If a device is currently online, synchronize client-server offset perfectly based on its heartbeat
          setServerClockOffset(maxOnlineTime - Date.now() + 1000);
        } else {
          // Fallback: if all devices are offline, calibrate only if client clock is behind (to avoid shifting to past dates)
          let maxTime = 0;
          for (const d of devices) {
            if (d.lastSeen) {
              let lastSeenTime = new Date(d.lastSeen).getTime();
              if (typeof d.lastSeen === 'string' && !d.lastSeen.endsWith('Z') && !d.lastSeen.includes('+')) {
                lastSeenTime = new Date(d.lastSeen.replace(' ', 'T') + 'Z').getTime();
              }
              if (lastSeenTime > maxTime) maxTime = lastSeenTime;
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
            setServerClockOffset(maxTime - Date.now() + 1000);
          }
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
        // WebSocket event is real-time; calibrate clock offset directly
        setServerClockOffset(t - Date.now() + 1000);
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
        // WebSocket event is real-time; calibrate clock offset directly
        setServerClockOffset(t - Date.now() + 1000);
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
      // Snapshot the device's current location from the store at the moment the alert fires
      const currentDevice = useFleetStore.getState().devices[a.deviceId];
      const alertWithLocation: Alert = {
        ...a,
        alertLat: currentDevice?.latitude ?? null,
        alertLng: currentDevice?.longitude ?? null,
      };
      addAlert(alertWithLocation);
      if (a.createdAt) {
        let t = new Date(a.createdAt).getTime();
        if (typeof a.createdAt === 'string' && !a.createdAt.endsWith('Z') && !a.createdAt.includes('+')) {
          t = new Date(a.createdAt.replace(' ', 'T') + 'Z').getTime();
        }
        // WebSocket event is real-time; calibrate clock offset directly
        setServerClockOffset(t - Date.now() + 1000);
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
