import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi, renderHookWithClient } from '@/test/utils';
import { ApiError } from './client';
import {
  qk,
  useDeleteDatasource,
  useDeleteNode,
  useDeleteTenant,
  useRevokeApiKey,
  useUpdateTenant,
} from './queries';

const notFound = {
  status: 404,
  body: { error: { message: 'api key not found', type: 'not_found' } },
};

describe('useRevokeApiKey', () => {
  it('DELETEs the key and invalidates both API key lists', async () => {
    const calls = mockApi({ 'DELETE /api/v1/tenants/t1/api-keys/k1': () => ({ status: 204 }) });
    const { result, queryClient } = renderHookWithClient(() => useRevokeApiKey('t1'));
    queryClient.setQueryData(qk.apiKeyList('t1', false), []);
    queryClient.setQueryData(qk.apiKeyList('t1', true), []);
    queryClient.setQueryData(qk.apiKeyList('t2', false), []);

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync('k1');
    });

    expect(outcome).toBe('deleted');
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'DELETE /api/v1/tenants/t1/api-keys/k1',
    ]);
    expect(queryClient.getQueryState(qk.apiKeyList('t1', false))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(qk.apiKeyList('t1', true))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(qk.apiKeyList('t2', false))?.isInvalidated).toBe(false);
  });

  it('treats a 404 as already gone and still refreshes', async () => {
    mockApi({ 'DELETE /api/v1/tenants/t1/api-keys/k1': () => notFound });
    const { result, queryClient } = renderHookWithClient(() => useRevokeApiKey('t1'));
    queryClient.setQueryData(qk.apiKeyList('t1', false), []);

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync('k1');
    });

    expect(outcome).toBe('already-gone');
    expect(result.current.isError).toBe(false);
    expect(queryClient.getQueryState(qk.apiKeyList('t1', false))?.isInvalidated).toBe(true);
  });

  it('surfaces other errors from the envelope', async () => {
    mockApi({
      'DELETE /api/v1/tenants/t1/api-keys/k1': () => ({
        status: 500,
        body: { error: { message: 'database unavailable', type: 'server_error' } },
      }),
    });
    const { result } = renderHookWithClient(() => useRevokeApiKey('t1'));
    act(() => result.current.mutate('k1'));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.message).toBe('database unavailable');
  });
});

describe('useDeleteTenant', () => {
  it("drops the tenant's own queries and invalidates the lists the cascade touched", async () => {
    const calls = mockApi({ 'DELETE /api/v1/tenants/t1': () => ({ status: 204 }) });
    const { result, queryClient } = renderHookWithClient(() => useDeleteTenant());
    queryClient.setQueryData(qk.tenant('t1'), { id: 't1' });
    queryClient.setQueryData(qk.apiKeyList('t1', false), []);
    queryClient.setQueryData(qk.providerKeys('t1'), []);
    queryClient.setQueryData(qk.ontology('t1'), { elements: [] });
    queryClient.setQueryData(qk.tenant('t2'), { id: 't2' });
    queryClient.setQueryData(qk.tenantList(false), []);
    queryClient.setQueryData(qk.tenantList(true), []);
    queryClient.setQueryData(qk.datasources(), []);
    queryClient.setQueryData(qk.nodes('t1'), []);

    await act(async () => {
      await result.current.mutateAsync('t1');
    });

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['DELETE /api/v1/tenants/t1']);
    expect(queryClient.getQueryState(qk.tenant('t1'))).toBeUndefined();
    expect(queryClient.getQueryState(qk.apiKeyList('t1', false))).toBeUndefined();
    expect(queryClient.getQueryState(qk.providerKeys('t1'))).toBeUndefined();
    expect(queryClient.getQueryState(qk.ontology('t1'))).toBeUndefined();
    expect(queryClient.getQueryState(qk.tenantList(false))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(qk.tenantList(true))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(qk.datasources())?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(qk.nodes('t1'))?.isInvalidated).toBe(true);
    // Other tenants are untouched.
    expect(queryClient.getQueryState(qk.tenant('t2'))?.isInvalidated).toBe(false);
  });

  it('resolves a 404 (already deleted) as already gone', async () => {
    mockApi({ 'DELETE /api/v1/tenants/t1': () => notFound });
    const { result } = renderHookWithClient(() => useDeleteTenant());
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync('t1');
    });
    expect(outcome).toBe('already-gone');
  });
});

describe('useDeleteDatasource and useDeleteNode', () => {
  it('use the tenant-scoped paths and invalidate their lists', async () => {
    const calls = mockApi({
      'DELETE /api/v1/tenants/t1/datasources/ds1': () => ({ status: 204 }),
      'DELETE /api/v1/tenants/t1/nodes/n1': () => notFound,
    });
    const ds = renderHookWithClient(() => useDeleteDatasource());
    ds.queryClient.setQueryData(qk.datasources('t1'), []);
    const node = renderHookWithClient(() => useDeleteNode());
    node.queryClient.setQueryData(qk.nodes(), []);

    let dsOutcome: string | undefined;
    let nodeOutcome: string | undefined;
    await act(async () => {
      dsOutcome = await ds.result.current.mutateAsync({ tenantId: 't1', datasourceId: 'ds1' });
      nodeOutcome = await node.result.current.mutateAsync({ tenantId: 't1', nodeId: 'n1' });
    });

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'DELETE /api/v1/tenants/t1/datasources/ds1',
      'DELETE /api/v1/tenants/t1/nodes/n1',
    ]);
    expect(dsOutcome).toBe('deleted');
    expect(nodeOutcome).toBe('already-gone');
    expect(ds.queryClient.getQueryState(qk.datasources('t1'))?.isInvalidated).toBe(true);
    expect(node.queryClient.getQueryState(qk.nodes())?.isInvalidated).toBe(true);
  });
});

describe('useUpdateTenant', () => {
  const updated = {
    id: 't1',
    name: 'Acme',
    created_at: '2026-10-01T10:00:00Z',
    pii_default: 'reversible',
    pii_surrogate_scope: 'session',
    semantic_cache: 'on',
  };

  it('PATCHes only the given fields, seeds the detail and refreshes the lists', async () => {
    const calls = mockApi({ 'PATCH /api/v1/tenants/t1': () => ({ body: updated }) });
    const { result, queryClient } = renderHookWithClient(() => useUpdateTenant('t1'));
    queryClient.setQueryData(qk.tenant('t1'), { ...updated, semantic_cache: 'off' });
    queryClient.setQueryData(qk.tenantList(false), []);
    queryClient.setQueryData(qk.tenantList(true), []);
    queryClient.setQueryData(qk.apiKeyList('t1', false), []);
    queryClient.setQueryData(qk.tenant('t2'), { id: 't2' });

    await act(async () => {
      await result.current.mutateAsync({ pii_surrogate_scope: 'session', semantic_cache: 'on' });
    });

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['PATCH /api/v1/tenants/t1']);
    expect(calls[0]?.body).toEqual({ pii_surrogate_scope: 'session', semantic_cache: 'on' });
    expect(queryClient.getQueryData(qk.tenant('t1'))).toEqual(updated);
    expect(queryClient.getQueryState(qk.tenantList(false))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(qk.tenantList(true))?.isInvalidated).toBe(true);
    // Keys and other tenants are not refetched for a settings change.
    expect(queryClient.getQueryState(qk.apiKeyList('t1', false))?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(qk.tenant('t2'))?.isInvalidated).toBe(false);
  });

  it('cancels a detail fetch in flight so its stale answer cannot overwrite the saved tenant', async () => {
    mockApi({ 'PATCH /api/v1/tenants/t1': () => ({ body: updated }) });
    const { result, queryClient } = renderHookWithClient(() => useUpdateTenant('t1'));
    const stale = { ...updated, semantic_cache: 'off' };
    queryClient.setQueryData(qk.tenant('t1'), stale);
    let answer!: (t: typeof stale) => void;
    const inFlight = queryClient
      .fetchQuery({
        queryKey: qk.tenant('t1'),
        queryFn: () => new Promise<typeof stale>((resolve) => (answer = resolve)),
        staleTime: 0,
      })
      .catch(() => undefined);

    await act(async () => {
      await result.current.mutateAsync({ semantic_cache: 'on' });
    });
    answer(stale);
    await inFlight;

    expect(queryClient.getQueryData(qk.tenant('t1'))).toEqual(updated);
  });

  it('surfaces errors from the envelope and leaves the cached tenant alone', async () => {
    mockApi({
      'PATCH /api/v1/tenants/t1': () => ({
        status: 422,
        body: { error: { message: 'unknown field: region', type: 'invalid_request' } },
      }),
    });
    const { result, queryClient } = renderHookWithClient(() => useUpdateTenant('t1'));
    const before = { ...updated, semantic_cache: 'off' };
    queryClient.setQueryData(qk.tenant('t1'), before);
    act(() => result.current.mutate({ semantic_cache: 'on' }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.message).toBe('unknown field: region');
    expect(queryClient.getQueryData(qk.tenant('t1'))).toEqual(before);
  });
});
