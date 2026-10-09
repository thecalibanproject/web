import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useMemo } from 'react';
import { tenantsQuery, usageQuery } from '@/api/queries';
import { CACHE_STATUSES, type CacheStatus } from '@/api/types';
import { TenantFilter } from '@/components/tenant-select';
import { UsageTable } from '@/components/usage-table';
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, Select } from '@/components/ui';
import { formatCompact, formatInt, formatUsd } from '@/lib/format';

const route = getRouteApi('/_app/usage');
const LIMITS = [100, 250, 500, 1000] as const;

export function UsagePage() {
  const search = route.useSearch();
  const { tenant, cache } = search;
  const limit = search.limit ?? 100;
  const navigate = route.useNavigate();
  const usage = useQuery(usageQuery(tenant, limit));
  const tenants = useQuery(tenantsQuery());
  const names = useMemo(
    () => new Map((tenants.data ?? []).map((t) => [t.id, t.name])),
    [tenants.data],
  );

  // The API filters by tenant; cache status is filtered client-side.
  const events = useMemo(
    () => (usage.data?.events ?? []).filter((e) => !cache || e.cache === cache),
    [usage.data, cache],
  );

  const setSearch = (patch: Partial<typeof search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const t = usage.data?.totals;

  return (
    <>
      <PageHeader
        title="Usage"
        description="Per-request events: tokens, cache outcome, PII entities, cost and latency."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
          <TenantFilter value={tenant} onChange={(v) => setSearch({ tenant: v })} />
          <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            Cache
            <Select
              value={cache ?? ''}
              onChange={(e) =>
                setSearch({ cache: (e.target.value || undefined) as CacheStatus | undefined })
              }
              className="w-32"
            >
              <option value="">All</option>
              {CACHE_STATUSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            Last
            <Select
              value={String(limit)}
              onChange={(e) => setSearch({ limit: Number(e.target.value) })}
              className="w-24"
            >
              {LIMITS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </label>
          {t && (
            <p className="ml-auto text-[12px] text-fg-muted" aria-live="polite">
              {formatInt(events.length)} shown · {formatInt(t.requests)} requests ·{' '}
              {formatCompact(t.tokens_saved)} tokens saved · {formatUsd(t.cost_usd)}
            </p>
          )}
        </div>
        {usage.isPending ? (
          <LoadingState rows={8} />
        ) : usage.isError ? (
          <ErrorState error={usage.error} onRetry={() => void usage.refetch()} />
        ) : events.length === 0 ? (
          <EmptyState
            title={usage.data.events.length === 0 ? 'No usage yet' : 'No events match'}
            description={
              usage.data.events.length === 0
                ? 'Requests to the data plane will appear here.'
                : 'Try a different cache status or tenant.'
            }
          />
        ) : (
          <UsageTable events={events} tenantNames={names} />
        )}
      </Card>
    </>
  );
}
