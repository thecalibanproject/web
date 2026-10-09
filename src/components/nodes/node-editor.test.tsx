import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NODE_SPEC_TEMPLATE } from '@/lib/nodeSpec';
import { mockApi, renderWithClient } from '@/test/utils';
import { NodeEditor } from './node-editor';

const tenants = [{ id: 't1', name: 'Acme', created_at: '2026-10-02T10:00:00Z' }];

describe('NodeEditor', () => {
  it('blocks submission while the spec violates node.schema.json', async () => {
    const calls = mockApi({ 'GET /api/v1/tenants': () => ({ body: tenants }) });
    renderWithClient(<NodeEditor defaultTenant="t1" onDone={() => {}} />);
    await screen.findByRole('option', { name: 'Acme' });

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'triage' } });
    const { budgets: _b, ...noBudgets } = NODE_SPEC_TEMPLATE;
    fireEvent.change(screen.getByLabelText(/^Spec/), {
      target: { value: JSON.stringify(noBudgets) },
    });

    expect(await screen.findByText(/missing required property "budgets"/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create node/i })).toBeDisabled();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('posts a valid spec as parsed JSON', async () => {
    const calls = mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'POST /api/v1/nodes': (c) => ({
        status: 201,
        body: { id: 'n1', version: 1, created_at: '2026-10-02T10:00:00Z', ...(c.body as object) },
      }),
    });
    const onDone = vi.fn();
    const user = userEvent.setup();
    renderWithClient(<NodeEditor defaultTenant="t1" onDone={onDone} />);
    await screen.findByRole('option', { name: 'Acme' });

    await user.type(screen.getByLabelText(/^Name/), 'invoice-triage');
    expect(screen.getByText(/Valid against node.schema.json/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create node/i }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({
      tenant_id: 't1',
      name: 'invoice-triage',
      spec: NODE_SPEC_TEMPLATE,
    });
  });
});
