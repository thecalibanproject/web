import type { Role } from '@/api/types';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/lib/labels';
import { isTenantRole, type Principal } from '@/lib/permissions';
import { Badge } from './ui';

/** A role, with its workspace for workspace roles ("Developer: acme"). */
export function RoleBadge({ value: role, tenantId }: { value: Role; tenantId?: string | null }) {
  const deployment = !isTenantRole(role);
  return (
    <Badge
      tone={role === 'owner' ? 'accent' : deployment ? 'info' : 'neutral'}
      title={ROLE_DESCRIPTION[role]}
    >
      {ROLE_LABEL[role]}
      {tenantId ? <span className="font-normal">: {tenantId}</span> : null}
    </Badge>
  );
}

/** The signed-in user's roles, or how the token signs in. */
export function PrincipalRoles({
  principal,
  ssoEnabled,
}: {
  principal: Principal;
  ssoEnabled: boolean;
}) {
  const me = principal.me;
  if (!me || me.method === 'break_glass') {
    return ssoEnabled ? (
      <Badge tone="warn" title="Emergency access. Every use is recorded in the audit log.">
        Shared admin token
      </Badge>
    ) : (
      <RoleBadge value="owner" />
    );
  }
  if (me.roles.length === 0) return <span className="text-[12px] text-fg-subtle">No role</span>;
  return (
    <ul aria-label="Your roles" className="flex flex-wrap gap-1">
      {me.roles.map((r) => (
        <li key={`${r.role}:${r.tenant_id ?? ''}`}>
          <RoleBadge value={r.role} tenantId={r.tenant_id} />
        </li>
      ))}
    </ul>
  );
}
