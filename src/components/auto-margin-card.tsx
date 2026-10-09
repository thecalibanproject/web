import type { UsageReport } from '@/api/types';
import { formatInt, formatUsd } from '@/lib/format';
import { Card, CardHeader, StatTile } from './ui';

/**
 * Margin on `caliban/auto` requests: the flat auto price charged for their
 * tokens against what the routed models actually cost. Totals cover the
 * events that carry both prices.
 */
export function AutoMarginCard({ totals }: { totals: UsageReport['totals'] }) {
  const margin = totals.margin_usd;
  return (
    <Card role="region" aria-label="caliban/auto margin">
      <CardHeader
        title={
          <>
            <code className="font-mono">caliban/auto</code> margin
          </>
        }
        description={`${formatInt(totals.auto_requests ?? 0)} requests asked for caliban/auto`}
      />
      <dl className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <StatTile
          label="Flat price"
          value={formatUsd(totals.flat_price_usd ?? 0)}
          detail="Auto rate for the same tokens"
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
          detail="Flat price minus routed model cost"
        />
      </dl>
      <p className="px-4 pb-3 text-[12px] text-fg-subtle">
        Covers requests that carry both prices. Cache hits are not charged yet.
      </p>
    </Card>
  );
}
