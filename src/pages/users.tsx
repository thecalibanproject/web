import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { usePermissions } from '@/api/auth';
import {
  roleBindingsQuery,
  tenantsQuery,
  useCreateRoleBinding,
  useDeleteRoleBinding,
  useRevokeUserSessions,
  usersQuery,
} from '@/api/queries';
import { ROLES, type Role, type RoleBinding, type SubjectKind, type User } from '@/api/types';
import { RoleBadge } from '@/components/roles';
import { TenantSelect } from '@/components/tenant-select';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import { IconLogout, IconPlus, IconTrash } from '@/components/ui/icons';
import { formatDateTime } from '@/lib/format';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/lib/labels';
import { isTenantRole } from '@/lib/permissions';

function userLabel(u: User): string {
  return u.name || u.email || u.subject;
}

/** Who a binding names: a user (by id) or an identity provider group. */
function Subject({ binding, users }: { binding: RoleBinding; users: Map<string, User> }) {
  if (binding.subject_kind === 'group') {
    return (
      <span className="inline-flex items-center gap-2">
        <Badge>Group</Badge>
        <span className="font-mono text-[12.5px]">{binding.subject}</span>
      </span>
    );
  }
  const u = users.get(binding.subject);
  return (
    <span className="inline-flex items-center gap-2">
      <Badge>User</Badge>
      <span className="min-w-0">
        <span className="block truncate font-medium">{u ? userLabel(u) : binding.subject}</span>
        {u?.email && u.email !== userLabel(u) && (
          <span className="block truncate text-[11.5px] text-fg-subtle">{u.email}</span>
        )}
      </span>
    </span>
  );
}

function Scope({ tenantId, names }: { tenantId?: string | null; names: Map<string, string> }) {
  if (!tenantId) return <span className="text-fg-muted">Deployment</span>;
  return (
    <span>
      {names.get(tenantId) ?? tenantId}{' '}
      <span className="font-mono text-[11.5px] text-fg-subtle">{tenantId}</span>
    </span>
  );
}

function GrantRoleForm({
  users,
  isOwner,
  groupsClaim,
  onDone,
}: {
  users: User[];
  isOwner: boolean;
  groupsClaim: string | null | undefined;
  onDone: () => void;
}) {
  const create = useCreateRoleBinding();
  const [kind, setKind] = useState<SubjectKind>(users.length > 0 ? 'user' : 'group');
  const [userId, setUserId] = useState('');
  const [group, setGroup] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [tenantId, setTenantId] = useState<string | undefined>();
  const tenantRole = isTenantRole(role);
  const subject = kind === 'user' ? userId : group.trim();
  const ready = Boolean(subject) && (!tenantRole || Boolean(tenantId));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    create.mutate(
      {
        subject_kind: kind,
        subject,
        role,
        ...(tenantRole && tenantId ? { tenant_id: tenantId } : {}),
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={onSubmit} aria-label="Grant a role" className="flex flex-col gap-4">
      <Field label="Grant to" required>
        {({ id }) => (
          <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as SubjectKind)}>
            <option value="user">A user</option>
            <option value="group">An identity provider group</option>
          </Select>
        )}
      </Field>
      {kind === 'user' ? (
        <Field
          label="User"
          required
          hint={
            users.length === 0
              ? 'No users yet. Users appear here after their first sign-in.'
              : 'Users appear here after their first sign-in.'
          }
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              required
              aria-describedby={describedBy}
              value={userId}
              disabled={users.length === 0}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="" disabled>
                Select a user…
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email && u.email !== userLabel(u)
                    ? `${userLabel(u)} (${u.email})`
                    : userLabel(u)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : (
        <Field
          label="Group"
          required
          hint={
            <>
              Exactly as the identity provider sends it
              {groupsClaim ? (
                <>
                  {' '}
                  in the <code className="font-mono">{groupsClaim}</code> claim
                </>
              ) : null}
              . Entra ID sends group object IDs, not names.
            </>
          }
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              required
              spellCheck={false}
              aria-describedby={describedBy}
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="acme-developers"
              className="font-mono"
            />
          )}
        </Field>
      )}
      <Field label="Role" required hint={ROLE_DESCRIPTION[role]}>
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r} disabled={r === 'owner' && !isOwner}>
                {ROLE_LABEL[r]}
                {isTenantRole(r) ? ' (one tenant)' : ' (deployment)'}
                {r === 'owner' && !isOwner ? ': only owners can grant it' : ''}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {tenantRole && (
        <Field label="Tenant" required>
          {({ id }) => <TenantSelect id={id} value={tenantId} onChange={setTenantId} required />}
        </Field>
      )}
      <FormError error={create.error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" loading={create.isPending} disabled={!ready}>
          Grant role
        </Button>
      </div>
    </form>
  );
}

/**
 * Users and roles. Owners and admins grant roles to users or identity
 * provider groups; auditors can look. Group mappings from the config file
 * are listed read-only. Every change takes effect on the next request and is
 * recorded in the audit log.
 */
export function UsersPage() {
  const perms = usePermissions();
  const canWrite = perms.can('rbac.write');
  const bindings = useQuery(roleBindingsQuery());
  const users = useQuery(usersQuery());
  const tenants = useQuery(tenantsQuery());
  const del = useDeleteRoleBinding();
  const signOutUser = useRevokeUserSessions();
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<RoleBinding | null>(null);
  const [signingOut, setSigningOut] = useState<User | null>(null);

  const userById = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u])), [users.data]);
  const names = useMemo(
    () => new Map((tenants.data ?? []).map((t) => [t.id, t.name])),
    [tenants.data],
  );

  const closeRevoke = () => {
    setRevoking(null);
    del.reset();
  };
  const closeSignOut = () => {
    setSigningOut(null);
    signOutUser.reset();
  };

  return (
    <>
      <PageHeader
        title="Users and roles"
        description="Who can do what in this console. Roles from identity provider groups and from bindings add up, and a change applies from the next request."
        actions={
          canWrite && (
            <Button
              variant="primary"
              icon={<IconPlus size={14} />}
              onClick={() => setGranting(true)}
            >
              Grant role
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader
            title="Role bindings"
            description="Roles granted here, to a user or to an identity provider group."
          />
          {bindings.isPending ? (
            <LoadingState rows={3} />
          ) : bindings.isError ? (
            <ErrorState error={bindings.error} onRetry={() => void bindings.refetch()} />
          ) : bindings.data.bindings.length === 0 ? (
            <EmptyState
              title="No role bindings"
              description={
                canWrite
                  ? 'Grant a role to a user after their first sign-in, or to a group from your identity provider.'
                  : 'No roles have been granted here yet.'
              }
            />
          ) : (
            <Table label="Role bindings">
              <THead>
                <tr>
                  <TH>Subject</TH>
                  <TH>Role</TH>
                  <TH>Scope</TH>
                  <TH>Granted by</TH>
                  <TH>Granted</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {bindings.data.bindings.map((b) => {
                  const ownerOnly = b.role === 'owner' && !perms.isOwner;
                  return (
                    <TR key={b.id}>
                      <TD className="max-w-72">
                        <Subject binding={b} users={userById} />
                      </TD>
                      <TD>
                        <RoleBadge value={b.role} />
                      </TD>
                      <TD>
                        <Scope tenantId={b.tenant_id} names={names} />
                      </TD>
                      <TD className="max-w-56 truncate text-fg-muted" title={b.created_by}>
                        {b.created_by}
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">
                        {formatDateTime(b.created_at)}
                      </TD>
                      <TD className="text-right whitespace-nowrap">
                        {canWrite &&
                          (ownerOnly ? (
                            <span className="text-[12px] text-fg-subtle">Owners only</span>
                          ) : (
                            <Button
                              size="sm"
                              variant="danger"
                              icon={<IconTrash size={14} />}
                              aria-label={`Revoke ${ROLE_LABEL[b.role]} from ${b.subject}`}
                              onClick={() => setRevoking(b)}
                            >
                              Revoke
                            </Button>
                          ))}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Group mappings from the config file"
            description={
              <>
                Set in <code className="font-mono">[[security.oidc.role_mappings]]</code> or{' '}
                <code className="font-mono">CALIBAN_OIDC_*_GROUPS</code>. Read-only here: change
                them in the deployment config.
              </>
            }
          />
          {bindings.isPending ? (
            <LoadingState rows={2} />
          ) : bindings.isError ? null : bindings.data.groups_claim == null ? (
            <EmptyState
              title="Single sign-on is not configured"
              description="Group mappings apply once the control plane has an [security.oidc] section."
            />
          ) : bindings.data.group_mappings.length === 0 ? (
            <EmptyState
              title="No group mappings"
              description={
                <>
                  Groups are read from the{' '}
                  <code className="font-mono">{bindings.data.groups_claim}</code> claim.
                </>
              }
            />
          ) : (
            <>
              <p className="border-b border-border px-4 py-2 text-[12px] text-fg-muted">
                Groups are read from the{' '}
                <code className="font-mono">{bindings.data.groups_claim}</code> claim.
              </p>
              <Table label="Group mappings">
                <THead>
                  <tr>
                    <TH>Group</TH>
                    <TH>Role</TH>
                    <TH>Scope</TH>
                  </tr>
                </THead>
                <TBody>
                  {bindings.data.group_mappings.map((m) => (
                    <TR key={`${m.group}:${m.role}:${m.tenant_id ?? ''}`}>
                      <TD className="font-mono text-[12.5px]">{m.group}</TD>
                      <TD>
                        <RoleBadge value={m.role} />
                      </TD>
                      <TD>
                        <Scope tenantId={m.tenant_id} names={names} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Users"
            description="Created on their first sign-in or first access token, keyed by issuer and subject."
          />
          {users.isPending ? (
            <LoadingState rows={3} />
          ) : users.isError ? (
            <ErrorState error={users.error} onRetry={() => void users.refetch()} />
          ) : users.data.length === 0 ? (
            <EmptyState
              title="No users yet"
              description="Users appear here after they sign in with single sign-on."
            />
          ) : (
            <Table label="Users">
              <THead>
                <tr>
                  <TH>User</TH>
                  <TH>Roles granted here</TH>
                  <TH>Last sign-in</TH>
                  <TH className="text-right">Active sessions</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {users.data.map((u) => (
                  <TR key={u.id}>
                    <TD className="max-w-72">
                      <div className="truncate font-medium">{userLabel(u)}</div>
                      <div
                        className="truncate font-mono text-[11.5px] text-fg-subtle"
                        title={`${u.issuer}#${u.subject}`}
                      >
                        {u.email && u.email !== userLabel(u) ? u.email : u.subject}
                      </div>
                    </TD>
                    <TD>
                      {u.role_bindings && u.role_bindings.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {u.role_bindings.map((b) => (
                            <RoleBadge key={b.id} value={b.role} tenantId={b.tenant_id} />
                          ))}
                        </span>
                      ) : (
                        <span className="text-fg-subtle">From groups only</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-fg-muted">
                      {u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'}
                    </TD>
                    <TD className="text-right">{u.active_sessions ?? 0}</TD>
                    <TD className="text-right whitespace-nowrap">
                      {canWrite && (u.active_sessions ?? 0) > 0 && (
                        <Button
                          size="sm"
                          icon={<IconLogout size={14} />}
                          aria-label={`Sign out ${userLabel(u)} everywhere`}
                          onClick={() => setSigningOut(u)}
                        >
                          Sign out everywhere
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <Drawer
        open={granting}
        onClose={() => setGranting(false)}
        side="center"
        title="Grant a role"
        description="Takes effect on the user's next request and is recorded in the audit log."
      >
        {granting && (
          <GrantRoleForm
            users={users.data ?? []}
            isOwner={perms.isOwner}
            groupsClaim={bindings.data?.groups_claim}
            onDone={() => setGranting(false)}
          />
        )}
      </Drawer>

      <ConfirmDialog
        open={revoking !== null}
        title="Revoke role?"
        confirmLabel="Revoke role"
        loading={del.isPending}
        error={del.error}
        onCancel={closeRevoke}
        onConfirm={() => {
          // A 404 (already revoked elsewhere) resolves too; the list refreshes either way.
          if (revoking) del.mutate(revoking.id, { onSuccess: closeRevoke });
        }}
      >
        {revoking && (
          <p>
            Revoke <span className="font-medium">{ROLE_LABEL[revoking.role]}</span>
            {revoking.tenant_id ? (
              <>
                {' '}
                on{' '}
                <span className="font-medium">
                  {names.get(revoking.tenant_id) ?? revoking.tenant_id}
                </span>
              </>
            ) : null}{' '}
            from{' '}
            <span className="font-medium">
              {revoking.subject_kind === 'group'
                ? `the group ${revoking.subject}`
                : (userById.get(revoking.subject)?.email ?? revoking.subject)}
            </span>
            ? It stops applying on the next request. Roles from other bindings or group mappings
            still apply.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={signingOut !== null}
        title="Sign out everywhere?"
        confirmLabel="Sign out everywhere"
        loading={signOutUser.isPending}
        error={signOutUser.error}
        onCancel={closeSignOut}
        onConfirm={() => {
          if (signingOut) signOutUser.mutate(signingOut.id, { onSuccess: closeSignOut });
        }}
      >
        <p>
          End every console session of{' '}
          <span className="font-medium">{signingOut ? userLabel(signingOut) : ''}</span>? They can
          sign in again unless their access is also removed at the identity provider.
        </p>
      </ConfirmDialog>
    </>
  );
}
