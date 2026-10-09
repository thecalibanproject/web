import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiKeysQuery, useMintApiKey } from '@/api/queries';
import type { ApiKeyCreated } from '@/api/types';
import {
  Button,
  Card,
  CardHeader,
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
import { formatDateTime } from '@/lib/format';

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

export function ApiKeysPanel({ tenantId }: { tenantId: string }) {
  const keys = useQuery(apiKeysQuery(tenantId));
  const mint = useMintApiKey(tenantId);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    mint.mutate(name.trim(), {
      onSuccess: (k) => {
        setCreated(k);
        setName('');
      },
    });
  };

  return (
    <Card>
      <CardHeader
        title="Caliban API keys"
        description="Apps send these as Authorization: Bearer cal_… to the data plane."
      />
      {created && <NewKeyNotice created={created} onDismiss={() => setCreated(null)} />}
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
        >
          Mint key
        </Button>
        {mint.error ? (
          <div className="w-full">
            <FormError error={mint.error} />
          </div>
        ) : null}
      </form>
      {keys.isPending ? (
        <LoadingState rows={3} />
      ) : keys.isError ? (
        <ErrorState error={keys.error} onRetry={() => void keys.refetch()} />
      ) : keys.data.length === 0 ? (
        <EmptyState
          title="No API keys"
          description="Mint a key to let an application call Caliban as this tenant."
        />
      ) : (
        <Table label="API keys">
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Prefix</TH>
              <TH>Created</TH>
            </tr>
          </THead>
          <TBody>
            {keys.data.map((k) => (
              <TR key={k.id}>
                <TD className="font-medium">{k.name}</TD>
                <TD className="font-mono text-[12px] text-fg-muted">{k.prefix}…</TD>
                <TD className="text-fg-muted">{formatDateTime(k.created_at)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
