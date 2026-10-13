import { useQueries, useQuery } from '@tanstack/react-query';
import { usePermissions } from '@/api/auth';
import {
  apiKeysQuery,
  datasourcesQuery,
  modelsQuery,
  nodesQuery,
  providerHealthQuery,
  providersQuery,
  ragCollectionsQuery,
  tenantsQuery,
  usageQuery,
} from '@/api/queries';
import type { SetupFacts } from '@/lib/checklist';

/** Model servers probed for the checklist, at most. */
const PROBED = 5;

/**
 * The live state the setup checklist is derived from, read with the queries
 * the pages already use. A fact the user's role cannot read stays undefined
 * (left out of the checklist), and so does one still loading.
 */
export function useSetupFacts(workspaceId: string | undefined): SetupFacts {
  const perms = usePermissions();
  const can = (p: Parameters<typeof perms.can>[0]) =>
    workspaceId ? perms.can(p, workspaceId) : perms.canSomewhere(p);
  const ws = workspaceId ?? '';

  const catalog = perms.canSomewhere('catalog.read');
  const providers = useQuery({ ...providersQuery(), enabled: catalog });
  const models = useQuery({ ...modelsQuery(), enabled: catalog });
  const health = useQueries({
    queries: (providers.data ?? []).slice(0, PROBED).map((p) => ({
      ...providerHealthQuery(p.id),
      enabled: catalog,
    })),
  });
  const tenants = useQuery({ ...tenantsQuery(), enabled: perms.canSomewhere('tenant.read') });
  const keys = useQuery({
    ...apiKeysQuery(ws),
    enabled: Boolean(workspaceId) && can('api_keys.read'),
  });
  const usage = useQuery({ ...usageQuery(workspaceId, 1), enabled: can('usage.read') });
  const rag = useQuery({
    ...ragCollectionsQuery(ws),
    enabled: Boolean(workspaceId) && can('rag.read'),
  });
  const sources = useQuery({
    ...datasourcesQuery(workspaceId),
    enabled: Boolean(workspaceId) && can('datasources.read'),
  });
  const nodes = useQuery({
    ...nodesQuery(workspaceId),
    enabled: Boolean(workspaceId) && can('nodes.read'),
  });

  const chat = models.data?.some((m) => m.kind === 'chat');
  let serverReachable: boolean | undefined;
  if (providers.data) {
    if (providers.data.length === 0) serverReachable = models.data ? Boolean(chat) : undefined;
    else if (health.some((h) => h.data?.status === 'ok')) serverReachable = true;
    else if (health.every((h) => !h.isPending)) serverReachable = false;
  }

  const data =
    rag.data || sources.data
      ? (rag.data?.length ?? 0) > 0 || (sources.data?.length ?? 0) > 0
      : undefined;
  const versions = nodes.data;
  return {
    serverReachable: catalog ? serverReachable : undefined,
    chatModel: models.data ? Boolean(chat) : undefined,
    workspace: tenants.data ? tenants.data.length > 0 : undefined,
    appKey: workspaceId
      ? keys.data?.some((k) => !k.revoked_at && k.purpose !== 'eval')
      : tenants.data
        ? false
        : undefined,
    firstRequest: usage.data
      ? (usage.data.totals.requests ?? 0) > 0 || usage.data.events.length > 0
      : undefined,
    data: workspaceId ? data : undefined,
    assistant: versions ? versions.length > 0 : undefined,
    published: versions ? versions.some((v) => v.state === 'published') : undefined,
    live: versions ? versions.some((v) => v.live) : undefined,
  };
}
