import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { usePermissions } from '@/api/auth';
import { tenantsQuery } from '@/api/queries';
import type { Tenant } from '@/api/types';
import { readStorage, writeStorage } from './storage';

/**
 * The workspace (tenant) the console works in, chosen once in the header and
 * kept across pages and visits (per browser). Pages read it instead of each
 * having their own tenant selector; a `?tenant=` in a deep link still wins and
 * switches the header to it, so old links keep working.
 */
const KEY = 'caliban.workspace';
const listeners = new Set<() => void>();
let current: string | null = readStorage('local', KEY);

export function getWorkspace(): string | null {
  return current;
}

export function setWorkspace(id: string | null): void {
  if (id === current) return;
  current = id;
  writeStorage('local', KEY, id);
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Tests start from a clean slate. */
export function resetWorkspaceForTests(): void {
  current = null;
  for (const l of listeners) l();
}

export function useStoredWorkspace(): string | null {
  return useSyncExternalStore(subscribe, getWorkspace, getWorkspace);
}

export interface WorkspaceState {
  /** The workspace in effect: the stored choice if the user may read it, else the first one. */
  id: string | undefined;
  workspace: Tenant | undefined;
  /** Workspaces the user can open. */
  list: Tenant[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

/** The current workspace, resolved against the workspaces the user's roles cover. */
export function useWorkspace(): WorkspaceState {
  const stored = useStoredWorkspace();
  const tenants = useQuery(tenantsQuery());
  const perms = usePermissions();
  const readable = perms.tenantsWith('tenant.read');
  const list = (tenants.data ?? []).filter((t) => readable === 'all' || readable.includes(t.id));
  const workspace = list.find((t) => t.id === stored) ?? list[0];
  return {
    id: workspace?.id ?? (tenants.isPending ? (stored ?? undefined) : undefined),
    workspace,
    list,
    isPending: tenants.isPending,
    isError: tenants.isError,
    error: tenants.error,
    refetch: () => void tenants.refetch(),
  };
}

/**
 * The workspace a tenant-scoped page shows: the page's own `?tenant=` (a deep
 * link or a cross-workspace override) when present, else the header's.
 */
export function useScopedTenant(searchTenant: string | undefined): string | undefined {
  const ws = useWorkspace();
  return searchTenant ?? ws.id;
}
