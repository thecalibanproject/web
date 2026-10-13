import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { tenantsQuery } from '@/api/queries';
import { EmptyState, LoadingState } from '../ui';
import { formatDateTime } from '@/lib/format';

/**
 * Shown instead of an error when a tenant-scoped request comes back 404.
 * The API answers 404 both for a deleted tenant and for an id that never
 * existed, so the tombstone list (`include_deleted=true`) tells them apart.
 */
export function TenantDeletedState({
  tenantId,
  action,
  className,
}: {
  tenantId: string;
  action?: ReactNode;
  className?: string;
}) {
  const all = useQuery(tenantsQuery(true));
  const tenant = all.data?.find((t) => t.id === tenantId);

  if (all.isPending) return <LoadingState rows={2} label="Checking the workspace…" />;

  if (all.isSuccess && !tenant) {
    return (
      <EmptyState
        className={className}
        title="Workspace not found"
        description={
          <>
            No workspace has the id <code className="font-mono">{tenantId}</code>.
          </>
        }
        action={action}
      />
    );
  }

  return (
    <EmptyState
      className={className}
      title="This workspace was deleted"
      description={
        <>
          <span className="font-medium text-fg">{tenant?.name ?? tenantId}</span> was deleted
          {tenant?.deleted_at ? ` on ${formatDateTime(tenant.deleted_at)}` : ''}. Its app keys were
          revoked and its provider accounts, routing, data connections and assistants were removed.
          The audit log is kept.
        </>
      }
      action={action}
    />
  );
}
