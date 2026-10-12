import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Tenant, TenantIntents } from '@/api/types';
import { meWith, ssoRoutes } from '@/test/auth';
import { mockApi, renderApp } from '@/test/utils';

const acme: Tenant = { id: 'acme', name: 'Acme', created_at: '2026-10-01T10:00:00Z' };

/** The control plane's intents, as GET answers them, after PUTs and DELETEs. */
function intentsServer() {
  const file: Record<string, string[]> = { billing: ['where is my invoice'] };
  const own: Record<string, string[]> = {};
  const nodeRoutes: Record<string, string> = { chest_pain: 'node/triage' };
  const view = (): TenantIntents => {
    const all = { ...file, ...own };
    return {
      tenant_id: 'acme',
      intents: Object.entries(all)
        .filter(([, ex]) => ex.length > 0)
        .map(([intent, exemplars]) => ({
          intent,
          exemplars,
          source: intent in own ? 'api' : 'config',
          node: nodeRoutes[intent] ?? null,
        })),
      removed: Object.keys(own).filter((i) => own[i]?.length === 0),
    };
  };
  return {
    'GET /api/v1/tenants': () => ({ body: [acme] }),
    'GET /api/v1/tenants/acme': () => ({ body: acme }),
    'GET /api/v1/tenants/acme/intents': () => ({ body: view() }),
    'PUT /api/v1/tenants/acme/intents/chest_pain': (c: { body: unknown }) => {
      own.chest_pain = (c.body as { exemplars: string[] }).exemplars;
      return { body: { intent: 'chest_pain', source: 'api' } };
    },
    'PUT /api/v1/tenants/acme/intents/billing': (c: { body: unknown }) => {
      own.billing = (c.body as { exemplars: string[] }).exemplars;
      return { body: { intent: 'billing', source: 'api' } };
    },
    'DELETE /api/v1/tenants/acme/intents/billing': () => {
      delete own.billing;
      return { status: 204 };
    },
  };
}

describe('IntentsPanel', () => {
  it('adds an intent with its exemplars, mapped to its node', async () => {
    const calls = mockApi(intentsServer());
    const user = userEvent.setup();
    await renderApp('/tenants/acme?tab=intents');

    const table = await screen.findByRole('table', { name: 'Routing intents' });
    expect(within(table).getByRole('row', { name: /billing/ })).toHaveTextContent('Config file');

    await user.click(screen.getByRole('button', { name: 'New intent' }));
    const form = await screen.findByRole('form', { name: 'New intent' });
    await user.type(within(form).getByLabelText(/^Intent/), 'Chest pain');
    expect(within(form).getByText(/Use 1 to 64 lowercase/)).toBeInTheDocument();
    await user.clear(within(form).getByLabelText(/^Intent/));
    await user.type(within(form).getByLabelText(/^Intent/), 'chest_pain');
    await user.type(
      within(form).getByLabelText(/^Exemplars/),
      'my chest hurts{Enter}{Enter}  it hurts when I breathe {Enter}my chest hurts',
    );
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    const row = await within(table).findByRole('row', { name: /chest_pain/ });
    expect(row).toHaveTextContent('Set here');
    expect(within(row).getByRole('link', { name: 'node/triage' })).toHaveAttribute(
      'href',
      '/nodes/acme/triage',
    );
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([
      { exemplars: ['my chest hurts', 'it hurts when I breathe'] },
    ]);
  });

  it('removes a config-file intent for the tenant, then restores it', async () => {
    const calls = mockApi(intentsServer());
    const user = userEvent.setup();
    await renderApp('/tenants/acme?tab=intents');

    await user.click(await screen.findByRole('button', { name: 'billing' }));
    const form = await screen.findByRole('form', { name: 'Intent billing' });
    await user.click(within(form).getByRole('button', { name: 'Remove for this tenant' }));

    await waitFor(() =>
      expect(screen.queryByRole('table', { name: 'Routing intents' })).not.toBeInTheDocument(),
    );
    await user.click(await screen.findByRole('button', { name: 'Restore billing' }));
    expect(await screen.findByRole('button', { name: 'billing' })).toBeInTheDocument();
    expect(calls.filter((c) => c.method !== 'GET').map((c) => [c.method, c.body])).toEqual([
      ['PUT', { exemplars: [] }],
      ['DELETE', undefined],
    ]);
  });

  it('a viewer reads the intents and their exemplars and changes nothing', async () => {
    const calls = mockApi({
      ...intentsServer(),
      ...ssoRoutes(meWith([{ role: 'viewer', tenant_id: 'acme' }])),
      'GET /api/v1/tenants/acme/api-keys': () => ({ body: [] }),
      'GET /api/v1/tenants/acme/provider-keys': () => ({ body: [] }),
    });
    const user = userEvent.setup();
    await renderApp('/tenants/acme?tab=intents', { token: null });

    expect(await screen.findByRole('button', { name: 'New intent' })).toHaveAccessibleDescription(
      /needs routes\.write/,
    );
    await user.click(screen.getByRole('button', { name: 'billing' }));
    const drawer = await screen.findByRole('dialog', { name: 'billing' });
    expect(drawer).toHaveTextContent('where is my invoice');
    expect(within(drawer).queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('is not offered to a role without routes.read', async () => {
    mockApi({
      ...intentsServer(),
      ...ssoRoutes(meWith([{ role: 'billing', tenant_id: 'acme' }])),
    });
    await renderApp('/tenants/acme?tab=intents', { token: null });
    expect(await screen.findByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Routing intents' })).not.toBeInTheDocument();
  });
});
