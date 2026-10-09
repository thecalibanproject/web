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
});
