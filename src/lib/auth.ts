import { readStorage, writeStorage } from './storage';

/**
 * The bootstrap admin token (CALIBAN_ADMIN_TOKEN) lives in sessionStorage only:
 * it is gone when the tab closes, and never written to localStorage or cookies.
 * An in-memory fallback keeps the session working when storage is unavailable.
 */
const KEY = 'caliban.adminToken';
let memoryToken: string | null = null;
const listeners = new Set<() => void>();

export function getToken(): string | null {
  return readStorage('session', KEY) ?? memoryToken;
}

export function setToken(token: string): void {
  const trimmed = token.trim();
  memoryToken = trimmed;
  writeStorage('session', KEY, trimmed);
  listeners.forEach((l) => l());
}

export function clearToken(): void {
  memoryToken = null;
  writeStorage('session', KEY, null);
  listeners.forEach((l) => l());
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

/** Subscribe to sign-in / sign-out. Returns an unsubscribe function. */
export function onAuthChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
