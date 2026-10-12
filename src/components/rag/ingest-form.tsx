import { useState, type FormEvent } from 'react';
import { useIngestRagDocument } from '@/api/queries';
import { RAG_TRUSTS, type RagCollection, type RagDocument, type RagTrust } from '@/api/types';
import {
  ACCEPTED_FILES,
  byteLength,
  CONTENT_TYPE_LABEL,
  CONTENT_TYPES,
  contentTypeOf,
  docIdError,
  docIdFromFileName,
  formatBytes,
  MAX_DOCUMENT_BYTES,
  settingsOf,
  TRUST_HINT,
  TRUST_LABEL,
  type ContentType,
} from '@/lib/rag';
import { Button, Field, FormError, Input, Select, Textarea } from '../ui';

type Mode = 'paste' | 'upload';

/** `datetime-local` value to RFC 3339 (the browser's time zone), or undefined. */
function isoOf(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Ingests a document into a collection, pasted or uploaded (Markdown, HTML or
 * plain text; PDF and office formats must be converted first). The content is
 * sealed by the control plane at once and never shown again; the document is
 * searched only once a worker has indexed it and its checks passed.
 */
export function IngestForm({
  tenantId,
  collection,
  onCancel,
  onIngested,
}: {
  tenantId: string;
  collection: RagCollection;
  onCancel: () => void;
  onIngested: (doc: RagDocument & { unchanged?: boolean }) => void;
}) {
  const ingest = useIngestRagDocument(tenantId, collection.name);
  const defaultTrust = settingsOf(collection).default_trust;
  const [mode, setMode] = useState<Mode>('paste');
  const [docId, setDocId] = useState('');
  const [title, setTitle] = useState('');
  const [contentType, setContentType] = useState<ContentType>('text/markdown');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [trust, setTrust] = useState<RagTrust | ''>('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');

  const idError = docIdError(docId.trim());
  const bytes = byteLength(content);
  const tooBig = bytes > MAX_DOCUMENT_BYTES;
  const datesError =
    validFrom && validTo && new Date(validTo) <= new Date(validFrom)
      ? '"Valid until" must be after "Valid from".'
      : null;
  const ready = !idError && content.length > 0 && !tooBig && !fileError && !datesError;

  const switchMode = (m: Mode) => {
    setMode(m);
    setContent('');
    setFile(null);
    setFileError(null);
    ingest.reset();
  };

  const onFile = async (f: File | undefined) => {
    ingest.reset();
    setContent('');
    setFile(null);
    setFileError(null);
    if (!f) return;
    const type = contentTypeOf(f);
    if (!type.ok) {
      setFileError(type.error);
      return;
    }
    if (f.size > MAX_DOCUMENT_BYTES) {
      setFileError(`${f.name} is ${formatBytes(f.size)}; a document can be at most 5 MB of text.`);
      return;
    }
    setContentType(type.type);
    setFile({ name: f.name, size: f.size });
    if (!docId.trim()) setDocId(docIdFromFileName(f.name));
    setContent(await f.text());
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    const from = isoOf(validFrom);
    const to = isoOf(validTo);
    ingest.mutate(
      {
        doc_id: docId.trim(),
        content,
        content_type: contentType,
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(source.trim() ? { source: source.trim() } : {}),
        ...(trust ? { trust } : {}),
        ...(from ? { valid_from: from } : {}),
        ...(to ? { valid_to: to } : {}),
      },
      { onSuccess: (doc) => onIngested(doc) },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Ingest document">
      <div role="radiogroup" aria-label="Content" className="flex gap-4 text-[13px]">
        {(['paste', 'upload'] as const).map((m) => (
          <label key={m} className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              name="ingest-mode"
              value={m}
              checked={mode === m}
              onChange={() => switchMode(m)}
              className="accent-accent"
            />
            {m === 'paste' ? 'Paste text' : 'Upload a file'}
          </label>
        ))}
      </div>

      {mode === 'upload' ? (
        <Field
          label="File"
          required
          error={fileError}
          hint={
            file
              ? `${file.name}, ${formatBytes(file.size)}, read as ${CONTENT_TYPE_LABEL[contentType]}.`
              : 'Markdown (.md), HTML (.html) or plain text (.txt), at most 5 MB. Convert PDF and office documents first.'
          }
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="file"
              accept={ACCEPTED_FILES}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="text-[13px] file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface-2 file:px-2.5 file:py-1 file:text-[12.5px] file:text-fg"
            />
          )}
        </Field>
      ) : (
        <Field
          label="Text"
          required
          error={tooBig ? `${formatBytes(bytes)}: a document can be at most 5 MB of text.` : null}
          hint={`Headings, lists, tables and code are kept: chunks follow the document's structure.${
            content ? ` ${formatBytes(bytes)}.` : ''
          }`}
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={content}
              onChange={(e) => {
                ingest.reset();
                setContent(e.target.value);
              }}
              className="min-h-48 font-mono text-[12px]"
              spellCheck={false}
            />
          )}
        </Field>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Document id"
          required
          error={docId ? idError : null}
          hint="Ingesting the same id again adds a version. Stored in clear: no personal data."
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              required
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
              placeholder="travel-policy"
              className="font-mono"
            />
          )}
        </Field>
        <Field label="Format">
          {({ id }) => (
            <Select
              id={id}
              value={contentType}
              onChange={(e) => setContentType(e.target.value as ContentType)}
            >
              {CONTENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CONTENT_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Title" hint="Shown in citations. Sealed with the content.">
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            maxLength={500}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
      </Field>
      <Field
        label="Source"
        hint="Where it came from, such as a URL or a path. Stored in clear: no personal data."
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            maxLength={2000}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        )}
      </Field>
      <Field label="Trust" hint={TRUST_HINT[trust || defaultTrust]}>
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={trust}
            onChange={(e) => setTrust(e.target.value as RagTrust | '')}
          >
            <option value="">Collection default ({TRUST_LABEL[defaultTrust]})</option>
            {RAG_TRUSTS.map((t) => (
              <option key={t} value={t}>
                {TRUST_LABEL[t]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Valid from" hint="Optional. Not searched before.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="datetime-local"
              aria-describedby={describedBy}
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Valid until"
          error={datesError}
          hint="Optional. Not searched after; citations say until when it applies."
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="datetime-local"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
            />
          )}
        </Field>
      </div>

      <FormError error={ingest.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={ingest.isPending} disabled={!ready}>
          Ingest document
        </Button>
      </div>
    </form>
  );
}
