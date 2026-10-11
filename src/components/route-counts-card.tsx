import type { UsageReport } from '@/api/types';
import { formatInt } from '@/lib/format';
import { ROUTE_STAGE_LABEL } from '@/lib/labels';
import { Card, CardHeader, EmptyState, Table, TBody, TD, TH, THead, TR } from './ui';

type RouteCount = NonNullable<UsageReport['by_route']>[number];

const stageLabel = (s: string) =>
  s in ROUTE_STAGE_LABEL ? ROUTE_STAGE_LABEL[s as keyof typeof ROUTE_STAGE_LABEL] : s;

/**
 * How `caliban/auto` routed: requests per tenant, UTC day, intent, deciding
 * stage and fallback reason. Routing decisions reveal what requests are
 * about, so the control plane keeps only these daily counts, never the
 * decision of a single request, and does not compute them per node or run.
 */
export function RouteCountsCard({
  byRoute,
  filtered,
  tenantNames,
}: {
  byRoute: RouteCount[] | undefined;
  /** A node or run filter is set: the counts are not computed for it. */
  filtered: boolean;
  tenantNames?: Map<string, string>;
}) {
  const rows = [...(byRoute ?? [])].sort(
    (a, b) => b.day.localeCompare(a.day) || b.requests - a.requests,
  );
  return (
    <Card role="region" aria-label="Routing per day">
      <CardHeader
        title="Routing per day"
        description="Requests per day, intent, the stage that decided it and why a model answered instead of a node. Only these daily counts are kept: single requests carry no routing decision."
      />
      {filtered ? (
        <EmptyState
          title="Not counted per node or run"
          description="Clear the node and run filters to see the routing counts."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No routing counts"
          description="caliban/auto requests will be counted here."
        />
      ) : (
        <Table label="Routing per day">
          <THead>
            <tr>
              <TH>Day</TH>
              <TH>Tenant</TH>
              <TH>Intent</TH>
              <TH>Stage</TH>
              <TH>Fallback</TH>
              <TH className="text-right">Requests</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={`${r.tenant_id}|${r.day}|${r.intent}|${r.route_stage}|${r.route_fallback}`}>
                <TD className="whitespace-nowrap">{r.day}</TD>
                <TD className="max-w-40 truncate">
                  {tenantNames?.get(r.tenant_id) ?? r.tenant_id}
                </TD>
                <TD className="font-mono text-[12px]">{r.intent || 'none'}</TD>
                <TD>{r.route_stage ? stageLabel(r.route_stage) : 'none'}</TD>
                <TD className="font-mono text-[12px] text-fg-muted">
                  {r.route_fallback || 'none'}
                </TD>
                <TD className="text-right tabular-nums">{formatInt(r.requests)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
