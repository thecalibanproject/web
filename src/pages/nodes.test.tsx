import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Node, Tenant } from '@/api/types';
import { expectNoAxeViolations } from '@/test/a11y';
import { meWith, ssoRoutes } from '@/test/auth';
import { mockApi, renderApp } from '@/test/utils';

const tenants: Tenant[] = [{ id: 't1', name: 'Acme', created_at: '2026-10-01T10:00:00Z' }];
const v1: Node = {
  id: 'n1',
  tenant_id: 't1',
  name: 'invoice-triage',
  version: 1,
  spec: { kind: 'agent' },
  hash: 'sha256:aaaa',
  state: 'published',
  live: true,
  created_at: '2026-10-02T10:00:00Z',
  published_at: '2026-10-02T11:00:00Z',
};
const v2: Node = { ...v1, id: 'n2', version: 2, state: 'draft', live: false };
const other: Node = { ...v1, id: 'n3', name: 'billing', state: 'retired', live: false };

describe('NodesPage', () => {
  it('lists one row per node with its live and latest versions', async () => {
    mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/nodes': () => ({ body: [v1, v2, other] }),
    });
    await renderApp('/nodes');

    const table = await screen.findByRole('table', { name: 'Assistants' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    const triage = within(table).getByRole('link', { name: 'invoice-triage' }).closest('tr')!;
    expect(triage).toHaveTextContent('Acme');
    const cells = within(triage).getAllByRole('cell');
    expect(cells[2]).toHaveTextContent('v1');
    expect(cells[3]).toHaveTextContent('v2Draft');
    expect(cells[4]).toHaveTextContent('2');
    const billing = within(table).getByRole('link', { name: 'billing' }).closest('tr')!;
    expect(within(billing).getAllByRole('cell')[2]).toHaveTextContent('None');
    expect(within(billing).getAllByRole('cell')[3]).toHaveTextContent('Retired');
  });

  it('opens a node from the list', async () => {
    mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/nodes': () => ({ body: [v1, v2] }),
      'GET /api/v1/tenants/t1/nodes/invoice-triage/versions': () => ({
        body: { name: 'invoice-triage', live: 1, promotion: null, versions: [v1, v2] },
      }),
    });
    const user = userEvent.setup();
    const { router } = await renderApp('/nodes');
    await user.click(await screen.findByRole('link', { name: 'invoice-triage' }));
    expect(await screen.findByRole('table', { name: 'Versions' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/nodes/t1/invoice-triage');
  });

  it('creates an assistant from a template and goes to its page', async () => {
    let nodes: Node[] = [];
    const calls = mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/nodes': () => ({ body: nodes }),
      'GET /api/v1/tenants/t1/rag/collections': () => ({
        body: [
          {
            id: 'c1',
            tenant_id: 't1',
            name: 'handbook',
            embedding_model: 'e',
            settings: {},
            created_at: '2026-10-02T10:00:00Z',
            created_by: 'x',
          },
        ],
      }),
      'POST /api/v1/tenants/t1/nodes/questions-on-documents/versions': (c) => {
        const n: Node = {
          ...v1,
          name: 'questions-on-documents',
          state: 'draft',
          live: false,
          spec: (c.body as { spec: Record<string, unknown> }).spec,
        };
        nodes = [n];
        return { status: 201, body: n };
      },
      'GET /api/v1/tenants/t1/nodes/questions-on-documents/versions': () => ({
        body: { name: 'questions-on-documents', live: null, promotion: null, versions: nodes },
      }),
    });
    const user = userEvent.setup();
    const { router } = await renderApp('/nodes?tenant=t1');

    expect(await screen.findByText('No assistants yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Learn more/ })).toHaveAttribute(
      'href',
      '/docs/guides/assistants/#create-from-template',
    );
    await user.click(screen.getAllByRole('button', { name: 'New assistant' })[0]!);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ new: 1 }));
    const start = await screen.findByRole('form', { name: 'Start from' });
    await user.click(within(start).getByRole('radio', { name: /Questions on documents/ }));
    await user.click(within(start).getByRole('button', { name: 'Next' }));

    const fill = await screen.findByRole('form', { name: /Fill in Questions on documents/ });
    await user.type(within(fill).getByLabelText("Your organization's name"), 'Example Law');
    await user.selectOptions(
      await within(fill).findByRole('combobox', { name: 'Document library' }),
      'handbook',
    );
    await user.click(within(fill).getByRole('button', { name: 'Next' }));

    const form = await screen.findByRole('form', { name: 'Create assistant' });
    expect(within(form).getByLabelText(/^Name/)).toHaveValue('questions-on-documents');
    expect(within(form).getByRole('note')).toHaveTextContent(/a step-by-step flow/);
    expect(within(form).getByLabelText('Document library handbook')).toBeChecked();
    await user.click(within(form).getByRole('button', { name: 'Create assistant' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/nodes/t1/questions-on-documents'),
    );
    const spec = (calls.find((c) => c.method === 'POST')?.body as { spec: Record<string, unknown> })
      .spec;
    expect(spec.datasources).toEqual({ scopes: ['rag.handbook:read'] });
    expect(JSON.stringify(spec)).toContain('research assistant of Example Law');
  });

  it('opens New assistant from a link, and has no axe violations', async () => {
    mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/nodes': () => ({ body: [v1] }),
    });
    await renderApp('/nodes?new=1');
    expect(await screen.findByRole('form', { name: 'Start from' })).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it('has no axe violations on the list', async () => {
    mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/nodes': () => ({ body: [v1, v2] }),
    });
    await renderApp('/nodes');
    await screen.findByRole('table', { name: 'Assistants' });
    await expectNoAxeViolations();
  });

  it('shows New assistant disabled, with the reason, to a viewer', async () => {
    mockApi({
      ...ssoRoutes(meWith([{ role: 'viewer', tenant_id: 't1' }])),
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/nodes': () => ({ body: [v1] }),
    });
    const user = userEvent.setup();
    await renderApp('/nodes', { token: null });

    const button = await screen.findByRole('button', { name: 'New assistant' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('title', expect.stringContaining('needs nodes.write'));
    expect(button).toHaveAccessibleDescription(/Your role cannot create assistants/);
    await user.click(button);
    expect(screen.queryByRole('form', { name: 'Create assistant' })).not.toBeInTheDocument();
  });

  it('shows an error with retry when the list fails', async () => {
    mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/nodes': () => ({
        status: 500,
        body: { error: { message: 'database unavailable', type: 'internal_error' } },
      }),
    });
    await renderApp('/nodes');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('database unavailable');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
