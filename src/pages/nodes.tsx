import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { nodesQuery, tenantsQuery, useDeleteNode } from '@/api/queries';
import type { Node } from '@/api/types';
import { NodeEditor } from '@/components/nodes/node-editor';
import { TenantFilter } from '@/components/tenant-select';
import {
  Badge,
  Button,
  Card,
  CodeBlock,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import { IconPlus, IconTrash } from '@/components/ui/icons';
import { formatDateTime } from '@/lib/format';

const route = getRouteApi('/_app/nodes');

function specField(node: Node, key: string): string | undefined {
  const v = node.spec[key];
  return typeof v === 'string' ? v : undefined;
}

export function NodesPage() {
  const { tenant } = route.useSearch();
  const navigate = route.useNavigate();
  const nodes = useQuery(nodesQuery(tenant));
  const tenants = useQuery(tenantsQuery());
  const names = useMemo(
    () => new Map((tenants.data ?? []).map((t) => [t.id, t.name])),
    [tenants.data],
  );
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Node | null>(null);
  const del = useDeleteNode();
  const [deleting, setDeleting] = useState<Node | null>(null);

  const closeDelete = () => {
    setDeleting(null);
    del.reset();
  };

  return (
    <>
      <PageHeader
        title="Nodes"
        description="Versioned, budgeted AI sub-apps. Each is callable over HTTP, MCP and A2A."
        actions={
          <Button variant="primary" icon={<IconPlus size={14} />} onClick={() => setCreating(true)}>
            New node
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <TenantFilter value={tenant} onChange={(t) => void navigate({ search: { tenant: t } })} />
        </div>
        {nodes.isPending ? (
          <LoadingState />
        ) : nodes.isError ? (
          <ErrorState error={nodes.error} onRetry={() => void nodes.refetch()} />
        ) : nodes.data.length === 0 ? (
          <EmptyState
            title="No nodes"
            description="Create a node from a JSON spec. It is validated against node.schema.json before it is saved."
            action={
              <Button
                variant="primary"
                icon={<IconPlus size={14} />}
                onClick={() => setCreating(true)}
              >
                New node
              </Button>
            }
          />
        ) : (
          <Table label="Nodes">
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Version</TH>
                <TH>Kind</TH>
                <TH>Tenant</TH>
                <TH>Description</TH>
                <TH>Created</TH>
                <TH>
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {nodes.data.map((n) => (
                <TR key={n.id}>
                  <TD>
                    <button
                      type="button"
                      onClick={() => setViewing(n)}
                      className="font-mono text-[12.5px] font-medium hover:text-accent hover:underline"
                    >
                      {n.name}
                    </button>
                  </TD>
                  <TD>
                    <Badge>v{n.version}</Badge>
                  </TD>
                  <TD>{specField(n, 'kind') ?? '—'}</TD>
                  <TD>
                    {names.get(n.tenant_id) ?? (
                      <span className="font-mono text-[12px]">{n.tenant_id}</span>
                    )}
                  </TD>
                  <TD className="max-w-80 truncate text-fg-muted">
                    {specField(n, 'description') ?? '—'}
                  </TD>
                  <TD className="whitespace-nowrap text-fg-muted">
                    {formatDateTime(n.created_at)}
                  </TD>
                  <TD className="text-right">
                    <Button
                      size="sm"
                      variant="danger"
                      icon={<IconTrash size={14} />}
                      aria-label={`Delete ${n.name} v${n.version}`}
                      onClick={() => setDeleting(n)}
                    >
                      Delete
                    </Button>
                  </TD>
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
        description="Posting a node with an existing name creates a new version."
      >
        {creating && <NodeEditor defaultTenant={tenant} onDone={() => setCreating(false)} />}
      </Drawer>
      <Drawer
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.name} v${viewing.version}` : ''}
        description={viewing?.id}
      >
        {viewing && <CodeBlock label="Node spec" code={JSON.stringify(viewing.spec, null, 2)} />}
      </Drawer>
      <ConfirmDialog
        open={deleting !== null}
        title="Delete node version?"
        confirmLabel="Delete node version"
        loading={del.isPending}
        error={del.error}
        onCancel={closeDelete}
        onConfirm={() => {
          // A 404 (already deleted) resolves too; the list refreshes either way.
          if (deleting) {
            del.mutate(
              { tenantId: deleting.tenant_id, nodeId: deleting.id },
              { onSuccess: closeDelete },
            );
          }
        }}
      >
        <p>
          Delete{' '}
          <code className="font-mono font-medium">
            {deleting?.name} v{deleting?.version}
          </code>
          ? Only this version is deleted, and it is no longer listed. Its version number is not
          reused by later versions.
        </p>
        <p>Audit history is kept.</p>
      </ConfirmDialog>
    </>
  );
}
