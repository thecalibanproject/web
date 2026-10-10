import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Node } from '@/api/types';
import { mockApi, renderApp } from '@/test/utils';

const tenants = [{ id: 't1', name: 'Acme', created_at: '2026-10-01T10:00:00Z' }];
const v1: Node = {
  id: 'n1',
  tenant_id: 't1',
  name: 'invoice-triage',
  version: 1,
  spec: { kind: 'agent' },
  hash: 'sha256:aaaa',
  state: 'draft',
  live: false,
  created_at: '2026-10-02T10:00:00Z',
};
const v2: Node = { ...v1, id: 'n2', version: 2 };

describe('NodesPage', () => {
  it('deletes one node version through a confirm dialog', async () => {
    let nodes = [v1, v2];
    const calls = mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/nodes': () => ({ body: nodes }),
      'DELETE /api/v1/tenants/t1/nodes/n1': () => {
        nodes = nodes.filter((n) => n.id !== 'n1');
        return { status: 204 };
      },
    });
    const user = userEvent.setup();
    await renderApp('/nodes');

    await user.click(await screen.findByRole('button', { name: 'Delete invoice-triage v1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete node version?' });
    expect(dialog).toHaveTextContent('invoice-triage v1');
    expect(dialog).toHaveTextContent(/Only this version is deleted/);

    await user.click(within(dialog).getByRole('button', { name: 'Delete node version' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Delete invoice-triage v1' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Delete invoice-triage v2' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual([
      '/api/v1/tenants/t1/nodes/n1',
    ]);
  });

  it('closes and refreshes when the node was already deleted (404)', async () => {
    let listed = 0;
    mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/nodes': () => {
        listed += 1;
        return { body: listed === 1 ? [v1] : [] };
      },
      'DELETE /api/v1/tenants/t1/nodes/n1': () => ({
        status: 404,
        body: { error: { message: 'node not found', type: 'not_found' } },
      }),
    });
    const user = userEvent.setup();
    await renderApp('/nodes');

    await user.click(await screen.findByRole('button', { name: 'Delete invoice-triage v1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete node version?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete node version' }));

    expect(await screen.findByText('No nodes')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
