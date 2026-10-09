import { ApiError } from '@/api/client';

/** Human-readable message for any thrown value, with friendlier auth errors. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your admin token was rejected. Sign in again.';
    if (error.status === 403) return `Forbidden: ${error.message}`;
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
