import { describe, expect, it } from 'vitest';
import type { OntologyElement } from '@/api/types';
import { ApiError } from '@/api/client';
import {
  breakingChanges,
  breakingVersions,
  decisionsFor,
  groupByKind,
  parseNodeVersion,
  parseProposals,
  reviewQueue,
} from './ontology';

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

const breakingError = (breaking: unknown, code: string | null = 'ontology_breaking_change') =>
  new ApiError(
    409,
    'send acknowledge_breaking: true: Service: triage@v3',
    'conflict',
    code,
    [],
    breaking,
  );

describe('breakingChanges', () => {
  it('reads the structured list of a breaking-change refusal', () => {
    const list = [
      {
        element: 'Service.city',
        change: 'approved -> deprecated',
        nodes: ['triage@v3', 'desk@v12'],
        versions: [
          { node: 'triage', version: 3 },
          { node: 'desk', version: 12 },
        ],
      },
      {
        element: 'Service',
        change: 'approved -> proposed',
        nodes: ['triage@v3'],
        versions: [{ node: 'triage', version: 3 }],
      },
    ];
    expect(breakingChanges(breakingError(list))).toEqual(list);
  });

  it('takes a list without versions, and reads them from the names', () => {
    const [change] =
      breakingChanges(
        breakingError([
          { element: 'Service', change: 'approved -> rejected', nodes: ['triage@v3'] },
        ]),
      ) ?? [];
    expect(change?.versions).toEqual([]);
    expect(change && breakingVersions(change)).toEqual([
      { ref: 'triage@v3', node: 'triage', version: 3 },
    ]);
  });

  it('is empty when the list has an unexpected shape, so the message is shown', () => {
    expect(breakingChanges(breakingError(undefined))).toEqual([]);
    expect(breakingChanges(breakingError([{ element: 'Service' }]))).toEqual([]);
    expect(
      breakingChanges(
        breakingError([
          { element: 'S', change: 'x', nodes: ['a@v1'], versions: [{ node: 'a', version: '1' }] },
        ]),
      ),
    ).toEqual([]);
  });

  it('is null for every other error, whatever its message says', () => {
    expect(breakingChanges(breakingError([], null))).toBeNull();
    expect(
      breakingChanges(new ApiError(409, 'an introspection is running', 'conflict')),
    ).toBeNull();
    expect(
      breakingChanges(new ApiError(400, 'x', 'invalid', 'ontology_breaking_change')),
    ).toBeNull();
    expect(breakingChanges(new Error('acknowledge_breaking: true: x: y@v1'))).toBeNull();
  });
});

describe('breakingVersions', () => {
  it('prefers the structured versions and keeps an unreadable name as text', () => {
    expect(
      breakingVersions({
        element: 'S',
        change: 'approved -> deprecated',
        nodes: ['ignored@v9'],
        versions: [{ node: 'triage', version: 3 }],
      }),
    ).toEqual([{ ref: 'triage@v3', node: 'triage', version: 3 }]);
    expect(breakingVersions({ element: 'S', change: 'c', nodes: ['odd'], versions: [] })).toEqual([
      { ref: 'odd' },
    ]);
  });
});

describe('parseNodeVersion', () => {
  it('splits name@vN', () => {
    expect(parseNodeVersion('triage@v3')).toEqual({ name: 'triage', version: 3 });
    expect(parseNodeVersion('triage')).toBeNull();
  });
});

describe('decisionsFor', () => {
  it('offers approve and reject on proposals, and withdrawing approved and stale elements', () => {
    expect(decisionsFor('proposed')).toEqual(['approve', 'reject']);
    expect(decisionsFor('approved')).toEqual(['deprecate']);
    expect(decisionsFor('stale')).toEqual(['approve', 'deprecate']);
    expect(decisionsFor('rejected')).toEqual([]);
    expect(decisionsFor('deprecated')).toEqual([]);
  });
});

describe('parseProposals', () => {
  it('takes an array or an exported ontology, as proposals', () => {
    const one = { id: 'Clinic', kind: 'entity', name: 'Clinic', status: 'approved', changed_in: 4 };
    const fromArray = parseProposals(JSON.stringify([one]));
    expect(fromArray).toEqual({
      ok: true,
      elements: [{ id: 'Clinic', kind: 'entity', name: 'Clinic', provenance: 'human' }],
    });
    const fromExport = parseProposals(
      JSON.stringify({ tenant_id: 't1', version: 4, elements: [{ ...one, provenance: 'llm' }] }),
    );
    expect(fromExport.ok && fromExport.elements[0]?.provenance).toBe('llm');
  });

  it('says what is wrong', () => {
    expect(parseProposals('{')).toEqual({ ok: false, error: 'This is not valid JSON.' });
    expect(parseProposals('[]').ok).toBe(false);
    expect(parseProposals('[{"id": "a", "kind": "entity"}]')).toEqual({
      ok: false,
      error: 'Element 1 has no name.',
    });
    expect(parseProposals('[{"id": "a", "kind": "table", "name": "A"}]')).toEqual({
      ok: false,
      error: 'Element 1 has an unknown kind "table".',
    });
    const a = { id: 'a', kind: 'entity', name: 'A' };
    expect(parseProposals(JSON.stringify([a, a]))).toEqual({
      ok: false,
      error: 'Element id "a" is repeated.',
    });
  });
});
