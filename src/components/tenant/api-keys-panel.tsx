import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { usePermissions } from '@/api/auth';
import { apiKeysQuery, useMintApiKey, useRevokeApiKey } from '@/api/queries';
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
  DEFAULT_KEY_ACCESS,
  describeAccess,
  type KeyAccess,
} from '@/lib/apiKeys';
import { formatDateTime } from '@/lib/format';
import { KeyAccessFields } from './key-access-fields';
import { TenantDeletedState } from './tenant-deleted-state';

/** One-time reveal of a freshly minted key. Plaintext lives only in component state. */
function NewKeyNotice({ created, onDismiss }: { created: ApiKeyCreated; onDismiss: () => void }) {
  return (
    <div
      role="region"
      aria-label="New API key"
      className="mx-4 mt-4 rounded-md border border-warn/50 bg-warn-soft p-3"
    >
      <p className="flex items-center gap-2 text-[13px] font-medium text-fg">
        <IconAlert className="text-warn" />
        Copy this key now. It will not be shown again.
      </p>
      <p className="mt-0.5 text-[12.5px] text-fg-muted">
        Caliban stores only a SHA-256 hash of{' '}
        <span className="font-medium text-fg">{created.name}</span>.
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
    </div>
  );
}

/** A key's node allowlist: every published node, none, or the names. */
function NodeAccessCell({ access }: { access: KeyAccess }) {
  if (access.nodes === 'all') {
    return <span className="text-fg-muted">All published</span>;
  }
  if (access.nodes === 'none') return <Badge>None</Badge>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {access.names.map((n) => (
        <Badge key={n} tone="info" className="font-mono">
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
  const [name, setName] = useState('');
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyInfo | null>(null);
  const perms = usePermissions();
  const canWrite = perms.can('api_keys.write', tenantId);
  const canGrantNodes = perms.can('nodes.run', tenantId);
  const [access, setAccess] = useState<KeyAccess>(DEFAULT_KEY_ACCESS);
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
          setAccess(DEFAULT_KEY_ACCESS);
          setAccessKey((n) => n + 1);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader
        title="Caliban API keys"
        description="Apps send these as Authorization: Bearer cal_… to the data plane."
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
          className="flex flex-wrap items-end gap-2 border-b border-border px-4 py-3"
        >
          <label className="flex min-w-56 flex-1 flex-col gap-1 text-[12.5px] font-medium">
            Key name
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. billing-service-prod"
            />
          </label>
          <Button
            type="submit"
            variant="primary"
            icon={<IconPlus size={14} />}
            loading={mint.isPending}
            disabled={invalidAccess != null}
          >
            Mint key
          </Button>
          <details className="w-full rounded-md border border-border">
            <summary className="cursor-pointer px-3 py-2 text-[12.5px] text-fg-muted hover:text-fg">
              <span className="font-medium text-fg">Node access</span>:{' '}
              {describeAccess(access, canGrantNodes)}
            </summary>
            <div className="border-t border-border p-3">
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
          </details>
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
          title="No API keys"
          description={
            canWrite
              ? 'Mint a key to let an application call Caliban as this tenant.'
              : 'This tenant has no API keys yet.'
          }
        />
      ) : (
        <Table label="API keys">
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Prefix</TH>
              <TH>Nodes</TH>
              <TH>Datasource scopes</TH>
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
                  <TD className={cn('font-medium', revoked && 'line-through')}>{k.name}</TD>
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
                      <span title="Every scope of the nodes it runs">Nodes&apos; scopes</span>
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
                    {!revoked && canWrite && (
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
        open={revoking !== null}
        title="Revoke API key?"
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
          The key stops working immediately in standalone mode, and within one snapshot poll
          interval (10 s by default) on split-mode routers. A revoked key cannot be restored.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
