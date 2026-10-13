import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { usePermissions } from '@/api/auth';
import {
  apiKeysQuery,
  nodesQuery,
  useMintApiKey,
  useRevokeApiKey,
  useRotateEvalKey,
} from '@/api/queries';
import type { ApiKeyCreated, ApiKeyInfo } from '@/api/types';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  CopyButton,
  EmptyState,
  ErrorState,
  FormError,
  Input,
  LoadingState,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../ui';
import { IconAlert, IconPlus } from '../ui/icons';
import { cn } from '@/lib/cn';
import { isNotFound } from '@/lib/errors';
import {
  accessBody,
  accessError,
  accessOf,
  describeAccess,
  initialKeyAccess,
  type KeyAccess,
} from '@/lib/apiKeys';
import { doc } from '@/lib/docs';
import { formatDateTime } from '@/lib/format';
import { Toggletip } from '../help/toggletip';
import { KeyAccessFields } from './key-access-fields';
import { TenantDeletedState } from './tenant-deleted-state';

/** One-time reveal of a freshly minted key. Plaintext lives only in component state. */
function NewKeyNotice({ created, onDismiss }: { created: ApiKeyCreated; onDismiss: () => void }) {
  return (
    <div
      role="region"
      aria-label="New app key"
      className="mx-4 mt-4 rounded-md border border-warn/50 bg-warn-soft p-3"
    >
      <p className="flex items-center gap-2 text-[13px] font-medium text-fg">
        <IconAlert className="text-warn" />
        Copy this key now. It will not be shown again.
      </p>
      <p className="mt-0.5 text-[12.5px] text-fg-muted">
        Caliban keeps only a fingerprint of{' '}
        <span className="font-medium text-fg">{created.name}</span>, not the key itself.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <code
          data-testid="plaintext-key"
          className="min-w-0 flex-1 rounded border border-border bg-surface px-2.5 py-1.5 font-mono text-[12.5px] break-all select-all"
        >
          {created.key}
        </code>
        <CopyButton value={created.key} label="Copy key" />
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          I&apos;ve stored it
        </Button>
      </div>
      <p className="mt-2 text-[12.5px]">
        {/* A plain hash link: the panel also renders outside the router (tests, embeds). */}
        <a href="#/settings" className="font-medium text-accent hover:underline">
          Use this key: copy a snippet
        </a>
      </p>
    </div>
  );
}

/** The assistants a key may run: every published one, none, or the names. */
function NodeAccessCell({ access }: { access: KeyAccess }) {
  if (access.nodes === 'all') {
    return <span className="text-fg-muted">Every published</span>;
  }
  if (access.nodes === 'none') return <Badge>Model calls only</Badge>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {access.names.map((n) => (
        <Badge key={n} tone="info">
          {n}
        </Badge>
      ))}
    </span>
  );
}

export function ApiKeysPanel({ tenantId }: { tenantId: string }) {
  const [showRevoked, setShowRevoked] = useState(false);
  const keys = useQuery(apiKeysQuery(tenantId, showRevoked));
  const mint = useMintApiKey(tenantId);
  const revoke = useRevokeApiKey(tenantId);
  const rotate = useRotateEvalKey(tenantId);
  const [rotating, setRotating] = useState(false);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyInfo | null>(null);
  const perms = usePermissions();
  const canWrite = perms.can('api_keys.write', tenantId);
  const canGrantNodes = perms.can('nodes.run', tenantId);
  const nodes = useQuery({
    ...nodesQuery(tenantId),
    enabled: canGrantNodes && perms.can('nodes.read', tenantId),
  });
  const assistants = [...new Set((nodes.data ?? []).map((n) => n.name))];
  // Null until the user changes it: then the narrowest default applies (UX-28).
  const [chosen, setAccess] = useState<KeyAccess | null>(null);
  const access = chosen ?? initialKeyAccess(assistants, canGrantNodes);
  // Remounts the access fields (and their text) after a key is minted.
  const [accessKey, setAccessKey] = useState(0);
  const invalidAccess = accessError(access);

  const closeRevoke = () => {
    setRevoking(null);
    revoke.reset();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (invalidAccess) return;
    const trimmed = name.trim();
    mint.mutate(
      { ...(trimmed ? { name: trimmed } : {}), ...accessBody(access, canGrantNodes) },
      {
        onSuccess: (k) => {
          setCreated(k);
          setName('');
          setAccess(null);
          setAccessKey((n) => n + 1);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1">
            App keys
            <Toggletip label="app keys" doc={doc('guides/api-keys', 'create')}>
              Applications send the key with every request to Caliban (as Authorization: Bearer
              cal_…). Also called API keys.
            </Toggletip>
          </span>
        }
        description="Each application calls Caliban with a key of this workspace."
        actions={
          <Checkbox
            label="Show revoked"
            checked={showRevoked}
            onChange={(e) => setShowRevoked(e.target.checked)}
          />
        }
      />
      {created && <NewKeyNotice created={created} onDismiss={() => setCreated(null)} />}
      {canWrite && (
        <form
          onSubmit={onSubmit}
          aria-label="Create an app key"
          className="flex flex-col gap-3 border-b border-border px-4 py-3"
        >
          <label className="flex max-w-md flex-col gap-1 text-[12.5px] font-medium">
            Key name
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. clinic-website"
            />
          </label>
          <div className="rounded-md border border-border p-3">
            <KeyAccessFields
              key={accessKey}
              tenantId={tenantId}
              value={access}
              onChange={(a) => {
                setAccess(a);
                mint.reset();
              }}
              disabled={mint.isPending}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              icon={<IconPlus size={14} />}
              loading={mint.isPending}
              disabled={invalidAccess != null}
            >
              Create key
            </Button>
            <p className="text-[12.5px] text-fg-muted" aria-live="polite">
              {describeAccess(access, canGrantNodes)}
            </p>
          </div>
          {mint.error ? (
            <div className="w-full">
              <FormError error={mint.error} />
            </div>
          ) : null}
        </form>
      )}
      {keys.isPending ? (
        <LoadingState rows={3} />
      ) : keys.isError && isNotFound(keys.error) ? (
        <TenantDeletedState tenantId={tenantId} />
      ) : keys.isError ? (
        <ErrorState error={keys.error} onRetry={() => void keys.refetch()} />
      ) : keys.data.length === 0 ? (
        <EmptyState
          title="No app keys yet"
          description={
            canWrite
              ? 'Create a key above so an application can call Caliban in this workspace.'
              : 'This workspace has no app keys yet.'
          }
          learnMore={doc('guides/api-keys', 'create')}
        />
      ) : (
        <Table label="App keys">
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Prefix</TH>
              <TH>Assistants</TH>
              <TH>Data it may read</TH>
              <TH>Created</TH>
              {showRevoked && <TH>Status</TH>}
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {keys.data.map((k) => {
              const revoked = Boolean(k.revoked_at);
              return (
                <TR key={k.id} className={cn(revoked && 'text-fg-subtle')}>
                  <TD className={cn('font-medium', revoked && 'line-through')}>
                    {k.name}
                    {k.purpose === 'eval' && (
                      <Badge
                        tone="info"
                        className="ml-2"
                        title="Managed by Caliban: tests run with this key. Applications cannot use it."
                      >
                        Test key
                      </Badge>
                    )}
                  </TD>
                  <TD className="font-mono text-[12px] text-fg-muted">{k.prefix}…</TD>
                  <TD>
                    <NodeAccessCell access={accessOf(k)} />
                  </TD>
                  <TD
                    className="max-w-56 truncate text-fg-muted"
                    title={k.datasource_scopes?.join(', ')}
                  >
                    {k.datasource_scopes?.length ? (
                      <span className="font-mono text-[12px]">
                        {k.datasource_scopes.join(', ')}
                      </span>
                    ) : (
                      <span>Each assistant&apos;s own</span>
                    )}
                  </TD>
                  <TD className="text-fg-muted">{formatDateTime(k.created_at)}</TD>
                  {showRevoked && (
                    <TD>
                      {revoked ? (
                        <span className="inline-flex items-center gap-2">
                          <Badge>Revoked</Badge>
                          <span className="text-fg-subtle">{formatDateTime(k.revoked_at)}</span>
                        </span>
                      ) : (
                        <span className="text-fg-muted">Active</span>
                      )}
                    </TD>
                  )}
                  <TD className="text-right whitespace-nowrap">
                    {!revoked && canWrite && k.purpose === 'eval' && (
                      <Button
                        size="sm"
                        aria-label={`Rotate the test key ${k.name}`}
                        onClick={() => {
                          rotate.reset();
                          setRotating(true);
                        }}
                      >
                        Rotate
                      </Button>
                    )}
                    {!revoked && canWrite && k.purpose !== 'eval' && (
                      <Button
                        size="sm"
                        variant="danger"
                        aria-label={`Revoke ${k.name}`}
                        onClick={() => setRevoking(k)}
                      >
                        Revoke
                      </Button>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      <ConfirmDialog
        open={rotating}
        title="Rotate the test key?"
        confirmLabel="Rotate test key"
        loading={rotate.isPending}
        error={rotate.error}
        onCancel={() => setRotating(false)}
        onConfirm={() => rotate.mutate(undefined, { onSuccess: () => setRotating(false) })}
      >
        <p>
          The test key is revoked and a new one created. It is never shown: Caliban keeps it for
          tests. Tests already running lose their key, so rotate between test runs.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={revoking !== null}
        title="Revoke this app key?"
        confirmLabel="Revoke key"
        loading={revoke.isPending}
        error={revoke.error}
        onCancel={closeRevoke}
        onConfirm={() => {
          // A 404 (already revoked elsewhere) resolves too; the list refreshes either way.
          if (revoking) revoke.mutate(revoking.id, { onSuccess: closeRevoke });
        }}
      >
        <p>
          Revoke <span className="font-medium">{revoking?.name}</span> (
          <code className="font-mono">{revoking?.prefix}…</code>)? Apps that use it lose access.
        </p>
        <p>
          The key stops working within seconds (at most about 10 s on a gateway that runs apart from
          the admin service). A revoked key cannot be restored.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
