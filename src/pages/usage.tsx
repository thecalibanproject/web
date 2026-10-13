import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useMemo, useState, type FormEvent } from 'react';
import { usePermissions } from '@/api/auth';
import { tenantsQuery, usageQuery } from '@/api/queries';
import { CACHE_STATUSES, CACHE_TIERS, type CacheStatus, type CacheTier } from '@/api/types';
import { AutoMarginCard } from '@/components/auto-margin-card';
import { NodeCostCard } from '@/components/node-cost-card';
import { PurposeCostCard } from '@/components/purpose-cost-card';
import { RouteCountsCard } from '@/components/route-counts-card';
import { LearnMore } from '@/components/help/learn-more';
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
  StatTile,
} from '@/components/ui';
import { doc } from '@/lib/docs';
import { formatCompact, formatInt, formatUsd } from '@/lib/format';
import { CACHE_TIER_LABEL } from '@/lib/labels';
import { useWorkspace } from '@/lib/workspace';

/** `?tenant=all`: every workspace, for deployment-wide roles. */
const ALL = 'all';

const CACHE_LABEL: Record<CacheStatus, string> = {
  hit: 'Reused',
  miss: 'New answer',
  bypass: 'Not cached',
};

const route = getRouteApi('/_app/usage');
const LIMITS = [100, 250, 500, 1000] as const;

export function UsagePage() {
  const search = route.useSearch();
  const { cache, tier, node, run } = search;
  const limit = search.limit ?? 100;
  const navigate = route.useNavigate();
  const perms = usePermissions();
  const ws = useWorkspace();
  // Deployment-wide roles may look across every workspace; everyone else
  // sees the header's workspace (or a ?tenant= deep link).
  const canAll = perms.tenantsWith('usage.read') === 'all';
  const all = canAll && search.tenant === ALL;
  const tenant = all ? undefined : search.tenant && search.tenant !== ALL ? search.tenant : ws.id;
  const usage = useQuery({
    ...usageQuery(tenant, limit, { node, runId: run }),
    enabled: all || Boolean(tenant) || !ws.isPending,
  });
  const operator = perms.canSomewhere('catalog.write');
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
        title="Usage and costs"
        description={
          <>
            What was asked of which model, what it cost, and how much reusing answers saved.{' '}
            <LearnMore doc={doc('guides/usage-and-costs', 'usage')} />
          </>
        }
      />
      {usage.isSuccess && (
        <div className="mb-6 flex flex-col gap-6">
          <section aria-labelledby="usage-totals-h">
            <h2 id="usage-totals-h" className="sr-only">
              Totals
            </h2>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile
                label="Charged to your budget"
                value={formatUsd(t?.charged_usd ?? t?.cost_usd)}
                detail="Enforced before every model call"
              />
              <StatTile label="Requests" value={formatInt(t?.requests)} />
              <StatTile
                label="Answers reused"
                value={formatInt(t?.cache_hits ?? 0)}
                detail="Served again without calling a model"
              />
              <StatTile
                label="Tokens saved"
                value={formatCompact(t?.tokens_saved)}
                detail={
                  <>
                    {t?.saved_usd != null ? `${formatUsd(t.saved_usd)} saved. ` : ''}
                    <LearnMore doc={doc('concepts/caching')}>How reuse works</LearnMore>
                  </>
                }
              />
            </dl>
          </section>
          {operator && <AutoMarginCard totals={usage.data.totals} />}
          <NodeCostCard
            byNode={usage.data.by_node}
            selected={node}
            onSelect={(n) => setSearch({ node: n })}
          />
          <PurposeCostCard byPurpose={usage.data.by_purpose} />
          <RouteCountsCard
            byRoute={usage.data.by_route}
            filtered={Boolean(node || run)}
            tenantNames={names}
          />
        </div>
      )}
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
          {canAll && (
            <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
              Workspaces
              <Select
                value={all ? ALL : ''}
                onChange={(e) => setSearch({ tenant: e.target.value || undefined })}
                className="w-44"
              >
                <option value="">{ws.workspace?.name ?? 'This workspace'}</option>
                <option value={ALL}>All workspaces</option>
              </Select>
            </label>
          )}
          <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            Answer
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
                  {CACHE_LABEL[c]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            Reuse
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
            Assistant
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
          <form
            onSubmit={applyRun}
            className="flex items-center gap-1.5"
            aria-label="Conversation filter"
          >
            <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
              Conversation
              <Input
                value={runText}
                onChange={(e) => setRunText(e.target.value)}
                placeholder="Conversation id"
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
                Clear
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
              {formatInt(t.cache_hits ?? 0)} reused ({formatInt(t.semantic_cache_hits ?? 0)}{' '}
              similar) · {formatCompact(t.tokens_saved)} tokens saved
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
            title={usage.data.events.length === 0 ? 'No usage yet' : 'No requests match'}
            description={
              usage.data.events.length === 0
                ? 'Requests sent through Caliban appear here, with their cost.'
                : 'Try another answer, reuse, assistant, conversation or workspace.'
            }
            action={
              usage.data.events.length === 0 && (
                <Link to="/settings" className="font-medium text-accent hover:underline">
                  Copy a snippet
                </Link>
              )
            }
            learnMore={
              usage.data.events.length === 0
                ? doc('start/gateway-quickstart', 'see-the-request')
                : undefined
            }
          />
        ) : (
          <UsageTable events={events} tenantNames={names} />
        )}
      </Card>
    </>
  );
}
