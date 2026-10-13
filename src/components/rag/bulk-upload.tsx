import { useState, type DragEvent } from 'react';
import { useIngestRagDocument } from '@/api/queries';
import type { RagCollection } from '@/api/types';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import {
  ACCEPTED_FILES,
  CONTENT_TYPE_LABEL,
  docIdError,
  formatBytes,
  readUploads,
  settingsOf,
  TRUST_LABEL,
  type UploadItem,
} from '@/lib/rag';
import { Badge, Button, Input, Table, TBody, TD, TH, THead, TR, type Tone } from '../ui';
import { IconTrash } from '../ui/icons';

const STATE_LABEL: Record<UploadItem['state'], string> = {
  ready: 'Ready to upload',
  sending: 'Uploading',
  added: 'Added',
  unchanged: 'Already there',
  failed: 'Failed',
};

const STATE_TONE: Record<UploadItem['state'], Tone> = {
  ready: 'neutral',
  sending: 'info',
  added: 'ok',
  unchanged: 'neutral',
  failed: 'danger',
};

/**
 * Uploads several documents at once (UX-52): drop or pick Markdown, HTML or
 * plain text files, check the id and title of each in a table, then send them
 * one after the other through the single-document endpoint. Failures stay in
 * the table with the reason and can be retried; nothing typed is lost.
 */
export function BulkUpload({
  tenantId,
  collection,
  onClose,
  onUploaded,
}: {
  tenantId: string;
  collection: RagCollection;
  onClose: () => void;
  /** Called once a run ends, with a sentence for the page's status line. */
  onUploaded: (message: string) => void;
}) {
  const ingest = useIngestRagDocument(tenantId, collection.name);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [refused, setRefused] = useState<Array<{ fileName: string; reason: string }>>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const trust = TRUST_LABEL[settingsOf(collection).default_trust];

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const read = await readUploads(Array.from(files));
    setItems((prev) => [...prev, ...read.items]);
    setRefused(read.refused);
  };

  const patch = (key: string, p: Partial<UploadItem>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const ids = items.map((i) => i.docId.trim());
  const problem = (i: UploadItem): string | null => {
    const id = i.docId.trim();
    return docIdError(id) ?? (ids.filter((x) => x === id).length > 1 ? 'Used twice.' : null);
  };
  const toSend = items.filter((i) => i.state === 'ready' || i.state === 'failed');
  const blocked = toSend.some((i) => problem(i) !== null);

  const send = async () => {
    setRunning(true);
    let added = 0;
    let unchanged = 0;
    let failed = 0;
    for (const [n, item] of toSend.entries()) {
      setProgress(`Uploading ${n + 1} of ${toSend.length}: ${item.fileName}.`);
      patch(item.key, { state: 'sending', error: undefined });
      try {
        const doc = await ingest.mutateAsync({
          doc_id: item.docId.trim(),
          content: item.content,
          content_type: item.contentType,
          ...(item.title.trim() ? { title: item.title.trim() } : {}),
          source: item.fileName,
        });
        if (doc.unchanged) unchanged += 1;
        else added += 1;
        patch(item.key, { state: doc.unchanged ? 'unchanged' : 'added' });
      } catch (e) {
        failed += 1;
        patch(item.key, { state: 'failed', error: errorMessage(e) });
      }
    }
    const parts = [`${added} added`];
    if (unchanged) parts.push(`${unchanged} already there`);
    if (failed) parts.push(`${failed} failed`);
    const sentence = `Upload finished: ${parts.join(', ')}.${
      failed ? ' Check the failed rows and retry them.' : ''
    }`;
    setProgress(sentence);
    setRunning(false);
    onUploaded(sentence);
  };

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    void add(e.dataTransfer.files);
  };

  const failedCount = items.filter((i) => i.state === 'failed').length;

  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-1.5 rounded-md border-2 border-dashed px-4 py-6 text-center',
          dragging ? 'border-accent bg-accent-soft' : 'border-border-strong',
        )}
      >
        <span className="font-medium">Drop files here, or choose files</span>
        <span className="text-[12px] text-fg-muted">
          Markdown, HTML or plain text, up to 5 MB each. Convert PDF and office documents first.
        </span>
        <input
          type="file"
          multiple
          accept={ACCEPTED_FILES}
          aria-label="Choose files to upload"
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = '';
          }}
          className="mt-1 text-[12.5px] file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface-2 file:px-2.5 file:py-1 file:text-fg"
        />
      </label>

      {refused.length > 0 && (
        <ul role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
          {refused.map((r) => (
            <li key={r.fileName}>{r.reason}</li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <>
          <p className="text-[12.5px] text-fg-muted">
            Each document gets an id from its file name and a title from its first heading. Check
            them before uploading: uploading the same id again adds a new version. Documents are
            marked {trust}, the library default.
          </p>
          <Table label="Files to upload">
            <THead>
              <tr>
                <TH>File</TH>
                <TH>Document id</TH>
                <TH>Title</TH>
                <TH>Status</TH>
                <TH>
                  <span className="sr-only">Remove</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {items.map((item) => {
                const err =
                  item.state === 'ready' || item.state === 'failed' ? problem(item) : null;
                const editable = !running && (item.state === 'ready' || item.state === 'failed');
                return (
                  <TR key={item.key}>
                    <TD className="text-[12.5px]">
                      <span dir="auto">{item.fileName}</span>
                      <span className="block text-[11.5px] text-fg-muted">
                        {CONTENT_TYPE_LABEL[item.contentType]}, {formatBytes(item.size)}
                      </span>
                    </TD>
                    <TD>
                      <Input
                        aria-label={`Document id of ${item.fileName}`}
                        aria-invalid={Boolean(err)}
                        value={item.docId}
                        disabled={!editable}
                        onChange={(e) => patch(item.key, { docId: e.target.value })}
                        className="w-44 font-mono"
                      />
                      {err && <span className="block text-[12px] text-danger">{err}</span>}
                    </TD>
                    <TD>
                      <Input
                        aria-label={`Title of ${item.fileName}`}
                        dir="auto"
                        maxLength={500}
                        value={item.title}
                        disabled={!editable}
                        onChange={(e) => patch(item.key, { title: e.target.value })}
                        className="w-56"
                      />
                    </TD>
                    <TD>
                      <Badge tone={STATE_TONE[item.state]}>{STATE_LABEL[item.state]}</Badge>
                      {item.error && (
                        <span className="block max-w-56 text-[12px] break-words text-danger">
                          {item.error}
                        </span>
                      )}
                    </TD>
                    <TD className="text-right">
                      {editable && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<IconTrash size={14} />}
                          aria-label={`Remove ${item.fileName}`}
                          onClick={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
                        />
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </>
      )}

      <p role="status" aria-live="polite" className="text-[12.5px] text-fg-muted">
        {progress}
      </p>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={running}>
          {items.some((i) => i.state === 'added' || i.state === 'unchanged') ? 'Close' : 'Cancel'}
        </Button>
        <Button
          variant="primary"
          loading={running}
          disabled={toSend.length === 0 || blocked}
          onClick={() => void send()}
        >
          {failedCount > 0 && failedCount === toSend.length
            ? `Retry ${failedCount} failed`
            : `Upload ${toSend.length} document${toSend.length === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  );
}
