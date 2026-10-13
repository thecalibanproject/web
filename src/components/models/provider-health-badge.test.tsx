import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROVIDER_HEALTH_INTERVAL_MS, providerHealthQuery } from '@/api/queries';
import { mockApi, renderWithClient } from '@/test/utils';
import { ProviderHealthBadge } from './provider-health-badge';

const route = 'GET /api/v1/providers/qwen3-30b/health';

describe('ProviderHealthBadge', () => {
  afterEach(() => vi.useRealTimers());

  it('shows "checking" while the first probe is in flight', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    renderWithClient(<ProviderHealthBadge providerId="qwen3-30b" />);
    expect(screen.getByText('Checking…')).toBeInTheDocument();
  });

  it('shows healthy with latency and model count', async () => {
    mockApi({ [route]: () => ({ body: { status: 'ok', latency_ms: 23, models: 3 } }) });
    renderWithClient(<ProviderHealthBadge providerId="qwen3-30b" />);
    expect(await screen.findByText('Healthy · 23 ms · 3 models')).toBeInTheDocument();
  });

  it('shows unreachable with the probe error', async () => {
    mockApi({
      [route]: () => ({ body: { status: 'unreachable', error: 'connect ECONNREFUSED' } }),
    });
    renderWithClient(<ProviderHealthBadge providerId="qwen3-30b" />);
    const badge = await screen.findByText('Unreachable');
    expect(badge).toHaveAttribute('title', 'Unreachable: connect ECONNREFUSED');
    expect(badge).toHaveTextContent('connect ECONNREFUSED');
  });

  it('shows unknown when the health endpoint itself fails', async () => {
    mockApi({
      [route]: () => ({
        status: 500,
        body: { error: { message: 'control plane error', type: 'server_error' } },
      }),
    });
    renderWithClient(<ProviderHealthBadge providerId="qwen3-30b" />);
    const badge = await screen.findByText('unknown');
    expect(badge).toHaveAttribute('title', 'Health probe failed: control plane error');
  });

  it('re-probes every 15 seconds', async () => {
    expect(providerHealthQuery('x').refetchInterval).toBe(15_000);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let status: 'ok' | 'unreachable' = 'ok';
    const calls = mockApi({ [route]: () => ({ body: { status } }) });
    renderWithClient(<ProviderHealthBadge providerId="qwen3-30b" />);
    expect(await screen.findByText('Healthy')).toBeInTheDocument();

    status = 'unreachable';
    await vi.advanceTimersByTimeAsync(PROVIDER_HEALTH_INTERVAL_MS);
    expect(await screen.findByText('Unreachable')).toBeInTheDocument();
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});
