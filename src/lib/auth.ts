// ─── JWT Token Management (Session & Memory Hybrid Store) ─────────────────────

const ACCESS_TOKEN_KEY = 'ricky_access_token';
const REFRESH_TOKEN_KEY = 'ricky_refresh_token';

let inMemoryAccessToken: string | null = sessionStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(ACCESS_TOKEN_KEY);
let inMemoryRefreshToken: string | null = sessionStorage.getItem(REFRESH_TOKEN_KEY) || localStorage.getItem(REFRESH_TOKEN_KEY);

export function getAccessToken(): string | null {
  if (!inMemoryAccessToken) {
    inMemoryAccessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(ACCESS_TOKEN_KEY);
  }
  return inMemoryAccessToken;
}

export function getRefreshToken(): string | null {
  if (!inMemoryRefreshToken) {
    inMemoryRefreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY) || localStorage.getItem(REFRESH_TOKEN_KEY);
  }
  return inMemoryRefreshToken;
}

export function setTokens(accessToken: string, refreshToken?: string): void {
  inMemoryAccessToken = accessToken;
  sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) {
    inMemoryRefreshToken = refreshToken;
    sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export function clearTokens(): void {
  inMemoryAccessToken = null;
  inMemoryRefreshToken = null;
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}
