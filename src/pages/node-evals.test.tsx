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
  {
    id: 'key_eval',
    name: 'eval',
    prefix: 'cal_ev99',
    created_at: '2026-10-01T10:00:00Z',
    purpose: 'eval',
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
    'GET /api/v1/tenants/t1/eval-key': () => ({ body: { tenant_id: 't1', key: keys[2] } }),
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
  await screen.findByRole('table', { name: 'Test runs' });
  return { calls, ...rendered };
}

const lastCall = (calls: RecordedCall[], method: string, path: string) =>
  calls.filter((c) => c.method === method && c.path === path).at(-1);

describe('Node evals', () => {
  it('shows the go-live check, the bar, the test cases and the test runs of a version', async () => {
    await openEvals(null);
    expect(screen.getByRole('tab', { name: 'Tests' })).toHaveAttribute('aria-selected', 'true');

    expect(screen.getByText('Not ready to go live')).toBeInTheDocument();
    expect(screen.getByText('Can change things')).toBeInTheDocument();
    const reqs = screen.getByRole('list', { name: 'Requirements' });
    expect(reqs).toHaveTextContent('Quality tests: at least 90% of test cases pass all 3 tries');
    expect(reqs).toHaveTextContent('1 of 2 test cases passed all 3 tries (50%).');
    expect(reqs).toHaveTextContent(
      'Safety tests: required, because this version can change things',
    );
    expect(reqs).toHaveTextContent('is below the bar 0.9');
    expect(reqs).toHaveTextContent('no injection eval met the bar');
    // Failing cases are named first, even before the requirements.
    expect(screen.getByRole('region', { name: 'Failing test cases' })).toHaveTextContent(
      'chestpassed 2 of 3 tries',
    );

    expect(screen.getByText('Test cases that must pass every try').nextSibling).toHaveTextContent(
      '90%',
    );
    expect(screen.getByText('Attacks that must be blocked').nextSibling).toHaveTextContent(
      '100% (default)',
    );
    expect(screen.getByText('Versions that only read').nextSibling).toHaveTextContent(
      'Need safety tests (default)',
    );
    expect(screen.queryByText('Reads outside data')).not.toBeInTheDocument();

    const cases = screen.getByRole('table', { name: 'Test cases' });
    expect(within(cases).getByText('chest').closest('tr')).toHaveTextContent(
      'Grader: Fits the case?',
    );
    expect(within(cases).getByText('chest').closest('tr')).toHaveTextContent('clarify');
    expect(within(cases).getByText('refund').closest('tr')).toHaveTextContent('Must equal billing');

    const evals = within(screen.getByRole('table', { name: 'Test runs' })).getAllByRole('row');
    expect(evals[1]).toHaveTextContent('Safety tests');
    expect(evals[1]).toHaveTextContent('66.7% of attacks blocked · still did its job in 50%');
    expect(evals[2]).toHaveTextContent('Quality tests');
    expect(evals[2]).toHaveTextContent(
      '1 of 2 passed all 3 tries · $0.0060 per good answer · 95% under 2.40 s',
    );
  });

  it('opens quality tests with results per test case and every try', async () => {
    const user = userEvent.setup();
    const { router } = await openEvals(null);
    await user.click(screen.getByRole('button', { name: 'Open test run ev_g1' }));
    const drawer = await screen.findByRole('dialog', { name: 'Test run' });
    await within(drawer).findByRole('table', { name: 'Trials' });
    expect(router.state.location.search).toMatchObject({ eval: 'ev_g1' });

    expect(within(drawer).getByText('Passed every try').nextSibling).toHaveTextContent('50%');
    expect(within(drawer).getByText('Tries that passed').nextSibling).toHaveTextContent('83.3%');
    expect(within(drawer).getByText('Cost of a good answer').nextSibling).toHaveTextContent(
      '$0.0060',
    );
    expect(within(drawer).getByText('Slowest typical answer').nextSibling).toHaveTextContent(
      '2.40 s',
    );
    expect(within(drawer).getByRole('table', { name: 'Test cases' })).toHaveTextContent(
      'chest2 of 3No',
    );

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

  it('opens safety tests with attacks blocked, attacks that worked and whether it still did its job', async () => {
    const user = userEvent.setup();
    await openEvals(null);
    await user.click(screen.getByRole('button', { name: 'Open test run ev_i1' }));
    const drawer = await screen.findByRole('dialog', { name: 'Test run' });
    await within(drawer).findByText('Attacks blocked');
    expect(within(drawer).getByText('Attacks blocked').nextSibling).toHaveTextContent('66.7%');
    expect(within(drawer).getByText('Attacks that worked').nextSibling).toHaveTextContent('33.3%');
    expect(within(drawer).getByText('Still did its job').nextSibling).toHaveTextContent('50%');
    expect(within(drawer).getByRole('table', { name: 'Kinds of attack' })).toHaveTextContent(
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
    await user.click(screen.getByRole('button', { name: 'Run tests' }));
    const drawer = await screen.findByRole('dialog', { name: 'Run tests of triage v2' });
    const key = within(drawer).getByLabelText('Runs as');
    await within(drawer).findByRole('option', { name: 'App key evals (cal_ab12)' });
    // The managed eval key is the default, not one of the customer keys.
    expect(within(drawer).queryByRole('option', { name: /cal_ev99/ })).not.toBeInTheDocument();
    expect(
      within(drawer).queryByRole('option', { name: /other-node-only/ }),
    ).not.toBeInTheDocument();
    await user.selectOptions(key, 'key_1');
    await user.click(within(drawer).getByText('Advanced'));
    await user.type(within(drawer).getByLabelText('Tries per test case'), '5');
    await user.type(within(drawer).getByLabelText('Only these test cases'), 'chest, refund');
    await user.click(within(drawer).getByRole('button', { name: 'Run quality tests' }));

    await waitFor(() =>
      expect(lastCall(calls, 'POST', `${P}/versions/2/evals`)?.body).toEqual({
        suite: 'golden',
        api_key_id: 'key_1',
        k: 5,
        cases: ['chest', 'refund'],
      }),
    );
    expect(await screen.findByRole('dialog', { name: 'Test run' })).toBeInTheDocument();
  });

  it('starts safety tests on a test case input, as the managed test key', async () => {
    const user = userEvent.setup();
    const { calls } = await openEvals(null);
    await user.click(screen.getByRole('button', { name: 'Run tests' }));
    const drawer = await screen.findByRole('dialog', { name: 'Run tests of triage v2' });
    await user.click(within(drawer).getByRole('radio', { name: /Safety tests/ }));
    await within(drawer).findByText(/The workspace's test key \(cal_ev99\)/);
    await user.click(within(drawer).getByText('Advanced'));
    await user.selectOptions(
      within(drawer).getByLabelText('Request the attacks ride on'),
      'Test case refund',
    );
    await user.click(within(drawer).getByRole('button', { name: 'Run safety tests' }));
    // No api_key_id: the eval runs as the tenant's eval key.
    await waitFor(() =>
      expect(lastCall(calls, 'POST', `${P}/versions/2/evals`)?.body).toEqual({
        suite: 'injection',
        input_case: 'refund',
      }),
    );
  });

  it("says when the run retention cleared an eval's trial detail", async () => {
    const user = userEvent.setup();
    await openEvals(null, undefined, {
      'GET /api/v1/tenants/t1/evals/ev_g1': () => ({
        body: {
          ...goldenDetail,
          content_purged: true,
          trials: goldenDetail.trials!.map((t) => ({ ...t, detail: null })),
        },
      }),
    });
    await user.click(screen.getByRole('button', { name: 'Open test run ev_g1' }));
    const drawer = await screen.findByRole('dialog', { name: 'Test run' });
    expect(await within(drawer).findByText(/retention period cleared/)).toBeInTheDocument();
    expect(within(drawer).getByText('Passed every try').nextSibling).toHaveTextContent('50%');
  });

  it('sets the go-live bar', async () => {
    const user = userEvent.setup();
    const { calls } = await openEvals(null);
    await user.click(screen.getByRole('button', { name: 'Edit bar' }));
    const drawer = await screen.findByRole('dialog', { name: 'Go-live bar of triage' });
    const passK = within(drawer).getByLabelText('Test cases that must pass every try');
    expect(passK).toHaveValue('90');
    await user.clear(passK);
    await user.type(passK, '95');
    await user.type(within(drawer).getByLabelText('Attacks that must be blocked'), '90');
    await user.click(within(drawer).getByRole('button', { name: 'Save bar' }));
    await waitFor(() =>
      expect(lastCall(calls, 'PUT', `${P}/eval-policy`)?.body).toEqual({
        golden: { min_pass_k: 0.95, min_k: 3 },
        injection: { min_pass_rate: 0.9 },
      }),
    );
  });

  it('makes safety tests optional for versions that only read', async () => {
    const user = userEvent.setup();
    const { calls } = await openEvals(null, undefined, {
      [`GET ${P}/versions/2/gate`]: () => ({
        body: {
          node: 'triage',
          version: 2,
          has_write_tools: false,
          has_untrusted_reads: true,
          allowed: false,
          evidence: null,
          problems: [{ kind: 'eval_gate', message: 'no injection eval met the bar' }],
        },
      }),
    });
    expect(await screen.findByText('Reads outside data')).toHaveAttribute(
      'title',
      expect.stringMatching(/unless the bar makes them optional/),
    );
    await user.click(screen.getByRole('button', { name: 'Edit bar' }));
    const drawer = await screen.findByRole('dialog', { name: 'Go-live bar of triage' });
    const readOnly = within(drawer).getByLabelText('Versions that only read');
    expect(readOnly).toHaveAccessibleDescription(/what they read can still steer their answer/);
    await user.selectOptions(readOnly, 'optional');
    await user.click(within(drawer).getByRole('button', { name: 'Save bar' }));
    await waitFor(() =>
      expect(lastCall(calls, 'PUT', `${P}/eval-policy`)?.body).toEqual({
        golden: { min_pass_k: 0.9, min_k: 3 },
        injection: { min_pass_rate: 1, read_only: 'optional' },
      }),
    );
  });

  it("edits a version's test cases and shows why they were refused", async () => {
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
    await user.click(screen.getByRole('button', { name: 'Edit test cases' }));
    const drawer = await screen.findByRole('dialog', { name: 'Test cases of triage v2' });
    const text = within(drawer).getByLabelText('Test cases (JSON)');
    expect((text as HTMLTextAreaElement).value).toContain('"chest"');

    await user.clear(text);
    await user.type(text, '[[{{"id": "x"}]');
    await user.click(within(drawer).getByRole('button', { name: 'Save test cases' }));
    expect(within(drawer).getByText("Case 'x' has no input.")).toBeInTheDocument();

    await user.clear(text);
    await user.type(text, '[[{{"id": "x", "input": 1}]');
    await user.click(within(drawer).getByRole('button', { name: 'Save test cases' }));
    const alert = await within(drawer).findByRole('alert');
    expect(alert).toHaveTextContent('Caliban could not save these test cases: 1 problem');
    expect(alert).toHaveTextContent('Golden set');
    expect(lastCall(calls, 'PUT', `${P}/versions/2/golden-set`)?.body).toEqual({
      cases: [{ id: 'x', input: 1 }],
    });
  });

  it('hides test cases without runs.data and gates actions by role', async () => {
    await openEvals([{ role: 'viewer', tenant_id: 't1' }]);
    await screen.findByText(/your role sees how many there are/);
    expect(screen.queryByRole('table', { name: 'Test cases' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run tests' })).toHaveAccessibleDescription(
      /needs nodes\.run/,
    );
    expect(screen.getByRole('button', { name: 'Edit bar' })).toHaveAccessibleDescription(
      /needs nodes\.publish/,
    );
    expect(screen.getByRole('button', { name: 'Edit test cases' })).toHaveAccessibleDescription(
      /needs nodes\.write/,
    );
    expect(screen.getByRole('button', { name: 'Make v2 live' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('only tests published versions, and shows what met the bar of the live one', async () => {
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
    expect(await screen.findByText('Ready to go live')).toBeInTheDocument();
    expect(screen.getByText(/Based on/)).toHaveTextContent('Based on the quality tests.');
    expect(screen.queryByRole('button', { name: /Make v1 live/ })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Version'), 'v3 (draft)');
    expect(router.state.location.search).toMatchObject({ ev: 3 });
    expect(await screen.findByText('v3 has no test cases yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run tests' })).toHaveAccessibleDescription(
      'Only published versions can be tested: v3 is a draft.',
    );
  });
});
