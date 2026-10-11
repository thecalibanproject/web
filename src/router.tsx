import type { QueryClient } from '@tanstack/react-query';
import {
  createHashHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { authStateQuery } from '@/api/auth';
import { qk } from '@/api/queries';
import { CACHE_STATUSES, CACHE_TIERS, type CacheStatus, type CacheTier } from '@/api/types';
import { AppShell } from '@/components/layout/app-shell';
import { AUDIT_LIMITS } from '@/lib/audit';
import { isRunStatusFilter, RUN_SINCE, type RunSince, type RunStatusFilter } from '@/lib/runs';
import { isAuthenticated, onAuthChange, takeSessionExpired } from '@/lib/auth';
import { safeRedirect } from '@/lib/urls';
import { LoginPage } from '@/pages/login';
import { NotFoundPage } from '@/pages/not-found';
import { OverviewPage } from '@/pages/overview';

export interface RouterContext {
  queryClient: QueryClient;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const tenantSearch = (s: Record<string, unknown>): { tenant?: string } => ({
  tenant: str(s.tenant),
});

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFoundPage,
});

/** Errors the control plane's `/auth/callback` sends the browser back with. */
export const LOGIN_ERRORS = ['login_failed', 'login_expired', 'idp_unavailable'] as const;
export type LoginError = (typeof LOGIN_ERRORS)[number];

export interface LoginSearch {
  /** In-app href to return to after signing in. */
  redirect?: string;
  /** Single sign-on failed (set by the control plane). */
  error?: LoginError;
  /** Why the user is here: the console session ended. */
  reason?: 'expired';
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  validateSearch: (s: Record<string, unknown>): LoginSearch => ({
    redirect: str(s.redirect),
    error: LOGIN_ERRORS.find((e) => e === s.error),
    reason: s.reason === 'expired' ? 'expired' : undefined,
  }),
  beforeLoad: async ({ context, search }) => {
    const { principal } = await context.queryClient.ensureQueryData(authStateQuery());
    if (principal) throw redirect({ href: safeRedirect(search.redirect), replace: true });
  },
  component: LoginPage,
});

/**
 * Pathless layout: everything below requires a signed-in user, with the admin
 * token (token mode) or a single sign-on session. Who that is, and what their
 * roles allow, is loaded once here and kept in the query cache.
 */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  beforeLoad: async ({ context, location }) => {
    const { principal } = await context.queryClient.ensureQueryData(authStateQuery());
    if (!principal) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
          ...(takeSessionExpired() ? { reason: 'expired' as const } : {}),
        },
      });
    }
  },
  component: AppShell,
});

const overviewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: OverviewPage,
});

const tenantsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'tenants',
  component: lazyRouteComponent(() => import('@/pages/tenants'), 'TenantsPage'),
});

export type TenantTab = 'api-keys' | 'provider-keys';
const tenantDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'tenants/$tenantId',
  validateSearch: (s: Record<string, unknown>): { tab?: TenantTab } => ({
    tab: s.tab === 'provider-keys' || s.tab === 'api-keys' ? s.tab : undefined,
  }),
  component: lazyRouteComponent(() => import('@/pages/tenant-detail'), 'TenantDetailPage'),
});

export type ModelsTab = 'catalogue' | 'servers';
const modelsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'models',
  validateSearch: (s: Record<string, unknown>): { tab?: ModelsTab } => ({
    tab: s.tab === 'catalogue' || s.tab === 'servers' ? s.tab : undefined,
  }),
  component: lazyRouteComponent(() => import('@/pages/models'), 'ModelsPage'),
});

const datasourcesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'datasources',
  validateSearch: tenantSearch,
  component: lazyRouteComponent(() => import('@/pages/datasources'), 'DatasourcesPage'),
});

const ontologyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'ontology',
  validateSearch: tenantSearch,
  component: lazyRouteComponent(() => import('@/pages/ontology'), 'OntologyPage'),
});

const nodesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'nodes',
  validateSearch: tenantSearch,
  component: lazyRouteComponent(() => import('@/pages/nodes'), 'NodesPage'),
});

const toolsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'tools',
  validateSearch: (s: Record<string, unknown>): { tenant?: string; server?: string } => ({
    tenant: str(s.tenant),
    server: str(s.server),
  }),
  component: lazyRouteComponent(() => import('@/pages/tools'), 'ToolsPage'),
});

const posInt = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export type NodeTab = 'versions' | 'evals';

export interface NodeDetailSearch {
  tab?: NodeTab;
  /** The version whose spec is open. */
  version?: number;
  /** The versions compared. */
  from?: number;
  to?: number;
  /** Evals tab: the version shown. */
  ev?: number;
  /** Evals tab: the eval open. */
  eval?: string;
}

const nodeDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'nodes/$tenantId/$nodeName',
  validateSearch: (s: Record<string, unknown>): NodeDetailSearch => ({
    tab: s.tab === 'evals' || s.tab === 'versions' ? s.tab : undefined,
    version: posInt(s.version),
    from: posInt(s.from),
    to: posInt(s.to),
    ev: posInt(s.ev),
    eval: str(s.eval),
  }),
  component: lazyRouteComponent(() => import('@/pages/node-detail'), 'NodeDetailPage'),
});

export interface RunsSearch {
  tenant?: string;
  node?: string;
  version?: number;
  status?: RunStatusFilter;
  since?: RunSince;
}

const runsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'runs',
  validateSearch: (s: Record<string, unknown>): RunsSearch => ({
    tenant: str(s.tenant),
    node: str(s.node),
    version: posInt(s.version),
    status: isRunStatusFilter(s.status) ? s.status : undefined,
    since: RUN_SINCE.find((r) => r === s.since),
  }),
  component: lazyRouteComponent(() => import('@/pages/runs'), 'RunsPage'),
});

const runDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'runs/$tenantId/$runId',
  component: lazyRouteComponent(() => import('@/pages/run-detail'), 'RunDetailPage'),
});

const inboxRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'inbox',
  validateSearch: tenantSearch,
  component: lazyRouteComponent(() => import('@/pages/inbox'), 'InboxPage'),
});

const usageRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'usage',
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    tenant?: string;
    cache?: CacheStatus;
    tier?: CacheTier;
    limit?: number;
    node?: string;
    run?: string;
  } => {
    const limit = Number(s.limit);
    return {
      tenant: str(s.tenant),
      node: str(s.node),
      run: str(s.run),
      cache: CACHE_STATUSES.find((c) => c === s.cache),
      tier: CACHE_TIERS.find((t) => t === s.tier),
      limit: [100, 250, 500, 1000].includes(limit) ? limit : undefined,
    };
  },
  component: lazyRouteComponent(() => import('@/pages/usage'), 'UsagePage'),
});

const auditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'audit',
  validateSearch: (
    s: Record<string, unknown>,
  ): { tenant?: string; action?: string; limit?: number; page?: number } => {
    const limit = AUDIT_LIMITS.find((l) => l === Number(s.limit));
    const page = Number(s.page);
    return {
      tenant: str(s.tenant),
      action: str(s.action),
      limit,
      page: Number.isInteger(page) && page > 1 ? page : undefined,
    };
  },
  component: lazyRouteComponent(() => import('@/pages/audit'), 'AuditPage'),
});

const usersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'users',
  component: lazyRouteComponent(() => import('@/pages/users'), 'UsersPage'),
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'settings',
  component: lazyRouteComponent(() => import('@/pages/settings'), 'SettingsPage'),
});

export const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    overviewRoute,
    tenantsRoute,
    tenantDetailRoute,
    modelsRoute,
    datasourcesRoute,
    ontologyRoute,
    nodesRoute,
    nodeDetailRoute,
    runsRoute,
    runDetailRoute,
    inboxRoute,
    toolsRoute,
    usageRoute,
    auditRoute,
    usersRoute,
    settingsRoute,
  ]),
]);

/**
 * Hash history (`/#/tenants`): the control plane serves dist/ as plain static
 * files, so deep links and refreshes work without any SPA fallback rule, and
 * the console also works under a reverse-proxy sub-path.
 */
/**
 * Pages other than login/overview are code-split per route (ajv, for example,
 * only loads with the Nodes page). Chunks are local files in dist/assets.
 */
export function createAppRouter(queryClient: QueryClient, history = createHashHistory()) {
  return createRouter({
    routeTree,
    history,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
}

/**
 * Sends the user back to the sign-in screen when they are signed out from
 * under the page: a 401 dropped the token, or the console session expired or
 * was revoked. Signing in navigates by itself. Returns an unsubscribe function.
 */
export function wireAuth(router: ReturnType<typeof createAppRouter>, queryClient: QueryClient) {
  return onAuthChange(() => {
    // Signing in navigates by itself, and the sign-in screen has nowhere to send anyone.
    if (isAuthenticated() || router.state.location.pathname === '/login') return;
    queryClient.removeQueries({ queryKey: qk.auth });
    void router.invalidate();
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
