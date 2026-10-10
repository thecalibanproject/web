import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useMemo, useState, type FormEvent } from 'react';
import { tenantsQuery, usageQuery } from '@/api/queries';
import { CACHE_STATUSES, CACHE_TIERS, type CacheStatus, type CacheTier } from '@/api/types';
import { AutoMarginCard } from '@/components/auto-margin-card';
import { NodeCostCard } from '@/components/node-cost-card';
import { TenantFilter } from '@/components/tenant-select';
import { UsageTable } from '@/components/usage-table';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
} from '@/components/ui';
import { formatCompact, formatInt, formatUsd } from '@/lib/format';
import { CACHE_TIER_LABEL } from '@/lib/labels';

const route = getRouteApi('/_app/usage');
const LIMITS = [100, 250, 500, 1000] as const;

export function UsagePage() {
  const search = route.useSearch();
  const { tenant, cache, tier, node, run } = search;
  const limit = search.limit ?? 100;
  const navigate = route.useNavigate();
  const usage = useQuery(usageQuery(tenant, limit, { node, runId: run }));
  // Node names to filter by: the nodes with usage, and the one filtered on.
  const nodeNames = useMemo(
    () =>
      [...new Set([...(usage.data?.by_node ?? []).map((b) => b.node ?? ''), node ?? ''])]
        .filter(Boolean)
        .sort(),
    [usage.data, node],
  );
  const [runText, setRunText] = useState(run ?? '');
  const tenants = useQuery(tenantsQuery());
  const names = useMemo(
    () => new Map((tenants.data ?? []).map((t) => [t.id, t.name])),
    [tenants.data],
  );

  // The API filters by tenant; cache status and tier are filtered client-side.
  const events = useMemo(
    () =>
      (usage.data?.events ?? []).filter(
        (e) => (!cache || e.cache === cache) && (!tier || e.cache_tier === tier),
      ),
    [usage.data, cache, tier],
  );

  const setSearch = (patch: Partial<typeof search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const t = usage.data?.totals;

  const applyRun = (e: FormEvent) => {
    e.preventDefault();
    setSearch({ run: runText.trim() || undefined });
  };

  return (
    <>
      <PageHeader
        title="Usage"
        description="Per-request events: routing, tokens, cache outcome, PII entities, cost and latency. Model calls made by node runs carry their node and run."
      />
      {usage.isSuccess && (
        <div className="mb-6 flex flex-col gap-6">
          <AutoMarginCard totals={usage.data.totals} />
          <NodeCostCard
            byNode={usage.data.by_node}
            selected={node}
            onSelect={(n) => setSearch({ node: n })}
          />
        </div>
      )}
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
            Cache tier
            <Select
              value={tier ?? ''}
              onChange={(e) =>
                setSearch({ tier: (e.target.value || undefined) as CacheTier | undefined })
              }
              className="w-32"
            >
              <option value="">All</option>
              {CACHE_TIERS.map((t) => (
                <option key={t} value={t}>
                  {CACHE_TIER_LABEL[t]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            Node
            <Select
              value={node ?? ''}
              onChange={(e) => setSearch({ node: e.target.value || undefined })}
              className="w-40"
            >
              <option value="">All requests</option>
              {nodeNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
          <form onSubmit={applyRun} className="flex items-center gap-1.5" aria-label="Run filter">
            <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
              Run
              <Input
                value={runText}
                onChange={(e) => setRunText(e.target.value)}
                placeholder="Run id"
                title="Run ids cover raw events only: days rolled up after the usage retention keep no run ids."
                spellCheck={false}
                className="w-44 font-mono text-[12px]"
              />
            </label>
            <Button size="sm" type="submit">
              Apply
            </Button>
            {run && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRunText('');
                  setSearch({ run: undefined });
                }}
              >
                Clear run
              </Button>
            )}
          </form>
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
              {formatInt(t.cache_hits ?? 0)} cache hits ({formatInt(t.semantic_cache_hits ?? 0)}{' '}
              semantic) · {formatCompact(t.tokens_saved)} tokens saved
              {t.saved_usd != null && ` (${formatUsd(t.saved_usd)})`} · {formatUsd(t.cost_usd)}
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
                : 'Try a different cache status, cache tier, node, run or tenant.'
            }
          />
        ) : (
          <UsageTable events={events} tenantNames={names} />
        )}
      </Card>
    </>
  );
}
