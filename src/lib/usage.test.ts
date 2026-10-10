import { describe, expect, it } from 'vitest';
import { nodeCosts } from './usage';

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
