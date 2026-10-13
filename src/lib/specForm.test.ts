import { describe, expect, it } from 'vitest';
import { applyForm, DATA_LOOKUP, RAG_SEARCH, specToForm, unsupportedParts } from './specForm';

const base = {
  kind: 'agent',
  description: 'Answers from the handbook',
  prompt: { system: 'Be brief.' },
  model_policy: { model: 'caliban/auto' },
  tools: [
    { ref: RAG_SEARCH, effect: 'read' },
    { ref: 'mcp://crm/find#sha256:' + 'b'.repeat(64), effect: 'read', requires: ['x'] },
  ],
  datasources: { scopes: ['rag.handbook:read'] },
  guardrails: { pii: 'reversible' },
  budgets: { steps: 8, tokens: 20000, wall_clock_s: 60 },
};

describe('specToForm', () => {
  it('reads the common fields in plain terms', () => {
    const f = specToForm(base);
    expect(f).toMatchObject({
      description: 'Answers from the handbook',
      instructions: 'Be brief.',
      model: 'caliban/auto',
      searchDocuments: true,
      lookUpData: false,
      scopes: ['rag.handbook:read'],
      pii: 'reversible',
      answer: '',
      steps: '8',
      tokens: '20000',
      wallClock: '60',
      usd: '',
    });
  });
});

describe('applyForm', () => {
  it('round-trips without changing the spec', () => {
    expect(applyForm(base, specToForm(base))).toEqual(base);
  });

  it('changes only its own fields and keeps tools it does not show', () => {
    const f = specToForm(base);
    const out = applyForm(base, {
      ...f,
      instructions: 'Answer in French.',
      searchDocuments: false,
      lookUpData: true,
      usd: '0.25',
      scopes: ['shop.orders:read', ' '],
    });
    expect(out.prompt).toEqual({ system: 'Answer in French.' });
    expect((out.tools as Array<{ ref: string }>).map((t) => t.ref)).toEqual([
      DATA_LOOKUP,
      base.tools[1]!.ref,
    ]);
    expect((out.tools as unknown[])[1]).toEqual(base.tools[1]);
    expect(out.datasources).toEqual({ scopes: ['shop.orders:read'] });
    expect(out.budgets).toEqual({ steps: 8, tokens: 20000, wall_clock_s: 60, usd: 0.25 });
    // The input is not changed.
    expect(base.prompt.system).toBe('Be brief.');
  });

  it('keeps a number that does not parse as text, so the schema check names it', () => {
    const out = applyForm(base, { ...specToForm(base), steps: 'ten' });
    expect((out.budgets as { steps: unknown }).steps).toBe('ten');
  });

  it('removes emptied optional settings', () => {
    const out = applyForm(base, {
      ...specToForm(base),
      description: '',
      pii: '',
      scopes: [],
      model: '',
    });
    expect(out).not.toHaveProperty('description');
    expect(out).not.toHaveProperty('guardrails');
    expect(out).not.toHaveProperty('datasources');
    expect(out).not.toHaveProperty('model_policy');
  });
});

describe('unsupportedParts', () => {
  it('is empty for a spec the form fully covers', () => {
    const { tools: _t, ...simple } = base;
    expect(unsupportedParts({ ...simple, tools: [base.tools[0]] })).toEqual([]);
  });

  it('names, in plain words, what only the JSON view can edit', () => {
    expect(
      unsupportedParts({
        ...base,
        kind: 'workflow',
        graph: { vertices: [] },
        prompt: { system: 's', output_schema: {} },
        model_policy: { model: 'm', candidates: ['tier:small'] },
        tools: [...base.tools, { ref: 'node://other@v1', effect: 'read' }],
        memory: { short_term: 'run' },
        exposure: { http: true, mcp_tool: true },
      }),
    ).toEqual([
      'a step-by-step flow',
      'actions in connected systems',
      'sub-assistants it calls',
      'tool permissions',
      'the answer format',
      'model choice rules',
      'memory',
      'how apps can reach it',
    ]);
  });
});
