import { afterEach, describe, expect, it } from 'vitest';
import {
  clearToken,
  getToken,
  isAuthenticated,
  setCsrfToken,
  setToken,
  takeSessionExpired,
} from '@/lib/auth';
import { mockApi } from '@/test/utils';
import { api, ApiError, slashPreservingPath, unwrap } from './client';

describe('api client', () => {
  afterEach(() => clearToken());

  it('sends the admin token as a Bearer header', async () => {
    setToken('adm_123');
    const calls = mockApi({ 'GET /api/v1/models': () => ({ body: [] }) });
    await expect(unwrap(api.GET('/api/v1/models'))).resolves.toEqual([]);
    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer adm_123');
  });

  it('throws ApiError carrying the contract error envelope', async () => {
    setToken('adm_123');
    mockApi({
      'POST /api/v1/tenants': () => ({
        status: 400,
        body: {
          error: {
            message: 'name is required',
            type: 'invalid_request_error',
            code: 'missing_name',
          },
        },
      }),
    });
    const err = await unwrap(api.POST('/api/v1/tenants', { body: { name: '' } })).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      message: 'name is required',
      type: 'invalid_request_error',
    });
  });

  it('drops the token on 401 so the route guard sends the user to login', async () => {
    setToken('expired');
    mockApi({
      'GET /api/v1/tenants': () => ({
        status: 401,
        body: { error: { message: 'bad token', type: 'authentication_error' } },
      }),
    });
    await expect(unwrap(api.GET('/api/v1/tenants'))).rejects.toBeInstanceOf(ApiError);
    expect(getToken()).toBeNull();
  });
});

describe('api client in session mode (single sign-on)', () => {
  afterEach(() => setCsrfToken(null));

  it('sends the cookie same-origin and no Authorization header', async () => {
    setCsrfToken('csrf-1');
    const calls = mockApi({ 'GET /api/v1/models': () => ({ body: [] }) });
    let credentials: RequestCredentials | undefined;
    const fetchStub = globalThis.fetch;
    globalThis.fetch = (input: RequestInfo | URL) => {
      credentials = (input as Request).credentials;
      return fetchStub(input);
    };
    try {
      await unwrap(api.GET('/api/v1/models'));
    } finally {
      globalThis.fetch = fetchStub;
    }
    expect(credentials).toBe('same-origin');
    expect(calls[0]?.headers.has('Authorization')).toBe(false);
    // Reads need no CSRF token.
    expect(calls[0]?.headers.has('X-CSRF-Token')).toBe(false);
  });

  it('adds X-CSRF-Token to every write', async () => {
    setCsrfToken('csrf-1');
    const calls = mockApi({
      'POST /api/v1/tenants': () => ({ status: 201, body: {} }),
      'PATCH /api/v1/tenants/acme': () => ({ body: {} }),
      'PUT /api/v1/tenants/acme/routes': () => ({ body: {} }),
      'DELETE /api/v1/tenants/acme': () => ({ status: 204 }),
    });
    await unwrap(api.POST('/api/v1/tenants', { body: { name: 'Acme' } }));
    await unwrap(
      api.PATCH('/api/v1/tenants/{tenantId}', {
        params: { path: { tenantId: 'acme' } },
        body: { pii_default: 'mask' },
      }),
    );
    await unwrap(
      api.PUT('/api/v1/tenants/{tenantId}/routes', {
        params: { path: { tenantId: 'acme' } },
        body: { routes: [] },
      }),
    );
    await unwrap(
      api.DELETE('/api/v1/tenants/{tenantId}', { params: { path: { tenantId: 'acme' } } }),
    );
    expect(calls.map((c) => [c.method, c.headers.get('X-CSRF-Token')])).toEqual([
      ['POST', 'csrf-1'],
      ['PATCH', 'csrf-1'],
      ['PUT', 'csrf-1'],
      ['DELETE', 'csrf-1'],
    ]);
  });

  it('sends no CSRF token with the admin token', async () => {
    setCsrfToken('csrf-1');
    setToken('adm_123');
    const calls = mockApi({ 'POST /api/v1/tenants': () => ({ status: 201, body: {} }) });
    await unwrap(api.POST('/api/v1/tenants', { body: { name: 'Acme' } }));
    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer adm_123');
    expect(calls[0]?.headers.has('X-CSRF-Token')).toBe(false);
  });

  it('ends the session on 401 so the sign-in screen can say it expired', async () => {
    setCsrfToken('csrf-1');
    mockApi({
      'GET /api/v1/tenants': () => ({
        status: 401,
        body: { error: { message: 'session expired', type: 'authentication_error' } },
      }),
    });
    await expect(unwrap(api.GET('/api/v1/tenants'))).rejects.toMatchObject({ status: 401 });
    expect(isAuthenticated()).toBe(false);
    expect(takeSessionExpired()).toBe(true);
    expect(takeSessionExpired()).toBe(false);
  });

  it('keeps the session on 403: the role, not the session, is the problem', async () => {
    setCsrfToken('csrf-1');
    mockApi({
      'POST /api/v1/tenants': () => ({
        status: 403,
        body: {
          error: { message: "permission 'tenants.create' is required", type: 'permission_error' },
        },
      }),
    });
    await expect(
      unwrap(api.POST('/api/v1/tenants', { body: { name: 'Acme' } })),
    ).rejects.toMatchObject({ status: 403, type: 'permission_error' });
    expect(isAuthenticated()).toBe(true);
  });
});

describe('slashPreservingPath', () => {
  it('keeps slashes in a path param but encodes everything else', () => {
    expect(
      slashPreservingPath('http://h/api/v1/models/{modelId}', { modelId: 'local/qwen3 8b?x' }),
    ).toBe('http://h/api/v1/models/local/qwen3%208b%3Fx');
  });

  it('leaves unknown placeholders alone', () => {
    expect(slashPreservingPath('/a/{b}', {})).toBe('/a/{b}');
  });
});
