import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ApiKeyCreated, ApiKeyInfo } from '@/api/types';
import { formatDateTime } from '@/lib/format';
import { meWith } from '@/test/auth';
import { mockApi, renderWithClient } from '@/test/utils';
import { ApiKeysPanel } from './api-keys-panel';

describe('ApiKeysPanel', () => {
  it('mints a key and reveals the plaintext exactly once', async () => {
    const stored: ApiKeyInfo[] = [];
    const calls = mockApi({
      'GET /api/v1/tenants/t1/api-keys': () => ({ body: stored }),
      'POST /api/v1/tenants/t1/api-keys': (c) => {
        const info: ApiKeyInfo = {
          id: 'k1',
          name: (c.body as { name: string }).name,
          prefix: 'cal_abcd',
          created_at: '2026-10-02T10:00:00Z',
        };
        stored.push(info);
        const created: ApiKeyCreated = { ...info, key: 'cal_abcd_SUPERSECRET' };
        return { status: 201, body: created };
      },
    });
    const user = userEvent.setup();
    renderWithClient(<ApiKeysPanel tenantId="t1" />);

    expect(await screen.findByText('No API keys')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Key name'), 'billing-prod');
    await user.click(screen.getByRole('button', { name: /mint key/i }));

    const notice = await screen.findByRole('region', { name: 'New API key' });
    expect(within(notice).getByTestId('plaintext-key')).toHaveTextContent('cal_abcd_SUPERSECRET');
    expect(within(notice).getByRole('button', { name: /copy key/i })).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ name: 'billing-prod' });

    // The list refetches and shows metadata only.
    const table = await screen.findByRole('table', { name: 'API keys' });
    expect(within(table).getByText('billing-prod')).toBeInTheDocument();
    expect(within(table).queryByText(/SUPERSECRET/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /stored it/i }));
    await waitFor(() => expect(screen.queryByText(/SUPERSECRET/)).not.toBeInTheDocument());
  });

  it('shows an error state with retry when the list fails', async () => {
    mockApi({
      'GET /api/v1/tenants/t1/api-keys': () => ({
        status: 500,
        body: { error: { message: 'database unavailable', type: 'server_error' } },
      }),
    });
    renderWithClient(<ApiKeysPanel tenantId="t1" />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('database unavailable');
    expect(within(alert).getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('revokes a key through a confirm dialog that explains when it stops working', async () => {
    let keys: ApiKeyInfo[] = [
      { id: 'k1', name: 'billing-prod', prefix: 'cal_abcd', created_at: '2026-10-02T10:00:00Z' },
      { id: 'k2', name: 'search-prod', prefix: 'cal_efgh', created_at: '2026-10-02T11:00:00Z' },
    ];
    const calls = mockApi({
      'GET /api/v1/tenants/t1/api-keys': () => ({ body: keys }),
      'DELETE /api/v1/tenants/t1/api-keys/k1': () => {
        keys = keys.filter((k) => k.id !== 'k1');
        return { status: 204 };
      },
    });
    const user = userEvent.setup();
    renderWithClient(<ApiKeysPanel tenantId="t1" />);

    await user.click(await screen.findByRole('button', { name: 'Revoke billing-prod' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revoke API key?' });
    expect(dialog).toHaveTextContent('billing-prod');
    expect(dialog).toHaveTextContent(/stops working immediately in standalone mode/);
    expect(dialog).toHaveTextContent(/within one snapshot poll interval \(10 s by default\)/);
    expect(dialog).toHaveTextContent(/split-mode routers/);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: 'Revoke key' }));

    await waitFor(() => expect(screen.queryByText('billing-prod')).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('search-prod')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual([
      '/api/v1/tenants/t1/api-keys/k1',
    ]);
  });

  it('treats a 404 on revoke as already revoked: closes the dialog and refreshes', async () => {
    let listed = 0;
    mockApi({
      'GET /api/v1/tenants/t1/api-keys': () => {
        listed += 1;
        return {
          body:
            listed === 1
              ? [{ id: 'k1', name: 'old', prefix: 'cal_abcd', created_at: '2026-10-02T10:00:00Z' }]
              : [],
        };
      },
      'DELETE /api/v1/tenants/t1/api-keys/k1': () => ({
        status: 404,
        body: { error: { message: 'api key not found', type: 'not_found' } },
      }),
    });
    const user = userEvent.setup();
    renderWithClient(<ApiKeysPanel tenantId="t1" />);

    await user.click(await screen.findByRole('button', { name: 'Revoke old' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revoke API key?' });
    await user.click(within(dialog).getByRole('button', { name: 'Revoke key' }));

    expect(await screen.findByText('No API keys')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lists revoked keys greyed out with revoked_at and no actions when toggled', async () => {
    const active: ApiKeyInfo = {
      id: 'k1',
      name: 'billing-prod',
      prefix: 'cal_abcd',
      created_at: '2026-10-02T10:00:00Z',
      revoked_at: null,
    };
    const revoked: ApiKeyInfo = {
      id: 'k2',
      name: 'leaked-key',
      prefix: 'cal_dead',
      created_at: '2026-09-01T10:00:00Z',
      revoked_at: '2026-10-05T08:30:00Z',
    };
    const calls = mockApi({
      'GET /api/v1/tenants/t1/api-keys': (c) => ({
        body: c.query.get('include_revoked') === 'true' ? [active, revoked] : [active],
      }),
    });
    const user = userEvent.setup();
    renderWithClient(<ApiKeysPanel tenantId="t1" />);

    await screen.findByText('billing-prod');
    expect(screen.queryByText('leaked-key')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Show revoked' }));

    const row = (await screen.findByText('leaked-key')).closest('tr')!;
    expect(row).toHaveClass('text-fg-subtle');
    expect(within(row).getByText('Revoked')).toBeInTheDocument();
    expect(within(row).getByText(formatDateTime(revoked.revoked_at))).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();

    const activeRow = screen.getByText('billing-prod').closest('tr')!;
    expect(within(activeRow).getByText('Active')).toBeInTheDocument();
    expect(
      within(activeRow).getByRole('button', { name: 'Revoke billing-prod' }),
    ).toBeInTheDocument();
    expect(calls.at(-1)?.query.get('include_revoked')).toBe('true');
  });

  it('shows the deleted-tenant state instead of an error on a 404', async () => {
    mockApi({
      'GET /api/v1/tenants/t1/api-keys': () => ({
        status: 404,
        body: { error: { message: 'tenant not found', type: 'not_found' } },
      }),
      'GET /api/v1/tenants': () => ({
        body: [
          {
            id: 't1',
            name: 'Acme',
            created_at: '2026-10-01T10:00:00Z',
            status: 'deleted',
            deleted_at: '2026-10-09T09:00:00Z',
          },
        ],
      }),
    });
    renderWithClient(<ApiKeysPanel tenantId="t1" />);
    expect(await screen.findByText('This tenant was deleted')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  describe('node access', () => {
    const node = (name: string, version: number) => ({
      id: `${name}-${version}`,
      tenant_id: 't1',
      name,
      version,
      spec: {},
      hash: 'sha256:aa',
      state: 'published',
      live: true,
      created_at: '2026-10-02T10:00:00Z',
    });

    function mockMint() {
      return mockApi({
        'GET /api/v1/tenants/t1/api-keys': () => ({ body: [] }),
        'GET /api/v1/nodes': () => ({
          body: [node('triage', 1), node('triage', 2), node('intake', 1)],
        }),
        'POST /api/v1/tenants/t1/api-keys': (c) => ({
          status: 201,
          body: {
            id: 'k1',
            name: 'runner',
            prefix: 'cal_abcd',
            key: 'cal_abcd_x',
            created_at: '2026-10-02T10:00:00Z',
            ...(c.body as object),
          },
        }),
      });
    }

    it('mints a key limited to some nodes and datasource scopes', async () => {
      const calls = mockMint();
      const user = userEvent.setup();
      renderWithClient(<ApiKeysPanel tenantId="t1" />);
      await screen.findByText('No API keys');
      await user.type(screen.getByLabelText('Key name'), 'runner');
      expect(
        screen.getByText(/Runs every published node; datasource scopes: the nodes' own scopes/),
      ).toBeInTheDocument();

      await user.click(screen.getByText('Node access'));
      await user.click(screen.getByRole('radio', { name: 'Only these nodes' }));
      // Not yet: an allowlist needs a node.
      expect(screen.getByRole('button', { name: /mint key/i })).toBeDisabled();
      const nodes = await screen.findByRole('group', { name: 'Nodes' });
      expect(
        within(nodes)
          .getAllByRole('checkbox')
          .map((c) => c.closest('label')?.textContent),
      ).toEqual(['intake', 'triage']);
      await user.click(within(nodes).getByRole('checkbox', { name: 'triage' }));
      await user.type(screen.getByLabelText('Other node names'), 'billing');
      await user.type(
        screen.getByLabelText('Datasource scopes'),
        'shop.orders:read, shop.customers:read',
      );
      expect(
        screen.getByText(/Runs triage, billing; datasource scopes: shop\.orders:read/),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /mint key/i }));

      await screen.findByRole('region', { name: 'New API key' });
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
        name: 'runner',
        nodes: ['triage', 'billing'],
        datasource_scopes: ['shop.orders:read', 'shop.customers:read'],
      });
      // The form is back to the defaults for the next key.
      expect(screen.getByText(/Runs every published node/)).toBeInTheDocument();
    });

    it('mints a key that runs no nodes', async () => {
      const calls = mockMint();
      const user = userEvent.setup();
      renderWithClient(<ApiKeysPanel tenantId="t1" />);
      await screen.findByText('No API keys');
      await user.click(screen.getByText('Node access'));
      await user.click(screen.getByRole('radio', { name: 'No nodes' }));
      await user.click(screen.getByRole('button', { name: /mint key/i }));
      await screen.findByRole('region', { name: 'New API key' });
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ nodes: [] });
    });

    it('refuses a datasource scope that is not <datasource>.<object>:read', async () => {
      const calls = mockMint();
      const user = userEvent.setup();
      renderWithClient(<ApiKeysPanel tenantId="t1" />);
      await screen.findByText('No API keys');
      await user.click(screen.getByText('Node access'));
      const scopes = screen.getByLabelText('Datasource scopes');
      await user.type(scopes, 'shop.orders:write');
      expect(scopes).toHaveAttribute('aria-invalid', 'true');
      expect(scopes).toHaveAccessibleDescription(/Not valid: shop\.orders:write/);
      expect(screen.getByRole('button', { name: /mint key/i })).toBeDisabled();
      expect(calls.some((c) => c.method === 'POST')).toBe(false);
    });

    it('without nodes.run, explains the key will run no nodes and sends no allowlist', async () => {
      const me = meWith([{ role: 'developer', tenant_id: 't1' }]);
      me.permissions.tenants.t1 = ['api_keys.read', 'api_keys.write'];
      const calls = mockMint();
      const user = userEvent.setup();
      renderWithClient(<ApiKeysPanel tenantId="t1" />, { principal: { mode: 'session', me } });
      await screen.findByText('No API keys');
      expect(screen.getByText(/Runs no nodes/)).toBeInTheDocument();
      await user.click(screen.getByText('Node access'));
      expect(screen.getByRole('radio', { name: 'No nodes' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Every published node' })).toBeDisabled();
      expect(
        screen.getByRole('group', { name: 'Nodes this key may run' }),
      ).toHaveAccessibleDescription(/needs nodes\.run/);
      await user.click(screen.getByRole('button', { name: /mint key/i }));
      await screen.findByRole('region', { name: 'New API key' });
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({});
    });

    it("lists each key's node allowlist and datasource scopes", async () => {
      mockApi({
        'GET /api/v1/tenants/t1/api-keys': () => ({
          body: [
            {
              id: 'k1',
              name: 'all',
              prefix: 'cal_1',
              created_at: '2026-10-02T10:00:00Z',
              nodes: null,
            },
            {
              id: 'k2',
              name: 'some',
              prefix: 'cal_2',
              created_at: '2026-10-02T10:00:00Z',
              nodes: ['triage'],
              datasource_scopes: ['shop.orders:read'],
            },
            {
              id: 'k3',
              name: 'none',
              prefix: 'cal_3',
              created_at: '2026-10-02T10:00:00Z',
              nodes: [],
            },
          ],
        }),
      });
      renderWithClient(<ApiKeysPanel tenantId="t1" />);
      const table = await screen.findByRole('table', { name: 'API keys' });
      const row = (name: string) => within(table).getByText(name).closest('tr')!;
      expect(row('all')).toHaveTextContent('All published');
      expect(row('all')).toHaveTextContent("Nodes' scopes");
      expect(within(row('some')).getByText('triage')).toBeInTheDocument();
      expect(row('some')).toHaveTextContent('shop.orders:read');
      expect(within(row('none')).getByText('None')).toBeInTheDocument();
    });
  });
});
