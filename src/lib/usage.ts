import type { UsageByNode, UsageByPurpose, UsagePurpose, UsageTotals } from '@/api/types';

/** The totals the cost-per-node view adds up. */
export interface NodeTotals {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  chargedUsd: number;
  costUsd: number;
  cacheHits: number;
}

export interface NodeCost {
  node: string;
  totals: NodeTotals;
  /** Per version, oldest first. */
  versions: Array<{ version: number | undefined; totals: NodeTotals }>;
}

function totalsOf(t: UsageTotals | undefined): NodeTotals {
  return {
    requests: t?.requests ?? 0,
    promptTokens: t?.prompt_tokens ?? 0,
    completionTokens: t?.completion_tokens ?? 0,
    chargedUsd: t?.charged_usd ?? 0,
    costUsd: t?.cost_usd ?? 0,
    cacheHits: t?.cache_hits ?? 0,
  };
}

function add(a: NodeTotals, b: NodeTotals): NodeTotals {
  return {
    requests: a.requests + b.requests,
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    chargedUsd: a.chargedUsd + b.chargedUsd,
    costUsd: a.costUsd + b.costUsd,
    cacheHits: a.cacheHits + b.cacheHits,
  };
}

const ZERO = totalsOf(undefined);

/**
 * `by_node` (totals per node version) grouped by node, the most charged
 * first. A subnode's calls are already counted under the run's root node.
 */
export function nodeCosts(byNode: readonly UsageByNode[] | undefined): NodeCost[] {
  const map = new Map<string, NodeCost>();
  for (const row of byNode ?? []) {
    const name = row.node ?? '';
    const t = totalsOf(row.totals);
    const cost = map.get(name) ?? { node: name, totals: ZERO, versions: [] };
    cost.totals = add(cost.totals, t);
    cost.versions.push({ version: row.node_version, totals: t });
    map.set(name, cost);
  }
  return [...map.values()]
    .map((c) => ({
      ...c,
      versions: [...c.versions].sort((a, b) => (a.version ?? 0) - (b.version ?? 0)),
    }))
    .sort((a, b) => b.totals.chargedUsd - a.totals.chargedUsd || a.node.localeCompare(b.node));
}

export const PURPOSE_LABEL: Record<UsagePurpose, string> = {
  'rag.ingest': 'Indexing documents',
  'rag.search': 'Retrieval queries',
};

export const PURPOSE_HINT: Record<UsagePurpose, string> = {
  'rag.ingest': "Embedding a collection's documents: Caliban's background work for the tenant.",
  'rag.search': "A node's retrieval: its query embedding and reranking.",
};

/** One row of the spend Caliban made on the tenant's behalf, by purpose. */
export interface PurposeCost {
  purpose: string;
  label: string;
  hint: string | undefined;
  totals: NodeTotals;
}

/** `by_purpose` as rows, known purposes first in their order, then any other. */
export function purposeCosts(byPurpose: readonly UsageByPurpose[] | undefined): PurposeCost[] {
  const known = Object.keys(PURPOSE_LABEL);
  return (byPurpose ?? [])
    .map((row) => {
      const purpose = row.purpose ?? '';
      const k = purpose as UsagePurpose;
      return {
        purpose,
        label: known.includes(purpose) ? PURPOSE_LABEL[k] : purpose,
        hint: known.includes(purpose) ? PURPOSE_HINT[k] : undefined,
        totals: totalsOf(row.totals),
      };
    })
    .sort((a, b) => {
      const ia = known.indexOf(a.purpose);
      const ib = known.indexOf(b.purpose);
      return (
        (ia < 0 ? known.length : ia) - (ib < 0 ? known.length : ib) ||
        a.purpose.localeCompare(b.purpose)
      );
    });
}
