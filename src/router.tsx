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
import { CACHE_STATUSES, CACHE_TIERS, type CacheStatus, type CacheTier } from '@/api/types';
import { AppShell } from '@/components/layout/app-shell';
import { AUDIT_LIMITS } from '@/lib/audit';
import { isAuthenticated } from '@/lib/auth';
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

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => ({
    redirect: str(s.redirect),
  }),
  beforeLoad: () => {
    if (isAuthenticated()) throw redirect({ to: '/' });
  },
  component: LoginPage,
});

/** Pathless layout: everything below requires an admin token. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  beforeLoad: ({ location }) => {
    if (!isAuthenticated()) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
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

const usageRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'usage',
  validateSearch: (
    s: Record<string, unknown>,
  ): { tenant?: string; cache?: CacheStatus; tier?: CacheTier; limit?: number } => {
    const limit = Number(s.limit);
    return {
      tenant: str(s.tenant),
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
    usageRoute,
    auditRoute,
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

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
