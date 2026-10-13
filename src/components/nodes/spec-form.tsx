import { useQuery } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';
import { modelsQuery, ragCollectionsQuery } from '@/api/queries';
import { doc } from '@/lib/docs';
import {
  applyForm,
  AUTO_MODEL,
  libraryScope,
  specToForm,
  unsupportedParts,
  type SpecForm,
} from '@/lib/specForm';
import { Advanced } from '../help/advanced';
import { LearnMore } from '../help/learn-more';
import { TermTip } from '../help/toggletip';
import { Checkbox, Field, Input, Select, Textarea } from '../ui';
import { IconAlert } from '../ui/icons';

/**
 * The form view of an assistant's settings: the common fields in plain words,
 * written onto the full spec (nothing it does not show is dropped). The JSON
 * view next to it edits the same spec.
 */
export function SpecFormView({
  spec,
  onChange,
  tenantId,
}: {
  spec: Record<string, unknown>;
  onChange: (spec: Record<string, unknown>) => void;
  tenantId: string | undefined;
}) {
  const form = specToForm(spec);
  const set = (patch: Partial<SpecForm>) => onChange(applyForm(spec, { ...form, ...patch }));
  const unsupported = unsupportedParts(spec);
  const models = useQuery(modelsQuery());
  const libraries = useQuery({
    ...ragCollectionsQuery(tenantId ?? ''),
    enabled: Boolean(tenantId),
  });
  const chatModels = (models.data ?? []).filter((m) => m.kind === 'chat').map((m) => m.id);
  const [otherModel, setOtherModel] = useState(false);
  const modelKnown =
    !otherModel &&
    (form.model === '' || form.model === AUTO_MODEL || chatModels.includes(form.model));
  const libraryScopes = (libraries.data ?? []).map((c) => ({
    name: c.name,
    scope: libraryScope(c.name),
  }));
  const known = new Set(libraryScopes.map((l) => l.scope));
  const otherScopes = form.scopes.filter((s) => !known.has(s));
  // The typed text is kept as typed (a trailing comma included) while it
  // means the same list as the spec; a change from the JSON view replaces it.
  const [otherText, setOtherText] = useState(otherScopes.join(', '));
  const splitScopes = (t: string) =>
    t
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  if (splitScopes(otherText).join(',') !== otherScopes.join(',')) {
    setOtherText(otherScopes.join(', '));
  }
  const scopesHeading = useId();

  return (
    <div className="flex flex-col gap-4">
      {unsupported.length > 0 && (
        <div
          role="note"
          className="flex items-start gap-2 rounded-md border border-info/40 bg-info-soft px-3 py-2 text-[12.5px]"
        >
          <IconAlert size={14} className="mt-0.5 shrink-0 text-info" />
          <p>
            This version uses settings only the JSON view can edit: {unsupported.join(', ')}. The
            form keeps them as they are. <LearnMore doc={doc('guides/assistants', 'edit-json')} />
          </p>
        </div>
      )}

      <Field label="What it is for" hint="One sentence, shown in the list of assistants.">
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        )}
      </Field>

      <Field
        label="Instructions"
        hint="How it should behave and talk: the model reads this before every request."
      >
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            dir="auto"
            aria-describedby={describedBy}
            value={form.instructions}
            onChange={(e) => set({ instructions: e.target.value })}
            className="min-h-32"
          />
        )}
      </Field>

      <Field
        label="Model"
        hint="Automatic routing lets Caliban pick a model the workspace may use."
      >
        {({ id, describedBy }) => (
          <span className="flex flex-wrap items-center gap-2">
            <Select
              id={id}
              aria-describedby={describedBy}
              value={modelKnown ? form.model || AUTO_MODEL : '__other'}
              onChange={(e) => {
                setOtherModel(e.target.value === '__other');
                if (e.target.value !== '__other') set({ model: e.target.value });
              }}
              className="w-auto min-w-56"
            >
              <option value={AUTO_MODEL}>Automatic routing</option>
              {chatModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="__other">Another model id</option>
            </Select>
            {!modelKnown && (
              <Input
                aria-label="Model id"
                value={form.model}
                onChange={(e) => set({ model: e.target.value })}
                className="w-56 font-mono"
              />
            )}
          </span>
        )}
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[12.5px] font-medium">What it may do</legend>
        <Checkbox
          label="Search documents"
          hint="Look up passages in the document libraries it may read, and cite them."
          checked={form.searchDocuments}
          onChange={(e) => set({ searchDocuments: e.target.checked })}
        />
        <Checkbox
          label="Look up data"
          hint="Ask your databases questions, through the approved data dictionary."
          checked={form.lookUpData}
          onChange={(e) => set({ lookUpData: e.target.checked })}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2" aria-labelledby={scopesHeading}>
        <legend id={scopesHeading} className="mb-1 text-[12.5px] font-medium">
          What it may read
        </legend>
        {libraryScopes.length > 0 ? (
          libraryScopes.map((l) => (
            <Checkbox
              key={l.scope}
              label={`Document library ${l.name}`}
              checked={form.scopes.includes(l.scope)}
              onChange={(e) =>
                set({
                  scopes: e.target.checked
                    ? [...form.scopes, l.scope]
                    : form.scopes.filter((s) => s !== l.scope),
                })
              }
            />
          ))
        ) : (
          <p className="text-[12px] text-fg-muted">
            {tenantId ? 'This workspace has no document library yet.' : 'Pick a workspace first.'}
          </p>
        )}
        <Field
          label="Other data it may read"
          hint={
            <>
              Data access names separated by commas, for example{' '}
              <code className="font-mono">shop.orders:read</code>.
            </>
          }
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={otherText}
              onChange={(e) => {
                setOtherText(e.target.value);
                set({
                  scopes: [
                    ...form.scopes.filter((s) => known.has(s)),
                    ...splitScopes(e.target.value),
                  ],
                });
              }}
              className="font-mono"
            />
          )}
        </Field>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={
            <span className="inline-flex items-center gap-1">
              Personal data <TermTip term="personalData" />
            </span>
          }
          hint="Applies to this assistant even on models on your own servers."
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={form.pii}
              onChange={(e) => set({ pii: e.target.value as SpecForm['pii'] })}
            >
              <option value="">Workspace default</option>
              <option value="reversible">Hide from the model, restore in the answer</option>
              <option value="mask">Hide everywhere</option>
              <option value="off">Do not hide</option>
            </Select>
          )}
        </Field>
        <Field
          label="Answer check"
          hint="What happens to links or contacts in an answer that only outside text supplied."
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={form.answer}
              onChange={(e) => set({ answer: e.target.value as SpecForm['answer'] })}
            >
              <option value="">Default (remove them)</option>
              <option value="redact">Remove them</option>
              <option value="refuse">Refuse the answer</option>
              <option value="off">Do not check</option>
            </Select>
          )}
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[12.5px] font-medium">
          Limits per conversation{' '}
          <LearnMore doc={doc('guides/assistants', 'budgets')} className="ml-1 font-normal" />
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Steps per conversation"
            value={form.steps}
            onChange={(steps) => set({ steps })}
          />
          <NumberField
            label="Words processed per conversation"
            hint="Counted in tokens: a token is about 0.75 words."
            value={form.tokens}
            onChange={(tokens) => set({ tokens })}
          />
          <NumberField
            label="Time limit per conversation"
            unit="seconds"
            hint="Working time, not counting time waiting for a person."
            value={form.wallClock}
            onChange={(wallClock) => set({ wallClock })}
          />
          <NumberField
            label="Most it may spend per conversation"
            unit="USD"
            hint="Optional."
            value={form.usd}
            onChange={(usd) => set({ usd })}
          />
        </div>
        <Advanced summary="Defaults: 3 levels, 8 tasks at once.">
          <NumberField
            label="Levels of assistants calling assistants"
            hint={
              <>
                Also called <code className="font-mono">budgets.depth</code>.
              </>
            }
            value={form.depth}
            onChange={(depth) => set({ depth })}
          />
          <NumberField
            label="Tasks in parallel"
            hint={
              <>
                Also called <code className="font-mono">budgets.fanout</code>.
              </>
            }
            value={form.fanout}
            onChange={(fanout) => set({ fanout })}
          />
        </Advanced>
      </fieldset>

      <p className="text-[12.5px] text-fg-muted">
        <LearnMore doc={doc('guides/assistants', 'edit-with-the-form')}>
          About the assistant form
        </LearnMore>
      </p>
    </div>
  );
}

function NumberField({
  label,
  hint,
  unit,
  value,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <span className="flex items-center gap-2">
          <Input
            id={id}
            aria-describedby={describedBy}
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-36 tabular-nums"
          />
          {unit && <span className="text-[12.5px] text-fg-muted">{unit}</span>}
        </span>
      )}
    </Field>
  );
}
