import { describe, expect, it } from 'vitest';
import {
  changedSettings,
  contentTypeLabel,
  contentTypeOf,
  docIdError,
  docIdFromFileName,
  findingLabel,
  formatBytes,
  formatSeconds,
  settingsError,
  SETTINGS_DEFAULTS,
  specScopes,
  usesRagSearch,
  vettingOf,
  documentCounts,
  findingPlace,
  hasActiveDocuments,
  readUploads,
  titleFromContent,
} from './rag';

describe('collection settings', () => {
  it('sends only what differs from the defaults', () => {
    expect(changedSettings(SETTINGS_DEFAULTS)).toBeUndefined();
    expect(
      changedSettings({ ...SETTINGS_DEFAULTS, default_trust: 'trusted', chunk_tokens: 512 }),
    ).toEqual({ default_trust: 'trusted', chunk_tokens: 512 });
  });

  it("checks the control plane's bounds", () => {
    expect(settingsError(SETTINGS_DEFAULTS)).toBeNull();
    expect(settingsError({ ...SETTINGS_DEFAULTS, chunk_tokens: 4096 })).toMatch(/64 to 2048/);
    expect(settingsError({ ...SETTINGS_DEFAULTS, nav_min_chunks: 2 })).toMatch(/at least 4/);
    expect(settingsError({ ...SETTINGS_DEFAULTS, vet_deadline_secs: NaN })).toMatch(/60 seconds/);
    expect(settingsError({ ...SETTINGS_DEFAULTS, vet_deadline_secs: 604_801 })).toMatch(/7 days/);
  });
});

describe('documents', () => {
  it('reads the format of a file from its extension, and refuses PDF and office files', () => {
    expect(contentTypeOf({ name: 'a.MD', type: '' })).toEqual({ ok: true, type: 'text/markdown' });
    expect(contentTypeOf({ name: 'a.htm', type: '' })).toEqual({ ok: true, type: 'text/html' });
    expect(contentTypeOf({ name: 'notes', type: 'text/plain' })).toEqual({
      ok: true,
      type: 'text/plain',
    });
    expect(contentTypeOf({ name: 'a.pdf', type: 'application/pdf' })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/PDF is not supported/) as unknown,
    });
    expect(contentTypeOf({ name: 'a.docx', type: '' })).toMatchObject({ ok: false });
  });

  it('names a document after its file, within the id rules', () => {
    expect(docIdFromFileName('Travel policy (2026).md')).toBe('Travel-policy-(2026)');
    expect(docIdFromFileName('été.txt')).toBe('t');
    expect(docIdError('Travel-policy-(2026)')).toBeNull();
    expect(docIdError('')).toMatch(/required/);
    expect(docIdError('a/b')).toMatch(/no \//);
    expect(docIdError('a b')).toMatch(/no spaces/);
    expect(docIdError('x'.repeat(201))).not.toBeNull();
  });

  it('labels findings, formats and sizes', () => {
    expect(findingLabel('near_duplicate')).toBe('Near-copy of another document');
    expect(findingLabel('exfiltration')).toBe('Data exfiltration');
    expect(findingLabel('something_new')).toBe('something_new');
    expect(contentTypeLabel('text/html')).toBe('HTML');
    expect(contentTypeLabel('text/x-rst')).toBe('text/x-rst');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatSeconds(900)).toBe('15 min');
    expect(formatSeconds(7200)).toBe('2 h');
    expect(formatSeconds(86_400)).toBe('1 day');
    expect(formatSeconds(90)).toBe('90 s');
  });
});

describe('vettingOf', () => {
  const collection = { settings: { vet_deadline_secs: 900 } };
  const now = Date.parse('2026-10-12T10:00:00Z');

  it('counts the deadline from ingest for untrusted versions not ready yet', () => {
    const doc = {
      trust: 'untrusted',
      status: 'pending',
      created_at: '2026-10-12T09:55:00Z',
    } as const;
    expect(vettingOf(doc, collection, now)).toMatchObject({ kind: 'open', remaining: '10 min' });
    expect(
      vettingOf({ ...doc, created_at: '2026-10-12T09:40:00Z' }, collection, now),
    ).toMatchObject({ kind: 'missed', deadline: new Date('2026-10-12T09:55:00Z') });
  });

  it("takes the control plane's vet_deadline_at, which a release moves", () => {
    const released = {
      trust: 'untrusted',
      status: 'indexing',
      created_at: '2026-10-12T08:00:00Z',
      vet_deadline_at: '2026-10-12T10:12:00Z',
    } as const;
    expect(vettingOf(released, collection, now)).toMatchObject({
      kind: 'open',
      remaining: '12 min',
      deadline: new Date('2026-10-12T10:12:00Z'),
    });
  });

  it('gives a quarantined version a fresh window on release, whenever it was ingested', () => {
    const doc = {
      trust: 'untrusted',
      status: 'quarantined',
      created_at: '2026-10-11T09:00:00Z',
      vet_deadline_at: '2026-10-11T09:15:00Z',
    } as const;
    expect(vettingOf(doc, collection, now)).toEqual({ kind: 'on_release', window: '15 min' });
    expect(vettingOf({ ...doc, trust: 'trusted' }, collection, now)).toEqual({ kind: 'none' });
  });

  it('does not apply to trusted or settled versions', () => {
    const doc = {
      trust: 'untrusted',
      status: 'ready',
      created_at: '2026-10-12T09:00:00Z',
    } as const;
    expect(vettingOf(doc, collection, now)).toEqual({ kind: 'none' });
    expect(vettingOf({ ...doc, status: 'failed' }, collection, now)).toEqual({ kind: 'none' });
    expect(vettingOf({ ...doc, trust: 'trusted', status: 'pending' }, collection, now)).toEqual({
      kind: 'none',
    });
  });

  it('uses the default deadline when the collection does not set one', () => {
    const doc = {
      trust: 'untrusted',
      status: 'indexing',
      created_at: '2026-10-12T09:50:00Z',
    } as const;
    expect(vettingOf(doc, { settings: {} }, now)).toMatchObject({
      kind: 'open',
      remaining: '5 min',
    });
  });
});

describe('specScopes', () => {
  it('splits document collections from datasource scopes', () => {
    expect(
      specScopes({
        datasources: { scopes: ['rag.handbook:read', 'shop.orders:read', 'rag.*:read', 7] },
      }),
    ).toEqual({
      rag: [
        { scope: 'rag.handbook:read', collection: 'handbook' },
        { scope: 'rag.*:read', collection: '*' },
      ],
      datasources: ['shop.orders:read'],
    });
    expect(specScopes({})).toEqual({ rag: [], datasources: [] });
    expect(specScopes(null)).toEqual({ rag: [], datasources: [] });
  });

  it('knows when a spec calls rag_search', () => {
    expect(usesRagSearch({ tools: [{ ref: 'builtin://rag_search', effect: 'read' }] })).toBe(true);
    expect(usesRagSearch({ tools: [{ ref: 'builtin://datasource_query' }] })).toBe(false);
    expect(usesRagSearch({})).toBe(false);
  });
});

describe('documentCounts', () => {
  it('keeps the statuses with documents, in status order', () => {
    expect(documentCounts({ quarantined: 1, ready: 12, pending: 0, failed: 2 })).toEqual([
      { status: 'ready', count: 12 },
      { status: 'quarantined', count: 1 },
      { status: 'failed', count: 2 },
    ]);
    expect(documentCounts(undefined)).toEqual([]);
  });

  it('says when documents are still being indexed', () => {
    expect(hasActiveDocuments({ ready: 3, indexing: 1 })).toBe(true);
    expect(hasActiveDocuments({ pending: 2 })).toBe(true);
    expect(hasActiveDocuments({ ready: 3, pending: 0 })).toBe(false);
    expect(hasActiveDocuments(undefined)).toBe(false);
  });
});

describe('findingPlace', () => {
  it('names the chunk and the headings above it', () => {
    expect(findingPlace({ chunk: 2, heading_path: ['Travel', 'Hotels'] })).toBe(
      'chunk 3, under Travel > Hotels',
    );
    expect(findingPlace({ chunk: 0 })).toBe('chunk 1');
    expect(findingPlace({ chunk: 0, heading_path: [] })).toBe('chunk 1');
  });
});

describe('titleFromContent', () => {
  it('takes the first Markdown heading, the HTML title or first h1, else the file name', () => {
    expect(titleFromContent('intro\n## Leave policy ##\n# Later', 'text/markdown', 'a.md')).toBe(
      'Leave policy',
    );
    expect(titleFromContent('<title>Benefits</title><h1>x</h1>', 'text/html', 'b.html')).toBe(
      'Benefits',
    );
    expect(titleFromContent('<h1>Dental <em>plan</em></h1>', 'text/html', 'b.html')).toBe(
      'Dental plan',
    );
    expect(titleFromContent('no heading', 'text/plain', 'Team notes.txt')).toBe('Team notes');
  });
});

describe('readUploads', () => {
  it('reads files into rows and keeps refused ones apart with the reason', async () => {
    const { items, refused } = await readUploads([
      new File(['# A'], 'Travel 2026.md', { type: 'text/markdown' }),
      new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' }),
    ]);
    expect(items.map((i) => [i.docId, i.title, i.contentType, i.state])).toEqual([
      ['Travel-2026', 'A', 'text/markdown', 'ready'],
    ]);
    expect(refused).toEqual([{ fileName: 'scan.pdf', reason: expect.stringMatching(/PDF/) }]);
  });
});
