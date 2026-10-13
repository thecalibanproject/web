import { describe, expect, it } from 'vitest';
import type { RunStep } from '@/api/types';
import { budgetRows, sinceIso, statusParam, stepName, timeline } from './runs';

describe('statusParam and sinceIso', () => {
  it('expands "not ended" to every status of a run that has not ended', () => {
    expect(statusParam('active')).toBe('pending,running,sleeping,input_required');
    expect(statusParam('failed')).toBe('failed');
    expect(statusParam(undefined)).toBeUndefined();
  });

  it('counts the time range back from now', () => {
    const now = Date.parse('2026-10-11T12:00:00Z');
    expect(sinceIso('24h', now)).toBe('2026-10-10T12:00:00.000Z');
  });
});

describe('timeline', () => {
  const step = (id: string, started_at: string, duration_ms: number): RunStep => ({
    id,
    vertex: id.split('#')[0]!,
    kind: 'llm',
    status: 'completed',
    tokens: 0,
    usd: 0,
    labels: [],
    started_at,
    duration_ms,
  });

  it('places steps on one axis, from the first start to the last end', () => {
    const t = timeline([
      step('a#0', '2026-10-11T12:00:00.000Z', 1000),
      step('b#0', '2026-10-11T12:00:01.000Z', 3000),
    ]);
    expect(t.spanMs).toBe(4000);
    expect(t.steps.map((s) => [s.offsetMs, s.left, s.width])).toEqual([
      [0, 0, 25],
      [1000, 25, 75],
    ]);
  });
});

describe('budgetRows', () => {
  it('lists the dimensions the run has, with what it used and its limit', () => {
    expect(
      budgetRows({ steps_used: 3, steps_limit: 8, usd: 0.01, wall_clock_ms_used: 1200 }),
    ).toEqual([
      { label: 'Steps', used: 3, limit: 8, unit: 'int' },
      { label: 'Spend', used: 0.01, limit: null, unit: 'usd' },
      { label: 'Execution time', used: 1200, limit: null, unit: 'ms' },
    ]);
  });
});

describe('stepName', () => {
  it('reads a step id as the name people know', () => {
    expect(stepName('refund#0@approve')).toBe('refund');
    expect(stepName('lookup#2')).toBe('lookup');
    expect(stepName('clarify')).toBe('clarify');
  });
});
