import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, renderHook, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';
import { setToken } from '@/lib/auth';
import { createAppRouter } from '@/router';

function testQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

export function renderWithClient(ui: ReactElement, options?: RenderOptions) {
  const queryClient = testQueryClient();
  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>, options),
  };
}

/** Renders a hook (e.g. a mutation from api/queries) inside a fresh QueryClient. */
export function renderHookWithClient<T>(hook: () => T, queryClient = testQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...renderHook(hook, { wrapper }) };
}

/**
 * Renders the whole console (router, app shell, lazy pages) signed in, at
 * `path`, with in-memory history. Use for page-level flows such as navigation.
 *
 * Pages are code-split, and the first import of a page (and of what it pulls
 * in, such as ajv for Nodes) is transformed on demand by Vite. Left to the
 * first render, that import runs inside the test's first `findBy*` window and
 * on a busy machine (CI, parallel workers) takes longer than the window, so
 * the test fails before the page has even mounted. Every route chunk is
 * loaded here first, so a test's waits only ever cover data and rendering,
 * including after it navigates to another page.
 */
export async function renderApp(path: string) {
  setToken('test-admin-token');
  // The router's scroll restoration calls scrollTo, which jsdom does not implement.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const queryClient = testQueryClient();
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
  await Promise.all(
    Object.values(router.routesById).flatMap((r) => router.loadRouteChunk(r) ?? []),
  );
  // Resolve the initial match too, so the page (and its queries) mounts in
  // the first render instead of after the router's own async load.
  await router.load();
  return {
    router,
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

export interface RecordedCall {
  method: string;
  path: string;
  /** Query string; routes match on `path` alone. */
  query: URLSearchParams;
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
        query: url.searchParams,
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
