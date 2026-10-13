import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Tenant } from '@/api/types';
import { mockApi, renderWithClient } from '@/test/utils';
import { DeleteTenantSection } from './delete-tenant-section';

const acme: Tenant = {
  id: 'acme-finance',
  name: 'Acme Finance',
  created_at: '2026-10-01T10:00:00Z',
  status: 'active',
};

async function openDialog() {
  const user = userEvent.setup();
  const section = screen.getByRole('region', { name: 'Danger zone' });
  await user.click(within(section).getByRole('button', { name: 'Delete workspace' }));
  const dialog = await screen.findByRole('dialog', { name: 'Delete this workspace?' });
  return { user, dialog };
}

describe('DeleteTenantSection', () => {
  it('explains the cascade and only deletes once the tenant id is typed', async () => {
    const calls = mockApi({ 'DELETE /api/v1/tenants/acme-finance': () => ({ status: 204 }) });
    const onDeleted = vi.fn();
    renderWithClient(<DeleteTenantSection tenant={acme} onDeleted={onDeleted} />);
    const { user, dialog } = await openDialog();

    expect(dialog).toHaveTextContent(/revokes all of its app keys/);
    expect(dialog).toHaveTextContent(/destroys its own provider accounts/);
    expect(dialog).toHaveTextContent(/removes its routing/);
    expect(dialog).toHaveTextContent(/deletes its data connections and assistants/);
    expect(dialog).toHaveTextContent(/The audit log is kept/);
    expect(dialog).toHaveTextContent(/can't be reused/);

    const confirm = within(dialog).getByRole('button', { name: 'Delete workspace' });
    const input = within(dialog).getByLabelText('Type acme-finance to confirm');
    expect(confirm).toBeDisabled();

    // The display name is not enough; it has to be the id.
    await user.type(input, 'Acme Finance');
    expect(confirm).toBeDisabled();
    await user.clear(input);
    await user.type(input, 'acme-finance');
    expect(confirm).toBeEnabled();
    expect(calls).toHaveLength(0);

    await user.click(confirm);

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'DELETE /api/v1/tenants/acme-finance',
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('submits with Enter from the confirmation field', async () => {
    mockApi({ 'DELETE /api/v1/tenants/acme-finance': () => ({ status: 204 }) });
    const onDeleted = vi.fn();
    renderWithClient(<DeleteTenantSection tenant={acme} onDeleted={onDeleted} />);
    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText(/to confirm/), 'acme-finance{Enter}');
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it('treats a 404 as already deleted and moves on', async () => {
    mockApi({
      'DELETE /api/v1/tenants/acme-finance': () => ({
        status: 404,
        body: { error: { message: 'tenant not found', type: 'not_found' } },
      }),
    });
    const onDeleted = vi.fn();
    renderWithClient(<DeleteTenantSection tenant={acme} onDeleted={onDeleted} />);
    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText(/to confirm/), 'acme-finance');
    await user.click(within(dialog).getByRole('button', { name: 'Delete workspace' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it('keeps the dialog open with the error on failure, and Cancel clears the typed id', async () => {
    mockApi({
      'DELETE /api/v1/tenants/acme-finance': () => ({
        status: 500,
        body: { error: { message: 'database unavailable', type: 'server_error' } },
      }),
    });
    const onDeleted = vi.fn();
    renderWithClient(<DeleteTenantSection tenant={acme} onDeleted={onDeleted} />);
    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText(/to confirm/), 'acme-finance');
    await user.click(within(dialog).getByRole('button', { name: 'Delete workspace' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('database unavailable');
    expect(onDeleted).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const reopened = await openDialog();
    expect(within(reopened.dialog).getByLabelText(/to confirm/)).toHaveValue('');
    expect(within(reopened.dialog).queryByRole('alert')).not.toBeInTheDocument();
  });
});
