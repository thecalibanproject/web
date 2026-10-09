import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AuditEntry, AuditLog, Tenant } from '@/api/types';
import { mockApi, renderApp } from '@/test/utils';

const tenants: Tenant[] = [
  { id: 'acme', name: 'Acme', created_at: '2026-10-01T10:00:00Z', status: 'active' },
  {
    id: 'globex',
    name: 'Globex',
    created_at: '2026-10-01T10:00:00Z',
    status: 'deleted',
    deleted_at: '2026-10-08T12:00:00Z',
  },
];

const hash = (seq: number) => `${String(seq).padStart(4, '0')}${'ab'.repeat(30)}`;

function row(seq: number, fields: Partial<AuditEntry>): AuditEntry {
  return {
    seq,
    ts: `2026-10-09T10:${String(seq % 60).padStart(2, '0')}:00Z`,
    tenant_id: null,
    actor: 'admin',
    action: 'model.create',
    target: null,
    detail: {},
    prev_hash: seq === 1 ? null : hash(seq - 1),
    hash: hash(seq),
    ...fields,
  };
}

/** Newest first, as the API returns them. */
const entries: AuditEntry[] = [
  row(5, {
    tenant_id: 'globex',
    action: 'tenant.delete',
    target: 'globex',
    detail: {
      api_keys_revoked: ['k2'],
      provider_keys_destroyed: [],
      routes_removed: ['sql'],
      datasources_deleted: [],
      nodes_deleted: [],
    },
  }),
  row(4, {
    tenant_id: 'acme',
    action: 'api_key.revoke',
    target: 'k1',
    detail: { name: 'ci', prefix: 'cal_abcd' },
  }),
  row(3, {
    tenant_id: 'acme',
    action: 'tenant.update',
    target: 'acme',
    detail: {
      pii_default: { from: 'reversible', to: 'mask' },
      pii_surrogate_scope: { from: 'tenant', to: 'tenant' },
      semantic_cache: { from: 'off', to: 'off' },
    },
  }),
  row(2, { tenant_id: 'acme', action: 'tenant.create', target: 'acme', detail: { name: 'Acme' } }),
  row(1, {
    actor: 'system',
    action: 'store.seed',
    detail: { source: 'config file', tenants: 0, models: 2, providers: 1 },
  }),
];

const verified: AuditLog = {
  entries,
  head: { seq: 5, hash: hash(5) },
  chain_verified: true,
};

function mockAudit(log: AuditLog = verified) {
  return mockApi({
    'GET /api/v1/tenants': () => ({ body: tenants }),
    'GET /api/v1/audit': () => ({ body: log }),
  });
}

const table = () => screen.getByRole('table', { name: 'Audit log' });
const shownSeqs = () =>
  within(table())
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.querySelector('td')?.textContent);

describe('AuditPage', () => {
  it('lists entries newest first with actor, action, tenant, target and a readable summary', async () => {
    const calls = mockAudit();
    await renderApp('/audit');
    await screen.findByRole('table', { name: 'Audit log' });

    expect(calls.find((c) => c.path === '/api/v1/audit')?.query.get('limit')).toBe('100');
    expect(shownSeqs()).toEqual(['5', '4', '3', '2', '1']);
    const headers = within(table())
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual([
      'Seq',
      'Time',
      'Actor',
      'Action',
      'Tenant',
      'Target',
      'Details',
      'Hash',
    ]);

    const rowOf = (seq: number) =>
      within(table())
        .getAllByRole('row')
        .find((r) => r.querySelector('td')?.textContent === String(seq))!;

    const revoke = rowOf(4);
    expect(within(revoke).getByText('api_key.revoke')).toBeInTheDocument();
    expect(within(revoke).getByText('Acme')).toBeInTheDocument();
    expect(within(revoke).getByText('k1')).toBeInTheDocument();
    expect(within(revoke).getByText('Revoked "ci" (cal_abcd…)')).toBeInTheDocument();

    // Only the setting that changed, and deleted tenants keep their name.
    expect(within(rowOf(3)).getByText('PII default reversible → mask')).toBeInTheDocument();
    const del = rowOf(5);
    expect(within(del).getByText('Globex (deleted)')).toBeInTheDocument();
    expect(within(del).getByText('1 API key revoked, 1 route removed')).toBeInTheDocument();

    // Global entries have no tenant or target.
    const seed = rowOf(1);
    expect(within(seed).getByText('system')).toBeInTheDocument();
    expect(within(seed).getByText('Global')).toBeInTheDocument();
    expect(within(seed).getByText('None')).toBeInTheDocument();
    expect(within(seed).getByText('first entry')).toBeInTheDocument();
  });

  it('shows the hashes truncated, with copy, and the verified chain with its head', async () => {
    mockAudit();
    await renderApp('/audit');
    const status = await screen.findByRole('region', { name: 'Chain integrity' });
    expect(within(status).getByText('Chain verified')).toBeInTheDocument();
    expect(status).toHaveTextContent('recomputed the hashes of entries #1 to #5');
    expect(status).toHaveTextContent('This window starts at the first entry of the log.');
    expect(within(status).getByText('Head #5')).toBeInTheDocument();
    expect(within(status).getByTitle(hash(5))).toHaveTextContent('0005abababab…');
    expect(within(status).getByRole('button', { name: 'Copy head hash' })).toBeInTheDocument();

    const cells = within(table()).getAllByTitle(hash(4));
    expect(cells[0]).toHaveTextContent('0004abababab…');
    expect(
      within(table()).getByRole('button', { name: 'Copy hash of entry 4' }),
    ).toBeInTheDocument();
    expect(within(table()).getByText('prev 0003abababab…')).toHaveAttribute(
      'title',
      'Matches the hash of entry #3',
    );
    expect(within(table()).queryByText('Link broken')).not.toBeInTheDocument();
  });

  it('warns when the server cannot verify the chain and marks the broken link', async () => {
    const tampered = entries.map((e) => (e.seq === 4 ? { ...e, prev_hash: 'f'.repeat(64) } : e));
    // A window that does not reach the first entry.
    mockAudit({
      entries: tampered.slice(0, 4),
      head: verified.head,
      chain_verified: false,
    });
    await renderApp('/audit');
    const status = await screen.findByRole('region', { name: 'Chain integrity' });
    expect(within(status).getByText('Chain not verified')).toBeInTheDocument();
    expect(status).toHaveTextContent('could not verify entries #2 to #5');
    expect(status).toHaveTextContent('Treat these entries as tampered with');
    expect(status).toHaveTextContent('Entries before #2 are outside this window');

    const broken = within(table()).getAllByText('Link broken');
    expect(broken).toHaveLength(1);
    expect(broken[0]!.closest('tr')?.querySelector('td')).toHaveTextContent('4');
  });

  it('filters by tenant and action within the loaded window, and keeps them in the URL', async () => {
    mockAudit();
    const user = userEvent.setup();
    const { router } = await renderApp('/audit');
    await screen.findByRole('table', { name: 'Audit log' });

    const tenant = screen.getByRole('combobox', { name: 'Tenant' });
    expect(
      within(tenant)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['All tenants', 'Acme', 'Globex (deleted)']);
    await user.selectOptions(tenant, 'acme');
    await waitFor(() => expect(shownSeqs()).toEqual(['4', '3', '2']));
    expect(router.state.location.search).toMatchObject({ tenant: 'acme' });
    expect(screen.getByText('3 of 5 loaded entries')).toBeInTheDocument();

    const action = screen.getByRole('combobox', { name: 'Action' });
    expect(
      within(action)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'All actions',
      'api_key.revoke',
      'store.seed',
      'tenant.create',
      'tenant.delete',
      'tenant.update',
    ]);
    await user.selectOptions(action, 'tenant.update');
    await waitFor(() => expect(shownSeqs()).toEqual(['3']));
    expect(router.state.location.search).toMatchObject({ tenant: 'acme', action: 'tenant.update' });

    await user.selectOptions(action, 'tenant.delete');
    expect(await screen.findByText('No entries match')).toBeInTheDocument();
    // The chain status still describes everything that was loaded.
    expect(screen.getByRole('region', { name: 'Chain integrity' })).toHaveTextContent(
      'entries #1 to #5',
    );
  });

  it('reads the filters from the URL', async () => {
    mockAudit();
    await renderApp('/audit?action=tenant.delete');
    await screen.findByRole('table', { name: 'Audit log' });
    expect(shownSeqs()).toEqual(['5']);
  });

  it('loads a larger window from the API with "Last"', async () => {
    const calls = mockAudit();
    const user = userEvent.setup();
    const { router } = await renderApp('/audit');
    await screen.findByRole('table', { name: 'Audit log' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Last' }), '500');
    await waitFor(() =>
      expect(
        calls.filter((c) => c.path === '/api/v1/audit').map((c) => c.query.get('limit')),
      ).toEqual(['100', '500']),
    );
    expect(router.state.location.search).toMatchObject({ limit: 500 });
  });

  it('pages through the loaded window, 50 entries at a time', async () => {
    const many = Array.from({ length: 120 }, (_, i) => row(120 - i, {}));
    mockAudit({ entries: many, head: { seq: 120, hash: hash(120) }, chain_verified: true });
    const user = userEvent.setup();
    const { router } = await renderApp('/audit');
    await screen.findByRole('table', { name: 'Audit log' });

    const pager = screen.getByRole('navigation', { name: 'Audit log pages' });
    expect(pager).toHaveTextContent('Entries 1 to 50 of 120');
    expect(pager).toHaveTextContent('Page 1 of 3');
    expect(shownSeqs()).toHaveLength(50);
    expect(shownSeqs()[0]).toBe('120');
    expect(within(pager).getByRole('button', { name: 'Previous' })).toBeDisabled();

    await user.click(within(pager).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(shownSeqs()[0]).toBe('70'));
    expect(router.state.location.search).toMatchObject({ page: 2 });

    await user.click(within(pager).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(pager).toHaveTextContent('Entries 101 to 120 of 120'));
    expect(shownSeqs()).toHaveLength(20);
    expect(within(pager).getByRole('button', { name: 'Next' })).toBeDisabled();

    // A filter change starts again from the first page.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Action' }), 'model.create');
    await waitFor(() => expect(shownSeqs()[0]).toBe('120'));
    expect(router.state.location.search.page).toBeUndefined();
  });

  it('says so when the log is empty', async () => {
    mockAudit({ entries: [], head: null, chain_verified: true });
    await renderApp('/audit');
    expect(await screen.findByText('No audit entries yet')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Chain integrity' })).not.toBeInTheDocument();
  });

  it('shows an error with retry when the log cannot be loaded', async () => {
    mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/audit': () => ({
        status: 500,
        body: { error: { message: 'database unavailable', type: 'server_error' } },
      }),
    });
    await renderApp('/audit');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('database unavailable');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
