import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatDateTime } from '@/lib/format';
import { mockApi, renderWithClient } from '@/test/utils';
import { TenantDeletedState } from './tenant-deleted-state';

describe('TenantDeletedState', () => {
  it('names the deleted tenant and when it was deleted, from the tombstone list', async () => {
    const calls = mockApi({
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
    renderWithClient(<TenantDeletedState tenantId="t1" />);

    expect(await screen.findByText('This tenant was deleted')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(formatDateTime('2026-10-09T09:00:00Z'))),
    ).toBeInTheDocument();
    expect(screen.getByText(/Audit history is kept/)).toBeInTheDocument();
    expect(calls[0]?.query.get('include_deleted')).toBe('true');
  });

  it('says "not found" for an id that never existed', async () => {
    mockApi({ 'GET /api/v1/tenants': () => ({ body: [] }) });
    renderWithClient(<TenantDeletedState tenantId="typo" />);
    expect(await screen.findByText('Tenant not found')).toBeInTheDocument();
    expect(screen.queryByText('This tenant was deleted')).not.toBeInTheDocument();
  });
});
