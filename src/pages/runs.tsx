import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useMemo, useState, type FormEvent } from 'react';
import { usePermissions } from '@/api/auth';
import { nodesQuery, runsQuery, tenantsQuery } from '@/api/queries';
import { RUN_STATUSES } from '@/api/types';
import { RunStatusBadge } from '@/components/runs/run-badges';
import { TenantSelect } from '@/components/tenant-select';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import { formatDateTime, formatMs, formatUsd } from '@/lib/format';
import {
  elapsedMs,
  isRunStatusFilter,
  RUN_SINCE,
  RUN_SINCE_LABEL,
  RUN_STATUS_LABEL,
  type RunSince,
} from '@/lib/runs';

const route = getRouteApi('/_app/runs');

export function RunsPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const perms = usePermissions();
  const tenants = useQuery(tenantsQuery());
  const readable = perms.tenantsWith('runs.read');
  const firstReadable = tenants.data?.find(
    (t) => readable === 'all' || readable.includes(t.id),
  )?.id;
  const tenantId = search.tenant ?? firstReadable;
  const { node, version, status, since } = search;

  const runs = useInfiniteQuery({
    ...runsQuery(tenantId ?? '', { node, status, since }),
    enabled: Boolean(tenantId),
  });
  const nodes = useQuery({ ...nodesQuery(tenantId), enabled: Boolean(tenantId) });
  const nodeNames = useMemo(
    () =>
      [...new Set([...(nodes.data ?? []).map((n) => n.name), node ?? ''])].filter(Boolean).sort(),
    [nodes.data, node],
  );
  const [versionText, setVersionText] = useState(version ? String(version) : '');

  const setSearch = (patch: Partial<typeof search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const loaded = useMemo(() => runs.data?.pages.flatMap((p) => p.data) ?? [], [runs.data]);
  // The run list API has no version filter: the version is filtered here, on what is loaded.
  const rows = useMemo(
    () => (version ? loaded.filter((r) => r.version === version) : loaded),
    [loaded, version],
  );

  const applyVersion = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(versionText.trim());
    setSearch({ version: Number.isInteger(n) && n > 0 ? n : undefined });
  };

  const filtered = Boolean(node || version || status || since);

  return (
    <>
      <PageHeader
        title="Runs"
        description="Node runs, newest first: status, cost and who started them. Open a run for its step timeline."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
          <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            Tenant
            <TenantSelect
              value={tenantId}
              permission="runs.read"
              className="w-52"
              onChange={(t) => setSearch({ tenant: t, node: undefined, version: undefined })}
            />
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            Node
            <Select
              value={node ?? ''}
              onChange={(e) => setSearch({ node: e.target.value || undefined })}
              className="w-40"
            >
              <option value="">All nodes</option>
              {nodeNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
          <form
            onSubmit={applyVersion}
            className="flex items-center gap-1.5"
            aria-label="Version filter"
          >
            <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
              Version
              <Input
                value={versionText}
                onChange={(e) => setVersionText(e.target.value)}
                inputMode="numeric"
                placeholder="Any"
                title="Filters the runs loaded so far: the run list API has no version filter."
                className="w-20"
              />
            </label>
            <Button size="sm" type="submit">
              Apply
            </Button>
          </form>
          <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            Status
            <Select
              value={status ?? ''}
              onChange={(e) =>
                setSearch({
                  status: isRunStatusFilter(e.target.value) ? e.target.value : undefined,
                })
              }
              className="w-48"
            >
              <option value="">Any status</option>
              <option value="active">Not ended</option>
              {RUN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RUN_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            Started
            <Select
              value={since ?? ''}
              onChange={(e) =>
                setSearch({ since: (e.target.value || undefined) as RunSince | undefined })
              }
              className="w-36"
            >
              <option value="">Any time</option>
              {RUN_SINCE.map((r) => (
                <option key={r} value={r}>
                  {RUN_SINCE_LABEL[r]}
                </option>
              ))}
            </Select>
          </label>
          {filtered && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setVersionText('');
                setSearch({
                  node: undefined,
                  version: undefined,
                  status: undefined,
                  since: undefined,
                });
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
        {!tenantId ? (
          tenants.isPending ? (
            <LoadingState rows={2} />
          ) : tenants.isError ? (
            <ErrorState error={tenants.error} onRetry={() => void tenants.refetch()} />
          ) : (
            <EmptyState
              title="No tenant to show"
              description="Runs are kept per tenant. Your roles do not cover a tenant with runs yet."
            />
          )
        ) : runs.isPending ? (
          <LoadingState rows={6} />
        ) : runs.isError ? (
          <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={filtered ? 'No runs match' : 'No runs yet'}
            description={
              filtered
                ? version && runs.hasNextPage
                  ? `No run of v${version} among the runs loaded so far. Load older runs to look further.`
                  : 'Try another node, version, status or time range.'
                : 'Runs of published nodes appear here, from the API, MCP or caliban/auto.'
            }
            action={
              version && runs.hasNextPage ? (
                <Button
                  size="sm"
                  loading={runs.isFetchingNextPage}
                  onClick={() => void runs.fetchNextPage()}
                >
                  Load older runs
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table label="Runs">
              <THead>
                <tr>
                  <TH>Run</TH>
                  <TH>Node</TH>
                  <TH>Status</TH>
                  <TH>Started by</TH>
                  <TH className="text-right">Cost</TH>
                  <TH>Created</TH>
                  <TH className="text-right">Duration</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const ms = elapsedMs(r.created_at, r.finished_at);
                  return (
                    <TR key={r.id}>
                      <TD className="whitespace-nowrap">
                        <Link
                          to="/runs/$tenantId/$runId"
                          params={{ tenantId, runId: r.id }}
                          className="font-mono text-[12px] text-accent hover:underline"
                        >
                          {r.id}
                        </Link>
                      </TD>
                      <TD className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-mono">{r.node}</span>
                          <Badge>v{r.version}</Badge>
                        </span>
                      </TD>
                      <TD className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <RunStatusBadge status={r.status} />
                          {r.awaiting_step && (
                            <code className="font-mono text-[11.5px] text-fg-muted">
                              {r.awaiting_step}
                            </code>
                          )}
                        </span>
                      </TD>
                      <TD
                        className="max-w-56 truncate font-mono text-[12px] text-fg-muted"
                        title={r.origin ? `${r.invoker} (${r.origin})` : r.invoker}
                      >
                        {r.invoker}
                      </TD>
                      <TD className="text-right whitespace-nowrap tabular-nums">
                        {formatUsd(r.cost_usd)}
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">
                        {formatDateTime(r.created_at)}
                      </TD>
                      <TD className="text-right whitespace-nowrap text-fg-muted tabular-nums">
                        {ms != null ? formatMs(ms) : r.finished_at ? '-' : 'not ended'}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            {runs.hasNextPage && (
              <div className="flex justify-center border-t border-border p-3">
                <Button
                  size="sm"
                  loading={runs.isFetchingNextPage}
                  onClick={() => void runs.fetchNextPage()}
                >
                  Load older runs
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
