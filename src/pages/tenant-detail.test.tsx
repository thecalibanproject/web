import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Tenant } from '@/api/types';
import { expectNoAxeViolations } from '@/test/a11y';
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
  it('has one tab per area, and old deep links open the right tab', async () => {
    mockApi({
      'GET /api/v1/tenants': () => ({ body: [acme] }),
      'GET /api/v1/tenants/acme': () => ({ body: acme }),
      'GET /api/v1/tenants/acme/provider-keys': () => ({ body: [] }),
    });
    await renderApp('/tenants/acme?tab=provider-keys');
    const tablist = await screen.findByRole('tablist', { name: 'Workspace sections' });
    expect(
      within(tablist)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual([
      'Apps and keys',
      'Provider accounts',
      'Topics and routing',
      'Privacy',
      'Limits and budget',
      'Danger zone',
    ]);
    expect(within(tablist).getByRole('tab', { name: 'Provider accounts' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('No provider accounts')).toBeInTheDocument();
    // Only that tab's content: no privacy or limits forms stacked below.
    expect(screen.queryByRole('form', { name: 'Limits and budget' })).not.toBeInTheDocument();
  });

  it('saves the personal data mode on the Privacy tab and updates the header', async () => {
    let current: Tenant = { ...acme, pii_default: 'reversible' };
    const calls = mockApi({
      'GET /api/v1/tenants': () => ({ body: [current] }),
      'GET /api/v1/tenants/acme': () => ({ body: current }),
      'PATCH /api/v1/tenants/acme': (c) => {
        current = { ...current, ...(c.body as Partial<Tenant>) };
        return { body: current };
      },
    });
    const user = userEvent.setup();
    await renderApp('/tenants/acme?tab=privacy');

    expect(
      await screen.findByText('Personal data: Hide from the model, restore in the answer'),
    ).toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'Personal data and reuse of answers' });
    await user.click(within(section).getByRole('radio', { name: /Hide everywhere/ }));
    await user.click(within(section).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Personal data: Hide everywhere')).toBeInTheDocument();
    expect(within(section).getByText('Settings saved.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([
      { pii_default: 'mask' },
    ]);
  });

  it('deletes the workspace from the danger zone and returns to the list', async () => {
    let tenants: Tenant[] = [acme];
    const calls = mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/tenants/acme': () => (tenants.length ? { body: acme } : notFound),
      'DELETE /api/v1/tenants/acme': () => {
        tenants = [];
        return { status: 204 };
      },
    });
    const user = userEvent.setup();
    const { router } = await renderApp('/tenants/acme?tab=danger');

    const section = await screen.findByRole('region', { name: 'Danger zone' });
    await user.click(within(section).getByRole('button', { name: 'Delete workspace' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this workspace?' });
    await user.type(within(dialog).getByLabelText('Type acme to confirm'), 'acme');
    await user.click(within(dialog).getByRole('button', { name: 'Delete workspace' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/tenants'));
    expect(await screen.findByText('No workspaces yet')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual([
      '/api/v1/tenants/acme',
    ]);
  });

  it('shows "This workspace was deleted" instead of an error when it is a 404', async () => {
    mockApi({
      'GET /api/v1/tenants/acme': () => notFound,
      'GET /api/v1/tenants': (c) => ({
        body:
          c.query.get('include_deleted') === 'true'
            ? [{ ...acme, status: 'deleted', deleted_at: '2026-10-09T09:00:00Z' }]
            : [],
      }),
    });
    await renderApp('/tenants/acme');

    expect(await screen.findByText('This workspace was deleted')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to workspaces' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Danger zone' })).not.toBeInTheDocument();
    expect(screen.queryByText(/tenant not found/)).not.toBeInTheDocument();
  });

  it.each(['api-keys', 'privacy', 'limits'])('has no axe violations on the %s tab', async (tab) => {
    mockApi({
      'GET /api/v1/tenants': () => ({ body: [acme] }),
      'GET /api/v1/tenants/acme': () => ({
        body: { ...acme, pii_patterns: [], pii_dictionary: [] },
      }),
      'GET /api/v1/tenants/acme/api-keys': () => ({ body: [] }),
    });
    await renderApp(`/tenants/acme?tab=${tab}`);
    await screen.findByRole('tabpanel');
    await screen.findAllByRole('button', { name: /Save|Create key/ });
    await expectNoAxeViolations();
  });
});
