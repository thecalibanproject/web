import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useMemo, useState, type FormEvent } from 'react';
import { nodesQuery, runsQuery } from '@/api/queries';
import { RUN_STATUSES } from '@/api/types';
import { RunStatusBadge } from '@/components/runs/run-badges';
import {
  Badge,
  Button,
  Card,
  Checkbox,
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
import { doc } from '@/lib/docs';
import { EMPTY, formatDateTime, formatMs, formatUsd } from '@/lib/format';
import {
  elapsedMs,
  isRunStatusFilter,
  isTestRun,
  RUN_SINCE,
  RUN_SINCE_LABEL,
  RUN_STATUS_LABEL,
  startedBy,
  type RunSince,
  stepName,
} from '@/lib/runs';
import { useWorkspace } from '@/lib/workspace';

const route = getRouteApi('/_app/runs');

export function RunsPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const ws = useWorkspace();
  // The header's workspace; a ?tenant= deep link wins (and switches the header).
  const tenantId = search.tenant ?? ws.id;
  const [hideTests, setHideTests] = useState(true);
  const { node, version, status, since } = search;

  const runs = useInfiniteQuery({
    ...runsQuery(tenantId ?? '', { node, version, status, since }),
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

  const all = useMemo(() => runs.data?.pages.flatMap((p) => p.data) ?? [], [runs.data]);
  const rows = hideTests ? all.filter((r) => !isTestRun(r.origin)) : all;
  const hidden = all.length - rows.length;

  const applyVersion = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(versionText.trim());
    setSearch({ version: Number.isInteger(n) && n > 0 ? n : undefined });
  };

  const filtered = Boolean(node || version || status || since);

  return (
    <>
      <PageHeader
        title="Conversations"
        description="Every request an assistant handled, newest first: how it ended, what it cost and who started it. Open one to read its steps."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
          <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            Assistant
            <Select
              value={node ?? ''}
              onChange={(e) => setSearch({ node: e.target.value || undefined })}
              className="w-40"
            >
              <option value="">All assistants</option>
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
          <Checkbox
            label="Hide test runs"
            checked={hideTests}
            onChange={(e) => setHideTests(e.target.checked)}
          />
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
          ws.isPending ? (
            <LoadingState rows={2} />
          ) : ws.isError ? (
            <ErrorState error={ws.error} onRetry={ws.refetch} />
          ) : (
            <EmptyState
              title="No workspace to show"
              description="Conversations are kept per workspace, and your roles do not cover one yet."
              learnMore={doc('guides/conversations-and-runs', 'read-a-run')}
            />
          )
        ) : runs.isPending ? (
          <LoadingState rows={6} />
        ) : runs.isError ? (
          <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={filtered || hidden ? 'No conversations match' : 'No conversations yet'}
            description={
              hidden
                ? `${hidden} test run${hidden === 1 ? ' is' : 's are'} hidden. Untick "Hide test runs" to see ${hidden === 1 ? 'it' : 'them'}.`
                : filtered
                  ? 'Try another assistant, version, outcome or time range.'
                  : 'Each request a live assistant answers appears here, from an app or from automatic routing.'
            }
            action={
              !filtered && !hidden ? (
                <Link to="/nodes" className="text-accent hover:underline">
                  See your assistants
                </Link>
              ) : undefined
            }
            learnMore={doc('guides/conversations-and-runs', 'read-a-run')}
          />
        ) : (
          <>
            {hidden > 0 && (
              <p className="border-b border-border px-4 py-2 text-[12px] text-fg-muted">
                {hidden} test run{hidden === 1 ? '' : 's'} hidden on this page.
              </p>
            )}
            <Table label="Conversations">
              <THead>
                <tr>
                  <TH>Conversation</TH>
                  <TH>Assistant</TH>
                  <TH>Outcome</TH>
                  <TH>Started by</TH>
                  <TH className="text-right">Cost</TH>
                  <TH>Started</TH>
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
                          {isTestRun(r.origin) && <Badge tone="info">Test run</Badge>}
                          {r.awaiting_step && (
                            <span className="text-[12px] text-fg-muted">
                              at the {stepName(r.awaiting_step)} step
                            </span>
                          )}
                        </span>
                      </TD>
                      <TD
                        className="max-w-56 truncate text-[12.5px] text-fg-muted"
                        title={r.origin ? `${r.invoker} (${r.origin})` : r.invoker}
                      >
                        {startedBy(r.invoker, r.origin)}
                      </TD>
                      <TD className="text-right whitespace-nowrap tabular-nums">
                        {formatUsd(r.cost_usd)}
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">
                        {formatDateTime(r.created_at)}
                      </TD>
                      <TD className="text-right whitespace-nowrap text-fg-muted tabular-nums">
                        {ms != null ? formatMs(ms) : r.finished_at ? EMPTY : 'not ended'}
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
                  Load older conversations
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
