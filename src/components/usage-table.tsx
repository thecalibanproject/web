import type { UsageEvent } from '@/api/types';
import { formatDateTime, formatInt, formatMs, formatUsd } from '@/lib/format';
import { CacheBadge } from './badges';
import { Table, TBody, TD, TH, THead, TR } from './ui';

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
          <TH>Model</TH>
          {!compact && <TH>Intent</TH>}
          <TH className="text-right">Prompt</TH>
          <TH className="text-right">Completion</TH>
          {!compact && <TH className="text-right">Cached</TH>}
          {!compact && <TH className="text-right">Saved</TH>}
          <TH>Cache</TH>
          {!compact && <TH className="text-right">PII</TH>}
          <TH className="text-right">Cost</TH>
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
            <TD className="max-w-56 truncate font-mono text-[12px]" title={e.model}>
              {e.model}
            </TD>
            {!compact && (
              <TD className="max-w-40 truncate text-fg-muted" title={e.intent}>
                {e.intent ?? '—'}
              </TD>
            )}
            <TD className="text-right">{formatInt(e.prompt_tokens)}</TD>
            <TD className="text-right">{formatInt(e.completion_tokens)}</TD>
            {!compact && <TD className="text-right">{formatInt(e.cached_prompt_tokens ?? 0)}</TD>}
            {!compact && <TD className="text-right">{formatInt(e.tokens_saved ?? 0)}</TD>}
            <TD>
              <CacheBadge cache={e.cache} />
            </TD>
            {!compact && <TD className="text-right">{formatInt(e.pii_entities ?? 0)}</TD>}
            <TD className="text-right">{formatUsd(e.cost_usd)}</TD>
            <TD className="text-right whitespace-nowrap">{formatMs(e.latency_ms)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
