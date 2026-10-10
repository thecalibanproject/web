import { readStorage, writeStorage } from './storage';

/**
 * Two ways to be signed in to the console:
 *
 * - **Token mode.** The bootstrap admin token (CALIBAN_ADMIN_TOKEN), which is
 *   the break-glass credential once single sign-on is configured. It lives in
 *   sessionStorage only: it is gone when the tab closes, and never written to
 *   localStorage or cookies. An in-memory fallback keeps the session working
 *   when storage is unavailable.
 * - **Session mode** (single sign-on). The control plane holds the session and
 *   the browser only has an HttpOnly cookie that scripts cannot read. The one
 *   thing the console keeps is the session's CSRF token (from `/auth/me`), in
 *   memory, to send as `X-CSRF-Token` on writes. Nothing goes to storage.
 */
const KEY = 'caliban.adminToken';
let memoryToken: string | null = null;
let csrfToken: string | null = null;
let sessionExpired = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

export function getToken(): string | null {
  return readStorage('session', KEY) ?? memoryToken;
}

export function setToken(token: string): void {
  const trimmed = token.trim();
  memoryToken = trimmed;
  writeStorage('session', KEY, trimmed);
  notify();
}

export function clearToken(): void {
  memoryToken = null;
  writeStorage('session', KEY, null);
  notify();
}

/** The session's CSRF token, while signed in with single sign-on. */
export function getCsrfToken(): string | null {
  return csrfToken;
}

/** Kept in memory only. Set when `/auth/me` confirms a console session. */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/** Forgets the console session on this side (after sign-out). */
export function clearSession(): void {
  csrfToken = null;
  notify();
}

/**
 * The control plane answered 401 to a request made with the session cookie:
 * the session expired, was revoked, or timed out while idle. The sign-in
 * screen says so once (see `takeSessionExpired`).
 */
export function markSessionExpired(): void {
  csrfToken = null;
  sessionExpired = true;
  notify();
}

/** True once after `markSessionExpired`. */
export function takeSessionExpired(): boolean {
  const was = sessionExpired;
  sessionExpired = false;
  return was;
}

/** Holds a token or a console session. */
export function isAuthenticated(): boolean {
  return Boolean(getToken()) || csrfToken !== null;
}

/** Subscribe to sign-in / sign-out. Returns an unsubscribe function. */
export function onAuthChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
