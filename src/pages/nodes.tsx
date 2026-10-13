import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { usePermissions } from '@/api/auth';
import { nodesQuery, tenantsQuery } from '@/api/queries';
import { NewAssistant } from '@/components/nodes/new-assistant';
import { NodeStateBadge } from '@/components/nodes/node-badges';
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
import { doc } from '@/lib/docs';
import { formatDateTime } from '@/lib/format';
import { summarizeNodes } from '@/lib/nodes';
import { useScopedTenant } from '@/lib/workspace';

const route = getRouteApi('/_app/nodes');

const NO_WRITE = 'Your role cannot create assistants in any workspace (needs nodes.write).';

export function NodesPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const tenantId = useScopedTenant(search.tenant);
  const nodes = useQuery({ ...nodesQuery(tenantId), enabled: Boolean(tenantId) });
  const tenants = useQuery(tenantsQuery());
  const names = useMemo(
    () => new Map((tenants.data ?? []).map((t) => [t.id, t.name])),
    [tenants.data],
  );
  const rows = useMemo(() => summarizeNodes(nodes.data ?? []), [nodes.data]);
  const creating = search.new === 1;
  const setCreating = (open: boolean) =>
    void navigate({ search: (prev) => ({ ...prev, new: open ? 1 : undefined }) });
  const perms = usePermissions();
  const cannotCreate = perms.canSomewhere('nodes.write') ? null : NO_WRITE;

  const newAssistant = (
    <GatedButton
      variant="primary"
      icon={<IconPlus size={14} />}
      deniedReason={cannotCreate}
      onClick={() => setCreating(true)}
    >
      New assistant
    </GatedButton>
  );

  return (
    <>
      <PageHeader
        title="Assistants"
        description="Each assistant answers one kind of request with your data and tools, within limits. Only its live version answers."
        actions={newAssistant}
      />
      <Card>
        {!tenantId && tenants.isPending ? (
          <LoadingState />
        ) : !tenantId ? (
          <EmptyState
            title="No workspace yet"
            description="Assistants live in a workspace. Create one first."
            learnMore={doc('guides/workspaces', 'create')}
          />
        ) : nodes.isPending ? (
          <LoadingState />
        ) : nodes.isError ? (
          <ErrorState error={nodes.error} onRetry={() => void nodes.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No assistants yet"
            description="Start from a template, such as a support desk or questions on your documents, and adjust it to your data."
            action={newAssistant}
            learnMore={doc('guides/assistants', 'create-from-template')}
          />
        ) : (
          <Table label="Assistants">
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Workspace</TH>
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
                      <span className="text-fg-muted">None</span>
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
        title="New assistant"
        description="Created as a draft, version 1. Nothing answers requests until a version is live."
      >
        {creating && (
          <NewAssistant
            tenantId={tenantId}
            onCancel={() => setCreating(false)}
            onCreated={(n) => {
              void navigate({
                to: '/nodes/$tenantId/$nodeName',
                params: { tenantId: n.tenant_id, nodeName: n.name },
                search: {},
              });
            }}
          />
        )}
      </Drawer>
    </>
  );
}
