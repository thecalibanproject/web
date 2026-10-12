import { TENANT_ROLES, type Me, type Permission, type Role } from '@/api/types';

/**
 * Who is signed in. `mode` is how the console authenticates its requests:
 * `token` sends the admin token (break-glass once single sign-on is on),
 * `session` relies on the single sign-on cookie. `me` is the control plane's
 * `/auth/me`, or null when the control plane predates it (then every action
 * is offered, as before roles existed; the server still decides).
 */
export interface Principal {
  mode: 'token' | 'session';
  me: Me | null;
}

/**
 * What the signed-in user may do, from the effective permissions in
 * `/auth/me`. This only hides or disables controls: the control plane checks
 * every request again and answers 403 when a role does not allow it.
 */
export interface Permissions {
  /** `perm` deployment-wide, or on `tenantId` for tenant-scoped permissions. */
  can: (perm: Permission, tenantId?: string) => boolean;
  /** `perm` deployment-wide or on at least one tenant. */
  canSomewhere: (perm: Permission) => boolean;
  /** Tenants the user holds `perm` on; `all` when it is held deployment-wide. */
  tenantsWith: (perm: Permission) => 'all' | string[];
  /** Holds the owner role (only owners grant and revoke `owner`). */
  isOwner: boolean;
  /** Holds no role at all: signed in, but nothing to see yet. */
  hasNoRole: boolean;
}

const ALLOW_ALL: Permissions = {
  can: () => true,
  canSomewhere: () => true,
  tenantsWith: () => 'all',
  isOwner: true,
  hasNoRole: false,
};

const DENY_ALL: Permissions = {
  can: () => false,
  canSomewhere: () => false,
  tenantsWith: () => [],
  isOwner: false,
  hasNoRole: true,
};

/**
 * `undefined` means the auth state is not known on this screen (a component
 * rendered on its own); everything is offered and the server decides.
 */
export function permissionsOf(principal: Principal | null | undefined): Permissions {
  if (principal === undefined) return ALLOW_ALL;
  if (principal === null) return DENY_ALL;
  const me = principal.me;
  if (!me) return ALLOW_ALL;
  const deployment = new Set<Permission>(me.permissions.deployment);
  const tenants = new Map<string, Set<Permission>>(
    Object.entries(me.permissions.tenants).map(([t, ps]) => [t, new Set(ps)]),
  );
  return {
    can: (perm, tenantId) =>
      deployment.has(perm) || (tenantId !== undefined && Boolean(tenants.get(tenantId)?.has(perm))),
    canSomewhere: (perm) => deployment.has(perm) || [...tenants.values()].some((s) => s.has(perm)),
    tenantsWith: (perm) =>
      deployment.has(perm)
        ? 'all'
        : [...tenants.entries()].filter(([, s]) => s.has(perm)).map(([t]) => t),
    isOwner: me.roles.some((r) => r.role === 'owner' && !r.tenant_id),
    hasNoRole: me.roles.length === 0,
  };
}

export function isTenantRole(role: Role): boolean {
  return (TENANT_ROLES as readonly Role[]).includes(role);
}

/** Display name of the signed-in user. */
export function displayName(principal: Principal): string {
  const me = principal.me;
  if (!me || me.method === 'break_glass') return 'Admin token';
  return me.user?.name || me.user?.email || me.actor;
}

/** What a permission lets someone do, for "your role cannot ..." tooltips. */
const WHAT: Partial<Record<Permission, string>> = {
  'nodes.write': 'create or delete node versions',
  'nodes.publish': 'publish, promote or retire node versions',
  'nodes.run': 'grant node access to API keys',
  'tools.write': 'register, discover or delete tool servers',
  'tools.approve': 'approve or revoke tools',
  'rag.write': 'create or delete collections, or ingest or delete documents',
  'rag.approve': 'release quarantined documents',
  'runs.answer': 'answer questions or approve writes of node runs',
  'tenant.write': 'change tenant settings',
  'api_keys.write': 'mint or revoke API keys',
  'ontology.review': 'review or propose ontology elements',
  'routes.write': 'change routing intents',
};

/**
 * Why a control is disabled: null when the user holds `perm` (on `tenantId`),
 * otherwise a sentence naming the permission, for a tooltip.
 */
export function deniedReason(
  perms: Permissions,
  perm: Permission,
  tenantId?: string,
): string | null {
  if (perms.can(perm, tenantId)) return null;
  const what = WHAT[perm] ?? 'do this';
  return `Your role cannot ${what}${tenantId ? ' on this tenant' : ''} (needs ${perm}).`;
}
