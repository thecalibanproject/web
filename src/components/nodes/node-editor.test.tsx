import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Node } from '@/api/types';
import { NODE_SPEC_TEMPLATE } from '@/lib/nodeSpec';
import { BLANK_TEMPLATE } from '@/lib/templates';
import { expectNoAxeViolations } from '@/test/a11y';
import { mockApi, renderWithClient } from '@/test/utils';
import { NodeEditor } from './node-editor';

const tenants = [{ id: 't1', name: 'Acme', created_at: '2026-10-02T10:00:00Z' }];

const created = (body: unknown, version = 1): Node => ({
  id: `n${version}`,
  tenant_id: 't1',
  name: 'invoice-triage',
  version,
  spec: (body as { spec: Record<string, unknown> }).spec,
  hash: 'sha256:aaaa',
  state: 'draft',
  live: false,
  created_at: '2026-10-02T10:00:00Z',
});

const refused = (message: string) => ({
  status: 422,
  body: { error: { message, type: 'invalid_request_error' } },
});

describe('NodeEditor', () => {
  it('blocks submission while the spec violates node.schema.json', async () => {
    const calls = mockApi({ 'GET /api/v1/tenants': () => ({ body: tenants }) });
    renderWithClient(<NodeEditor defaultTenant="t1" onCancel={() => {}} onCreated={() => {}} />);
    await screen.findByRole('option', { name: 'Acme' });

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'triage' } });
    fireEvent.click(screen.getByRole('tab', { name: 'JSON' }));
    const { budgets: _b, ...noBudgets } = NODE_SPEC_TEMPLATE;
    fireEvent.change(screen.getByLabelText(/^Settings as JSON/), {
      target: { value: JSON.stringify(noBudgets) },
    });

    expect(await screen.findByText(/missing required property "budgets"/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create assistant/i })).toBeDisabled();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('says when the text is not JSON', async () => {
    mockApi({ 'GET /api/v1/tenants': () => ({ body: tenants }) });
    renderWithClient(<NodeEditor defaultTenant="t1" onCancel={() => {}} onCreated={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'JSON' }));
    fireEvent.change(screen.getByLabelText(/^Settings as JSON/), {
      target: { value: '{"kind": ' },
    });
    expect(await screen.findByText(/The JSON view does not parse/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Settings as JSON/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('creates v1 of a new node with the parsed spec', async () => {
    const calls = mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'POST /api/v1/tenants/t1/nodes/invoice-triage/versions': (c) => ({
        status: 201,
        body: created(c.body),
      }),
    });
    const onCreated = vi.fn();
    const user = userEvent.setup();
    renderWithClient(<NodeEditor defaultTenant="t1" onCancel={() => {}} onCreated={onCreated} />);
    await screen.findByRole('option', { name: 'Acme' });

    await user.type(screen.getByLabelText(/^Name/), 'invoice-triage');
    expect(screen.getByText(/Settings are complete/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create assistant/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onCreated.mock.calls[0]?.[0]).toMatchObject({ name: 'invoice-triage', version: 1 });
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({ spec: BLANK_TEMPLATE.spec });
  });

  it("shows the server's refusal of an unpinned tool with what to do about it", async () => {
    mockApi({
      'POST /api/v1/tenants/t1/nodes/triage/versions': () =>
        refused("MCP tool 'mcp://crm/find' must be pinned with #sha256:<64 hex characters>"),
    });
    const user = userEvent.setup();
    renderWithClient(
      <NodeEditor
        target={{ tenantId: 't1', name: 'triage' }}
        initialSpec={NODE_SPEC_TEMPLATE}
        onCancel={() => {}}
        onCreated={() => {}}
      />,
    );
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The control plane refused this spec: 1 problem');
    expect(within(alert).getByText('Unpinned tool')).toBeInTheDocument();
    expect(alert).toHaveTextContent("MCP tool 'mcp://crm/find' must be pinned");
    expect(alert).toHaveTextContent(/Copy the reference from Tools once the manifest is approved/);

    // Editing clears the stale refusal.
    fireEvent.click(screen.getByRole('tab', { name: 'JSON' }));
    fireEvent.change(screen.getByLabelText(/^Settings as JSON/), {
      target: { value: JSON.stringify({ ...NODE_SPEC_TEMPLATE, description: 'x' }) },
    });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('explains that code vertices are not supported yet', async () => {
    mockApi({
      'POST /api/v1/tenants/t1/nodes/triage/versions': () =>
        refused(
          "vertex 'transform': the `code` vertex type is not yet supported (it arrives with the WASM sandbox)",
        ),
    });
    const user = userEvent.setup();
    renderWithClient(
      <NodeEditor
        target={{ tenantId: 't1', name: 'triage' }}
        initialSpec={NODE_SPEC_TEMPLATE}
        onCancel={() => {}}
        onCreated={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Not supported yet')).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Code vertices arrive with the WASM sandbox/);
  });

  it('keeps the form and the JSON view in sync, both ways', async () => {
    mockApi({ 'GET /api/v1/tenants': () => ({ body: tenants }) });
    const user = userEvent.setup();
    renderWithClient(<NodeEditor defaultTenant="t1" onCancel={() => {}} onCreated={() => {}} />);

    const instructions = screen.getByLabelText('Instructions');
    await user.clear(instructions);
    await user.type(instructions, 'Answer in French.');
    await user.click(screen.getByLabelText(/Search documents/));
    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    const json = JSON.parse(
      screen.getByLabelText<HTMLTextAreaElement>(/^Settings as JSON/).value,
    ) as {
      prompt: { system: string };
      tools: Array<{ ref: string }>;
    };
    expect(json.prompt.system).toBe('Answer in French.');
    expect(json.tools).toEqual([{ ref: 'builtin://rag_search', effect: 'read' }]);

    fireEvent.change(screen.getByLabelText(/^Settings as JSON/), {
      target: {
        value: JSON.stringify({ ...BLANK_TEMPLATE.spec, description: 'From the JSON view' }),
      },
    });
    await user.click(screen.getByRole('tab', { name: 'Form' }));
    expect(screen.getByLabelText('What it is for')).toHaveValue('From the JSON view');
  });

  it('names what only the JSON view can edit, and keeps it', async () => {
    const calls = mockApi({
      'POST /api/v1/tenants/t1/nodes/triage/versions': (c) => ({
        status: 201,
        body: created(c.body),
      }),
    });
    const onCreated = vi.fn();
    const user = userEvent.setup();
    renderWithClient(
      <NodeEditor
        target={{ tenantId: 't1', name: 'triage' }}
        initialSpec={NODE_SPEC_TEMPLATE}
        onCancel={() => {}}
        onCreated={onCreated}
      />,
    );
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(
      'This version uses settings only the JSON view can edit: the answer format, model choice rules, how apps can reach it, other safety settings.',
    );
    await user.type(screen.getByLabelText('What it is for'), '!');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const body = calls.find((c) => c.method === 'POST')?.body as { spec: Record<string, unknown> };
    expect(body.spec).toEqual({
      ...NODE_SPEC_TEMPLATE,
      description: `${NODE_SPEC_TEMPLATE.description}!`,
    });
  });

  it('has no axe violations in either view', async () => {
    mockApi({ 'GET /api/v1/tenants': () => ({ body: tenants }) });
    const user = userEvent.setup();
    renderWithClient(<NodeEditor defaultTenant="t1" onCancel={() => {}} onCreated={() => {}} />);
    await screen.findByRole('option', { name: 'Acme' });
    await expectNoAxeViolations();
    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    await expectNoAxeViolations();
  });
});
