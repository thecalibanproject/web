import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useMemo } from 'react';
import { usePermissions } from '@/api/auth';
import { auditQuery, tenantsQuery } from '@/api/queries';
import type { AuditEntry, AuditLog } from '@/api/types';
import { LearnMore } from '@/components/help/learn-more';
import {
  Badge,
  Button,
  Card,
  CodeBlock,
  CopyButton,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  type Tone,
} from '@/components/ui';
import { IconRefresh } from '@/components/ui/icons';
import {
  actionLabel,
  actorLabel,
  AUDIT_LIMITS,
  AUDIT_PAGE_SIZE,
  chainLinks,
  shortHash,
  summarizeAudit,
  type ChainLink,
} from '@/lib/audit';
import { cn } from '@/lib/cn';
import { doc } from '@/lib/docs';
import { formatDateTime, formatInt } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace';

/** `?tenant=all`: every workspace, for deployment-wide roles. */
const ALL = 'all';

const route = getRouteApi('/_app/audit');

function actionTone(action: string): Tone {
  if (action.endsWith('.delete') || action.endsWith('.revoke')) return 'danger';
  if (action.endsWith('.create')) return 'ok';
  return 'neutral';
}

/** Distinct values, sorted, always including the active filter value. */
function options(values: Iterable<string>, selected: string | undefined): string[] {
  const set = new Set(values);
  if (selected) set.add(selected);
  return [...set].sort();
}

function ChainStatus({ log, links }: { log: AuditLog; links: Map<number, ChainLink> }) {
  const newest = log.entries[0];
  const oldest = log.entries.at(-1);
  if (!newest || !oldest) return null;
  const range =
    newest.seq === oldest.seq ? `entry #${newest.seq}` : `entries #${oldest.seq} to #${newest.seq}`;
  const broken = [...links.values()].filter((l) => l === 'broken').length;
  const ok = log.chain_verified;
  return (
    <section
      aria-label="Chain integrity"
      className={cn(
        'flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b px-4 py-3',
        ok ? 'border-border' : 'border-danger/40 bg-danger-soft',
      )}
    >
      <div className="flex min-w-0 max-w-3xl items-start gap-3">
        <Badge tone={ok ? 'ok' : 'danger'} dot className="mt-px">
          {ok ? 'Untampered' : 'Possibly tampered with'}
        </Badge>
        <p className="text-[12.5px] text-fg-muted">
          {ok
            ? `The control plane recomputed the hashes of ${range} and checked that each one links to the entry before it.`
            : `The control plane could not verify ${range}: an entry's hash does not match its contents, or an entry does not link to the one before it. Treat these entries as tampered with until you have investigated.`}
          {!ok && broken > 0 && ` Entries with a broken link are marked below.`}{' '}
          <LearnMore doc={doc('guides/audit', 'verify-the-chain')} />
          {oldest.seq > 1
            ? ` Entries before #${oldest.seq} are outside this window and were not checked.`
            : ' This window starts at the first entry of the log.'}
        </p>
      </div>
      {log.head?.hash && (
        <div className="flex items-center gap-1.5 text-[12px] text-fg-muted">
          <span>Latest entry #{log.head.seq}</span>
          <code className="font-mono text-fg" title={log.head.hash}>
            {shortHash(log.head.hash)}
          </code>
          <CopyButton value={log.head.hash} label="Copy head hash" compact />
        </div>
      )}
    </section>
  );
}

function HashCell({ entry: e, link }: { entry: AuditEntry; link: ChainLink | undefined }) {
  const prevTitle =
    link === 'linked'
      ? `Matches the hash of entry #${e.seq - 1}`
      : link === 'unchecked'
        ? `Entry #${e.seq - 1} is outside the loaded window`
        : (e.prev_hash ?? undefined);
  return (
    <TD className="whitespace-nowrap">
      <span className="flex items-center gap-1">
        <code className="font-mono text-[12px]" title={e.hash}>
          {shortHash(e.hash)}
        </code>
        <CopyButton value={e.hash} label={`Copy hash of entry ${e.seq}`} compact />
      </span>
      <span className="flex items-center gap-1.5 font-mono text-[11.5px] text-fg-subtle">
        <span title={prevTitle}>
          {e.prev_hash ? `prev ${shortHash(e.prev_hash)}` : 'first entry'}
        </span>
        {link === 'broken' && (
          <Badge
            tone="danger"
            title={`prev_hash is not the hash of entry #${e.seq - 1}, or entries are missing before this one.`}
          >
            Link broken
          </Badge>
        )}
      </span>
    </TD>
  );
}

function AuditTable({
  entries,
  links,
  tenantNames,
}: {
  entries: AuditEntry[];
  links: Map<number, ChainLink>;
  tenantNames: ReadonlyMap<string, string>;
}) {
  return (
    <Table label="Audit log">
      <THead>
        <tr>
          <TH className="text-right">Seq</TH>
          <TH>Time</TH>
          <TH>Actor</TH>
          <TH>Action</TH>
          <TH>Workspace</TH>
          <TH>Target</TH>
          <TH>Details</TH>
          <TH>Fingerprint</TH>
        </tr>
      </THead>
      <TBody>
        {entries.map((e) => {
          const summary = summarizeAudit(e);
          const hasDetail = Object.keys(e.detail ?? {}).length > 0;
          return (
            <TR key={e.seq} className="align-top">
              <TD className="text-right font-mono text-[12px] text-fg-muted">{e.seq}</TD>
              <TD className="whitespace-nowrap text-fg-muted">{formatDateTime(e.ts)}</TD>
              <TD className="max-w-48 break-words" title={e.actor}>
                {e.actor === 'break_glass' ? (
                  <Badge tone="warn">{actorLabel(e.actor)}</Badge>
                ) : (
                  actorLabel(e.actor)
                )}
              </TD>
              <TD>
                <Badge tone={actionTone(e.action)} title={e.action}>
                  {actionLabel(e.action)}
                </Badge>
              </TD>
              <TD className="max-w-40 truncate" title={e.tenant_id ?? undefined}>
                {e.tenant_id ? (
                  (tenantNames.get(e.tenant_id) ?? (
                    <span className="font-mono text-[12px]">{e.tenant_id}</span>
                  ))
                ) : (
                  <span className="text-fg-subtle">Global</span>
                )}
              </TD>
              <TD
                className="max-w-48 font-mono text-[12px] break-all"
                title={e.target ?? undefined}
              >
                {e.target ?? <span className="font-sans text-fg-subtle">None</span>}
              </TD>
              <TD className="max-w-md min-w-56">
                {summary ? (
                  <span className="break-words">{summary}</span>
                ) : (
                  <span className="text-fg-subtle">No details</span>
                )}
                {hasDetail && (
                  <details className="mt-0.5">
                    <summary className="cursor-pointer text-[11.5px] text-fg-subtle hover:text-fg-muted">
                      Raw detail
                    </summary>
                    <CodeBlock
                      code={JSON.stringify(e.detail, null, 2)}
                      label={`Detail of entry ${e.seq}`}
                      className="mt-1 max-h-64"
                    />
                  </details>
                )}
              </TD>
              <HashCell entry={e} link={links.get(e.seq)} />
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

export function AuditPage() {
  const search = route.useSearch();
  const { action } = search;
  const limit = search.limit ?? 100;
  const perms = usePermissions();
  const ws = useWorkspace();
  // Deployment-wide roles (auditors) see every workspace and the global
  // entries by default, and can narrow to one; others see the header's.
  const canAll = perms.tenantsWith('audit.read') === 'all';
  const all = canAll && (search.tenant === ALL || !search.tenant);
  const tenant = all ? undefined : search.tenant && search.tenant !== ALL ? search.tenant : ws.id;
  const navigate = route.useNavigate();
  const audit = useQuery(auditQuery(limit));
  // Deleted tenants included: their history stays in the log.
  const tenants = useQuery(tenantsQuery(true));
  const names = useMemo(
    () =>
      new Map(
        (tenants.data ?? []).map((t) => [
          t.id,
          t.status === 'deleted' ? `${t.name} (deleted)` : t.name,
        ]),
      ),
    [tenants.data],
  );

  const links = useMemo(() => chainLinks(audit.data?.entries ?? []), [audit.data]);
  const tenantIds = useMemo(
    () =>
      options(
        (audit.data?.entries ?? []).flatMap((e) => (e.tenant_id ? [e.tenant_id] : [])),
        tenant,
      ),
    [audit.data, tenant],
  );
  const actions = useMemo(
    () =>
      options(
        (audit.data?.entries ?? []).map((e) => e.action),
        action,
      ),
    [audit.data, action],
  );

  // The API only takes `limit`: tenant, action and paging apply to the loaded window.
  const filtered = useMemo(
    () =>
      (audit.data?.entries ?? []).filter(
        (e) => (!tenant || e.tenant_id === tenant) && (!action || e.action === action),
      ),
    [audit.data, tenant, action],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / AUDIT_PAGE_SIZE));
  const page = Math.min(search.page ?? 1, pageCount);
  const first = (page - 1) * AUDIT_PAGE_SIZE;
  const rows = filtered.slice(first, first + AUDIT_PAGE_SIZE);

  // Any filter change goes back to the first page.
  const setSearch = (patch: Partial<typeof search>) =>
    void navigate({ search: (prev) => ({ ...prev, page: undefined, ...patch }), replace: true });
  const goTo = (p: number) => setSearch({ page: p > 1 ? p : undefined });

  return (
    <>
      <PageHeader
        title="Audit log"
        description={
          <>
            Every change and decision, newest first. Each entry is linked to the one before it, so
            editing or removing an entry shows. Secrets are never recorded.{' '}
            <LearnMore doc={doc('guides/audit', 'read-the-log')} />
          </>
        }
        actions={
          <Button
            icon={<IconRefresh size={14} />}
            loading={audit.isFetching && !audit.isPending}
            onClick={() => void audit.refetch()}
          >
            Refresh
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
          {canAll && (
            <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
              Entries of
              <Select
                value={all ? ALL : (tenant ?? '')}
                onChange={(e) => setSearch({ tenant: e.target.value || undefined })}
                disabled={!audit.isSuccess}
                className="w-52"
              >
                <option value={ALL}>All workspaces</option>
                {tenantIds.map((id) => (
                  <option key={id} value={id}>
                    {names.get(id) ?? id}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            Action
            <Select
              value={action ?? ''}
              onChange={(e) => setSearch({ action: e.target.value || undefined })}
              disabled={!audit.isSuccess}
              className="w-48"
            >
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {actionLabel(a)}
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
              {AUDIT_LIMITS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </label>
          {audit.isSuccess && (
            <p className="ml-auto text-[12px] text-fg-muted" aria-live="polite">
              {formatInt(filtered.length)} of {formatInt(audit.data.entries.length)} loaded entries
            </p>
          )}
        </div>
        {audit.isPending ? (
          <LoadingState rows={8} />
        ) : audit.isError ? (
          <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
        ) : audit.data.entries.length === 0 ? (
          <EmptyState
            title="No audit entries yet"
            description="Changes and decisions, such as creating a workspace or approving an action, are recorded here."
            learnMore={doc('guides/audit', 'read-the-log')}
          />
        ) : (
          <>
            <ChainStatus log={audit.data} links={links} />
            {rows.length === 0 ? (
              <EmptyState
                title="No entries match"
                description="Try another workspace or action, or load more entries."
              />
            ) : (
              <AuditTable entries={rows} links={links} tenantNames={names} />
            )}
            {pageCount > 1 && (
              <nav
                aria-label="Audit log pages"
                className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-[12.5px] text-fg-muted"
              >
                <span>
                  Entries {formatInt(first + 1)} to {formatInt(first + rows.length)} of{' '}
                  {formatInt(filtered.length)}
                </span>
                <span className="flex items-center gap-2">
                  <Button size="sm" disabled={page <= 1} onClick={() => goTo(page - 1)}>
                    Previous
                  </Button>
                  <span>
                    Page {page} of {pageCount}
                  </span>
                  <Button size="sm" disabled={page >= pageCount} onClick={() => goTo(page + 1)}>
                    Next
                  </Button>
                </span>
              </nav>
            )}
          </>
        )}
      </Card>
    </>
  );
}
