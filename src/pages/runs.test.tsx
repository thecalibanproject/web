import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ConsoleRun, NodeRunSummary, Tenant } from '@/api/types';
import { meWith, ssoRoutes, type Grant } from '@/test/auth';
import { mockApi, renderApp, type RecordedCall } from '@/test/utils';

const tenants: Tenant[] = [{ id: 't1', name: 'Acme', created_at: '2026-10-01T10:00:00Z' }];

const summary = (over: Partial<NodeRunSummary>): NodeRunSummary => ({
  id: 'run_1',
  object: 'node.run',
  node: 'triage',
  version: 2,
  status: 'succeeded',
  cost_usd: 0.0042,
  invoker: 'api_key:ab12cd',
  created_at: '2026-10-11T10:00:00Z',
  finished_at: '2026-10-11T10:00:03Z',
  ...over,
});

const page1: NodeRunSummary[] = [
  summary({
    id: 'run_3',
    status: 'input_required',
    awaiting_step: 'write#0@approve',
    finished_at: null,
  }),
  summary({ id: 'run_2', version: 1, status: 'failed' }),
];
const page2: NodeRunSummary[] = [summary({ id: 'run_1' })];

const run: ConsoleRun = {
  id: 'run_7',
  object: 'node.run',
  node: 'triage',
  version: 2,
  hash: 'sha256:2222222222222222bbbb',
  status: 'succeeded',
  invoker: 'api_key:ab12cd',
  origin: null,
  error: null,
  stop_reason: null,
  partial: false,
  awaiting: null,
  cancel_requested: false,
  budget: { steps_used: 3, steps_limit: 8, tokens_used: 900, tokens_limit: 2000, usd: 0.0042 },
  cost_usd: 0.0042,
  usage: { prompt_tokens: 700, completion_tokens: 200, total_tokens: 900 },
  claims: 1,
  created_at: '2026-10-11T10:00:00Z',
  started_at: '2026-10-11T10:00:00Z',
  finished_at: '2026-10-11T10:00:03Z',
  content_visible: false,
  steps: [
    {
      id: 'fetch#0',
      vertex: 'fetch',
      kind: 'tool',
      status: 'completed',
      tokens: 0,
      usd: 0,
      labels: ['tool:mail/read_inbox'],
      started_at: '2026-10-11T10:00:00.000Z',
      duration_ms: 400,
    },
    {
      id: 'classify#0',
      vertex: 'classify',
      kind: 'llm',
      status: 'completed',
      tokens: 900,
      prompt_tokens: 700,
      completion_tokens: 200,
      usd: 0.0042,
      labels: ['tool:mail/read_inbox', 'pii'],
      started_at: '2026-10-11T10:00:00.500Z',
      duration_ms: 2500,
    },
  ],
};

const withContent: ConsoleRun = {
  ...run,
  content_visible: true,
  input: { case: 'Chest pain since Tuesday' },
  output: { urgency: 'high' },
  steps: run.steps.map((s) => ({
    ...s,
    output: s.vertex === 'classify' ? { label: 'clinical' } : 'mail',
  })),
};

const R = '/api/v1/tenants/t1/runs';

function mockRuns(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/v1/tenants': () => ({ body: tenants }),
    'GET /api/v1/nodes': () => ({ body: [] }),
    [`GET ${R}`]: (c) =>
      c.query.get('cursor') === 'c2'
        ? { body: { object: 'list', data: page2, next_cursor: null } }
        : { body: { object: 'list', data: page1, next_cursor: 'c2' } },
    ...extra,
  });
}

const listCalls = (calls: RecordedCall[]) => calls.filter((c) => c.path === R);

async function openDetail(
  roles: Grant[] | null,
  body: ConsoleRun,
  extra: Parameters<typeof mockApi>[0] = {},
) {
  const calls = mockRuns({
    [`GET ${R}/run_7`]: () => ({ body }),
    ...extra,
    ...(roles ? ssoRoutes(meWith(roles)) : {}),
  });
  await renderApp('/runs/t1/run_7', { token: roles ? null : 'test-admin-token' });
  await screen.findByRole('table', { name: 'Steps' });
  return calls;
}

describe('RunsPage', () => {
  it('lists runs newest first with status, node version, invoker and cost', async () => {
    mockRuns();
    await renderApp('/runs');
    const table = await screen.findByRole('table', { name: 'Runs' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('run_3');
    expect(rows[1]).toHaveTextContent('Waiting for a human');
    expect(rows[1]).toHaveTextContent('write#0@approve');
    expect(rows[1]).toHaveTextContent('not ended');
    expect(rows[2]).toHaveTextContent('run_2');
    expect(rows[2]).toHaveTextContent('v1');
    expect(rows[2]).toHaveTextContent('Failed');
    expect(rows[2]).toHaveTextContent('api_key:ab12cd');
    expect(rows[2]).toHaveTextContent('$0.0042');
    expect(rows[2]).toHaveTextContent('3.00 s');
    expect(within(rows[1]!).getByRole('link', { name: 'run_3' })).toHaveAttribute(
      'href',
      '/runs/t1/run_3',
    );
  });

  it('sends the node, status and time range filters to the API', async () => {
    const user = userEvent.setup();
    const calls = mockRuns();
    await renderApp('/runs?tenant=t1&node=triage');
    await screen.findByRole('table', { name: 'Runs' });
    expect(listCalls(calls).at(-1)!.query.get('node')).toBe('triage');

    await user.selectOptions(screen.getByLabelText('Status'), 'Not ended');
    await waitFor(() =>
      expect(listCalls(calls).at(-1)!.query.get('status')).toBe(
        'pending,running,sleeping,input_required',
      ),
    );
    await user.selectOptions(screen.getByLabelText('Started'), 'Last 7 days');
    await waitFor(() => expect(listCalls(calls).at(-1)!.query.get('created_after')).toBeTruthy());
    const after = Date.parse(listCalls(calls).at(-1)!.query.get('created_after')!);
    expect(Date.now() - after).toBeGreaterThanOrEqual(7 * 86_400_000 - 60_000);
  });

  it('loads older pages with the cursor, and filters by version through the API', async () => {
    const user = userEvent.setup();
    const calls = mockRuns();
    await renderApp('/runs?tenant=t1');
    const table = await screen.findByRole('table', { name: 'Runs' });

    await user.click(screen.getByRole('button', { name: 'Load older runs' }));
    await within(table).findByText('run_1');
    expect(listCalls(calls).at(-1)!.query.get('cursor')).toBe('c2');
    expect(screen.queryByRole('button', { name: 'Load older runs' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Version'), '1');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(listCalls(calls).at(-1)!.query.get('version')).toBe('1'));
    expect(listCalls(calls).at(-1)!.query.has('cursor')).toBe(false);
  });

  it('is in the menu for roles with runs.read only', async () => {
    mockRuns(ssoRoutes(meWith([{ role: 'billing', tenant_id: 't1' }])));
    await renderApp('/', { token: null });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    await within(nav).findByRole('link', { name: 'Settings' });
    expect(within(nav).queryByRole('link', { name: 'Runs' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Inbox' })).not.toBeInTheDocument();
  });
});

describe('RunDetailPage', () => {
  it('shows the step timeline: vertex, kind, timings, tokens, cost and taint labels', async () => {
    await openDetail(null, run);
    expect(screen.getByRole('heading', { name: 'run_7' })).toBeInTheDocument();
    const steps = within(screen.getByRole('table', { name: 'Steps' })).getAllByRole('row');
    expect(steps[1]).toHaveTextContent('fetch#0');
    expect(steps[1]).toHaveTextContent('tool');
    expect(steps[1]).toHaveTextContent('400 ms');
    expect(steps[1]).toHaveTextContent('tool:mail/read_inbox');
    expect(steps[2]).toHaveTextContent('classify#0');
    expect(steps[2]).toHaveTextContent('+500 ms');
    expect(steps[2]).toHaveTextContent('2.50 s');
    expect(steps[2]).toHaveTextContent('900');
    expect(steps[2]).toHaveTextContent('$0.0042');
    expect(within(steps[2]!).getByText('pii')).toHaveAttribute('title', 'Holds personal data.');

    const budget = screen.getByRole('table', { name: 'Budget' });
    expect(within(budget).getByText('Steps').closest('tr')).toHaveTextContent(/^Steps38$/);
    expect(screen.getByText('900 (700 prompt, 200 completion)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Model calls in Usage' })).toHaveAttribute(
      'href',
      '/usage?tenant=t1&run=run_7',
    );
  });

  it('shows the real model cost next to what is billed, and the personal data protected', async () => {
    // A run caliban/auto started: billed at the flat auto price, routed to a cheaper model.
    const auto: ConsoleRun = {
      ...run,
      origin: 'auto',
      cost_usd: 0.01,
      // The run's own figure, not a sum over its steps.
      model_cost_usd: 0.0045,
      usage: { prompt_tokens: 700, completion_tokens: 200, total_tokens: 900, pii_entities: 3 },
      steps: run.steps.map((s) =>
        s.kind === 'llm'
          ? { ...s, usd: 0.01, model_cost_usd: 0.0042, pii_entities: 3 }
          : { ...s, model_cost_usd: 0 },
      ),
    };
    await openDetail(null, auto);
    const details = screen.getByText('Billed').closest('dl')!;
    expect(within(details).getByText('Billed').nextSibling).toHaveTextContent('$0.01');
    expect(within(details).getByText('Model cost').nextSibling).toHaveTextContent('$0.0045');
    expect(within(details).getByText('Personal data').nextSibling).toHaveTextContent(
      '3 entities protected in its model calls',
    );
    const steps = within(screen.getByRole('table', { name: 'Steps' })).getAllByRole('row');
    expect(steps[2]).toHaveTextContent('$0.01model $0.0042');
    expect(steps[1]).not.toHaveTextContent('model');
    expect(screen.queryByText('Answer guard')).not.toBeInTheDocument();
  });

  it('shows what the answer guard found, by rule and place, never the text', async () => {
    await openDetail(null, {
      ...run,
      model_cost_usd: 0.0042,
      answer_check: {
        labels: ['datasource', 'tool:catalogue/search'],
        findings: [
          { rule: 'untrusted_contact', label: 'datasource', at: '/recommendation' },
          { rule: 'instruction_echo', label: 'tool:catalogue/search', at: '' },
        ],
        action: 'redacted',
      },
    });
    const guard = screen
      .getByText('Answer guard')
      .closest('section, div.rounded-lg') as HTMLElement;
    expect(guard).toHaveTextContent('redacted');
    expect(guard).toHaveTextContent(/were removed from the answer/);
    const rows = within(screen.getByRole('table', { name: 'Answer guard findings' })).getAllByRole(
      'row',
    );
    expect(rows[1]).toHaveTextContent('Contact from untrusted text');
    expect(rows[1]).toHaveTextContent('/recommendation');
    expect(rows[2]).toHaveTextContent('Echo of an injected instruction');
    expect(rows[2]).toHaveTextContent('tool:catalogue/search');
  });

  it('shows the answer guard to roles without runs.data, as metadata only', async () => {
    await openDetail([{ role: 'viewer', tenant_id: 't1' }], {
      ...run,
      content_visible: false,
      answer_check: {
        labels: ['datasource'],
        findings: [{ rule: 'untrusted_link', label: 'datasource', at: '/answer' }],
        action: 'refused',
      },
    });
    const rows = within(screen.getByRole('table', { name: 'Answer guard findings' })).getAllByRole(
      'row',
    );
    expect(rows[1]).toHaveTextContent('Link from untrusted text');
    expect(rows[1]).toHaveTextContent('/answer');
    expect(screen.getByText(/Run content .* is hidden/)).toBeInTheDocument();
  });

  it('hides run content from roles without runs.data', async () => {
    await openDetail([{ role: 'viewer', tenant_id: 't1' }], run);
    expect(screen.getByText(/Run content .* is hidden/)).toHaveTextContent('needs runs.data');
    expect(screen.queryByLabelText('Run input')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /output of/ })).not.toBeInTheDocument();
  });

  it('shows the input, the output and each step output with runs.data', async () => {
    const user = userEvent.setup();
    await openDetail([{ role: 'developer', tenant_id: 't1' }], withContent);
    expect(screen.getByLabelText('Run input')).toHaveTextContent('Chest pain since Tuesday');
    expect(screen.getByLabelText('Run output')).toHaveTextContent('"urgency": "high"');
    expect(screen.queryByText(/Run content .* is hidden/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show output of classify#0' }));
    expect(screen.getByLabelText('Output of classify#0')).toHaveTextContent('"label": "clinical"');
    await user.click(screen.getByRole('button', { name: 'Hide output of classify#0' }));
    expect(screen.queryByLabelText('Output of classify#0')).not.toBeInTheDocument();
  });

  it('shows a waiting call with its structured approval, offered only with runs.answer', async () => {
    const waiting: ConsoleRun = {
      ...run,
      status: 'input_required',
      finished_at: null,
      awaiting: { step: 'write#0@approve', kind: 'approval', question: null },
    };
    await openDetail([{ role: 'viewer', tenant_id: 't1' }], waiting, {
      'GET /api/v1/tenants/t1/inbox': () => ({
        body: {
          object: 'list',
          content_visible: false,
          data: [
            {
              run_id: 'run_7',
              node: 'triage',
              version: 2,
              step: 'write#0@approve',
              kind: 'approval',
              question: null,
              waiting_since: '2026-10-11T10:00:01Z',
              approval: {
                tool: 'mcp://crm/update_ticket#sha256:abc',
                effect: 'write',
                labels: ['caller'],
              },
            },
          ],
        },
      }),
    });
    expect(screen.getByText('Waiting for approval of a tainted call')).toBeInTheDocument();
    expect(await screen.findByText('mcp://crm/update_ticket#sha256:abc')).toBeInTheDocument();
    expect(screen.getByText('(effect: write)')).toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Approve the call of run run_7' });
    expect(approve).toHaveAttribute('aria-disabled', 'true');
    expect(approve).toHaveAccessibleDescription(/needs runs\.answer/);
    expect(screen.getByRole('button', { name: 'Cancel run' })).toHaveAccessibleDescription(
      /needs runs\.answer/,
    );
  });

  it('cancels a run that has not ended, as the signed-in user', async () => {
    const user = userEvent.setup();
    let current: ConsoleRun = { ...run, status: 'running', finished_at: null };
    const calls = await openDetail([{ role: 'tenant_admin', tenant_id: 't1' }], current, {
      [`GET ${R}/run_7`]: () => ({ body: current }),
      [`POST ${R}/run_7/cancel`]: () => {
        current = { ...current, cancel_requested: true };
        return { status: 202, body: current };
      },
    });
    await user.click(screen.getByRole('button', { name: 'Cancel run' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancel run run_7?' });
    expect(dialog).toHaveTextContent('stops at its next step');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel run' }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.path === `${R}/run_7/cancel`)).toBe(true),
    );
    expect(
      await screen.findByText('Requested: the run stops at its next step'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel run' })).not.toBeInTheDocument();
  });

  it('shows the taint labels the run input carries', async () => {
    await openDetail(null, { ...run, input_labels: ['caller'] });
    expect(screen.getByText('caller')).toHaveAttribute(
      'title',
      'Untrusted data the caller passed in the run input.',
    );
  });

  it('says when the run does not exist', async () => {
    mockRuns();
    await renderApp('/runs/t1/run_404');
    expect(await screen.findByText('Run not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to runs' })).toBeInTheDocument();
  });
});
