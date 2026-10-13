import { useQuery } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { providersQuery, useCreateModel } from '@/api/queries';
import { MODEL_KINDS, TRUST_TIERS, type ModelKind, type TrustTier } from '@/api/types';
import { Advanced } from '@/components/help/advanced';
import { TermTip } from '@/components/help/toggletip';
import { Button, Field, FormError, Input, Select } from '@/components/ui';
import { MODEL_KIND_LABEL, TRUST_TIER_HINT, TRUST_TIER_LABEL } from '@/lib/labels';
import {
  emptyModelDraft,
  hasErrors,
  modelBody,
  validateModel,
  type FieldErrors,
  type ModelDraft,
  type ModelField,
} from '@/lib/modelForm';
import { CapabilitiesFields } from './capabilities-fields';

/**
 * Add a model by hand. The basics come first; family, licence, context
 * window, prices and capabilities (usually filled by discovery) are under
 * Advanced.
 */
export function ModelForm({ onDone }: { onDone: () => void }) {
  const create = useCreateModel();
  const servers = useQuery(providersQuery());
  const listId = useId();
  const [d, setD] = useState<ModelDraft>(emptyModelDraft);
  const [errors, setErrors] = useState<FieldErrors<ModelField>>({});
  const [tierTouched, setTierTouched] = useState(false);

  const set = (patch: Partial<ModelDraft>) => {
    setD((prev) => ({ ...prev, ...patch }));
    // Clear a field's error as soon as it is edited.
    setErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(patch)) delete next[k as ModelField];
      return next;
    });
  };

  const onProvider = (provider: string) => {
    const server = servers.data?.find((s) => s.id === provider.trim());
    // Inherit the server's trust tier unless the admin has picked one.
    set(server && !tierTouched ? { provider, trustTier: server.trust_tier } : { provider });
  };

  const advancedErrors = Boolean(errors.contextWindow || errors.priceIn || errors.priceOut);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validateModel(d);
    setErrors(errs);
    if (hasErrors(errs)) return;
    create.mutate(modelBody(d), { onSuccess: onDone });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" aria-label="Add model">
      <Field
        label="Model ID"
        required
        error={errors.id}
        hint="The name apps send as model, for example local/qwen3-8b."
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={d.id}
            onChange={(e) => set({ id: e.target.value })}
            placeholder="local/qwen3-8b"
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        )}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Server"
          required
          error={errors.provider}
          hint="One of your model servers, or a workspace's own provider account."
        >
          {({ id, describedBy, invalid }) => (
            <>
              <Input
                id={id}
                list={listId}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                value={d.provider}
                onChange={(e) => onProvider(e.target.value)}
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <datalist id={listId}>
                {servers.data?.map((s) => (
                  <option key={s.id} value={s.id} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field
          label="Name on the server"
          required
          error={errors.upstreamModel}
          hint="The model name the server expects."
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={d.upstreamModel}
              onChange={(e) => set({ upstreamModel: e.target.value })}
              placeholder="Qwen/Qwen3-8B"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </Field>
        <Field label="Kind">
          {({ id }) => (
            <Select
              id={id}
              value={d.kind}
              onChange={(e) => set({ kind: e.target.value as ModelKind })}
            >
              {MODEL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {MODEL_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Where it runs"
          required
          hint={
            <>
              {TRUST_TIER_HINT[d.trustTier]} <TermTip term="trustLevel" />
            </>
          }
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={d.trustTier}
              onChange={(e) => {
                setTierTouched(true);
                set({ trustTier: e.target.value as TrustTier });
              }}
            >
              {TRUST_TIERS.map((t) => (
                <option key={t} value={t}>
                  {TRUST_TIER_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Advanced
        key={String(advancedErrors)}
        defaultOpen={advancedErrors}
        summary="Filled by discovery; prices blank for your own servers"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Family" hint="For example qwen3, llama3, bge.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={d.family}
                onChange={(e) => set({ family: e.target.value })}
                className="font-mono"
              />
            )}
          </Field>
          <Field label="Licence" hint="From the model card, for example Apache-2.0.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={d.licence}
                onChange={(e) => set({ licence: e.target.value })}
              />
            )}
          </Field>
          <Field
            label="Context window"
            error={errors.contextWindow}
            hint="In tokens (about 0.75 words each)."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="numeric"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                value={d.contextWindow}
                onChange={(e) => set({ contextWindow: e.target.value })}
                placeholder="32768"
              />
            )}
          </Field>
          <Field
            label="Price in (USD per million tokens)"
            error={errors.priceIn}
            hint="Blank for models on your own servers."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="decimal"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                value={d.priceIn}
                onChange={(e) => set({ priceIn: e.target.value })}
              />
            )}
          </Field>
          <Field label="Price out (USD per million tokens)" error={errors.priceOut}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="decimal"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                value={d.priceOut}
                onChange={(e) => set({ priceOut: e.target.value })}
              />
            )}
          </Field>
        </div>
        <CapabilitiesFields
          value={d.capabilities}
          onChange={(capabilities) => set({ capabilities })}
        />
      </Advanced>
      <FormError error={create.error} />
      <div className="flex justify-end gap-2">
        <Button onClick={() => onDone()}>Cancel</Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          Add model
        </Button>
      </div>
    </form>
  );
}
