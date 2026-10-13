import { useQueries, useQuery } from '@tanstack/react-query';
import { usePermissions } from '@/api/auth';
import { inboxQuery, tenantsQuery } from '@/api/queries';
import type { InboxItem, Tenant } from '@/api/types';

/** At most this many workspaces are polled for the header badge. */
export const MAX_POLLED_WORKSPACES = 25;

export interface WaitingItem {
  tenant: Tenant;
  item: InboxItem;
  contentVisible: boolean;
}

export interface WaitingAcrossWorkspaces {
  /** Everything waiting, oldest wait first. */
  items: WaitingItem[];
  approvals: number;
  questions: number;
  /** The oldest wait, ISO time. */
  oldest: string | undefined;
  /** Workspaces whose inbox could not be read. */
  failed: Tenant[];
  isPending: boolean;
  tenants: Tenant[];
}

/**
 * What waits for a person in every workspace the user may read runs of, for
 * the header badge, Home and the Approvals page (UX-03, UX-04: a support lead
 * must not see "Nothing waiting" while refunds wait in another workspace).
 * Each inbox is polled (INBOX_POLL_MS).
 */
export function useWaitingAcrossWorkspaces(enabled = true): WaitingAcrossWorkspaces {
  const perms = usePermissions();
  const can = perms.canSomewhere('runs.read');
  const tenants = useQuery({ ...tenantsQuery(), enabled: enabled && can });
  const readable = perms.tenantsWith('runs.read');
  const list = (tenants.data ?? [])
    .filter((t) => readable === 'all' || readable.includes(t.id))
    .slice(0, MAX_POLLED_WORKSPACES);
  const results = useQueries({
    queries: list.map((t) => ({ ...inboxQuery(t.id), enabled: enabled && can })),
  });
  const items: WaitingItem[] = [];
  const failed: Tenant[] = [];
  results.forEach((r, i) => {
    const tenant = list[i]!;
    if (r.isError) failed.push(tenant);
    for (const item of r.data?.data ?? []) {
      items.push({ tenant, item, contentVisible: r.data?.content_visible ?? false });
    }
  });
  items.sort((a, b) => a.item.waiting_since.localeCompare(b.item.waiting_since));
  const approvals = items.filter((i) => i.item.kind === 'approval').length;
  return {
    items,
    approvals,
    questions: items.length - approvals,
    oldest: items[0]?.item.waiting_since,
    failed,
    isPending: can && (tenants.isPending || results.some((r) => r.isPending)),
    tenants: list,
  };
}

/** "14 min", "3 h", "2 days": how long something has waited, for people. */
export function waitedFor(since: string, now: number = Date.now()): string {
  const ms = Math.max(0, now - Date.parse(since));
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'less than a minute';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} days`;
}
