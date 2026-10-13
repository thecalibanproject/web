import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Tenant } from '@/api/types';
import { getToken } from '@/lib/auth';
import { meWith, ssoRoutes } from '@/test/auth';
import { mockApi, renderApp } from '@/test/utils';

const acme: Tenant = {
  id: 'acme',
  name: 'Acme',
  created_at: '2026-10-01T10:00:00Z',
  status: 'active',
};

function returnTo(link: HTMLElement): string | null {
  return new URL(link.getAttribute('href') ?? '', 'http://x').searchParams.get('return_to');
}

describe('Sign-in screen', () => {
  it('without single sign-on: the admin token form, unchanged', async () => {
    mockApi({
      'GET /auth/config': () => ({
        body: { sso_enabled: false, break_glass_enabled: true, login_url: null },
      }),
    });
    await renderApp('/login', { token: null });

    expect(await screen.findByLabelText(/Admin token/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Sign in with SSO' })).not.toBeInTheDocument();
  });

  it('with single sign-on: SSO first, and the break-glass token behind a second option', async () => {
    mockApi(ssoRoutes(null));
    const user = userEvent.setup();
    await renderApp('/login?redirect=%2Ftenants%2Facme%3Ftab%3Dprovider-keys', { token: null });

    const sso = await screen.findByRole('link', { name: 'Sign in with SSO' });
    expect(new URL(sso.getAttribute('href')!).pathname).toBe('/auth/login');
    expect(returnTo(sso)).toBe('/#/tenants/acme?tab=provider-keys');
    expect(screen.queryByLabelText(/Admin token/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Use the break-glass admin token' }));
    expect(screen.getByRole('form', { name: 'Break-glass sign-in' })).toBeInTheDocument();
    expect(screen.getByText(/Every use is recorded in the audit log/)).toBeInTheDocument();
  });

  it('offers no token when break-glass is turned off', async () => {
    mockApi(ssoRoutes(null, { break_glass_enabled: false }));
    await renderApp('/login', { token: null });

    expect(await screen.findByRole('link', { name: 'Sign in with SSO' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Use the break-glass admin token' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Admin token/)).not.toBeInTheDocument();
  });

  it.each([
    ['login_failed', /identity provider’s answer could not be verified/],
    ['login_expired', /took too long or was already used/],
    ['idp_unavailable', /identity provider could not be reached/],
  ])('explains a failed sign-in (%s)', async (code, text) => {
    mockApi(ssoRoutes(null));
    await renderApp(`/login?error=${code}`, { token: null });
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it('sends a signed-out visitor to sign in, keeping the page to come back to', async () => {
    mockApi(ssoRoutes(null));
    const { router } = await renderApp('/usage?tenant=acme', { token: null });

    const sso = await screen.findByRole('link', { name: 'Sign in with SSO' });
    expect(router.state.location.pathname).toBe('/login');
    expect(returnTo(sso)).toBe('/#/usage?tenant=acme');
  });

  it('a signed-in session skips the sign-in screen', async () => {
    mockApi({
      ...ssoRoutes(meWith([{ role: 'owner' }])),
      'GET /api/v1/tenants': () => ({ body: [acme] }),
    });
    const { router } = await renderApp('/login?redirect=%2Ftenants', { token: null });
    await waitFor(() => expect(router.state.location.pathname).toBe('/tenants'));
  });

  it('signs in with the break-glass token and returns to the page asked for', async () => {
    mockApi({
      ...ssoRoutes(null),
      'GET /auth/me': (c) =>
        c.headers.get('Authorization') === 'Bearer adm_secret'
          ? { body: meWith([{ role: 'owner' }], { method: 'break_glass' }) }
          : {
              status: 401,
              body: { error: { message: 'authentication required', type: 'authentication_error' } },
            },
      'GET /api/v1/tenants': () => ({ body: [acme] }),
    });
    const user = userEvent.setup();
    const { router } = await renderApp('/login?redirect=%2Ftenants', { token: null });

    await user.click(
      await screen.findByRole('button', { name: 'Use the break-glass admin token' }),
    );
    await user.type(screen.getByLabelText(/Admin token/), 'adm_secret');
    await user.click(screen.getByRole('button', { name: 'Sign in with the token' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/tenants'));
    expect(await screen.findByRole('table', { name: 'Tenants' })).toBeInTheDocument();
    expect(getToken()).toBe('adm_secret');
    // The shell says it is the break-glass token, not a person.
    expect(screen.getByText('Shared admin token')).toBeInTheDocument();
  });

  it('keeps a rejected token out and says so', async () => {
    mockApi({
      'GET /auth/config': () => ({
        body: { sso_enabled: false, break_glass_enabled: true, login_url: null },
      }),
      'GET /auth/me': () => ({
        status: 401,
        body: { error: { message: 'invalid admin token', type: 'authentication_error' } },
      }),
    });
    const user = userEvent.setup();
    await renderApp('/login', { token: null });

    await user.type(await screen.findByLabelText(/Admin token/), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your admin token was rejected. Sign in again.',
    );
    expect(getToken()).toBeNull();
  });
});
