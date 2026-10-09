import { describe, expect, it } from 'vitest';
import type { OntologyElement } from '@/api/types';
import { groupByKind, reviewQueue } from './ontology';

const el = (p: Partial<OntologyElement> & Pick<OntologyElement, 'id'>): OntologyElement => ({
  kind: 'entity',
  name: p.id,
  status: 'proposed',
  provenance: 'llm',
  confidence: 0.5,
  ...p,
});

describe('reviewQueue', () => {
  it('keeps only proposed elements, least confident first, unknown confidence first', () => {
    const q = reviewQueue([
      el({ id: 'high', confidence: 0.95 }),
      el({ id: 'approved', confidence: 0.1, status: 'approved' }),
      el({ id: 'low', confidence: 0.2 }),
      el({ id: 'unknown', confidence: null }),
      el({ id: 'mid-b', confidence: 0.6 }),
      el({ id: 'mid-a', confidence: 0.6 }),
    ]);
    expect(q.map((e) => e.id)).toEqual(['unknown', 'low', 'mid-a', 'mid-b', 'high']);
  });

  it('does not mutate its input', () => {
    const input = [el({ id: 'b', confidence: 0.9 }), el({ id: 'a', confidence: 0.1 })];
    reviewQueue(input);
    expect(input.map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('groupByKind', () => {
  it('returns every kind in contract order, including empty ones', () => {
    const groups = groupByKind([el({ id: 'm', kind: 'metric' }), el({ id: 'e', kind: 'entity' })]);
    expect(groups[0]).toMatchObject({ kind: 'entity', items: [{ id: 'e' }] });
    expect(groups.find((g) => g.kind === 'metric')?.items).toHaveLength(1);
    expect(groups.find((g) => g.kind === 'policy')?.items).toEqual([]);
    expect(groups).toHaveLength(8);
  });
});
