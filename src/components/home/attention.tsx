import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { usePermissions } from '@/api/auth';
import { ApiError } from '@/api/client';
import { nodeSpendQuery, runsQuery } from '@/api/queries';
import { useWaitingAcrossWorkspaces, waitedFor } from '@/lib/approvals';
import { cn } from '@/lib/cn';
import { doc } from '@/lib/docs';
import { formatUsd } from '@/lib/format';
import { LearnMore } from '../help/learn-more';
import { Card } from '../ui';

function Tile({
  title,
  tone = 'neutral',
  children,
}: {
  title: string;
  tone?: 'neutral' | 'warn' | 'ok' | 'danger';
  children: ReactNode;
}) {
  return (
    <Card
      role="region"
      aria-label={title}
      className={cn(
        'flex flex-col gap-1.5 p-4',
        tone === 'warn' && 'border-warn/60',
        tone === 'danger' && 'border-danger/60',
      )}
    >
      <h3 className="text-[12.5px] font-medium text-fg-muted">{title}</h3>
      {children}
    </Card>
  );
}

function ApprovalsTile() {
  const w = useWaitingAcrossWorkspaces();
  const n = w.items.length;
  return (
    <Tile title="Waiting for a person" tone={n ? 'warn' : 'neutral'}>
      {w.isPending ? (
        <p className="text-[13px] text-fg-muted">Checking…</p>
      ) : n === 0 ? (
        <p className="text-[13px]">Nothing waits for an approval or an answer.</p>
      ) : (
        <>
          <p className="text-[22px] font-semibold tabular-nums">{n}</p>
          <p className="text-[12.5px] text-fg-muted">
            {w.approvals} approval{w.approvals === 1 ? '' : 's'}, {w.questions} question
            {w.questions === 1 ? '' : 's'}
            {w.oldest && <>; the oldest has waited {waitedFor(w.oldest)}</>}
            {w.tenants.length > 1 && ', across your workspaces'}.
          </p>
          <Link to="/inbox" className="text-[13px] font-medium text-accent hover:underline">
            Review approvals
          </Link>
        </>
      )}
    </Tile>
  );
}

function FailedTile({ workspaceId }: { workspaceId: string }) {
  const runs = useInfiniteQuery(runsQuery(workspaceId, { status: 'failed', since: '24h' }));
  const failed = runs.data?.pages[0]?.data.length ?? 0;
  const more = Boolean(runs.data?.pages[0]?.next_cursor);
  return (
    <Tile title="Failed in the last 24 hours" tone={failed ? 'danger' : 'neutral'}>
      {runs.isPending ? (
        <p className="text-[13px] text-fg-muted">Checking…</p>
      ) : runs.isError ? (
        <p className="text-[13px] text-fg-muted">Conversations could not be read.</p>
      ) : failed === 0 ? (
        <p className="text-[13px]">No conversation failed.</p>
      ) : (
        <>
          <p className="text-[22px] font-semibold tabular-nums">
            {failed}
            {more && '+'}
          </p>
          <Link
            to="/runs"
            search={{ tenant: workspaceId, status: 'failed', since: '24h' }}
            className="text-[13px] font-medium text-accent hover:underline"
          >
            See what failed
          </Link>
        </>
      )}
    </Tile>
  );
}

/** Share of a cap used, 0 to 1, or null with no cap. */
function share(spent: number, cap: number | null | undefined): number | null {
  return cap ? Math.min(1, spent / cap) : null;
}

function Meter({
  label,
  spent,
  cap,
}: {
  label: string;
  spent: number;
  cap: number | null | undefined;
}) {
  const s = share(spent, cap);
  const tone = s == null ? 'bg-accent' : s >= 1 ? 'bg-danger' : s >= 0.8 ? 'bg-warn' : 'bg-ok';
  return (
    <div className="flex flex-col gap-1">
      <p className="flex justify-between gap-2 text-[12.5px]">
        <span className="text-fg-muted">{label}</span>
        <span className="tabular-nums">
          {formatUsd(spent)}
          {cap ? ` of ${formatUsd(cap)}` : ', no cap'}
          {s != null && ` (${Math.round(s * 100)}%)`}
        </span>
      </p>
      {s != null && (
        <div
          role="meter"
          aria-label={`${label}: spend against the cap`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(s * 100)}
          className="h-1.5 overflow-hidden rounded-full bg-surface-3"
        >
          <div
            className={cn(
              'h-full origin-left rounded-full transition-transform duration-(--duration-slow) ease-(--ease-standard)',
              tone,
            )}
            style={{ transform: `scaleX(${s})` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Spend of the workspace's assistants against its caps (UX-47), from
 * `GET .../node-spend`. Caps are enforced before every model call, so this
 * is what is spent, not an estimate.
 */
export function SpendTile({ workspaceId }: { workspaceId: string }) {
  const q = useQuery(nodeSpendQuery(workspaceId));
  const d = q.data;
  const near =
    d &&
    [share(d.month_usd, d.caps.monthly_usd), share(d.today_usd, d.caps.daily_usd)].some(
      (s) => s != null && s >= 0.8,
    );
  return (
    <Tile title="Assistant spend" tone={d?.capped ? 'danger' : near ? 'warn' : 'neutral'}>
      {q.isPending ? (
        <p className="text-[13px] text-fg-muted">Checking…</p>
      ) : q.isError ? (
        <p className="text-[13px] text-fg-muted">
          {q.error instanceof ApiError && q.error.status === 503
            ? 'Spend is not tracked on this installation.'
            : 'Spend could not be read.'}
        </p>
      ) : d ? (
        <>
          <Meter label="This month" spent={d.month_usd} cap={d.caps.monthly_usd} />
          <Meter label="Today" spent={d.today_usd} cap={d.caps.daily_usd} />
          {d.capped && (
            <p className="text-[12.5px] text-danger">
              A cap is reached: conversations stop at their next model call.
            </p>
          )}
          <p className="text-[12px] text-fg-muted">
            Enforced before every model call.{' '}
            <LearnMore doc={doc('guides/usage-and-costs', 'spend-caps')} />
          </p>
        </>
      ) : null}
    </Tile>
  );
}

/** What needs attention now: waiting approvals, failures, spend near a cap. */
export function Attention({ workspaceId }: { workspaceId: string | undefined }) {
  const perms = usePermissions();
  const can = (p: Parameters<typeof perms.can>[0]) =>
    workspaceId ? perms.can(p, workspaceId) : false;
  const tiles = [
    perms.canSomewhere('runs.read') && <ApprovalsTile key="a" />,
    workspaceId && can('runs.read') && <FailedTile key="f" workspaceId={workspaceId} />,
    workspaceId && can('usage.read') && <SpendTile key="s" workspaceId={workspaceId} />,
  ].filter(Boolean);
  if (tiles.length === 0) return null;
  return (
    <section aria-labelledby="attention-h" className="mb-6">
      <h2 id="attention-h" className="mb-2 text-[13px] font-semibold">
        Needs your attention
      </h2>
      <div className="grid gap-3 md:grid-cols-3">{tiles}</div>
    </section>
  );
}
