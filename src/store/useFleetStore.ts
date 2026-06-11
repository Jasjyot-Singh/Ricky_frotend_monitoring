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
  const isNested = incoming && incoming.system && incoming.hardware && incoming.imu;
  
  const deviceId = incoming.deviceId;
  const vehicleNumber = existing?.vehicleNumber ?? incoming.vehicleNumber ?? `PILOT-${incoming.deviceId?.replace(/[^0-9]/g, '') || 'TEST'}`;
  const driverName = existing?.driverName ?? incoming.driverName ?? 'Pilot Driver';
  const firmwareVersion = incoming.firmwareVersion ?? existing?.firmwareVersion ?? '1.0.0';
  const online = incoming.online !== undefined ? incoming.online : (existing?.online ?? false);
  const lastSeen = incoming.lastSeen ?? existing?.lastSeen ?? null;
  const latitude = incoming.latitude !== undefined ? incoming.latitude : (isNested ? incoming.latitude : (existing?.latitude ?? null));
  const longitude = incoming.longitude !== undefined ? incoming.longitude : (isNested ? incoming.longitude : (existing?.longitude ?? null));
  const speed = incoming.speed !== undefined ? incoming.speed : (isNested ? incoming.speed : (existing?.speed ?? null));
  const gpsFix = incoming.gpsFix !== undefined ? incoming.gpsFix : (existing?.gpsFix ?? false);
  const batteryPercentage = incoming.batteryPercentage !== undefined ? incoming.batteryPercentage : (existing?.batteryPercentage ?? null);
  const batteryVoltage = incoming.batteryVoltage !== undefined ? incoming.batteryVoltage : (existing?.batteryVoltage ?? null);
  const charging = incoming.charging !== undefined ? incoming.charging : (existing?.charging ?? false);
  const powerSource = incoming.powerSource !== undefined ? incoming.powerSource : (existing?.powerSource ?? null);
  const internetConnected = incoming.internetConnected !== undefined ? incoming.internetConnected : (existing?.internetConnected ?? false);
  const sosActive = incoming.sosActive !== undefined ? incoming.sosActive : (existing?.sosActive ?? false);
  const sosSource = incoming.sosSource !== undefined ? incoming.sosSource : (existing?.sosSource ?? null);

  const system = isNested ? incoming.system : {
    cpu: incoming.cpuUsage !== undefined ? incoming.cpuUsage : (existing?.system?.cpu ?? 0),
    ram: incoming.ramUsage !== undefined ? incoming.ramUsage : (existing?.system?.ram ?? 0),
    disk: incoming.diskUsage !== undefined ? incoming.diskUsage : (existing?.system?.disk ?? 0),
    temp: incoming.cpuTemperature !== undefined ? incoming.cpuTemperature : (existing?.system?.temp ?? 0.0),
  };

  const hardware = isNested ? incoming.hardware : {
    espConnected: incoming.espConnected !== undefined ? incoming.espConnected : (existing?.hardware?.espConnected ?? false),
    gpsConnected: incoming.gpsConnected !== undefined ? incoming.gpsConnected : (existing?.hardware?.gpsConnected ?? false),
    imuConnected: incoming.imuConnected !== undefined ? incoming.imuConnected : (existing?.hardware?.imuConnected ?? false),
    displayConnected: incoming.displayConnected !== undefined ? incoming.displayConnected : (existing?.hardware?.displayConnected ?? false),
  };

  const imu = isNested ? incoming.imu : {
    accelX: incoming.imuAccelX !== undefined ? incoming.imuAccelX : (existing?.imu?.accelX ?? 0.0),
    accelY: incoming.imuAccelY !== undefined ? incoming.imuAccelY : (existing?.imu?.accelY ?? 0.0),
    accelZ: incoming.imuAccelZ !== undefined ? incoming.imuAccelZ : (existing?.imu?.accelZ ?? 0.0),
    gyroX: incoming.imuGyroX !== undefined ? incoming.imuGyroX : (existing?.imu?.gyroX ?? 0.0),
    gyroY: incoming.imuGyroY !== undefined ? incoming.imuGyroY : (existing?.imu?.gyroY ?? 0.0),
    gyroZ: incoming.imuGyroZ !== undefined ? incoming.imuGyroZ : (existing?.imu?.gyroZ ?? 0.0),
  };

  // Determine last telemetry time
  let lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : Date.now();
  if (typeof lastSeen === 'string' && !lastSeen.endsWith('Z') && !lastSeen.includes('+')) {
    lastSeenTime = new Date(lastSeen.replace(' ', 'T') + 'Z').getTime();
  }

  const lastTelemetryTime = lastSeenTime;

  let lastBatteryIncreaseTime = existing?.lastBatteryIncreaseTime ?? lastSeenTime;
  if (batteryPercentage !== null) {
    if (batteryPercentage >= 100) {
      lastBatteryIncreaseTime = lastSeenTime;
    } else if (existing && existing.batteryPercentage !== null && batteryPercentage > existing.batteryPercentage) {
      lastBatteryIncreaseTime = lastSeenTime;
    }
  }

  return {
    deviceId,
    vehicleNumber,
    driverName,
    firmwareVersion,
    online,
    lastSeen,
    latitude,
    longitude,
    speed,
    gpsFix,
    batteryPercentage,
    batteryVoltage,
    charging,
    powerSource,
    internetConnected,
    sosActive,
    sosSource,
    system,
    hardware,
    imu,
    lastTelemetryTime,
    lastBatteryIncreaseTime,
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

// ─── Dynamic Status Computation Helper ────────────────────────────────────

export function computeActiveStatus(device: DeviceStatus, serverClockOffset: number): DeviceStatus {
  if (!device) return device;
  
  const adjustedNow = Date.now() + serverClockOffset;
  
  let lastSeenTime = device.lastTelemetryTime ?? 0;
  if (!lastSeenTime && device.lastSeen) {
    lastSeenTime = new Date(device.lastSeen).getTime();
    if (typeof device.lastSeen === 'string' && !device.lastSeen.endsWith('Z') && !device.lastSeen.includes('+')) {
      lastSeenTime = new Date(device.lastSeen.replace(' ', 'T') + 'Z').getTime();
    }
  }
  
  const timeSinceLastTelemetry = lastSeenTime > 0 ? (adjustedNow - lastSeenTime) : Infinity;
  
  // 30 seconds telemetry activity limit
  const isRecent = timeSinceLastTelemetry <= 30000;
  
  // 1. Internet active: inactive if no telemetry in 30 seconds
  const internetActive = device.internetConnected && isRecent;
  
  // 2. GPS active: inactive if no telemetry in 30 seconds OR coordinates are (0,0)
  const isZeroCoords = (device.latitude === 0 || device.latitude === null) && 
                       (device.longitude === 0 || device.longitude === null);
  const gpsActive = device.gpsFix && isRecent && !isZeroCoords;
  
  // 3. Charging active: inactive if no telemetry in 30 seconds OR battery stagnant at <100% for 30s
  let chargingActive = device.charging && isRecent;
  if (chargingActive && device.batteryPercentage !== null && device.batteryPercentage < 100) {
    const lastInc = device.lastBatteryIncreaseTime ?? lastSeenTime;
    const timeSinceIncrease = adjustedNow - lastInc;
    if (timeSinceIncrease > 30000) {
      chargingActive = false;
    }
  }

  // 4. Online active: offline if no telemetry in 5 minutes (300,000 ms), OR if coordinates are (0,0) and no data for 30s
  const isRecent5Min = timeSinceLastTelemetry <= 300000;
  const onlineActive = device.online && isRecent5Min && !(isZeroCoords && !isRecent);

  return {
    ...device,
    online: onlineActive,
    charging: chargingActive,
    gpsFix: gpsActive,
    internetConnected: internetActive,
    hardware: {
      ...device.hardware,
      gpsConnected: device.hardware.gpsConnected && isRecent && !isZeroCoords,
      espConnected: device.hardware.espConnected && isRecent,
      displayConnected: device.hardware.displayConnected && isRecent,
    }
  };
}

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

      const adjustedNow = Date.now() + s.serverClockOffset;
      for (const d of devices) {
        // Determine offline using 5-minute threshold directly (no Date.now in selector above)
        let lastSeenTime = d.lastTelemetryTime ?? 0;
        if (!lastSeenTime && d.lastSeen) {
          lastSeenTime = new Date(d.lastSeen).getTime();
          if (typeof d.lastSeen === 'string' && !d.lastSeen.endsWith('Z') && !d.lastSeen.includes('+')) {
            lastSeenTime = new Date(d.lastSeen.replace(' ', 'T') + 'Z').getTime();
          }
        }
        const timeSince = lastSeenTime > 0 ? (adjustedNow - lastSeenTime) : Infinity;
        const isRecent = timeSince <= 30000;
        const isRecent5Min = timeSince <= 300000;
        const isZeroCoords = (d.latitude === 0 || d.latitude === null) &&
                             (d.longitude === 0 || d.longitude === null);
        const isOnline = d.online && isRecent5Min && !(isZeroCoords && !isRecent);
        if (!isOnline) {
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

/** Returns a sorted array of active SOS device IDs based on current unresolved alerts */
export const useActiveSosDeviceIds = () =>
  useFleetStore(
    useShallow((s) => {
      const sosSet = new Set<string>();
      for (const a of s.alerts) {
        const isResolved = a.resolved || s.globalManuallyResolvedIds.has(a.id);
        if (!isResolved && a.type === 'SOS') {
          sosSet.add(a.deviceId);
        }
      }
      return Array.from(sosSet).sort();
    })
  );

/** Returns a sorted array of active Warning device IDs based on current unresolved alerts */
export const useActiveWarningDeviceIds = () =>
  useFleetStore(
    useShallow((s) => {
      const warningSet = new Set<string>();
      for (const a of s.alerts) {
        const isResolved = a.resolved || s.globalManuallyResolvedIds.has(a.id);
        if (!isResolved) {
          if (
            a.type === 'LOW_BATTERY' ||
            a.type === 'GPS_FAILURE' ||
            a.type === 'INTERNET_FAILURE' ||
            a.type === 'ESP_DISCONNECTED' ||
            a.type === 'DISPLAY_FAILURE' ||
            a.type === 'POSTER_SERVICE_DOWN' ||
            a.type === 'TELEMETRY_SERVICE_DOWN'
          ) {
            warningSet.add(a.deviceId);
          }
        }
      }
      return Array.from(warningSet).sort();
    })
  );

