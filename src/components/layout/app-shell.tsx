import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import type { ComponentType, SVGProps } from 'react';
import { healthQuery } from '@/api/queries';
import { clearToken } from '@/lib/auth';
import { cn } from '@/lib/cn';
import {
  IconDatasources,
  IconLogout,
  IconModels,
  IconNodes,
  IconOntology,
  IconOverview,
  IconSettings,
  IconTenants,
  IconUsage,
  LogoMark,
} from '../ui/icons';
import { ThemeToggle } from './theme-toggle';

type NavTo =
  '/' | '/tenants' | '/models' | '/datasources' | '/ontology' | '/nodes' | '/usage' | '/settings';

const NAV: Array<{ to: NavTo; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }> = [
  { to: '/', label: 'Overview', icon: IconOverview },
  { to: '/tenants', label: 'Tenants', icon: IconTenants },
  { to: '/models', label: 'Models', icon: IconModels },
  { to: '/datasources', label: 'Datasources', icon: IconDatasources },
  { to: '/ontology', label: 'Ontology', icon: IconOntology },
  { to: '/nodes', label: 'Nodes', icon: IconNodes },
  { to: '/usage', label: 'Usage', icon: IconUsage },
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

export function AppShell() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const signOut = () => {
    clearToken();
    qc.clear();
    void navigate({ to: '/login' });
  };

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
            {NAV.map(({ to, label, icon: Icon }) => (
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
          <ThemeToggle />
          <button
            type="button"
            onClick={signOut}
            title="Sign out"
            className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            <IconLogout />
            <span className="md:sr-only lg:not-sr-only">Sign out</span>
          </button>
        </div>
      </aside>

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-5 md:px-6 lg:px-8 lg:py-7">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
