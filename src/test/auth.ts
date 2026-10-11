import type { AuthConfig, Me, Permission, Role } from '@/api/types';

/**
 * Fixtures for `/auth/config` and `/auth/me`. The role to permission table
 * mirrors the control plane's (`crates/caliban-cp/src/auth/rbac.rs` in core),
 * so tests can be written in terms of roles.
 */
const ALL: Permission[] = [
  'tenants.create',
  'catalog.read',
  'catalog.write',
  'providers.probe',
  'audit.read',
  'rbac.read',
  'rbac.write',
  'tenant.read',
  'tenant.write',
  'tenant.delete',
  'api_keys.read',
  'api_keys.write',
  'provider_keys.read',
  'provider_keys.write',
  'routes.read',
  'routes.write',
  'datasources.read',
  'datasources.write',
  'ontology.read',
  'ontology.review',
  'nodes.read',
  'nodes.write',
  'nodes.publish',
  'nodes.run',
  'tools.read',
  'tools.write',
  'tools.approve',
  'runs.read',
  'runs.data',
  'runs.answer',
  'usage.read',
];

const DEPLOYMENT_WIDE = new Set<Permission>([
  'tenants.create',
  'catalog.read',
  'catalog.write',
  'providers.probe',
  'audit.read',
  'rbac.read',
  'rbac.write',
]);

const VIEWER: Permission[] = [
  'catalog.read',
  'tenant.read',
  'api_keys.read',
  'provider_keys.read',
  'routes.read',
  'datasources.read',
  'ontology.read',
  'nodes.read',
  'tools.read',
  'runs.read',
  'usage.read',
];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL,
  admin: ALL,
  auditor: [...VIEWER, 'providers.probe', 'audit.read', 'rbac.read'],
  tenant_admin: [
    ...VIEWER,
    'tenant.write',
    'api_keys.write',
    'provider_keys.write',
    'routes.write',
    'datasources.write',
    'ontology.review',
    'nodes.write',
    'nodes.publish',
    'nodes.run',
    'tools.write',
    'tools.approve',
    'runs.data',
    'runs.answer',
  ],
  developer: [
    ...VIEWER,
    'api_keys.write',
    'routes.write',
    'ontology.review',
    'nodes.write',
    'nodes.run',
    'tools.write',
    'runs.data',
  ],
  viewer: VIEWER,
  billing: ['catalog.read', 'tenant.read', 'usage.read'],
};

export interface Grant {
  role: Role;
  tenant_id?: string;
}

/** `/auth/me` for a user holding `roles`, with the effective permissions the server computes. */
export function meWith(
  roles: Grant[],
  {
    method = 'session',
    name = 'Ada Lovelace',
    email = 'ada@example.internal',
  }: { method?: Me['method']; name?: string; email?: string } = {},
): Me {
  const deployment = new Set<Permission>();
  for (const g of roles) {
    for (const p of ROLE_PERMISSIONS[g.role]) {
      if (!g.tenant_id || DEPLOYMENT_WIDE.has(p)) deployment.add(p);
    }
  }
  const tenants: Record<string, Permission[]> = {};
  for (const g of roles) {
    if (!g.tenant_id) continue;
    const ps = ROLE_PERMISSIONS[g.role].filter(
      (p) => !DEPLOYMENT_WIDE.has(p) && !deployment.has(p),
    );
    tenants[g.tenant_id] = [...new Set([...(tenants[g.tenant_id] ?? []), ...ps])];
  }
  const user =
    method === 'break_glass'
      ? null
      : {
          id: 'usr_ada',
          issuer: 'https://idp.example.internal/realms/caliban',
          subject: 'ada',
          email,
          name,
          created_at: '2026-10-01T10:00:00Z',
        };
  return {
    authenticated: true,
    method,
    actor: user ? `${email} <${user.issuer}#ada>` : 'break_glass',
    user,
    groups: [],
    roles,
    // The contract's Permission enum does not list the run permissions yet.
    permissions: {
      deployment: ALL.filter((p) => deployment.has(p)),
      tenants,
    } as Me['permissions'],
    ...(method === 'session'
      ? {
          csrf_token: 'csrf-test-token',
          session: {
            id: 'ses_1',
            created_at: '2026-10-10T08:00:00Z',
            expires_at: '2026-10-10T16:00:00Z',
          },
        }
      : {}),
  };
}

export const SSO_CONFIG: AuthConfig = {
  sso_enabled: true,
  break_glass_enabled: true,
  login_url: '/auth/login',
};

const unauthorized = {
  status: 401,
  body: { error: { message: 'authentication required', type: 'authentication_error' } },
};

/**
 * mockApi routes for single sign-on: `/auth/config`, and `/auth/me` answering
 * with `me` (a session) or 401 (no session). Spread into a mockApi table.
 */
export function ssoRoutes(me: Me | null, config: Partial<AuthConfig> = {}) {
  return {
    'GET /auth/config': () => ({ body: { ...SSO_CONFIG, ...config } }),
    'GET /auth/me': () => (me ? { body: me } : unauthorized),
  };
}
