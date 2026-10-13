import { describe, expect, it } from 'vitest';
import type { Eval, Node, PromotionGate } from '@/api/types';
import { failingCases, goLiveSteps, plainProblem, requirements } from './goLive';

const version = (over: Partial<Node> = {}): Node => ({
  id: 'n2',
  tenant_id: 't1',
  name: 'desk',
  version: 2,
  spec: {},
  hash: 'sha256:ab',
  state: 'published',
  live: false,
  created_at: '2026-10-10T10:00:00Z',
  ...over,
});

const golden = (byCase: Array<[string, number]>, status: Eval['status'] = 'succeeded'): Eval => ({
  id: 'ev_g',
  object: 'node.eval',
  node: 'desk',
  version: 2,
  hash: 'sha256:ab',
  suite: 'golden',
  k: 3,
  case_count: byCase.length,
  status,
  created_at: '2026-10-10T11:00:00Z',
  summary: {
    suite: 'golden',
    k: 3,
    cases: byCase.length,
    trials: byCase.length * 3,
    passed_trials: byCase.reduce((n, [, p]) => n + p, 0),
    errors: 0,
    pass_hat_k: byCase.filter(([, p]) => p === 3).length / byCase.length,
    pass_at_1: 0.5,
    pass_at_k: 1,
    cost_usd: 0.01,
    judge_cost_usd: 0,
    tokens: 10,
    latency_ms: { p50: 1, p95: 2 },
    by_case: byCase.map(([c, p]) => ({ case: c, trials: 3, passed: p, all_passed: p === 3 })),
  },
});

const allowedGate: PromotionGate = {
  allowed: true,
  has_write_tools: false,
  evidence: { golden: { eval: 'ev_g', k: 3, pass_hat_k: 0.67 } },
  problems: [],
};
const policy = { golden: { min_pass_k: 0.6, min_k: 3 } };

describe('goLiveSteps', () => {
  it('starts at publish for a draft', () => {
    const steps = goLiveSteps({
      version: version({ state: 'draft' }),
      evals: [],
      gate: undefined,
      policy,
    });
    expect(steps.map((s) => s.status)).toEqual(['current', 'todo', 'todo', 'todo']);
  });

  it('asks for the tests the bar needs, and says when they run', () => {
    const gate = { ...allowedGate, allowed: false, has_write_tools: true, evidence: null };
    const steps = goLiveSteps({ version: version(), evals: [], gate, policy });
    expect(steps[1]).toMatchObject({ status: 'current' });
    expect(steps[1]!.detail).toBe(
      'The go-live bar needs quality tests and safety tests of this version.',
    );
    const running = goLiveSteps({
      version: version(),
      evals: [golden([], 'running')],
      gate,
      policy,
    });
    expect(running[1]!.status).toBe('running');
  });

  it('never calls a version ready without saying a case failed every try', () => {
    // The fintech case: the bar was met at 60% while one case failed 3 of 3.
    const evals = [
      golden([
        ['single-charge-refund', 0],
        ['dup', 3],
        ['other', 3],
      ]),
    ];
    const steps = goLiveSteps({ version: version(), evals, gate: allowedGate, policy });
    expect(steps[2]).toMatchObject({ status: 'done' });
    expect(steps[2]!.detail).toBe('Allowed to go live, but 1 test case failed every try.');
    expect(steps[3]!.status).toBe('current');
  });

  it('is done when the version is live', () => {
    const steps = goLiveSteps({
      version: version({ live: true }),
      evals: [golden([['a', 3]])],
      gate: allowedGate,
      policy,
    });
    expect(steps.every((s) => s.status === 'done')).toBe(true);
  });
});

describe('failingCases', () => {
  it('lists cases that failed every try first', () => {
    const s = golden([
      ['b', 2],
      ['a', 0],
      ['c', 3],
    ]).summary as never;
    expect(failingCases(s).map((c) => [c.case, c.passed])).toEqual([
      ['a', 0],
      ['b', 2],
    ]);
  });
});

describe('requirements', () => {
  it('lists each requirement in plain words, without repeating "run the tests"', () => {
    const gate: PromotionGate = {
      allowed: false,
      has_write_tools: true,
      evidence: null,
      problems: [
        {
          kind: 'eval_gate',
          message:
            'a version with write tools needs a finished injection eval before it is promoted (POST .../evals {"suite": "injection"})',
        },
        {
          kind: 'eval_gate',
          message: 'pass^3 = 0.500 in its latest golden eval (ev_g); the bar is 0.600',
        },
      ],
    };
    const r = requirements({
      version: version(),
      evals: [
        golden([
          ['a', 3],
          ['b', 1],
        ]),
      ],
      gate,
      policy,
    });
    expect(r.map((x) => [x.label, x.met])).toEqual([
      ['Quality tests: at least 60% of test cases pass all 3 tries', false],
      ['Safety tests: required, because this version can change things (write tools)', false],
    ]);
  });

  it('marks a requirement met only from its own numbers, and states it once', () => {
    // As the control plane answers: the eval it used is recorded as evidence
    // even when it is under the bar, with the failure also in the problems.
    const gate: PromotionGate = {
      allowed: false,
      has_write_tools: true,
      evidence: {
        golden: { eval: 'ev_g', k: 3, pass_hat_k: 0.5 },
        injection: { eval: 'ev_i', pass_rate: 0.9, bar: 1 },
      },
      problems: [
        {
          kind: 'eval_gate',
          message: 'pass^3 = 0.500 in its latest golden eval (ev_g); the bar is 0.600',
        },
        {
          kind: 'eval_gate',
          message:
            '9 of 10 injection attacks were blocked (0.900) in its latest injection eval (ev_i); the bar is 1.000',
        },
        {
          kind: 'eval_gate',
          message: 'p95 latency 90000 ms in its latest golden eval (ev_g); the bar is 60000 ms',
        },
      ],
    };
    const r = requirements({
      version: version(),
      evals: [
        golden([
          ['a', 3],
          ['b', 1],
        ]),
      ],
      gate,
      policy,
    });
    expect(r.map((x) => [x.label, x.met])).toEqual([
      ['Quality tests: at least 60% of test cases pass all 3 tries', false],
      ['Safety tests: required, because this version can change things (write tools)', false],
      ['95 of 100 answers took up to 90.0 s; the bar is 60.0 s.', false],
    ]);
    expect(r[0]!.detail).toBe('1 of 2 test cases passed all 3 tries (50%).');

    // Over the bar: met.
    const ok = requirements({
      version: version(),
      evals: [golden([['a', 3]])],
      gate: { ...gate, evidence: { golden: { eval: 'ev_g', k: 3, pass_hat_k: 1 } }, problems: [] },
      policy,
    });
    expect(ok[0]!.met).toBe(true);
  });
});

describe('plainProblem', () => {
  it('rewrites the API wording and keeps unknown messages', () => {
    expect(
      plainProblem(
        'the node\'s promotion bar needs a finished golden-set eval of this version (POST .../evals {"suite": "golden"})',
      ),
    ).toBe('Run the quality tests of this version.');
    expect(
      plainProblem('p95 latency 90000 ms in its latest golden eval (e); the bar is 60000 ms'),
    ).toBe('95 of 100 answers took up to 90.0 s; the bar is 60.0 s.');
    expect(
      plainProblem(
        'Run the quality tests of this version.'.replace('Run', 'Ran'),
        'node://docs-helper@v1',
      ),
    ).toBe('Sub-assistant docs-helper@v1: Ran the quality tests of this version.');
    expect(plainProblem('something else')).toBe('something else');
  });
});
