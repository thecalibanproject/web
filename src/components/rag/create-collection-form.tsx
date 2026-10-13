import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { Advanced } from '../help/advanced';
import { ragModelsQuery, useCreateRagCollection } from '@/api/queries';
import type { RagCollectionSettings } from '@/api/types';
import { TRUST_TIER_LABEL } from '@/lib/labels';
import {
  changedSettings,
  COLLECTION_NAME_PATTERN,
  formatSeconds,
  settingsError,
  SETTINGS_DEFAULTS,
  TRUST_HINT,
  TRUST_LABEL,
} from '@/lib/rag';
import { Button, Field, FormError, Input, Select, Textarea } from '../ui';

type Settings = Required<RagCollectionSettings>;

/**
 * Creates a document collection: its name (what node scopes name), the
 * embedding model (fixed for the collection's life), an optional rerank model,
 * the trust of documents ingested without one, and the indexing settings.
 * Only settings that differ from the control plane's defaults are sent.
 */
export function CreateCollectionForm({
  tenantId,
  onCancel,
  onCreated,
}: {
  tenantId: string;
  onCancel: () => void;
  onCreated: (name: string) => void;
}) {
  const create = useCreateRagCollection(tenantId);
  // Only the models this tenant can reach: served by one of its providers or a
  // shared provider that serves it.
  const models = useQuery(ragModelsQuery(tenantId));
  const embedders = models.data?.embedding ?? [];
  const rerankers = models.data?.rerank ?? [];
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [picked, setPicked] = useState('');
  // A sensible default: the first model on your own servers, else the first one served.
  const embedding =
    picked || (embedders.find((m) => m.trust_tier === 't0_sovereign') ?? embedders[0])?.id || '';
  const [rerank, setRerank] = useState('');
  const [settings, setSettings] = useState<Settings>(SETTINGS_DEFAULTS);
  const invalid = settingsError(settings);

  const num = (key: 'chunk_tokens' | 'nav_min_chunks' | 'vet_deadline_secs') => ({
    value: Number.isFinite(settings[key]) ? String(settings[key]) : '',
    onChange: (e: { target: { value: string } }) => {
      create.reset();
      setSettings((s) => ({ ...s, [key]: e.target.value === '' ? NaN : Number(e.target.value) }));
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    const trimmed = name.trim();
    const changed = changedSettings(settings);
    create.mutate(
      {
        name: trimmed,
        embedding_model: embedding,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(rerank ? { rerank_model: rerank } : {}),
        ...(changed ? { settings: changed } : {}),
      },
      { onSuccess: () => onCreated(trimmed) },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="New document library">
      <Field
        label="Name"
        required
        hint={
          <>
            A short id: lowercase letters, digits and _. Assistants are given access to it by this
            name (<code className="font-mono">rag.{name.trim() || '<name>'}:read</code>).
          </>
        }
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            required
            aria-describedby={describedBy}
            pattern={COLLECTION_NAME_PATTERN}
            title="1 to 64 lowercase letters, digits and _, starting with a letter or digit"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="handbook"
            className="font-mono"
          />
        )}
      </Field>
      <Field label="Description" hint="What the library holds, for the people who manage it.">
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[12.5px] font-medium">Who adds documents here?</legend>
        {(['trusted', 'untrusted'] as const).map((t) => (
          <label key={t} className="flex items-start gap-2 text-[13px]">
            <input
              type="radio"
              name="default-trust"
              value={t}
              checked={settings.default_trust === t}
              onChange={() => setSettings((s) => ({ ...s, default_trust: t }))}
              className="mt-0.5 accent-accent"
            />
            <span>
              <span className="font-medium">
                {t === 'trusted' ? 'My team' : 'People outside the team'}
              </span>{' '}
              <span className="text-fg-muted">({TRUST_LABEL[t]})</span>
              <span className="block text-[12px] text-fg-muted">{TRUST_HINT[t]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {embedders.length === 0 && models.isSuccess && (
        <p role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-fg">
          No search model is available to this workspace yet.{' '}
          <Link to="/models" className="text-accent hover:underline">
            Add an embedding model in Models
          </Link>{' '}
          first: the library needs one to make its documents searchable.
        </p>
      )}
      <Advanced
        summary={`Search model ${embedding || 'not chosen'}, ${rerank ? `reranked with ${rerank}` : 'no reranking'}, passages of ${Number.isFinite(settings.chunk_tokens) ? settings.chunk_tokens : '?'} tokens, checks within ${
          Number.isFinite(settings.vet_deadline_secs) && settings.vet_deadline_secs > 0
            ? formatSeconds(settings.vet_deadline_secs)
            : '?'
        }.`}
      >
        <Field
          label="Embedding model"
          required
          hint={
            "Fixed for the library's life: vectors of two models cannot be compared. Text is pseudonymised before it is embedded, so an embedder outside your trust boundary sees surrogates."
          }
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              required
              aria-describedby={describedBy}
              value={embedding}
              disabled={models.isPending}
              onChange={(e) => setPicked(e.target.value)}
            >
              <option value="" disabled>
                {models.isPending ? 'Loading models…' : 'Select an embedding model…'}
              </option>
              {embedders.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} ({TRUST_TIER_LABEL[m.trust_tier]}, {m.provider})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Rerank model"
          hint="Optional. Reorders the best candidates of every search; recommended when one is served to this workspace."
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={rerank}
              disabled={models.isPending}
              onChange={(e) => setRerank(e.target.value)}
            >
              <option value="">None</option>
              {rerankers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} ({TRUST_TIER_LABEL[m.trust_tier]}, {m.provider})
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Chunk size (tokens)"
              hint="Largest chunk, 64 to 2048. Chunks follow the headings and carry their heading path."
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="number"
                  min={64}
                  max={2048}
                  step={1}
                  aria-describedby={describedBy}
                  {...num('chunk_tokens')}
                />
              )}
            </Field>
            <Field
              label="Navigation from (chunks)"
              hint="Documents with at least this many chunks get a navigation tree for multi-part questions."
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="number"
                  min={4}
                  step={1}
                  aria-describedby={describedBy}
                  {...num('nav_min_chunks')}
                />
              )}
            </Field>
          </div>
          <Field
            label="Time allowed for checks (seconds)"
            hint={`${
              Number.isFinite(settings.vet_deadline_secs) && settings.vet_deadline_secs > 0
                ? `${formatSeconds(settings.vet_deadline_secs)}. `
                : ''
            }A document from outside whose checks have not passed this long after upload (or after its release) fails and is never searched, rather than appearing later. 60 seconds to 7 days.`}
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                type="number"
                min={60}
                max={604800}
                step={1}
                aria-describedby={describedBy}
                {...num('vet_deadline_secs')}
              />
            )}
          </Field>
        </div>
      </Advanced>

      {invalid && (
        <p role="alert" className="text-[12.5px] text-danger">
          {invalid}
        </p>
      )}
      <FormError error={create.error ?? models.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={create.isPending}
          disabled={Boolean(invalid) || !embedding}
        >
          Create library
        </Button>
      </div>
    </form>
  );
}
