// ─── Shared Types (mirrors Spring Boot backend API contracts) ─────────────────

// ─── Nested Objects in Fleet Response ────────────────────────────────────────

export interface SystemData {
  cpu: number;
  ram: number;
  disk: number;
  temp: number;
}

export interface HardwareData {
  espConnected: boolean;
  gpsConnected: boolean;
  imuConnected: boolean;
  displayConnected: boolean;
}

export interface ImuData {
  accelX: number;
  accelY: number;
  accelZ: number;
  gyroX: number;
  gyroY: number;
  gyroZ: number;
}

// ─── Fleet Device Status (GET /api/v1/fleet response item) ───────────────────

export interface DeviceStatus {
  deviceId: string;
  vehicleNumber: string;
  driverName: string | null;
  firmwareVersion: string | null;
  online: boolean;
  lastSeen: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  gpsFix: boolean;
  batteryPercentage: number | null;
  batteryVoltage: number | null;
  charging: boolean;
  powerSource: string | null;
  internetConnected: boolean;
  sosActive: boolean;
  sosSource: string | null;
  system: SystemData;
  hardware: HardwareData;
  imu: ImuData;
}

// ─── Device Detail Response (GET /api/v1/devices/{deviceId}) ─────────────────

export interface LiveStatusDetail {
  online: boolean;
  lastSeen: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  gpsFix: boolean;
  batteryPercentage: number | null;
  batteryVoltage: number | null;
  charging: boolean;
  powerSource: string | null;
  internetConnected: boolean;
  cpuUsage: number | null;
  ramUsage: number | null;
  diskUsage: number | null;
  cpuTemperature: number | null;
  espConnected: boolean;
  gpsConnected: boolean;
  imuConnected: boolean;
  displayConnected: boolean;
  posterBookingRunning: boolean;
  telemetryServiceRunning: boolean;
  sosActive: boolean;
  sosSource: string | null;
  imuAccelX: number | null;
  imuAccelY: number | null;
  imuAccelZ: number | null;
  imuGyroX: number | null;
  imuGyroY: number | null;
  imuGyroZ: number | null;
  updatedAt: string | null;
}

export interface DeviceDetailResponse {
  deviceId: string;
  vehicleNumber: string;
  driverName: string | null;
  createdAt: string;
  liveStatus: LiveStatusDetail;
}

// ─── Fleet Stats (GET /api/v1/fleet/stats) ───────────────────────────────────

export interface FleetStatsResponse {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  activeSOS: number;
  lowBatteryDevices: number;
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export const AlertType = {
  SOS: 'SOS',
  LOW_BATTERY: 'LOW_BATTERY',
  DEVICE_OFFLINE: 'DEVICE_OFFLINE',
  GPS_FAILURE: 'GPS_FAILURE',
  INTERNET_FAILURE: 'INTERNET_FAILURE',
  ESP_DISCONNECTED: 'ESP_DISCONNECTED',
  DISPLAY_FAILURE: 'DISPLAY_FAILURE',
  POSTER_SERVICE_DOWN: 'POSTER_SERVICE_DOWN',
  TELEMETRY_SERVICE_DOWN: 'TELEMETRY_SERVICE_DOWN',
} as const;

export type AlertType = (typeof AlertType)[keyof typeof AlertType];

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface Alert {
  id: number;
  deviceId: string;
  vehicleNumber?: string;
  type: AlertType | string;
  message: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt: string | null;
  /** Frontend-only: lat/lng of the device at the moment the alert was captured (from live store) */
  alertLat?: number | null;
  alertLng?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** Derive severity from alert type for UI styling */
export function getAlertSeverity(type: string): AlertSeverity {
  switch (type) {
    case 'SOS':
    case 'DEVICE_OFFLINE':
      return 'CRITICAL';
    case 'LOW_BATTERY':
    case 'GPS_FAILURE':
    case 'INTERNET_FAILURE':
    case 'ESP_DISCONNECTED':
      return 'WARNING';
    default:
      return 'INFO';
  }
}

// ─── Location History (GET /api/v1/devices/{id}/routes) ──────────────────────

export interface LocationPoint {
  latitude: number;
  longitude: number;
  speed: number | null;
  timestamp: string;
}

// ─── SOS Events (GET /api/v1/devices/{id}/sos-history) ───────────────────────

export interface SosEvent {
  id: number;
  source: string | null;
  timestamp: string;
  resolved: boolean;
  resolvedAt: string | null;
}

// ─── Telemetry History (GET /api/v1/devices/{id}/telemetry-history) ──────────

export interface TelemetryHistoryPoint {
  timestamp: string;
  batteryPercentage: number | null;
  cpuUsage: number | null;
  cpuTemperature: number | null;
}

// ─── Health Response (GET /api/v1/devices/{id}/health) ───────────────────────

export interface HealthResponse {
  deviceId: string;
  online: boolean;
  internetConnected: boolean;
  hardware: HardwareData;
  services: {
    posterBookingRunning: boolean;
    telemetryServiceRunning: boolean;
  };
}

// ─── Device Commands ─────────────────────────────────────────────────────────

export type CommandType = string;

export interface DeviceCommand {
  id: number;
  command: string;
  status: 'pending' | 'sent' | 'executed' | 'failed';
  createdAt: string;
  executedAt: string | null;
  response: string | null;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  message?: string;
}

// ─── Marker State (for map visualization) ────────────────────────────────────

export type MarkerState = 'healthy' | 'warning' | 'sos' | 'offline';

export function getMarkerState(device: DeviceStatus, serverClockOffset: number = 0): MarkerState {
  if (device.lastSeen) {
    let lastSeenTime = new Date(device.lastSeen).getTime();
    if (typeof device.lastSeen === 'string' && !device.lastSeen.endsWith('Z') && !device.lastSeen.includes('+')) {
      lastSeenTime = new Date(device.lastSeen.replace(' ', 'T') + 'Z').getTime();
    }
    const adjustedNow = Date.now() + serverClockOffset;
    if (adjustedNow - lastSeenTime > 5 * 60 * 1000) {
      return 'offline';
    }
  } else {
    return 'offline';
  }

  if (!device.online) return 'offline';
  if (device.sosActive) return 'sos';
  if (
    (device.batteryPercentage !== null && device.batteryPercentage < 20) ||
    !device.gpsFix ||
    !device.internetConnected
  ) {
    return 'warning';
  }
  return 'healthy';
}

export const MARKER_COLORS: Record<MarkerState, string> = {
  healthy: '#22c55e',
  warning: '#f59e0b',
  sos: '#ef4444',
  offline: '#64748b',
};
