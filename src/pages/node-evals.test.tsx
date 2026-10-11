import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ApiKeyInfo, Eval, GoldenSet, Node, NodeVersions, Tenant } from '@/api/types';
import { meWith, ssoRoutes, type Grant } from '@/test/auth';
import { mockApi, renderApp, type RecordedCall } from '@/test/utils';

const tenants: Tenant[] = [{ id: 't1', name: 'Acme', created_at: '2026-10-01T10:00:00Z' }];
const v1: Node = {
  id: 'n1',
  tenant_id: 't1',
  name: 'triage',
  version: 1,
  spec: { kind: 'agent' },
  hash: 'sha256:1111111111111111aaaa',
  state: 'published',
  live: true,
  created_at: '2026-10-02T10:00:00Z',
  published_at: '2026-10-02T11:00:00Z',
};
const v2: Node = { ...v1, id: 'n2', version: 2, hash: 'sha256:2222222222222222bbbb', live: false };
const v3: Node = { ...v1, id: 'n3', version: 3, state: 'draft', live: false, published_at: null };

const golden: GoldenSet = {
  object: 'node.golden_set',
  node: 'triage',
  version: 2,
  hash: 'sha256:9999999999999999cccc',
  case_count: 2,
  updated_at: '2026-10-10T10:00:00Z',
  updated_by: 'ada@example.internal',
  content_visible: true,
  cases: [
    {
      id: 'chest',
      input: { case: 'Chest pain since Tuesday' },
      answers: { clarify: 'two days' },
      checks: [{ type: 'llm_judge', rubric: 'Fits the case?' }],
    },
    { id: 'refund', input: { case: 'Refund my invoice' }, expected: 'billing', tags: ['billing'] },
  ],
};

const goldenEval: Eval = {
  id: 'ev_g1',
  object: 'node.eval',
  node: 'triage',
  version: 2,
  hash: v2.hash,
  suite: 'golden',
  k: 3,
  case_count: 2,
  status: 'succeeded',
  created_by: 'ada@example.internal',
  api_key_id: 'key_1',
  created_at: '2026-10-10T11:00:00Z',
  finished_at: '2026-10-10T11:02:00Z',
  summary: {
    suite: 'golden',
    k: 3,
    cases: 2,
    trials: 6,
    passed_trials: 5,
    errors: 0,
    pass_hat_k: 0.5,
    pass_at_1: 0.8333,
    pass_at_k: 1,
    cost_usd: 0.03,
    cost_per_success_usd: 0.006,
    judge_cost_usd: 0.001,
    tokens: 4200,
    latency_ms: { p50: 1200, p95: 2400 },
    by_case: [
      { case: 'chest', trials: 3, passed: 2, all_passed: false },
      { case: 'refund', trials: 3, passed: 3, all_passed: true },
    ],
  },
};

const injectionEval: Eval = {
  ...goldenEval,
  id: 'ev_i1',
  suite: 'injection',
  k: 1,
  case_count: 3,
  created_at: '2026-10-10T12:00:00Z',
  summary: {
    suite: 'injection',
    suite_version: 1,
    trials: 3,
    blocked: 2,
    pass_rate: 0.6667,
    attack_success_rate: 0.3333,
    attacks_succeeded: 1,
    attacked: 3,
    utility_under_attack: 0.5,
    by_category: {
      tainted_write: { trials: 2, blocked: 2, pass_rate: 1 },
      replay: { trials: 1, blocked: 0, pass_rate: 0 },
    },
    errors: 0,
    not_applicable: [{ case: 'write.staged', reason: 'the node is not an agent' }],
    cost_usd: 0.01,
    latency_ms: { p50: 900, p95: 1500 },
    cases: [],
  },
};

const goldenDetail: Eval = {
  ...goldenEval,
  content_visible: true,
  trials: [
    {
      case: 'chest',
      trial: 0,
      run_id: 'run_t0',
      status: 'failed',
      cost_usd: 0.005,
      latency_ms: 1300,
      tokens: 700,
      verdict: {
        run_status: 'succeeded',
        checks: [{ type: 'llm_judge', passed: false, score: 0.3 }],
      },
      detail: { output: 'billing', checks: [] },
    },
  ],
};

const keys: ApiKeyInfo[] = [
  { id: 'key_1', name: 'evals', prefix: 'cal_ab12', created_at: '2026-10-01T10:00:00Z' },
  {
    id: 'key_2',
    name: 'other-node-only',
    prefix: 'cal_cd34',
    created_at: '2026-10-01T10:00:00Z',
    nodes: ['other'],
  },
];

const P = '/api/v1/tenants/t1/nodes/triage';
const GATE_PROBLEMS = [
  {
    kind: 'eval_gate',
    message: 'pass^k 0.5 in its latest golden eval (ev_g1) is below the bar 0.9',
  },
  { kind: 'eval_gate', message: 'it has write tools and no injection eval met the bar' },
];

function mockEvals(roles: Grant[] | null, extra: Parameters<typeof mockApi>[0] = {}) {
  let policy: Record<string, unknown> = { golden: { min_pass_k: 0.9, min_k: 3 } };
  const versions: NodeVersions = {
    name: 'triage',
    live: 1,
    promotion: { version: 1, promoted_at: '2026-10-03T09:00:00Z', promoted_by: 'ada' },
    versions: [v1, v2, v3],
  };
  return mockApi({
    'GET /api/v1/tenants': () => ({ body: tenants }),
    [`GET ${P}/versions`]: () => ({ body: versions }),
    [`GET ${P}/eval-policy`]: () => ({
      body: {
        object: 'node.eval_policy',
        node: 'triage',
        policy,
        injection_bar: 1,
        updated_at: '2026-10-09T10:00:00Z',
        updated_by: 'ada',
      },
    }),
    [`PUT ${P}/eval-policy`]: (c) => {
      policy = c.body as Record<string, unknown>;
      return { body: {} };
    },
    [`GET ${P}/versions/2/gate`]: () => ({
      body: {
        node: 'triage',
        version: 2,
        has_write_tools: true,
        allowed: false,
        evidence: null,
        problems: GATE_PROBLEMS,
      },
    }),
    [`GET ${P}/versions/1/gate`]: () => ({
      body: {
        node: 'triage',
        version: 1,
        has_write_tools: false,
        allowed: true,
        evidence: { golden: { eval: 'ev_g0', k: 3, pass_hat_k: 1 } },
        problems: [],
      },
    }),
    [`GET ${P}/versions/2/golden-set`]: () => ({
      body: roles?.some((r) => r.role === 'viewer')
        ? { ...golden, content_visible: false, cases: undefined }
        : golden,
    }),
    [`PUT ${P}/versions/2/golden-set`]: (c) => ({
      body: { ...golden, cases: (c.body as { cases: unknown[] }).cases, case_count: 1 },
    }),
    'GET /api/v1/tenants/t1/evals': () => ({
      body: { object: 'list', data: [injectionEval, goldenEval], next_cursor: null },
    }),
    'GET /api/v1/tenants/t1/evals/ev_g1': () => ({ body: goldenDetail }),
    'GET /api/v1/tenants/t1/evals/ev_i1': () => ({ body: { ...injectionEval, trials: [] } }),
    'GET /api/v1/tenants/t1/api-keys': () => ({ body: keys }),
    [`POST ${P}/versions/2/evals`]: () => ({
      status: 202,
      body: { ...goldenEval, id: 'ev_new', status: 'pending', summary: null },
    }),
    'GET /api/v1/tenants/t1/evals/ev_new': () => ({
      body: { ...goldenEval, id: 'ev_new', status: 'pending', summary: null, trials: [] },
    }),
    [`POST ${P}/promote`]: () => ({
      status: 422,
      body: {
        error: {
          message: `triage@v2 cannot be promoted: ${GATE_PROBLEMS.map((p) => p.message).join('; ')}`,
          type: 'invalid_request_error',
          code: 'validation_failed',
          problems: GATE_PROBLEMS,
        },
      },
    }),
    ...(roles ? ssoRoutes(meWith(roles)) : {}),
    ...extra,
  });
}

async function openEvals(
  roles: Grant[] | null,
  path = '/nodes/t1/triage?tab=evals&ev=2',
  extra: Parameters<typeof mockApi>[0] = {},
) {
  const calls = mockEvals(roles, extra);
  const rendered = await renderApp(path, { token: roles ? null : 'test-admin-token' });
  await screen.findByRole('table', { name: 'Evals' });
  return { calls, ...rendered };
}

const lastCall = (calls: RecordedCall[], method: string, path: string) =>
  calls.filter((c) => c.method === method && c.path === path).at(-1);

describe('Node evals', () => {
  it('shows the gate, the promotion bar, the golden set and the evals of a version', async () => {
    await openEvals(null);
    expect(screen.getByRole('tab', { name: 'Evals' })).toHaveAttribute('aria-selected', 'true');

    expect(screen.getByText('Blocked by the promotion bar')).toBeInTheDocument();
    expect(screen.getByText('Write tools')).toBeInTheDocument();
    const why = screen.getByRole('list', { name: 'Why the gate refuses' });
    expect(why).toHaveTextContent('is below the bar 0.9');
    expect(why).toHaveTextContent('no injection eval met the bar');

    expect(screen.getByText('Least pass^k').nextSibling).toHaveTextContent('90%');
    expect(
      screen.getByText('Attacks blocked (versions with write tools)').nextSibling,
    ).toHaveTextContent('100% (default)');

    const cases = screen.getByRole('table', { name: 'Golden cases' });
    expect(within(cases).getByText('chest').closest('tr')).toHaveTextContent('llm_judge');
    expect(within(cases).getByText('chest').closest('tr')).toHaveTextContent('clarify');
    expect(within(cases).getByText('refund').closest('tr')).toHaveTextContent('exact');

    const evals = within(screen.getByRole('table', { name: 'Evals' })).getAllByRole('row');
    expect(evals[1]).toHaveTextContent('Injection suite');
    expect(evals[1]).toHaveTextContent('blocked 66.7% · attack success 33.3% · utility 50%');
    expect(evals[2]).toHaveTextContent('Golden set');
    expect(evals[2]).toHaveTextContent(
      'pass^k 50% · pass@1 83.3% · per success $0.0060 · p95 2.40 s',
    );
  });

  it('opens a golden eval with pass^k, pass@1, cost per success, p95, cases and trials', async () => {
    const user = userEvent.setup();
    const { router } = await openEvals(null);
    await user.click(screen.getByRole('button', { name: 'Open eval ev_g1' }));
    const drawer = await screen.findByRole('dialog', { name: 'Eval ev_g1' });
    await within(drawer).findByRole('table', { name: 'Trials' });
    expect(router.state.location.search).toMatchObject({ eval: 'ev_g1' });

    expect(within(drawer).getByText('pass^k').nextSibling).toHaveTextContent('50%');
    expect(within(drawer).getByText('pass@1').nextSibling).toHaveTextContent('83.3%');
    expect(within(drawer).getByText('Cost per success').nextSibling).toHaveTextContent('$0.0060');
    expect(within(drawer).getByText('p95 latency').nextSibling).toHaveTextContent('2.40 s');
    expect(within(drawer).getByRole('table', { name: 'Cases' })).toHaveTextContent('chest2 of 3no');

    const trial = within(within(drawer).getByRole('table', { name: 'Trials' })).getAllByRole(
      'row',
    )[1]!;
    expect(trial).toHaveTextContent('failed');
    expect(trial).toHaveTextContent('0 of 1 checks');
    expect(within(trial).getByRole('link', { name: 'run_t0' })).toHaveAttribute(
      'href',
      '/runs/t1/run_t0',
    );
    await user.click(within(trial).getByRole('button', { name: 'Show detail of chest#0' }));
    expect(within(drawer).getByLabelText('Detail of chest#0')).toHaveTextContent('"output"');
  });

  it('opens an injection eval with attacks blocked, attack success rate and utility', async () => {
    const user = userEvent.setup();
    await openEvals(null);
    await user.click(screen.getByRole('button', { name: 'Open eval ev_i1' }));
    const drawer = await screen.findByRole('dialog', { name: 'Eval ev_i1' });
    await within(drawer).findByText('Attacks blocked');
    expect(within(drawer).getByText('Attacks blocked').nextSibling).toHaveTextContent('66.7%');
    expect(within(drawer).getByText('Attack success rate').nextSibling).toHaveTextContent('33.3%');
    expect(within(drawer).getByText('Utility under attack').nextSibling).toHaveTextContent('50%');
    expect(within(drawer).getByRole('table', { name: 'Categories' })).toHaveTextContent(
      'replay0 of 10%',
    );
    expect(drawer).toHaveTextContent('write.staged: the node is not an agent');
  });

  it("shows the gate's 422 reasons when making a version live", async () => {
    const user = userEvent.setup();
    await openEvals(null);
    await user.click(screen.getByRole('button', { name: 'Make v2 live' }));
    const dialog = await screen.findByRole('dialog', { name: 'Make triage v2 live?' });
    await user.click(within(dialog).getByRole('button', { name: 'Make live' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Cannot make triage@v2 live: 2 problems');
    expect(alert).toHaveTextContent('Promotion bar not met');
    expect(alert).toHaveTextContent('it has write tools and no injection eval met the bar');
    expect(alert).toHaveTextContent("Run the version's evals");
  });

  it('starts an eval as an API key allowed to run the node, then opens it', async () => {
    const user = userEvent.setup();
    const { calls } = await openEvals(null);
    await user.click(screen.getByRole('button', { name: 'Start eval' }));
    const drawer = await screen.findByRole('dialog', { name: 'Start an eval of triage v2' });
    const key = within(drawer).getByLabelText(/API key/);
    await within(drawer).findByRole('option', { name: 'evals (cal_ab12)' });
    expect(
      within(drawer).queryByRole('option', { name: /other-node-only/ }),
    ).not.toBeInTheDocument();
    await user.selectOptions(key, 'key_1');
    await user.type(within(drawer).getByLabelText(/^k/), '5');
    await user.type(within(drawer).getByLabelText('Only these cases'), 'chest, refund');
    await user.click(within(drawer).getByRole('button', { name: 'Start eval' }));

    await waitFor(() =>
      expect(lastCall(calls, 'POST', `${P}/versions/2/evals`)?.body).toEqual({
        suite: 'golden',
        api_key_id: 'key_1',
        k: 5,
        cases: ['chest', 'refund'],
      }),
    );
    expect(await screen.findByRole('dialog', { name: 'Eval ev_new' })).toBeInTheDocument();
  });

  it('starts an injection eval on a golden case input', async () => {
    const user = userEvent.setup();
    const { calls } = await openEvals(null);
    await user.click(screen.getByRole('button', { name: 'Start eval' }));
    const drawer = await screen.findByRole('dialog', { name: 'Start an eval of triage v2' });
    await user.selectOptions(within(drawer).getByLabelText('Suite'), 'injection');
    await within(drawer).findByRole('option', { name: 'evals (cal_ab12)' });
    await user.selectOptions(within(drawer).getByLabelText(/API key/), 'key_1');
    await user.selectOptions(within(drawer).getByLabelText('Run input'), 'Golden case refund');
    await user.click(within(drawer).getByRole('button', { name: 'Start eval' }));
    await waitFor(() =>
      expect(lastCall(calls, 'POST', `${P}/versions/2/evals`)?.body).toEqual({
        suite: 'injection',
        api_key_id: 'key_1',
        input_case: 'refund',
      }),
    );
  });

  it('sets the promotion bar', async () => {
    const user = userEvent.setup();
    const { calls } = await openEvals(null);
    await user.click(screen.getByRole('button', { name: 'Edit bar' }));
    const drawer = await screen.findByRole('dialog', { name: 'Promotion bar of triage' });
    const passK = within(drawer).getByLabelText('Least pass^k');
    expect(passK).toHaveValue('90');
    await user.clear(passK);
    await user.type(passK, '95');
    await user.type(within(drawer).getByLabelText('Least share of attacks blocked'), '90');
    await user.click(within(drawer).getByRole('button', { name: 'Save bar' }));
    await waitFor(() =>
      expect(lastCall(calls, 'PUT', `${P}/eval-policy`)?.body).toEqual({
        golden: { min_pass_k: 0.95, min_k: 3 },
        injection: { min_pass_rate: 0.9 },
      }),
    );
  });

  it("edits a version's golden set and shows the control plane's refusal", async () => {
    const user = userEvent.setup();
    const { calls } = await openEvals(null, undefined, {
      [`PUT ${P}/versions/2/golden-set`]: () => ({
        status: 422,
        body: {
          error: {
            message: "golden set: case 'x': input does not match the input schema",
            type: 'invalid_request_error',
            code: 'validation_failed',
            problems: [
              { kind: 'golden_set', message: "case 'x': input does not match the input schema" },
            ],
          },
        },
      }),
    });
    await user.click(screen.getByRole('button', { name: 'Edit cases' }));
    const drawer = await screen.findByRole('dialog', { name: 'Golden set of triage v2' });
    const text = within(drawer).getByLabelText('Cases');
    expect((text as HTMLTextAreaElement).value).toContain('"chest"');

    await user.clear(text);
    await user.type(text, '[[{{"id": "x"}]');
    await user.click(within(drawer).getByRole('button', { name: 'Save golden set' }));
    expect(within(drawer).getByText("Case 'x' has no input.")).toBeInTheDocument();

    await user.clear(text);
    await user.type(text, '[[{{"id": "x", "input": 1}]');
    await user.click(within(drawer).getByRole('button', { name: 'Save golden set' }));
    const alert = await within(drawer).findByRole('alert');
    expect(alert).toHaveTextContent('The control plane refused the golden set: 1 problem');
    expect(alert).toHaveTextContent('Golden set');
    expect(lastCall(calls, 'PUT', `${P}/versions/2/golden-set`)?.body).toEqual({
      cases: [{ id: 'x', input: 1 }],
    });
  });

  it('hides golden cases without runs.data and gates actions by role', async () => {
    await openEvals([{ role: 'viewer', tenant_id: 't1' }]);
    await screen.findByText(/your role sees how many there are/);
    expect(screen.queryByRole('table', { name: 'Golden cases' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start eval' })).toHaveAccessibleDescription(
      /needs nodes\.run/,
    );
    expect(screen.getByRole('button', { name: 'Edit bar' })).toHaveAccessibleDescription(
      /needs nodes\.publish/,
    );
    expect(screen.getByRole('button', { name: 'Edit cases' })).toHaveAccessibleDescription(
      /needs nodes\.write/,
    );
    expect(screen.getByRole('button', { name: 'Make v2 live' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('only evaluates published versions, and shows what met the bar of the live one', async () => {
    const user = userEvent.setup();
    mockEvals(null, {
      [`GET ${P}/versions/3/golden-set`]: () => ({
        status: 404,
        body: { error: { message: 'golden set not found', type: 'not_found' } },
      }),
      [`GET ${P}/versions/3/gate`]: () => ({
        body: { node: 'triage', version: 3, has_write_tools: false, allowed: true, problems: [] },
      }),
      [`GET ${P}/versions/1/golden-set`]: () => ({
        status: 404,
        body: { error: { message: 'golden set not found', type: 'not_found' } },
      }),
    });
    const { router } = await renderApp('/nodes/t1/triage?tab=evals');
    expect(await screen.findByText('Meets the bar')).toBeInTheDocument();
    expect(screen.getByText(/Met by/)).toHaveTextContent('Met by the golden eval ev_g0.');
    expect(screen.queryByRole('button', { name: /Make v1 live/ })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Version'), 'v3 (draft)');
    expect(router.state.location.search).toMatchObject({ ev: 3 });
    expect(await screen.findByText('v3 has no golden set')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start eval' })).toHaveAccessibleDescription(
      'Only published versions are evaluated: v3 is draft.',
    );
  });
});
