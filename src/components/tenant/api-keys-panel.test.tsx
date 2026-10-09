import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ApiKeyCreated, ApiKeyInfo } from '@/api/types';
import { mockApi, renderWithClient } from '@/test/utils';
import { ApiKeysPanel } from './api-keys-panel';

describe('ApiKeysPanel', () => {
  it('mints a key and reveals the plaintext exactly once', async () => {
    const stored: ApiKeyInfo[] = [];
    const calls = mockApi({
      'GET /api/v1/tenants/t1/api-keys': () => ({ body: stored }),
      'POST /api/v1/tenants/t1/api-keys': (c) => {
        const info: ApiKeyInfo = {
          id: 'k1',
          name: (c.body as { name: string }).name,
          prefix: 'cal_abcd',
          created_at: '2026-10-02T10:00:00Z',
        };
        stored.push(info);
        const created: ApiKeyCreated = { ...info, key: 'cal_abcd_SUPERSECRET' };
        return { status: 201, body: created };
      },
    });
    const user = userEvent.setup();
    renderWithClient(<ApiKeysPanel tenantId="t1" />);

    expect(await screen.findByText('No API keys')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Key name'), 'billing-prod');
    await user.click(screen.getByRole('button', { name: /mint key/i }));

    const notice = await screen.findByRole('region', { name: 'New API key' });
    expect(within(notice).getByTestId('plaintext-key')).toHaveTextContent('cal_abcd_SUPERSECRET');
    expect(within(notice).getByRole('button', { name: /copy key/i })).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ name: 'billing-prod' });

    // The list refetches and shows metadata only.
    const table = await screen.findByRole('table', { name: 'API keys' });
    expect(within(table).getByText('billing-prod')).toBeInTheDocument();
    expect(within(table).queryByText(/SUPERSECRET/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /stored it/i }));
    await waitFor(() => expect(screen.queryByText(/SUPERSECRET/)).not.toBeInTheDocument());
  });

  it('shows an error state with retry when the list fails', async () => {
    mockApi({
      'GET /api/v1/tenants/t1/api-keys': () => ({
        status: 500,
        body: { error: { message: 'database unavailable', type: 'server_error' } },
      }),
    });
    renderWithClient(<ApiKeysPanel tenantId="t1" />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('database unavailable');
    expect(within(alert).getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
