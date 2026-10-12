import { describe, expect, it } from 'vitest';
import type { Node } from '@/api/types';
import { nodeProblems, shortHash, summarizeNodes } from './nodes';

const base: Node = {
  id: 'n1',
  tenant_id: 't1',
  name: 'triage',
  version: 1,
  spec: {},
  hash: 'sha256:aaaa',
  state: 'published',
  live: false,
  created_at: '2026-10-01T10:00:00Z',
};

describe('summarizeNodes', () => {
  it('groups versions per tenant and node, with the live and latest versions', () => {
    const rows = summarizeNodes([
      { ...base, id: 'a', version: 1, live: true, published_at: '2026-10-03T10:00:00Z' },
      { ...base, id: 'b', version: 2, state: 'draft', created_at: '2026-10-02T10:00:00Z' },
      { ...base, id: 'c', tenant_id: 't2', version: 1, state: 'draft' },
      { ...base, id: 'd', name: 'billing', version: 1, state: 'retired' },
    ]);
    expect(rows.map((r) => `${r.tenantId}/${r.name}`)).toEqual([
      't1/triage',
      't1/billing',
      't2/triage',
    ]);
    const triage = rows[0]!;
    expect(triage.live?.version).toBe(1);
    expect(triage.latest.version).toBe(2);
    expect(triage.versions).toBe(2);
    // The last change of any version: v1 was published after v2 was created.
    expect(triage.updatedAt).toBe('2026-10-03T10:00:00Z');
  });
});

describe('nodeProblems', () => {
  it('splits a publish refusal into every problem, by kind', () => {
    const { title, problems } = nodeProblems(
      "cannot publish triage@v2: tool 'mcp://crm/find#sha256:ab': 'find' has no approved manifest on server 'crm'; datasource scope 'shop.orders:read': the tenant has no datasource named 'shop'; budgets.steps = 500 exceeds the tenant's node cap of 200; node://intake@v1 is a draft; publish it first",
    );
    expect(title).toBe('Cannot publish triage@v2');
    expect(problems).toEqual([
      {
        kind: 'tool',
        text: "tool 'mcp://crm/find#sha256:ab': 'find' has no approved manifest on server 'crm'",
      },
      {
        kind: 'scope',
        text: "datasource scope 'shop.orders:read': the tenant has no datasource named 'shop'",
      },
      { kind: 'cap', text: "budgets.steps = 500 exceeds the tenant's node cap of 200" },
      { kind: 'reference', text: 'node://intake@v1 is a draft; publish it first' },
    ]);
  });

  it('classifies the static checks a draft can fail', () => {
    const kind = (m: string) => nodeProblems(m).problems.map((p) => p.kind);
    expect(
      kind("MCP tool 'mcp://crm/find' must be pinned with #sha256:<64 hex characters>"),
    ).toEqual(['pin']);
    expect(
      kind(
        "vertex 'x': the `code` vertex type is not yet supported (it arrives with the WASM sandbox)",
      ),
    ).toEqual(['code']);
    expect(kind('budgets.usd is required: the tenant caps what one run may spend at $1')).toEqual([
      'cap',
    ]);
    expect(kind('workflow nodes need a graph')).toEqual(['spec']);
    expect(
      kind(
        'builtin://rag_search needs rag.<collection>:read scopes in datasources.scopes (what it may search)',
      ),
    ).toEqual(['scope']);
    expect(
      kind(
        "datasource scope 'rag.handbook:read': the tenant has no document collection named 'handbook'",
      ),
    ).toEqual(['scope']);
    expect(nodeProblems('workflow nodes need a graph').title).toBeNull();
  });
});

describe('nodeProblems with the problems of the error body', () => {
  it('lists the promotion gate reasons of a refused promotion', () => {
    const { title, problems } = nodeProblems(
      'triage@v2 cannot be promoted: pass^k 0.5 is below the bar 0.9; no injection eval',
      [
        { kind: 'eval_gate', message: 'pass^k 0.5 is below the bar 0.9' },
        { kind: 'eval_gate', message: 'no injection eval' },
      ],
    );
    expect(title).toBe('Cannot make triage@v2 live');
    expect(problems).toEqual([
      { kind: 'gate', text: 'pass^k 0.5 is below the bar 0.9' },
      { kind: 'gate', text: 'no injection eval' },
    ]);
  });

  it('keeps classifying other kinds by their text', () => {
    const { problems } = nodeProblems('cannot publish triage@v2: x', [
      { kind: 'budget', message: "budgets.steps 150 exceeds the tenant's node cap 100" },
      { kind: 'golden_set', message: "case 'a': input does not match" },
    ]);
    expect(problems.map((p) => p.kind)).toEqual(['cap', 'golden']);
  });
});

describe('shortHash', () => {
  it('keeps the algorithm and 12 hex characters', () => {
    expect(shortHash('sha256:0123456789abcdef0123')).toBe('sha256:0123456789ab');
  });
});
