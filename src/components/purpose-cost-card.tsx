import type { UsageByPurpose } from '@/api/types';
import { formatInt, formatUsd } from '@/lib/format';
import { purposeCosts } from '@/lib/usage';
import { Card, CardHeader, EmptyState, Table, TBody, TD, TH, THead, TR } from './ui';

/**
 * Retrieval spend: the embedding and rerank calls Caliban makes on the
 * tenant's behalf (`by_purpose`), separable from the tenant's own
 * /v1/embeddings calls. Covers raw and rolled-up days alike.
 */
export function PurposeCostCard({ byPurpose }: { byPurpose: UsageByPurpose[] | undefined }) {
  const rows = purposeCosts(byPurpose);
  return (
    <Card role="region" aria-label="Retrieval spend">
      <CardHeader
        title="Retrieval spend"
        description="Embedding and rerank calls Caliban makes for document collections, apart from the tenant's own embedding calls."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No retrieval calls"
          description="Indexing documents and node retrieval queries will appear here."
        />
      ) : (
        <Table label="Retrieval spend">
          <THead>
            <tr>
              <TH>Purpose</TH>
              <TH className="text-right">Requests</TH>
              <TH className="text-right">Tokens</TH>
              <TH className="text-right">Model cost</TH>
              <TH className="text-right">Charged</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.purpose}>
                <TD title={r.hint}>
                  {r.label}{' '}
                  <code className="font-mono text-[11.5px] text-fg-subtle">{r.purpose}</code>
                </TD>
                <TD className="text-right">{formatInt(r.totals.requests)}</TD>
                <TD className="text-right">
                  {formatInt(r.totals.promptTokens + r.totals.completionTokens)}
                </TD>
                <TD className="text-right text-fg-muted">{formatUsd(r.totals.costUsd)}</TD>
                <TD className="text-right font-medium">{formatUsd(r.totals.chargedUsd)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
