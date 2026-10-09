import createClient, { type Middleware } from 'openapi-fetch';
import { clearToken, getToken } from '@/lib/auth';
import { apiBaseUrl } from '@/lib/urls';
import type { paths } from './schema';
import type { ApiErrorBody } from './types';

/** Error thrown by `unwrap` for any non-2xx response. */
export class ApiError extends Error {
  readonly status: number;
  readonly type: string | undefined;
  readonly code: string | null | undefined;

  constructor(status: number, message: string, type?: string, code?: string | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.type = type;
    this.code = code;
  }
}

const authMiddleware: Middleware = {
  onRequest({ request }) {
    const token = getToken();
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    return request;
  },
  onResponse({ response }) {
    // An expired or rotated admin token: drop it so the router sends the user
    // back to the login screen on the next navigation.
    if (response.status === 401) clearToken();
    return response;
  },
};

export function createApiClient(baseUrl: string = apiBaseUrl()) {
  const client = createClient<paths>({
    baseUrl,
    // Resolve fetch at call time (not import time) so tests can stub it.
    fetch: (input: Request) => globalThis.fetch(input),
  });
  client.use(authMiddleware);
  return client;
}

export const api = createApiClient();

/**
 * Path serializer for ids that legitimately contain '/', such as model ids
 * (`local/qwen3-8b`). openapi-fetch's default `encodeURIComponent`s the whole
 * value and would send `local%2Fqwen3-8b`, which the server's catch-all route
 * does not match. This encodes each segment but keeps the slashes. Pass it as
 * `pathSerializer` on the request.
 */
export function slashPreservingPath(pathname: string, pathParams: Record<string, unknown>): string {
  return pathname.replace(/\{([^}]+)\}/g, (match, name: string) => {
    const value = pathParams[name];
    if (typeof value !== 'string' && typeof value !== 'number') return match;
    return String(value).split('/').map(encodeURIComponent).join('/');
  });
}

function isErrorBody(v: unknown): v is ApiErrorBody {
  return typeof v === 'object' && v !== null && 'error' in v && typeof v.error === 'object';
}

/**
 * Turns an openapi-fetch result into data-or-throw, which is what TanStack
 * Query wants. Error messages come from the contract's `Error` envelope.
 */
export async function unwrap<T>(
  promise: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: Awaited<typeof promise>;
  try {
    result = await promise;
  } catch (e) {
    throw new ApiError(
      0,
      `Cannot reach the control plane: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const { data, error, response } = result;
  if (!response.ok) {
    if (isErrorBody(error)) {
      throw new ApiError(response.status, error.error.message, error.error.type, error.error.code);
    }
    throw new ApiError(
      response.status,
      `${response.status} ${response.statusText || 'Request failed'}`,
    );
  }
  return data as T;
}
