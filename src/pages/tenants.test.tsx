import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Tenant } from '@/api/types';
import { formatDate } from '@/lib/format';
import { mockApi, renderApp } from '@/test/utils';

const active: Tenant = {
  id: 'acme',
  name: 'Acme',
  created_at: '2026-10-01T10:00:00Z',
  status: 'active',
};
const deleted: Tenant = {
  id: 'globex',
  name: 'Globex',
  created_at: '2026-09-01T10:00:00Z',
  status: 'deleted',
  deleted_at: '2026-10-08T12:00:00Z',
};

describe('TenantsPage', () => {
  it('lists deleted tenants with a Deleted marker only when "Show deleted" is on', async () => {
    const calls = mockApi({
      'GET /api/v1/tenants': (c) => ({
        body: c.query.get('include_deleted') === 'true' ? [active, deleted] : [active],
      }),
    });
    const user = userEvent.setup();
    renderApp('/tenants');

    const table = await screen.findByRole('table', { name: 'Tenants' });
    expect(within(table).getByRole('link', { name: 'Acme' })).toBeInTheDocument();
    expect(within(table).queryByText('Globex')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Show deleted' }));

    // The list with tombstones is a separate query, so the table re-renders.
    const row = (await screen.findByText('Globex')).closest('tr')!;
    expect(within(row).getByText('Deleted')).toBeInTheDocument();
    expect(within(row).getByText(formatDate(deleted.deleted_at))).toBeInTheDocument();
    // A tombstone has nothing to open.
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
    const activeRow = screen.getByRole('link', { name: 'Acme' }).closest('tr')!;
    expect(within(activeRow).getByText('Active')).toBeInTheDocument();
    expect(calls.some((c) => c.query.get('include_deleted') === 'true')).toBe(true);
  });
});
