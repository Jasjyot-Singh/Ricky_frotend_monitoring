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
        // Add existing unresolved alerts to the feed
        for (const alert of alerts) {
          addAlert(alert);
        }
      } catch (err) {
        console.error('Failed to fetch initial fleet data:', err);
      }
    };

    fetchInitialData();

    // ── WebSocket event handlers ──────────────────────────
    const handleTelemetryUpdate = (data: unknown) => {
      updateDevice(data as DeviceStatus);
    };

    const handleLocationUpdate = (data: unknown) => {
      // Location updates carry full status; update the device
      updateDevice(data as DeviceStatus);
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
      addAlert(data as Alert);
    };

    // ── Connection state tracking ─────────────────────────
    const unsubConnection = fleetSocket.onConnectionChange((connected) => {
      setConnected(connected);
      if (connected) {
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
      fleetSocket.off('telemetry-update', handleTelemetryUpdate);
      fleetSocket.off('location-update', handleLocationUpdate);
      fleetSocket.off('sos-alert', handleSosAlert);
      fleetSocket.off('device-online', handleDeviceOnline);
      fleetSocket.off('device-offline', handleDeviceOffline);
      fleetSocket.off('alert-created', handleAlertCreated);
      unsubConnection();
    };
  }, [setFleetSnapshot, updateDevice, markDeviceOffline, addAlert, setConnected, setFleetStats]);
}
