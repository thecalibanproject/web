import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { UsageEvent, UsageReport } from '@/api/types';
import { expectNoAxeViolations } from '@/test/a11y';
import { meWith, ssoRoutes } from '@/test/auth';
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
    cache: 'miss',
    cost_usd: 0.0005,
    routed_model_cost_usd: 0.0005,
    flat_price_usd: 0.002,
    billed_usd: 0.002,
  },
  {
    ...base,
    request_id: 'req-semantic-hit',
    model: 'local/qwen3-8b',
    requested_model: 'caliban/auto',
    cache: 'hit',
    cache_tier: 'semantic',
    tokens_saved: 150,
    cost_usd: 0,
    routed_model_cost_usd: 0,
    flat_price_usd: 0.002,
    billed_usd: 0.0004,
    saved_usd: 0.0016,
  },
  {
    ...base,
    request_id: 'req-pinned-exact',
    model: 'gpt-4o',
    requested_model: 'gpt-4o',
    cache: 'hit',
    cache_tier: 'exact',
    tokens_saved: 150,
    cost_usd: 0,
    saved_usd: 0.0009,
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
  saved_usd: 0.0025,
  cost_usd: 0.0005,
  auto_requests: 2,
  auto_cache_hits: 1,
  flat_price_usd: 0.004,
  billed_usd: 0.0024,
  auto_saved_usd: 0.0016,
  routed_model_cost_usd: 0.0005,
  margin_usd: 0.0019,
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
  it('leads with what was charged, and keeps the margin cards for operators', async () => {
    const calls = mockApi({
      ...ssoRoutes(meWith([{ role: 'tenant_admin', tenant_id: 't1' }])),
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/usage': () => ({ body: { events, totals: { ...totals, charged_usd: 0.0029 } } }),
    });
    await renderApp('/usage', { token: null });
    const charged = await screen.findByText('Charged to your budget');
    expect(charged.nextSibling).toHaveTextContent('$0.0029');
    await screen.findByRole('table', { name: 'Usage events' });
    expect(
      screen.queryByRole('region', { name: 'Automatic routing billing and margin' }),
    ).not.toBeInTheDocument();
    // A workspace role sees its workspace, with no "all workspaces" choice.
    expect(screen.queryByRole('combobox', { name: 'Workspaces' })).not.toBeInTheDocument();
    expect(calls.find((c) => c.path === '/api/v1/usage')?.query.get('tenant_id')).toBe('t1');
  });

  it('lets a deployment-wide role look across every workspace', async () => {
    const user = userEvent.setup();
    const calls = mockUsage();
    await renderApp('/usage');
    const scope = await screen.findByRole('combobox', { name: 'Workspaces' });
    await user.selectOptions(scope, 'all');
    await waitFor(() =>
      expect(
        calls
          .filter((c) => c.path === '/api/v1/usage')
          .at(-1)
          ?.query.has('tenant_id'),
      ).toBe(false),
    );
  });

  it('has no axe violations', async () => {
    mockUsage();
    await renderApp('/usage');
    await screen.findByRole('table', { name: 'Usage events' });
    await expectNoAxeViolations();
  });

  it('shows the route (requested → routed model) and the cache tier', async () => {
    mockUsage();
    await renderApp('/usage');
    const table = await screen.findByRole('table', { name: 'Usage events' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(expect.arrayContaining(['Route', 'Answer', 'Reuse']));
    // Routing decisions are not kept per event.
    expect(headers).not.toContain('Intent');

    const auto = row('req-auto-miss');
    expect(within(auto).getByText('caliban/auto')).toBeInTheDocument();
    expect(within(auto).getByText('routed to')).toBeInTheDocument();
    expect(within(auto).getByText('local/qwen3-8b')).toBeInTheDocument();

    const semantic = row('req-semantic-hit');
    expect(within(semantic).getByText('Similar request')).toBeInTheDocument();

    // A pinned request served by the model it named shows the model once.
    const pinned = row('req-pinned-exact');
    expect(within(pinned).getAllByText('gpt-4o')).toHaveLength(1);
    expect(within(pinned).queryByText('routed to')).not.toBeInTheDocument();
    expect(within(pinned).getByText('Identical request')).toBeInTheDocument();

    const embedding = row('req-embedding');
    expect(within(embedding).getByText('local/bge-m3')).toBeInTheDocument();
    expect(within(embedding).queryByText('routed to')).not.toBeInTheDocument();
  });

  it('shows the daily routing counts, and says they are not kept per node or run', async () => {
    const user = userEvent.setup();
    mockUsage({
      events,
      totals,
      by_route: [
        {
          tenant_id: 't1',
          day: '2026-10-08',
          intent: 'sql',
          route_stage: 'knn',
          route_fallback: '',
          requests: 3,
        },
        {
          tenant_id: 't1',
          day: '2026-10-09',
          intent: 'chitchat',
          route_stage: 'rules',
          route_fallback: 'low_confidence',
          requests: 7,
        },
      ],
    });
    await renderApp('/usage');
    const table = await screen.findByRole('table', { name: 'Routing per day' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('2026-10-09AcmechitchatBy a rulelow_confidence7');
    expect(rows[2]).toHaveTextContent('2026-10-08AcmesqlBy example sentencesnone3');

    await user.type(screen.getByPlaceholderText('Conversation id'), 'run_1');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(
      await screen.findByText('Not counted per assistant or conversation'),
    ).toBeInTheDocument();
  });

  it('filters by cache tier alongside the cache status filter, and keeps it in the URL', async () => {
    mockUsage();
    const user = userEvent.setup();
    const { router } = await renderApp('/usage');
    await screen.findByRole('table', { name: 'Usage events' });
    expect(shownRequests()).toHaveLength(4);

    const tier = screen.getByRole('combobox', { name: 'Reuse' });
    await user.selectOptions(tier, 'semantic');
    await waitFor(() => expect(shownRequests()).toEqual(['req-semantic-hit']));
    expect(router.state.location.search).toMatchObject({ tier: 'semantic' });

    await user.selectOptions(tier, 'exact');
    await waitFor(() => expect(shownRequests()).toEqual(['req-pinned-exact']));

    // The hit/miss/bypass filter still applies on top of the tier.
    const cache = screen.getByRole('combobox', { name: 'Answer' });
    expect(
      within(cache)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['All', 'Reused', 'New answer', 'Not cached']);
    await user.selectOptions(cache, 'miss');
    expect(await screen.findByText('No requests match')).toBeInTheDocument();

    await user.selectOptions(tier, '');
    await waitFor(() => expect(shownRequests()).toEqual(['req-auto-miss']));
  });

  it('reads the tier filter from the URL', async () => {
    mockUsage();
    await renderApp('/usage?tier=semantic');
    await screen.findByRole('table', { name: 'Usage events' });
    expect(shownRequests()).toEqual(['req-semantic-hit']);
  });

  it('shows retrieval spend by purpose, and the purpose of each event', async () => {
    mockUsage({
      events: [
        ...events,
        {
          ...base,
          request_id: 'req-rag-index',
          model: 'local/bge-m3',
          cache: 'bypass',
          cost_usd: 0.0001,
          purpose: 'rag.ingest',
        },
      ],
      totals,
      by_purpose: [
        {
          purpose: 'rag.search',
          totals: { requests: 4, prompt_tokens: 80, charged_usd: 0.0002, cost_usd: 0.0002 },
        },
        {
          purpose: 'rag.ingest',
          totals: { requests: 30, prompt_tokens: 12000, charged_usd: 0.003, cost_usd: 0.003 },
        },
      ],
    });
    await renderApp('/usage');
    const card = await screen.findByRole('region', { name: 'Knowledge spend' });
    const rows = within(card).getAllByRole('row');
    expect(rows[1]).toHaveTextContent(/^Indexing documents rag\.ingest3012,000\$0\.0030\$0\.0030$/);
    expect(rows[2]).toHaveTextContent('Retrieval queries rag.search');
    expect(within(row('req-rag-index')).getByText('rag.ingest')).toHaveAttribute(
      'title',
      expect.stringMatching(/Embedding a collection's documents/),
    );
    expect(within(row('req-embedding')).queryByText(/rag\./)).not.toBeInTheDocument();
  });

  it('says when there were no retrieval calls', async () => {
    mockUsage();
    await renderApp('/usage');
    expect(
      await within(await screen.findByRole('region', { name: 'Knowledge spend' })).findByText(
        'No document library calls yet',
      ),
    ).toBeInTheDocument();
  });

  it('totals cache hits with the semantic share and what they saved', async () => {
    mockUsage();
    await renderApp('/usage');
    expect(await screen.findByText(/2 reused \(1 similar\)/)).toBeInTheDocument();
    expect(screen.getByText(/300 tokens saved \(\$0\.0025\)/)).toBeInTheDocument();
  });

  it('shows what each request was billed, with the discount on caliban/auto cache hits', async () => {
    mockUsage();
    await renderApp('/usage');
    const table = await screen.findByRole('table', { name: 'Usage events' });
    expect(within(table).getByRole('columnheader', { name: 'Billed' })).toBeInTheDocument();
    const billed = (id: string) => row(id).querySelector('td:nth-last-child(2)');
    expect(billed('req-auto-miss')).toHaveTextContent(/^\$0\.0020$/);
    expect(billed('req-semantic-hit')).toHaveTextContent('$0.0004of $0.0020, saved $0.0016');
    // A pinned model's hit is not billed by Caliban; it shows the model cost it avoided.
    expect(billed('req-pinned-exact')).toHaveTextContent('saved $0.0009');
  });

  it('shows the caliban/auto card with billed, flat price, cache-hit savings, cost and margin', async () => {
    mockUsage();
    await renderApp('/usage');
    const card = await screen.findByRole('region', {
      name: 'Automatic routing billing and margin',
    });
    expect(card).toHaveTextContent(
      '2 requests used automatic routing (caliban/auto), 1 with a reused answer',
    );
    const value = (label: string) => within(card).getByText(label).nextElementSibling;
    expect(value('Billed')).toHaveTextContent('$0.0024');
    expect(value('Flat price')).toHaveTextContent('$0.0040');
    expect(value('Saved by reuse')).toHaveTextContent('$0.0016');
    expect(value('Routed model cost')).toHaveTextContent('$0.0005');
    expect(value('Margin')).toHaveTextContent('$0.0019');
    expect(card).toHaveTextContent('1 reused answer at the discounted price');
    expect(card).toHaveTextContent('A reused answer calls no model and is billed a share');
  });

  it('treats totals without billed_usd (older servers) as billed at the flat price', async () => {
    const {
      billed_usd: _billed,
      auto_cache_hits: _hits,
      auto_saved_usd: _saved,
      ...older
    } = totals;
    mockUsage({ events, totals: { ...older, margin_usd: 0.0035 } });
    await renderApp('/usage');
    const card = await screen.findByRole('region', {
      name: 'Automatic routing billing and margin',
    });
    const value = (label: string) => within(card).getByText(label).nextElementSibling;
    expect(value('Billed')).toHaveTextContent('$0.0040');
    expect(value('Saved by reuse')).toHaveTextContent('$0.00');
    expect(card).toHaveTextContent('0 with a reused answer');
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
    const card = await screen.findByRole('region', {
      name: 'Automatic routing billing and margin',
    });
    const margin = within(card).getByText('-$0.0020');
    expect(margin).toHaveClass('text-danger');
  });

  it('does not flag or sign a margin that is float noise around zero', async () => {
    mockUsage({
      events,
      totals: { ...totals, billed_usd: 0.3, routed_model_cost_usd: 0.3, margin_usd: -1e-17 },
    });
    await renderApp('/usage');
    const card = await screen.findByRole('region', {
      name: 'Automatic routing billing and margin',
    });
    const margin = within(card).getByText('Margin').nextElementSibling!;
    expect(margin).toHaveTextContent(/^\$0\.00$/);
    expect(margin.querySelector('span')).not.toHaveClass('text-danger');
  });

  it('shows $0.00, not -$0.00, for the -0.0 totals the server sends over no priced events', async () => {
    // Rust sums an empty f64 iterator to -0.0, and serde_json writes it as -0.0.
    const zero = (keys: string[]) => keys.map((k) => `"${k}":-0.0`).join(',');
    const raw = `{"events":[],"totals":{"requests":0,"auto_requests":0,${zero([
      'saved_usd',
      'cost_usd',
      'flat_price_usd',
      'billed_usd',
      'auto_saved_usd',
      'routed_model_cost_usd',
      'margin_usd',
    ])}}}`;
    mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/usage': () => ({ raw }),
    });
    await renderApp('/usage');
    const card = await screen.findByRole('region', {
      name: 'Automatic routing billing and margin',
    });
    expect(within(card).getAllByText('$0.00')).toHaveLength(5);
    expect(document.body).not.toHaveTextContent('-$');
    expect(screen.getByText(/shown ·/)).toHaveTextContent('tokens saved ($0.00) · $0.00');
  });

  it('shows zeros when there was no caliban/auto traffic', async () => {
    mockUsage({ events: [], totals: { requests: 0 } });
    await renderApp('/usage');
    const card = await screen.findByRole('region', {
      name: 'Automatic routing billing and margin',
    });
    expect(card).toHaveTextContent('0 requests used automatic routing');
    expect(within(card).getAllByText('$0.00')).toHaveLength(5);
    expect(screen.getByText('No usage yet')).toBeInTheDocument();
  });

  describe('by node', () => {
    const nodeEvent: UsageEvent = {
      ...base,
      request_id: 'req-node',
      model: 'local/qwen3-8b',
      requested_model: 'caliban/auto',
      cache: 'miss',
      cost_usd: 0.001,
      node: 'triage',
      node_version: 2,
      run_id: 'run_123',
    };
    const report: UsageReport = {
      events: [...events, nodeEvent],
      totals,
      by_node: [
        {
          node: 'triage',
          node_version: 1,
          totals: {
            requests: 2,
            prompt_tokens: 100,
            completion_tokens: 20,
            charged_usd: 0.01,
            cost_usd: 0.004,
          },
        },
        {
          node: 'triage',
          node_version: 2,
          totals: {
            requests: 3,
            prompt_tokens: 300,
            completion_tokens: 30,
            charged_usd: 0.02,
            cost_usd: 0.008,
          },
        },
        {
          node: 'intake',
          node_version: 1,
          totals: {
            requests: 1,
            prompt_tokens: 10,
            completion_tokens: 5,
            charged_usd: 0.5,
            cost_usd: 0.2,
          },
        },
      ],
    };

    it('shows the cost per node with its versions, most charged first', async () => {
      mockUsage(report);
      await renderApp('/usage');
      const card = await screen.findByRole('region', { name: 'Cost per assistant' });
      const rows = within(within(card).getByRole('table')).getAllByRole('row').slice(1);
      expect(rows.map((r) => r.querySelector('td')?.textContent)).toEqual(['intake', 'triage']);
      const triage = rows[1]!;
      expect(triage).toHaveTextContent('v1 $0.01 · v2 $0.02');
      const cells = within(triage).getAllByRole('cell');
      expect(cells[2]).toHaveTextContent('5');
      expect(cells[3]).toHaveTextContent('450');
      expect(cells[6]).toHaveTextContent('$0.03');
    });

    it('shows the node and version of node calls in the events', async () => {
      mockUsage(report);
      await renderApp('/usage');
      await screen.findByRole('table', { name: 'Usage events' });
      const node = row('req-node');
      expect(within(node).getByText('triage')).toBeInTheDocument();
      expect(node).toHaveTextContent('triage v2');
      expect(within(node).getByTitle('Run run_123')).toBeInTheDocument();
      expect(row('req-auto-miss').querySelector('td:nth-child(4)')).toHaveTextContent('n/a');
    });

    it('filters by node from the cost table or the node filter, through the API', async () => {
      const calls = mockUsage(report);
      const user = userEvent.setup();
      const { router } = await renderApp('/usage');
      const card = await screen.findByRole('region', { name: 'Cost per assistant' });

      await user.click(within(card).getByRole('button', { name: 'triage' }));
      await waitFor(() => expect(router.state.location.search).toMatchObject({ node: 'triage' }));
      await waitFor(() => expect(calls.at(-1)?.query.get('node')).toBe('triage'));
      expect(screen.getByRole('combobox', { name: 'Assistant' })).toHaveValue('triage');

      await user.selectOptions(screen.getByRole('combobox', { name: 'Assistant' }), '');
      await waitFor(() => expect(router.state.location.search).not.toHaveProperty('node'));
    });

    it('filters by run id', async () => {
      const calls = mockUsage(report);
      const user = userEvent.setup();
      const { router } = await renderApp('/usage');
      await screen.findByRole('table', { name: 'Usage events' });
      const filter = screen.getByRole('form', { name: 'Conversation filter' });
      await user.type(within(filter).getByLabelText('Conversation'), 'run_123');
      await user.click(within(filter).getByRole('button', { name: 'Apply' }));
      await waitFor(() => expect(router.state.location.search).toMatchObject({ run: 'run_123' }));
      await waitFor(() => expect(calls.at(-1)?.query.get('run_id')).toBe('run_123'));
      await user.click(within(filter).getByRole('button', { name: 'Clear' }));
      await waitFor(() => expect(router.state.location.search).not.toHaveProperty('run'));
    });

    it('says when there are no node calls', async () => {
      mockUsage();
      await renderApp('/usage');
      const card = await screen.findByRole('region', { name: 'Cost per assistant' });
      expect(within(card).getByText('No assistant calls yet')).toBeInTheDocument();
    });
  });
});
