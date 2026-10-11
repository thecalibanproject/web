import type { UsageEvent } from '@/api/types';
import { formatDateTime, formatInt, formatMs, formatUsd } from '@/lib/format';
import { CacheBadge, CacheTierBadge } from './badges';
import { Table, TBody, TD, TH, THead, TR } from './ui';

/**
 * Requested model (e.g. `caliban/auto`) → routed model. A pinned request that
 * was served by the model it named shows the model once. How the intent was
 * decided is not kept per event (routing decisions are content-class): see
 * the daily routing counts.
 */
function RouteCell({ event: e }: { event: UsageEvent }) {
  const requested = e.requested_model && e.requested_model !== e.model ? e.requested_model : null;
  return (
    <TD className="max-w-72">
      <span className="flex min-w-0 items-center gap-1 font-mono text-[12px]">
        {requested && (
          <>
            <span className="truncate text-fg-muted" title={requested}>
              {requested}
            </span>
            <span aria-hidden="true" className="text-fg-subtle">
              →
            </span>
            <span className="sr-only">routed to</span>
          </>
        )}
        <span className="truncate" title={e.model}>
          {e.model}
        </span>
      </span>
    </TD>
  );
}

/**
 * What a `caliban/auto` request was billed (`billed_usd`, or the flat price
 * on events from before cache-hit billing). On a cache hit, the full flat
 * price and the saving are shown under it. Other requests have no billed
 * amount; a priced cache hit still shows the model cost it saved.
 */
function BilledCell({ event: e }: { event: UsageEvent }) {
  const billed = e.billed_usd ?? e.flat_price_usd;
  const discounted = e.cache === 'hit' && e.flat_price_usd != null && billed != null;
  return (
    <TD className="text-right whitespace-nowrap">
      {formatUsd(billed)}
      {discounted ? (
        <span
          className="block text-[11.5px] text-fg-subtle"
          title={`Cache hit: billed ${formatUsd(billed)} of the ${formatUsd(e.flat_price_usd)} flat price`}
        >
          of {formatUsd(e.flat_price_usd)}
          {e.saved_usd != null && `, saved ${formatUsd(e.saved_usd)}`}
        </span>
      ) : (
        e.saved_usd != null && (
          <span className="block text-[11.5px] text-fg-subtle">saved {formatUsd(e.saved_usd)}</span>
        )
      )}
    </TD>
  );
}

export function UsageTable({
  events,
  compact = false,
  tenantNames,
}: {
  events: UsageEvent[];
  compact?: boolean;
  tenantNames?: ReadonlyMap<string, string>;
}) {
  return (
    <Table label="Usage events">
      <THead>
        <tr>
          <TH>Time</TH>
          {!compact && <TH>Request</TH>}
          <TH>Tenant</TH>
          {!compact && <TH>Node</TH>}
          {compact ? <TH>Model</TH> : <TH>Route</TH>}
          <TH className="text-right">Prompt</TH>
          <TH className="text-right">Completion</TH>
          {!compact && <TH className="text-right">Cached</TH>}
          {!compact && <TH className="text-right">Saved</TH>}
          <TH>Cache</TH>
          {!compact && <TH>Cache tier</TH>}
          {!compact && <TH className="text-right">PII</TH>}
          <TH className="text-right">Cost</TH>
          {!compact && <TH className="text-right">Billed</TH>}
          <TH className="text-right">Latency</TH>
        </tr>
      </THead>
      <TBody>
        {events.map((e) => (
          <TR key={e.request_id}>
            <TD className="whitespace-nowrap text-fg-muted">{formatDateTime(e.ts)}</TD>
            {!compact && (
              <TD
                className="max-w-40 truncate font-mono text-[12px] text-fg-muted"
                title={e.request_id}
              >
                {e.request_id}
              </TD>
            )}
            <TD className="max-w-40 truncate" title={e.tenant_id}>
              {tenantNames?.get(e.tenant_id) ?? (
                <span className="font-mono text-[12px]">{e.tenant_id}</span>
              )}
            </TD>
            {!compact && (
              <TD className="whitespace-nowrap" title={e.run_id ? `Run ${e.run_id}` : undefined}>
                {e.node ? (
                  <span className="font-mono text-[12px]">
                    {e.node}
                    {e.node_version != null && (
                      <span className="text-fg-subtle"> v{e.node_version}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-fg-subtle">—</span>
                )}
              </TD>
            )}
            {compact ? (
              <TD className="max-w-56 truncate font-mono text-[12px]" title={e.model}>
                {e.model}
              </TD>
            ) : (
              <RouteCell event={e} />
            )}
            <TD className="text-right">{formatInt(e.prompt_tokens)}</TD>
            <TD className="text-right">{formatInt(e.completion_tokens)}</TD>
            {!compact && <TD className="text-right">{formatInt(e.cached_prompt_tokens ?? 0)}</TD>}
            {!compact && <TD className="text-right">{formatInt(e.tokens_saved ?? 0)}</TD>}
            <TD>
              <CacheBadge cache={e.cache} />
            </TD>
            {!compact && (
              <TD>
                {e.cache_tier ? (
                  <CacheTierBadge tier={e.cache_tier} />
                ) : (
                  <span className="text-fg-subtle">—</span>
                )}
              </TD>
            )}
            {!compact && <TD className="text-right">{formatInt(e.pii_entities ?? 0)}</TD>}
            <TD className="text-right">{formatUsd(e.cost_usd)}</TD>
            {!compact && <BilledCell event={e} />}
            <TD className="text-right whitespace-nowrap">{formatMs(e.latency_ms)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
