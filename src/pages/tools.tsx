import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';
import { usePermissions } from '@/api/auth';
import { toolServersQuery, useDeleteToolServer, useDiscoverTools } from '@/api/queries';
import type { ToolServer } from '@/api/types';
import { TermTip } from '@/components/help/toggletip';
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
import { EMPTY, formatDateTime } from '@/lib/format';
import { doc } from '@/lib/docs';
import { deniedReason } from '@/lib/permissions';
import { TOOL_AUTH_LABEL } from '@/lib/tools';
import { useScopedTenant, useWorkspace } from '@/lib/workspace';

const route = getRouteApi('/_app/tools');

export function ToolsPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  // The header's workspace, or a ?tenant= deep link.
  const tenantId = useScopedTenant(search.tenant);
  const ws = useWorkspace();

  const setSearch = (patch: Partial<typeof search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  return (
    <>
      <PageHeader
        title="Connected systems"
        description={
          <>
            Outside systems the assistants of this workspace may call. Each of their actions can be
            used only after a person has reviewed and approved it.{' '}
            <TermTip term="connectedSystem" />
          </>
        }
        actions={
          tenantId && (
            <RegisterButton tenantId={tenantId} onRegistered={(s) => setSearch({ server: s })} />
          )
        }
      />
      {tenantId ? (
        <ServerList
          tenantId={tenantId}
          selected={search.server}
          onSelect={(s) => setSearch({ server: s })}
        />
      ) : (
        <Card>
          {ws.isPending ? (
            <LoadingState rows={2} />
          ) : ws.isError ? (
            <ErrorState error={ws.error} onRetry={ws.refetch} />
          ) : (
            <EmptyState
              title="No workspace to show"
              description="Connected systems belong to a workspace, and your roles do not cover one yet."
            />
          )}
        </Card>
      )}
    </>
  );
}

function RegisterButton({
  tenantId,
  label = 'Add a system',
  onRegistered,
}: {
  tenantId: string;
  label?: string;
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
        {label}
      </GatedButton>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Add a connected system"
        description="Assistants can only reach systems added here."
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
  tenantId,
  selected,
  onSelect,
}: {
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
            The system offers {discover.data.tools?.length ?? 0} action
            {discover.data.tools?.length === 1 ? '' : 's'}. New and changed ones need approval.
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
        {servers.isPending ? (
          <LoadingState rows={3} />
        ) : servers.isError ? (
          isNotFound(servers.error) ? (
            <EmptyState title="Workspace not found" description="It may have been deleted." />
          ) : (
            <ErrorState error={servers.error} onRetry={() => void servers.refetch()} />
          )
        ) : servers.data.length === 0 ? (
          <EmptyState
            title="No connected systems yet"
            description="Add a system's tool server, check which actions it offers, then approve the ones assistants may use."
            action={
              <RegisterButton
                tenantId={tenantId}
                label="Add your first system"
                onRegistered={(s) => onSelect(s)}
              />
            }
            learnMore={doc('guides/connected-systems', 'add-a-tool-server')}
          />
        ) : (
          <Table label="Connected systems">
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Address</TH>
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
                          Gets real values
                        </Badge>
                      ) : (
                        <Badge title={TRUSTED_HINT}>Gets placeholders</Badge>
                      )}
                    </TD>
                    <TD>
                      {s.has_credential ? (
                        <Badge
                          tone="ok"
                          title="Encrypted with the workspace's data key; never shown again."
                        >
                          Stored, encrypted
                        </Badge>
                      ) : (
                        <span className="text-fg-subtle">{EMPTY}</span>
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
                          aria-label={`Show the actions of ${name}`}
                          onClick={() => onSelect(name)}
                        >
                          Actions
                        </Button>
                        <GatedButton
                          size="sm"
                          icon={<IconRefresh size={14} />}
                          deniedReason={cannotWrite}
                          loading={discover.isPending && discover.variables === name}
                          aria-label={`Check ${name} for tools`}
                          onClick={() => runDiscover(name)}
                        >
                          Check for tools
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
        title="Delete connected system?"
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
          wiped and assistants can no longer call it.
        </p>
        <p className="text-fg-muted">
          A system that a published assistant version uses cannot be deleted: retire those versions
          first.
        </p>
      </ConfirmDialog>
    </>
  );
}
