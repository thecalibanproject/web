import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '@/test/a11y';
import { mockApi, renderApp } from '@/test/utils';

const tenants = [{ id: 't1', name: 'Clinic', created_at: '2026-10-01T10:00:00Z' }];

function mock({ keys = [] as unknown[], nodes = [] as unknown[], spend = true } = {}) {
  return mockApi({
    'GET /api/v1/tenants': () => ({ body: tenants }),
    'GET /api/v1/providers': () => ({
      body: [
        {
          id: 'vllm',
          kind: 'openai_compatible',
          base_url: 'http://vllm:8000/v1',
          trust_tier: 't0_sovereign',
          cache_salt: false,
          has_api_key: false,
          tenants: [],
        },
      ],
    }),
    'GET /api/v1/providers/vllm/health': () => ({ body: { status: 'ok' } }),
    'GET /api/v1/models': () => ({ body: [] }),
    'GET /api/v1/tenants/t1/api-keys': () => ({ body: keys }),
    'GET /api/v1/usage': () => ({ body: { events: [], totals: { requests: 0 } } }),
    'GET /api/v1/tenants/t1/rag/collections': () => ({ body: [] }),
    'GET /api/v1/datasources': () => ({ body: [] }),
    'GET /api/v1/nodes': () => ({ body: nodes }),
    'GET /api/v1/tenants/t1/inbox': () => ({
      body: { object: 'list', content_visible: true, data: [] },
    }),
    'GET /api/v1/tenants/t1/runs': () => ({ body: { object: 'list', data: [] } }),
    'GET /api/v1/tenants/t1/node-spend': () =>
      spend
        ? {
            body: {
              tenant_id: 't1',
              day: '2026-10-13',
              month: '2026-10',
              today_usd: 0.4,
              month_usd: 170,
              caps: { daily_usd: 20, monthly_usd: 200 },
              remaining: { daily_usd: 19.6, monthly_usd: 30 },
              capped: false,
            },
          }
        : { status: 503, body: { error: { message: 'no journal', type: 'unavailable' } } },
  });
}

describe('Home', () => {
  it('shows a setup checklist derived from live state, each step linked to where it is done', async () => {
    mock();
    await renderApp('/');
    const list = await screen.findByRole('region', { name: 'Get set up' });
    await within(list).findByText(/A model server is reachable/);
    await waitFor(() =>
      expect(within(list).getByText(/A model server is reachable/)).toHaveTextContent(': done'),
    );
    expect(within(list).getByText(/A chat model is available/)).toHaveTextContent(': to do');
    expect(within(list).getByRole('link', { name: 'Add a model' })).toHaveAttribute(
      'href',
      '/models?tab=catalogue',
    );
    expect(within(list).getByRole('link', { name: 'Create an app key' })).toHaveAttribute(
      'href',
      '/tenants/t1?tab=api-keys',
    );
    expect(within(list).getAllByRole('link', { name: /Learn more/ })[0]).toHaveAttribute(
      'href',
      '/docs/guides/models/#add-a-model',
    );
  });

  it('can be hidden, and stays hidden for this user', async () => {
    mock();
    await renderApp('/');
    const list = await screen.findByRole('region', { name: 'Get set up' });
    await userEvent.click(within(list).getByRole('button', { name: 'Hide checklist' }));
    expect(screen.queryByRole('region', { name: 'Get set up' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('caliban.checklist.admin-token')).toContain('"hidden":true');
    await userEvent.click(screen.getByRole('button', { name: 'Show it again' }));
    expect(await screen.findByRole('region', { name: 'Get set up' })).toBeInTheDocument();
  });

  it('keeps working when browser storage holds garbage', async () => {
    window.localStorage.setItem('caliban.checklist.admin-token', '{not json');
    mock();
    await renderApp('/');
    expect(await screen.findByRole('region', { name: 'Get set up' })).toBeInTheDocument();
  });

  it('shows spend against the caps and warns near a cap', async () => {
    mock();
    await renderApp('/');
    const tile = await screen.findByRole('region', { name: 'Assistant spend' });
    await within(tile).findByText(/\$170\.00 of \$200\.00 \(85%\)/);
    expect(
      within(tile).getByRole('meter', { name: 'This month: spend against the cap' }),
    ).toHaveAttribute('aria-valuenow', '85');
  });

  it('says when spend is not tracked', async () => {
    mock({ spend: false });
    await renderApp('/');
    const tile = await screen.findByRole('region', { name: 'Assistant spend' });
    expect(
      await within(tile).findByText('Spend is not tracked on this installation.'),
    ).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    mock();
    await renderApp('/');
    await screen.findByRole('region', { name: 'Get set up' });
    await screen.findByRole('region', { name: 'Assistant spend' });
    await expectNoAxeViolations();
  });
});
