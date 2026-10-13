import { useId, useState, type FormEvent } from 'react';
import { useUpdateTenant } from '@/api/queries';
import {
  SURROGATE_SCOPES,
  type PiiMode,
  type SemanticCacheMode,
  type SurrogateScope,
  type Tenant,
  type TenantUpdate,
} from '@/api/types';
import { cn } from '@/lib/cn';
import { doc } from '@/lib/docs';
import { PII_MODE_LABEL, PII_MODE_OPTIONS, SURROGATE_SCOPE_LABEL } from '@/lib/labels';
import { Advanced } from '../help/advanced';
import { LearnMore } from '../help/learn-more';
import { Toggletip } from '../help/toggletip';
import { Button, Field, FormError, Input, Select, Switch } from '../ui';
import { useSavedTenant } from './use-saved-tenant';

/** What each mode does, on one example sentence (static: a live preview needs a core dry run). */
const PII_MODE_EXAMPLE: Record<PiiMode, string> = {
  reversible:
    'The model reads "Call [PERSON_1] on [PHONE_1]"; the caller gets the answer with the real name and number back.',
  mask: 'The model reads "Call [PERSON] on [PHONE]", and the caller sees [PHONE] in the answer too.',
  off: 'The model reads the text as written. Only for models on your own servers.',
};

interface Settings {
  pii_default: PiiMode;
  pii_surrogate_scope: SurrogateScope;
  /** The PII mode also applies to sovereign and attested (t0, t1) models. */
  pii_on_sovereign: boolean;
  semantic_cache: SemanticCacheMode;
  /**
   * Share of the flat caliban/auto price billed for a cache hit, as a percent
   * in a text field. Empty: no override, the deployment value applies.
   */
  cache_hit_percent: string;
}

/** The tenant's saved values, with the server defaults for absent fields. */
function savedSettings(t: Tenant): Settings {
  const f = t.auto_cache_hit_fraction;
  return {
    pii_default: t.pii_default ?? 'reversible',
    pii_surrogate_scope: t.pii_surrogate_scope ?? 'tenant',
    pii_on_sovereign: t.pii_on_sovereign ?? false,
    semantic_cache: t.semantic_cache ?? 'off',
    // Rounded so 0.1 shows as 10, not 10.000000000000002.
    cache_hit_percent: f == null ? '' : String(Number((f * 100).toFixed(4))),
  };
}

/** An error message, or null when the percent is empty (no override) or in 0..100. */
function cacheHitPercentError(raw: string): string | null {
  const v = raw.trim();
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100
    ? null
    : 'Enter a percentage from 0 to 100, or leave it empty for the deployment default.';
}

/** Only the fields that differ, so the PATCH (and its audit row) is minimal. */
function changes(saved: Settings, draft: Settings): TenantUpdate {
  const body: TenantUpdate = {};
  if (draft.pii_default !== saved.pii_default) body.pii_default = draft.pii_default;
  if (draft.pii_surrogate_scope !== saved.pii_surrogate_scope) {
    body.pii_surrogate_scope = draft.pii_surrogate_scope;
  }
  if (draft.pii_on_sovereign !== saved.pii_on_sovereign) {
    body.pii_on_sovereign = draft.pii_on_sovereign;
  }
  if (draft.semantic_cache !== saved.semantic_cache) body.semantic_cache = draft.semantic_cache;
  const pct = draft.cache_hit_percent.trim();
  if (pct === '') {
    // Clearing the override sends null; it was already unset otherwise.
    if (saved.cache_hit_percent !== '') body.auto_cache_hit_fraction = null;
  } else if (saved.cache_hit_percent === '' || Number(pct) !== Number(saved.cache_hit_percent)) {
    body.auto_cache_hit_fraction = Number(pct) / 100;
  }
  return body;
}

/**
 * "Privacy and caching" settings on the tenant detail page: PII default,
 * surrogate scope, PII on sovereign models, the semantic cache and the
 * caliban/auto cache-hit price.
 * Saved with PATCH /tenants/{id},
 * which the server audits as `tenant.update`.
 */
export function TenantSettingsSection({
  tenant,
  readOnly = false,
}: {
  tenant: Tenant;
  /** The signed-in user's roles cannot change the tenant: shown, not editable. */
  readOnly?: boolean;
}) {
  const update = useUpdateTenant(tenant.id);
  const headingId = useId();
  // The PATCH response until the `tenant` prop catches up (no flash of the old values).
  const { current, saved: showSaved } = useSavedTenant(tenant);
  const saved = savedSettings(current);
  // `null` while nothing is edited: the form then follows the saved tenant.
  const [draft, setDraft] = useState<Settings | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const values = draft ?? saved;
  const percentError = cacheHitPercentError(values.cache_hit_percent);
  const body = percentError ? {} : changes(saved, values);
  const dirty = draft != null && (percentError != null || Object.keys(body).length > 0);
  const deleted = tenant.status === 'deleted';
  const locked = deleted || readOnly || update.isPending;

  const edit = (patch: Partial<Settings>) => {
    setDraft({ ...values, ...patch });
    setSavedNotice(false);
    update.reset();
  };

  const cancel = () => {
    setDraft(null);
    update.reset();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || locked || percentError) return;
    update.mutate(body, {
      onSuccess: (after) => {
        showSaved(after);
        setDraft(null);
        setSavedNotice(true);
      },
    });
  };

  return (
    <section
      aria-labelledby={headingId}
      className="mt-4 rounded-lg border first:mt-0 border-border bg-surface"
    >
      <div className="border-b border-border px-4 py-2.5">
        <h2 id={headingId} className="text-[13px] font-semibold text-fg">
          Personal data and reuse of answers
        </h2>
        <p className="text-[12px] text-fg-muted">
          {deleted
            ? 'This workspace was deleted. Its settings can no longer be changed.'
            : readOnly
              ? 'Read only: your role cannot change these settings.'
              : 'Applies to new requests within seconds. Every change is recorded in the audit log.'}
        </p>
      </div>
      <form
        onSubmit={onSubmit}
        aria-label="Personal data settings"
        className="flex flex-col gap-4 p-4"
      >
        <fieldset className="flex flex-col gap-2" disabled={locked}>
          <legend className="mb-1 flex items-center gap-1 text-[12.5px] font-medium text-fg">
            How personal data is protected
            <Toggletip label="personal data modes" doc={doc('guides/privacy', 'modes')}>
              Names, ID numbers, phone numbers and similar are found before a model sees the text.
              Also called the PII default mode.
            </Toggletip>
          </legend>
          {PII_MODE_OPTIONS.map((m) => (
            <label
              key={m}
              className={cn(
                'flex cursor-pointer gap-2.5 rounded-md border p-3 text-[13px]',
                values.pii_default === m ? 'border-accent bg-accent-soft' : 'border-border-strong',
              )}
            >
              <input
                type="radio"
                name={`${headingId}-pii`}
                value={m}
                checked={values.pii_default === m}
                onChange={() => edit({ pii_default: m })}
                className="mt-0.5 accent-accent"
              />
              <span className="min-w-0">
                <span className="block font-medium">
                  {PII_MODE_LABEL[m]}
                  {m === 'reversible' && (
                    <span className="ml-2 text-[12px] font-normal text-fg-muted">Recommended</span>
                  )}
                </span>
                <span className="block text-[12.5px] text-fg-muted">{PII_MODE_EXAMPLE[m]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Advanced
          summary={`${SURROGATE_SCOPE_LABEL[values.pii_surrogate_scope]}; models on your servers ${
            values.pii_on_sovereign ? 'also get' : 'get'
          } ${values.pii_on_sovereign ? 'hidden data' : 'the text as is'}; reuse of answers ${
            values.semantic_cache === 'on' ? 'on' : 'off'
          }`}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Placeholder consistency"
              hint="Across the workspace, the same name always gets the same placeholder, so repeated questions can be answered from the cache, but the model provider can link conversations through them. For each conversation, placeholders are new every time and the cache is skipped when personal data is present. Also called surrogate scope."
            >
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={values.pii_surrogate_scope}
                  disabled={locked}
                  onChange={(e) => edit({ pii_surrogate_scope: e.target.value as SurrogateScope })}
                >
                  {SURROGATE_SCOPES.map((sc) => (
                    <option key={sc} value={sc}>
                      {SURROGATE_SCOPE_LABEL[sc]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label="Also hide personal data from models on your servers"
              hint="Off by default: models on your own servers or in a verified enclave get the text as is. On applies the mode above to them too. Outside models always get it, and an assistant's own personal data setting applies to every model."
            >
              {({ id, describedBy }) => (
                <Switch
                  id={id}
                  aria-describedby={describedBy}
                  checked={values.pii_on_sovereign}
                  disabled={locked}
                  onChange={(on) => edit({ pii_on_sovereign: on })}
                />
              )}
            </Field>
            <Field
              label="Reuse answers to similar questions"
              hint="Answers a request with the answer to an earlier, similar one from this workspace. Your IT administrator must also turn it on for the installation."
            >
              {({ id, describedBy }) => (
                <Switch
                  id={id}
                  aria-describedby={describedBy}
                  checked={values.semantic_cache === 'on'}
                  disabled={locked}
                  onChange={(on) => edit({ semantic_cache: on ? 'on' : 'off' })}
                />
              )}
            </Field>
            <Field
              label="Price of a reused answer (%)"
              error={percentError}
              hint="Share of the automatic routing price charged when a reused answer means no model is called. Empty: the installation's default, 20% unless your administrator changed it."
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  inputMode="decimal"
                  placeholder="Installation default"
                  value={values.cache_hit_percent}
                  disabled={locked}
                  onChange={(e) => edit({ cache_hit_percent: e.target.value })}
                />
              )}
            </Field>
          </div>
          <p className="text-[12px] text-fg-muted">
            For administrators: reuse of answers also needs{' '}
            <code className="font-mono">[cache.semantic] enabled</code> in the deployment config;
            the default price is{' '}
            <code className="font-mono">[routing] auto_cache_hit_fraction</code>.{' '}
            <LearnMore doc={doc('reference/configuration')}>Configuration reference</LearnMore>
          </p>
        </Advanced>
        <FormError error={update.error} />
        {!readOnly && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {/* Always mounted so screen readers announce the change. */}
            <p role="status" className="mr-auto text-[12.5px] text-fg-muted">
              {dirty ? 'Unsaved changes' : savedNotice ? 'Settings saved.' : ''}
            </p>
            <Button onClick={cancel} disabled={!dirty || locked}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={update.isPending}
              disabled={!dirty || deleted || percentError != null}
            >
              Save
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}
