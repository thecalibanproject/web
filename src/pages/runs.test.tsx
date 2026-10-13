import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ConsoleRun, NodeRunSummary, Tenant } from '@/api/types';
import { expectNoAxeViolations } from '@/test/a11y';
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
    const table = await screen.findByRole('table', { name: 'Conversations' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('run_3');
    expect(rows[1]).toHaveTextContent('Waiting for a person');
    expect(rows[1]).toHaveTextContent('at the write step');
    expect(rows[1]).not.toHaveTextContent('write#0@approve');
    expect(rows[1]).toHaveTextContent('not ended');
    expect(rows[2]).toHaveTextContent('run_2');
    expect(rows[2]).toHaveTextContent('v1');
    expect(rows[2]).toHaveTextContent('Failed');
    expect(rows[2]).toHaveTextContent('An app key (ab12cd)');
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
    await screen.findByRole('table', { name: 'Conversations' });
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
    const table = await screen.findByRole('table', { name: 'Conversations' });

    await user.click(screen.getByRole('button', { name: 'Load older conversations' }));
    await within(table).findByText('run_1');
    expect(listCalls(calls).at(-1)!.query.get('cursor')).toBe('c2');
    expect(
      screen.queryByRole('button', { name: 'Load older conversations' }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Version'), '1');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(listCalls(calls).at(-1)!.query.get('version')).toBe('1'));
    expect(listCalls(calls).at(-1)!.query.has('cursor')).toBe(false);
  });

  it('is in the menu for roles with runs.read only', async () => {
    mockRuns(ssoRoutes(meWith([{ role: 'billing', tenant_id: 't1' }])));
    await renderApp('/', { token: null });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    await within(nav).findByRole('link', { name: 'Home' });
    expect(within(nav).queryByRole('link', { name: 'Conversations' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Approvals' })).not.toBeInTheDocument();
  });
});

describe('RunDetailPage', () => {
  it('shows the step timeline: vertex, kind, timings, tokens, cost and taint labels', async () => {
    await openDetail(null, run);
    expect(screen.getByRole('heading', { name: 'Conversation with triage' })).toBeInTheDocument();
    const steps = within(screen.getByRole('table', { name: 'Steps' })).getAllByRole('row');
    expect(steps[1]).toHaveTextContent('fetch#0');
    expect(steps[1]).toHaveTextContent('Tool or lookup');
    expect(steps[1]).toHaveTextContent('400 ms');
    expect(steps[1]).toHaveTextContent('Result of mail/read_inbox');
    expect(steps[2]).toHaveTextContent('classify#0');
    expect(steps[2]).toHaveTextContent('+500 ms');
    expect(steps[2]).toHaveTextContent('2.50 s');
    expect(steps[2]).toHaveTextContent('900');
    expect(steps[2]).toHaveTextContent('$0.0042');
    expect(within(steps[2]!).getByText('Personal data')).toHaveAttribute(
      'title',
      'Holds personal data.',
    );

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
    expect(screen.queryByText('Answer check')).not.toBeInTheDocument();
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
      .getByText('Answer check')
      .closest('section, div.rounded-lg') as HTMLElement;
    expect(guard).toHaveTextContent('Parts removed');
    expect(guard).toHaveTextContent(/were removed from the answer/);
    const rows = within(screen.getByRole('table', { name: 'Answer check findings' })).getAllByRole(
      'row',
    );
    expect(rows[1]).toHaveTextContent('Contact from untrusted text');
    expect(rows[1]).toHaveTextContent('/recommendation');
    expect(rows[2]).toHaveTextContent('Echo of an injected instruction');
    expect(rows[2]).toHaveTextContent('Result of catalogue/search');
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
    const rows = within(screen.getByRole('table', { name: 'Answer check findings' })).getAllByRole(
      'row',
    );
    expect(rows[1]).toHaveTextContent('Link from untrusted text');
    expect(rows[1]).toHaveTextContent('/answer');
    expect(screen.getByText(/The content of this conversation .* is hidden/)).toBeInTheDocument();
  });

  it('hides run content from roles without runs.data', async () => {
    await openDetail([{ role: 'viewer', tenant_id: 't1' }], run);
    expect(screen.getByText(/The content of this conversation .* is hidden/)).toHaveTextContent(
      'needs runs.data',
    );
    expect(screen.queryByLabelText('Run input')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /output of/ })).not.toBeInTheDocument();
  });

  it('shows the input, the output and each step output with runs.data', async () => {
    const user = userEvent.setup();
    await openDetail([{ role: 'developer', tenant_id: 't1' }], withContent);
    // The conversation first, as text in its own direction; JSON on demand.
    expect(screen.getByText('Chest pain since Tuesday')).toHaveAttribute('dir', 'auto');
    expect(screen.getByText('high')).toHaveAttribute('dir', 'auto');
    await user.click(screen.getByRole('button', { name: 'Show as JSON' }));
    expect(screen.getByLabelText('Run input')).toHaveTextContent('Chest pain since Tuesday');
    expect(screen.getByLabelText('Run output')).toHaveTextContent('"urgency": "high"');
    expect(
      screen.queryByText(/The content of this conversation .* is hidden/),
    ).not.toBeInTheDocument();

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
    expect(screen.getByText('Waiting for your approval')).toBeInTheDocument();
    expect(screen.getByText(/At the write step\. Your decision is recorded/)).toBeInTheDocument();
    // The pinned reference and the step id sit under Technical details, not in the basic copy.
    const ref = await screen.findByText('mcp://crm/update_ticket#sha256:abc');
    const technical = ref.closest('details');
    expect(technical).toHaveTextContent('Technical details');
    expect(technical).toHaveTextContent('write#0@approve');
    expect(screen.getByText(/It changes something in another system/)).toBeInTheDocument();
    const approve = screen.getByRole('button', {
      name: 'Approve update_ticket on crm for conversation run_7',
    });
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
    expect(screen.getByText("Customer's message")).toHaveAttribute(
      'title',
      "From the customer's message: untrusted data.",
    );
  });

  it('says when the run does not exist', async () => {
    mockRuns();
    await renderApp('/runs/t1/run_404');
    expect(await screen.findByText('Conversation not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to conversations' })).toBeInTheDocument();
  });
});

describe('Conversations: test runs', () => {
  const withTests = [
    summary({ id: 'run_real' }),
    summary({ id: 'run_new_trial', origin: 'eval:eval_01:fr-research' }),
    summary({ id: 'run_old_trial', origin: 'eval:eval_00' }),
  ];

  it('hides test runs by default, in both origin forms, and shows them on demand', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/nodes': () => ({ body: [] }),
      [`GET ${R}`]: () => ({ body: { object: 'list', data: withTests, next_cursor: null } }),
    });
    await renderApp('/runs');
    const table = await screen.findByRole('table', { name: 'Conversations' });
    expect(within(table).getByText('run_real')).toBeInTheDocument();
    expect(within(table).queryByText('run_new_trial')).not.toBeInTheDocument();
    expect(within(table).queryByText('run_old_trial')).not.toBeInTheDocument();
    expect(screen.getByText('2 test runs hidden on this page.')).toBeInTheDocument();
    await expectNoAxeViolations();

    await user.click(screen.getByLabelText('Hide test runs'));
    const row = within(table).getByText('run_new_trial').closest('tr')!;
    expect(row).toHaveTextContent('Test run');
    expect(row).toHaveTextContent('A test run');
    expect(within(table).getByText('run_old_trial')).toBeInTheDocument();
  });
});

describe('Save as test', () => {
  const C = `${R}/run_7/golden-case`;
  const captured = {
    object: 'node.golden_case',
    run_id: 'run_7',
    node: 'triage',
    version: 2,
    run_version: 2,
    case_id: 'run_7',
    verdict: 'good',
    checks: ['llm_judge'],
    golden_set: {
      object: 'node.golden_set',
      node: 'triage',
      version: 2,
      hash: 'h',
      case_count: 4,
      updated_at: '2026-10-13T10:00:00Z',
      updated_by: 'ada',
      content_visible: true,
    },
    content_visible: true,
  };

  it('saves a right answer as a test case, and links to the tests', async () => {
    const user = userEvent.setup();
    const calls = await openDetail([{ role: 'tenant_admin', tenant_id: 't1' }], withContent, {
      [`POST ${C}`]: () => ({ status: 201, body: captured }),
    });
    await expectNoAxeViolations();
    await user.click(screen.getByRole('button', { name: 'Save as test' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save this conversation as a test' });
    const save = within(dialog).getByRole('button', { name: 'Save test case' });
    expect(save).toBeEnabled();
    await user.click(save);
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Choose whether the answer was right or wrong.',
    );
    expect(calls.some((c) => c.method === 'POST' && c.path === C)).toBe(false);
    await user.click(within(dialog).getByLabelText('This answer was right'));
    await user.click(save);
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST' && c.path === C)?.body).toEqual({
        verdict: 'good',
        version: 2,
      }),
    );
    expect(await screen.findByText(/Saved as a test case of version 2/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the tests of triage' })).toHaveAttribute(
      'href',
      '/nodes/t1/triage?tab=evals&ev=2',
    );
  });

  it('saves a wrong answer only with what it should have done, and an optional reason', async () => {
    const user = userEvent.setup();
    const calls = await openDetail([{ role: 'tenant_admin', tenant_id: 't1' }], withContent, {
      [`POST ${C}`]: () => ({ status: 201, body: { ...captured, verdict: 'bad' } }),
    });
    await user.click(screen.getByRole('button', { name: 'Save as test' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save this conversation as a test' });
    await user.click(within(dialog).getByLabelText('This answer was wrong'));
    const save = within(dialog).getByRole('button', { name: 'Save test case' });
    await user.click(save);
    expect(within(dialog).getByLabelText(/What should it have done/)).toHaveAccessibleDescription(
      /Say what it should have done/,
    );
    expect(calls.some((c) => c.method === 'POST' && c.path === C)).toBe(false);
    await user.type(
      within(dialog).getByLabelText(/What should it have done/),
      'Send to cardiology',
    );
    await user.selectOptions(
      within(dialog).getByLabelText('What went wrong (optional)'),
      'Should have asked a question first',
    );
    await user.click(save);
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST' && c.path === C)?.body).toEqual({
        verdict: 'bad',
        note: 'Send to cardiology',
        mast_label: 'fail_to_ask_for_clarification',
        version: 2,
      }),
    );
  });

  it('says in plain words why a save was refused', async () => {
    const user = userEvent.setup();
    await openDetail([{ role: 'tenant_admin', tenant_id: 't1' }], withContent, {
      [`POST ${C}`]: () => ({
        status: 409,
        body: { error: { message: 'the run is already in that golden set', type: 'conflict' } },
      }),
    });
    await user.click(screen.getByRole('button', { name: 'Save as test' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save this conversation as a test' });
    await user.click(within(dialog).getByLabelText('This answer was right'));
    await user.click(within(dialog).getByRole('button', { name: 'Save test case' }));
    expect(
      await within(dialog).findByText(
        'This conversation is already saved as a test case of that version.',
      ),
    ).toBeInTheDocument();
  });

  it('offers only "wrong" for a conversation that did not succeed, and needs nodes.write', async () => {
    const user = userEvent.setup();
    await openDetail([{ role: 'tenant_admin', tenant_id: 't1' }], {
      ...withContent,
      status: 'failed',
    });
    await user.click(screen.getByRole('button', { name: 'Save as test' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save this conversation as a test' });
    expect(within(dialog).getByLabelText('This answer was right')).toBeDisabled();
    expect(within(dialog).getByLabelText('This answer was wrong')).toBeChecked();
  });

  it('is offered only to roles that may change test cases', async () => {
    await openDetail([{ role: 'viewer', tenant_id: 't1' }], run);
    expect(screen.getByRole('button', { name: 'Save as test' })).toHaveAccessibleDescription(
      /needs nodes\.write/,
    );
  });
});
