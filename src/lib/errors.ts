import { ApiError } from '@/api/client';

/**
 * A 403 for a request that came from the console but could not be tied to it
 * (missing or stale CSRF token, foreign origin). Not about roles.
 */
function isRequestRefused(error: ApiError): boolean {
  return /csrf|cross-origin/i.test(error.message);
}

/** Human-readable message for any thrown value, with friendlier auth errors. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return /session/i.test(error.message)
        ? 'Your session has ended. Sign in again.'
        : 'Your admin token was rejected. Sign in again.';
    }
    if (error.status === 403) {
      return isRequestRefused(error)
        ? `The control plane refused this request (${error.message}). Reload the page and try again.`
        : `Your role does not allow this (${error.message}).`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/** True for the contract's 404 envelope (unknown, foreign or deleted id). */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/** True when the caller's roles do not allow the request (403 `permission_error`). */
export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403 && !isRequestRefused(error);
}
