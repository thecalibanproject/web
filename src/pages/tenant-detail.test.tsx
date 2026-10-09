import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Tenant } from '@/api/types';
import { mockApi, renderApp } from '@/test/utils';

const acme: Tenant = {
  id: 'acme',
  name: 'Acme',
  created_at: '2026-10-01T10:00:00Z',
  status: 'active',
};

const notFound = {
  status: 404,
  body: { error: { message: 'tenant not found', type: 'not_found' } },
};

describe('TenantDetailPage', () => {
  it('deletes the tenant from the danger zone and returns to the tenant list', async () => {
    let tenants: Tenant[] = [acme];
    const calls = mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/tenants/acme': () => (tenants.length ? { body: acme } : notFound),
      'GET /api/v1/tenants/acme/api-keys': () => ({ body: [] }),
      'DELETE /api/v1/tenants/acme': () => {
        tenants = [];
        return { status: 204 };
      },
    });
    const user = userEvent.setup();
    const { router } = renderApp('/tenants/acme');

    const section = await screen.findByRole('region', { name: 'Danger zone' });
    await user.click(within(section).getByRole('button', { name: 'Delete tenant' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete tenant?' });
    await user.type(within(dialog).getByLabelText('Type acme to confirm'), 'acme');
    await user.click(within(dialog).getByRole('button', { name: 'Delete tenant' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/tenants'));
    expect(await screen.findByText('No tenants yet')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual([
      '/api/v1/tenants/acme',
    ]);
  });

  it('shows "This tenant was deleted" instead of an error when the tenant is a 404', async () => {
    mockApi({
      'GET /api/v1/tenants/acme': () => notFound,
      'GET /api/v1/tenants': (c) => ({
        body:
          c.query.get('include_deleted') === 'true'
            ? [{ ...acme, status: 'deleted', deleted_at: '2026-10-09T09:00:00Z' }]
            : [],
      }),
    });
    renderApp('/tenants/acme');

    expect(await screen.findByText('This tenant was deleted')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to tenants' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Danger zone' })).not.toBeInTheDocument();
    expect(screen.queryByText(/tenant not found/)).not.toBeInTheDocument();
  });
});
