import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './auth';
import type {
  DeviceStatus,
  FleetStatsResponse,
  Alert,
  DeviceDetailResponse,
  LocationPoint,
  SosEvent,
  TelemetryHistoryPoint,
  HealthResponse,
  DeviceCommand,
  LoginResponse,
} from '../types/fleet.types';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

// ─── Core Fetch Wrapper ──────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });

  // Auto-refresh on 401
  if (res.status === 401 && token) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry the request with new token
      headers['Authorization'] = `Bearer ${getAccessToken()}`;
      const retryRes = await fetch(`${API_BASE}${path}`, {
        headers,
        ...options,
      });
      if (!retryRes.ok) {
        const body = await retryRes.json().catch(() => ({}));
        throw new Error(body.message || `API error: ${retryRes.status}`);
      }
      return retryRes.json();
    } else {
      clearTokens();
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `API error: ${res.status}`);
  }

  return res.json();
}

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return false;

    const data: LoginResponse = await res.json();
    if (data.success && data.accessToken && data.refreshToken) {
      setTokens(data.accessToken, data.refreshToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ─── API Methods ─────────────────────────────────────────────────────────────

export const api = {
  // ── Auth ──────────────────────────────────────────────────
  login: (username: string, password: string) =>
    apiFetch<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  refreshToken: (refreshToken: string) =>
    apiFetch<LoginResponse>('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  logout: () =>
    apiFetch<{ success: boolean; message: string }>('/api/v1/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  // ── Fleet Overview ────────────────────────────────────────
  /** Fetch all devices with live status */
  getFleet: (search?: string) => {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiFetch<DeviceStatus[]>(`/api/v1/fleet${params}`);
  },

  /** Fetch fleet aggregate statistics */
  getFleetStats: () =>
    apiFetch<FleetStatsResponse>('/api/v1/fleet/stats'),

  /** Fetch active fleet alerts */
  getFleetAlerts: () =>
    apiFetch<Alert[]>('/api/v1/fleet/alerts'),

  // ── Device Details ────────────────────────────────────────
  /** Fetch single device with full live status */
  getDevice: (deviceId: string) =>
    apiFetch<DeviceDetailResponse>(`/api/v1/devices/${deviceId}`),

  /** Fetch route history for a device */
  getRouteHistory: (deviceId: string, fromDate: string, toDate: string) => {
    const params = new URLSearchParams({ fromDate, toDate });
    return apiFetch<LocationPoint[]>(
      `/api/v1/devices/${deviceId}/routes?${params}`,
    );
  },

  /** Fetch SOS event history for a device */
  getSosHistory: (deviceId: string) =>
    apiFetch<SosEvent[]>(`/api/v1/devices/${deviceId}/sos-history`),

  /** Fetch telemetry history for charts */
  getTelemetryHistory: (deviceId: string) =>
    apiFetch<TelemetryHistoryPoint[]>(
      `/api/v1/devices/${deviceId}/telemetry-history`,
    ),

  /** Fetch device health metrics */
  getHealth: (deviceId: string) =>
    apiFetch<HealthResponse>(`/api/v1/devices/${deviceId}/health`),

  // ── Alerts ────────────────────────────────────────────────
  /** Fetch all alerts (active + resolved) */
  getAllAlerts: () =>
    apiFetch<Alert[]>('/api/v1/alerts'),

  /** Fetch alerts for a specific device */
  getDeviceAlerts: (deviceId: string) =>
    apiFetch<Alert[]>(`/api/v1/alerts/${deviceId}`),

  /** Resolve an alert */
  resolveAlert: (alertId: number) =>
    apiFetch<{ success: boolean; alertId: number; resolved: boolean; resolvedAt: string }>(
      `/api/v1/alerts/${alertId}/resolve`,
      { method: 'PATCH' },
    ),

  // ── Commands ──────────────────────────────────────────────
  /** Send a remote command to a device */
  sendCommand: (deviceId: string, command: string) =>
    apiFetch<{ success: boolean; commandId: number; status: string; message: string }>(
      `/api/v1/devices/${deviceId}/commands`,
      {
        method: 'POST',
        body: JSON.stringify({ command }),
      },
    ),

  /** Get command history for a device */
  getCommandHistory: (deviceId: string) =>
    apiFetch<DeviceCommand[]>(`/api/v1/devices/${deviceId}/commands`),
};
