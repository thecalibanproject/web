import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { tenantsQuery, usageQuery } from '@/api/queries';
import { UsageTable } from '@/components/usage-table';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatTile,
} from '@/components/ui';
import { formatCompact, formatInt, formatPercent, formatUsd } from '@/lib/format';

const RECENT = 15;

export function OverviewPage() {
  const usage = useQuery(usageQuery(undefined, 100));
  const tenants = useQuery(tenantsQuery());
  const names = useMemo(
    () => new Map((tenants.data ?? []).map((t) => [t.id, t.name])),
    [tenants.data],
  );
  const totals = usage.data?.totals;
  const tokens = (totals?.prompt_tokens ?? 0) + (totals?.completion_tokens ?? 0);
  const hitRate = totals?.requests ? (totals.cache_hits ?? 0) / totals.requests : null;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Traffic, cache efficiency and spend across all tenants."
      />

      <section aria-labelledby="totals-h" className="mb-6">
        <h2 id="totals-h" className="sr-only">
          Totals
        </h2>
        {usage.isError ? (
          <ErrorState error={usage.error} onRetry={() => void usage.refetch()} className="m-0" />
        ) : (
          <dl
            className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
            aria-busy={usage.isPending}
          >
            <StatTile
              label="Requests"
              value={usage.isPending ? '…' : formatInt(totals?.requests)}
            />
            <StatTile
              label="Tokens"
              value={usage.isPending ? '…' : formatCompact(tokens)}
              detail={
                totals
                  ? `${formatCompact(totals.prompt_tokens)} in · ${formatCompact(totals.completion_tokens)} out`
                  : undefined
              }
            />
            <StatTile
              label="Cache hits"
              value={usage.isPending ? '…' : formatInt(totals?.cache_hits)}
              detail={hitRate != null ? `${formatPercent(hitRate)} hit rate` : undefined}
            />
            <StatTile
              label="Tokens saved"
              value={usage.isPending ? '…' : formatCompact(totals?.tokens_saved)}
              detail="Cache + prompt-cache steering"
            />
            <StatTile
              label="Cost"
              value={usage.isPending ? '…' : formatUsd(totals?.cost_usd)}
              detail="Provider list price, BYOK"
            />
          </dl>
        )}
      </section>

      <Card>
        <CardHeader
          title="Recent requests"
          description={`Latest ${RECENT} events`}
          actions={
            <Link to="/usage" className="text-[12.5px] text-accent hover:underline">
              View all usage
            </Link>
          }
        />
        {usage.isPending ? (
          <LoadingState rows={6} />
        ) : usage.isError ? (
          <EmptyState title="No data" description="Usage could not be loaded." />
        ) : usage.data.events.length === 0 ? (
          <EmptyState
            title="No requests yet"
            description="Point an OpenAI SDK at the data plane (see Settings) and requests will show up here."
          />
        ) : (
          <UsageTable events={usage.data.events.slice(0, RECENT)} tenantNames={names} compact />
        )}
      </Card>
    </>
  );
}
