import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { usePermissions } from '@/api/auth';
import { nodeVersionsQuery, tenantsQuery } from '@/api/queries';
import type { Node } from '@/api/types';
import { EvalsPanel } from '@/components/evals/evals-panel';
import { LiveBadge, NodeStateBadge } from '@/components/nodes/node-badges';
import { NodeEditor } from '@/components/nodes/node-editor';
import { VersionDialog, type VersionAction } from '@/components/nodes/version-dialogs';
import { VersionDiff } from '@/components/nodes/version-diff';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CodeBlock,
  CopyButton,
  Drawer,
  EmptyState,
  ErrorState,
  GatedButton,
  LoadingState,
  PageHeader,
  Table,
  Tabs,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import { IconPlus } from '@/components/ui/icons';
import { isNotFound } from '@/lib/errors';
import { EMPTY, formatDateTime } from '@/lib/format';
import { shortHash } from '@/lib/nodes';
import { deniedReason } from '@/lib/permissions';
import type { NodeTab } from '@/router';

const route = getRouteApi('/_app/nodes/$tenantId/$nodeName');

const TABS: ReadonlyArray<{ value: NodeTab; label: string }> = [
  { value: 'versions', label: 'Versions' },
  { value: 'evals', label: 'Evals' },
];

/** Default comparison: the live version (or the one before the latest) against the latest. */
function defaultPair(versions: Node[], live: number | null | undefined): [number, number] | null {
  if (versions.length < 2) return null;
  const latest = versions[versions.length - 1]!.version;
  const from = live != null && live !== latest ? live : versions[versions.length - 2]!.version;
  return [from, latest];
}

function SpecDetails({ version: v }: { version: Node }) {
  const rows: Array<[string, ReactNode]> = [
    [
      'State',
      <span key="s" className="inline-flex items-center gap-1.5">
        <NodeStateBadge state={v.state} />
        {v.live && <LiveBadge />}
      </span>,
    ],
    [
      'Content hash',
      <span key="h" className="inline-flex min-w-0 items-center gap-1">
        <code className="font-mono text-[12px] break-all">{v.hash}</code>
        <CopyButton value={v.hash} label="Copy hash" compact />
      </span>,
    ],
    ['Created by', v.created_by ?? EMPTY],
    ['Created', formatDateTime(v.created_at)],
    ['Published', formatDateTime(v.published_at)],
    ['Retired', formatDateTime(v.retired_at)],
  ];
  return (
    <dl className="mb-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
      {rows.map(([k, val]) => (
        <div key={k} className="contents">
          <dt className="text-fg-muted">{k}</dt>
          <dd className="min-w-0">{val}</dd>
        </div>
      ))}
    </dl>
  );
}

export function NodeDetailPage() {
  const { tenantId, nodeName } = route.useParams();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const versions = useQuery(nodeVersionsQuery(tenantId, nodeName));
  const tenants = useQuery(tenantsQuery());
  const tenantName = tenants.data?.find((t) => t.id === tenantId)?.name ?? tenantId;
  const perms = usePermissions();
  const cannotWrite = deniedReason(perms, 'nodes.write', tenantId);
  const cannotPublish = deniedReason(perms, 'nodes.publish', tenantId);

  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [created, setCreated] = useState<number | null>(null);
  const [acting, setActing] = useState<{ action: VersionAction; version: Node } | null>(null);

  const list = versions.data?.versions ?? [];
  const live = versions.data?.live;
  const latest = list[list.length - 1];
  const viewing = list.find((v) => v.version === search.version) ?? null;
  const pair = defaultPair(list, live);
  const from = search.from ?? pair?.[0];
  const to = search.to ?? pair?.[1];

  const setSearch = (patch: Partial<typeof search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const action = (
    v: Node,
    kind: VersionAction,
    label: string,
    denied: string | null,
    variant: 'secondary' | 'danger' | 'primary' = 'secondary',
  ) => (
    <GatedButton
      size="sm"
      variant={variant}
      deniedReason={denied}
      aria-label={kind === 'promote' ? `Make v${v.version} live` : `${label} v${v.version}`}
      onClick={() => setActing({ action: kind, version: v })}
    >
      {label}
    </GatedButton>
  );

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-[12.5px] text-fg-muted">
        <Link to="/nodes" search={{ tenant: tenantId }} className="hover:text-fg hover:underline">
          Nodes
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{tenantName}</span>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{nodeName}</span>
      </nav>
      <PageHeader
        title={<span className="font-mono">{nodeName}</span>}
        description={
          versions.data ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{tenantName}</span>
              {live != null ? (
                <span className="inline-flex items-center gap-1.5">
                  <Badge tone="accent" dot>
                    Live: v{live}
                  </Badge>
                  {versions.data.promotion && (
                    <span className="text-fg-subtle">
                      made live {formatDateTime(versions.data.promotion.promoted_at)}
                      {versions.data.promotion.promoted_by &&
                        ` by ${versions.data.promotion.promoted_by}`}
                    </span>
                  )}
                </span>
              ) : (
                <Badge title="Runs that name no version are refused until a version is live.">
                  No live version
                </Badge>
              )}
            </span>
          ) : undefined
        }
        actions={
          latest && (
            <>
              <Link
                to="/runs"
                search={{ tenant: tenantId, node: nodeName }}
                className="text-[13px] text-accent hover:underline"
              >
                Runs
              </Link>
              <GatedButton
                variant="primary"
                icon={<IconPlus size={14} />}
                deniedReason={cannotWrite}
                onClick={() => setEditing(latest.spec)}
              >
                New version
              </GatedButton>
            </>
          )
        }
      />

      {versions.isPending ? (
        <LoadingState />
      ) : versions.isError && isNotFound(versions.error) ? (
        <Card>
          <EmptyState
            title="Node not found"
            description={`${tenantName} has no node named ${nodeName}, or all its versions were deleted.`}
            action={
              <Link
                to="/nodes"
                search={{ tenant: tenantId }}
                className="text-[13px] text-accent hover:underline"
              >
                Back to nodes
              </Link>
            }
          />
        </Card>
      ) : versions.isError ? (
        <Card>
          <ErrorState error={versions.error} onRetry={() => void versions.refetch()} />
        </Card>
      ) : (
        <Tabs<NodeTab>
          label="Node"
          tabs={TABS}
          value={search.tab ?? 'versions'}
          onChange={(tab) => setSearch({ tab: tab === 'versions' ? undefined : tab })}
        >
          {search.tab === 'evals' ? (
            <EvalsPanel
              tenantId={tenantId}
              name={nodeName}
              versions={list}
              version={search.ev}
              evalId={search.eval}
              onVersion={(ev) => setSearch({ ev })}
              onEval={(id) => setSearch({ eval: id })}
            />
          ) : (
            <>
              <Card>
                <CardHeader
                  title="Versions"
                  description="Versions are immutable. Drafts are published, published versions are made live or retired."
                  actions={
                    <p role="status" className="text-[12.5px] text-ok">
                      {created != null ? `Draft v${created} created.` : ''}
                    </p>
                  }
                />
                <Table label="Versions">
                  <THead>
                    <tr>
                      <TH>Version</TH>
                      <TH>State</TH>
                      <TH>Hash</TH>
                      <TH>Created by</TH>
                      <TH>Created</TH>
                      <TH>Published</TH>
                      <TH>
                        <span className="sr-only">Actions</span>
                      </TH>
                    </tr>
                  </THead>
                  <TBody>
                    {[...list].reverse().map((v) => (
                      <TR key={v.id}>
                        <TD>
                          <Badge>v{v.version}</Badge>
                        </TD>
                        <TD>
                          <span className="inline-flex items-center gap-1.5">
                            <NodeStateBadge state={v.state} />
                            {v.live && <LiveBadge />}
                          </span>
                        </TD>
                        <TD className="whitespace-nowrap">
                          <code className="font-mono text-[12px] text-fg-muted" title={v.hash}>
                            {shortHash(v.hash)}
                          </code>
                          <CopyButton value={v.hash} label={`Copy hash of v${v.version}`} compact />
                        </TD>
                        <TD className="max-w-56 truncate text-fg-muted" title={v.created_by ?? ''}>
                          {v.created_by ?? EMPTY}
                        </TD>
                        <TD className="whitespace-nowrap text-fg-muted">
                          {formatDateTime(v.created_at)}
                        </TD>
                        <TD className="whitespace-nowrap text-fg-muted">
                          {formatDateTime(v.published_at)}
                        </TD>
                        <TD className="text-right whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`View spec of v${v.version}`}
                              onClick={() => setSearch({ version: v.version })}
                            >
                              View spec
                            </Button>
                            {v.state === 'draft' &&
                              action(v, 'publish', 'Publish', cannotPublish, 'primary')}
                            {v.state === 'published' &&
                              !v.live &&
                              action(v, 'promote', 'Make live', cannotPublish)}
                            {v.state === 'published' &&
                              action(v, 'retire', 'Retire', cannotPublish, 'danger')}
                            {v.state !== 'published' &&
                              action(v, 'delete', 'Delete', cannotWrite, 'danger')}
                          </span>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
              <VersionDiff
                tenantId={tenantId}
                name={nodeName}
                versions={list}
                from={from}
                to={to}
                onChange={(f, t) => setSearch({ from: f, to: t })}
              />
            </>
          )}
        </Tabs>
      )}

      <Drawer
        open={viewing !== null}
        onClose={() => setSearch({ version: undefined })}
        title={viewing ? `${viewing.name} v${viewing.version}` : ''}
        description="Read only. Change a node by creating a new version."
        footer={
          viewing && (
            <>
              <CopyButton
                value={JSON.stringify(viewing.spec, null, 2)}
                label="Copy JSON"
                size="md"
              />
              <GatedButton
                deniedReason={cannotWrite}
                onClick={() => {
                  setEditing(viewing.spec);
                  setSearch({ version: undefined });
                }}
              >
                New version from this spec
              </GatedButton>
            </>
          )
        }
      >
        {viewing && (
          <>
            <SpecDetails version={viewing} />
            <CodeBlock
              label="Node spec"
              language="json"
              code={JSON.stringify(viewing.spec, null, 2)}
            />
          </>
        )}
      </Drawer>
      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`New version of ${nodeName}`}
        description="Starts from the spec you picked. The control plane checks it again when you create the draft and when you publish it."
      >
        {editing && (
          <NodeEditor
            target={{ tenantId, name: nodeName }}
            initialSpec={editing}
            onCancel={() => setEditing(null)}
            onCreated={(n) => {
              setEditing(null);
              setCreated(n.version);
            }}
          />
        )}
      </Drawer>
      <VersionDialog
        action={acting?.action ?? null}
        version={acting?.version ?? null}
        live={live}
        onClose={() => setActing(null)}
      />
    </>
  );
}
