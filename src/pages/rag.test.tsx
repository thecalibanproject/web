import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { RagCollection, RagDocument, Tenant } from '@/api/types';
import { meWith, ssoRoutes, type Grant } from '@/test/auth';
import { expectNoAxeViolations } from '@/test/a11y';
import { mockApi, renderApp } from '@/test/utils';

const tenants: Tenant[] = [
  { id: 't1', name: 'Acme', created_at: '2026-10-01T10:00:00Z' },
  { id: 't2', name: 'Globex', created_at: '2026-10-01T10:00:00Z' },
];
const ragModels = {
  embedding: [{ id: 'local/bge-m3', provider: 'gpu1', trust_tier: 't0_sovereign' as const }],
  rerank: [{ id: 'local/bge-reranker', provider: 'gpu1', trust_tier: 't0_sovereign' as const }],
};
const handbook: RagCollection = {
  id: 'ragc_1',
  tenant_id: 't1',
  name: 'handbook',
  description: 'The employee handbook',
  embedding_model: 'local/bge-m3',
  rerank_model: 'local/bge-reranker',
  settings: {
    chunk_tokens: 384,
    default_trust: 'untrusted',
    nav_min_chunks: 24,
    vet_deadline_secs: 900,
  },
  created_at: '2026-10-02T10:00:00Z',
  created_by: 'ada@example.internal',
};
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const doc = (over: Partial<RagDocument> & Pick<RagDocument, 'doc_id'>): RagDocument => ({
  tenant_id: 't1',
  collection_id: 'ragc_1',
  version: 1,
  content_type: 'text/markdown',
  trust: 'untrusted',
  bytes: 2048,
  status: 'ready',
  chunks: 6,
  tokens: 1500,
  pii_entities: 0,
  findings: [],
  findings_acknowledged: false,
  attempts: 1,
  created_at: '2026-10-03T10:00:00Z',
  created_by: 'ada@example.internal',
  indexed_at: '2026-10-03T10:01:00Z',
  ...over,
});
const travel = doc({ doc_id: 'travel-policy', version: 2, source: 'wiki/travel' });
const pending = doc({
  doc_id: 'expenses',
  status: 'pending',
  chunks: 0,
  tokens: 0,
  attempts: 0,
  created_at: minutesAgo(2),
});
const flagged = doc({
  doc_id: 'vendor-faq',
  status: 'quarantined',
  pii_entities: 3,
  findings: [
    { kind: 'instruction', chunk: 2, heading_path: ['Vendors', 'Payment terms'] },
    { kind: 'near_duplicate', chunk: 4 },
  ],
  created_at: minutesAgo(5),
  vet_deadline_at: minutesAgo(-10),
});
const failed = doc({
  doc_id: 'old-faq',
  status: 'failed',
  error: 'an untrusted document must pass its checks within 900 s of ingest; it did not',
});
const C = '/api/v1/tenants/t1/rag/collections';

function mockRag(
  documents: Array<RagDocument & { live_version?: number | null }>,
  extra: Parameters<typeof mockApi>[0] = {},
  collections: RagCollection[] = [handbook],
) {
  return mockApi({
    'GET /api/v1/tenants': () => ({ body: tenants }),
    'GET /api/v1/tenants/t1/rag/models': () => ({ body: ragModels }),
    [`GET ${C}`]: () => ({ body: collections }),
    [`GET ${C}/handbook`]: () => ({ body: { ...handbook, used_by: ['hr-bot@v3'] } }),
    [`GET ${C}/handbook/documents`]: (c) => {
      const status = c.query.get('status');
      return {
        body: {
          documents: documents.filter((d) => !status || d.status === status),
          next_cursor: null,
        },
      };
    },
    ...extra,
  });
}

async function openRag(roles: Grant[] | null, path = '/rag?tenant=t1&collection=handbook') {
  return renderApp(path, { token: roles ? null : 'test-admin-token' });
}

const docRow = (id: string) =>
  within(screen.getByRole('table', { name: 'Documents of handbook' }))
    .getByRole('button', { name: id })
    .closest('tr')!;

describe('RagPage', () => {
  it("lists the workspace's libraries with their documents and who adds them", async () => {
    mockRag([], {}, [
      { ...handbook, document_counts: { ready: 12, quarantined: 1, pending: 0 } },
      {
        ...handbook,
        id: 'ragc_2',
        name: 'contracts',
        rerank_model: undefined,
        description: '',
        settings: { default_trust: 'trusted', vet_deadline_secs: 3600 },
      },
    ]);
    await openRag(null, '/rag');
    const table = await screen.findByRole('table', { name: 'Document libraries' });
    const row = (name: string) => within(table).getByRole('button', { name }).closest('tr')!;
    expect(row('handbook')).toHaveTextContent('From outside');
    expect(row('contracts')).toHaveTextContent('From your team');
    expect(row('contracts')).toHaveTextContent('n/a');
    expect(within(row('handbook')).getByText('12 ready')).toBeInTheDocument();
    expect(within(row('handbook')).getByText('1 held for review')).toBeInTheDocument();
    expect(within(row('handbook')).queryByText(/waiting/)).not.toBeInTheDocument();
    expect(within(row('contracts')).getByText('None')).toBeInTheDocument();
  });

  it('creates a collection; only the settings that differ from the defaults are sent', async () => {
    let collections: RagCollection[] = [];
    const calls = mockRag([], {
      [`GET ${C}`]: () => ({ body: collections }),
      [`POST ${C}`]: (c) => {
        collections = [{ ...handbook, ...(c.body as Partial<RagCollection>) }];
        return { status: 201, body: collections[0] };
      },
    });
    const user = userEvent.setup();
    const { router } = await openRag(null, '/rag?tenant=t1');
    expect(await screen.findByText('No document libraries yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Learn more/ })).toHaveAttribute(
      'href',
      '/docs/guides/knowledge/#create-a-library',
    );

    await user.click(screen.getAllByRole('button', { name: 'New library' })[0]!);
    const form = await screen.findByRole('form', { name: 'New document library' });
    await user.type(within(form).getByLabelText(/^Name/), 'handbook');
    expect(form).toHaveTextContent('rag.handbook:read');
    // The basic question: who adds documents. Untrusted (outside) is the safe default.
    expect(within(form).getByRole('radio', { name: /People outside the team/ })).toBeChecked();
    const embedding = within(form).getByLabelText(/^Embedding model/);
    await waitFor(() => expect(embedding).toBeEnabled());
    // The embedding models the workspace can reach; the first one on your servers is preselected.
    expect(
      within(embedding)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Select an embedding model…', expect.stringMatching(/^local\/bge-m3 \(/)]);
    expect(embedding).toHaveValue('local/bge-m3');
    expect(form).toHaveTextContent('Search model local/bge-m3, no reranking');
    await user.selectOptions(within(form).getByLabelText(/^Rerank model/), 'local/bge-reranker');
    const deadline = within(form).getByLabelText(/^Time allowed for checks/);
    await user.clear(deadline);
    await user.type(deadline, '30');
    expect(within(form).getByRole('alert')).toHaveTextContent('from 60 seconds to 7 days');
    expect(within(form).getByRole('button', { name: 'Create library' })).toBeDisabled();
    await user.clear(deadline);
    await user.type(deadline, '3600');
    expect(deadline).toHaveAccessibleDescription(/^1 h\./);
    await user.click(within(form).getByRole('button', { name: 'Create library' }));

    await screen.findByRole('table', { name: 'Document libraries' });
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'handbook',
      embedding_model: 'local/bge-m3',
      rerank_model: 'local/bge-reranker',
      settings: { vet_deadline_secs: 3600 },
    });
    expect(router.state.location.search).toMatchObject({ collection: 'handbook' });
  });

  it("shows the control plane's refusal of a collection", async () => {
    mockRag([], {
      [`POST ${C}`]: () => ({
        status: 422,
        body: {
          error: {
            message:
              "embedding_model 'local/bge-m3' is not reachable by this tenant (no provider serves it)",
            type: 'invalid_request_error',
          },
        },
      }),
    });
    const user = userEvent.setup();
    await openRag(null, '/rag?tenant=t1');
    await user.click((await screen.findAllByRole('button', { name: 'New library' }))[0]!);
    const form = await screen.findByRole('form', { name: 'New document library' });
    await user.type(within(form).getByLabelText(/^Name/), 'handbook');
    const embedding = within(form).getByLabelText(/^Embedding model/);
    await waitFor(() => expect(embedding).toHaveValue('local/bge-m3'));
    await user.click(within(form).getByRole('button', { name: 'Create library' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'not reachable by this tenant',
    );
  });

  it('lists documents with their status, findings and vetting deadline, and the nodes that search it', async () => {
    mockRag([
      { ...travel, live_version: 2 },
      { ...pending, live_version: null },
      { ...flagged, live_version: null },
      { ...failed, live_version: null },
      { ...doc({ doc_id: 'benefits', version: 3, status: 'indexing' }), live_version: 2 },
    ]);
    await openRag(null);
    const region = await screen.findByRole('region', { name: 'Documents of handbook' });
    await within(region).findByRole('table', { name: 'Documents of handbook' });

    expect(within(docRow('travel-policy')).getByText('Ready')).toBeInTheDocument();
    expect(docRow('travel-policy')).toHaveTextContent('6 chunks, 1,500 tokens');
    expect(within(docRow('expenses')).getByText('Waiting')).toBeInTheDocument();
    expect(within(docRow('expenses')).getByText(/^1[34] min left$/)).toBeInTheDocument();
    expect(within(docRow('vendor-faq')).getByText('Held for review')).toBeInTheDocument();
    expect(within(docRow('vendor-faq')).getByText(/2 problems/)).toBeInTheDocument();
    expect(docRow('vendor-faq')).toHaveTextContent('3 items hidden');
    expect(within(docRow('old-faq')).getByText('Failed')).toBeInTheDocument();
    expect(within(docRow('benefits')).getByText('Being prepared')).toBeInTheDocument();
    // A new version is indexing while the previous one is still searched.
    expect(within(docRow('benefits')).getByText('Searching v2')).toBeInTheDocument();
    expect(region).toHaveTextContent('1 document is held for review.');
    expect(region).toHaveTextContent('Access name rag.handbook:read');
    expect(await within(region).findByRole('link', { name: 'hr-bot@v3' })).toHaveAttribute(
      'href',
      '/nodes/t1/hr-bot',
    );
  });

  it('filters documents by status on the server', async () => {
    const calls = mockRag([
      { ...travel, live_version: 2 },
      { ...flagged, live_version: null },
    ]);
    const user = userEvent.setup();
    await openRag(null);
    const region = await screen.findByRole('region', { name: 'Documents of handbook' });
    await within(region).findByRole('table', { name: 'Documents of handbook' });
    await user.selectOptions(within(region).getByLabelText('Status'), 'quarantined');
    await waitFor(() =>
      expect(
        within(region).queryByRole('button', { name: 'travel-policy' }),
      ).not.toBeInTheDocument(),
    );
    expect(within(region).getByRole('button', { name: 'vendor-faq' })).toBeInTheDocument();
    expect(calls.some((c) => c.query.get('status') === 'quarantined')).toBe(true);
  });

  it('ingests pasted Markdown as a pending version', async () => {
    const calls = mockRag([], {
      [`POST ${C}/handbook/documents`]: (c) => {
        const body = c.body as { doc_id: string };
        return { status: 202, body: { ...pending, doc_id: body.doc_id, unchanged: false } };
      },
    });
    const user = userEvent.setup();
    await openRag(null);
    const region = await screen.findByRole('region', { name: 'Documents of handbook' });
    expect(await within(region).findByText('No documents yet')).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: 'Add one document' }));
    const form = await screen.findByRole('form', { name: 'Add a document' });
    expect(within(form).getByRole('button', { name: 'Add document' })).toBeDisabled();
    await user.click(within(form).getByLabelText(/^Text/));
    await user.paste('# Travel\n\nBook trains for trips under 4 hours.');
    await user.type(within(form).getByLabelText(/^Document id/), 'travel policy');
    expect(within(form).getByLabelText(/^Document id/)).toHaveAccessibleDescription(
      /no spaces and no \//,
    );
    await user.clear(within(form).getByLabelText(/^Document id/));
    await user.type(within(form).getByLabelText(/^Document id/), 'travel-policy');
    await user.type(within(form).getByLabelText(/^Title/), 'Travel policy');
    await user.selectOptions(within(form).getByLabelText(/^Who wrote it/), 'trusted');
    await user.click(within(form).getByRole('button', { name: 'Add document' }));

    expect(
      await within(region).findByText(/travel-policy version 1 is waiting\./),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      doc_id: 'travel-policy',
      content: '# Travel\n\nBook trains for trips under 4 hours.',
      content_type: 'text/markdown',
      title: 'Travel policy',
      trust: 'trusted',
    });
  });

  it('says when an ingested document is unchanged', async () => {
    mockRag([{ ...travel, live_version: 2 }], {
      [`POST ${C}/handbook/documents`]: () => ({ body: { ...travel, unchanged: true } }),
    });
    const user = userEvent.setup();
    await openRag(null);
    const region = await screen.findByRole('region', { name: 'Documents of handbook' });
    await user.click(await within(region).findByRole('button', { name: 'Add one document' }));
    const form = await screen.findByRole('form', { name: 'Add a document' });
    await user.click(within(form).getByLabelText(/^Text/));
    await user.paste('same text');
    await user.type(within(form).getByLabelText(/^Document id/), 'travel-policy');
    await user.click(within(form).getByRole('button', { name: 'Add document' }));
    expect(
      await within(region).findByText(
        /travel-policy is unchanged: version 2 already has this content/,
      ),
    ).toBeInTheDocument();
  });

  it('uploads an HTML file, naming the document after it, and refuses a PDF', async () => {
    const calls = mockRag([], {
      [`POST ${C}/handbook/documents`]: (c) => ({
        status: 202,
        body: { ...pending, doc_id: (c.body as { doc_id: string }).doc_id },
      }),
    });
    const user = userEvent.setup({ applyAccept: false });
    await openRag(null);
    const region = await screen.findByRole('region', { name: 'Documents of handbook' });
    await user.click(await within(region).findByRole('button', { name: 'Add one document' }));
    const form = await screen.findByRole('form', { name: 'Add a document' });
    await user.click(within(form).getByRole('radio', { name: 'Upload a file' }));

    const input = within(form).getByLabelText(/^File/);
    await user.upload(input, new File(['%PDF-1.7'], 'policy.pdf', { type: 'application/pdf' }));
    expect(input).toHaveAccessibleDescription(/PDF is not supported\. Convert it/);
    expect(within(form).getByRole('button', { name: 'Add document' })).toBeDisabled();

    await user.upload(
      input,
      new File(['<h1>Benefits</h1><p>Dental is covered.</p>'], 'Benefits 2026.html', {
        type: 'text/html',
      }),
    );
    await waitFor(() =>
      expect(within(form).getByLabelText(/^Document id/)).toHaveValue('Benefits-2026'),
    );
    expect(within(form).getByLabelText(/^Format/)).toHaveValue('text/html');
    await user.click(within(form).getByRole('button', { name: 'Add document' }));
    await within(region).findByText(/Benefits-2026 version 1 is waiting/);
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      doc_id: 'Benefits-2026',
      content: '<h1>Benefits</h1><p>Dental is covered.</p>',
      content_type: 'text/html',
    });
  });

  it('uploads several files at once, keeps a failure with its reason, and retries it', async () => {
    let failOnce = true;
    const calls = mockRag([], {
      [`POST ${C}/handbook/documents`]: (c) => {
        const body = c.body as { doc_id: string };
        if (body.doc_id === 'leave' && failOnce) {
          failOnce = false;
          return {
            status: 422,
            body: {
              error: { message: 'the text contains a credential', type: 'invalid_request_error' },
            },
          };
        }
        return { status: 202, body: { ...pending, doc_id: body.doc_id } };
      },
    });
    const user = userEvent.setup({ applyAccept: false });
    await openRag(null);
    const region = await screen.findByRole('region', { name: 'Documents of handbook' });
    await user.click(await within(region).findByRole('button', { name: 'Upload documents' }));
    const drawer = await screen.findByRole('dialog', { name: 'Upload documents to handbook' });
    await user.upload(within(drawer).getByLabelText('Choose files to upload'), [
      new File(['# Travel policy\n\nTrains under 4 hours.'], 'travel.md', {
        type: 'text/markdown',
      }),
      new File(['<title>Leave</title><p>25 days.</p>'], 'leave.html', { type: 'text/html' }),
      new File(['Plain notes'], 'notes.txt', { type: 'text/plain' }),
      new File(['%PDF-1.7'], 'scan.pdf', { type: 'application/pdf' }),
    ]);

    const table = await within(drawer).findByRole('table', { name: 'Files to upload' });
    expect(within(drawer).getByRole('alert')).toHaveTextContent('PDF is not supported');
    expect(within(table).getByLabelText('Document id of travel.md')).toHaveValue('travel');
    expect(within(table).getByLabelText('Title of travel.md')).toHaveValue('Travel policy');
    expect(within(table).getByLabelText('Title of leave.html')).toHaveValue('Leave');
    expect(within(table).getByLabelText('Title of notes.txt')).toHaveValue('notes');
    await user.clear(within(table).getByLabelText('Title of notes.txt'));
    await user.type(within(table).getByLabelText('Title of notes.txt'), 'Team notes');

    await user.click(within(drawer).getByRole('button', { name: 'Upload 3 documents' }));
    expect(
      await within(drawer).findByText(
        'Upload finished: 2 added, 1 failed. Check the failed rows and retry them.',
      ),
    ).toBeInTheDocument();
    expect(within(table).getByText('the text contains a credential')).toBeInTheDocument();
    // What the user typed is kept; only the failed row is sent again.
    expect(within(table).getByLabelText('Title of notes.txt')).toBeDisabled();
    await user.click(within(drawer).getByRole('button', { name: 'Retry 1 failed' }));
    expect(await within(drawer).findByText('Upload finished: 1 added.')).toBeInTheDocument();

    const posts = calls.filter((c) => c.method === 'POST').map((c) => c.body);
    expect(posts).toEqual([
      {
        doc_id: 'travel',
        content: '# Travel policy\n\nTrains under 4 hours.',
        content_type: 'text/markdown',
        title: 'Travel policy',
        source: 'travel.md',
      },
      expect.objectContaining({ doc_id: 'leave', title: 'Leave', content_type: 'text/html' }),
      expect.objectContaining({ doc_id: 'notes', title: 'Team notes', content_type: 'text/plain' }),
      expect.objectContaining({ doc_id: 'leave' }),
    ]);
  });

  it('refuses to upload two files with the same document id', async () => {
    const calls = mockRag([]);
    const user = userEvent.setup();
    await openRag(null);
    const region = await screen.findByRole('region', { name: 'Documents of handbook' });
    await user.click(await within(region).findByRole('button', { name: 'Upload documents' }));
    const drawer = await screen.findByRole('dialog', { name: 'Upload documents to handbook' });
    await user.upload(within(drawer).getByLabelText('Choose files to upload'), [
      new File(['a'], 'faq.md', { type: 'text/markdown' }),
      new File(['b'], 'faq.txt', { type: 'text/plain' }),
    ]);
    const table = await within(drawer).findByRole('table', { name: 'Files to upload' });
    expect(within(table).getAllByText('Used twice.')).toHaveLength(2);
    expect(within(drawer).getByRole('button', { name: 'Upload 2 documents' })).toBeDisabled();
    await user.clear(within(table).getByLabelText('Document id of faq.txt'));
    await user.type(within(table).getByLabelText('Document id of faq.txt'), 'faq-text');
    expect(within(drawer).getByRole('button', { name: 'Upload 2 documents' })).toBeEnabled();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('has no axe violations', async () => {
    mockRag([
      { ...travel, live_version: 2 },
      { ...flagged, live_version: null },
    ]);
    await openRag(null);
    await screen.findByRole('table', { name: 'Documents of handbook' });
    await expectNoAxeViolations();
  });

  it('shows the findings of a quarantined document and releases it only once they are acknowledged', async () => {
    let versions: RagDocument[] = [flagged];
    const calls = mockRag([{ ...flagged, live_version: null }], {
      [`GET ${C}/handbook/documents/vendor-faq`]: () => ({
        body: { doc_id: 'vendor-faq', live_version: null, versions },
      }),
      [`POST ${C}/handbook/documents/vendor-faq/release`]: () => {
        versions = [{ ...flagged, status: 'pending', findings_acknowledged: true }];
        return { body: versions[0] };
      },
    });
    const user = userEvent.setup();
    const { router } = await openRag(null);
    const region = await screen.findByRole('region', { name: 'Documents of handbook' });
    await user.click(await within(region).findByRole('button', { name: 'Review vendor-faq' }));
    expect(router.state.location.search).toMatchObject({ doc: 'vendor-faq' });
    const drawer = await screen.findByRole('dialog', { name: 'vendor-faq' });
    const findings = await within(drawer).findByRole('region', { name: 'What the checks found' });
    expect(findings).toHaveTextContent('The checks found 2 problems');
    expect(within(findings).getByText('Instructions to the model')).toBeInTheDocument();
    expect(within(findings).getByText('Near-copy of another document')).toBeInTheDocument();
    expect(findings).toHaveTextContent('chunk 3, under Vendors > Payment terms');
    expect(findings).toHaveTextContent('chunk 5');
    // Findings come before the release.
    const release = within(drawer).getByRole('region', { name: 'Release' });
    expect(
      findings.compareDocumentPosition(release) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(release).toHaveTextContent('Its checks then get 15 min from the release');

    const button = within(release).getByRole('button', { name: 'Release document' });
    expect(button).toBeDisabled();
    await user.click(
      within(release).getByRole('checkbox', {
        name: 'I have read these problems and release this document',
      }),
    );
    await user.click(button);
    // Pending again, with the findings acknowledged: a worker indexes it again.
    const version = within(drawer).getByRole('region', { name: 'Version 1' });
    expect(await within(version).findByText('Waiting')).toBeInTheDocument();
    expect(version).toHaveTextContent('An approver has read these problems and released it.');
    expect(within(drawer).queryByRole('region', { name: 'Release' })).not.toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith('/release'))?.body).toEqual({
      version: 1,
      acknowledge_findings: true,
    });
  });

  it('releases a version past its ingest deadline: the window counts from the release', async () => {
    const late = { ...flagged, created_at: minutesAgo(60), vet_deadline_at: minutesAgo(45) };
    mockRag([{ ...late, live_version: null }], {
      [`GET ${C}/handbook/documents/vendor-faq`]: () => ({
        body: { doc_id: 'vendor-faq', live_version: null, versions: [late] },
      }),
    });
    await openRag(null, '/rag?tenant=t1&collection=handbook&doc=vendor-faq');
    const drawer = await screen.findByRole('dialog', { name: 'vendor-faq' });
    const release = await within(drawer).findByRole('region', { name: 'Release' });
    expect(release).toHaveTextContent('Its checks then get 15 min from the release');
    expect(release).not.toHaveTextContent(/Ingest the document again/);
    expect(within(release).getByRole('checkbox')).toBeEnabled();
    expect(within(docRow('vendor-faq')).getByText('15 min after release')).toBeInTheDocument();
    expect(within(docRow('vendor-faq')).queryByText('Time ran out')).not.toBeInTheDocument();
  });

  it('counts the deadline of a released version from its release', async () => {
    const released = {
      ...flagged,
      status: 'indexing' as const,
      findings_acknowledged: true,
      created_at: minutesAgo(60),
      released_at: minutesAgo(2),
      vet_deadline_at: minutesAgo(-13),
    };
    mockRag([{ ...released, live_version: null }]);
    await openRag(null, '/rag?tenant=t1&collection=handbook');
    await screen.findByRole('table', { name: 'Documents of handbook' });
    expect(within(docRow('vendor-faq')).getByText(/^1[23] min left$/)).toBeInTheDocument();
  });

  it('shows why a version failed and which version is searched', async () => {
    mockRag([{ ...failed, version: 2, live_version: 1 }], {
      [`GET ${C}/handbook/documents/old-faq`]: () => ({
        body: {
          doc_id: 'old-faq',
          live_version: 1,
          versions: [{ ...failed, version: 2 }, doc({ doc_id: 'old-faq', status: 'ready' })],
        },
      }),
    });
    await openRag(null, '/rag?tenant=t1&collection=handbook&doc=old-faq');
    const drawer = await screen.findByRole('dialog', { name: 'old-faq' });
    expect(
      await within(drawer).findByText('Searches use version 1.', { exact: false }),
    ).toBeInTheDocument();
    const v2 = within(drawer).getByRole('region', { name: 'Version 2' });
    expect(v2).toHaveTextContent('must pass its checks within 900 s of ingest');
    expect(within(drawer).getByRole('region', { name: 'Version 1' })).toHaveTextContent('Searched');
  });

  it('deletes a document after confirmation', async () => {
    let documents = [{ ...travel, live_version: 2 }];
    const calls = mockRag([], {
      [`GET ${C}/handbook/documents`]: () => ({ body: { documents, next_cursor: null } }),
      [`DELETE ${C}/handbook/documents/travel-policy`]: () => {
        documents = [];
        return { status: 204 };
      },
    });
    const user = userEvent.setup();
    await openRag(null);
    await user.click(await screen.findByRole('button', { name: 'Delete travel-policy' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete document?' });
    expect(dialog).toHaveTextContent('It stops being searched at once');
    await user.click(within(dialog).getByRole('button', { name: 'Delete document' }));
    expect(await screen.findByText('No documents yet')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('shows the conflict when a published node version still searches a collection', async () => {
    mockRag([], {
      [`DELETE ${C}/handbook`]: () => ({
        status: 409,
        body: {
          error: {
            message: "collection 'handbook' is searched by published node versions: hr-bot@v3",
            type: 'conflict',
          },
        },
      }),
    });
    const user = userEvent.setup();
    await openRag(null);
    await user.click(await screen.findByRole('button', { name: 'Delete handbook' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this library?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete library' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'searched by published node versions: hr-bot@v3',
    );
  });

  it('lets a developer ingest, but not release', async () => {
    mockRag([{ ...flagged, live_version: null }], {
      ...ssoRoutes(meWith([{ role: 'developer', tenant_id: 't1' }])),
      [`GET ${C}/handbook/documents/vendor-faq`]: () => ({
        body: { doc_id: 'vendor-faq', live_version: null, versions: [flagged] },
      }),
    });
    const user = userEvent.setup();
    await openRag([{ role: 'developer', tenant_id: 't1' }]);
    const region = await screen.findByRole('region', { name: 'Documents of handbook' });
    expect(
      await within(region).findByRole('button', { name: 'Upload documents' }),
    ).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: 'New library' })).not.toHaveAttribute(
      'aria-disabled',
    );
    await user.click(await within(region).findByRole('button', { name: 'Review vendor-faq' }));
    const drawer = await screen.findByRole('dialog', { name: 'vendor-faq' });
    const release = await within(drawer).findByRole('button', { name: 'Release document' });
    expect(release).toHaveAttribute('aria-disabled', 'true');
    expect(release).toHaveAttribute(
      'title',
      'Your role cannot release quarantined documents on this tenant (needs rag.approve).',
    );
    expect(within(drawer).getByRole('checkbox')).toBeDisabled();
  });

  it('a viewer reads collections and documents and changes nothing', async () => {
    const calls = mockRag(
      [{ ...travel, live_version: 2 }],
      ssoRoutes(meWith([{ role: 'viewer', tenant_id: 't1' }])),
    );
    const user = userEvent.setup();
    await openRag([{ role: 'viewer', tenant_id: 't1' }], '/rag?collection=handbook');
    const create = await screen.findByRole('button', { name: 'New library' });
    expect(create).toHaveAccessibleDescription(/needs rag\.write/);
    await user.click(await screen.findByRole('button', { name: 'Delete travel-policy' }));
    await user.click(screen.getByRole('button', { name: 'Delete handbook' }));
    await user.click(screen.getByRole('button', { name: 'Upload documents' }));
    await user.click(screen.getByRole('button', { name: 'Add one document' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('is in the menu only for roles that can read retrieval', async () => {
    mockApi({
      ...ssoRoutes(meWith([{ role: 'billing', tenant_id: 't1' }])),
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/usage': () => ({ body: { events: [], totals: {} } }),
    });
    await renderApp('/', { token: null });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    expect(within(nav).queryByRole('link', { name: 'Knowledge' })).not.toBeInTheDocument();
  });

  it('is in the menu for a viewer', async () => {
    mockApi({
      ...ssoRoutes(meWith([{ role: 'viewer', tenant_id: 't1' }])),
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/usage': () => ({ body: { events: [], totals: {} } }),
    });
    await renderApp('/', { token: null });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Knowledge' })).toHaveAttribute('href', '/rag');
  });
});
