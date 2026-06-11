import { useMemo } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';
import type { DeviceStatus, Alert, FleetStatsResponse } from '../types/fleet.types';
import { getAlertSeverity } from '../types/fleet.types';

const MAX_ALERTS = 100;
const CLOCK_OFFSET_KEY = 'ricky_clock_offset';

/** Read persisted clock offset from sessionStorage (survives soft page refresh) */
function getPersistedClockOffset(): number {
  try {
    const v = sessionStorage.getItem(CLOCK_OFFSET_KEY);
    return v ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}

function persistClockOffset(offset: number): void {
  try {
    sessionStorage.setItem(CLOCK_OFFSET_KEY, String(offset));
  } catch { /* ignore */ }
}

interface FleetState {
  // ─── Device State ──────────────────────────────────
  devices: Record<string, DeviceStatus>;
  isConnected: boolean;
  serverClockOffset: number;

  // ─── Fleet Stats (from REST) ───────────────────────
  fleetStats: FleetStatsResponse | null;

  // ─── Alerts ────────────────────────────────────────
  alerts: Alert[];
  globalManuallyResolvedIds: Set<number>;

  // ─── Actions ───────────────────────────────────────
  setFleetSnapshot: (devices: DeviceStatus[]) => void;
  updateDevice: (device: any) => void;
  markDeviceOffline: (deviceId: string) => void;
  addAlert: (alert: Alert) => void;
  removeAlert: (alertId: number) => void;
  clearAlerts: () => void;
  setConnected: (connected: boolean) => void;
  setFleetStats: (stats: FleetStatsResponse) => void;
  setAlertsSnapshot: (alerts: Alert[]) => void;
  setServerClockOffset: (offset: number) => void;
  resolveAlertInStore: (alertId: number, resolvedAt: string) => void;
  setGlobalManuallyResolvedIds: (ids: Set<number>) => void;
}

/** Normalize flat LiveStatus from WebSocket update into nested DeviceStatus expected by frontend */
function normalizeLiveStatus(incoming: any, existing?: DeviceStatus): DeviceStatus {
  if (incoming && incoming.system && incoming.hardware && incoming.imu) {
    return incoming as DeviceStatus;
  }

  return {
    deviceId: incoming.deviceId,
    vehicleNumber: existing?.vehicleNumber ?? incoming.vehicleNumber ?? `PILOT-${incoming.deviceId?.replace(/[^0-9]/g, '') || 'TEST'}`,
    driverName: existing?.driverName ?? incoming.driverName ?? 'Pilot Driver',
    firmwareVersion: incoming.firmwareVersion ?? existing?.firmwareVersion ?? '1.0.0',
    online: incoming.online !== undefined ? incoming.online : (existing?.online ?? false),
    lastSeen: incoming.lastSeen ?? existing?.lastSeen ?? null,
    latitude: incoming.latitude !== undefined ? incoming.latitude : (existing?.latitude ?? null),
    longitude: incoming.longitude !== undefined ? incoming.longitude : (existing?.longitude ?? null),
    speed: incoming.speed !== undefined ? incoming.speed : (existing?.speed ?? null),
    gpsFix: incoming.gpsFix !== undefined ? incoming.gpsFix : (existing?.gpsFix ?? false),
    batteryPercentage: incoming.batteryPercentage !== undefined ? incoming.batteryPercentage : (existing?.batteryPercentage ?? null),
    batteryVoltage: incoming.batteryVoltage !== undefined ? incoming.batteryVoltage : (existing?.batteryVoltage ?? null),
    charging: incoming.charging !== undefined ? incoming.charging : (existing?.charging ?? false),
    powerSource: incoming.powerSource !== undefined ? incoming.powerSource : (existing?.powerSource ?? null),
    internetConnected: incoming.internetConnected !== undefined ? incoming.internetConnected : (existing?.internetConnected ?? false),
    sosActive: incoming.sosActive !== undefined ? incoming.sosActive : (existing?.sosActive ?? false),
    sosSource: incoming.sosSource !== undefined ? incoming.sosSource : (existing?.sosSource ?? null),
    system: {
      cpu: incoming.cpuUsage !== undefined ? incoming.cpuUsage : (existing?.system?.cpu ?? 0),
      ram: incoming.ramUsage !== undefined ? incoming.ramUsage : (existing?.system?.ram ?? 0),
      disk: incoming.diskUsage !== undefined ? incoming.diskUsage : (existing?.system?.disk ?? 0),
      temp: incoming.cpuTemperature !== undefined ? incoming.cpuTemperature : (existing?.system?.temp ?? 0.0),
    },
    hardware: {
      espConnected: incoming.espConnected !== undefined ? incoming.espConnected : (existing?.hardware?.espConnected ?? false),
      gpsConnected: incoming.gpsConnected !== undefined ? incoming.gpsConnected : (existing?.hardware?.gpsConnected ?? false),
      imuConnected: incoming.imuConnected !== undefined ? incoming.imuConnected : (existing?.hardware?.imuConnected ?? false),
      displayConnected: incoming.displayConnected !== undefined ? incoming.displayConnected : (existing?.hardware?.displayConnected ?? false),
    },
    imu: {
      accelX: incoming.imuAccelX !== undefined ? incoming.imuAccelX : (existing?.imu?.accelX ?? 0.0),
      accelY: incoming.imuAccelY !== undefined ? incoming.imuAccelY : (existing?.imu?.accelY ?? 0.0),
      accelZ: incoming.imuAccelZ !== undefined ? incoming.imuAccelZ : (existing?.imu?.accelZ ?? 0.0),
      gyroX: incoming.imuGyroX !== undefined ? incoming.imuGyroX : (existing?.imu?.gyroX ?? 0.0),
      gyroY: incoming.imuGyroY !== undefined ? incoming.imuGyroY : (existing?.imu?.gyroY ?? 0.0),
      gyroZ: incoming.imuGyroZ !== undefined ? incoming.imuGyroZ : (existing?.imu?.gyroZ ?? 0.0),
    }
  };
}

export const useFleetStore = create<FleetState>((set) => ({
  devices: {},
  isConnected: false,
  serverClockOffset: getPersistedClockOffset(),
  fleetStats: null,
  alerts: [],
  globalManuallyResolvedIds: new Set<number>(),

  setFleetSnapshot: (devices) =>
    set(() => {
      const record: Record<string, DeviceStatus> = {};
      for (const d of devices) {
        record[d.deviceId] = normalizeLiveStatus(d);
      }
      return { devices: record };
    }),

  updateDevice: (device) =>
    set((state) => {
      const existing = state.devices[device.deviceId];
      const normalized = normalizeLiveStatus(device, existing);
      return {
        devices: { ...state.devices, [device.deviceId]: normalized },
      };
    }),

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

  setServerClockOffset: (offset) => {
    persistClockOffset(offset);
    set({ serverClockOffset: offset });
  },

  resolveAlertInStore: (alertId, resolvedAt) =>
    set((state) => {
      const nextSet = new Set(state.globalManuallyResolvedIds);
      nextSet.add(alertId);
      return {
        globalManuallyResolvedIds: nextSet,
        alerts: state.alerts.map((a) =>
          a.id === alertId ? { ...a, resolved: true, resolvedAt } : a
        ),
      };
    }),

  setGlobalManuallyResolvedIds: (ids) => set({ globalManuallyResolvedIds: ids }),
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
      const devices = Object.values(s.devices);
      const adjustedNow = Date.now() + s.serverClockOffset;
      
      let online = 0;
      let offline = 0;
      let sosActive = 0;
      let lowBattery = 0;

      // Extract set of device IDs with active (unresolved) SOS or LOW_BATTERY alerts
      const activeSOSDevices = new Set(
        s.alerts
          .filter((a) => a.type === 'SOS' && !a.resolved && !s.globalManuallyResolvedIds.has(a.id))
          .map((a) => a.deviceId)
      );
      const activeBatteryDevices = new Set(
        s.alerts
          .filter((a) => a.type === 'LOW_BATTERY' && !a.resolved && !s.globalManuallyResolvedIds.has(a.id))
          .map((a) => a.deviceId)
      );

      for (const d of devices) {
        let isDeviceOffline = !d.online;
        if (d.lastSeen) {
          let lastSeenTime = new Date(d.lastSeen).getTime();
          if (typeof d.lastSeen === 'string' && !d.lastSeen.endsWith('Z') && !d.lastSeen.includes('+')) {
            lastSeenTime = new Date(d.lastSeen.replace(' ', 'T') + 'Z').getTime();
          }
          if (adjustedNow - lastSeenTime > 5 * 60 * 1000) {
            isDeviceOffline = true;
          }
        } else {
          isDeviceOffline = true;
        }

        if (isDeviceOffline) {
          offline++;
        } else {
          online++;
        }

        if (activeSOSDevices.has(d.deviceId)) {
          sosActive++;
        }
        if (activeBatteryDevices.has(d.deviceId)) {
          lowBattery++;
        }
      }

      return {
        total: devices.length,
        online,
        offline,
        sosActive,
        lowBattery,
      };
    }),
  );

/** Returns the latest N unresolved alerts, sorted by priority (CRITICAL -> WARNING -> INFO) and then by creation time */
export const useLatestAlerts = (count = 20) => {
  const alerts = useFleetStore((s) => s.alerts);
  const globalManuallyResolvedIds = useFleetStore((s) => s.globalManuallyResolvedIds);

  return useMemo(() => {
    const priorityOrder: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    // Enrich with local manual resolutions but respect backend/WS resolved flag
    const enriched = alerts.map((a) => ({
      ...a,
      resolved: a.resolved || globalManuallyResolvedIds.has(a.id),
      resolvedAt: (a.resolved || globalManuallyResolvedIds.has(a.id)) ? (a.resolvedAt || a.createdAt) : null,
    }));
    const unresolved = enriched.filter((a) => !a.resolved);
    const sorted = unresolved.sort((a, b) => {
      const sevA = getAlertSeverity(a.type);
      const sevB = getAlertSeverity(b.type);
      if (priorityOrder[sevA] !== priorityOrder[sevB]) {
        return priorityOrder[sevA] - priorityOrder[sevB];
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return sorted.slice(0, count);
  }, [alerts, globalManuallyResolvedIds, count]);
};

