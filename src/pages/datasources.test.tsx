import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Datasource } from '@/api/types';
import { mockApi, renderApp } from '@/test/utils';

const tenants = [{ id: 't1', name: 'Acme', created_at: '2026-10-01T10:00:00Z' }];
const salesDw: Datasource = {
  id: 'ds1',
  tenant_id: 't1',
  kind: 'mongodb',
  name: 'sales_dw',
  status: 'connected',
};
const crm: Datasource = { ...salesDw, id: 'ds2', name: 'crm' };
const legacy: Datasource = { ...salesDw, id: 'ds3', name: 'legacy', status: 'connected' };

describe('DatasourcesPage', () => {
  it('deletes a datasource through a confirm dialog, scoped to its tenant', async () => {
    let sources = [salesDw, crm];
    const calls = mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/datasources': () => ({ body: sources }),
      'DELETE /api/v1/tenants/t1/datasources/ds1': () => {
        sources = sources.filter((s) => s.id !== 'ds1');
        return { status: 204 };
      },
    });
    const user = userEvent.setup();
    await renderApp('/datasources');

    await user.click(await screen.findByRole('button', { name: 'Delete sales_dw' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete datasource?' });
    expect(dialog).toHaveTextContent('sales_dw');
    expect(dialog).toHaveTextContent('Acme');
    expect(dialog).toHaveTextContent(/connection settings are wiped/);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: 'Delete datasource' }));

    await waitFor(() => expect(screen.queryByText('sales_dw')).not.toBeInTheDocument());
    expect(screen.getByText('crm')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual([
      '/api/v1/tenants/t1/datasources/ds1',
    ]);
  });

  it("shows each datasource's newest introspection job, and starts one", async () => {
    const running = {
      id: 'job3',
      datasource_id: 'ds3',
      tenant_id: 't1',
      status: 'running' as const,
      objects: 0,
      proposed: 0,
      skipped: 0,
      version: null,
      started_at: '2026-10-11T10:05:00Z',
    };
    let started = false;
    const calls = mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/datasources': () => ({
        body: [{ ...salesDw, status: 'ready' }, { ...crm, status: 'failed' }, legacy],
      }),
      'GET /api/v1/datasources/ds1/introspection': () => ({
        body: {
          id: 'job1',
          datasource_id: 'ds1',
          tenant_id: 't1',
          status: 'succeeded',
          objects: 12,
          proposed: 40,
          skipped: 3,
          version: 7,
          started_at: '2026-10-11T10:00:00Z',
          finished_at: '2026-10-11T10:00:09Z',
        },
      }),
      'GET /api/v1/datasources/ds2/introspection': () => ({
        body: {
          id: 'job2',
          datasource_id: 'ds2',
          tenant_id: 't1',
          status: 'failed',
          objects: 0,
          proposed: 0,
          skipped: 0,
          version: null,
          error: 'the principal can write: use a read-only user',
          started_at: '2026-10-11T10:00:00Z',
        },
      }),
      'GET /api/v1/datasources/ds3/introspection': () => (started ? { body: running } : undefined),
      'POST /api/v1/datasources/ds3/introspect': () => {
        started = true;
        return { status: 202, body: { job_id: 'job3', job: running } };
      },
    });
    const user = userEvent.setup();
    await renderApp('/datasources');

    const rows = await screen.findAllByRole('row');
    const row = (name: string) => rows.find((r) => within(r).queryByText(name))!;
    await waitFor(() =>
      expect(row('sales_dw')).toHaveTextContent(
        '12 collections, 40 proposed, 3 skipped in version 7',
      ),
    );
    expect(within(row('sales_dw')).getByRole('link', { name: 'version 7' })).toHaveAttribute(
      'href',
      '/ontology?tenant=t1',
    );
    expect(within(row('sales_dw')).getByText('ready')).toBeInTheDocument();
    expect(row('crm')).toHaveTextContent('the principal can write: use a read-only user');
    expect(within(row('crm')).getAllByText('failed')).toHaveLength(2);
    // A failed job (a stale one included) may be started again.
    expect(within(row('crm')).getByRole('button', { name: 'Introspect crm' })).toBeEnabled();
    // Never introspected (404): nothing to show.
    expect(row('legacy')).toHaveTextContent('n/a');

    await user.click(within(row('legacy')).getByRole('button', { name: 'Introspect legacy' }));
    await waitFor(() => expect(within(row('legacy')).getByText('running')).toBeInTheDocument());
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([
      '/api/v1/datasources/ds3/introspect',
    ]);
  });
});
