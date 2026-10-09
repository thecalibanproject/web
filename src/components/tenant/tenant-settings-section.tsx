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
import { PII_MODE_LABEL, PII_MODE_OPTIONS, SURROGATE_SCOPE_LABEL } from '@/lib/labels';
import { Button, Field, FormError, Select, Switch } from '../ui';

interface Settings {
  pii_default: PiiMode;
  pii_surrogate_scope: SurrogateScope;
  semantic_cache: SemanticCacheMode;
}

/** The tenant's saved values, with the server defaults for absent fields. */
function savedSettings(t: Tenant): Settings {
  return {
    pii_default: t.pii_default ?? 'reversible',
    pii_surrogate_scope: t.pii_surrogate_scope ?? 'tenant',
    semantic_cache: t.semantic_cache ?? 'off',
  };
}

/** Only the fields that differ, so the PATCH (and its audit row) is minimal. */
function changes(saved: Settings, draft: Settings): TenantUpdate {
  const body: TenantUpdate = {};
  if (draft.pii_default !== saved.pii_default) body.pii_default = draft.pii_default;
  if (draft.pii_surrogate_scope !== saved.pii_surrogate_scope) {
    body.pii_surrogate_scope = draft.pii_surrogate_scope;
  }
  if (draft.semantic_cache !== saved.semantic_cache) body.semantic_cache = draft.semantic_cache;
  return body;
}

/**
 * "Privacy and caching" settings on the tenant detail page: PII default,
 * surrogate scope and the semantic cache. Saved with PATCH /tenants/{id},
 * which the server audits as `tenant.update`.
 */
export function TenantSettingsSection({ tenant }: { tenant: Tenant }) {
  const update = useUpdateTenant(tenant.id);
  const headingId = useId();
  const saved = savedSettings(tenant);
  // `null` while nothing is edited: the form then follows the saved tenant.
  const [draft, setDraft] = useState<Settings | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const values = draft ?? saved;
  const body = changes(saved, values);
  const dirty = Object.keys(body).length > 0;
  const deleted = tenant.status === 'deleted';
  const locked = deleted || update.isPending;

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
    if (!dirty || locked) return;
    update.mutate(body, {
      onSuccess: () => {
        setDraft(null);
        setSavedNotice(true);
      },
    });
  };

  return (
    <section
      aria-labelledby={headingId}
      className="mt-6 rounded-lg border border-border bg-surface"
    >
      <div className="border-b border-border px-4 py-2.5">
        <h2 id={headingId} className="text-[13px] font-semibold text-fg">
          Privacy and caching
        </h2>
        <p className="text-[12px] text-fg-muted">
          {deleted
            ? 'This tenant was deleted. Its settings can no longer be changed.'
            : 'Applies to new requests once routers pick up the change. Every change is recorded in the audit log.'}
        </p>
      </div>
      <form
        onSubmit={onSubmit}
        aria-label="Privacy and caching settings"
        className="flex flex-col gap-4 p-4"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field
            label="PII default mode"
            hint="Reversible pseudonymizes before the model and restores in the response."
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={values.pii_default}
                disabled={locked}
                onChange={(e) => edit({ pii_default: e.target.value as PiiMode })}
              >
                {PII_MODE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {PII_MODE_LABEL[m]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Surrogate scope"
            hint="Tenant scope gives the same stand-in for the same value across requests, so repeated questions can hit the cache. The model provider can link this tenant's sessions through those stand-ins. Session scope gives fresh stand-ins per request and disables caching for requests that contain personal data."
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={values.pii_surrogate_scope}
                disabled={locked}
                onChange={(e) => edit({ pii_surrogate_scope: e.target.value as SurrogateScope })}
              >
                {SURROGATE_SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {SURROGATE_SCOPE_LABEL[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Semantic cache"
            hint={
              <>
                Answers a request with the response to an earlier, similar one. Answers are reused
                only within this tenant. Also requires{' '}
                <code className="font-mono">[cache.semantic] enabled</code> in the deployment
                config.
              </>
            }
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
        </div>
        <FormError error={update.error} />
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
            disabled={!dirty || deleted}
          >
            Save
          </Button>
        </div>
      </form>
    </section>
  );
}
