import { useId, useState, type FormEvent } from 'react';
import { useUpdateTenant } from '@/api/queries';
import type { PiiPattern, Tenant, TenantUpdate } from '@/api/types';
import { formatInt } from '@/lib/format';
import {
  formatDictionary,
  MAX_PII_PATTERNS,
  parseDictionary,
  patternError,
  PII_BUILTIN_LABELS,
  sameList,
} from '@/lib/piiDetectors';
import { Button, Field, FormError, Input, Textarea } from '../ui';
import { IconPlus, IconTrash } from '../ui/icons';
import { useSavedTenant } from './use-saved-tenant';

interface Draft {
  patterns: PiiPattern[];
  dictionary: string;
}

function savedDraft(t: Tenant): Draft {
  return { patterns: t.pii_patterns ?? [], dictionary: formatDictionary(t.pii_dictionary ?? []) };
}

/**
 * The tenant's own personal-data rules (the deterministic first tier), on top
 * of the built-in detectors: regex patterns, and a dictionary of terms that
 * generic detectors miss (site names, internal codes, staff lists). Each list
 * is replaced as a whole with PATCH /tenants/{id}; the audit log records the
 * number of terms, never the terms.
 */
export function PiiDetectorsSection({
  tenant,
  readOnly = false,
}: {
  tenant: Tenant;
  readOnly?: boolean;
}) {
  const update = useUpdateTenant(tenant.id);
  const headingId = useId();
  const listId = useId();
  const { current, saved: showSaved } = useSavedTenant(tenant);
  const saved = savedDraft(current);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const values = draft ?? saved;
  const deleted = tenant.status === 'deleted';
  const locked = deleted || readOnly || update.isPending;

  const patternErrors = values.patterns.map(patternError);
  const dictionary = parseDictionary(values.dictionary);
  const savedTerms = current.pii_dictionary ?? [];
  const body: TenantUpdate = {};
  if (!sameList(values.patterns, saved.patterns)) body.pii_patterns = values.patterns;
  if (dictionary.ok && !sameList(dictionary.terms, savedTerms)) {
    body.pii_dictionary = dictionary.terms;
  }
  const invalid = !dictionary.ok || patternErrors.some(Boolean);
  const dirty =
    draft != null && (Object.keys(body).length > 0 || values.dictionary !== saved.dictionary);

  const edit = (patch: Partial<Draft>) => {
    setDraft({ ...values, ...patch });
    setSavedNotice(false);
    update.reset();
  };
  const setPattern = (i: number, patch: Partial<PiiPattern>) =>
    edit({ patterns: values.patterns.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (locked || invalid) return;
    if (Object.keys(body).length === 0) {
      setDraft(null);
      return;
    }
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
      className="mt-6 rounded-lg border border-border bg-surface"
    >
      <div className="border-b border-border px-4 py-2.5">
        <h2 id={headingId} className="text-[13px] font-semibold text-fg">
          Personal data detectors
        </h2>
        <p className="text-[12px] text-fg-muted">
          {deleted
            ? 'This tenant was deleted. Its detectors can no longer be changed.'
            : readOnly
              ? 'Read only: your role cannot change these detectors.'
              : "This tenant's own rules, applied with the built-in detectors before any model call. What they match is protected like any personal data, in the tenant's PII mode."}
        </p>
      </div>
      <form
        onSubmit={onSubmit}
        aria-label="Personal data detectors"
        className="flex flex-col gap-5 p-4"
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-medium text-fg">Patterns</legend>
          <p className="text-[12px] text-fg-subtle">
            Regular expressions in the Rust regex syntax (no lookaround or backreferences), at most{' '}
            {MAX_PII_PATTERNS}. A built-in label ({PII_BUILTIN_LABELS.join(', ')}) uses its
            surrogates; any other label gets stand-ins of the same shape.
          </p>
          <datalist id={listId}>
            {PII_BUILTIN_LABELS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          {values.patterns.length === 0 && (
            <p className="text-[12.5px] text-fg-muted">No patterns of its own.</p>
          )}
          {values.patterns.map((p, i) => (
            <div key={i} className="grid grid-cols-[10rem_1fr_auto] items-start gap-2">
              <Input
                aria-label={`Label of pattern ${i + 1}`}
                list={listId}
                value={p.label}
                disabled={locked}
                placeholder="MRN"
                onChange={(e) => setPattern(i, { label: e.target.value.trim() })}
                className="font-mono"
              />
              <span className="flex flex-col gap-1">
                <Input
                  aria-label={`Pattern ${i + 1}`}
                  aria-invalid={patternErrors[i] != null}
                  value={p.pattern}
                  disabled={locked}
                  placeholder="MRN-\d{6}"
                  spellCheck={false}
                  onChange={(e) => setPattern(i, { pattern: e.target.value })}
                  className="font-mono"
                />
                {patternErrors[i] && (
                  <span className="text-[12px] text-danger">{patternErrors[i]}</span>
                )}
              </span>
              {!readOnly && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<IconTrash size={14} />}
                  aria-label={`Remove pattern ${i + 1}`}
                  disabled={locked}
                  onClick={() => edit({ patterns: values.patterns.filter((_, j) => j !== i) })}
                />
              )}
            </div>
          ))}
          {!readOnly && (
            <span>
              <Button
                size="sm"
                icon={<IconPlus size={14} />}
                disabled={locked || values.patterns.length >= MAX_PII_PATTERNS}
                onClick={() => edit({ patterns: [...values.patterns, { label: '', pattern: '' }] })}
              >
                Add pattern
              </Button>
            </span>
          )}
        </fieldset>
        <Field
          label="Dictionary"
          error={dictionary.ok ? undefined : dictionary.error}
          hint={`One term per line, as LABEL: term. Matched as whole words, ignoring case. ${formatInt(
            dictionary.ok ? dictionary.terms.length : savedTerms.length,
          )} terms.`}
        >
          {({ id, describedBy, invalid: bad }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              aria-invalid={bad}
              value={values.dictionary}
              disabled={locked}
              rows={8}
              spellCheck={false}
              placeholder={'ORG: Northwind Clinic\nLOCATION: Building C\nSTAFF_ID: K-1207'}
              onChange={(e) => edit({ dictionary: e.target.value })}
              className="font-mono text-[12px]"
            />
          )}
        </Field>
        <FormError error={update.error} />
        {!readOnly && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p role="status" className="mr-auto text-[12.5px] text-fg-muted">
              {dirty ? 'Unsaved changes' : savedNotice ? 'Detectors saved.' : ''}
            </p>
            <Button
              onClick={() => {
                setDraft(null);
                update.reset();
              }}
              disabled={!dirty || locked}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={update.isPending}
              disabled={!dirty || deleted || invalid}
            >
              Save
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}
