// ─── JWT Token Management (In-Memory Module Store) ────────────────────────────

// Private module-scoped variables (NOT accessible to window.localStorage)
let inMemoryAccessToken: string | null = null;
let inMemoryRefreshToken: string | null = null;

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function getRefreshToken(): string | null {
  return inMemoryRefreshToken;
}

export function setTokens(accessToken: string, refreshToken?: string): void {
  inMemoryAccessToken = accessToken;
  if (refreshToken) {
    inMemoryRefreshToken = refreshToken;
  }
  // Proactively purge old legacy tokens from localStorage for security
  localStorage.removeItem('ricky_access_token');
  localStorage.removeItem('ricky_refresh_token');
}

export function clearTokens(): void {
  inMemoryAccessToken = null;
  inMemoryRefreshToken = null;
  localStorage.removeItem('ricky_access_token');
  localStorage.removeItem('ricky_refresh_token');
}

export function isAuthenticated(): boolean {
  return !!inMemoryAccessToken;
}

