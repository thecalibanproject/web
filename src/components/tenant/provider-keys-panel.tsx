import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { usePermissions } from '@/api/auth';
import { providerKeysQuery, useCreateProviderKey, useDeleteProviderKey } from '@/api/queries';
import {
  PROVIDER_KINDS,
  TRUST_TIERS,
  type ProviderKey,
  type ProviderKind,
  type TrustTier,
} from '@/api/types';
import { TrustTierBadge } from '../badges';
import {
  Button,
  Card,
  CardHeader,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  Input,
  LoadingState,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../ui';
import { IconPlus, IconTrash } from '../ui/icons';
import { doc } from '@/lib/docs';
import { isNotFound } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { PROVIDER_LABEL, PROVIDER_SHORT, TRUST_TIER_HINT, TRUST_TIER_LABEL } from '@/lib/labels';
import { PROVIDER_RULES } from '@/lib/providerForm';
import { Toggletip } from '../help/toggletip';
import { TenantDeletedState } from './tenant-deleted-state';

export function ProviderKeyForm({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const create = useCreateProviderKey(tenantId);
  const [kind, setKind] = useState<ProviderKind>('openai_compatible');
  const [label, setLabel] = useState('');
  const [providerId, setProviderId] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [tier, setTier] = useState<TrustTier>(PROVIDER_RULES.openai_compatible.defaultTier);
  const rules = PROVIDER_RULES[kind];

  const onKind = (k: ProviderKind) => {
    setKind(k);
    setTier(PROVIDER_RULES[k].defaultTier);
    if (PROVIDER_RULES[k].baseUrl === 'hidden') setBaseUrl('');
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        kind,
        label: label.trim(),
        trust_tier: tier,
        ...(providerId.trim() ? { provider_id: providerId.trim() } : {}),
        ...(rules.baseUrl !== 'hidden' && baseUrl.trim() ? { base_url: baseUrl.trim() } : {}),
        ...(apiKey ? { api_key: apiKey } : {}),
      },
      {
        // The secret is write-only: drop it from memory whatever the outcome.
        onSettled: () => setApiKey(''),
        onSuccess: onDone,
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Add provider account">
      <Field label="Provider" required>
        {({ id }) => (
          <Select id={id} value={kind} onChange={(e) => onKind(e.target.value as ProviderKind)}>
            {PROVIDER_KINDS.map((k) => (
              <option key={k} value={k}>
                {PROVIDER_LABEL[k]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Label" required hint="How this credential appears in routing policy and logs.">
        {({ id, describedBy }) => (
          <Input
            id={id}
            required
            aria-describedby={describedBy}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={kind === 'openai_compatible' ? 'dc1-vllm-llama' : 'prod-openai'}
          />
        )}
      </Field>
      <Field
        label="Provider ID"
        hint="Referenced by the model catalogue (e.g. local-llm, openai). Defaults to the slugified label."
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            pattern="[a-z0-9][a-z0-9_\-]*"
            title="Lowercase letters, digits, hyphens and underscores"
            className="font-mono"
          />
        )}
      </Field>
      {rules.baseUrl !== 'hidden' && (
        <Field
          label="Base URL"
          required={rules.baseUrl === 'required'}
          hint={
            kind === 'openai_compatible'
              ? 'Your local server’s OpenAI-compatible /v1 endpoint.'
              : undefined
          }
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="url"
              required={rules.baseUrl === 'required'}
              aria-describedby={describedBy}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={rules.baseUrlPlaceholder}
              className="font-mono"
            />
          )}
        </Field>
      )}
      <Field
        label="API key"
        required={rules.apiKey === 'required'}
        hint={
          rules.apiKey === 'optional'
            ? 'Optional for local servers without a key. Encrypted and never shown again.'
            : 'Encrypted and never shown again. Only the last 4 characters are kept for display.'
        }
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            type="password"
            autoComplete="off"
            spellCheck={false}
            required={rules.apiKey === 'required'}
            aria-describedby={describedBy}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="font-mono"
          />
        )}
      </Field>
      <Field label="Where the model runs" required hint={TRUST_TIER_HINT[tier]}>
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={tier}
            onChange={(e) => setTier(e.target.value as TrustTier)}
          >
            {TRUST_TIERS.map((t) => (
              <option key={t} value={t}>
                {TRUST_TIER_LABEL[t]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <FormError error={create.error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" loading={create.isPending} disabled={!label.trim()}>
          Add provider account
        </Button>
      </div>
    </form>
  );
}

function DeleteKeyButton({ tenantId, pk }: { tenantId: string; pk: ProviderKey }) {
  const del = useDeleteProviderKey(tenantId);
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="ghost"
        icon={<IconTrash size={14} />}
        onClick={() => setConfirming(true)}
      >
        <span className="sr-only">Delete {pk.label}</span>
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button
        size="sm"
        variant="danger"
        loading={del.isPending}
        onClick={() => del.mutate(pk.id, { onSettled: () => setConfirming(false) })}
      >
        Delete
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </span>
  );
}

export function ProviderKeysPanel({ tenantId }: { tenantId: string }) {
  const keys = useQuery(providerKeysQuery(tenantId));
  const [adding, setAdding] = useState(false);
  const canWrite = usePermissions().can('provider_keys.write', tenantId);

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1">
            Provider accounts
            <Toggletip
              label="provider accounts"
              doc={doc('guides/workspaces', 'provider-accounts')}
            >
              Your own account with a model provider, or a model server of your own, used only by
              this workspace. Also called BYOK (bring your own key).
            </Toggletip>
          </span>
        }
        description="This workspace's own accounts with model providers, or its own model servers. Caliban never shares them with other workspaces."
        actions={
          canWrite && (
            <Button
              size="sm"
              variant="primary"
              icon={<IconPlus size={14} />}
              onClick={() => setAdding(true)}
            >
              Add provider account
            </Button>
          )
        }
      />
      {keys.isPending ? (
        <LoadingState rows={3} />
      ) : keys.isError && isNotFound(keys.error) ? (
        <TenantDeletedState tenantId={tenantId} />
      ) : keys.isError ? (
        <ErrorState error={keys.error} onRetry={() => void keys.refetch()} />
      ) : keys.data.length === 0 ? (
        <EmptyState
          title="No provider accounts"
          description="Optional: add your own account with a cloud provider, or a model server only this workspace uses. Without one, the workspace uses the models the administrator added."
          action={
            canWrite && (
              <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
                Add a provider account
              </Button>
            )
          }
          learnMore={doc('guides/workspaces', 'provider-accounts')}
        />
      ) : (
        <Table label="Provider accounts">
          <THead>
            <tr>
              <TH>Label</TH>
              <TH>Provider</TH>
              <TH>Endpoint</TH>
              <TH>Where the model runs</TH>
              <TH>Secret</TH>
              <TH>Created</TH>
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {keys.data.map((k) => (
              <TR key={k.id}>
                <TD className="font-medium">{k.label}</TD>
                <TD>{PROVIDER_SHORT[k.kind]}</TD>
                <TD
                  className="max-w-64 truncate font-mono text-[12px] text-fg-muted"
                  title={k.base_url ?? undefined}
                >
                  {k.base_url ?? 'default'}
                </TD>
                <TD>
                  <TrustTierBadge tier={k.trust_tier} />
                </TD>
                <TD className="font-mono text-[12px] text-fg-muted">
                  {k.last4 ? (
                    `••••${k.last4}`
                  ) : (
                    <span className="font-sans text-fg-subtle">none</span>
                  )}
                </TD>
                <TD className="text-fg-muted">{formatDate(k.created_at)}</TD>
                <TD className="text-right whitespace-nowrap">
                  {canWrite && <DeleteKeyButton tenantId={tenantId} pk={k} />}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Drawer
        open={adding}
        onClose={() => setAdding(false)}
        title="Add provider account"
        description="Keys are encrypted at rest and never shown again."
      >
        {adding && <ProviderKeyForm tenantId={tenantId} onDone={() => setAdding(false)} />}
      </Drawer>
    </Card>
  );
}
