import { useQuery } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { tenantQuery } from '@/api/queries';
import type { Tenant } from '@/api/types';
import { mockApi, renderWithClient } from '@/test/utils';
import { TenantSettingsSection } from './tenant-settings-section';

const acme: Tenant = {
  id: 'acme',
  name: 'Acme',
  created_at: '2026-10-01T10:00:00Z',
  status: 'active',
  pii_default: 'reversible',
  pii_surrogate_scope: 'tenant',
  semantic_cache: 'off',
};

/** Renders the section from the tenant query, as the detail page does. */
function FromQuery() {
  const tenant = useQuery(tenantQuery('acme'));
  return tenant.data ? <TenantSettingsSection tenant={tenant.data} /> : null;
}

function controls() {
  const section = screen.getByRole('region', { name: 'Privacy and caching' });
  const q = within(section);
  return {
    section,
    pii: q.getByLabelText('PII default mode'),
    scope: q.getByLabelText('Surrogate scope'),
    semantic: q.getByRole('switch', { name: 'Semantic cache' }),
    hitPrice: q.getByLabelText('Cache-hit price for caliban/auto (%)'),
    save: q.getByRole('button', { name: 'Save' }),
    cancel: q.getByRole('button', { name: 'Cancel' }),
  };
}

describe('TenantSettingsSection', () => {
  it('shows the saved values and explains surrogate scope and the semantic cache', () => {
    renderWithClient(<TenantSettingsSection tenant={acme} />);
    const c = controls();
    expect(c.pii).toHaveValue('reversible');
    expect(c.scope).toHaveValue('tenant');
    expect(c.semantic).toHaveAttribute('aria-checked', 'false');
    expect(c.scope).toHaveAccessibleDescription(
      /The model provider can link this tenant's sessions through those stand-ins/,
    );
    expect(c.scope).toHaveAccessibleDescription(
      /disables caching for requests that contain personal data/,
    );
    expect(c.semantic).toHaveAccessibleDescription(/reused only within this tenant/);
    expect(c.semantic).toHaveAccessibleDescription(/\[cache\.semantic\] enabled/);
  });

  it('defaults absent fields to the server defaults', () => {
    const { pii_surrogate_scope: _s, semantic_cache: _c, ...legacy } = acme;
    renderWithClient(<TenantSettingsSection tenant={legacy} />);
    expect(controls().scope).toHaveValue('tenant');
    expect(controls().semantic).toHaveAttribute('aria-checked', 'false');
  });

  it('enables Save and Cancel only while there are unsaved changes, and Cancel reverts', async () => {
    const calls = mockApi({});
    const user = userEvent.setup();
    renderWithClient(<TenantSettingsSection tenant={acme} />);
    let c = controls();
    expect(c.save).toBeDisabled();
    expect(c.cancel).toBeDisabled();

    await user.selectOptions(c.scope, 'session');
    c = controls();
    expect(c.save).toBeEnabled();
    expect(c.cancel).toBeEnabled();
    expect(within(c.section).getByRole('status')).toHaveTextContent('Unsaved changes');

    // Changing a value back to what is saved is not a change.
    await user.selectOptions(c.scope, 'tenant');
    expect(controls().save).toBeDisabled();

    await user.click(controls().semantic);
    expect(controls().semantic).toHaveAttribute('aria-checked', 'true');
    await user.click(controls().cancel);
    c = controls();
    expect(c.semantic).toHaveAttribute('aria-checked', 'false');
    expect(c.save).toBeDisabled();
    expect(calls).toHaveLength(0);
  });

  it('PATCHes only the changed fields and confirms the save', async () => {
    let current = acme;
    const calls = mockApi({
      'GET /api/v1/tenants/acme': () => ({ body: current }),
      'PATCH /api/v1/tenants/acme': (call) => {
        current = { ...current, ...(call.body as Partial<Tenant>) };
        return { body: current };
      },
    });
    const user = userEvent.setup();
    renderWithClient(<FromQuery />);
    await screen.findByRole('region', { name: 'Privacy and caching' });

    await user.selectOptions(controls().pii, 'mask');
    await user.click(controls().semantic);
    await user.click(controls().save);

    const section = controls().section;
    await waitFor(() =>
      expect(within(section).getByRole('status')).toHaveTextContent('Settings saved.'),
    );
    const patches = calls.filter((call) => call.method === 'PATCH');
    expect(patches.map((call) => call.path)).toEqual(['/api/v1/tenants/acme']);
    expect(patches[0]?.body).toEqual({ pii_default: 'mask', semantic_cache: 'on' });
    const c = controls();
    expect(c.pii).toHaveValue('mask');
    expect(c.scope).toHaveValue('tenant');
    expect(c.semantic).toHaveAttribute('aria-checked', 'true');
    expect(c.save).toBeDisabled();
    expect(c.cancel).toBeDisabled();
  });

  it('keeps the edits and shows the error when the save fails', async () => {
    mockApi({
      'PATCH /api/v1/tenants/acme': () => ({
        status: 500,
        body: { error: { message: 'database unavailable', type: 'server_error' } },
      }),
    });
    const user = userEvent.setup();
    renderWithClient(<TenantSettingsSection tenant={acme} />);

    await user.selectOptions(controls().scope, 'session');
    await user.click(controls().save);

    const section = controls().section;
    expect(await within(section).findByRole('alert')).toHaveTextContent('database unavailable');
    expect(controls().scope).toHaveValue('session');
    expect(controls().save).toBeEnabled();
    expect(within(section).getByRole('status')).not.toHaveTextContent('Settings saved.');

    // Editing again clears the stale error.
    await user.click(controls().semantic);
    expect(within(section).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('is read-only for a deleted tenant', () => {
    renderWithClient(
      <TenantSettingsSection
        tenant={{ ...acme, status: 'deleted', deleted_at: '2026-10-08T12:00:00Z' }}
      />,
    );
    const c = controls();
    expect(c.section).toHaveTextContent(/This tenant was deleted/);
    expect(c.pii).toBeDisabled();
    expect(c.scope).toBeDisabled();
    expect(c.semantic).toBeDisabled();
    expect(c.hitPrice).toBeDisabled();
    expect(c.save).toBeDisabled();
    expect(c.cancel).toBeDisabled();
  });

  it('shows the cache-hit price override, or the deployment default when unset', () => {
    renderWithClient(<TenantSettingsSection tenant={acme} />);
    const c = controls();
    expect(c.hitPrice).toHaveValue('');
    expect(c.hitPrice).toHaveAttribute('placeholder', 'Deployment default');
    expect(c.hitPrice).toHaveAccessibleDescription(/20% unless\s+configured/);
  });

  it('saves a cache-hit percent as a fraction and clears it with null', async () => {
    let current: Tenant = { ...acme, auto_cache_hit_fraction: 0.1 };
    const calls = mockApi({
      'GET /api/v1/tenants/acme': () => ({ body: current }),
      'PATCH /api/v1/tenants/acme': (call) => {
        current = { ...current, ...(call.body as Partial<Tenant>) };
        return { body: current };
      },
    });
    const user = userEvent.setup();
    renderWithClient(<FromQuery />);
    await screen.findByRole('region', { name: 'Privacy and caching' });
    expect(controls().hitPrice).toHaveValue('10');

    await user.clear(controls().hitPrice);
    await user.type(controls().hitPrice, '15');
    await user.click(controls().save);
    await waitFor(() => expect(controls().hitPrice).toHaveValue('15'));
    await waitFor(() => expect(controls().save).toBeDisabled());

    await user.clear(controls().hitPrice);
    await user.click(controls().save);
    await waitFor(() =>
      expect(within(controls().section).getByRole('status')).toHaveTextContent('Settings saved.'),
    );
    const patches = calls.filter((call) => call.method === 'PATCH').map((call) => call.body);
    expect(patches).toEqual([{ auto_cache_hit_fraction: 0.15 }, { auto_cache_hit_fraction: null }]);
    expect(controls().hitPrice).toHaveValue('');
  });

  it('rejects a cache-hit percent outside 0 to 100', async () => {
    const calls = mockApi({});
    const user = userEvent.setup();
    renderWithClient(<TenantSettingsSection tenant={acme} />);
    await user.type(controls().hitPrice, '150');
    const c = controls();
    expect(c.hitPrice).toHaveAttribute('aria-invalid', 'true');
    expect(c.hitPrice).toHaveAccessibleDescription(/from 0 to 100/);
    expect(c.save).toBeDisabled();
    expect(c.cancel).toBeEnabled();
    await user.clear(c.hitPrice);
    await user.type(c.hitPrice, '20');
    expect(controls().save).toBeEnabled();
    expect(calls).toHaveLength(0);
  });
});
