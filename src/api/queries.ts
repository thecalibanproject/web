import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, slashPreservingPath, unwrap } from './client';
import type {
  DatasourceCreate,
  ModelCreate,
  NodeCreate,
  ProviderKeyCreate,
  ReviewDecision,
  SharedProviderCreate,
  TenantCreate,
} from './types';

/** Model-server health is re-probed this often while a row is on screen. */
export const PROVIDER_HEALTH_INTERVAL_MS = 15_000;

/** Query keys in one place so mutations can invalidate precisely. */
export const qk = {
  health: ['health'] as const,
  tenants: ['tenants'] as const,
  tenant: (id: string) => ['tenants', id] as const,
  apiKeys: (tenantId: string) => ['tenants', tenantId, 'api-keys'] as const,
  providerKeys: (tenantId: string) => ['tenants', tenantId, 'provider-keys'] as const,
  models: ['models'] as const,
  providers: ['providers'] as const,
  providerHealth: (providerId: string) => ['providers', providerId, 'health'] as const,
  discovery: (providerId: string) => ['providers', providerId, 'discover'] as const,
  datasources: (tenantId?: string) => ['datasources', tenantId ?? 'all'] as const,
  ontology: (tenantId: string) => ['ontology', tenantId] as const,
  nodes: (tenantId?: string) => ['nodes', tenantId ?? 'all'] as const,
  usage: (tenantId: string | undefined, limit: number) =>
    ['usage', tenantId ?? 'all', limit] as const,
};

// ───────────── Queries ─────────────

export const healthQuery = () =>
  queryOptions({
    queryKey: qk.health,
    queryFn: () => unwrap(api.GET('/api/v1/health')),
    refetchInterval: 30_000,
  });

export const tenantsQuery = () =>
  queryOptions({ queryKey: qk.tenants, queryFn: () => unwrap(api.GET('/api/v1/tenants')) });

export const tenantQuery = (tenantId: string) =>
  queryOptions({
    queryKey: qk.tenant(tenantId),
    queryFn: () =>
      unwrap(api.GET('/api/v1/tenants/{tenantId}', { params: { path: { tenantId } } })),
  });

export const apiKeysQuery = (tenantId: string) =>
  queryOptions({
    queryKey: qk.apiKeys(tenantId),
    queryFn: () =>
      unwrap(api.GET('/api/v1/tenants/{tenantId}/api-keys', { params: { path: { tenantId } } })),
  });

export const providerKeysQuery = (tenantId: string) =>
  queryOptions({
    queryKey: qk.providerKeys(tenantId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/tenants/{tenantId}/provider-keys', { params: { path: { tenantId } } }),
      ),
  });

export const modelsQuery = () =>
  queryOptions({ queryKey: qk.models, queryFn: () => unwrap(api.GET('/api/v1/models')) });

export const providersQuery = () =>
  queryOptions({ queryKey: qk.providers, queryFn: () => unwrap(api.GET('/api/v1/providers')) });

export const providerHealthQuery = (providerId: string) =>
  queryOptions({
    queryKey: qk.providerHealth(providerId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/providers/{providerId}/health', { params: { path: { providerId } } }),
      ),
    refetchInterval: PROVIDER_HEALTH_INTERVAL_MS,
    // Keep showing the last probe while the next one is in flight.
    staleTime: PROVIDER_HEALTH_INTERVAL_MS,
  });

/**
 * Discovery is a POST because it probes the server, but it has no side effects
 * on the catalogue, so it is modelled as a query that is never cached.
 */
export const discoveryQuery = (providerId: string) =>
  queryOptions({
    queryKey: qk.discovery(providerId),
    queryFn: () =>
      unwrap(
        api.POST('/api/v1/providers/{providerId}/discover', { params: { path: { providerId } } }),
      ),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

export const datasourcesQuery = (tenantId?: string) =>
  queryOptions({
    queryKey: qk.datasources(tenantId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/datasources', {
          params: { query: tenantId ? { tenant_id: tenantId } : {} },
        }),
      ),
  });

export const ontologyQuery = (tenantId: string) =>
  queryOptions({
    queryKey: qk.ontology(tenantId),
    queryFn: () =>
      unwrap(api.GET('/api/v1/ontology', { params: { query: { tenant_id: tenantId } } })),
  });

export const nodesQuery = (tenantId?: string) =>
  queryOptions({
    queryKey: qk.nodes(tenantId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/nodes', { params: { query: tenantId ? { tenant_id: tenantId } : {} } }),
      ),
  });

export const usageQuery = (tenantId: string | undefined, limit = 100) =>
  queryOptions({
    queryKey: qk.usage(tenantId, limit),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/usage', {
          params: { query: { limit, ...(tenantId ? { tenant_id: tenantId } : {}) } },
        }),
      ),
  });

// ───────────── Mutations ─────────────

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TenantCreate) => unwrap(api.POST('/api/v1/tenants', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tenants }),
  });
}

export function useMintApiKey(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/api-keys', {
          params: { path: { tenantId } },
          body: name ? { name } : {},
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.apiKeys(tenantId) }),
  });
}

export function useCreateProviderKey(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProviderKeyCreate) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/provider-keys', {
          params: { path: { tenantId } },
          body,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.providerKeys(tenantId) }),
  });
}

export function useDeleteProviderKey(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) =>
      unwrap(
        api.DELETE('/api/v1/tenants/{tenantId}/provider-keys/{keyId}', {
          params: { path: { tenantId, keyId } },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.providerKeys(tenantId) }),
  });
}

/** Plain call (not a hook) so the discovery flow can post rows one by one. */
export function createModel(body: ModelCreate) {
  return unwrap(api.POST('/api/v1/models', { body }));
}

export function useCreateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createModel,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.models }),
  });
}

export function useDeleteModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (modelId: string) =>
      unwrap(
        api.DELETE('/api/v1/models/{modelId}', {
          params: { path: { modelId } },
          // Model ids contain '/' (local/qwen3-8b) and must reach the server unescaped.
          pathSerializer: slashPreservingPath,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.models }),
  });
}

export function useCreateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SharedProviderCreate) => unwrap(api.POST('/api/v1/providers', { body })),
    // `exact` so existing rows' health probes are not re-fired.
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.providers, exact: true }),
  });
}

export function useDeleteProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (providerId: string) =>
      unwrap(api.DELETE('/api/v1/providers/{providerId}', { params: { path: { providerId } } })),
    onSuccess: (_data, providerId) => {
      qc.removeQueries({ queryKey: qk.providerHealth(providerId) });
      return qc.invalidateQueries({ queryKey: qk.providers, exact: true });
    },
  });
}

export function useCreateDatasource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DatasourceCreate) => unwrap(api.POST('/api/v1/datasources', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['datasources'] }),
  });
}

export function useIntrospectDatasource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datasourceId: string) =>
      unwrap(
        api.POST('/api/v1/datasources/{datasourceId}/introspect', {
          params: { path: { datasourceId } },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['datasources'] }),
  });
}

export function useReviewElement(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { elementId: string; decision: ReviewDecision; note?: string }) =>
      unwrap(
        api.POST('/api/v1/ontology/elements/{elementId}/review', {
          params: { path: { elementId: args.elementId } },
          body: { decision: args.decision, ...(args.note ? { note: args.note } : {}) },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ontology(tenantId) }),
  });
}

export function useCreateNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NodeCreate) => unwrap(api.POST('/api/v1/nodes', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nodes'] }),
  });
}
