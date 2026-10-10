import { describe, expect, it } from 'vitest';
import { getCsrfToken, getToken, setToken } from '@/lib/auth';
import { meWith, ssoRoutes } from '@/test/auth';
import { mockApi } from '@/test/utils';
import { fetchAuthState } from './auth';

describe('fetchAuthState', () => {
  it('without single sign-on and without a token: nobody, and the token form', async () => {
    const calls = mockApi({
      'GET /auth/config': () => ({
        body: { sso_enabled: false, break_glass_enabled: true, login_url: null },
      }),
    });
    const s = await fetchAuthState();
    expect(s.config.sso_enabled).toBe(false);
    expect(s.principal).toBeNull();
    // Nothing to ask /auth/me with.
    expect(calls.map((c) => c.path)).toEqual(['/auth/config']);
  });

  it('a control plane from before single sign-on: token mode with every action offered', async () => {
    setToken('adm_1');
    mockApi({}); // /auth/config and /auth/me answer 404
    const s = await fetchAuthState();
    expect(s.config).toMatchObject({ sso_enabled: false, break_glass_enabled: true });
    expect(s.principal).toEqual({ mode: 'token', me: null });
    expect(s.error).toBeNull();
  });

  it('token mode describes the token through /auth/me', async () => {
    setToken('adm_1');
    const me = meWith([{ role: 'owner' }], { method: 'break_glass' });
    const calls = mockApi(ssoRoutes(me));
    const s = await fetchAuthState();
    expect(s.principal).toEqual({ mode: 'token', me });
    expect(calls[1]?.headers.get('Authorization')).toBe('Bearer adm_1');
    expect(getCsrfToken()).toBeNull();
  });

  it('a console session keeps its CSRF token in memory, nothing in storage', async () => {
    const me = meWith([{ role: 'viewer', tenant_id: 'acme' }]);
    mockApi(ssoRoutes(me));
    const s = await fetchAuthState();
    expect(s.principal).toEqual({ mode: 'session', me });
    expect(getCsrfToken()).toBe('csrf-test-token');
    expect(getToken()).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
    expect(window.localStorage.length).toBe(0);
  });

  it('single sign-on without a session: nobody', async () => {
    mockApi(ssoRoutes(null));
    const s = await fetchAuthState();
    expect(s.config.sso_enabled).toBe(true);
    expect(s.principal).toBeNull();
    expect(s.error).toBeNull();
  });

  it('a refused token is dropped', async () => {
    setToken('old');
    mockApi(ssoRoutes(null));
    const s = await fetchAuthState();
    expect(s.principal).toBeNull();
    expect(getToken()).toBeNull();
  });

  it('reports an unreachable control plane instead of guessing', async () => {
    mockApi({
      'GET /auth/config': () => ({ body: { sso_enabled: true, break_glass_enabled: false } }),
      'GET /auth/me': () => ({
        status: 503,
        body: { error: { message: 'store unavailable', type: 'api_error' } },
      }),
    });
    const s = await fetchAuthState();
    expect(s.principal).toBeNull();
    expect(s.error).toMatchObject({ status: 503 });
  });
});
