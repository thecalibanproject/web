import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { usePermissions } from '@/api/auth';
import { providersQuery, useDeleteProvider } from '@/api/queries';
import type { SharedProvider } from '@/api/types';
import { TrustTierBadge } from '@/components/badges';
import { doc } from '@/lib/docs';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  LoadingState,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import { IconPlus, IconSearch, IconTrash } from '@/components/ui/icons';
import { PROVIDER_SHORT } from '@/lib/labels';
import { DiscoveryDialog } from './discovery-dialog';
import { ProviderHealthBadge } from './provider-health-badge';
import { ServerForm } from './server-form';

export function ServersPanel() {
  const servers = useQuery(providersQuery());
  const del = useDeleteProvider();
  const [adding, setAdding] = useState(false);
  const [discovering, setDiscovering] = useState<SharedProvider | null>(null);
  const [deleting, setDeleting] = useState<SharedProvider | null>(null);
  const canWrite = usePermissions().can('catalog.write');

  const closeDelete = () => {
    setDeleting(null);
    del.reset();
  };

  return (
    <Card>
      <CardHeader
        title="Model servers"
        description="Servers on your network that run open models (for example vLLM or Ollama), shared by the workspaces you allow."
        actions={
          canWrite && (
            <Button
              size="sm"
              variant="primary"
              icon={<IconPlus size={14} />}
              onClick={() => setAdding(true)}
            >
              Add server
            </Button>
          )
        }
      />
      {servers.isPending ? (
        <LoadingState rows={3} />
      ) : servers.isError ? (
        <ErrorState error={servers.error} onRetry={() => void servers.refetch()} />
      ) : servers.data.length === 0 ? (
        <EmptyState
          title="No model servers yet"
          description="Add the server your open models run on; Caliban then finds the models it serves."
          action={
            canWrite && (
              <Button
                variant="primary"
                icon={<IconPlus size={14} />}
                onClick={() => setAdding(true)}
              >
                Add server
              </Button>
            )
          }
          learnMore={doc('guides/models', 'add-a-model-server')}
        />
      ) : (
        <Table label="Model servers">
          <THead>
            <tr>
              <TH>Server</TH>
              <TH>Kind</TH>
              <TH>Health</TH>
              <TH>Where it runs</TH>
              <TH>Cache isolation</TH>
              <TH>API key</TH>
              <TH>Workspaces</TH>
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {servers.data.map((s) => (
              <TR key={s.id}>
                <TD className="max-w-72">
                  <div className="font-mono text-[12.5px] font-medium">{s.id}</div>
                  <div
                    className="truncate font-mono text-[11.5px] text-fg-subtle"
                    title={s.base_url}
                  >
                    {s.base_url}
                  </div>
                </TD>
                <TD>{PROVIDER_SHORT[s.kind]}</TD>
                <TD>
                  <ProviderHealthBadge providerId={s.id} />
                </TD>
                <TD>
                  <TrustTierBadge tier={s.trust_tier} />
                </TD>
                <TD>
                  {s.cache_salt ? (
                    <Badge
                      tone="ok"
                      title="cache_salt: the vLLM prefix cache is isolated per workspace."
                    >
                      Per workspace
                    </Badge>
                  ) : (
                    <span className="text-fg-subtle">off</span>
                  )}
                </TD>
                <TD className="text-fg-muted">{s.has_api_key ? 'set' : 'none'}</TD>
                <TD className="max-w-48 truncate text-fg-muted" title={s.tenants.join(', ')}>
                  {s.tenants.length === 0 ? 'All workspaces' : s.tenants.join(', ')}
                </TD>
                <TD className="text-right whitespace-nowrap">
                  {canWrite && (
                    <span className="inline-flex items-center gap-1">
                      <Button
                        size="sm"
                        icon={<IconSearch size={14} />}
                        onClick={() => setDiscovering(s)}
                      >
                        Discover models
                        <span className="sr-only"> on {s.id}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<IconTrash size={14} />}
                        onClick={() => setDeleting(s)}
                      >
                        <span className="sr-only">Delete {s.id}</span>
                      </Button>
                    </span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Drawer
        open={adding}
        onClose={() => setAdding(false)}
        title="Add model server"
        description="A server with an OpenAI-compatible address. Caliban checks it can reach it every 15 seconds while this page is open."
      >
        {adding && (
          <ServerForm
            onDone={(created) => {
              setAdding(false);
              // Right after adding a server, find its models (UX-21).
              if (created) setDiscovering(created);
            }}
          />
        )}
      </Drawer>

      <DiscoveryDialog server={discovering} onClose={() => setDiscovering(null)} />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete model server?"
        confirmLabel="Delete server"
        loading={del.isPending}
        error={del.error}
        onCancel={closeDelete}
        onConfirm={() => {
          if (deleting) del.mutate(deleting.id, { onSuccess: closeDelete });
        }}
      >
        <p>
          Remove <code className="font-mono font-medium">{deleting?.id}</code>? This is refused
          while models still use it: delete those models first.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
