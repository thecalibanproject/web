import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useUpdateTenant } from '@/api/queries';
import type { PiiPattern, Tenant, TenantUpdate } from '@/api/types';
import { formatInt } from '@/lib/format';
import {
  detectorCounts,
  formatDictionary,
  MAX_PII_PATTERNS,
  normalizeLabel,
  normalizePatterns,
  normalizeTerms,
  parseDictionary,
  patternError,
  PII_BUILTIN_LABELS,
  PII_LABEL_ALIASES,
  sameList,
} from '@/lib/piiDetectors';
import { doc } from '@/lib/docs';
import { Advanced } from '../help/advanced';
import { Toggletip } from '../help/toggletip';
import { Button, Field, FormError, Input, Textarea } from '../ui';
import { IconPlus, IconTrash } from '../ui/icons';
import { useSavedTenant } from './use-saved-tenant';

interface Draft {
  patterns: PiiPattern[];
  dictionary: string;
}

/** Labels are case-insensitive: the editor shows and writes them upper-cased. */
function savedDraft(t: Tenant): Draft {
  return {
    patterns: normalizePatterns(t.pii_patterns ?? []),
    dictionary: formatDictionary(normalizeTerms(t.pii_dictionary ?? [])),
  };
}

function Section({
  headingId,
  description,
  children,
}: {
  headingId: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className="mt-4 rounded-lg border first:mt-0 border-border bg-surface"
    >
      <div className="border-b border-border px-4 py-2.5">
        <h2 id={headingId} className="text-[13px] font-semibold text-fg">
          Your own personal data rules
        </h2>
        <p className="text-[12px] text-fg-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * The tenant's own personal-data rules (the deterministic first tier), on top
 * of the built-in detectors: regex patterns, and a dictionary of terms that
 * generic detectors miss (site names, internal codes, staff lists). Each list
 * is replaced as a whole with PATCH /tenants/{id}; the audit log records the
 * number of terms, never the terms.
 *
 * The lists come only to callers with `tenant.write` (the dictionary may hold
 * staff or customer names); everyone else gets their sizes. Without both
 * lists the section shows those sizes and offers no editor, since saving a
 * list the console never saw would replace it.
 */
export function PiiDetectorsSection({
  tenant,
  readOnly = false,
}: {
  tenant: Tenant;
  readOnly?: boolean;
}) {
  const headingId = useId();
  const listed = tenant.pii_patterns !== undefined && tenant.pii_dictionary !== undefined;
  if (readOnly || !listed) {
    const patterns = tenant.pii_patterns_count ?? tenant.pii_patterns?.length;
    const terms = tenant.pii_dictionary_count ?? tenant.pii_dictionary?.length;
    return (
      <Section
        headingId={headingId}
        description={
          readOnly
            ? 'Read only: your role cannot see or change these detectors.'
            : 'The patterns and terms did not come with the workspace, so they cannot be edited here.'
        }
      >
        <div className="flex flex-col gap-1 p-4 text-[13px]">
          <p className="text-fg">
            {patterns != null && terms != null
              ? detectorCounts(patterns, terms)
              : 'Not reported by the control plane.'}
          </p>
          <p className="text-[12px] text-fg-subtle">
            The workspace's own patterns and names are shown only to roles that can change the
            workspace: the list may hold staff or customer names.
          </p>
        </div>
      </Section>
    );
  }
  return <DetectorsEditor tenant={tenant} headingId={headingId} />;
}

function DetectorsEditor({ tenant, headingId }: { tenant: Tenant; headingId: string }) {
  const update = useUpdateTenant(tenant.id);
  const listId = useId();
  const { current, saved: showSaved } = useSavedTenant(tenant);
  const saved = savedDraft(current);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const values = draft ?? saved;
  const deleted = tenant.status === 'deleted';
  const locked = deleted || update.isPending;

  const patternErrors = values.patterns.map(patternError);
  const dictionary = parseDictionary(values.dictionary);
  const savedTerms = normalizeTerms(current.pii_dictionary ?? []);
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
    <Section
      headingId={headingId}
      description={
        deleted
          ? 'This workspace was deleted. Its rules can no longer be changed.'
          : "This workspace's own rules, applied with the built-in detection before any model call. What they match is protected like any personal data."
      }
    >
      <form
        onSubmit={onSubmit}
        aria-label="Your own personal data rules"
        className="flex flex-col gap-5 p-4"
      >
        <p className="-mb-3 flex items-center gap-1 text-[12px] text-fg-muted">
          <Toggletip label="names to always hide" doc={doc('guides/privacy', 'dictionary')}>
            Site names, internal codes or staff lists that general detection misses. Also called the
            PII dictionary.
          </Toggletip>
          What the names list is for
        </p>
        <Field
          label="Names to always hide"
          error={dictionary.ok ? undefined : dictionary.error}
          hint={`One per line, as KIND: name, such as ORG: Northwind Clinic. Matched as whole words, ignoring case. ${formatInt(
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
              dir="auto"
              onChange={(e) => edit({ dictionary: e.target.value })}
              className="font-mono text-[12px]"
            />
          )}
        </Field>
        <Advanced
          summary={
            values.patterns.length === 0
              ? 'No patterns of its own'
              : `${values.patterns.length} pattern${values.patterns.length === 1 ? '' : 's'} of its own`
          }
          defaultOpen={values.patterns.some((_, i) => patternErrors[i] != null)}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 flex items-center gap-1 text-[13px] font-medium text-fg">
              Your own identifier patterns
              <Toggletip label="identifier patterns" doc={doc('guides/privacy', 'custom-patterns')}>
                For ID formats the built-in detection does not know, such as a patient or matter
                number. Written as regular expressions.
              </Toggletip>
            </legend>
            <p className="text-[12px] text-fg-subtle">
              Regular expressions (Rust syntax: no lookaround or backreferences), at most{' '}
              {MAX_PII_PATTERNS}. Labels ignore case and are written upper-cased. A built-in label (
              {PII_BUILTIN_LABELS.join(', ')}, or {PII_LABEL_ALIASES.join(', ')}) uses its
              surrogates; any other label gets stand-ins of the same shape, and is masked as
              [LABEL].
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
                  onChange={(e) => setPattern(i, { label: normalizeLabel(e.target.value) })}
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
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<IconTrash size={14} />}
                  aria-label={`Remove pattern ${i + 1}`}
                  disabled={locked}
                  onClick={() => edit({ patterns: values.patterns.filter((_, j) => j !== i) })}
                />
              </div>
            ))}
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
          </fieldset>
        </Advanced>
        <FormError error={update.error} />
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
      </form>
    </Section>
  );
}
