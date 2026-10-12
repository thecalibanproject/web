import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { isEvalActive } from '@/lib/evals';
import { isDocumentActive } from '@/lib/rag';
import {
  isRunActive,
  sinceIso,
  statusParam,
  type RunSince,
  type RunStatusFilter,
} from '@/lib/runs';
import { api, ApiError, slashPreservingPath, unwrap } from './client';
import type {
  ApiKeyCreate,
  DatasourceCreate,
  EvalPolicy,
  EvalStart,
  GoldenCase,
  ModelCreate,
  Node,
  OntologyElement,
  ProviderKeyCreate,
  RagCollectionCreate,
  RagDocumentIngest,
  RagDocumentStatus,
  RoleBindingCreate,
  ReviewDecision,
  SharedProviderCreate,
  TenantCreate,
  TenantUpdate,
  ToolImport,
  ToolServerCreate,
} from './types';

/** Model-server health is re-probed this often while a row is on screen. */
export const PROVIDER_HEALTH_INTERVAL_MS = 15_000;

/** Query keys in one place so mutations can invalidate precisely. */
export const qk = {
  health: ['health'] as const,
  /** Prefix of every tenant query: lists, details and per-tenant keys. */
  tenants: ['tenants'] as const,
  // An object segment cannot collide with a tenant id in `tenant(id)`.
  tenantList: (includeDeleted: boolean) => ['tenants', { includeDeleted }] as const,
  tenant: (id: string) => ['tenants', id] as const,
  /** Prefix of both API key lists (with and without revoked keys). */
  apiKeys: (tenantId: string) => ['tenants', tenantId, 'api-keys'] as const,
  apiKeyList: (tenantId: string, includeRevoked: boolean) =>
    ['tenants', tenantId, 'api-keys', { includeRevoked }] as const,
  providerKeys: (tenantId: string) => ['tenants', tenantId, 'provider-keys'] as const,
  intents: (tenantId: string) => ['tenants', tenantId, 'intents'] as const,
  models: ['models'] as const,
  providers: ['providers'] as const,
  providerHealth: (providerId: string) => ['providers', providerId, 'health'] as const,
  discovery: (providerId: string) => ['providers', providerId, 'discover'] as const,
  datasources: (tenantId?: string) => ['datasources', tenantId ?? 'all'] as const,
  /** Under the datasources prefix, so a datasource change refreshes it too. */
  introspection: (datasourceId: string) => ['datasources', 'introspection', datasourceId] as const,
  ontology: (tenantId: string) => ['ontology', tenantId] as const,
  /** Prefix of every node query: lists, versions and diffs. */
  nodesAll: ['nodes'] as const,
  nodes: (tenantId?: string) => ['nodes', tenantId ?? 'all'] as const,
  // An object segment cannot collide with a tenant id in `nodes(tenantId)`.
  nodeVersions: (tenantId: string, name: string) =>
    ['nodes', { tenantId, name }, 'versions'] as const,
  nodeDiff: (tenantId: string, name: string, from: number, to: number) =>
    ['nodes', { tenantId, name }, 'diff', from, to] as const,
  toolServers: (tenantId: string) => ['tool-servers', tenantId] as const,
  toolManifests: (tenantId: string, server: string) =>
    ['tool-servers', tenantId, server, 'tools'] as const,
  /** Prefix of every retrieval query of a tenant: collections and their documents. */
  rag: (tenantId: string) => ['rag', tenantId] as const,
  ragCollections: (tenantId: string) => ['rag', tenantId, 'collections'] as const,
  ragCollection: (tenantId: string, collection: string) =>
    ['rag', tenantId, 'collection', collection] as const,
  /** Prefix of a collection's document lists (every status filter). */
  ragDocuments: (tenantId: string, collection: string) =>
    ['rag', tenantId, 'collection', collection, 'documents'] as const,
  ragDocumentList: (tenantId: string, collection: string, status: RagDocumentStatus | undefined) =>
    ['rag', tenantId, 'collection', collection, 'documents', { status }] as const,
  ragDocument: (tenantId: string, collection: string, docId: string) =>
    ['rag', tenantId, 'collection', collection, 'document', docId] as const,
  usage: (tenantId: string | undefined, limit: number, filter: UsageFilter = {}) =>
    ['usage', tenantId ?? 'all', limit, filter] as const,
  audit: (limit: number) => ['audit', limit] as const,
  /** Prefix of the sign-in state; dropped on sign-out. */
  auth: ['auth'] as const,
  authState: ['auth', 'state'] as const,
  roleBindings: ['role-bindings'] as const,
  users: ['users'] as const,
  /** Prefix of every run query of a tenant: lists, details and the inbox. */
  runs: (tenantId: string) => ['runs', tenantId] as const,
  runList: (tenantId: string, filter: RunFilter) => ['runs', tenantId, 'list', filter] as const,
  run: (tenantId: string, runId: string) => ['runs', tenantId, 'run', runId] as const,
  inbox: (tenantId: string) => ['runs', tenantId, 'inbox'] as const,
  /** Prefix of every eval query of a node: golden sets, the bar, the gate and evals. */
  nodeEvals: (tenantId: string, name: string) => ['evals', tenantId, name] as const,
  goldenSet: (tenantId: string, name: string, version: number) =>
    ['evals', tenantId, name, 'golden-set', version] as const,
  evalPolicy: (tenantId: string, name: string) => ['evals', tenantId, name, 'policy'] as const,
  gate: (tenantId: string, name: string, version: number) =>
    ['evals', tenantId, name, 'gate', version] as const,
  evalList: (tenantId: string, name: string, version: number) =>
    ['evals', tenantId, name, 'list', version] as const,
  eval: (tenantId: string, evalId: string) => ['eval', tenantId, evalId] as const,
  evalKey: (tenantId: string) => ['tenants', tenantId, 'eval-key'] as const,
};

// ───────────── Queries ─────────────

export const healthQuery = () =>
  queryOptions({
    queryKey: qk.health,
    queryFn: () => unwrap(api.GET('/api/v1/health')),
    refetchInterval: 30_000,
  });

/** Active tenants; `includeDeleted` adds tombstones (`status: 'deleted'`). */
export const tenantsQuery = (includeDeleted = false) =>
  queryOptions({
    queryKey: qk.tenantList(includeDeleted),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/tenants', {
          params: { query: includeDeleted ? { include_deleted: true } : {} },
        }),
      ),
  });

export const tenantQuery = (tenantId: string) =>
  queryOptions({
    queryKey: qk.tenant(tenantId),
    queryFn: () =>
      unwrap(api.GET('/api/v1/tenants/{tenantId}', { params: { path: { tenantId } } })),
  });

/** Active keys; `includeRevoked` adds revoked ones (with `revoked_at`). */
export const apiKeysQuery = (tenantId: string, includeRevoked = false) =>
  queryOptions({
    queryKey: qk.apiKeyList(tenantId, includeRevoked),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/tenants/{tenantId}/api-keys', {
          params: {
            path: { tenantId },
            query: includeRevoked ? { include_revoked: true } : {},
          },
        }),
      ),
  });

export const providerKeysQuery = (tenantId: string) =>
  queryOptions({
    queryKey: qk.providerKeys(tenantId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/tenants/{tenantId}/provider-keys', { params: { path: { tenantId } } }),
      ),
  });

/** The tenant's caliban/auto intents, their exemplars, where each comes from and its node. */
export const intentsQuery = (tenantId: string) =>
  queryOptions({
    queryKey: qk.intents(tenantId),
    queryFn: () =>
      unwrap(api.GET('/api/v1/tenants/{tenantId}/intents', { params: { path: { tenantId } } })),
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

/** How often a datasource being introspected, and its job, are re-read. */
export const INTROSPECTION_POLL_MS = 3_000;

export const datasourcesQuery = (tenantId?: string) =>
  queryOptions({
    queryKey: qk.datasources(tenantId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/datasources', {
          params: { query: tenantId ? { tenant_id: tenantId } : {} },
        }),
      ),
    refetchInterval: (q) =>
      q.state.data?.some((d) => d.status === 'introspecting') ? INTROSPECTION_POLL_MS : false,
  });

/**
 * The datasource's newest introspection job. Null when there is none here:
 * jobs are kept by the control plane replica that ran them (404 elsewhere).
 */
export const introspectionQuery = (datasourceId: string) =>
  queryOptions({
    queryKey: qk.introspection(datasourceId),
    queryFn: async () => {
      try {
        return await unwrap(
          api.GET('/api/v1/datasources/{datasourceId}/introspection', {
            params: { path: { datasourceId } },
          }),
        );
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    refetchInterval: (q) => (q.state.data?.status === 'running' ? INTROSPECTION_POLL_MS : false),
  });

export const ontologyQuery = (tenantId: string) =>
  queryOptions({
    queryKey: qk.ontology(tenantId),
    queryFn: () =>
      unwrap(api.GET('/api/v1/ontology', { params: { query: { tenant_id: tenantId } } })),
  });

/**
 * Every version of every node (the default `view=versions`; `view=summary`
 * answers with `NodeSummary` rows instead, which the console does not use).
 */
export const nodesQuery = (tenantId?: string) =>
  queryOptions({
    queryKey: qk.nodes(tenantId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/nodes', { params: { query: tenantId ? { tenant_id: tenantId } : {} } }),
      ) as Promise<Node[]>,
  });

/** Node call filters of the usage report. */
export interface UsageFilter {
  node?: string;
  runId?: string;
}

/**
 * Recent events and totals. `by_node` totals each node version over the same
 * tenant (and node or run) filter.
 */
/** Every version of one node (oldest first), the live one and who promoted it. */
export const nodeVersionsQuery = (tenantId: string, name: string) =>
  queryOptions({
    queryKey: qk.nodeVersions(tenantId, name),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/tenants/{tenantId}/nodes/{nodeName}/versions', {
          params: { path: { tenantId, nodeName: name } },
        }),
      ),
  });

/** What changed between two versions of a node (versions are immutable, so never stale). */
export const nodeDiffQuery = (tenantId: string, name: string, from: number, to: number) =>
  queryOptions({
    queryKey: qk.nodeDiff(tenantId, name, from, to),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/tenants/{tenantId}/nodes/{nodeName}/diff', {
          params: { path: { tenantId, nodeName: name }, query: { from, to } },
        }),
      ),
    staleTime: Infinity,
  });

/** The tenant's registered MCP tool servers (credentials are never returned). */
export const toolServersQuery = (tenantId: string) =>
  queryOptions({
    queryKey: qk.toolServers(tenantId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/tenants/{tenantId}/tool-servers', { params: { path: { tenantId } } }),
      ),
  });

/** Every manifest recorded for a server: pins, scan findings and approval state. */
export const toolManifestsQuery = (tenantId: string, server: string) =>
  queryOptions({
    queryKey: qk.toolManifests(tenantId, server),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/tenants/{tenantId}/tool-servers/{server}/tools', {
          params: { path: { tenantId, server } },
        }),
      ),
  });

/** Documents refresh this often while one of them waits for, or is being indexed by, a worker. */
export const RAG_POLL_MS = 5_000;

/** The tenant's document collections. */
export const ragCollectionsQuery = (tenantId: string) =>
  queryOptions({
    queryKey: qk.ragCollections(tenantId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/tenants/{tenantId}/rag/collections', { params: { path: { tenantId } } }),
      ),
  });

/** One collection, with the published node versions that search it (`used_by`). */
export const ragCollectionQuery = (tenantId: string, collection: string) =>
  queryOptions({
    queryKey: qk.ragCollection(tenantId, collection),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/tenants/{tenantId}/rag/collections/{collection}', {
          params: { path: { tenantId, collection } },
        }),
      ),
  });

/**
 * The newest version of each document of a collection, a page at a time
 * (`next_cursor`), never the content. Refreshed while a document on screen
 * waits for, or is being indexed by, a worker.
 */
export const ragDocumentsQuery = (
  tenantId: string,
  collection: string,
  status?: RagDocumentStatus,
) =>
  infiniteQueryOptions({
    queryKey: qk.ragDocumentList(tenantId, collection, status),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/tenants/{tenantId}/rag/collections/{collection}/documents', {
          params: {
            path: { tenantId, collection },
            query: {
              limit: 50,
              ...(status ? { status } : {}),
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    refetchInterval: (q) =>
      q.state.data?.pages.some((p) => p.documents.some((d) => isDocumentActive(d.status)))
        ? RAG_POLL_MS
        : false,
  });

/** Every version of a document, newest first: status, chunks, findings. Never the content. */
export const ragDocumentQuery = (tenantId: string, collection: string, docId: string) =>
  queryOptions({
    queryKey: qk.ragDocument(tenantId, collection, docId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/tenants/{tenantId}/rag/collections/{collection}/documents/{docId}', {
          params: { path: { tenantId, collection, docId } },
        }),
      ),
    refetchInterval: (q) =>
      q.state.data?.versions.some((v) => isDocumentActive(v.status)) ? RAG_POLL_MS : false,
  });

export const usageQuery = (tenantId: string | undefined, limit = 100, filter: UsageFilter = {}) =>
  queryOptions({
    queryKey: qk.usage(tenantId, limit, filter),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/usage', {
          params: {
            query: {
              limit,
              ...(tenantId ? { tenant_id: tenantId } : {}),
              ...(filter.node ? { node: filter.node } : {}),
              ...(filter.runId ? { run_id: filter.runId } : {}),
            },
          },
        }),
      ),
  });

/**
 * The newest `limit` audit rows (newest first) and whether the server could
 * verify their hash chain. Every mutation appends a row, so the log is always
 * refetched when the page mounts instead of being served from cache.
 */
export const auditQuery = (limit = 100) =>
  queryOptions({
    queryKey: qk.audit(limit),
    queryFn: () => unwrap(api.GET('/api/v1/audit', { params: { query: { limit } } })),
    staleTime: 0,
  });

/** Stored role bindings, plus the read-only group mappings from the config file. */
export const roleBindingsQuery = () =>
  queryOptions({
    queryKey: qk.roleBindings,
    queryFn: () => unwrap(api.GET('/api/v1/role-bindings')),
  });

/** Users known from the identity provider, with their bindings and active sessions. */
export const usersQuery = () =>
  queryOptions({ queryKey: qk.users, queryFn: () => unwrap(api.GET('/api/v1/users')) });

/** Server-side filters of the run list. */
export interface RunFilter {
  node?: string;
  version?: number;
  status?: RunStatusFilter;
  since?: RunSince;
}

/** Runs refresh this often while a run is on screen and has not ended. */
export const RUN_POLL_MS = 3_000;
/** The inbox refreshes this often. */
export const INBOX_POLL_MS = 15_000;

/**
 * The tenant's runs, newest first, a page at a time (`next_cursor`). Summaries
 * only: no content and no steps.
 */
export const runsQuery = (tenantId: string, filter: RunFilter = {}) =>
  infiniteQueryOptions({
    queryKey: qk.runList(tenantId, filter),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const status = statusParam(filter.status);
      return unwrap(
        api.GET('/api/v1/tenants/{tenantId}/runs', {
          params: {
            path: { tenantId },
            query: {
              limit: 50,
              ...(filter.node ? { node: filter.node } : {}),
              ...(filter.version ? { version: filter.version } : {}),
              ...(status ? { status } : {}),
              ...(filter.since ? { created_after: sinceIso(filter.since) } : {}),
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
      );
    },
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

/**
 * One run with its steps; its content (input, output, step outputs, the
 * awaited question) only for roles with `runs.data`. Polled until it ends.
 */
export const runQuery = (tenantId: string, runId: string) =>
  queryOptions({
    queryKey: qk.run(tenantId, runId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/tenants/{tenantId}/runs/{runId}', {
          params: { path: { tenantId, runId } },
        }),
      ),
    refetchInterval: (q) =>
      q.state.data && isRunActive(q.state.data.status) ? RUN_POLL_MS : false,
  });

/** Questions and approvals of tainted writes waiting for a human, oldest wait first. */
export const inboxQuery = (tenantId: string) =>
  queryOptions({
    queryKey: qk.inbox(tenantId),
    queryFn: () =>
      unwrap(api.GET('/api/v1/tenants/{tenantId}/inbox', { params: { path: { tenantId } } })),
    refetchInterval: INBOX_POLL_MS,
  });

/** Evals refresh this often while one of them has not ended. */
export const EVAL_POLL_MS = 5_000;

/**
 * A version's golden set; its cases (tenant content) only with `runs.data`.
 * Null when the version has none (404).
 */
export const goldenSetQuery = (tenantId: string, name: string, version: number) =>
  queryOptions({
    queryKey: qk.goldenSet(tenantId, name, version),
    queryFn: async () => {
      try {
        return await unwrap(
          api.GET('/api/v1/tenants/{tenantId}/nodes/{nodeName}/versions/{version}/golden-set', {
            params: { path: { tenantId, nodeName: name, version } },
          }),
        );
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });

/** The node's promotion bar, and the injection bar in effect. */
export const evalPolicyQuery = (tenantId: string, name: string) =>
  queryOptions({
    queryKey: qk.evalPolicy(tenantId, name),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/tenants/{tenantId}/nodes/{nodeName}/eval-policy', {
          params: { path: { tenantId, nodeName: name } },
        }),
      ),
  });

/** What promoting the version would say: allowed, the evidence, or the problems. */
export const gateQuery = (tenantId: string, name: string, version: number) =>
  queryOptions({
    queryKey: qk.gate(tenantId, name, version),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/tenants/{tenantId}/nodes/{nodeName}/versions/{version}/gate', {
          params: { path: { tenantId, nodeName: name, version } },
        }),
      ),
  });

/** The evals of one version, newest first (metrics, never content). Polled while one runs. */
export const evalsQuery = (tenantId: string, name: string, version: number) =>
  queryOptions({
    queryKey: qk.evalList(tenantId, name, version),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/tenants/{tenantId}/evals', {
          params: { path: { tenantId }, query: { node: name, version, limit: 50 } },
        }),
      ),
    refetchInterval: (q) =>
      q.state.data?.data?.some((e) => isEvalActive(e.status)) ? EVAL_POLL_MS : false,
  });

/** An eval with its trials; each trial's detail only with `runs.data`. Polled until it ends. */
export const evalQuery = (tenantId: string, evalId: string) =>
  queryOptions({
    queryKey: qk.eval(tenantId, evalId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/tenants/{tenantId}/evals/{evalId}', {
          params: { path: { tenantId, evalId } },
        }),
      ),
    refetchInterval: (q) =>
      q.state.data && isEvalActive(q.state.data.status) ? EVAL_POLL_MS : false,
  });

/** The tenant's eval key, managed by the control plane; `key` is null before the first eval. */
export const evalKeyQuery = (tenantId: string) =>
  queryOptions({
    queryKey: qk.evalKey(tenantId),
    queryFn: () =>
      unwrap(api.GET('/api/v1/tenants/{tenantId}/eval-key', { params: { path: { tenantId } } })),
  });

// ───────────── Mutations ─────────────

export type DeleteOutcome = 'deleted' | 'already-gone';

/**
 * Runs a control-plane DELETE. The server answers 404 for an id that is
 * unknown, belongs to another tenant or was already deleted (repeat deletes
 * are never a second 204). From the console's point of view the row is gone
 * either way, so a 404 resolves as `already-gone` and the caller refreshes.
 */
export async function deleteOrGone(
  promise: Promise<{ data?: unknown; error?: unknown; response: Response }>,
): Promise<DeleteOutcome> {
  try {
    await unwrap(promise);
    return 'deleted';
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return 'already-gone';
    throw e;
  }
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TenantCreate) => unwrap(api.POST('/api/v1/tenants', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tenants }),
  });
}

/**
 * PATCHes a tenant's PII and cache settings (audited as `tenant.update`).
 * Only the fields present in the body change. The response is the updated
 * tenant, so the detail query is seeded with it and the lists (which show
 * `pii_default`) are refetched.
 */
export function useUpdateTenant(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TenantUpdate) =>
      unwrap(api.PATCH('/api/v1/tenants/{tenantId}', { params: { path: { tenantId } }, body })),
    // A detail fetch still in flight would land after the PATCH response and
    // put the pre-save tenant back in the cache.
    onMutate: () => qc.cancelQueries({ queryKey: qk.tenant(tenantId), exact: true }),
    onSuccess: (tenant) => {
      qc.setQueryData(qk.tenant(tenantId), tenant);
      return Promise.all([
        qc.invalidateQueries({ queryKey: qk.tenantList(false) }),
        qc.invalidateQueries({ queryKey: qk.tenantList(true) }),
      ]);
    },
  });
}

/**
 * Sets the tenant's exemplars of an intent, over the config file's (an empty
 * list removes a file intent for the tenant). Audited as `tenant.intent.set`.
 */
export function useSetIntent(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ intent, exemplars }: { intent: string; exemplars: string[] }) =>
      unwrap(
        api.PUT('/api/v1/tenants/{tenantId}/intents/{intent}', {
          params: { path: { tenantId, intent } },
          body: { exemplars },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.intents(tenantId) }),
  });
}

/** Drops the tenant's own exemplars of an intent: the config file's apply again. */
export function useDeleteIntent(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (intent: string) =>
      deleteOrGone(
        api.DELETE('/api/v1/tenants/{tenantId}/intents/{intent}', {
          params: { path: { tenantId, intent } },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.intents(tenantId) }),
  });
}

/**
 * Mints a key. `nodes` (the node allowlist) and `datasource_scopes` are sent
 * only when set: absent means every published node, and every scope of the
 * nodes the key runs.
 */
export function useMintApiKey(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ApiKeyCreate) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/api-keys', {
          params: { path: { tenantId } },
          body,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.apiKeys(tenantId) }),
  });
}

export function useRevokeApiKey(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) =>
      deleteOrGone(
        api.DELETE('/api/v1/tenants/{tenantId}/api-keys/{keyId}', {
          params: { path: { tenantId, keyId } },
        }),
      ),
    // Refreshes both lists, with and without revoked keys.
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.apiKeys(tenantId) }),
  });
}

/**
 * Deletes a tenant. The server cascades: keys revoked, BYOK credentials
 * destroyed, routes removed, datasources and nodes soft-deleted.
 */
export function useDeleteTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tenantId: string) =>
      deleteOrGone(api.DELETE('/api/v1/tenants/{tenantId}', { params: { path: { tenantId } } })),
    onSuccess: (_outcome, tenantId) => {
      // Every query under the tenant (detail, API keys, provider keys,
      // ontology) would only 404 now: drop them instead of refetching.
      qc.removeQueries({ queryKey: qk.tenant(tenantId) });
      qc.removeQueries({ queryKey: qk.ontology(tenantId) });
      return Promise.all([
        qc.invalidateQueries({ queryKey: qk.tenantList(false) }),
        qc.invalidateQueries({ queryKey: qk.tenantList(true) }),
        qc.invalidateQueries({ queryKey: ['datasources'] }),
        qc.invalidateQueries({ queryKey: qk.nodesAll }),
        qc.invalidateQueries({ queryKey: ['tool-servers', tenantId] }),
        qc.invalidateQueries({ queryKey: qk.rag(tenantId) }),
      ]);
    },
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
    onSuccess: (res, datasourceId) => {
      if (res.job) qc.setQueryData(qk.introspection(datasourceId), res.job);
      return qc.invalidateQueries({ queryKey: ['datasources'] });
    },
  });
}

export function useDeleteDatasource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, datasourceId }: { tenantId: string; datasourceId: string }) =>
      deleteOrGone(
        api.DELETE('/api/v1/tenants/{tenantId}/datasources/{datasourceId}', {
          params: { path: { tenantId, datasourceId } },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['datasources'] }),
  });
}

export function useReviewElement(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      elementId: string;
      decision: ReviewDecision;
      note?: string;
      /** Go ahead although published node versions query the element (a `409` otherwise). */
      acknowledgeBreaking?: boolean;
    }) =>
      unwrap(
        api.POST('/api/v1/ontology/elements/{elementId}/review', {
          params: { path: { elementId: args.elementId } },
          // Element ids are per tenant: the control plane needs the tenant in the body.
          body: {
            tenant_id: tenantId,
            decision: args.decision,
            ...(args.note ? { note: args.note } : {}),
            ...(args.acknowledgeBreaking ? { acknowledge_breaking: true } : {}),
          },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ontology(tenantId) }),
  });
}

/**
 * Writes elements made outside Caliban as proposals, in one ontology version
 * (`ontology.review`). Proposing over an approved element withdraws it, so it
 * can be refused with a breaking-change `409` like a review.
 */
export function useProposeOntology(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { elements: OntologyElement[]; acknowledgeBreaking?: boolean }) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/ontology/proposals', {
          params: { path: { tenantId } },
          body: {
            elements: args.elements,
            ...(args.acknowledgeBreaking ? { acknowledge_breaking: true } : {}),
          },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ontology(tenantId) }),
  });
}

/**
 * Creates a draft: version = the node's latest plus one (a new node starts at
 * v1). The server checks the spec statically and refuses it with a 422.
 */
export function useCreateNodeVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tenantId,
      name,
      spec,
    }: {
      tenantId: string;
      name: string;
      spec: Record<string, unknown>;
    }) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/nodes/{nodeName}/versions', {
          params: { path: { tenantId, nodeName: name } },
          body: { spec },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.nodesAll }),
  });
}

/**
 * Publishes a draft after the server validates it against the tenant (a 422
 * lists every problem). `promote` also makes it the live version.
 */
export function usePublishNodeVersion(tenantId: string, name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ version, promote }: { version: number; promote: boolean }) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/nodes/{nodeName}/versions/{version}/publish', {
          params: { path: { tenantId, nodeName: name, version } },
          body: { promote },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.nodesAll }),
  });
}

/** Moves the promotion pointer to a published version (promote or roll back). */
export function usePromoteNode(tenantId: string, name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: number) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/nodes/{nodeName}/promote', {
          params: { path: { tenantId, nodeName: name } },
          body: { version },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.nodesAll }),
  });
}

/** Retires a published version: new runs are refused, runs in flight finish on it. */
export function useRetireNodeVersion(tenantId: string, name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: number) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/nodes/{nodeName}/versions/{version}/retire', {
          params: { path: { tenantId, nodeName: name, version } },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.nodesAll }),
  });
}

export function useDeleteNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, nodeId }: { tenantId: string; nodeId: string }) =>
      deleteOrGone(
        api.DELETE('/api/v1/tenants/{tenantId}/nodes/{nodeId}', {
          params: { path: { tenantId, nodeId } },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.nodesAll }),
  });
}

/** Registers an MCP server. The credential is sealed at once and never returned. */
export function useRegisterToolServer(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ToolServerCreate) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/tool-servers', {
          params: { path: { tenantId } },
          body,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.toolServers(tenantId), exact: true }),
  });
}

/** Deletes a server (its credential is wiped). A 409 while a published version uses it. */
export function useDeleteToolServer(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (server: string) =>
      deleteOrGone(
        api.DELETE('/api/v1/tenants/{tenantId}/tool-servers/{server}', {
          params: { path: { tenantId, server } },
        }),
      ),
    onSuccess: (_outcome, server) => {
      qc.removeQueries({ queryKey: qk.toolManifests(tenantId, server) });
      return qc.invalidateQueries({ queryKey: qk.toolServers(tenantId), exact: true });
    },
  });
}

/**
 * Lists the server's tools now, pins each manifest and runs the injection
 * scan. A changed tool comes back as a new `discovered` manifest.
 */
export function useDiscoverTools(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (server: string) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/tool-servers/{server}/discover', {
          params: { path: { tenantId, server } },
        }),
      ),
    onSuccess: (_data, server) =>
      qc.invalidateQueries({ queryKey: qk.toolManifests(tenantId, server) }),
  });
}

/** Records manifests for a server the control plane cannot reach (pinned and scanned the same way). */
export function useImportTools(tenantId: string, server: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ToolImport) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/tool-servers/{server}/tools', {
          params: { path: { tenantId, server } },
          body,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.toolManifests(tenantId, server) }),
  });
}

/**
 * Approves a manifest by pin. One with scan findings needs
 * `acknowledge_findings` (the server answers 422 otherwise).
 */
export function useApproveTool(tenantId: string, server: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tool,
      pin,
      acknowledgeFindings,
    }: {
      tool: string;
      pin: string;
      acknowledgeFindings: boolean;
    }) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/tool-servers/{server}/tools/{tool}/approve', {
          params: { path: { tenantId, server, tool } },
          body: acknowledgeFindings ? { pin, acknowledge_findings: true } : { pin },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.toolManifests(tenantId, server) }),
  });
}

/** Withdraws the approval of a manifest. */
export function useRevokeTool(tenantId: string, server: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tool, pin }: { tool: string; pin: string }) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/tool-servers/{server}/tools/{tool}/revoke', {
          params: { path: { tenantId, server, tool } },
          body: { pin },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.toolManifests(tenantId, server) }),
  });
}

/** Creates a document collection (audited as `rag.collection.create`). */
export function useCreateRagCollection(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RagCollectionCreate) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/rag/collections', {
          params: { path: { tenantId } },
          body,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ragCollections(tenantId) }),
  });
}

/** Deletes a collection and its documents. A 409 while a published node version names it. */
export function useDeleteRagCollection(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (collection: string) =>
      deleteOrGone(
        api.DELETE('/api/v1/tenants/{tenantId}/rag/collections/{collection}', {
          params: { path: { tenantId, collection } },
        }),
      ),
    onSuccess: (_outcome, collection) => {
      qc.removeQueries({ queryKey: qk.ragCollection(tenantId, collection) });
      return qc.invalidateQueries({ queryKey: qk.ragCollections(tenantId) });
    },
  });
}

/**
 * Ingests a document: a new pending version (202), or the newest version
 * unchanged (200, `unchanged: true`) when the content and settings are the same.
 */
export function useIngestRagDocument(tenantId: string, collection: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RagDocumentIngest) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/rag/collections/{collection}/documents', {
          params: { path: { tenantId, collection } },
          body,
        }),
      ),
    onSuccess: (doc) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.ragDocuments(tenantId, collection) }),
        qc.invalidateQueries({ queryKey: qk.ragDocument(tenantId, collection, doc.doc_id) }),
      ]),
  });
}

/** Deletes every version of a document: it stops being searched at once. */
export function useDeleteRagDocument(tenantId: string, collection: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) =>
      deleteOrGone(
        api.DELETE('/api/v1/tenants/{tenantId}/rag/collections/{collection}/documents/{docId}', {
          params: { path: { tenantId, collection, docId } },
        }),
      ),
    onSuccess: (_outcome, docId) => {
      qc.removeQueries({ queryKey: qk.ragDocument(tenantId, collection, docId) });
      return qc.invalidateQueries({ queryKey: qk.ragDocuments(tenantId, collection) });
    },
  });
}

/**
 * Releases a quarantined version (rag.approve): a decision about its findings,
 * so `acknowledge_findings` is always sent. It is indexed again and served
 * once ready.
 */
export function useReleaseRagDocument(tenantId: string, collection: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, version }: { docId: string; version: number }) =>
      unwrap(
        api.POST(
          '/api/v1/tenants/{tenantId}/rag/collections/{collection}/documents/{docId}/release',
          {
            params: { path: { tenantId, collection, docId } },
            body: { version, acknowledge_findings: true },
          },
        ),
      ),
    onSuccess: (_doc, { docId }) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.ragDocuments(tenantId, collection) }),
        qc.invalidateQueries({ queryKey: qk.ragDocument(tenantId, collection, docId) }),
      ]),
  });
}

/** Grants a role (audited as `role_binding.create`). Only owners grant `owner`. */
export function useCreateRoleBinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RoleBindingCreate) => unwrap(api.POST('/api/v1/role-bindings', { body })),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.roleBindings }),
        qc.invalidateQueries({ queryKey: qk.users }),
        // The signed-in user may have changed their own roles.
        qc.invalidateQueries({ queryKey: qk.authState }),
      ]),
  });
}

/** Revokes a role binding; takes effect on the next request. */
export function useDeleteRoleBinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bindingId: string) =>
      deleteOrGone(
        api.DELETE('/api/v1/role-bindings/{bindingId}', { params: { path: { bindingId } } }),
      ),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.roleBindings }),
        qc.invalidateQueries({ queryKey: qk.users }),
        qc.invalidateQueries({ queryKey: qk.authState }),
      ]),
  });
}

/** Signs a user out everywhere: every active session is revoked. */
export function useRevokeUserSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      unwrap(api.DELETE('/api/v1/users/{userId}/sessions', { params: { path: { userId } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users }),
  });
}

/**
 * Answers the human step a run waits for, as the signed-in user: a question's
 * answer, or `{"approve": true | false}` for a tainted write. Journaled with
 * the user and audited (`node.run.answer`, `node.write.approve`,
 * `node.write.deny`). A 409 when the run no longer waits for that step.
 */
export function useAnswerRun(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, step, answer }: { runId: string; step: string; answer: unknown }) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/runs/{runId}/input', {
          params: { path: { tenantId, runId } },
          body: { answer, step },
        }),
      ),
    onSuccess: (run) => {
      qc.setQueryData(qk.run(tenantId, run.id), run);
      return qc.invalidateQueries({ queryKey: qk.runs(tenantId) });
    },
    // Someone else may have answered first (409): show what the run does now.
    onError: () => qc.invalidateQueries({ queryKey: qk.runs(tenantId) }),
  });
}

/**
 * Creates or replaces a version's golden set (a 422 lists every problem, kind
 * `golden_set`). Audited with counts and hashes, never cases.
 */
export function usePutGoldenSet(tenantId: string, name: string, version: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cases: GoldenCase[]) =>
      unwrap(
        api.PUT('/api/v1/tenants/{tenantId}/nodes/{nodeName}/versions/{version}/golden-set', {
          params: { path: { tenantId, nodeName: name, version } },
          body: { cases },
        }),
      ),
    onSuccess: (set) => qc.setQueryData(qk.goldenSet(tenantId, name, version), set),
  });
}

export function useDeleteGoldenSet(tenantId: string, name: string, version: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      deleteOrGone(
        api.DELETE('/api/v1/tenants/{tenantId}/nodes/{nodeName}/versions/{version}/golden-set', {
          params: { path: { tenantId, nodeName: name, version } },
        }),
      ),
    onSuccess: () => qc.setQueryData(qk.goldenSet(tenantId, name, version), null),
  });
}

/** Sets the node's promotion bar (`nodes.publish`); the gate of every version may change. */
export function usePutEvalPolicy(tenantId: string, name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (policy: EvalPolicy) =>
      unwrap(
        api.PUT('/api/v1/tenants/{tenantId}/nodes/{nodeName}/eval-policy', {
          params: { path: { tenantId, nodeName: name } },
          body: policy,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.nodeEvals(tenantId, name) }),
  });
}

/** Starts an eval of a published version, run as the API key it names. */
export function useStartEval(tenantId: string, name: string, version: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EvalStart) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/nodes/{nodeName}/versions/{version}/evals', {
          params: { path: { tenantId, nodeName: name, version } },
          body,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.evalList(tenantId, name, version) }),
  });
}

/** Cancels an eval: a pending one at once, a running one at its worker's next check. */
export function useCancelEval(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (evalId: string) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/evals/{evalId}/cancel', {
          params: { path: { tenantId, evalId } },
        }),
      ),
    onSuccess: (e) => {
      qc.setQueryData(qk.eval(tenantId, e.id), (prev: typeof e | undefined) =>
        prev ? { ...prev, ...e } : e,
      );
      return qc.invalidateQueries({ queryKey: qk.evalList(tenantId, e.node, e.version) });
    },
  });
}

/**
 * Cancels a run as the signed-in user (`runs.answer`), audited as
 * `node.run.cancel`: a waiting run ends at once, a running one stops at its
 * next step. A 409 when it already ended otherwise.
 */
export function useCancelRun(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/runs/{runId}/cancel', {
          params: { path: { tenantId, runId } },
        }),
      ),
    onSuccess: (run) => {
      qc.setQueryData(qk.run(tenantId, run.id), run);
      return qc.invalidateQueries({ queryKey: qk.runs(tenantId) });
    },
    onError: () => qc.invalidateQueries({ queryKey: qk.runs(tenantId) }),
  });
}

/**
 * Rotates the tenant's eval key (`api_keys.write`): the old one is revoked
 * and a new one created. Evals in flight lose their key.
 */
export function useRotateEvalKey(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/v1/tenants/{tenantId}/eval-key/rotate', { params: { path: { tenantId } } }),
      ),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.evalKey(tenantId) }),
        qc.invalidateQueries({ queryKey: qk.apiKeys(tenantId) }),
      ]),
  });
}
