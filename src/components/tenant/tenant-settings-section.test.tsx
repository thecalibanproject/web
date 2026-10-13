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
  const section = screen.getByRole('region', { name: 'Personal data and reuse of answers' });
  const q = within(section);
  return {
    section,
    pii: q.getByRole('group', { name: /How personal data is protected/ }),
    scope: q.getByLabelText('Placeholder consistency'),
    semantic: q.getByRole('switch', { name: 'Reuse answers to similar questions' }),
    hitPrice: q.getByLabelText('Price of a reused answer (%)'),
    save: q.getByRole('button', { name: 'Save' }),
    cancel: q.getByRole('button', { name: 'Cancel' }),
  };
}

/** The checked personal data mode. */
function piiMode() {
  return within(controls().pii)
    .getAllByRole('radio')
    .find((r) => (r as HTMLInputElement).checked)
    ?.getAttribute('value');
}

describe('TenantSettingsSection', () => {
  it('asks how personal data is protected, with an example, and keeps the expert settings under Advanced', () => {
    renderWithClient(<TenantSettingsSection tenant={acme} />);
    const c = controls();
    expect(piiMode()).toBe('reversible');
    expect(c.pii).toHaveTextContent('Recommended');
    expect(c.pii).toHaveTextContent('the caller sees [PHONE] in the answer too');
    expect(c.scope).toHaveValue('tenant');
    expect(c.semantic).toHaveAttribute('aria-checked', 'false');
    // The expert settings are in the Advanced section, its summary naming the defaults.
    const advanced = within(c.section).getByText('Advanced').closest('details')!;
    expect(advanced).not.toHaveAttribute('open');
    expect(advanced).toContainElement(c.scope);
    expect(advanced).toContainElement(c.semantic);
    expect(c.scope).toHaveAccessibleDescription(
      /the model provider can link conversations through them/,
    );
    expect(c.scope).toHaveAccessibleDescription(/Also called surrogate scope/);
    expect(c.semantic).toHaveAccessibleDescription(/IT administrator must also turn it on/);
    // Config keys are for administrators, inside Advanced, not in basic help.
    expect(advanced).toHaveTextContent('[cache.semantic] enabled');
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
    expect(within(c.section).getByText('Unsaved changes')).toBeInTheDocument();

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
    await screen.findByRole('region', { name: 'Personal data and reuse of answers' });

    await user.click(within(controls().pii).getByRole('radio', { name: /Hide everywhere/ }));
    await user.click(controls().semantic);
    await user.click(controls().save);

    const section = controls().section;
    await waitFor(() => expect(within(section).getByText('Settings saved.')).toBeInTheDocument());
    const patches = calls.filter((call) => call.method === 'PATCH');
    expect(patches.map((call) => call.path)).toEqual(['/api/v1/tenants/acme']);
    expect(patches[0]?.body).toEqual({ pii_default: 'mask', semantic_cache: 'on' });
    const c = controls();
    expect(piiMode()).toBe('mask');
    expect(c.scope).toHaveValue('tenant');
    expect(c.semantic).toHaveAttribute('aria-checked', 'true');
    expect(c.save).toBeDisabled();
    expect(c.cancel).toBeDisabled();
  });

  it('goes straight from the edited values to the saved ones, never back to the old values', async () => {
    let current: Tenant = { ...acme, auto_cache_hit_fraction: 0.2 };
    mockApi({
      'GET /api/v1/tenants/acme': () => ({ body: current }),
      'PATCH /api/v1/tenants/acme': (call) => {
        current = { ...current, ...(call.body as Partial<Tenant>) };
        return { body: current };
      },
    });
    const user = userEvent.setup();
    renderWithClient(<FromQuery />);
    await screen.findByRole('region', { name: 'Personal data and reuse of answers' });

    await user.click(controls().semantic);
    await user.clear(controls().hitPrice);
    await user.type(controls().hitPrice, '35');

    // Record every value the switch and the price field show while saving.
    // React mirrors a controlled input's value to its attribute.
    const shown = new Set<string>();
    const record = () => {
      const c = controls();
      shown.add(`${c.semantic.getAttribute('aria-checked')}|${c.hitPrice.getAttribute('value')}`);
    };
    const observer = new MutationObserver(record);
    observer.observe(controls().section, { attributes: true, childList: true, subtree: true });
    try {
      await user.click(controls().save);
      await waitFor(() =>
        expect(within(controls().section).getByText('Settings saved.')).toBeInTheDocument(),
      );
      record();
    } finally {
      observer.disconnect();
    }

    expect([...shown]).toEqual(['true|35']);
    expect(controls().save).toBeDisabled();
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
    expect(within(section).queryByText('Settings saved.')).not.toBeInTheDocument();

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
    expect(c.section).toHaveTextContent(/This workspace was deleted/);
    expect(c.pii).toBeDisabled();
    expect(within(c.pii).getAllByRole('radio')[0]).toBeDisabled();
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
    expect(c.hitPrice).toHaveAttribute('placeholder', 'Installation default');
    expect(c.hitPrice).toHaveAccessibleDescription(/20% unless your administrator changed it/);
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
    await screen.findByRole('region', { name: 'Personal data and reuse of answers' });
    expect(controls().hitPrice).toHaveValue('10');

    await user.clear(controls().hitPrice);
    await user.type(controls().hitPrice, '15');
    await user.click(controls().save);
    await waitFor(() => expect(controls().hitPrice).toHaveValue('15'));
    await waitFor(() => expect(controls().save).toBeDisabled());

    await user.clear(controls().hitPrice);
    await user.click(controls().save);
    await waitFor(() =>
      expect(within(controls().section).getByText('Settings saved.')).toBeInTheDocument(),
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

  it('turns the PII mode on for sovereign models, off by default', async () => {
    let current = acme;
    const calls = mockApi({
      'GET /api/v1/tenants/acme': () => ({ body: current }),
      'PATCH /api/v1/tenants/acme': (c) => {
        current = { ...current, ...(c.body as Partial<Tenant>) };
        return { body: current };
      },
    });
    const user = userEvent.setup();
    renderWithClient(<FromQuery />);
    const sovereign = await screen.findByRole('switch', {
      name: 'Also hide personal data from models on your servers',
    });
    expect(sovereign).toHaveAttribute('aria-checked', 'false');
    expect(sovereign).toHaveAccessibleDescription(/get the text as is/);

    await user.click(sovereign);
    await user.click(controls().save);

    await waitFor(() => expect(sovereign).toHaveAttribute('aria-checked', 'true'));
    expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([
      { pii_on_sovereign: true },
    ]);
  });
});
