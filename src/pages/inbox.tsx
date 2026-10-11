import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { usePermissions } from '@/api/auth';
import { inboxQuery, tenantsQuery } from '@/api/queries';
import type { InboxItem } from '@/api/types';
import { ApprovalDetails, HumanStepActions } from '@/components/runs/human-step';
import { TenantSelect } from '@/components/tenant-select';
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

const route = getRouteApi('/_app/inbox');

function InboxCard({
  tenantId,
  item,
  contentVisible,
  onAnswered,
}: {
  tenantId: string;
  item: InboxItem;
  contentVisible: boolean;
  onAnswered: (message: string) => void;
}) {
  const approval = item.kind === 'approval';
  return (
    <li>
      <Card className={approval ? 'border-warn/50' : undefined}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]">
            <Badge tone={approval ? 'warn' : 'info'} dot>
              {approval ? 'Approve a tainted call' : 'Question'}
            </Badge>
            <Link
              to="/nodes/$tenantId/$nodeName"
              params={{ tenantId, nodeName: item.node }}
              className="font-mono font-medium hover:underline"
            >
              {item.node}
            </Link>
            <Badge>v{item.version}</Badge>
            <span className="text-fg-muted">
              step <code className="font-mono text-[12px]">{item.step}</code>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[12px] text-fg-muted">
            <span>Waiting since {formatDateTime(item.waiting_since)}</span>
            {item.expires_at && <span>Times out {formatDateTime(item.expires_at)}</span>}
            <Link
              to="/runs/$tenantId/$runId"
              params={{ tenantId, runId: item.run_id }}
              className="font-mono text-accent hover:underline"
              aria-label={`Open run ${item.run_id}`}
            >
              {item.run_id}
            </Link>
          </div>
        </div>
        <div className="flex flex-col gap-3 p-4">
          {approval ? (
            <ApprovalDetails
              approval={item.approval}
              question={item.question}
              contentVisible={contentVisible}
            />
          ) : contentVisible ? (
            <p className="text-[13px] break-words whitespace-pre-wrap">
              {item.question ?? 'The run asks for input without a question.'}
            </p>
          ) : null}
          {item.invoker && (
            <p className="text-[12px] text-fg-subtle">
              Started by <span className="font-mono">{item.invoker}</span>
            </p>
          )}
          <HumanStepActions
            tenantId={tenantId}
            runId={item.run_id}
            step={item.step}
            kind={item.kind}
            approval={item.approval}
            question={item.question}
            contentVisible={contentVisible}
            onAnswered={onAnswered}
          />
        </div>
      </Card>
    </li>
  );
}

export function InboxPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const perms = usePermissions();
  const tenants = useQuery(tenantsQuery());
  const readable = perms.tenantsWith('runs.read');
  const firstReadable = tenants.data?.find(
    (t) => readable === 'all' || readable.includes(t.id),
  )?.id;
  const tenantId = search.tenant ?? firstReadable;
  const inbox = useQuery({ ...inboxQuery(tenantId ?? ''), enabled: Boolean(tenantId) });
  const [done, setDone] = useState<string | null>(null);

  const items = inbox.data?.data ?? [];
  const approvals = items.filter((i) => i.kind === 'approval').length;

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Node runs waiting for a human: questions, and writes (or reads that reach the network) whose arguments carry untrusted data. Your answer or decision is recorded under your name in the audit log."
      />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
          <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            Tenant
            <TenantSelect
              value={tenantId}
              permission="runs.read"
              className="w-52"
              onChange={(t) => {
                setDone(null);
                void navigate({ search: { tenant: t }, replace: true });
              }}
            />
          </label>
          {inbox.data && (
            <p className="text-[12px] text-fg-muted" aria-live="polite">
              {items.length} waiting · {approvals} approval{approvals === 1 ? '' : 's'}
            </p>
          )}
          <p role="status" className="ml-auto text-[12.5px] text-ok">
            {done ?? ''}
          </p>
        </div>
      </Card>
      {!tenantId ? (
        <Card>
          {tenants.isPending ? (
            <LoadingState rows={2} />
          ) : tenants.isError ? (
            <ErrorState error={tenants.error} onRetry={() => void tenants.refetch()} />
          ) : (
            <EmptyState
              title="No tenant to show"
              description="Runs are kept per tenant. Your roles do not cover a tenant with runs yet."
            />
          )}
        </Card>
      ) : inbox.isPending ? (
        <Card>
          <LoadingState rows={3} />
        </Card>
      ) : inbox.isError ? (
        <Card>
          <ErrorState error={inbox.error} onRetry={() => void inbox.refetch()} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing waiting"
            description="Runs that ask a question, or want to call a write tool (or a read that reaches the network) with arguments derived from untrusted data, wait here until someone answers."
          />
        </Card>
      ) : (
        <ul aria-label="Waiting runs" className="flex flex-col gap-3">
          {items.map((item) => (
            <InboxCard
              key={`${item.run_id}:${item.step}`}
              tenantId={tenantId}
              item={item}
              contentVisible={inbox.data.content_visible}
              onAnswered={setDone}
            />
          ))}
        </ul>
      )}
    </>
  );
}
