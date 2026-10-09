import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

export function renderWithClient(ui: ReactElement, options?: RenderOptions) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>, options),
  };
}

export interface RecordedCall {
  method: string;
  path: string;
  headers: Headers;
  body: unknown;
}

type Handler = (call: RecordedCall) => { status?: number; body?: unknown } | undefined;

/**
 * Stubs global fetch. `routes` maps "METHOD /path" to a handler; unmatched
 * calls return 404 with the contract's error envelope. Returns the call log.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      const url = new URL(input.url);
      const text = await input.text();
      const call: RecordedCall = {
        method: input.method,
        path: url.pathname,
        headers: input.headers,
        body: text ? (JSON.parse(text) as unknown) : undefined,
      };
      calls.push(call);
      const handler = routes[`${call.method} ${call.path}`];
      const res = handler?.(call) ?? {
        status: 404,
        body: { error: { message: `no mock for ${call.method} ${call.path}`, type: 'not_found' } },
      };
      const status = res.status ?? 200;
      return new Response(status === 204 ? null : JSON.stringify(res.body ?? null), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}
