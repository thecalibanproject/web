import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { UsageEvent, UsageReport } from '@/api/types';
import { mockApi, renderApp } from '@/test/utils';

const tenants = [{ id: 't1', name: 'Acme', created_at: '2026-10-01T10:00:00Z' }];

const base = {
  tenant_id: 't1',
  prompt_tokens: 100,
  completion_tokens: 50,
  latency_ms: 120,
  ts: '2026-10-09T10:00:00Z',
} satisfies Partial<UsageEvent>;

const events: UsageEvent[] = [
  {
    ...base,
    request_id: 'req-auto-miss',
    model: 'local/qwen3-8b',
    requested_model: 'caliban/auto',
    intent: 'sql',
    intent_confidence: 0.87,
    route_stage: 'knn',
    cache: 'miss',
    cost_usd: 0.0005,
    routed_model_cost_usd: 0.0005,
    flat_price_usd: 0.002,
  },
  {
    ...base,
    request_id: 'req-semantic-hit',
    model: 'local/qwen3-8b',
    requested_model: 'caliban/auto',
    intent: 'chitchat',
    intent_confidence: 1,
    route_stage: 'rules',
    cache: 'hit',
    cache_tier: 'semantic',
    tokens_saved: 150,
    cost_usd: 0,
    routed_model_cost_usd: 0,
    flat_price_usd: 0,
  },
  {
    ...base,
    request_id: 'req-pinned-exact',
    model: 'gpt-4o',
    requested_model: 'gpt-4o',
    intent: 'pinned',
    cache: 'hit',
    cache_tier: 'exact',
    tokens_saved: 150,
    cost_usd: 0,
  },
  {
    ...base,
    request_id: 'req-embedding',
    model: 'local/bge-m3',
    cache: 'bypass',
    cost_usd: null,
  },
];

const totals: UsageReport['totals'] = {
  requests: 4,
  prompt_tokens: 400,
  completion_tokens: 200,
  cache_hits: 2,
  semantic_cache_hits: 1,
  tokens_saved: 300,
  cost_usd: 0.0005,
  auto_requests: 2,
  flat_price_usd: 0.002,
  routed_model_cost_usd: 0.0005,
  margin_usd: 0.0015,
};

function mockUsage(report: UsageReport = { events, totals }) {
  return mockApi({
    'GET /api/v1/tenants': () => ({ body: tenants }),
    'GET /api/v1/usage': () => ({ body: report }),
  });
}

const row = (requestId: string) => screen.getByText(requestId).closest('tr')!;

function shownRequests() {
  const table = screen.getByRole('table', { name: 'Usage events' });
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.querySelector('td:nth-child(2)')?.textContent);
}

describe('UsagePage', () => {
  it('shows the route (requested → routed model, stage, confidence) and the cache tier', async () => {
    mockUsage();
    await renderApp('/usage');
    const table = await screen.findByRole('table', { name: 'Usage events' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(expect.arrayContaining(['Route', 'Cache', 'Cache tier']));

    const auto = row('req-auto-miss');
    expect(within(auto).getByText('caliban/auto')).toBeInTheDocument();
    expect(within(auto).getByText('routed to')).toBeInTheDocument();
    expect(within(auto).getByText('local/qwen3-8b')).toBeInTheDocument();
    expect(within(auto).getByText('kNN · 87%')).toBeInTheDocument();

    const semantic = row('req-semantic-hit');
    expect(within(semantic).getByText('Rules · 100%')).toBeInTheDocument();
    expect(within(semantic).getByText('Semantic')).toBeInTheDocument();

    // A pinned request served by the model it named shows the model once, with no stage.
    const pinned = row('req-pinned-exact');
    expect(within(pinned).getAllByText('gpt-4o')).toHaveLength(1);
    expect(within(pinned).queryByText('routed to')).not.toBeInTheDocument();
    expect(within(pinned).getByText('Exact')).toBeInTheDocument();

    const embedding = row('req-embedding');
    expect(within(embedding).getByText('local/bge-m3')).toBeInTheDocument();
    expect(within(embedding).queryByText('routed to')).not.toBeInTheDocument();
  });

  it('filters by cache tier alongside the cache status filter, and keeps it in the URL', async () => {
    mockUsage();
    const user = userEvent.setup();
    const { router } = await renderApp('/usage');
    await screen.findByRole('table', { name: 'Usage events' });
    expect(shownRequests()).toHaveLength(4);

    const tier = screen.getByRole('combobox', { name: 'Cache tier' });
    await user.selectOptions(tier, 'semantic');
    await waitFor(() => expect(shownRequests()).toEqual(['req-semantic-hit']));
    expect(router.state.location.search).toMatchObject({ tier: 'semantic' });

    await user.selectOptions(tier, 'exact');
    await waitFor(() => expect(shownRequests()).toEqual(['req-pinned-exact']));

    // The hit/miss/bypass filter still applies on top of the tier.
    const cache = screen.getByRole('combobox', { name: 'Cache' });
    expect(
      within(cache)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['All', 'hit', 'miss', 'bypass']);
    await user.selectOptions(cache, 'miss');
    expect(await screen.findByText('No events match')).toBeInTheDocument();

    await user.selectOptions(tier, '');
    await waitFor(() => expect(shownRequests()).toEqual(['req-auto-miss']));
  });

  it('reads the tier filter from the URL', async () => {
    mockUsage();
    await renderApp('/usage?tier=semantic');
    await screen.findByRole('table', { name: 'Usage events' });
    expect(shownRequests()).toEqual(['req-semantic-hit']);
  });

  it('totals cache hits with the semantic share', async () => {
    mockUsage();
    await renderApp('/usage');
    expect(await screen.findByText(/2 cache hits \(1 semantic\)/)).toBeInTheDocument();
  });

  it('shows the caliban/auto margin card with flat price, routed model cost and margin', async () => {
    mockUsage();
    await renderApp('/usage');
    const card = await screen.findByRole('region', { name: 'caliban/auto margin' });
    expect(card).toHaveTextContent('2 requests asked for caliban/auto');
    const value = (label: string) => within(card).getByText(label).nextElementSibling;
    expect(value('Flat price')).toHaveTextContent('$0.0020');
    expect(value('Routed model cost')).toHaveTextContent('$0.0005');
    expect(value('Margin')).toHaveTextContent('$0.0015');
    expect(card).toHaveTextContent('Cache hits are not charged yet.');
  });

  it('flags a negative margin', async () => {
    mockUsage({
      events,
      totals: {
        ...totals,
        flat_price_usd: 0.001,
        routed_model_cost_usd: 0.003,
        margin_usd: -0.002,
      },
    });
    await renderApp('/usage');
    const card = await screen.findByRole('region', { name: 'caliban/auto margin' });
    const margin = within(card).getByText('-$0.0020');
    expect(margin).toHaveClass('text-danger');
  });

  it('shows zeros when there was no caliban/auto traffic', async () => {
    mockUsage({ events: [], totals: { requests: 0 } });
    await renderApp('/usage');
    const card = await screen.findByRole('region', { name: 'caliban/auto margin' });
    expect(card).toHaveTextContent('0 requests asked for caliban/auto');
    expect(within(card).getAllByText('$0.00')).toHaveLength(3);
    expect(screen.getByText('No usage yet')).toBeInTheDocument();
  });
});
