import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { modelsQuery, useCreateRagCollection } from '@/api/queries';
import { RAG_TRUSTS, type RagCollectionSettings, type RagTrust } from '@/api/types';
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
  const models = useQuery(modelsQuery());
  const embedders = (models.data ?? []).filter((m) => m.kind === 'embedding');
  const rerankers = (models.data ?? []).filter((m) => m.kind === 'rerank');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [embedding, setEmbedding] = useState('');
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="New collection">
      <Field
        label="Name"
        required
        hint={
          <>
            Nodes name it in their scopes as{' '}
            <code className="font-mono">rag.{name.trim() || '<name>'}:read</code>. Lowercase
            letters, digits and _.
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
      <Field label="Description" hint="What the collection holds, for the people who manage it.">
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

      <Field
        label="Embedding model"
        required
        hint={
          embedders.length === 0 && models.isSuccess ? (
            <>
              The model catalogue has no embedding model.{' '}
              <Link to="/models" className="text-accent hover:underline">
                Add one in Models
              </Link>{' '}
              first.
            </>
          ) : (
            "Fixed for the collection's life: vectors of two models cannot be compared. Text is pseudonymised before it is embedded, so an embedder outside your trust boundary sees surrogates."
          )
        }
      >
        {({ id, describedBy }) => (
          <Select
            id={id}
            required
            aria-describedby={describedBy}
            value={embedding}
            disabled={models.isPending}
            onChange={(e) => setEmbedding(e.target.value)}
          >
            <option value="" disabled>
              {models.isPending ? 'Loading models…' : 'Select an embedding model…'}
            </option>
            {embedders.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id} ({TRUST_TIER_LABEL[m.trust_tier]})
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label="Rerank model"
        hint="Optional. Reorders the best candidates of every search; recommended when the catalogue has one."
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
                {m.id} ({TRUST_TIER_LABEL[m.trust_tier]})
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field
        label="Default trust"
        hint={`For documents ingested without a trust tier. ${TRUST_HINT[settings.default_trust]}`}
      >
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={settings.default_trust}
            onChange={(e) =>
              setSettings((s) => ({ ...s, default_trust: e.target.value as RagTrust }))
            }
          >
            {RAG_TRUSTS.map((t) => (
              <option key={t} value={t}>
                {TRUST_LABEL[t]}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
        <legend className="px-1 text-[12.5px] font-medium">Indexing</legend>
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
          label="Vetting deadline (seconds)"
          hint={`${
            Number.isFinite(settings.vet_deadline_secs) && settings.vet_deadline_secs > 0
              ? `${formatSeconds(settings.vet_deadline_secs)}. `
              : ''
          }An untrusted document whose checks have not passed this long after ingest fails and is never searched, rather than appearing later when a backlog clears. 60 seconds to 7 days.`}
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
      </fieldset>

      {invalid && (
        <p role="alert" className="text-[12.5px] text-danger">
          {invalid}
        </p>
      )}
      <FormError error={create.error} />
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
          Create collection
        </Button>
      </div>
    </form>
  );
}
