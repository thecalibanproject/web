import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { usePermissions } from '@/api/auth';
import { nodesQuery, tenantsQuery } from '@/api/queries';
import { NodeStateBadge } from '@/components/nodes/node-badges';
import { NodeEditor } from '@/components/nodes/node-editor';
import { TenantFilter } from '@/components/tenant-select';
import {
  Badge,
  Card,
  Drawer,
  EmptyState,
  ErrorState,
  GatedButton,
  LoadingState,
  PageHeader,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import { IconPlus } from '@/components/ui/icons';
import { formatDateTime } from '@/lib/format';
import { summarizeNodes } from '@/lib/nodes';

const route = getRouteApi('/_app/nodes');

const NO_WRITE = 'Your role cannot create nodes on any tenant (needs nodes.write).';

export function NodesPage() {
  const { tenant } = route.useSearch();
  const navigate = route.useNavigate();
  const nodes = useQuery(nodesQuery(tenant));
  const tenants = useQuery(tenantsQuery());
  const names = useMemo(
    () => new Map((tenants.data ?? []).map((t) => [t.id, t.name])),
    [tenants.data],
  );
  const rows = useMemo(() => summarizeNodes(nodes.data ?? []), [nodes.data]);
  const [creating, setCreating] = useState(false);
  const perms = usePermissions();
  const cannotCreate = perms.canSomewhere('nodes.write') ? null : NO_WRITE;

  const newNode = (
    <GatedButton
      variant="primary"
      icon={<IconPlus size={14} />}
      deniedReason={cannotCreate}
      onClick={() => setCreating(true)}
    >
      New node
    </GatedButton>
  );

  return (
    <>
      <PageHeader
        title="Nodes"
        description="Versioned, budgeted AI sub-apps. Publish a version to run it; the live version is what a run that names no version runs."
        actions={newNode}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <TenantFilter value={tenant} onChange={(t) => void navigate({ search: { tenant: t } })} />
        </div>
        {nodes.isPending ? (
          <LoadingState />
        ) : nodes.isError ? (
          <ErrorState error={nodes.error} onRetry={() => void nodes.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No nodes"
            description="Create a node from a JSON spec. It is checked against node.schema.json as you type, and again by the control plane."
            action={newNode}
          />
        ) : (
          <Table label="Nodes">
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Tenant</TH>
                <TH>Live version</TH>
                <TH>Latest version</TH>
                <TH className="text-right">Versions</TH>
                <TH>Updated</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((n) => (
                <TR key={`${n.tenantId}/${n.name}`}>
                  <TD>
                    <Link
                      to="/nodes/$tenantId/$nodeName"
                      params={{ tenantId: n.tenantId, nodeName: n.name }}
                      className="font-mono text-[12.5px] font-medium hover:text-accent hover:underline"
                    >
                      {n.name}
                    </Link>
                  </TD>
                  <TD>
                    {names.get(n.tenantId) ?? (
                      <span className="font-mono text-[12px]">{n.tenantId}</span>
                    )}
                  </TD>
                  <TD>
                    {n.live ? (
                      <Badge tone="accent" dot>
                        v{n.live.version}
                      </Badge>
                    ) : (
                      <span className="text-fg-subtle">None</span>
                    )}
                  </TD>
                  <TD>
                    <span className="inline-flex items-center gap-1.5">
                      <Badge>v{n.latest.version}</Badge>
                      <NodeStateBadge state={n.latest.state} />
                    </span>
                  </TD>
                  <TD className="text-right text-fg-muted">{n.versions}</TD>
                  <TD className="whitespace-nowrap text-fg-muted">{formatDateTime(n.updatedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Drawer
        open={creating}
        onClose={() => setCreating(false)}
        title="New node"
        description="Creates version 1 as a draft. Publish it from the node's page to make it runnable."
      >
        {creating && (
          <NodeEditor
            defaultTenant={tenant}
            onCancel={() => setCreating(false)}
            onCreated={(n) => {
              setCreating(false);
              void navigate({
                to: '/nodes/$tenantId/$nodeName',
                params: { tenantId: n.tenant_id, nodeName: n.name },
              });
            }}
          />
        )}
      </Drawer>
    </>
  );
}
