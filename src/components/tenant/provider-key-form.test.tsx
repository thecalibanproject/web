import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, renderWithClient } from '@/test/utils';
import { ProviderKeyForm } from './provider-keys-panel';

const created = {
  id: 'pk1',
  tenant_id: 't1',
  kind: 'openai_compatible',
  label: 'dc1-vllm',
  trust_tier: 't0_sovereign',
  base_url: 'http://vllm.internal:8000/v1',
  last4: null,
  created_at: '2026-10-02T10:00:00Z',
};

describe('ProviderKeyForm (BYOK)', () => {
  it('defaults to a keyless local OpenAI-compatible endpoint at T0', async () => {
    const calls = mockApi({
      'POST /api/v1/tenants/t1/provider-keys': () => ({ status: 201, body: created }),
    });
    const onDone = vi.fn();
    const user = userEvent.setup();
    renderWithClient(<ProviderKeyForm tenantId="t1" onDone={onDone} />);

    expect(screen.getByLabelText(/^Provider\*?$/)).toHaveValue('openai_compatible');
    expect(screen.getByLabelText(/^Trust tier/)).toHaveValue('t0_sovereign');
    const secret = screen.getByLabelText(/^API key/);
    expect(secret).toHaveAttribute('type', 'password');
    expect(secret).not.toBeRequired();

    await user.type(screen.getByLabelText(/^Label/), 'dc1-vllm');
    await user.type(screen.getByLabelText(/^Base URL/), 'http://vllm.internal:8000/v1');
    await user.click(screen.getByRole('button', { name: /add provider key/i }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls[0]?.body).toEqual({
      kind: 'openai_compatible',
      label: 'dc1-vllm',
      trust_tier: 't0_sovereign',
      base_url: 'http://vllm.internal:8000/v1',
    });
  });

  it('requires a key and hides base URL for hosted OpenAI, and clears the secret after submit', async () => {
    const calls = mockApi({
      'POST /api/v1/tenants/t1/provider-keys': () => ({
        status: 400,
        body: { error: { message: 'key rejected by provider', type: 'invalid_request_error' } },
      }),
    });
    const user = userEvent.setup();
    renderWithClient(<ProviderKeyForm tenantId="t1" onDone={() => {}} />);

    await user.selectOptions(screen.getByLabelText(/^Provider\*?$/), 'openai');
    expect(screen.queryByLabelText(/^Base URL/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Trust tier/)).toHaveValue('t2_contracted');
    expect(screen.getByLabelText(/^API key/)).toBeRequired();

    await user.type(screen.getByLabelText(/^Label/), 'prod-openai');
    await user.type(screen.getByLabelText(/^API key/), 'sk-live-123');
    await user.click(screen.getByRole('button', { name: /add provider key/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('key rejected by provider');
    expect(calls[0]?.body).toMatchObject({ kind: 'openai', api_key: 'sk-live-123' });
    expect(screen.getByLabelText(/^API key/)).toHaveValue('');
  });
});
