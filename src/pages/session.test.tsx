import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Tenant } from '@/api/types';
import { getToken } from '@/lib/auth';
import { browser } from '@/lib/browser';
import { meWith, ssoRoutes, type Grant } from '@/test/auth';
import { mockApi, renderApp } from '@/test/utils';

const acme: Tenant = {
  id: 'acme',
  name: 'Acme',
  created_at: '2026-10-01T10:00:00Z',
  status: 'active',
};

const unauthorized = (message: string) => ({
  status: 401,
  body: { error: { message, type: 'authentication_error' } },
});

const forbidden = (perm: string) => ({
  status: 403,
  body: { error: { message: `permission '${perm}' is required`, type: 'permission_error' } },
});

/** The tenant detail page's reads, for a session holding `roles`. */
function tenantRoutes(roles: Grant[]) {
  return {
    ...ssoRoutes(meWith(roles)),
    'GET /api/v1/tenants': () => ({ body: [acme] }),
    'GET /api/v1/tenants/acme': () => ({ body: acme }),
    'GET /api/v1/tenants/acme/api-keys': () => ({ body: [] }),
    'GET /api/v1/tenants/acme/provider-keys': () => ({ body: [] }),
  };
}

const nav = () => screen.getByRole('navigation', { name: 'Primary' });

describe('Console session (single sign-on)', () => {
  it('shows who is signed in and their roles, with nothing in browser storage', async () => {
    mockApi(tenantRoutes([{ role: 'developer', tenant_id: 'acme' }]));
    await renderApp('/tenants', { token: null });

    const who = await screen.findByRole('region', { name: 'Signed in as' });
    expect(within(who).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(who).getByText('ada@example.internal')).toBeInTheDocument();
    expect(within(who).getByRole('list', { name: 'Your roles' })).toHaveTextContent(
      'Developer: acme',
    );
    expect(getToken()).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
    expect(window.localStorage.length).toBe(0);
  });

  it('sends X-CSRF-Token with writes made from the console', async () => {
    const calls = mockApi({
      ...tenantRoutes([{ role: 'developer', tenant_id: 'acme' }]),
      'POST /api/v1/tenants/acme/api-keys': () => ({
        status: 201,
        body: {
          id: 'key_1',
          name: 'billing',
          prefix: 'cal_abcd',
          key: 'cal_abcd_secret',
          created_at: '2026-10-10T10:00:00Z',
        },
      }),
    });
    const user = userEvent.setup();
    await renderApp('/tenants/acme', { token: null });

    await user.type(await screen.findByLabelText('Key name'), 'billing');
    await user.click(screen.getByRole('button', { name: 'Mint key' }));

    expect(await screen.findByTestId('plaintext-key')).toHaveTextContent('cal_abcd_secret');
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.headers.get('X-CSRF-Token')).toBe('csrf-test-token');
    expect(post.headers.has('Authorization')).toBe(false);
    // Reads carry no CSRF token.
    expect(calls.filter((c) => c.method === 'GET').some((c) => c.headers.has('X-CSRF-Token'))).toBe(
      false,
    );
  });

  it('signs out at the control plane, then at the identity provider', async () => {
    const assign = vi.spyOn(browser, 'assign').mockImplementation(() => {});
    const calls = mockApi({
      ...tenantRoutes([{ role: 'owner' }]),
      'POST /auth/logout': () => ({ body: { end_session_url: 'https://idp.example/logout' } }),
    });
    const user = userEvent.setup();
    await renderApp('/tenants', { token: null });

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://idp.example/logout'));
    const logout = calls.find((c) => c.path === '/auth/logout')!;
    expect(logout.method).toBe('POST');
    expect(logout.headers.get('X-CSRF-Token')).toBe('csrf-test-token');
  });

  it('signs out to the sign-in screen when the provider has no logout endpoint', async () => {
    let signedIn = true;
    mockApi({
      ...tenantRoutes([{ role: 'owner' }]),
      'GET /auth/me': () =>
        signedIn ? { body: meWith([{ role: 'owner' }]) } : unauthorized('session revoked'),
      'POST /auth/logout': () => {
        signedIn = false;
        return { body: { end_session_url: null } };
      },
    });
    const user = userEvent.setup();
    const { router } = await renderApp('/tenants', { token: null });

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('link', { name: 'Sign in with SSO' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    // Signing out is not an expired session.
    expect(screen.queryByText(/Your session has ended/)).not.toBeInTheDocument();
  });

  it('on 401, goes back to sign-in, says why, and keeps the page to return to', async () => {
    let alive = true;
    mockApi({
      ...ssoRoutes(meWith([{ role: 'owner' }])),
      'GET /auth/me': () =>
        alive ? { body: meWith([{ role: 'owner' }]) } : unauthorized('session expired'),
      'GET /api/v1/tenants': () => {
        alive = false;
        return unauthorized('session expired');
      },
    });
    const { router } = await renderApp('/tenants', { token: null });

    expect(await screen.findByText(/Your session has ended/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    const sso = screen.getByRole('link', { name: 'Sign in with SSO' });
    expect(new URL(sso.getAttribute('href')!).searchParams.get('return_to')).toBe('/#/tenants');
  });

  it('on 403, says the role does not allow it instead of showing an error', async () => {
    mockApi({
      ...ssoRoutes(meWith([{ role: 'developer', tenant_id: 'acme' }])),
      'GET /api/v1/tenants': () => ({ body: [acme] }),
      'GET /api/v1/audit': () => forbidden('audit.read'),
    });
    await renderApp('/audit', { token: null });

    const state = await screen.findByRole('alert');
    expect(state).toHaveTextContent('Your role does not allow this');
    expect(state).toHaveTextContent("permission 'audit.read' is required");
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows a 403 on a write in the form, in plain words', async () => {
    mockApi({
      ...tenantRoutes([{ role: 'developer', tenant_id: 'acme' }]),
      'POST /api/v1/tenants/acme/api-keys': () => forbidden('api_keys.write'),
    });
    const user = userEvent.setup();
    await renderApp('/tenants/acme', { token: null });

    await user.click(await screen.findByRole('button', { name: 'Mint key' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Your role does not allow this (permission 'api_keys.write' is required).",
    );
  });

  it('a user without any role sees how to get access', async () => {
    mockApi(ssoRoutes(meWith([])));
    await renderApp('/', { token: null });

    expect(await screen.findByText('You are signed in, but have no role yet')).toBeInTheDocument();
    expect(within(nav()).queryByRole('link', { name: 'Tenants' })).not.toBeInTheDocument();
  });
});

describe('Token mode', () => {
  it('keeps working as before when single sign-on is not configured', async () => {
    const calls = mockApi({ 'GET /api/v1/tenants': () => ({ body: [acme] }) });
    await renderApp('/tenants');

    expect(await screen.findByRole('table', { name: 'Tenants' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New tenant' })).toBeInTheDocument();
    expect(within(nav()).getByRole('link', { name: 'Audit' })).toBeInTheDocument();
    const list = calls.find((c) => c.path === '/api/v1/tenants')!;
    expect(list.headers.get('Authorization')).toBe('Bearer test-admin-token');
  });

  it('a rejected token goes back to the token form', async () => {
    mockApi({
      'GET /api/v1/tenants': () => unauthorized('invalid admin token'),
    });
    const { router } = await renderApp('/tenants');

    expect(await screen.findByLabelText(/Admin token/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(getToken()).toBeNull();
  });
});

describe('Role-gated console', () => {
  it('a tenant viewer reads the tenant but gets no controls to change it', async () => {
    mockApi(tenantRoutes([{ role: 'viewer', tenant_id: 'acme' }]));
    await renderApp('/tenants/acme', { token: null });

    expect(await screen.findByRole('tab', { name: 'API keys' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Provider keys' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mint key' })).not.toBeInTheDocument();
    const settings = await screen.findByRole('region', { name: 'Privacy and caching' });
    expect(within(settings).getByText(/Read only: your role cannot change/)).toBeInTheDocument();
    expect(within(settings).getByLabelText('PII default mode')).toBeDisabled();
    expect(within(settings).queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    const limits = screen.getByRole('region', { name: 'Node limits' });
    expect(within(limits).getByLabelText('Steps per run')).toBeDisabled();
    expect(within(limits).queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Danger zone' })).not.toBeInTheDocument();

    expect(within(nav()).queryByRole('link', { name: 'Audit' })).not.toBeInTheDocument();
    expect(within(nav()).queryByRole('link', { name: 'Users and roles' })).not.toBeInTheDocument();
  });

  it('a tenant admin manages the tenant but cannot delete it', async () => {
    mockApi(tenantRoutes([{ role: 'tenant_admin', tenant_id: 'acme' }]));
    const user = userEvent.setup();
    await renderApp('/tenants/acme', { token: null });

    expect(await screen.findByRole('button', { name: 'Mint key' })).toBeInTheDocument();
    const settings = await screen.findByRole('region', { name: 'Privacy and caching' });
    expect(within(settings).getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Danger zone' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Provider keys' }));
    expect(await screen.findByRole('button', { name: 'Add provider key' })).toBeInTheDocument();
  });

  it('a developer mints API keys but cannot add BYOK keys', async () => {
    mockApi(tenantRoutes([{ role: 'developer', tenant_id: 'acme' }]));
    const user = userEvent.setup();
    await renderApp('/tenants/acme', { token: null });

    expect(await screen.findByRole('button', { name: 'Mint key' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Provider keys' }));
    expect(await screen.findByText('No provider keys')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add provider key' })).not.toBeInTheDocument();
  });

  it('billing sees the tenant and its usage, not its keys', async () => {
    mockApi(tenantRoutes([{ role: 'billing', tenant_id: 'acme' }]));
    await renderApp('/tenants/acme', { token: null });

    expect(await screen.findByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    for (const page of ['Datasources', 'Ontology', 'Nodes', 'Audit']) {
      expect(within(nav()).queryByRole('link', { name: page })).not.toBeInTheDocument();
    }
    expect(within(nav()).getByRole('link', { name: 'Usage' })).toBeInTheDocument();
  });

  it('an auditor reads everything and changes nothing', async () => {
    mockApi({
      ...ssoRoutes(meWith([{ role: 'auditor' }])),
      'GET /api/v1/tenants': () => ({ body: [acme] }),
      'GET /api/v1/models': () => ({ body: [] }),
    });
    const user = userEvent.setup();
    await renderApp('/tenants', { token: null });

    expect(await screen.findByRole('table', { name: 'Tenants' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New tenant' })).not.toBeInTheDocument();
    expect(within(nav()).getByRole('link', { name: 'Audit' })).toBeInTheDocument();
    expect(within(nav()).getByRole('link', { name: 'Users and roles' })).toBeInTheDocument();

    await user.click(within(nav()).getByRole('link', { name: 'Models' }));
    expect(await screen.findByText('No models registered')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add model' })).not.toBeInTheDocument();
  });

  it('only offers tenants the user may write to when creating a node', async () => {
    const globex: Tenant = { ...acme, id: 'globex', name: 'Globex' };
    mockApi({
      ...ssoRoutes(
        meWith([
          { role: 'developer', tenant_id: 'acme' },
          { role: 'viewer', tenant_id: 'globex' },
        ]),
      ),
      'GET /api/v1/tenants': () => ({ body: [acme, globex] }),
      'GET /api/v1/nodes': () => ({
        body: [
          {
            id: 'node_1',
            tenant_id: 'globex',
            name: 'triage',
            version: 1,
            spec: {},
            hash: 'sha256:aaaa',
            state: 'draft',
            live: false,
            created_at: '2026-10-01T10:00:00Z',
          },
        ],
      }),
    });
    const user = userEvent.setup();
    await renderApp('/nodes', { token: null });

    expect(await screen.findByText('triage')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New node' }));
    const form = await screen.findByRole('form', { name: 'Create node' });
    const options = within(within(form).getByLabelText(/Tenant/)).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Select a tenant…', 'Acme']);
  });
});
