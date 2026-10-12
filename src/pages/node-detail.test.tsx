import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Node, NodeDiff, NodeVersions, Tenant } from '@/api/types';
import { meWith, ssoRoutes, type Grant } from '@/test/auth';
import { mockApi, renderApp } from '@/test/utils';

const tenants: Tenant[] = [{ id: 't1', name: 'Acme', created_at: '2026-10-01T10:00:00Z' }];
const spec = {
  kind: 'agent',
  prompt: { system: 'Triage the case.' },
  model_policy: {},
  budgets: { steps: 8, tokens: 2000, wall_clock_s: 60 },
};
const v1: Node = {
  id: 'n1',
  tenant_id: 't1',
  name: 'triage',
  version: 1,
  spec,
  hash: 'sha256:1111111111111111aaaa',
  state: 'published',
  live: true,
  created_at: '2026-10-02T10:00:00Z',
  created_by: 'ada@example.internal',
  published_at: '2026-10-02T11:00:00Z',
};
const v2: Node = {
  ...v1,
  id: 'n2',
  version: 2,
  spec: { ...spec, budgets: { ...spec.budgets, steps: 150 } },
  hash: 'sha256:2222222222222222bbbb',
  state: 'draft',
  live: false,
  published_at: null,
};

const PATH = '/api/v1/tenants/t1/nodes/triage';

const refused = (status: number, message: string) => ({
  status,
  body: { error: { message, type: status === 409 ? 'conflict' : 'invalid_request_error' } },
});

/** A node whose versions change as the mocked control plane publishes, promotes and retires. */
function mockNode(versions: Node[], extra: Parameters<typeof mockApi>[0] = {}) {
  let list = versions;
  const set = (version: number, patch: Partial<Node>) => {
    list = list.map((v) => (v.version === version ? { ...v, ...patch } : v));
    return list.find((v) => v.version === version)!;
  };
  const makeLive = (version: number) => {
    list = list.map((v) => ({ ...v, live: v.version === version }));
  };
  const calls = mockApi({
    'GET /api/v1/tenants': () => ({ body: tenants }),
    [`GET ${PATH}/versions`]: () => {
      const live = list.find((v) => v.live)?.version ?? null;
      const body: NodeVersions = {
        name: 'triage',
        live,
        promotion:
          live == null
            ? null
            : { version: live, promoted_at: '2026-10-03T09:00:00Z', promoted_by: 'ada' },
        versions: list,
      };
      return { body };
    },
    [`POST ${PATH}/versions/2/publish`]: (c) => {
      const promote = (c.body as { promote: boolean }).promote;
      if (promote) makeLive(2);
      return { body: set(2, { state: 'published', published_at: '2026-10-04T10:00:00Z' }) };
    },
    [`POST ${PATH}/promote`]: (c) => {
      makeLive((c.body as { version: number }).version);
      return { body: list.find((v) => v.live) };
    },
    [`POST ${PATH}/versions/1/retire`]: () => ({
      body: set(1, { state: 'retired', live: false, retired_at: '2026-10-05T10:00:00Z' }),
    }),
    'DELETE /api/v1/tenants/t1/nodes/n2': () => {
      list = list.filter((v) => v.id !== 'n2');
      return { status: 204 };
    },
    ...extra,
  });
  return calls;
}

const versionRow = (version: number) =>
  within(screen.getByRole('table', { name: 'Versions' }))
    .getByText(`v${version}`)
    .closest('tr')!;

async function openAs(roles: Grant[] | null, versions: Node[] = [v1, v2], extra = {}) {
  const calls = mockNode(versions, {
    ...(roles ? ssoRoutes(meWith(roles)) : {}),
    ...extra,
  });
  const rendered = await renderApp('/nodes/t1/triage', {
    token: roles ? null : 'test-admin-token',
  });
  await screen.findByRole('table', { name: 'Versions' });
  return { calls, ...rendered };
}

describe('NodeDetailPage', () => {
  it('lists versions with state, live marker, hash and author, newest first', async () => {
    await openAs(null);
    expect(screen.getByRole('heading', { name: 'triage' })).toBeInTheDocument();
    expect(screen.getByText('Live: v1')).toBeInTheDocument();
    expect(screen.getByText(/made live .* by ada/)).toBeInTheDocument();

    const rows = within(screen.getByRole('table', { name: 'Versions' })).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('v2');
    expect(rows[2]).toHaveTextContent('v1');
    const live = versionRow(1);
    expect(within(live).getByText('published')).toBeInTheDocument();
    expect(within(live).getByText('live')).toBeInTheDocument();
    expect(within(live).getByText('sha256:111111111111')).toHaveAttribute('title', v1.hash);
    expect(live).toHaveTextContent('ada@example.internal');
    expect(within(versionRow(2)).getByText('draft')).toBeInTheDocument();
  });

  it("shows a version's spec read-only, as formatted JSON", async () => {
    const user = userEvent.setup();
    const { router } = await openAs(null);
    await user.click(screen.getByRole('button', { name: 'View spec of v1' }));

    const drawer = await screen.findByRole('dialog', { name: 'triage v1' });
    expect(drawer).toHaveTextContent('Read only. Change a node by creating a new version.');
    expect(within(drawer).getByLabelText('Node spec').textContent).toBe(
      JSON.stringify(spec, null, 2),
    );
    expect(drawer).toHaveTextContent(v1.hash);
    expect(router.state.location.search).toMatchObject({ version: 1 });
  });

  it('publishes a draft and makes it live', async () => {
    const user = userEvent.setup();
    const { calls } = await openAs(null);
    await user.click(within(versionRow(2)).getByRole('button', { name: 'Publish v2' }));

    const dialog = await screen.findByRole('dialog', { name: 'Publish triage v2?' });
    expect(
      within(dialog).getByRole('checkbox', { name: 'Make it the live version' }),
    ).toBeChecked();
    expect(dialog).toHaveTextContent('Runs that name no version run it instead of v1.');
    await user.click(within(dialog).getByRole('button', { name: 'Publish and make live' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await within(versionRow(2)).findByText('live')).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith('/publish'))?.body).toEqual({ promote: true });
  });

  it('publishes without promoting when asked', async () => {
    const user = userEvent.setup();
    const { calls } = await openAs(null);
    await user.click(within(versionRow(2)).getByRole('button', { name: 'Publish v2' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish triage v2?' });
    await user.click(within(dialog).getByRole('checkbox', { name: 'Make it the live version' }));
    expect(dialog).toHaveTextContent('v1 stays live.');
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.path.endsWith('/publish'))?.body).toEqual({ promote: false });
  });

  it('lists every problem when the control plane refuses to publish', async () => {
    const user = userEvent.setup();
    await openAs(null, [v1, v2], {
      [`POST ${PATH}/versions/2/publish`]: () =>
        refused(
          422,
          "cannot publish triage@v2: tool 'mcp://crm/find#sha256:ab': 'find' has no approved manifest on server 'crm'; datasource scope 'shop.orders:read': the tenant has no datasource named 'shop'; budgets.steps = 150 exceeds the tenant's node cap of 100",
        ),
    });
    await user.click(within(versionRow(2)).getByRole('button', { name: 'Publish v2' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish triage v2?' });
    await user.click(within(dialog).getByRole('button', { name: 'Publish and make live' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Cannot publish triage@v2: 3 problems');
    expect(within(alert).getByText('Tool not approved')).toBeInTheDocument();
    expect(within(alert).getByText('Unknown datasource scope')).toBeInTheDocument();
    expect(within(alert).getByText('Over the node caps')).toBeInTheDocument();
    expect(alert).toHaveTextContent("budgets.steps = 150 exceeds the tenant's node cap of 100");
    expect(alert).toHaveTextContent(/raise the tenant's node caps/);
    // Still a draft: the dialog stays open.
    expect(within(versionRow(2)).getByText('draft')).toBeInTheDocument();
  });

  it('makes another published version live (rollback)', async () => {
    const user = userEvent.setup();
    const v2pub: Node = { ...v2, state: 'published', published_at: '2026-10-04T10:00:00Z' };
    const { calls } = await openAs(null, [v1, v2pub]);
    expect(within(versionRow(1)).queryByRole('button', { name: 'Make v1 live' })).toBeNull();
    await user.click(within(versionRow(2)).getByRole('button', { name: 'Make v2 live' }));
    const dialog = await screen.findByRole('dialog', { name: 'Make triage v2 live?' });
    expect(dialog).toHaveTextContent(/v1 stays published/);
    await user.click(within(dialog).getByRole('button', { name: 'Make live' }));
    expect(await screen.findByText('Live: v2')).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith('/promote'))?.body).toEqual({ version: 2 });
  });

  it('retires a version after explaining that runs in flight finish on it', async () => {
    const user = userEvent.setup();
    await openAs(null);
    await user.click(within(versionRow(1)).getByRole('button', { name: 'Retire v1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Retire triage v1?' });
    expect(dialog).toHaveTextContent('new runs of it are refused');
    expect(dialog).toHaveTextContent(
      'Runs already in flight are not cut off: they finish on the version they started on.',
    );
    expect(dialog).toHaveTextContent(/It is the live version/);
    expect(dialog).toHaveTextContent(/Retirement is final/);
    await user.click(within(dialog).getByRole('button', { name: 'Retire version' }));
    expect(await within(versionRow(1)).findByText('retired')).toBeInTheDocument();
    expect(screen.getByText('No live version')).toBeInTheDocument();
  });

  it('shows the conflict when another published version still calls it', async () => {
    const user = userEvent.setup();
    await openAs(null, [v1, v2], {
      [`POST ${PATH}/versions/1/retire`]: () =>
        refused(409, 'triage@v1 is called by intake@v3 (node://); retire that first'),
    });
    await user.click(within(versionRow(1)).getByRole('button', { name: 'Retire v1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Retire triage v1?' });
    await user.click(within(dialog).getByRole('button', { name: 'Retire version' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'triage@v1 is called by intake@v3',
    );
  });

  it('deletes a draft', async () => {
    const user = userEvent.setup();
    const { calls } = await openAs(null);
    expect(within(versionRow(1)).queryByRole('button', { name: 'Delete v1' })).toBeNull();
    await user.click(within(versionRow(2)).getByRole('button', { name: 'Delete v2' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete node version?' });
    expect(dialog).toHaveTextContent('Only this draft version is deleted');
    await user.click(within(dialog).getByRole('button', { name: 'Delete node version' }));
    await waitFor(() =>
      expect(within(screen.getByRole('table', { name: 'Versions' })).queryByText('v2')).toBeNull(),
    );
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('compares two versions with the control plane diff', async () => {
    const diff: NodeDiff = {
      name: 'triage',
      from: { version: 1, hash: v1.hash, state: 'published' },
      to: { version: 2, hash: v2.hash, state: 'draft' },
      identical: false,
      changes: [
        { path: '/budgets/steps', op: 'changed', from: 8, to: 150 },
        { path: '/guards', op: 'added', to: { max_repeats: 2 } },
      ],
    };
    const calls = mockNode([v1, v2], { [`GET ${PATH}/diff`]: () => ({ body: diff }) });
    await renderApp('/nodes/t1/triage');

    const region = await screen.findByRole('region', { name: 'Compare versions' });
    const table = await within(region).findByRole('table', { name: 'Changes' });
    const steps = within(table).getByText('/budgets/steps').closest('tr')!;
    expect(within(steps).getByText('changed')).toBeInTheDocument();
    expect(steps).toHaveTextContent('8');
    expect(steps).toHaveTextContent('150');
    const guards = within(table).getByText('/guards').closest('tr')!;
    expect(within(guards).getByText('added')).toBeInTheDocument();
    const query = calls.find((c) => c.path.endsWith('/diff'))!.query;
    expect([query.get('from'), query.get('to')]).toEqual(['1', '2']);
    expect(region).toHaveTextContent('sha256:111111111111');
  });

  it('says when two versions are identical', async () => {
    mockNode([v1, v2], {
      [`GET ${PATH}/diff`]: () => ({
        body: {
          name: 'triage',
          from: { version: 1 },
          to: { version: 2 },
          identical: true,
          changes: [],
        },
      }),
    });
    await renderApp('/nodes/t1/triage');
    expect(await screen.findByText('Identical specs')).toBeInTheDocument();
  });

  it('a viewer sees the actions disabled, each with the reason', async () => {
    const user = userEvent.setup();
    const { calls } = await openAs([{ role: 'viewer', tenant_id: 't1' }]);
    const publish = within(versionRow(2)).getByRole('button', { name: 'Publish v2' });
    expect(publish).toHaveAttribute('aria-disabled', 'true');
    expect(publish).toHaveAttribute(
      'title',
      'Your role cannot publish, promote or retire node versions on this tenant (needs nodes.publish).',
    );
    const del = within(versionRow(2)).getByRole('button', { name: 'Delete v2' });
    expect(del).toHaveAccessibleDescription(/needs nodes\.write/);
    expect(screen.getByRole('button', { name: 'New version' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(publish);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Reading is allowed: the spec still opens.
    await user.click(within(versionRow(1)).getByRole('button', { name: 'View spec of v1' }));
    expect(await screen.findByRole('dialog', { name: 'triage v1' })).toBeInTheDocument();
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('a developer creates versions but cannot publish them', async () => {
    const user = userEvent.setup();
    const v3: Node = { ...v2, id: 'n3', version: 3 };
    const { calls } = await openAs([{ role: 'developer', tenant_id: 't1' }], [v1, v2], {
      [`POST ${PATH}/versions`]: () => ({ status: 201, body: v3 }),
    });
    expect(within(versionRow(2)).getByRole('button', { name: 'Publish v2' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(versionRow(2)).getByRole('button', { name: 'Delete v2' })).not.toHaveAttribute(
      'aria-disabled',
    );

    await user.click(screen.getByRole('button', { name: 'New version' }));
    const form = await screen.findByRole('form', { name: 'Create version' });
    // Starts from the latest version's spec.
    expect(within(form).getByLabelText(/^Spec/)).toHaveValue(JSON.stringify(v2.spec, null, 2));
    await user.click(within(form).getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('Draft v3 created.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ spec: v2.spec });
  });

  it('says so when the node does not exist', async () => {
    mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      [`GET ${PATH}/versions`]: () => ({
        status: 404,
        body: { error: { message: 'node not found', type: 'not_found' } },
      }),
    });
    await renderApp('/nodes/t1/triage');
    expect(await screen.findByText('Node not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to nodes' })).toBeInTheDocument();
  });

  describe('data access', () => {
    const ragSpec = {
      ...spec,
      datasources: { scopes: ['rag.handbook:read', 'rag.*:read', 'shop.orders:read'] },
      tools: [{ ref: 'builtin://rag_search', effect: 'read' }],
    };
    const searching: Node = { ...v1, spec: ragSpec };

    it('shows the collections the live version searches, linked to Retrieval', async () => {
      await openAs(null, [searching, v2]);
      const card = screen.getByRole('region', { name: 'Data access' });
      expect(card).toHaveTextContent('Data access of v1');
      const handbook = within(card).getByRole('link', {
        name: 'rag.handbook:read: open collection handbook in Retrieval',
      });
      expect(handbook).toHaveAttribute('href', '/rag?tenant=t1&collection=handbook');
      expect(
        within(card).getByRole('link', {
          name: 'rag.*:read: open every collection of the tenant in Retrieval',
        }),
      ).toHaveAttribute('href', '/rag?tenant=t1');
      expect(card).toHaveTextContent('searches handbook');
      expect(card).toHaveTextContent('shop.orders:read');
      expect(within(card).queryByText('rag_search not used')).not.toBeInTheDocument();
    });

    it('shows the scopes of a version in its spec, and links only for roles that read retrieval', async () => {
      const user = userEvent.setup();
      await openAs(
        [
          { role: 'billing', tenant_id: 't1' },
          { role: 'developer', tenant_id: 't9' },
        ],
        [{ ...searching, spec: { ...ragSpec, tools: [] } }],
      );
      await user.click(screen.getByRole('button', { name: 'View spec of v1' }));
      const drawer = await screen.findByRole('dialog', { name: 'triage v1' });
      const access = within(drawer).getByRole('region', { name: 'Data access' });
      const list = within(access).getByRole('list', { name: 'Document collections' });
      expect(list).toHaveTextContent('rag.handbook:read');
      expect(within(list).queryByRole('link')).not.toBeInTheDocument();
      expect(access).toHaveTextContent('rag_search not used');
    });

    it('has no data access card for a version without scopes', async () => {
      await openAs(null);
      expect(screen.queryByRole('region', { name: 'Data access' })).not.toBeInTheDocument();
    });
  });
});
