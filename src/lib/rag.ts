import {
  RAG_DOCUMENT_STATUSES,
  type RagCollection,
  type RagCollectionSettings,
  type RagDocument,
  type RagDocumentStatus,
  type RagFinding,
  type RagTrust,
} from '@/api/types';
import type { Tone } from '@/components/ui';
import { EMPTY } from './format';
import { FINDING_HINT, FINDING_LABEL } from './tools';

/** Collection names, as node scopes name them (`rag.<name>:read`). For the `pattern` attribute. */
export const COLLECTION_NAME_PATTERN = '[a-z0-9][a-z0-9_]{0,63}';

/** Document ids: 1 to 200 visible ASCII characters without '/'. */
const DOC_ID = /^[!-.0-~]{1,200}$/;

/** Largest document the control plane takes: 5 MB of text. */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

/** The control plane's defaults for settings a collection leaves out (docs/rag.md in core). */
export const SETTINGS_DEFAULTS: Required<RagCollectionSettings> = {
  chunk_tokens: 384,
  default_trust: 'untrusted',
  nav_min_chunks: 24,
  vet_deadline_secs: 900,
};

/** A collection's settings with the defaults filled in. */
export function settingsOf(c: Pick<RagCollection, 'settings'>): Required<RagCollectionSettings> {
  return { ...SETTINGS_DEFAULTS, ...c.settings };
}

/** Only the settings that differ from the defaults, or undefined when none do. */
export function changedSettings(
  s: Required<RagCollectionSettings>,
): RagCollectionSettings | undefined {
  const out: RagCollectionSettings = {};
  for (const key of Object.keys(SETTINGS_DEFAULTS) as Array<keyof RagCollectionSettings>) {
    if (s[key] !== SETTINGS_DEFAULTS[key]) Object.assign(out, { [key]: s[key] });
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Why a setting is out of range (the control plane's bounds), or null. */
export function settingsError(s: Required<RagCollectionSettings>): string | null {
  const int = (n: number) => Number.isInteger(n);
  if (!int(s.chunk_tokens) || s.chunk_tokens < 64 || s.chunk_tokens > 2048) {
    return 'Chunk size must be a whole number of tokens from 64 to 2048.';
  }
  if (!int(s.nav_min_chunks) || s.nav_min_chunks < 4) {
    return 'Navigation needs a whole number of chunks, at least 4.';
  }
  if (!int(s.vet_deadline_secs) || s.vet_deadline_secs < 60 || s.vet_deadline_secs > 604_800) {
    return 'The vetting deadline must be from 60 seconds to 7 days (604800 seconds).';
  }
  return null;
}

export const TRUST_LABEL: Record<RagTrust, string> = {
  trusted: 'From your team',
  untrusted: 'From outside',
};

export const TRUST_HINT: Record<RagTrust, string> = {
  trusted:
    'Documents your team writes or curates. Problems the checks find are recorded, and only hidden characters hold a document back for review.',
  untrusted:
    'Documents from anyone else (the safe default). Any problem the checks find, other than a link, holds the document back for review, near-copies of other documents are flagged, and its checks must pass in the time allowed.',
};

export const STATUS_LABEL: Record<RagDocumentStatus, string> = {
  pending: 'Waiting',
  indexing: 'Being prepared',
  ready: 'Ready',
  quarantined: 'Held for review',
  failed: 'Failed',
  superseded: 'Replaced',
  deleted: 'Deleted',
};

export const STATUS_TONE: Record<RagDocumentStatus, Tone> = {
  pending: 'info',
  indexing: 'info',
  ready: 'ok',
  quarantined: 'danger',
  failed: 'danger',
  superseded: 'neutral',
  deleted: 'neutral',
};

export const STATUS_HINT: Record<RagDocumentStatus, string> = {
  pending: 'Waiting to be prepared for search. Not searched yet.',
  indexing: 'Being prepared for search. Not searched yet.',
  ready: 'Prepared and its checks passed: assistants can search it.',
  quarantined:
    'A check found a problem. Not searched until someone allowed to approve documents releases it.',
  failed:
    'Could not be prepared (bad content, a password or key in the text, or its checks ran out of time). Not searched.',
  superseded: 'A newer version became ready and replaced it.',
  deleted: 'Deleted.',
};

/** The statuses the document list filters by (the newest version's). */
export const STATUS_FILTERS = [
  'pending',
  'indexing',
  'ready',
  'quarantined',
  'failed',
] as const satisfies readonly RagDocumentStatus[];

/** A worker may still change these: the list and the document refresh while one is on screen. */
export function isDocumentActive(status: RagDocumentStatus): boolean {
  return status === 'pending' || status === 'indexing';
}

/** Finding kinds of a document: the tool manifest scan's, plus near-copies of other documents. */
export function findingLabel(kind: string): string {
  if (kind === 'near_duplicate') return 'Near-copy of another document';
  return kind in FINDING_LABEL ? FINDING_LABEL[kind as keyof typeof FINDING_LABEL] : kind;
}

export function findingHint(kind: string): string {
  if (kind === 'near_duplicate') {
    return 'A chunk is almost identical (cosine 0.97 or more) to a chunk of another document in the collection. Planting near-copies of real passages is how retrieval poisoning steers answers.';
  }
  if (kind === 'hidden_unicode') {
    return 'Zero-width, bidirectional-control or Unicode tag characters, which hide text from a person reading the document.';
  }
  return kind in FINDING_HINT ? FINDING_HINT[kind as keyof typeof FINDING_HINT] : '';
}

export const CONTENT_TYPES = ['text/markdown', 'text/html', 'text/plain'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  'text/markdown': 'Markdown',
  'text/html': 'HTML',
  'text/plain': 'Plain text',
};

/** A stored content type as a label (the type itself when it is not one of the three). */
export function contentTypeLabel(type: string): string {
  const known = CONTENT_TYPES.find((t) => t === type);
  return known ? CONTENT_TYPE_LABEL[known] : type;
}

/** What the file picker offers. PDF and office formats are refused by the control plane. */
export const ACCEPTED_FILES = '.md,.markdown,.html,.htm,.txt,text/markdown,text/html,text/plain';

/**
 * The content type of an uploaded file, from its extension (then its MIME
 * type), or an error for formats the control plane refuses.
 */
export function contentTypeOf(
  file: Pick<File, 'name' | 'type'>,
): { ok: true; type: ContentType } | { ok: false; error: string } {
  const ext = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase() ?? '';
  if (ext === 'md' || ext === 'markdown') return { ok: true, type: 'text/markdown' };
  if (ext === 'html' || ext === 'htm') return { ok: true, type: 'text/html' };
  if (ext === 'txt') return { ok: true, type: 'text/plain' };
  const mime = CONTENT_TYPES.find((t) => t === file.type);
  if (mime) return { ok: true, type: mime };
  if (ext === 'pdf' || file.type === 'application/pdf') {
    return {
      ok: false,
      error: 'PDF is not supported. Convert it to Markdown or plain text first, then upload that.',
    };
  }
  return {
    ok: false,
    error: `${file.name} is not Markdown, HTML or plain text. Convert it first (office formats are not supported).`,
  };
}

/** A document id derived from a file name: the name without its extension, made valid. */
export function docIdFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  return base
    .replace(/[^!-.0-~]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

/** Why a document id would be refused, or null. */
export function docIdError(id: string): string | null {
  if (!id) return 'A document id is required.';
  if (!DOC_ID.test(id)) {
    return 'Use 1 to 200 visible ASCII characters (letters, digits, punctuation), no spaces and no /.';
  }
  return null;
}

/**
 * A title for an uploaded document: its first Markdown heading, its HTML
 * <title> or first <h1>, else the file name without its extension.
 */
export function titleFromContent(content: string, type: ContentType, fileName: string): string {
  let found: string | undefined;
  if (type === 'text/markdown') {
    found = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m.exec(content)?.[1];
  } else if (type === 'text/html') {
    const raw =
      /<title[^>]*>([\s\S]*?)<\/title>/i.exec(content)?.[1] ??
      /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(content)?.[1];
    found = raw?.replace(/<[^>]+>/g, '');
  }
  const title = (found ?? fileName.replace(/\.[^.]+$/, '')).replace(/\s+/g, ' ').trim();
  return title.slice(0, 500);
}

/** One file of a multi-file upload, before and while it is sent. */
export interface UploadItem {
  key: string;
  fileName: string;
  size: number;
  contentType: ContentType;
  content: string;
  docId: string;
  title: string;
  state: 'ready' | 'sending' | 'added' | 'unchanged' | 'failed';
  /** Why it failed (sending), in the server's words. */
  error?: string;
}

/**
 * Reads picked or dropped files into upload rows: id from the file name, title
 * from the content. Files that cannot be sent (format, size) are returned
 * apart with the reason, so nothing is dropped silently.
 */
export async function readUploads(
  files: readonly File[],
): Promise<{ items: UploadItem[]; refused: Array<{ fileName: string; reason: string }> }> {
  const items: UploadItem[] = [];
  const refused: Array<{ fileName: string; reason: string }> = [];
  for (const [i, f] of files.entries()) {
    const type = contentTypeOf(f);
    if (!type.ok) {
      refused.push({ fileName: f.name, reason: type.error });
      continue;
    }
    if (f.size > MAX_DOCUMENT_BYTES) {
      refused.push({
        fileName: f.name,
        reason: `${f.name} is ${formatBytes(f.size)}; a document can be at most 5 MB of text.`,
      });
      continue;
    }
    const content = await f.text();
    items.push({
      key: `${Date.now()}-${i}-${f.name}`,
      fileName: f.name,
      size: f.size,
      contentType: type.type,
      content,
      docId: docIdFromFileName(f.name),
      title: titleFromContent(content, type.type, f.name),
      state: 'ready',
    });
  }
  return { items, refused };
}

/** UTF-8 size of a string, as the control plane counts the 5 MB limit. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

const sizeFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return EMPTY;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${sizeFmt.format(n / 1024)} KB`;
  return `${sizeFmt.format(n / (1024 * 1024))} MB`;
}

/** A number of seconds as the largest whole unit that fits, e.g. "15 min", "2 h", "7 days". */
export function formatSeconds(secs: number): string {
  if (secs % 86_400 === 0) return `${secs / 86_400} day${secs === 86_400 ? '' : 's'}`;
  if (secs % 3_600 === 0) return `${secs / 3_600} h`;
  if (secs % 60 === 0) return `${secs / 60} min`;
  return `${secs} s`;
}

function formatRemaining(ms: number): string {
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h ${mins % 60} min`;
  return `${Math.floor(hours / 24)} days`;
}

/** Document counts per status of a collection (newest version of each document). */
export type DocumentCounts = Partial<Record<string, number>>;

/** Whether some documents are still being indexed (pending or indexing). */
export function hasActiveDocuments(counts: DocumentCounts | undefined): boolean {
  return Boolean(counts && ((counts.pending ?? 0) > 0 || (counts.indexing ?? 0) > 0));
}

/**
 * The counts to show, in status order, without zeros (deleted documents are
 * not counted; superseded never is the newest version).
 */
export function documentCounts(
  counts: DocumentCounts | undefined,
): Array<{ status: RagDocumentStatus; count: number }> {
  return RAG_DOCUMENT_STATUSES.flatMap((status) => {
    const count = counts?.[status] ?? 0;
    return count > 0 ? [{ status, count }] : [];
  });
}

/**
 * Where a document version stands against its collection's vetting deadline.
 * Only untrusted versions have one, and it matters while the version is not
 * ready yet (pending, indexing): `vet_deadline_at` from the control plane, or
 * for an older one the collection's window from ingest. A quarantined version
 * waits on a decision: releasing it gives its checks a fresh window from the
 * release.
 */
export type Vetting =
  | { kind: 'none' }
  | { kind: 'open'; deadline: Date; remaining: string }
  | { kind: 'missed'; deadline: Date }
  | { kind: 'on_release'; window: string };

export function vettingOf(
  doc: Pick<RagDocument, 'trust' | 'status' | 'created_at' | 'vet_deadline_at'>,
  collection: Pick<RagCollection, 'settings'>,
  now: number = Date.now(),
): Vetting {
  if (doc.trust !== 'untrusted') return { kind: 'none' };
  const secs = settingsOf(collection).vet_deadline_secs;
  if (doc.status === 'quarantined') return { kind: 'on_release', window: formatSeconds(secs) };
  if (!isDocumentActive(doc.status)) return { kind: 'none' };
  const at = doc.vet_deadline_at
    ? Date.parse(doc.vet_deadline_at)
    : Date.parse(doc.created_at) + secs * 1000;
  if (Number.isNaN(at)) return { kind: 'none' };
  const deadline = new Date(at);
  const left = at - now;
  return left > 0
    ? { kind: 'open', deadline, remaining: formatRemaining(left) }
    : { kind: 'missed', deadline };
}

/** A finding's place: its chunk (1-based) and the headings above it. */
export function findingPlace(f: Pick<RagFinding, 'chunk' | 'heading_path'>): string {
  const path = (f.heading_path ?? []).filter(Boolean);
  return path.length ? `chunk ${f.chunk + 1}, under ${path.join(' > ')}` : `chunk ${f.chunk + 1}`;
}

/** A `rag.<collection>:read` scope of a node spec. `collection` is `*` for every collection. */
export interface RagScope {
  scope: string;
  collection: string;
}

const RAG_SCOPE = /^rag\.([a-z0-9_*]+):read$/;

/**
 * The scopes of a node spec, split into document collections (`rag.<name>:read`,
 * searched by `builtin://rag_search`) and datasource scopes (everything else).
 */
export function specScopes(spec: unknown): { rag: RagScope[]; datasources: string[] } {
  const raw =
    typeof spec === 'object' && spec !== null
      ? (spec as { datasources?: { scopes?: unknown } }).datasources?.scopes
      : undefined;
  const scopes = Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : [];
  const rag: RagScope[] = [];
  const datasources: string[] = [];
  for (const scope of scopes) {
    const m = RAG_SCOPE.exec(scope);
    if (m) rag.push({ scope, collection: m[1]! });
    else datasources.push(scope);
  }
  return { rag, datasources };
}

/** Whether a node spec declares any scope, datasource or document collection. */
export function specHasScopes(spec: unknown): boolean {
  const { rag, datasources } = specScopes(spec);
  return rag.length > 0 || datasources.length > 0;
}

/** Whether a node spec calls `builtin://rag_search`. */
export function usesRagSearch(spec: unknown): boolean {
  const tools =
    typeof spec === 'object' && spec !== null ? (spec as { tools?: unknown }).tools : undefined;
  return (
    Array.isArray(tools) &&
    tools.some(
      (t) =>
        typeof t === 'object' &&
        t !== null &&
        (t as { ref?: unknown }).ref === 'builtin://rag_search',
    )
  );
}
