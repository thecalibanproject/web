import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { InboxItem, Tenant } from '@/api/types';
import { meWith, ssoRoutes, type Grant } from '@/test/auth';
import { mockApi, renderApp } from '@/test/utils';

const tenants: Tenant[] = [{ id: 't1', name: 'Acme', created_at: '2026-10-01T10:00:00Z' }];

const QUESTION =
  'Approve this write? Tool mcp://crm/update_ticket#sha256:abc (effect: write) would be called with arguments derived from untrusted data (tool:mail/read_inbox, pii): {"id":7,"note":"Refund to pat@example.com"}. Answer {"approve": true} or {"approve": false}.';

const approval: InboxItem = {
  run_id: 'run_a',
  node: 'triage',
  version: 2,
  step: 'write#0@approve',
  kind: 'approval',
  question: QUESTION,
  invoker: 'api_key:ab12cd',
  waiting_since: '2026-10-11T10:00:00Z',
  expires_at: null,
};
const question: InboxItem = {
  run_id: 'run_q',
  node: 'triage',
  version: 2,
  step: 'clarify#0',
  kind: 'question',
  question: 'How long has the pain lasted?',
  invoker: 'api_key:ab12cd',
  waiting_since: '2026-10-11T10:05:00Z',
  expires_at: '2026-10-11T11:05:00Z',
};

/** An inbox the mocked control plane empties as runs are answered. */
function mockInbox(
  roles: Grant[] | null,
  {
    conflict = false,
    contentVisible = true,
  }: { conflict?: boolean; contentVisible?: boolean } = {},
) {
  let items = [approval, question];
  const answer = (runId: string) => () => {
    if (conflict) {
      return {
        status: 409,
        body: { error: { message: 'the run is not waiting for input', type: 'conflict' } },
      };
    }
    items = items.filter((i) => i.run_id !== runId);
    return { status: 202, body: { id: runId, object: 'node.run', status: 'running' } };
  };
  return mockApi({
    'GET /api/v1/tenants': () => ({ body: tenants }),
    'GET /api/v1/tenants/t1/inbox': () => ({
      body: {
        object: 'list',
        content_visible: contentVisible,
        data: contentVisible ? items : items.map((i) => ({ ...i, question: null })),
      },
    }),
    'POST /api/v1/tenants/t1/runs/run_a/input': answer('run_a'),
    'POST /api/v1/tenants/t1/runs/run_q/input': answer('run_q'),
    ...(roles ? ssoRoutes(meWith(roles)) : {}),
  });
}

async function openInbox(roles: Grant[] | null, opts?: Parameters<typeof mockInbox>[1]) {
  const calls = mockInbox(roles, opts);
  await renderApp('/inbox', { token: roles ? null : 'test-admin-token' });
  const list = await screen.findByRole('list', { name: 'Waiting runs' });
  return { calls, list };
}

const card = (runId: string) =>
  screen.getByRole('link', { name: `Open run ${runId}` }).closest('li')!;

describe('InboxPage', () => {
  it('shows the tool, the taint labels and the arguments of a write waiting for approval', async () => {
    await openInbox(null);
    const a = card('run_a');
    expect(a).toHaveTextContent('Approve a tainted write');
    expect(a).toHaveTextContent('write#0@approve');
    expect(within(a).getByText('mcp://crm/update_ticket#sha256:abc')).toBeInTheDocument();
    expect(within(a).getByText('tool:mail/read_inbox')).toBeInTheDocument();
    expect(within(a).getByText('pii')).toBeInTheDocument();
    expect(within(a).getByLabelText('Arguments')).toHaveTextContent(
      '"note": "Refund to pat@example.com"',
    );
    expect(card('run_q')).toHaveTextContent('How long has the pain lasted?');
    expect(screen.getByText('2 waiting · 1 approval')).toBeInTheDocument();
  });

  it('approves a write as the signed-in user, after a confirmation', async () => {
    const user = userEvent.setup();
    const { calls } = await openInbox([{ role: 'tenant_admin', tenant_id: 't1' }]);
    await user.click(screen.getByRole('button', { name: 'Approve the write of run run_a' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve this write?' });
    expect(dialog).toHaveTextContent('covers this step only');
    await user.click(within(dialog).getByRole('button', { name: 'Approve write' }));

    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith('/runs/run_a/input'))?.body).toEqual({
        answer: { approve: true },
        step: 'write#0@approve',
      }),
    );
    expect(await screen.findByText('Approved the write of run run_a.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Open run run_a' })).not.toBeInTheDocument(),
    );
  });

  it('denies a write at once', async () => {
    const user = userEvent.setup();
    const { calls } = await openInbox(null);
    await user.click(screen.getByRole('button', { name: 'Deny the write of run run_a' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith('/runs/run_a/input'))?.body).toEqual({
        answer: { approve: false },
        step: 'write#0@approve',
      }),
    );
    expect(await screen.findByText('Denied the write of run run_a.')).toBeInTheDocument();
  });

  it('answers a question as text, or as JSON when asked to', async () => {
    const user = userEvent.setup();
    const { calls } = await openInbox(null);
    const q = within(card('run_q'));
    await user.click(q.getByLabelText('Answer is JSON'));
    await user.type(q.getByLabelText('Your answer'), 'two days');
    await user.click(q.getByRole('button', { name: 'Send answer' }));
    expect(q.getByText(/Not valid JSON/)).toBeInTheDocument();

    await user.click(q.getByLabelText('Answer is JSON'));
    await user.click(q.getByRole('button', { name: 'Send answer' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith('/runs/run_q/input'))?.body).toEqual({
        answer: 'two days',
        step: 'clarify#0',
      }),
    );
  });

  it('says when the run no longer waits (someone else answered)', async () => {
    const user = userEvent.setup();
    await openInbox(null, { conflict: true });
    await user.click(screen.getByRole('button', { name: 'Deny the write of run run_a' }));
    expect(await screen.findByText(/This run no longer waits for this step/)).toBeInTheDocument();
  });

  it('hides questions and arguments without runs.data, and answers without runs.answer', async () => {
    await openInbox([{ role: 'viewer', tenant_id: 't1' }], { contentVisible: false });
    const a = card('run_a');
    expect(a).toHaveTextContent('Run content is hidden');
    expect(within(a).queryByLabelText('Arguments')).not.toBeInTheDocument();
    const approve = within(a).getByRole('button', { name: 'Approve the write of run run_a' });
    expect(approve).toHaveAttribute('aria-disabled', 'true');
    expect(approve).toHaveAccessibleDescription(/needs runs\.answer/);
    expect(within(card('run_q')).getByRole('button', { name: 'Send answer' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('says when nothing is waiting', async () => {
    mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/tenants/t1/inbox': () => ({
        body: { object: 'list', content_visible: true, data: [] },
      }),
    });
    await renderApp('/inbox');
    expect(await screen.findByText('Nothing waiting')).toBeInTheDocument();
  });
});
