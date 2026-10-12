import { describe, expect, it } from 'vitest';
import { nodeCosts, purposeCosts } from './usage';

describe('nodeCosts', () => {
  it('sums the versions of each node, most charged first', () => {
    const costs = nodeCosts([
      { node: 'triage', node_version: 2, totals: { requests: 3, charged_usd: 0.3, cost_usd: 0.1 } },
      { node: 'intake', node_version: 1, totals: { requests: 10, charged_usd: 1, cost_usd: 0.5 } },
      {
        node: 'triage',
        node_version: 1,
        totals: { requests: 1, charged_usd: 0.05, prompt_tokens: 7 },
      },
    ]);
    expect(costs.map((c) => c.node)).toEqual(['intake', 'triage']);
    const triage = costs[1]!;
    expect(triage.totals).toMatchObject({ requests: 4, chargedUsd: 0.35, promptTokens: 7 });
    expect(triage.versions.map((v) => v.version)).toEqual([1, 2]);
  });

  it('is empty without node calls', () => {
    expect(nodeCosts(undefined)).toEqual([]);
  });
});

describe('purposeCosts', () => {
  it('labels the known purposes, ingest first, and keeps any other after them', () => {
    const rows = purposeCosts([
      { purpose: 'other', totals: { requests: 1 } },
      { purpose: 'rag.search', totals: { requests: 2, charged_usd: 0.1 } },
      { purpose: 'rag.ingest', totals: { requests: 3 } },
    ]);
    expect(rows.map((r) => [r.purpose, r.label])).toEqual([
      ['rag.ingest', 'Indexing documents'],
      ['rag.search', 'Retrieval queries'],
      ['other', 'other'],
    ]);
    expect(rows[1]?.totals).toMatchObject({ requests: 2, chargedUsd: 0.1 });
    expect(purposeCosts(undefined)).toEqual([]);
  });
});
