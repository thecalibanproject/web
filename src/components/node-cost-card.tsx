import type { UsageByNode } from '@/api/types';
import { formatInt, formatUsd } from '@/lib/format';
import { nodeCosts } from '@/lib/usage';
import { Card, CardHeader, EmptyState, Table, TBody, TD, TH, THead, TR } from './ui';

/**
 * What each node's runs cost: `by_node` from the usage report (every model
 * call a run makes is metered as usual and carries its node), per node with
 * its versions. Covers all recorded usage, including days rolled up after the
 * raw retention, not only the events listed below it.
 */
export function NodeCostCard({
  byNode,
  selected,
  onSelect,
}: {
  byNode: UsageByNode[] | undefined;
  selected: string | undefined;
  onSelect: (node: string | undefined) => void;
}) {
  const costs = nodeCosts(byNode);
  return (
    <Card role="region" aria-label="Cost per node">
      <CardHeader
        title="Cost per node"
        description="Model calls made by node runs, per node and version. Charged is what the customer is charged: the caliban/auto price (discounted on cache hits), or the model's cost."
      />
      {costs.length === 0 ? (
        <EmptyState
          title="No node calls"
          description={
            selected
              ? `No usage recorded for ${selected}.`
              : 'Node runs will appear here once a published node makes model calls.'
          }
        />
      ) : (
        <Table label="Cost per node">
          <THead>
            <tr>
              <TH>Node</TH>
              <TH>Versions</TH>
              <TH className="text-right">Requests</TH>
              <TH className="text-right">Tokens</TH>
              <TH className="text-right">Cache hits</TH>
              <TH className="text-right">Model cost</TH>
              <TH className="text-right">Charged</TH>
            </tr>
          </THead>
          <TBody>
            {costs.map((c) => (
              <TR key={c.node}>
                <TD>
                  <button
                    type="button"
                    aria-pressed={selected === c.node}
                    title={selected === c.node ? 'Show every node' : `Only ${c.node}'s events`}
                    onClick={() => onSelect(selected === c.node ? undefined : c.node)}
                    className="font-mono text-[12.5px] font-medium hover:text-accent hover:underline aria-pressed:text-accent"
                  >
                    {c.node}
                  </button>
                </TD>
                <TD className="text-[12px] text-fg-muted">
                  {c.versions
                    .map((v) => `v${v.version ?? '?'} ${formatUsd(v.totals.chargedUsd)}`)
                    .join(' · ')}
                </TD>
                <TD className="text-right">{formatInt(c.totals.requests)}</TD>
                <TD className="text-right">
                  {formatInt(c.totals.promptTokens + c.totals.completionTokens)}
                </TD>
                <TD className="text-right">{formatInt(c.totals.cacheHits)}</TD>
                <TD className="text-right text-fg-muted">{formatUsd(c.totals.costUsd)}</TD>
                <TD className="text-right font-medium">{formatUsd(c.totals.chargedUsd)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
