import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';
import type { DeviceStatus, Alert, FleetStatsResponse } from '../types/fleet.types';

const MAX_ALERTS = 100;

interface FleetState {
  // ─── Device State ──────────────────────────────────
  devices: Record<string, DeviceStatus>;
  isConnected: boolean;
  serverClockOffset: number;

  // ─── Fleet Stats (from REST) ───────────────────────
  fleetStats: FleetStatsResponse | null;

  // ─── Alerts ────────────────────────────────────────
  alerts: Alert[];

  // ─── Actions ───────────────────────────────────────
  setFleetSnapshot: (devices: DeviceStatus[]) => void;
  updateDevice: (device: DeviceStatus) => void;
  markDeviceOffline: (deviceId: string) => void;
  addAlert: (alert: Alert) => void;
  removeAlert: (alertId: number) => void;
  clearAlerts: () => void;
  setConnected: (connected: boolean) => void;
  setFleetStats: (stats: FleetStatsResponse) => void;
  setAlertsSnapshot: (alerts: Alert[]) => void;
  setServerClockOffset: (offset: number) => void;
}

/**
 * Zustand store optimized for high-frequency (5s) telemetry updates.
 *
 * Key design decisions:
 * - Uses Record<string, DeviceStatus> for O(1) device lookup
 * - Alerts use a capped ring buffer (max 100)
 * - updateDevice does a selective merge to minimize re-renders
 */
export const useFleetStore = create<FleetState>((set) => ({
  devices: {},
  isConnected: false,
  serverClockOffset: 0,
  fleetStats: null,
  alerts: [],

  setFleetSnapshot: (devices) =>
    set(() => {
      const record: Record<string, DeviceStatus> = {};
      for (const d of devices) {
        record[d.deviceId] = d;
      }
      return { devices: record };
    }),

  updateDevice: (device) =>
    set((state) => ({
      devices: { ...state.devices, [device.deviceId]: device },
    })),

  markDeviceOffline: (deviceId) =>
    set((state) => {
      const existing = state.devices[deviceId];
      if (!existing) return state;

      return {
        devices: {
          ...state.devices,
          [deviceId]: { ...existing, online: false },
        },
      };
    }),

  addAlert: (alert) =>
    set((state) => {
      // Avoid duplicates by ID
      if (state.alerts.some((a) => a.id === alert.id)) return state;
      const newAlerts = [alert, ...state.alerts].slice(0, MAX_ALERTS);
      return { alerts: newAlerts };
    }),

  removeAlert: (alertId) =>
    set((state) => ({
      alerts: state.alerts.filter((a) => a.id !== alertId),
    })),

  clearAlerts: () => set({ alerts: [] }),

  setConnected: (connected) => set({ isConnected: connected }),

  setFleetStats: (stats) => set({ fleetStats: stats }),

  setAlertsSnapshot: (alerts) => set({ alerts }),

  setServerClockOffset: (offset) => set({ serverClockOffset: offset }),
}));

// ─── Selectors (for optimized re-renders) ─────────────────────────────────

/** Returns all devices as an array, sorted by deviceId */
export const useDeviceList = () =>
  useFleetStore(
    useShallow((s) =>
      Object.values(s.devices).sort((a, b) =>
        a.deviceId.localeCompare(b.deviceId),
      ),
    ),
  );

/** Returns a single device by ID */
export const useDevice = (deviceId: string) =>
  useFleetStore((s) => s.devices[deviceId] ?? null);

/** Returns only devices with coordinates (for map) */
export const useMapDevices = () =>
  useFleetStore(
    useShallow((s) =>
      Object.values(s.devices).filter(
        (d) => d.latitude !== null && d.longitude !== null,
      ),
    ),
  );

/** Returns fleet summary stats — prefers REST stats, falls back to computed */
export const useFleetStats = () =>
  useFleetStore(
    useShallow((s) => {
      if (s.fleetStats) {
        return {
          total: s.fleetStats.totalDevices,
          online: s.fleetStats.onlineDevices,
          offline: s.fleetStats.offlineDevices,
          sosActive: s.fleetStats.activeSOS,
          lowBattery: s.fleetStats.lowBatteryDevices,
        };
      }
      // Fallback: compute from device list
      const devices = Object.values(s.devices);
      return {
        total: devices.length,
        online: devices.filter((d) => d.online).length,
        offline: devices.filter((d) => !d.online).length,
        sosActive: devices.filter((d) => d.sosActive).length,
        lowBattery: devices.filter(
          (d) => d.batteryPercentage !== null && d.batteryPercentage < 20,
        ).length,
      };
    }),
  );

/** Returns the latest N alerts */
export const useLatestAlerts = (count = 20) =>
  useFleetStore(
    useShallow((s) => s.alerts.slice(0, count)),
  );
