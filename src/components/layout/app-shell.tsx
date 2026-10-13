import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useAuthState, useAuthStateRefresh, usePermissions, useSignOut } from '@/api/auth';
import { healthQuery } from '@/api/queries';
import { useWaitingAcrossWorkspaces } from '@/lib/approvals';
import { cn } from '@/lib/cn';
import { displayName, type Principal } from '@/lib/permissions';
import { readStorage, writeStorage } from '@/lib/storage';
import { setWorkspace, useWorkspace } from '@/lib/workspace';
import { PageHelpButton } from '../help/page-help';
import { PrincipalRoles } from '../roles';
import { Button, EmptyState, Select } from '../ui';
import { IconChevronRight, IconInbox, IconLogout, LogoMark } from '../ui/icons';
import { CommandPalette } from './command-palette';
import { ADMIN_NAV, DAILY_NAV, type NavItem } from './nav';
import { MotionToggle, ThemeToggle } from './theme-toggle';

const ADMIN_OPEN_KEY = 'caliban.nav.admin';

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
        Status: <span className="text-fg">{state}</span>
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

function NavLink({ item, badge }: { item: NavItem; badge?: number }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        to={item.to}
        activeOptions={{ exact: item.to === '/' }}
        title={item.label}
        className="flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] whitespace-nowrap text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg data-[status=active]:bg-accent-soft data-[status=active]:font-medium data-[status=active]:text-fg"
      >
        <Icon width={16} height={16} className="shrink-0" />
        <span className="md:sr-only lg:not-sr-only">{item.label}</span>
        {badge ? (
          <span className="ml-auto rounded-full bg-warn px-1.5 text-[11px] leading-[18px] font-semibold text-surface tabular-nums md:absolute md:ml-0 md:translate-x-3 md:-translate-y-2 lg:static lg:ml-auto lg:translate-x-0 lg:translate-y-0">
            {badge}
            <span className="sr-only"> waiting</span>
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/**
 * Daily work first, then a collapsible Administration group (UX-02). It
 * starts open for deployment-wide roles (who install, configure or audit),
 * and closed for workspace roles; the choice is remembered per browser.
 */
function SideNav({ waiting }: { waiting: number }) {
  const perms = usePermissions();
  const visible = (n: NavItem) => !n.perm || perms.canSomewhere(n.perm);
  const daily = DAILY_NAV.filter(visible);
  const admin = ADMIN_NAV.filter(visible);
  const [adminOpen, setAdminOpen] = useState(() => {
    const stored = readStorage('local', ADMIN_OPEN_KEY);
    // Open for deployment-wide roles (owner, admin, auditor), closed for workspace roles.
    return stored === null
      ? perms.canSomewhere('catalog.write') || perms.canSomewhere('audit.read')
      : stored === '1';
  });
  const toggle = () => {
    setAdminOpen((o) => {
      writeStorage('local', ADMIN_OPEN_KEY, o ? '0' : '1');
      return !o;
    });
  };
  return (
    <nav
      aria-label="Primary"
      className="flex overflow-x-auto md:block md:flex-1 md:overflow-y-auto"
    >
      <p className="hidden px-4 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-fg-muted uppercase lg:block">
        Daily work
      </p>
      <ul className="flex gap-0.5 px-2 pb-2 md:flex-col md:pb-0">
        {daily.map((n) => (
          <NavLink key={n.to} item={n} badge={n.to === '/inbox' ? waiting : undefined} />
        ))}
      </ul>
      {admin.length > 0 && (
        <div className="flex items-start md:mt-3 md:block">
          <button
            type="button"
            aria-expanded={adminOpen}
            aria-controls="nav-admin"
            onClick={toggle}
            className="flex h-8 shrink-0 items-center gap-1.5 px-2 text-[11px] font-semibold tracking-wide whitespace-nowrap text-fg-muted uppercase hover:text-fg md:w-full md:justify-center lg:justify-start lg:px-4"
          >
            <IconChevronRight
              size={12}
              className={cn(
                'transition-transform duration-(--duration-fast)',
                adminOpen && 'rotate-90',
              )}
            />
            <span className="md:sr-only lg:not-sr-only">Administration</span>
          </button>
          {adminOpen && (
            <ul id="nav-admin" className="flex gap-0.5 px-2 pb-2 md:flex-col md:pb-0">
              {admin.map((n) => (
                <NavLink key={n.to} item={n} />
              ))}
            </ul>
          )}
        </div>
      )}
    </nav>
  );
}

/**
 * The workspace switcher (UX-03): one choice for every page, kept across
 * visits. With a single workspace it is just its name. A `?tenant=` in the
 * URL (an old deep link, or a page's own override) switches it.
 */
function WorkspaceSwitcher() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const searchTenant = useRouterState({
    select: (s) => (s.location.search as { tenant?: unknown }).tenant,
  });

  useEffect(() => {
    if (typeof searchTenant === 'string' && ws.list.some((t) => t.id === searchTenant)) {
      setWorkspace(searchTenant);
    }
  }, [searchTenant, ws.list]);

  if (ws.isPending || ws.list.length === 0) return null;
  if (ws.list.length === 1) {
    return (
      <p className="truncate text-[13px] font-medium text-fg" title="Workspace">
        <span className="sr-only">Workspace: </span>
        {ws.workspace?.name}
      </p>
    );
  }
  return (
    <label className="flex min-w-0 items-center gap-2 text-[12.5px] text-fg-muted">
      <span className="sr-only sm:not-sr-only">Workspace</span>
      <Select
        value={ws.id ?? ''}
        className="w-44 sm:w-52"
        onChange={(e) => {
          setWorkspace(e.target.value);
          // A page following a `?tenant=` link follows the switcher from now on.
          if (typeof searchTenant === 'string') {
            void navigate({
              to: '.',
              search: (prev: Record<string, unknown>) => ({ ...prev, tenant: undefined }),
              replace: true,
            } as never);
          }
        }}
      >
        {ws.list.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
    </label>
  );
}

function ApprovalsBadge({ waiting }: { waiting: number }) {
  if (!waiting) return null;
  return (
    <Link
      to="/inbox"
      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-warn-soft px-2 text-[12.5px] font-medium text-warn hover:underline"
    >
      <IconInbox size={14} />
      <span className="tabular-nums">
        {waiting} <span className="sr-only sm:not-sr-only">waiting for you</span>
      </span>
    </Link>
  );
}

export function AppShell() {
  useAuthStateRefresh();
  const auth = useAuthState();
  const perms = usePermissions();
  const { signOut, pending } = useSignOut();
  const principal = auth?.principal;
  const waiting = useWaitingAcrossWorkspaces(!perms.hasNoRole).items.length;

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
        </div>
        <SideNav waiting={waiting} />
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
          <MotionToggle />
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-12 z-10 flex h-12 items-center gap-2 border-b border-border bg-surface/95 px-4 backdrop-blur md:top-0 md:px-6 lg:px-8">
          {!perms.hasNoRole && <WorkspaceSwitcher />}
          <div className="ml-auto flex items-center gap-2">
            {!perms.hasNoRole && <ApprovalsBadge waiting={waiting} />}
            {!perms.hasNoRole && <CommandPalette />}
            <PageHelpButton />
            {/* Phones hide the sidebar footer: sign out stays reachable (UX-15). */}
            <button
              type="button"
              onClick={signOut}
              disabled={pending}
              aria-label="Sign out of Caliban"
              className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg md:hidden"
            >
              <IconLogout />
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-5 md:px-6 lg:px-8 lg:py-7">
            {perms.hasNoRole ? <NoAccess onSignOut={signOut} /> : <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
}
