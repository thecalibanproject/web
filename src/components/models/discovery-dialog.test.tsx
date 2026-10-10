import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { DiscoveryResult, ModelCreate, SharedProvider } from '@/api/types';
import { mockApi, renderWithClient } from '@/test/utils';
import { DiscoveryDialog } from './discovery-dialog';

const server: SharedProvider = {
  id: 'qwen3-30b',
  kind: 'openai_compatible',
  base_url: 'http://qwen3-30b:8000/v1',
  trust_tier: 't0_sovereign',
  cache_salt: true,
  has_api_key: false,
  tenants: [],
};

const qwenChat: ModelCreate = {
  id: 'local/qwen3-30b-a3b',
  provider: 'qwen3-30b',
  upstream_model: 'Qwen/Qwen3-30B-A3B',
  kind: 'chat',
  family: 'qwen3',
  capabilities: {
    tools: true,
    vision: false,
    reasoning: 'hybrid',
    reasoning_control: 'enable_thinking',
    inline_think_tags: true,
  },
  trust_tier: 't0_sovereign',
  licence: 'Apache-2.0',
  context_window: 32768,
};

const qwenEmbed: ModelCreate = {
  id: 'local/qwen3-embedding-8b',
  provider: 'qwen3-30b',
  upstream_model: 'Qwen/Qwen3-Embedding-8B',
  kind: 'embedding',
  family: 'qwen3',
  trust_tier: 't0_sovereign',
  licence: null,
  context_window: null,
};

const qwenSmall: ModelCreate = {
  id: 'local/qwen3-8b',
  provider: 'qwen3-30b',
  upstream_model: 'Qwen/Qwen3-8B',
  kind: 'chat',
  trust_tier: 't0_sovereign',
};

const discovery: DiscoveryResult = {
  provider: 'qwen3-30b',
  available: ['Qwen/Qwen3-30B-A3B', 'Qwen/Qwen3-Embedding-8B', 'Qwen/Qwen3-8B', 'Qwen/Qwen3-4B'],
  suggested: [qwenChat, qwenEmbed, qwenSmall],
};

type User = ReturnType<typeof userEvent.setup>;

/**
 * Replaces a field's value the way a user who pastes it would: one input
 * event instead of one per character. Every keystroke re-renders all the
 * suggestion rows, and dozens of them made up most of this test's run time;
 * the fields take whole strings, so the outcome is the same.
 */
async function enter(user: User, field: HTMLElement, text: string) {
  await user.clear(field);
  await user.paste(text);
  expect(field).toHaveValue(text);
}

describe('DiscoveryDialog', () => {
  it('adds only the selected (and edited) suggestions, with per-row results', async () => {
    const calls = mockApi({
      'POST /api/v1/providers/qwen3-30b/discover': () => ({ body: discovery }),
      'GET /api/v1/models': () => ({
        body: [
          {
            id: 'local/qwen3-4b',
            provider_id: 'qwen3-30b',
            upstream_model: 'Qwen/Qwen3-4B',
            kind: 'chat',
            capabilities: {},
            trust_tier: 't0_sovereign',
          },
        ],
      }),
      'POST /api/v1/models': (c) => {
        const body = c.body as ModelCreate;
        if (body.id === 'local/qwen3-30b-a3b') {
          return {
            status: 409,
            body: {
              error: { message: 'model local/qwen3-30b-a3b already exists', type: 'conflict' },
            },
          };
        }
        return { status: 201, body: { ...body, provider_id: body.provider } };
      },
    });
    // No real-timer pause between simulated events: the steps no longer wait on
    // the event loop, which is what stretched this test on a busy machine.
    const user = userEvent.setup({ delay: null });
    renderWithClient(<DiscoveryDialog server={server} onClose={() => {}} />);

    const dialog = await screen.findByRole('dialog', { name: /discover models on qwen3-30b/i });
    // Heuristic warning and the available list (with what's already registered).
    const note = await within(dialog).findByRole('note');
    expect(note).toHaveTextContent(/suggestions are heuristic/i);
    expect(note).toHaveTextContent(/confirm the licence/i);
    const available = await within(dialog).findByRole('list', { name: 'Available models' });
    expect(within(available).getAllByRole('listitem')).toHaveLength(4);
    expect(await within(available).findByText('in catalogue')).toBeInTheDocument();

    // All suggestions start selected; deselect the 8B one.
    const small = within(dialog).getByRole('group', { name: 'Qwen/Qwen3-8B' });
    await user.click(within(small).getByRole('checkbox', { name: 'Qwen/Qwen3-8B' }));
    expect(within(dialog).getByRole('button', { name: 'Add selected (2)' })).toBeEnabled();

    // Inline-edit the embedding row: rename, set a licence and context window.
    const embed = within(dialog).getByRole('group', { name: 'Qwen/Qwen3-Embedding-8B' });
    const embedId = within(embed).getByLabelText(/^Model ID/);
    await enter(user, embedId, 'local/qwen3-embed');
    await enter(user, within(embed).getByLabelText('Licence'), 'Apache-2.0');
    await enter(user, within(embed).getByLabelText('Context window'), '32768');
    expect(within(embed).getByLabelText('Kind')).toHaveValue('embedding');

    // Toggle a capability on the chat row.
    const chat = within(dialog).getByRole('group', { name: 'Qwen/Qwen3-30B-A3B' });
    await user.click(within(chat).getByRole('checkbox', { name: 'Vision' }));

    await user.click(within(dialog).getByRole('button', { name: 'Add selected (2)' }));

    expect(
      await within(dialog).findByText('1 added, 1 failed. Fix the failed rows and try again.'),
    ).toBeInTheDocument();

    const posts = calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/models');
    expect(posts).toHaveLength(2);
    expect(posts.map((p) => (p.body as ModelCreate).id)).toEqual([
      'local/qwen3-30b-a3b',
      'local/qwen3-embed',
    ]);
    expect(posts[0]?.body).toMatchObject({
      upstream_model: 'Qwen/Qwen3-30B-A3B',
      provider: 'qwen3-30b',
      capabilities: { tools: true, vision: true, reasoning: 'hybrid' },
    });
    expect(posts[1]?.body).toMatchObject({
      upstream_model: 'Qwen/Qwen3-Embedding-8B',
      kind: 'embedding',
      licence: 'Apache-2.0',
      context_window: 32768,
      trust_tier: 't0_sovereign',
    });

    // Per-row outcome: the conflict is explained on its row, the other is added.
    expect(within(chat).getByRole('alert')).toHaveTextContent(/conflict \(409\).*already exists/i);
    expect(within(chat).getByText('failed')).toBeInTheDocument();
    expect(within(embed).getByText('added')).toBeInTheDocument();
    expect(within(small).queryByText(/added|failed/)).not.toBeInTheDocument();

    // Fix the conflicting id and retry: only the failed row is re-posted.
    const chatId = within(chat).getByLabelText(/^Model ID/);
    await enter(user, chatId, 'local/qwen3-30b');
    await user.click(within(dialog).getByRole('button', { name: 'Add selected (1)' }));
    await waitFor(() => expect(within(chat).getByText('added')).toBeInTheDocument());
    const retried = calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/models');
    expect(retried).toHaveLength(3);
    expect((retried[2]?.body as ModelCreate).id).toBe('local/qwen3-30b');
  });

  it('shows the server error when discovery fails', async () => {
    mockApi({
      'POST /api/v1/providers/qwen3-30b/discover': () => ({
        status: 502,
        body: { error: { message: 'connection refused', type: 'upstream_error' } },
      }),
    });
    renderWithClient(<DiscoveryDialog server={server} onClose={() => {}} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Discovery failed');
    expect(alert).toHaveTextContent('connection refused');
  });
});
