import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { usePermissions } from '@/api/auth';
import { tenantsQuery, usageQuery } from '@/api/queries';
import { Attention } from '@/components/home/attention';
import { SetupChecklist } from '@/components/home/setup-checklist';
import { useSetupFacts } from '@/components/home/use-setup-facts';
import { UsageTable } from '@/components/usage-table';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatTile,
} from '@/components/ui';
import { doc } from '@/lib/docs';
import { formatCompact, formatInt, formatPercent, formatUsd } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace';

const RECENT = 15;

/**
 * Home (UX-24, UX-01): what needs attention, the setup checklist while there
 * is setup left, then the workspace's recent activity.
 */
export function OverviewPage() {
  const ws = useWorkspace();
  const perms = usePermissions();
  const facts = useSetupFacts(ws.id);
  const canUsage = perms.canSomewhere('usage.read');
  return (
    <>
      <PageHeader
        title="Home"
        description={
          ws.workspace
            ? `What needs your attention in ${ws.workspace.name}, and what is left to set up.`
            : 'What needs your attention, and what is left to set up.'
        }
      />
      <Attention workspaceId={ws.id} />
      <SetupChecklist facts={facts} workspaceId={ws.id} />
      {canUsage && <Activity workspaceId={ws.id} />}
    </>
  );
}

function Activity({ workspaceId }: { workspaceId: string | undefined }) {
  const usage = useQuery(usageQuery(workspaceId, 100));
  const tenants = useQuery(tenantsQuery());
  const names = useMemo(
    () => new Map((tenants.data ?? []).map((t) => [t.id, t.name])),
    [tenants.data],
  );
  const totals = usage.data?.totals;
  const tokens = (totals?.prompt_tokens ?? 0) + (totals?.completion_tokens ?? 0);
  const hitRate = totals?.requests ? (totals.cache_hits ?? 0) / totals.requests : null;

  return (
    <>
      <section aria-labelledby="totals-h" className="mb-6">
        <h2 id="totals-h" className="mb-2 text-[13px] font-semibold">
          Recent activity
        </h2>
        {usage.isError ? (
          <ErrorState error={usage.error} onRetry={() => void usage.refetch()} className="m-0" />
        ) : (
          <dl
            className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
            aria-busy={usage.isPending}
          >
            <StatTile
              label="Requests"
              value={usage.isPending ? '…' : formatInt(totals?.requests)}
            />
            <StatTile
              label="Tokens"
              value={usage.isPending ? '…' : formatCompact(tokens)}
              detail={
                totals
                  ? `${formatCompact(totals.prompt_tokens)} in · ${formatCompact(totals.completion_tokens)} out`
                  : undefined
              }
            />
            <StatTile
              label="Answers reused"
              value={usage.isPending ? '…' : formatInt(totals?.cache_hits)}
              detail={hitRate != null ? `${formatPercent(hitRate)} hit rate` : undefined}
            />
            <StatTile
              label="Tokens saved"
              value={usage.isPending ? '…' : formatCompact(totals?.tokens_saved)}
              detail="By reusing answers and prompts"
            />
            <StatTile
              label="Cost"
              value={usage.isPending ? '…' : formatUsd(totals?.cost_usd)}
              detail="At the providers' list prices"
            />
          </dl>
        )}
      </section>

      <Card>
        <CardHeader
          title="Recent requests"
          description={`The latest ${RECENT} model calls`}
          actions={
            <Link to="/usage" className="text-[12.5px] text-accent hover:underline">
              View all usage
            </Link>
          }
        />
        {usage.isPending ? (
          <LoadingState rows={6} />
        ) : usage.isError ? (
          <EmptyState title="No data" description="Usage could not be loaded." />
        ) : usage.data.events.length === 0 ? (
          <EmptyState
            title="No requests yet"
            description="Nothing has been sent through Caliban yet. Follow the setup steps above, or copy a snippet and run it."
            action={
              <Link to="/settings" className="font-medium text-accent hover:underline">
                Copy a snippet
              </Link>
            }
            learnMore={doc('start/gateway-quickstart', 'point-your-app')}
          />
        ) : (
          <UsageTable events={usage.data.events.slice(0, RECENT)} tenantNames={names} compact />
        )}
      </Card>
    </>
  );
}
