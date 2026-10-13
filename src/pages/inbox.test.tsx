import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ConsoleRun, InboxItem, Tenant } from '@/api/types';
import { expectNoAxeViolations } from '@/test/a11y';
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
  invoker: 'api_key:ab12cd34ef56',
  waiting_since: '2026-10-11T10:00:00Z',
  expires_at: null,
  approval: {
    tool: 'mcp://crm/update_ticket#sha256:abc',
    effect: 'write',
    labels: ['caller', 'pii'],
    arguments: { ticket: 7, iban: 'FR65 1273 9000 0100 0123 4567 842', note: 'Refund' },
  },
};
const question: InboxItem = {
  run_id: 'run_q',
  node: 'triage',
  version: 2,
  step: 'clarify#0',
  kind: 'question',
  question: 'How long has the pain lasted?',
  invoker: 'api_key:ab12cd34ef56',
  waiting_since: '2026-10-11T10:05:00Z',
  expires_at: '2026-10-11T11:05:00Z',
};

/** The conversation behind the approval: the customer's message and an account lookup. */
const runA: ConsoleRun = {
  id: 'run_a',
  object: 'node.run',
  node: 'triage',
  version: 2,
  status: 'input_required',
  budget: {},
  created_at: '2026-10-11T09:59:00Z',
  content_visible: true,
  input: { message: 'Please refund ticket 7 to FR6512739000010001234567842' },
  steps: [
    {
      id: 'lookup#0',
      vertex: 'lookup',
      kind: 'tool',
      status: 'completed',
      tokens: 0,
      usd: 0,
      labels: ['datasource'],
      started_at: '2026-10-11T09:59:30Z',
      duration_ms: 20,
      output: [{ ticket: 7, iban: 'FR7612739000010001234567890' }],
    },
  ],
};

/** An inbox the mocked control plane empties as runs are answered. */
function mockInbox(
  roles: Grant[] | null,
  {
    conflict = false,
    contentVisible = true,
    extraTenant = false,
  }: { conflict?: boolean; contentVisible?: boolean; extraTenant?: boolean } = {},
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
    return { status: 202, body: { ...runA, id: runId, status: 'running' } };
  };
  const all = extraTenant
    ? [...tenants, { id: 't2', name: 'Cedar Bank', created_at: '2026-10-02T10:00:00Z' }]
    : tenants;
  return mockApi({
    'GET /api/v1/tenants': () => ({ body: all }),
    'GET /api/v1/tenants/t1/inbox': () => ({
      body: {
        object: 'list',
        content_visible: contentVisible,
        data: contentVisible
          ? items
          : items.map((i) => ({
              ...i,
              question: null,
              approval: i.approval && { ...i.approval, arguments: undefined },
            })),
      },
    }),
    'GET /api/v1/tenants/t2/inbox': () => ({
      body: {
        object: 'list',
        content_visible: true,
        data: [{ ...question, run_id: 'run_t2', question: 'Which branch?' }],
      },
    }),
    'GET /api/v1/tenants/t1/runs/run_a': () => ({ body: runA }),
    'GET /api/v1/tenants/t1/runs/run_q': () => ({
      body: { ...runA, id: 'run_q', input: { case: 'Chest pain' }, steps: [] },
    }),
    'GET /api/v1/tenants/t2/runs/run_t2': () => ({
      body: { ...runA, id: 'run_t2', input: 'Hello', steps: [] },
    }),
    'POST /api/v1/tenants/t1/runs/run_a/input': answer('run_a'),
    'POST /api/v1/tenants/t1/runs/run_q/input': answer('run_q'),
    ...(roles ? ssoRoutes(meWith(roles)) : {}),
  });
}

async function openInbox(roles: Grant[] | null, opts?: Parameters<typeof mockInbox>[1]) {
  const calls = mockInbox(roles, opts);
  await renderApp('/inbox', { token: roles ? null : 'test-admin-token' });
  const list = await screen.findByRole('list', { name: 'Waiting for you' });
  return { calls, list };
}

const card = (runId: string) =>
  screen.getByRole('link', { name: `Open conversation ${runId}` }).closest('li')!;

const answerBody = (calls: ReturnType<typeof mockInbox>, runId: string) =>
  calls.find((c) => c.method === 'POST' && c.path.endsWith(`/runs/${runId}/input`))?.body;

const APPROVE_A = 'Approve update_ticket on crm for conversation run_a';
const REJECT_A = 'Reject update_ticket on crm for conversation run_a';

describe('InboxPage (Approvals)', () => {
  it('shows a plain card: the action, why it needs you, and its details checked against the conversation', async () => {
    await openInbox(null);
    const a = card('run_a');
    expect(within(a).getAllByRole('heading')[0]).toHaveTextContent(
      'Needs your approval: update_ticket on crm',
    );
    expect(a).toHaveTextContent(
      "Why it needs you: It changes something in another system, and its details came from the customer's message (includes personal data).",
    );
    expect(a).toHaveTextContent('Started by An app key (ab12cd)');
    const args = within(a).getByLabelText('Arguments');
    expect(args).toHaveTextContent('ticket7');
    // The IBAN is the customer's, not the one on file: flagged.
    await waitFor(() =>
      expect(
        within(args).getByText('FR65 1273 9000 0100 0123 4567 842').closest('dd'),
      ).toHaveTextContent("Only in the customer's message"),
    );
    expect(within(a).getByLabelText('What the customer wrote')).toHaveTextContent(
      'Please refund ticket 7',
    );
    expect(card('run_q')).toHaveTextContent('How long has the pain lasted?');
    expect(screen.getByText('2 waiting, 1 approval')).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it('approves an action as the signed-in user, after a confirmation', async () => {
    const user = userEvent.setup();
    const { calls } = await openInbox([{ role: 'tenant_admin', tenant_id: 't1' }]);
    await user.click(screen.getByRole('button', { name: APPROVE_A }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve update_ticket on crm?' });
    expect(dialog).toHaveTextContent('covers this step only');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(answerBody(calls, 'run_a')).toEqual({
        answer: { approve: true },
        step: 'write#0@approve',
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: 'Open conversation run_a' }),
      ).not.toBeInTheDocument(),
    );
    const decided = screen.getByRole('heading', { name: 'Decided here' }).parentElement!;
    expect(decided).toHaveTextContent('Approved update_ticket on crm for conversation run_a.');
  });

  it('rejects only with a reason, and sends the reason with the answer', async () => {
    const user = userEvent.setup();
    const { calls } = await openInbox(null);
    await user.click(screen.getByRole('button', { name: REJECT_A }));
    const dialog = await screen.findByRole('dialog', { name: 'Reject update_ticket on crm?' });
    const reject = within(dialog).getByRole('button', { name: 'Reject' });
    expect(reject).toBeEnabled();
    expect(dialog).toHaveTextContent('kept with the conversation');
    await user.click(reject);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose a reason');

    await user.click(within(dialog).getByLabelText('Other'));
    await user.click(reject);
    expect(within(dialog).getByLabelText(/Your reason/)).toHaveAccessibleDescription(
      /Write your reason/,
    );
    expect(answerBody(calls, 'run_a')).toBeUndefined();
    await user.click(within(dialog).getByLabelText('The request looks suspicious'));
    await user.type(within(dialog).getByLabelText(/Anything to add/), 'IBAN differs');
    await user.click(reject);

    await waitFor(() =>
      expect(answerBody(calls, 'run_a')).toEqual({
        answer: { approve: false, reason: 'The request looks suspicious: IBAN differs' },
        step: 'write#0@approve',
      }),
    );
  });

  it('reviews with the keyboard: J and K move, A approves, R rejects', async () => {
    const user = userEvent.setup();
    await openInbox(null);
    const first = card('run_a');
    const second = card('run_q');
    first.focus();
    await user.keyboard('j');
    expect(second).toHaveFocus();
    await user.keyboard('k');
    expect(first).toHaveFocus();
    await user.keyboard('a');
    const approve = await screen.findByRole('dialog', { name: 'Approve update_ticket on crm?' });
    await user.click(within(approve).getByRole('button', { name: 'Cancel' }));
    first.focus();
    await user.keyboard('r');
    expect(
      await screen.findByRole('dialog', { name: 'Reject update_ticket on crm?' }),
    ).toBeInTheDocument();
  });

  it('ignores the review keys while typing an answer', async () => {
    const user = userEvent.setup();
    await openInbox(null);
    const field = within(card('run_q')).getByLabelText('Your answer');
    await user.type(field, 'a few days');
    expect(field).toHaveValue('a few days');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
      expect(answerBody(calls, 'run_q')).toEqual({ answer: 'two days', step: 'clarify#0' }),
    );
  });

  it('keeps Send answer enabled, says an empty answer is missing, and sends with Ctrl+Enter', async () => {
    const user = userEvent.setup();
    const { calls } = await openInbox(null);
    const q = within(card('run_q'));
    const field = q.getByLabelText('Your answer');
    await user.click(q.getByRole('button', { name: 'Send answer' }));
    expect(field).toHaveAccessibleDescription(/Write an answer first/);
    expect(field).toHaveFocus();
    expect(answerBody(calls, 'run_q')).toBeUndefined();

    await user.type(field, 'since Monday');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() =>
      expect(answerBody(calls, 'run_q')).toEqual({ answer: 'since Monday', step: 'clarify#0' }),
    );
  });

  it('says when the conversation no longer waits (someone else answered)', async () => {
    const user = userEvent.setup();
    await openInbox(null, { conflict: true });
    await user.click(screen.getByRole('button', { name: APPROVE_A }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve update_ticket on crm?' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText(/no longer waits for this step/)).toBeInTheDocument();
  });

  it('shows the action and where its data came from, but hides details without runs.data', async () => {
    await openInbox([{ role: 'viewer', tenant_id: 't1' }], { contentVisible: false });
    const a = card('run_a');
    expect(a).toHaveTextContent('update_ticket on crm');
    expect(within(a).getByText('Personal data')).toBeInTheDocument();
    expect(a).toHaveTextContent('Hidden: the details are conversation content (needs runs.data)');
    expect(within(a).queryByLabelText('Arguments')).not.toBeInTheDocument();
    expect(
      within(card('run_q')).queryByText('How long has the pain lasted?'),
    ).not.toBeInTheDocument();
    const approve = within(a).getByRole('button', { name: APPROVE_A });
    expect(approve).toHaveAttribute('aria-disabled', 'true');
    expect(approve).toHaveAccessibleDescription(/needs runs\.answer/);
    expect(within(card('run_q')).getByRole('button', { name: 'Send answer' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('shows the question as it is when the conversation recorded no structured approval', async () => {
    mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/tenants/t1/inbox': () => ({
        body: { object: 'list', content_visible: true, data: [{ ...approval, approval: null }] },
      }),
      'GET /api/v1/tenants/t1/runs/run_a': () => ({ body: runA }),
    });
    await renderApp('/inbox');
    await screen.findByRole('list', { name: 'Waiting for you' });
    expect(card('run_a')).toHaveTextContent(QUESTION);
  });

  it('shows what waits in every workspace, and filters to one', async () => {
    const user = userEvent.setup();
    await openInbox(null, { extraTenant: true });
    expect(
      await screen.findByText(/3 waiting, 1 approval across your workspaces/),
    ).toBeInTheDocument();
    expect(card('run_t2')).toHaveTextContent('Workspace Cedar Bank');
    await user.click(screen.getByLabelText('Only Acme'));
    expect(
      screen.queryByRole('link', { name: 'Open conversation run_t2' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('2 waiting, 1 approval')).toBeInTheDocument();
  });

  it('keeps ?tenant= links working as a filter', async () => {
    mockInbox(null, { extraTenant: true });
    await renderApp('/inbox?tenant=t2');
    await screen.findByRole('list', { name: 'Waiting for you' });
    expect(await screen.findByText(/Only Cedar Bank/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open conversation run_a' })).not.toBeInTheDocument();
    expect(card('run_t2')).toBeInTheDocument();
  });

  it('says when nothing is waiting, with one action and a docs link', async () => {
    mockApi({
      'GET /api/v1/tenants': () => ({ body: tenants }),
      'GET /api/v1/tenants/t1/inbox': () => ({
        body: { object: 'list', content_visible: true, data: [] },
      }),
    });
    await renderApp('/inbox');
    expect(await screen.findByText('Nothing is waiting for you')).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: /Learn more/ }).map((l) => l.getAttribute('href')),
    ).toContain('/docs/guides/approvals/#what-needs-approval');
    await expectNoAxeViolations();
  });
});
