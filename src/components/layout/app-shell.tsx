import { useQuery } from '@tanstack/react-query';
import { Link, Outlet } from '@tanstack/react-router';
import type { ComponentType, SVGProps } from 'react';
import { useAuthState, useAuthStateRefresh, usePermissions, useSignOut } from '@/api/auth';
import { healthQuery } from '@/api/queries';
import type { Permission } from '@/api/types';
import { cn } from '@/lib/cn';
import { displayName, type Principal } from '@/lib/permissions';
import { PrincipalRoles } from '../roles';
import { Button, EmptyState } from '../ui';
import {
  IconAudit,
  IconDatasources,
  IconInbox,
  IconLogout,
  IconModels,
  IconNodes,
  IconOntology,
  IconOverview,
  IconRuns,
  IconSettings,
  IconTenants,
  IconTools,
  IconUsage,
  IconUsers,
  LogoMark,
} from '../ui/icons';
import { ThemeToggle } from './theme-toggle';

type NavTo =
  | '/'
  | '/tenants'
  | '/models'
  | '/datasources'
  | '/ontology'
  | '/nodes'
  | '/runs'
  | '/inbox'
  | '/tools'
  | '/usage'
  | '/audit'
  | '/users'
  | '/settings';

/**
 * `perm`: shown to users who hold it deployment-wide or on some tenant. The
 * control plane still checks every request; this only keeps the menu to
 * pages the user can open.
 */
const NAV: Array<{
  to: NavTo;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  perm?: Permission;
}> = [
  { to: '/', label: 'Overview', icon: IconOverview, perm: 'usage.read' },
  { to: '/tenants', label: 'Tenants', icon: IconTenants, perm: 'tenant.read' },
  { to: '/models', label: 'Models', icon: IconModels, perm: 'catalog.read' },
  { to: '/datasources', label: 'Datasources', icon: IconDatasources, perm: 'datasources.read' },
  { to: '/ontology', label: 'Ontology', icon: IconOntology, perm: 'ontology.read' },
  { to: '/nodes', label: 'Nodes', icon: IconNodes, perm: 'nodes.read' },
  { to: '/runs', label: 'Runs', icon: IconRuns, perm: 'runs.read' },
  { to: '/inbox', label: 'Inbox', icon: IconInbox, perm: 'runs.read' },
  { to: '/tools', label: 'Tools', icon: IconTools, perm: 'tools.read' },
  { to: '/usage', label: 'Usage', icon: IconUsage, perm: 'usage.read' },
  { to: '/audit', label: 'Audit', icon: IconAudit, perm: 'audit.read' },
  { to: '/users', label: 'Users and roles', icon: IconUsers, perm: 'rbac.read' },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

function HealthPill() {
  const { data, isError, isPending } = useQuery(healthQuery());
  const state = isPending ? 'checking' : isError ? 'unreachable' : data.status;
  const tone =
    state === 'ok'
      ? 'bg-ok'
      : state === 'degraded'
        ? 'bg-warn'
        : state === 'checking'
          ? 'bg-fg-subtle'
          : 'bg-danger';
  return (
    <div
      className="flex items-center gap-2 px-2 text-[12px] text-fg-muted"
      title={data ? `Caliban ${data.version} · ${data.mode}` : undefined}
    >
      <span className={cn('size-2 shrink-0 rounded-full', tone)} aria-hidden="true" />
      <span className="truncate">
        Control plane: <span className="text-fg">{state}</span>
        {data && <span className="text-fg-subtle"> · v{data.version}</span>}
      </span>
    </div>
  );
}

/** Who is signed in, and their roles. */
function SignedInAs({ principal, ssoEnabled }: { principal: Principal; ssoEnabled: boolean }) {
  const name = displayName(principal);
  const email = principal.me?.user?.email;
  return (
    <section aria-label="Signed in as" className="flex flex-col gap-1 px-2 py-1.5">
      <p className="truncate text-[12.5px] font-medium text-fg" title={principal.me?.actor}>
        {name}
      </p>
      {email && email !== name && (
        <p className="-mt-1 truncate text-[11.5px] text-fg-subtle">{email}</p>
      )}
      <PrincipalRoles principal={principal} ssoEnabled={ssoEnabled} />
    </section>
  );
}

/** Signed in through single sign-on, but no role grants anything yet. */
function NoAccess({ onSignOut }: { onSignOut: () => void }) {
  return (
    <EmptyState
      className="py-20"
      title="You are signed in, but have no role yet"
      description="An owner or admin of this deployment can grant you a role, directly or through a group in your identity provider. Reload the page once they have."
      action={<Button onClick={onSignOut}>Sign out</Button>}
    />
  );
}

export function AppShell() {
  useAuthStateRefresh();
  const auth = useAuthState();
  const perms = usePermissions();
  const { signOut, pending } = useSignOut();
  const principal = auth?.principal;
  const nav = NAV.filter((n) => !n.perm || perms.canSomewhere(n.perm));

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-panel"
        onClick={(e) => {
          // Hash routing owns the URL fragment; move focus without navigating.
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>

      {/* Sidebar: full width ≥lg, icon rail on tablets (md), top bar on phones. */}
      <aside className="sticky top-0 z-20 flex shrink-0 flex-col border-b border-border bg-surface md:h-dvh md:w-14 md:border-r md:border-b-0 lg:w-56">
        <div className="flex h-12 items-center gap-2.5 px-3.5 md:h-14">
          <LogoMark />
          <span className="text-[14px] font-semibold tracking-tight md:hidden lg:inline">
            Caliban
          </span>
          <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10.5px] font-medium text-fg-muted md:hidden lg:inline">
            admin
          </span>
        </div>
        <nav aria-label="Primary" className="overflow-x-auto md:flex-1 md:overflow-y-auto">
          <ul className="flex gap-0.5 px-2 pb-2 md:flex-col md:pb-0">
            {nav.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <Link
                  to={to}
                  activeOptions={{ exact: to === '/' }}
                  title={label}
                  className="flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] whitespace-nowrap text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg data-[status=active]:bg-accent-soft data-[status=active]:font-medium data-[status=active]:text-fg"
                >
                  <Icon width={16} height={16} className="shrink-0" />
                  <span className="md:sr-only lg:not-sr-only">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden flex-col gap-1 border-t border-border p-2 md:flex">
          <div className="hidden lg:block">
            <HealthPill />
          </div>
          {principal && (
            <div className="hidden lg:block">
              <SignedInAs principal={principal} ssoEnabled={auth?.config.sso_enabled ?? false} />
            </div>
          )}
          <ThemeToggle />
          <button
            type="button"
            onClick={signOut}
            disabled={pending}
            title={principal ? `Sign out ${displayName(principal)}` : 'Sign out'}
            className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            <IconLogout />
            <span className="md:sr-only lg:not-sr-only">Sign out</span>
          </button>
        </div>
      </aside>

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-5 md:px-6 lg:px-8 lg:py-7">
          {perms.hasNoRole ? <NoAccess onSignOut={signOut} /> : <Outlet />}
        </div>
      </main>
    </div>
  );
}
