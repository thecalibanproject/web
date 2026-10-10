import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { usePermissions } from '@/api/auth';
import {
  tenantsQuery,
  toolServersQuery,
  useDeleteToolServer,
  useDiscoverTools,
} from '@/api/queries';
import type { ToolServer } from '@/api/types';
import { TenantSelect } from '@/components/tenant-select';
import { RegisterServerForm, TRUSTED_HINT } from '@/components/tools/register-server-form';
import { ServerTools } from '@/components/tools/server-tools';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  FormError,
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
import { IconPlus, IconRefresh, IconTrash } from '@/components/ui/icons';
import { isNotFound } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { deniedReason } from '@/lib/permissions';
import { TOOL_AUTH_LABEL } from '@/lib/tools';

const route = getRouteApi('/_app/tools');

export function ToolsPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const perms = usePermissions();
  const tenants = useQuery(tenantsQuery());
  const readable = perms.tenantsWith('tools.read');
  const firstReadable = tenants.data?.find(
    (t) => readable === 'all' || readable.includes(t.id),
  )?.id;
  const tenantId = search.tenant ?? firstReadable;

  const setSearch = (patch: Partial<typeof search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
      <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
        Tenant
        <TenantSelect
          value={tenantId}
          permission="tools.read"
          className="w-52"
          onChange={(t) => setSearch({ tenant: t, server: undefined })}
        />
      </label>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Tools"
        description="The MCP servers a tenant's nodes may call, and the tool manifests approved for them. A tool becomes callable only once someone who may approve tools has reviewed its manifest."
        actions={
          tenantId && (
            <RegisterButton tenantId={tenantId} onRegistered={(s) => setSearch({ server: s })} />
          )
        }
      />
      {tenantId ? (
        <ServerList
          toolbar={toolbar}
          tenantId={tenantId}
          selected={search.server}
          onSelect={(s) => setSearch({ server: s })}
        />
      ) : (
        <Card>
          {toolbar}
          {tenants.isPending ? (
            <LoadingState rows={2} />
          ) : tenants.isError ? (
            <ErrorState error={tenants.error} onRetry={() => void tenants.refetch()} />
          ) : (
            <EmptyState
              title="No tenant to show"
              description="Tool servers are registered per tenant. Your roles do not cover a tenant with tools yet."
            />
          )}
        </Card>
      )}
    </>
  );
}

function RegisterButton({
  tenantId,
  onRegistered,
}: {
  tenantId: string;
  onRegistered: (server: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const denied = deniedReason(usePermissions(), 'tools.write', tenantId);
  return (
    <>
      <GatedButton
        variant="primary"
        icon={<IconPlus size={14} />}
        deniedReason={denied}
        onClick={() => setOpen(true)}
      >
        Register server
      </GatedButton>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Register tool server"
        description="Registering a server is what allows nodes to reach it: the registry is the egress allowlist for tools."
      >
        {open && (
          <RegisterServerForm
            tenantId={tenantId}
            onCancel={() => setOpen(false)}
            onRegistered={(s) => {
              setOpen(false);
              onRegistered(s);
            }}
          />
        )}
      </Drawer>
    </>
  );
}

function ServerList({
  toolbar,
  tenantId,
  selected,
  onSelect,
}: {
  toolbar: ReactNode;
  tenantId: string;
  selected: string | undefined;
  onSelect: (server: string | undefined) => void;
}) {
  const servers = useQuery(toolServersQuery(tenantId));
  const discover = useDiscoverTools(tenantId);
  const del = useDeleteToolServer(tenantId);
  const [deleting, setDeleting] = useState<ToolServer | null>(null);
  const cannotWrite = deniedReason(usePermissions(), 'tools.write', tenantId);
  const current = servers.data?.find((s) => s.name === selected);

  const runDiscover = (name: string) => {
    onSelect(name);
    discover.mutate(name);
  };
  const discoverNotice =
    discover.variables === current?.name && !discover.isPending && !discover.isIdle ? (
      <div className="mx-4 mt-3">
        {discover.isSuccess ? (
          <p role="status" className="text-[12.5px] text-ok">
            The server lists {discover.data.tools?.length ?? 0} tool
            {discover.data.tools?.length === 1 ? '' : 's'}. New and changed manifests need approval.
          </p>
        ) : (
          <FormError error={discover.error} />
        )}
      </div>
    ) : null;

  const closeDelete = () => {
    setDeleting(null);
    del.reset();
  };

  return (
    <>
      <Card>
        {toolbar}
        {servers.isPending ? (
          <LoadingState rows={3} />
        ) : servers.isError ? (
          isNotFound(servers.error) ? (
            <EmptyState title="Tenant not found" description="It may have been deleted." />
          ) : (
            <ErrorState error={servers.error} onRetry={() => void servers.refetch()} />
          )
        ) : servers.data.length === 0 ? (
          <EmptyState
            title="No tool servers"
            description="Register an MCP server (Streamable HTTP), discover its tools, then review and approve them so nodes can pin them."
          />
        ) : (
          <Table label="Tool servers">
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>URL</TH>
                <TH>Authentication</TH>
                <TH>Personal data</TH>
                <TH>Credential</TH>
                <TH>Registered</TH>
                <TH>
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {servers.data.map((s) => {
                const name = s.name ?? '';
                const isSelected = name === selected;
                return (
                  <TR key={s.id ?? name} className={isSelected ? 'bg-accent-soft/40' : undefined}>
                    <TD>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onSelect(isSelected ? undefined : name)}
                        className="font-mono text-[12.5px] font-medium hover:text-accent hover:underline"
                      >
                        {name}
                      </button>
                    </TD>
                    <TD
                      className="max-w-72 truncate font-mono text-[12px] text-fg-muted"
                      title={s.url}
                    >
                      {s.url}
                    </TD>
                    <TD>{TOOL_AUTH_LABEL[s.auth?.method ?? 'caliban_token']}</TD>
                    <TD>
                      {s.trusted ? (
                        <Badge tone="warn" title={TRUSTED_HINT}>
                          Trusted: real values
                        </Badge>
                      ) : (
                        <Badge title={TRUSTED_HINT}>Surrogates</Badge>
                      )}
                    </TD>
                    <TD>
                      {s.has_credential ? (
                        <Badge
                          tone="ok"
                          title="Sealed under the tenant's data key; never returned."
                        >
                          Sealed
                        </Badge>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-fg-muted">
                      {formatDateTime(s.created_at)}
                      {s.created_by && (
                        <span className="block max-w-48 truncate text-[11.5px] text-fg-subtle">
                          {s.created_by}
                        </span>
                      )}
                    </TD>
                    <TD className="text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Show the tools of ${name}`}
                          onClick={() => onSelect(name)}
                        >
                          Tools
                        </Button>
                        <GatedButton
                          size="sm"
                          icon={<IconRefresh size={14} />}
                          deniedReason={cannotWrite}
                          loading={discover.isPending && discover.variables === name}
                          aria-label={`Discover the tools of ${name}`}
                          onClick={() => runDiscover(name)}
                        >
                          Discover
                        </GatedButton>
                        <GatedButton
                          size="sm"
                          variant="danger"
                          icon={<IconTrash size={14} />}
                          deniedReason={cannotWrite}
                          aria-label={`Delete ${name}`}
                          onClick={() => setDeleting(s)}
                        >
                          Delete
                        </GatedButton>
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {current && (
        <ServerTools
          key={current.name}
          tenantId={tenantId}
          server={current}
          discovering={discover.isPending && discover.variables === current.name}
          discoverNotice={discoverNotice}
          onDiscover={() => runDiscover(current.name ?? '')}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete tool server?"
        confirmLabel="Delete server"
        loading={del.isPending}
        error={del.error}
        onCancel={closeDelete}
        onConfirm={() => {
          const name = deleting?.name;
          if (!name) return;
          del.mutate(name, {
            onSuccess: () => {
              if (selected === name) onSelect(undefined);
              closeDelete();
            },
          });
        }}
      >
        <p>
          Delete <code className="font-mono font-medium">{deleting?.name}</code>? Its credential is
          wiped and its tools leave the data plane.
        </p>
        <p className="text-fg-muted">
          A server that a published node version uses cannot be deleted: retire those versions
          first.
        </p>
      </ConfirmDialog>
    </>
  );
}
