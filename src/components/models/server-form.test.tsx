import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, renderWithClient } from '@/test/utils';
import { ServerForm } from './server-form';

const created = {
  id: 'qwen3-30b',
  kind: 'openai_compatible',
  base_url: 'http://qwen3-30b:8000/v1',
  trust_tier: 't0_sovereign',
  cache_salt: true,
  has_api_key: true,
  tenants: ['acme', 'globex'],
};

describe('ServerForm (shared model server)', () => {
  it('has on-prem defaults and blocks submit until id and base URL are valid', async () => {
    const calls = mockApi({ 'POST /api/v1/providers': () => ({ status: 201, body: created }) });
    const onDone = vi.fn();
    const user = userEvent.setup();
    renderWithClient(<ServerForm onDone={onDone} />);

    expect(screen.getByLabelText(/^Kind/)).toHaveValue('openai_compatible');
    expect(screen.getByLabelText(/^Where it runs/)).toHaveValue('t0_sovereign');
    expect(screen.getByLabelText(/^Base URL/)).toHaveAttribute(
      'placeholder',
      'http://qwen3-30b:8000/v1',
    );
    // Expert settings sit under Advanced, with safe defaults.
    expect(screen.getByText('Advanced').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByRole('checkbox', { name: 'Cache salt' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Cache salt' })).toHaveAccessibleDescription(
      'Isolates the vLLM prefix cache per workspace.',
    );
    expect(screen.getByLabelText(/^API key/)).toHaveAttribute('type', 'password');

    // Empty submit: both required fields flagged, nothing sent.
    await user.click(screen.getByRole('button', { name: 'Add server' }));
    expect(screen.getByLabelText(/^Server ID/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter an id, for example qwen3-30b.')).toBeInTheDocument();
    expect(screen.getByText('Enter the server’s OpenAI-compatible base URL.')).toBeInTheDocument();

    // Invalid values.
    await user.type(screen.getByLabelText(/^Server ID/), 'Qwen 30B');
    await user.type(screen.getByLabelText(/^Base URL/), 'qwen3-30b:8000');
    await user.click(screen.getByRole('button', { name: 'Add server' }));
    expect(
      screen.getByText('Use lowercase letters, digits, hyphens and underscores.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter a full http:// or https:// URL.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    // Fix them; editing clears the field's error.
    await user.clear(screen.getByLabelText(/^Server ID/));
    await user.type(screen.getByLabelText(/^Server ID/), 'qwen3-30b');
    expect(screen.getByLabelText(/^Server ID/)).not.toHaveAttribute('aria-invalid', 'true');
    await user.clear(screen.getByLabelText(/^Base URL/));
    await user.type(screen.getByLabelText(/^Base URL/), 'http://qwen3-30b:8000/v1/');
    await user.click(screen.getByText('Advanced'));
    await user.click(screen.getByRole('checkbox', { name: 'Cache salt' }));
    await user.type(screen.getByLabelText(/^API key/), 'sk-vllm-secret');
    await user.type(screen.getByLabelText(/^Only these workspaces/), 'acme, globex acme');
    await user.click(screen.getByRole('button', { name: 'Add server' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls[0]?.body).toEqual({
      id: 'qwen3-30b',
      kind: 'openai_compatible',
      base_url: 'http://qwen3-30b:8000/v1',
      trust_tier: 't0_sovereign',
      cache_salt: true,
      api_key: 'sk-vllm-secret',
      tenants: ['acme', 'globex'],
    });
  });

  it('omits the optional key and allow-list, and clears the key after an error', async () => {
    const calls = mockApi({
      'POST /api/v1/providers': () => ({
        status: 422,
        body: { error: { message: 'id already taken', type: 'invalid_request_error' } },
      }),
    });
    const user = userEvent.setup();
    renderWithClient(<ServerForm onDone={() => {}} />);
    await user.type(screen.getByLabelText(/^Server ID/), 'llama');
    await user.type(screen.getByLabelText(/^Base URL/), 'http://llama:8080/v1');
    await user.click(screen.getByRole('button', { name: 'Add server' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('id already taken');
    expect(calls[0]?.body).toEqual({
      id: 'llama',
      kind: 'openai_compatible',
      base_url: 'http://llama:8080/v1',
      trust_tier: 't0_sovereign',
      cache_salt: false,
    });

    await user.type(screen.getByLabelText(/^API key/), 'k');
    await user.click(screen.getByRole('button', { name: 'Add server' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    await waitFor(() => expect(screen.getByLabelText(/^API key/)).toHaveValue(''));
  });
});
