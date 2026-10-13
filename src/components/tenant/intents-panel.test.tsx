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
  let tenant: Tenant = acme;
  let routes: Array<{ intent: string; models: string[] }> = [];
  return {
    'GET /api/v1/tenants': () => ({ body: [acme] }),
    'GET /api/v1/tenants/acme': () => ({ body: tenant }),
    'PATCH /api/v1/tenants/acme': (c: { body: unknown }) => {
      tenant = { ...tenant, ...(c.body as Partial<Tenant>) };
      for (const [intent, route] of Object.entries(tenant.node_routes ?? {})) {
        nodeRoutes[intent] = route;
      }
      return { body: tenant };
    },
    'GET /api/v1/nodes': () => ({
      body: [
        {
          id: 'n1',
          tenant_id: 'acme',
          name: 'triage',
          version: 1,
          spec: {},
          hash: 'sha256:aa',
          state: 'published',
          live: true,
          created_at: '2026-10-02T10:00:00Z',
        },
      ],
    }),
    'GET /api/v1/models': () => ({
      body: [
        {
          id: 'local/qwen',
          provider_id: 'vllm',
          upstream_model: 'qwen',
          kind: 'chat',
          capabilities: {},
          trust_tier: 't0_sovereign',
        },
      ],
    }),
    'GET /api/v1/tenants/acme/routes': () => ({ body: routes }),
    'PUT /api/v1/tenants/acme/routes': (c: { body: unknown }) => {
      routes = (c.body as { routes: typeof routes }).routes;
      return { body: routes };
    },
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
  it('adds a topic with its example sentences, sent to its assistant', async () => {
    const calls = mockApi(intentsServer());
    const user = userEvent.setup();
    await renderApp('/tenants/acme?tab=intents');

    const table = await screen.findByRole('table', { name: 'Topics' });
    expect(within(table).getByRole('row', { name: /billing/ })).toHaveTextContent('Server config');

    await user.click(screen.getByRole('button', { name: 'New topic' }));
    const form = await screen.findByRole('form', { name: 'New topic' });
    await user.type(within(form).getByLabelText(/^Topic name/), 'Chest pain');
    expect(within(form).getByText(/Use 1 to 64 lowercase/)).toBeInTheDocument();
    await user.clear(within(form).getByLabelText(/^Topic name/));
    await user.type(within(form).getByLabelText(/^Topic name/), 'chest_pain');
    await user.type(
      within(form).getByLabelText(/^Example sentences/),
      'my chest hurts{Enter}{Enter}  it hurts when I breathe {Enter}my chest hurts',
    );
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    const row = await within(table).findByRole('row', { name: /chest_pain/ });
    expect(row).toHaveTextContent('Console or API');
    expect(within(row).getByRole('link', { name: 'triage' })).toHaveAttribute(
      'href',
      '/nodes/acme/triage',
    );
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([
      { exemplars: ['my chest hurts', 'it hurts when I breathe'] },
    ]);
  });

  it('sends a topic to a live assistant with the workspace update', async () => {
    const calls = mockApi(intentsServer());
    const user = userEvent.setup();
    await renderApp('/tenants/acme?tab=intents');
    await user.click(await screen.findByRole('button', { name: 'billing' }));
    const form = await screen.findByRole('form', { name: 'Topic billing' });
    const sendsTo = within(form).getByLabelText('Sends to');
    expect(sendsTo).toHaveValue('');
    await within(form).findByRole('option', { name: 'triage' });
    await user.selectOptions(sendsTo, 'triage');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
        node_routes: { billing: 'node/triage' },
      }),
    );
    const row = await screen.findByRole('row', { name: /billing/ });
    expect(await within(row).findByRole('link', { name: 'triage' })).toBeInTheDocument();
  });

  it('sets which model answers, prefilled with the only chat model', async () => {
    const calls = mockApi(intentsServer());
    const user = userEvent.setup();
    await renderApp('/tenants/acme?tab=intents');
    const form = await screen.findByRole('form', { name: 'Which model answers' });
    const model = within(form).getByLabelText('Default model');
    await waitFor(() => expect(model).toHaveValue('local/qwen'));
    expect(model).toHaveAccessibleDescription(/Not set yet/);
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT' && c.path.endsWith('/routes'))?.body).toEqual({
        routes: [{ intent: 'default', models: ['local/qwen'] }],
      }),
    );
    expect(await screen.findByText('Default model saved.')).toBeInTheDocument();
  });

  it('removes a server config topic from the workspace, then restores it', async () => {
    const calls = mockApi(intentsServer());
    const user = userEvent.setup();
    await renderApp('/tenants/acme?tab=intents');

    await user.click(await screen.findByRole('button', { name: 'billing' }));
    const form = await screen.findByRole('form', { name: 'Topic billing' });
    await user.click(within(form).getByRole('button', { name: 'Remove from this workspace' }));

    await waitFor(() =>
      expect(screen.queryByRole('table', { name: 'Topics' })).not.toBeInTheDocument(),
    );
    await user.click(await screen.findByRole('button', { name: 'Restore billing' }));
    expect(await screen.findByRole('button', { name: 'billing' })).toBeInTheDocument();
    expect(calls.filter((c) => c.method !== 'GET').map((c) => [c.method, c.body])).toEqual([
      ['PUT', { exemplars: [] }],
      ['DELETE', undefined],
    ]);
  });

  it('a viewer reads the topics and their example sentences and changes nothing', async () => {
    const calls = mockApi({
      ...intentsServer(),
      ...ssoRoutes(meWith([{ role: 'viewer', tenant_id: 'acme' }])),
      'GET /api/v1/tenants/acme/api-keys': () => ({ body: [] }),
      'GET /api/v1/tenants/acme/provider-keys': () => ({ body: [] }),
    });
    const user = userEvent.setup();
    await renderApp('/tenants/acme?tab=intents', { token: null });

    expect(await screen.findByRole('button', { name: 'New topic' })).toHaveAccessibleDescription(
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
    expect(screen.queryByRole('tab', { name: 'Topics and routing' })).not.toBeInTheDocument();
  });
});
