import { describe, expect, it } from 'vitest';
import type { Node } from '@/api/types';
import {
  defaultEvalVersion,
  notApplicable,
  parseGoldenCases,
  policyForm,
  policyFromForm,
} from './evals';

describe('policyFromForm', () => {
  it('turns percents into ratios and leaves out what is empty', () => {
    const r = policyFromForm({
      minPassK: '90',
      minK: '3',
      maxCostPerSuccess: '0.02',
      maxP95: '',
      injectionMinPassRate: '',
    });
    expect(r.policy).toEqual({
      golden: { min_pass_k: 0.9, min_k: 3, max_cost_per_success_usd: 0.02 },
    });
  });

  it('refuses golden bars without a least pass^k, and values out of range', () => {
    const r = policyFromForm({
      minPassK: '',
      minK: '11',
      maxCostPerSuccess: '0',
      maxP95: '',
      injectionMinPassRate: '120',
    });
    expect(r.errors).toEqual({
      minPassK: 'Set the least pass^k to use the other golden bars.',
      minK: 'A whole number from 1 to 10.',
      maxCostPerSuccess: 'An amount above 0.',
      injectionMinPassRate: 'A percent from 0 to 100.',
    });
  });

  it('round-trips a stored bar through the form', () => {
    const policy = { golden: { min_pass_k: 0.875, min_k: 2 }, injection: { min_pass_rate: 0.95 } };
    expect(policyFromForm(policyForm(policy)).policy).toEqual(policy);
  });
});

describe('parseGoldenCases', () => {
  it('accepts an array of cases, or an object with cases', () => {
    const cases = [{ id: 'a', input: { q: 1 }, expected: 'x' }];
    expect(parseGoldenCases(JSON.stringify(cases)).cases).toEqual(cases);
    expect(parseGoldenCases(JSON.stringify({ cases })).cases).toEqual(cases);
  });

  it('says what is wrong with the shape', () => {
    expect(parseGoldenCases('{').error).toMatch(/^Not valid JSON/);
    expect(parseGoldenCases('[{"input": 1}]').error).toMatch(/needs an id/);
    expect(parseGoldenCases('[{"id":"a","input":1},{"id":"a","input":2}]').error).toBe(
      "Case id 'a' is used twice.",
    );
    expect(parseGoldenCases('[{"id":"a"}]').error).toBe("Case 'a' has no input.");
  });
});

describe('notApplicable', () => {
  it('reads plain case ids and cases with a reason', () => {
    expect(
      notApplicable({
        not_applicable: [
          'poisoning.manifest_scan',
          { case: 'write.staged', reason: 'not an agent' },
        ],
      }),
    ).toEqual([
      { case: 'poisoning.manifest_scan', reason: null },
      { case: 'write.staged', reason: 'not an agent' },
    ]);
  });
});

describe('defaultEvalVersion', () => {
  const v = (version: number, state: Node['state'], live = false) =>
    ({ version, state, live }) as Node;

  it('opens on the live version, else the newest published, else the newest', () => {
    expect(defaultEvalVersion([v(1, 'published', true), v(2, 'published')])).toBe(1);
    expect(defaultEvalVersion([v(1, 'published'), v(2, 'published'), v(3, 'draft')])).toBe(2);
    expect(defaultEvalVersion([v(1, 'draft')])).toBe(1);
  });
});
