import type { UsageReport } from '@/api/types';
import { formatInt, formatUsd } from '@/lib/format';
import { Card, CardHeader, StatTile } from './ui';

/**
 * Billing and margin on `caliban/auto` requests: what was billed (the flat
 * auto price, discounted when a cache tier answered), the full flat price,
 * what cache hits saved, and what the routed models actually cost. Totals
 * cover the events that carry both prices. Servers from before cache-hit
 * billing send no `billed_usd`; they billed the flat price.
 */
export function AutoMarginCard({ totals }: { totals: UsageReport['totals'] }) {
  const margin = totals.margin_usd;
  const flat = totals.flat_price_usd ?? 0;
  const billed = totals.billed_usd ?? flat;
  const hits = totals.auto_cache_hits ?? 0;
  return (
    <Card role="region" aria-label="caliban/auto margin">
      <CardHeader
        title={
          <>
            <code className="font-mono">caliban/auto</code> billing and margin
          </>
        }
        description={`${formatInt(totals.auto_requests ?? 0)} requests asked for caliban/auto, ${formatInt(hits)} answered from cache`}
      />
      <dl className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="Billed"
          value={formatUsd(billed)}
          detail="Flat price, discounted on cache hits"
        />
        <StatTile
          label="Flat price"
          value={formatUsd(flat)}
          detail="Full auto rate for the same tokens"
        />
        <StatTile
          label="Cache-hit savings"
          value={formatUsd(totals.auto_saved_usd ?? 0)}
          detail={`${formatInt(hits)} cache ${hits === 1 ? 'hit' : 'hits'} at the discounted price`}
        />
        <StatTile
          label="Routed model cost"
          value={formatUsd(totals.routed_model_cost_usd ?? 0)}
          detail="What the chosen models cost"
        />
        <StatTile
          label="Margin"
          value={
            <span className={margin != null && margin < 0 ? 'text-danger' : undefined}>
              {formatUsd(margin ?? 0)}
            </span>
          }
          detail="Billed minus routed model cost"
        />
      </dl>
      <p className="px-4 pb-3 text-[12px] text-fg-subtle">
        Covers requests that carry both prices. A cache hit calls no model and is billed a share of
        the flat price: 20% unless the deployment or the tenant sets another share.
      </p>
    </Card>
  );
}
