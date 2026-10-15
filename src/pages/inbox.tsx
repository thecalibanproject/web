import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { runQuery } from '@/api/queries';
import { LearnMore } from '@/components/help/learn-more';
import {
  ApprovalDetails,
  CustomerMessage,
  HumanStepActions,
  type HumanDecision,
  type HumanIntent,
} from '@/components/runs/human-step';
import {
  Badge,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/ui';
import { actionName } from '@/lib/approvalArgs';
import { useWaitingAcrossWorkspaces, waitedFor, type WaitingItem } from '@/lib/approvals';
import { doc } from '@/lib/docs';
import { formatDateTime } from '@/lib/format';
import { startedBy } from '@/lib/runs';
import { useWorkspace } from '@/lib/workspace';

const route = getRouteApi('/_app/inbox');

interface Decided {
  key: string;
  tenantId: string;
  runId: string;
  text: string;
  decision: HumanDecision;
  at: string;
}

const keyOf = (w: WaitingItem) => `${w.tenant.id}:${w.item.run_id}:${w.item.step}`;

function WaitingCard({
  w,
  showWorkspace,
  intent,
  onIntent,
  onAnswered,
}: {
  w: WaitingItem;
  showWorkspace: boolean;
  intent: HumanIntent;
  onIntent: (i: HumanIntent) => void;
  onAnswered: (message: string, decision: HumanDecision) => void;
}) {
  const { tenant, item, contentVisible } = w;
  const approval = item.kind === 'approval';
  // The conversation, to show the customer's message and check each detail against it.
  const run = useQuery({ ...runQuery(tenant.id, item.run_id), enabled: contentVisible });
  const title = approval
    ? `Needs your approval: ${actionName(item.approval)}`
    : 'The assistant asks a question';
  return (
    <Card
      className={
        approval
          ? 'flight-approval border-l-4 border-l-warn'
          : 'flight-question border-l-4 border-l-accent'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]">
          <Badge tone={approval ? 'warn' : 'info'} dot>
            {approval ? 'Approval' : 'Question'}
          </Badge>
          <h2 className="font-medium">{title}</h2>
        </div>
        <Link
          to="/runs/$tenantId/$runId"
          params={{ tenantId: tenant.id, runId: item.run_id }}
          className="text-[12.5px] text-accent hover:underline"
          aria-label={`Open conversation ${item.run_id}`}
        >
          Open the conversation
        </Link>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-fg-muted">
          <span>
            Assistant{' '}
            <Link
              to="/nodes/$tenantId/$nodeName"
              params={{ tenantId: tenant.id, nodeName: item.node }}
              className="font-medium text-fg hover:underline"
            >
              {item.node}
            </Link>{' '}
            (version {item.version})
          </span>
          {showWorkspace && <span>Workspace {tenant.name}</span>}
          <span title={item.invoker}>Started by {startedBy(item.invoker)}</span>
          <span title={formatDateTime(item.waiting_since)}>
            Waiting for {waitedFor(item.waiting_since)}
          </span>
          {item.expires_at && (
            <span>Times out {formatDateTime(item.expires_at)} if nobody answers</span>
          )}
        </p>
        {contentVisible && run.data && <CustomerMessage input={run.data.input} />}
        {approval ? (
          <ApprovalDetails
            approval={item.approval}
            question={item.question}
            contentVisible={contentVisible}
            run={run.data}
            step={item.step}
          />
        ) : contentVisible ? (
          <p dir="auto" className="text-[13px] break-words whitespace-pre-wrap">
            {item.question ?? 'The assistant asks for input without a question.'}
          </p>
        ) : null}
        <HumanStepActions
          tenantId={tenant.id}
          runId={item.run_id}
          step={item.step}
          kind={item.kind}
          approval={item.approval}
          question={item.question}
          contentVisible={contentVisible}
          run={run.data}
          intent={intent}
          onIntentChange={onIntent}
          onAnswered={onAnswered}
        />
      </div>
    </Card>
  );
}

const TEXT_ENTRY = /^(INPUT|TEXTAREA|SELECT)$/;

export function InboxPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const ws = useWorkspace();
  const waiting = useWaitingAcrossWorkspaces();
  const [onlyHere, setOnlyHere] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [decided, setDecided] = useState<Decided[]>([]);
  const [intent, setIntent] = useState<{ key: string; intent: HumanIntent } | null>(null);
  const cards = useRef<Array<HTMLLIElement | null>>([]);

  // A ?tenant= deep link keeps working as a filter on that workspace.
  const only = search.tenant ?? (onlyHere ? ws.id : undefined);
  const onlyName = ws.list.find((t) => t.id === (search.tenant ?? ws.id))?.name;
  const items = waiting.items.filter((w) => !only || w.tenant.id === only);
  const approvals = items.filter((w) => w.item.kind === 'approval').length;
  const severalWorkspaces = waiting.tenants.length > 1;

  // J or K outside the cards (just arrived, or after a click on the page)
  // starts the review on the first card, as the "Keys" hint promises. Keys
  // typed in a field or a dialog are left alone; inside the list, the list's
  // own handler has already acted (and prevented the default).
  const count = items.length;
  useEffect(() => {
    const start = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || count === 0) return;
      if (e.key.toLowerCase() !== 'j' && e.key.toLowerCase() !== 'k') return;
      const active = document.activeElement as HTMLElement | null;
      if (active && (TEXT_ENTRY.test(active.tagName) || active.isContentEditable)) return;
      if (active?.closest('dialog')) return;
      e.preventDefault();
      cards.current[0]?.focus();
    };
    document.addEventListener('keydown', start);
    return () => document.removeEventListener('keydown', start);
  }, [count]);

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const target = e.target as HTMLElement;
    if (TEXT_ENTRY.test(target.tagName) || e.altKey || e.ctrlKey || e.metaKey) return;
    const at = cards.current.findIndex((c) => c?.contains(target));
    if (at < 0) return;
    const key = e.key.toLowerCase();
    const move = (to: number) => {
      cards.current[Math.max(0, Math.min(items.length - 1, to))]?.focus();
    };
    const current = items[at];
    if (key === 'j' || e.key === 'ArrowDown') move(at + 1);
    else if (key === 'k' || e.key === 'ArrowUp') move(at - 1);
    else if ((key === 'a' || key === 'r') && current?.item.kind === 'approval') {
      setIntent({ key: keyOf(current), intent: key === 'a' ? 'approve' : 'reject' });
    } else return;
    e.preventDefault();
  };

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Conversations wait here when an assistant asks a question, or wants to take an action that needs a person. Your decision is recorded under your name."
        actions={<LearnMore doc={doc('guides/approvals', 'approve-or-reject')} />}
      />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          {severalWorkspaces &&
            (search.tenant ? (
              <p className="text-[12.5px]">
                Only {onlyName ?? search.tenant}.{' '}
                <button
                  type="button"
                  className="text-accent hover:underline"
                  onClick={() => void navigate({ search: {}, replace: true })}
                >
                  Show every workspace
                </button>
              </p>
            ) : (
              <Checkbox
                label={`Only ${onlyName ?? 'this workspace'}`}
                checked={onlyHere}
                onChange={(e) => setOnlyHere(e.target.checked)}
              />
            ))}
          {!waiting.isPending && (
            <p className="text-[12px] text-fg-muted" aria-live="polite">
              {items.length} waiting, {approvals} approval{approvals === 1 ? '' : 's'}
              {!only && severalWorkspaces ? ' across your workspaces' : ''}
            </p>
          )}
          {/* Phones have no keyboard: the hint shows from the sm breakpoint. */}
          <p className="hidden text-[12px] text-fg-muted sm:block">
            Keys: <kbd className="font-mono">J</kbd> and <kbd className="font-mono">K</kbd> move,{' '}
            <kbd className="font-mono">A</kbd> approves, <kbd className="font-mono">R</kbd> rejects
          </p>
          <p role="status" className="ml-auto text-[12.5px] text-ok">
            {done ?? ''}
          </p>
        </div>
      </Card>
      {waiting.failed.length > 0 && (
        <ErrorState
          className="mx-0 mt-0 mb-4"
          title="Some workspaces could not be read"
          error={new Error(waiting.failed.map((t) => t.name).join(', '))}
        />
      )}
      {waiting.isPending ? (
        <Card>
          <LoadingState rows={3} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing is waiting for you"
            description="When an assistant asks a question or wants to take an action that needs a person, it appears here."
            action={
              <Link to="/runs" className="text-accent hover:underline">
                See recent conversations
              </Link>
            }
            learnMore={doc('guides/approvals', 'what-needs-approval')}
          />
        </Card>
      ) : (
        // Arrow keys and J/K move between the focusable cards; A and R act on the one in focus.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <ul aria-label="Waiting for you" className="flex flex-col gap-3" onKeyDown={onKeyDown}>
          {items.map((w, i) => {
            const k = keyOf(w);
            return (
              <li
                key={k}
                ref={(el) => {
                  cards.current[i] = el;
                }}
                // A card is a stop in the keyboard review queue.
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
                aria-label={
                  w.item.kind === 'approval'
                    ? `Approval: ${actionName(w.item.approval)}, conversation ${w.item.run_id}`
                    : `Question, conversation ${w.item.run_id}`
                }
                className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <WaitingCard
                  w={w}
                  showWorkspace={severalWorkspaces}
                  intent={intent?.key === k ? intent.intent : null}
                  onIntent={(next) => setIntent(next ? { key: k, intent: next } : null)}
                  onAnswered={(message, decision) => {
                    setDone(message);
                    setIntent(null);
                    setDecided((d) => [
                      {
                        key: k,
                        tenantId: w.tenant.id,
                        runId: w.item.run_id,
                        text: message,
                        decision,
                        at: new Date().toISOString(),
                      },
                      ...d,
                    ]);
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
      {decided.length > 0 && (
        <section aria-labelledby="decided-h" className="mt-6">
          <h2 id="decided-h" className="mb-2 text-[13px] font-semibold">
            Decided here
          </h2>
          <Card>
            <ul className="divide-y divide-border text-[12.5px]">
              {decided.map((d) => (
                <li
                  key={`${d.key}:${d.at}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-2"
                >
                  <Badge tone={d.decision === 'rejected' ? 'danger' : 'ok'}>
                    {d.decision === 'approved'
                      ? 'Approved'
                      : d.decision === 'rejected'
                        ? 'Rejected'
                        : 'Answered'}
                  </Badge>
                  <span className="min-w-0 flex-1">{d.text}</span>
                  <span className="text-fg-muted">{formatDateTime(d.at)}</span>
                  <Link
                    to="/runs/$tenantId/$runId"
                    params={{ tenantId: d.tenantId, runId: d.runId }}
                    className="text-accent hover:underline"
                  >
                    See the outcome
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </>
  );
}
