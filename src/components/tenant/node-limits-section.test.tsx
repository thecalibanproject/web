import { useQuery } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { tenantQuery } from '@/api/queries';
import type { Tenant } from '@/api/types';
import { mockApi, renderWithClient } from '@/test/utils';
import { NodeLimitsSection } from './node-limits-section';

const acme: Tenant = {
  id: 'acme',
  name: 'Acme',
  created_at: '2026-10-01T10:00:00Z',
  status: 'active',
  node_caps: null,
  node_spend_caps: null,
};

function FromQuery() {
  const tenant = useQuery(tenantQuery('acme'));
  return tenant.data ? <NodeLimitsSection tenant={tenant.data} /> : null;
}

/** A tenant whose PATCHes are applied by the mocked control plane, as it does. */
function mockTenant(initial: Tenant) {
  let current = initial;
  const calls = mockApi({
    'GET /api/v1/tenants/acme': () => ({ body: current }),
    'PATCH /api/v1/tenants/acme': (call) => {
      current = { ...current, ...(call.body as Partial<Tenant>) };
      return { body: current };
    },
  });
  return { calls, patches: () => calls.filter((c) => c.method === 'PATCH').map((c) => c.body) };
}

function controls() {
  const section = screen.getByRole('region', { name: 'Node limits' });
  const q = within(section);
  return {
    section,
    steps: q.getByLabelText('Steps per run'),
    tokens: q.getByLabelText('Tokens per run'),
    wall: q.getByLabelText('Wall clock per run (seconds)'),
    depth: q.getByLabelText('Subnode depth'),
    fanout: q.getByLabelText('Map fan-out'),
    usd: q.getByLabelText('USD per run'),
    daily: q.getByLabelText('Daily spend cap (USD)'),
    monthly: q.getByLabelText('Monthly spend cap (USD)'),
    save: q.getByRole('button', { name: 'Save' }),
    restore: q.getByRole('button', { name: 'Restore default caps' }),
    status: q.getByRole('status'),
  };
}

const saved = () => waitFor(() => expect(controls().status).toHaveTextContent('Limits saved.'));

describe('NodeLimitsSection', () => {
  it('shows the default caps and no spend caps when none are set', () => {
    renderWithClient(<NodeLimitsSection tenant={acme} />);
    const c = controls();
    expect(within(c.section).getByText('Defaults')).toBeInTheDocument();
    expect(
      [c.steps, c.tokens, c.wall, c.depth, c.fanout].map((i) => (i as HTMLInputElement).value),
    ).toEqual(['200', '2000000', '3600', '5', '32']);
    expect(c.usd).toHaveValue('');
    expect(c.daily).toHaveValue('');
    expect(c.daily).toHaveAttribute('placeholder', 'No cap');
    expect(c.steps).toHaveAccessibleDescription(/Default 200\./);
    expect(c.usd).toHaveAccessibleDescription(/every version must declare budgets\.usd/);
    expect(c.save).toBeDisabled();
    expect(c.restore).toBeDisabled();
  });

  it('sends the whole node_caps object when one cap changes', async () => {
    const { patches } = mockTenant(acme);
    const user = userEvent.setup();
    renderWithClient(<FromQuery />);
    await screen.findByRole('region', { name: 'Node limits' });

    await user.clear(controls().steps);
    await user.type(controls().steps, '50');
    await user.type(controls().usd, '0.5');
    await user.click(controls().save);
    await saved();

    expect(patches()).toEqual([
      {
        node_caps: {
          steps: 50,
          tokens: 2000000,
          wall_clock_s: 3600,
          depth: 5,
          fanout: 32,
          usd: 0.5,
        },
      },
    ]);
    expect(controls().steps).toHaveValue('50');
    expect(within(controls().section).queryByText('Defaults')).not.toBeInTheDocument();
  });

  it('restores the default caps with null', async () => {
    const { patches } = mockTenant({
      ...acme,
      node_caps: { steps: 50, tokens: 1000, wall_clock_s: 60, depth: 2, fanout: 4 },
    });
    const user = userEvent.setup();
    renderWithClient(<FromQuery />);
    await screen.findByRole('region', { name: 'Node limits' });
    expect(controls().steps).toHaveValue('50');

    await user.click(controls().restore);
    expect(controls().steps).toHaveValue('200');
    await user.click(controls().save);
    await saved();
    expect(patches()).toEqual([{ node_caps: null }]);
    expect(within(controls().section).getByText('Defaults')).toBeInTheDocument();
  });

  it('sets the spend caps and removes them with null', async () => {
    const { patches } = mockTenant(acme);
    const user = userEvent.setup();
    renderWithClient(<FromQuery />);
    await screen.findByRole('region', { name: 'Node limits' });

    await user.type(controls().daily, '50');
    await user.type(controls().monthly, '1000');
    await user.click(controls().save);
    await saved();
    await waitFor(() => expect(controls().save).toBeDisabled());

    await user.clear(controls().daily);
    await user.click(controls().save);
    await saved();
    await waitFor(() => expect(controls().save).toBeDisabled());

    await user.clear(controls().monthly);
    await user.click(controls().save);
    await saved();
    expect(patches()).toEqual([
      { node_spend_caps: { daily_usd: 50, monthly_usd: 1000 } },
      { node_spend_caps: { monthly_usd: 1000 } },
      { node_spend_caps: null },
    ]);
  });

  it('goes straight from the edited values to the saved ones, never back to the old values', async () => {
    mockTenant(acme);
    const user = userEvent.setup();
    renderWithClient(<FromQuery />);
    await screen.findByRole('region', { name: 'Node limits' });
    await user.clear(controls().steps);
    await user.type(controls().steps, '75');

    const shown = new Set<string>();
    const record = () => shown.add(controls().steps.getAttribute('value') ?? '');
    const observer = new MutationObserver(record);
    observer.observe(controls().section, { attributes: true, childList: true, subtree: true });
    try {
      await user.click(controls().save);
      await saved();
      record();
    } finally {
      observer.disconnect();
    }
    expect([...shown]).toEqual(['75']);
  });

  it('rejects caps that are not whole numbers of at least 1 and negative spend', async () => {
    const calls = mockApi({});
    const user = userEvent.setup();
    renderWithClient(<NodeLimitsSection tenant={acme} />);
    await user.clear(controls().depth);
    await user.type(controls().depth, '0');
    await user.type(controls().daily, '-1');
    const c = controls();
    expect(c.depth).toHaveAttribute('aria-invalid', 'true');
    expect(c.depth).toHaveAccessibleDescription('Enter a whole number of at least 1.');
    expect(c.daily).toHaveAccessibleDescription(/0 or more/);
    expect(c.save).toBeDisabled();
    expect(calls).toHaveLength(0);
  });

  it('shows why a save failed and keeps the edits', async () => {
    mockApi({
      'PATCH /api/v1/tenants/acme': () => ({
        status: 422,
        body: {
          error: {
            message: 'node_caps: every cap must be positive',
            type: 'invalid_request_error',
          },
        },
      }),
    });
    const user = userEvent.setup();
    renderWithClient(<NodeLimitsSection tenant={acme} />);
    await user.clear(controls().fanout);
    await user.type(controls().fanout, '16');
    await user.click(controls().save);
    expect(await within(controls().section).findByRole('alert')).toHaveTextContent(
      'node_caps: every cap must be positive',
    );
    expect(controls().fanout).toHaveValue('16');
  });

  it('is read only without tenant.write', () => {
    renderWithClient(
      <NodeLimitsSection tenant={{ ...acme, node_spend_caps: { daily_usd: 10 } }} readOnly />,
    );
    const section = screen.getByRole('region', { name: 'Node limits' });
    expect(section).toHaveTextContent('Read only: your role cannot change these limits.');
    expect(within(section).getByLabelText('Steps per run')).toBeDisabled();
    expect(within(section).getByLabelText('Daily spend cap (USD)')).toHaveValue('10');
    expect(within(section).queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
