import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { RagCollection, RagDocument, Tenant } from '@/api/types';
import { meWith, ssoRoutes, type Grant } from '@/test/auth';
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
  it("lists the tenant's collections with their documents, models, trust and vetting deadline", async () => {
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
    const table = await screen.findByRole('table', { name: 'Collections' });
    const row = (name: string) => within(table).getByRole('button', { name }).closest('tr')!;
    expect(row('handbook')).toHaveTextContent('local/bge-m3');
    expect(row('handbook')).toHaveTextContent('local/bge-reranker');
    expect(row('handbook')).toHaveTextContent('Untrusted');
    expect(row('handbook')).toHaveTextContent('15 min');
    expect(row('contracts')).toHaveTextContent('Trusted');
    expect(row('contracts')).toHaveTextContent('1 h');
    expect(row('contracts')).toHaveTextContent('n/a');
    expect(within(row('handbook')).getByText('12 ready')).toBeInTheDocument();
    expect(within(row('handbook')).getByText('1 quarantined')).toBeInTheDocument();
    expect(within(row('handbook')).queryByText(/pending/)).not.toBeInTheDocument();
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
    expect(await screen.findByText('No collections')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New collection' }));
    const form = await screen.findByRole('form', { name: 'New collection' });
    await user.type(within(form).getByLabelText(/^Name/), 'handbook');
    expect(form).toHaveTextContent('rag.handbook:read');
    const embedding = within(form).getByLabelText(/^Embedding model/);
    await waitFor(() => expect(embedding).toBeEnabled());
    // The embedding models the tenant can reach, from the control plane.
    expect(
      within(embedding)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Select an embedding model…', 'local/bge-m3 (T0 Sovereign, gpu1)']);
    await user.selectOptions(embedding, 'local/bge-m3');
    await user.selectOptions(within(form).getByLabelText(/^Rerank model/), 'local/bge-reranker');
    const deadline = within(form).getByLabelText(/^Vetting deadline/);
    await user.clear(deadline);
    await user.type(deadline, '30');
    expect(within(form).getByRole('alert')).toHaveTextContent('from 60 seconds to 7 days');
    expect(within(form).getByRole('button', { name: 'Create collection' })).toBeDisabled();
    await user.clear(deadline);
    await user.type(deadline, '3600');
    expect(deadline).toHaveAccessibleDescription(/^1 h\./);
    await user.click(within(form).getByRole('button', { name: 'Create collection' }));

    await screen.findByRole('table', { name: 'Collections' });
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
    await user.click(await screen.findByRole('button', { name: 'New collection' }));
    const form = await screen.findByRole('form', { name: 'New collection' });
    await user.type(within(form).getByLabelText(/^Name/), 'handbook');
    const embedding = within(form).getByLabelText(/^Embedding model/);
    await waitFor(() => expect(embedding).toBeEnabled());
    await user.selectOptions(embedding, 'local/bge-m3');
    await user.click(within(form).getByRole('button', { name: 'Create collection' }));
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
    expect(within(docRow('expenses')).getByText('Pending')).toBeInTheDocument();
    expect(within(docRow('expenses')).getByText(/^1[34] min left$/)).toBeInTheDocument();
    expect(within(docRow('vendor-faq')).getByText('Quarantined')).toBeInTheDocument();
    expect(within(docRow('vendor-faq')).getByText(/2 findings/)).toBeInTheDocument();
    expect(docRow('vendor-faq')).toHaveTextContent('3 pseudonymised');
    expect(within(docRow('old-faq')).getByText('Failed')).toBeInTheDocument();
    expect(within(docRow('benefits')).getByText('Indexing')).toBeInTheDocument();
    // A new version is indexing while the previous one is still searched.
    expect(within(docRow('benefits')).getByText('Searching v2')).toBeInTheDocument();
    expect(region).toHaveTextContent('1 document is quarantined.');
    expect(region).toHaveTextContent('Nodes search it with the scope rag.handbook:read');
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
    await user.click(within(region).getByRole('button', { name: 'Ingest document' }));
    const form = await screen.findByRole('form', { name: 'Ingest document' });
    expect(within(form).getByRole('button', { name: 'Ingest document' })).toBeDisabled();
    await user.click(within(form).getByLabelText(/^Text/));
    await user.paste('# Travel\n\nBook trains for trips under 4 hours.');
    await user.type(within(form).getByLabelText(/^Document id/), 'travel policy');
    expect(within(form).getByLabelText(/^Document id/)).toHaveAccessibleDescription(
      /no spaces and no \//,
    );
    await user.clear(within(form).getByLabelText(/^Document id/));
    await user.type(within(form).getByLabelText(/^Document id/), 'travel-policy');
    await user.type(within(form).getByLabelText(/^Title/), 'Travel policy');
    await user.selectOptions(within(form).getByLabelText(/^Trust/), 'trusted');
    await user.click(within(form).getByRole('button', { name: 'Ingest document' }));

    expect(await within(region).findByRole('status')).toHaveTextContent(
      'travel-policy version 1 is pending.',
    );
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
    await user.click(await within(region).findByRole('button', { name: 'Ingest document' }));
    const form = await screen.findByRole('form', { name: 'Ingest document' });
    await user.click(within(form).getByLabelText(/^Text/));
    await user.paste('same text');
    await user.type(within(form).getByLabelText(/^Document id/), 'travel-policy');
    await user.click(within(form).getByRole('button', { name: 'Ingest document' }));
    expect(await within(region).findByRole('status')).toHaveTextContent(
      'travel-policy is unchanged: version 2 already has this content',
    );
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
    await user.click(await within(region).findByRole('button', { name: 'Ingest document' }));
    const form = await screen.findByRole('form', { name: 'Ingest document' });
    await user.click(within(form).getByRole('radio', { name: 'Upload a file' }));

    const input = within(form).getByLabelText(/^File/);
    await user.upload(input, new File(['%PDF-1.7'], 'policy.pdf', { type: 'application/pdf' }));
    expect(input).toHaveAccessibleDescription(/PDF is not supported\. Convert it/);
    expect(within(form).getByRole('button', { name: 'Ingest document' })).toBeDisabled();

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
    await user.click(within(form).getByRole('button', { name: 'Ingest document' }));
    await within(region).findByRole('status');
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      doc_id: 'Benefits-2026',
      content: '<h1>Benefits</h1><p>Dental is covered.</p>',
      content_type: 'text/html',
    });
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
    const findings = await within(drawer).findByRole('region', { name: 'Scan findings' });
    expect(findings).toHaveTextContent('The ingest checks flagged 2 findings');
    expect(within(findings).getByText('Instructions to the model')).toBeInTheDocument();
    expect(within(findings).getByText('Near-copy of another document')).toBeInTheDocument();
    expect(findings).toHaveTextContent('chunk 3, under Vendors > Payment terms');
    expect(findings).toHaveTextContent('chunk 5');
    // Findings come before the release.
    const release = within(drawer).getByRole('region', { name: 'Release' });
    expect(
      findings.compareDocumentPosition(release) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(release).toHaveTextContent('a fresh vetting window of 15 min from the release');

    const button = within(release).getByRole('button', { name: 'Release document' });
    expect(button).toBeDisabled();
    await user.click(
      within(release).getByRole('checkbox', {
        name: 'I have read these findings and release this document',
      }),
    );
    await user.click(button);
    // Pending again, with the findings acknowledged: a worker indexes it again.
    const version = within(drawer).getByRole('region', { name: 'Version 1' });
    expect(await within(version).findByText('Pending')).toBeInTheDocument();
    expect(version).toHaveTextContent('An approver acknowledged these findings.');
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
    expect(release).toHaveTextContent('a fresh vetting window of 15 min from the release');
    expect(release).not.toHaveTextContent(/Ingest the document again/);
    expect(within(release).getByRole('checkbox')).toBeEnabled();
    expect(within(docRow('vendor-faq')).getByText('15 min after release')).toBeInTheDocument();
    expect(within(docRow('vendor-faq')).queryByText('Deadline passed')).not.toBeInTheDocument();
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
      await within(drawer).findByText('rag_search serves version 1.', { exact: false }),
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
    const dialog = await screen.findByRole('dialog', { name: 'Delete collection?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete collection' }));
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
      await within(region).findByRole('button', { name: 'Ingest document' }),
    ).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: 'New collection' })).not.toHaveAttribute(
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
    const create = await screen.findByRole('button', { name: 'New collection' });
    expect(create).toHaveAccessibleDescription(/needs rag\.write/);
    // Only the tenants the user may read are offered.
    expect(
      within(screen.getByRole('combobox', { name: 'Tenant' }))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Select a tenant…', 'Acme']);
    await user.click(await screen.findByRole('button', { name: 'Delete travel-policy' }));
    await user.click(screen.getByRole('button', { name: 'Delete handbook' }));
    await user.click(screen.getByRole('button', { name: 'Ingest document' }));
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
    expect(within(nav).queryByRole('link', { name: 'Retrieval' })).not.toBeInTheDocument();
  });

  it('is in the menu for a viewer', async () => {
    mockApi({
      ...ssoRoutes(meWith([{ role: 'viewer', tenant_id: 't1' }])),
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/usage': () => ({ body: { events: [], totals: {} } }),
    });
    await renderApp('/', { token: null });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Retrieval' })).toHaveAttribute('href', '/rag');
  });
});
