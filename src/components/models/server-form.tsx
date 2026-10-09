import { useState, type FormEvent } from 'react';
import { useCreateProvider } from '@/api/queries';
import { PROVIDER_KINDS, TRUST_TIERS, type ProviderKind, type TrustTier } from '@/api/types';
import { Button, Checkbox, Field, FormError, Input, Select } from '@/components/ui';
import { PROVIDER_LABEL, TRUST_TIER_HINT, TRUST_TIER_LABEL } from '@/lib/labels';
import {
  hasErrors,
  serverBody,
  validateServer,
  type FieldErrors,
  type ServerDraft,
  type ServerField,
} from '@/lib/modelForm';

const EMPTY: ServerDraft = {
  id: '',
  kind: 'openai_compatible',
  baseUrl: '',
  trustTier: 't0_sovereign',
  cacheSalt: false,
  apiKey: '',
  tenants: '',
};

/** Register a shared model server (an on-prem pool every allowed tenant can use). */
export function ServerForm({ onDone }: { onDone: () => void }) {
  const create = useCreateProvider();
  const [d, setD] = useState<ServerDraft>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors<ServerField>>({});

  const set = (patch: Partial<ServerDraft>) => {
    setD((prev) => ({ ...prev, ...patch }));
    setErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(patch)) delete next[k as ServerField];
      return next;
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validateServer(d);
    setErrors(errs);
    if (hasErrors(errs)) return;
    create.mutate(serverBody(d), {
      // The key is write-only: drop it from memory whatever the outcome.
      onSettled: () => set({ apiKey: '' }),
      onSuccess: onDone,
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4"
      aria-label="Add model server"
    >
      <Field
        label="Server ID"
        required
        error={errors.id}
        hint="Referenced by catalogue models as their provider."
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={d.id}
            onChange={(e) => set({ id: e.target.value })}
            placeholder="qwen3-30b"
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        )}
      </Field>
      <Field label="Kind" required>
        {({ id }) => (
          <Select
            id={id}
            value={d.kind}
            onChange={(e) => set({ kind: e.target.value as ProviderKind })}
          >
            {PROVIDER_KINDS.map((k) => (
              <option key={k} value={k}>
                {PROVIDER_LABEL[k]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label="Base URL"
        required
        error={errors.baseUrl}
        hint="The server’s OpenAI-compatible /v1 endpoint, reachable from the data plane."
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="url"
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={d.baseUrl}
            onChange={(e) => set({ baseUrl: e.target.value })}
            placeholder="http://qwen3-30b:8000/v1"
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        )}
      </Field>
      <Field label="Trust tier" required hint={TRUST_TIER_HINT[d.trustTier]}>
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={d.trustTier}
            onChange={(e) => set({ trustTier: e.target.value as TrustTier })}
          >
            {TRUST_TIERS.map((t) => (
              <option key={t} value={t}>
                {TRUST_TIER_LABEL[t]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Checkbox
        label="Cache salt"
        hint="Isolate prefix cache per tenant (vLLM)"
        checked={d.cacheSalt}
        onChange={(e) => set({ cacheSalt: e.target.checked })}
      />
      <Field
        label="API key"
        hint="Optional, for servers started with --api-key. Write-only: sealed at rest, never shown again."
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            type="password"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={describedBy}
            value={d.apiKey}
            onChange={(e) => set({ apiKey: e.target.value })}
            className="font-mono"
          />
        )}
      </Field>
      <Field
        label="Tenant allow-list"
        hint="Optional. Comma-separated tenant ids. Leave empty to share with every tenant."
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            value={d.tenants}
            onChange={(e) => set({ tenants: e.target.value })}
            placeholder="acme, globex"
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        )}
      </Field>
      <FormError error={create.error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          Add server
        </Button>
      </div>
    </form>
  );
}
