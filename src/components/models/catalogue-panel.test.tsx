import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Model } from '@/api/types';
import { mockApi, renderWithClient } from '@/test/utils';
import { CataloguePanel } from './catalogue-panel';

const qwen: Model = {
  id: 'local/qwen3-8b',
  provider_id: 'qwen3-30b',
  provider_kind: 'openai_compatible',
  upstream_model: 'Qwen/Qwen3-8B',
  kind: 'chat',
  family: 'qwen3',
  capabilities: {
    tools: true,
    vision: false,
    reasoning: 'hybrid',
    reasoning_control: 'enable_thinking',
  },
  trust_tier: 't0_sovereign',
  licence: 'Apache-2.0',
  context_window: 32768,
};

const embed: Model = {
  id: 'local/bge-m3',
  provider_id: 'qwen3-30b',
  provider_kind: null,
  upstream_model: 'BAAI/bge-m3',
  kind: 'embedding',
  capabilities: {},
  trust_tier: 't0_sovereign',
};

describe('CataloguePanel', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows kind, family and capability badges', async () => {
    mockApi({ 'GET /api/v1/models': () => ({ body: [qwen, embed] }) });
    renderWithClient(<CataloguePanel />);
    const table = await screen.findByRole('table', { name: 'Model registry' });
    const row = within(table).getByText('local/qwen3-8b').closest('tr')!;
    expect(within(row).getByText('Chat')).toBeInTheDocument();
    expect(within(row).getByText('qwen3')).toBeInTheDocument();
    expect(within(row).getByText('tools')).toBeInTheDocument();
    expect(within(row).getByText('reasoning · hybrid')).toBeInTheDocument();
    expect(within(row).queryByText('vision')).not.toBeInTheDocument();
    expect(within(row).getByText('T0 Sovereign')).toBeInTheDocument();
    const embedRow = within(table).getByText('local/bge-m3').closest('tr')!;
    expect(within(embedRow).getByText('Embedding')).toBeInTheDocument();
  });

  it('deletes through an in-app confirm dialog and keeps the slash in the path', async () => {
    let models = [qwen, embed];
    const calls = mockApi({
      'GET /api/v1/models': () => ({ body: models }),
      'DELETE /api/v1/models/local/qwen3-8b': () => {
        models = models.filter((m) => m.id !== qwen.id);
        return { status: 204 };
      },
    });
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    renderWithClient(<CataloguePanel />);

    await user.click(await screen.findByRole('button', { name: 'Delete local/qwen3-8b' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete model?' });
    expect(dialog).toHaveTextContent('local/qwen3-8b');
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: 'Delete model' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Delete local/qwen3-8b' }),
      ).not.toBeInTheDocument(),
    );
    const del = calls.find((c) => c.method === 'DELETE');
    expect(del?.path).toBe('/api/v1/models/local/qwen3-8b');
    expect(del?.path).not.toContain('%2F');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the dialog open and shows the 409 when a route still uses the model', async () => {
    mockApi({
      'GET /api/v1/models': () => ({ body: [qwen] }),
      'DELETE /api/v1/models/local/qwen3-8b': () => ({
        status: 409,
        body: { error: { message: 'route "default" still uses local/qwen3-8b', type: 'conflict' } },
      }),
    });
    const user = userEvent.setup();
    renderWithClient(<CataloguePanel />);
    await user.click(await screen.findByRole('button', { name: 'Delete local/qwen3-8b' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete model?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete model' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/still uses/);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
