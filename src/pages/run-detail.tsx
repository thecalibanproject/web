import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { Fragment, useState, type ReactNode } from 'react';
import { usePermissions } from '@/api/auth';
import { ApiError } from '@/api/client';
import { inboxQuery, runQuery, tenantsQuery, useCancelRun } from '@/api/queries';
import type { AnswerCheck, ConsoleRun } from '@/api/types';
import { Advanced } from '@/components/help/advanced';
import { ApprovalDetails, HumanStepActions } from '@/components/runs/human-step';
import { RunStatusBadge, TaintLabels } from '@/components/runs/run-badges';
import { SaveAsTest } from '@/components/runs/save-as-test';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CodeBlock,
  ConfirmDialog,
  CopyButton,
  EmptyState,
  ErrorState,
  GatedButton,
  LoadingState,
  PageHeader,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import { argRows } from '@/lib/approvalArgs';
import { waitedFor } from '@/lib/approvals';
import { doc } from '@/lib/docs';
import { isNotFound } from '@/lib/errors';
import { EMPTY, formatDateTime, formatInt, formatMs, formatUsd } from '@/lib/format';
import { shortHash } from '@/lib/nodes';
import { deniedReason } from '@/lib/permissions';
import {
  ANSWER_ACTION_LABEL,
  ANSWER_ACTION_TONE,
  ANSWER_RULE_LABEL,
  budgetRows,
  elapsedMs,
  isRunActive,
  prettyJson,
  startedBy,
  STEP_KIND_LABEL,
  testRunOf,
  timeline,
  type BudgetRow,
} from '@/lib/runs';

const route = getRouteApi('/_app/runs/$tenantId/$runId');

const CONTENT_HIDDEN =
  'The content of this conversation (what was asked, the answer, what each step returned) is hidden: your role sees what happened, not what was said (needs runs.data).';

function amount(row: BudgetRow, v: number | null): string {
  if (v == null) return EMPTY;
  if (row.unit === 'usd') return formatUsd(v);
  if (row.unit === 'ms') return formatMs(v);
  return formatInt(v);
}

function Details({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-fg-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Summary({ run }: { run: ConsoleRun }) {
  const ms = elapsedMs(run.started_at ?? run.created_at, run.finished_at);
  const usage = run.usage;
  const test = testRunOf(run.origin);
  const waitingSince = run.status === 'input_required' ? lastStepEnd(run) : null;
  const rows: Array<[string, ReactNode]> = [
    [
      'Started by',
      <span key="i" title={run.invoker}>
        {startedBy(run.invoker, run.origin)}
        {test?.caseId && <span className="text-fg-muted"> (test case {test.caseId})</span>}
      </span>,
    ],
    [
      'Untrusted input',
      <TaintLabels
        key="l"
        labels={run.input_labels ?? []}
        empty="none: the app marked no input as untrusted"
      />,
    ],
    ['Created', formatDateTime(run.created_at)],
    ['Started', formatDateTime(run.started_at)],
    run.finished_at
      ? ['Finished', formatDateTime(run.finished_at)]
      : waitingSince
        ? [
            'Waiting',
            `For a person since ${formatDateTime(waitingSince)} (${waitedFor(waitingSince)})`,
          ]
        : ['Finished', isRunActive(run.status) ? 'Still going' : EMPTY],
    ['Duration', ms != null ? formatMs(ms) : run.finished_at ? EMPTY : 'Still going'],
    ['Billed', formatUsd(run.cost_usd)],
    [
      'Model cost',
      <span
        key="m"
        title="The real cost of the models its calls were routed to. It differs from what is billed only for conversations billed at the flat price of automatic routing (caliban/auto)."
      >
        {formatUsd(run.model_cost_usd)}
      </span>,
    ],
    [
      'Tokens',
      usage
        ? `${formatInt(usage.total_tokens)} (${formatInt(usage.prompt_tokens)} prompt, ${formatInt(usage.completion_tokens)} completion)`
        : EMPTY,
    ],
    [
      'Personal data',
      usage?.pii_entities != null
        ? `${formatInt(usage.pii_entities)} entit${usage.pii_entities === 1 ? 'y' : 'ies'} protected in its model calls`
        : EMPTY,
    ],
  ];
  if (run.error)
    rows.push([
      'Error',
      <span key="e" className="text-danger">
        {run.error}
      </span>,
    ]);
  if (run.stop_reason) rows.push(['Stop reason', run.stop_reason]);
  if (run.partial) rows.push(['Answer', 'Partial: the conversation ran out of budget']);
  if (run.cancelled_by) rows.push(['Cancelled by', run.cancelled_by]);
  if (run.cancel_requested) rows.push(['Cancel', 'Requested: the run stops at its next step']);
  const technical: Array<[string, ReactNode]> = [
    [
      'Conversation id',
      <code key="id" className="font-mono text-[12px]">
        {run.id}
      </code>,
    ],
    [
      'Invoker',
      <code key="inv" className="font-mono text-[12px]">
        {run.invoker ?? EMPTY}
      </code>,
    ],
    ...(run.origin
      ? [
          [
            'Origin',
            <code key="o" className="font-mono text-[12px]">
              {run.origin}
            </code>,
          ] as [string, ReactNode],
        ]
      : []),
    [
      'Version fingerprint',
      run.hash ? (
        <span key="h" className="inline-flex items-center gap-1">
          <code className="font-mono text-[12px]" title={run.hash}>
            {shortHash(run.hash)}
          </code>
          <CopyButton value={run.hash} label="Copy hash" compact />
        </span>
      ) : (
        EMPTY
      ),
    ],
    ...(run.claims != null && run.claims > 1
      ? [
          ['Claims', `${run.claims} (taken over or resumed by another worker)`] as [
            string,
            ReactNode,
          ],
        ]
      : []),
  ];
  const budget = budgetRows(run.budget);
  return (
    <div className="mb-4 grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Summary" />
        <div className="flex flex-col gap-3 p-4">
          <Details rows={rows} />
          <Advanced title="Technical details">
            <Details rows={technical} />
          </Advanced>
        </div>
      </Card>
      <Card>
        <CardHeader title="Budget" description="What the conversation used against its limits." />
        {budget.length === 0 ? (
          <EmptyState title="No budget recorded" />
        ) : (
          <Table label="Budget">
            <THead>
              <tr>
                <TH>Budget</TH>
                <TH className="text-right">Used</TH>
                <TH className="text-right">Limit</TH>
              </tr>
            </THead>
            <TBody>
              {budget.map((b) => (
                <TR key={b.label}>
                  <TD>{b.label}</TD>
                  <TD className="text-right tabular-nums">{amount(b, b.used)}</TD>
                  <TD className="text-right text-fg-muted tabular-nums">{amount(b, b.limit)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Steps({ run }: { run: ConsoleRun }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { steps, spanMs } = timeline(run.steps);
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Card className="mb-4">
      <CardHeader
        title="How it got there"
        description={`Each step: model calls, lookups, tool calls and approvals, in order. ${steps.length} step${steps.length === 1 ? '' : 's'} over ${formatMs(spanMs)}.`}
      />
      {steps.length === 0 ? (
        <EmptyState
          title="No steps yet"
          description="The conversation has not finished a step."
          learnMore={doc('guides/conversations-and-runs', 'timeline')}
        />
      ) : (
        <Table label="Steps">
          <THead>
            <tr>
              <TH>Step</TH>
              <TH>Name</TH>
              <TH>Kind</TH>
              <TH>Status</TH>
              <TH className="w-[22%]">Timeline</TH>
              <TH className="text-right">Duration</TH>
              <TH className="text-right">Tokens</TH>
              <TH className="text-right">Cost</TH>
              <TH>Data from</TH>
              {run.content_visible && (
                <TH>
                  <span className="sr-only">Output</span>
                </TH>
              )}
            </tr>
          </THead>
          <TBody>
            {steps.map(({ step: s, offsetMs, left, width }) => (
              <Fragment key={s.id}>
                <TR>
                  <TD className="font-mono text-[12px] whitespace-nowrap">{s.id}</TD>
                  <TD className="font-mono text-[12px]">{s.vertex}</TD>
                  <TD>
                    <Badge tone={s.kind === 'approval' ? 'warn' : 'neutral'} title={s.kind}>
                      {STEP_KIND_LABEL[s.kind] ?? s.kind}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge tone={s.status === 'completed' ? 'ok' : 'danger'} dot>
                      {s.status === 'completed' ? 'Done' : 'Failed'}
                    </Badge>
                  </TD>
                  <TD>
                    <div
                      className="relative h-2.5 rounded-sm bg-surface-3"
                      title={`Starts at +${formatMs(offsetMs)}, lasts ${formatMs(s.duration_ms)}`}
                    >
                      <div
                        className={`absolute inset-y-0 rounded-sm ${s.status === 'completed' ? 'bg-accent' : 'bg-danger'}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-fg-subtle">+{formatMs(offsetMs)}</span>
                  </TD>
                  <TD className="text-right whitespace-nowrap tabular-nums">
                    {formatMs(s.duration_ms)}
                  </TD>
                  <TD
                    className="text-right whitespace-nowrap tabular-nums"
                    title={
                      s.prompt_tokens != null
                        ? `${formatInt(s.prompt_tokens)} prompt, ${formatInt(s.completion_tokens)} completion`
                        : undefined
                    }
                  >
                    {s.tokens ? formatInt(s.tokens) : EMPTY}
                  </TD>
                  <TD className="text-right whitespace-nowrap tabular-nums">
                    {s.usd ? formatUsd(s.usd) : EMPTY}
                    {s.model_cost_usd != null && s.model_cost_usd !== s.usd && (
                      <span className="block text-[11px] text-fg-subtle">
                        model {formatUsd(s.model_cost_usd)}
                      </span>
                    )}
                  </TD>
                  <TD>
                    <TaintLabels labels={s.labels} />
                  </TD>
                  {run.content_visible && (
                    <TD className="text-right">
                      {s.output !== undefined && s.output !== null && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-expanded={open.has(s.id)}
                          aria-label={`${open.has(s.id) ? 'Hide' : 'Show'} output of ${s.id}`}
                          onClick={() => toggle(s.id)}
                        >
                          {open.has(s.id) ? 'Hide output' : 'Output'}
                        </Button>
                      )}
                    </TD>
                  )}
                </TR>
                {open.has(s.id) && (
                  <tr className="border-b border-border">
                    <td colSpan={10} className="px-3 pb-3">
                      <CodeBlock
                        label={`Output of ${s.id}`}
                        language="json"
                        code={prettyJson(s.output)}
                        className="max-h-80"
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

/**
 * The answer guard's check of the final output (present when the output
 * carried untrusted labels): what it found, by rule and place, never the text.
 */
function AnswerGuard({ check }: { check: AnswerCheck }) {
  const findings = check.findings ?? [];
  const action = check.action ?? 'passed';
  return (
    <Card className="mb-4">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Answer check{' '}
            <Badge tone={ANSWER_ACTION_TONE[action]}>{ANSWER_ACTION_LABEL[action]}</Badge>
          </span>
        }
        description={
          action === 'redacted'
            ? 'Links, contacts or references that only untrusted text supplied were removed from the answer.'
            : action === 'refused'
              ? 'The answer carried what only untrusted text supplied, and this assistant refuses such answers: the conversation failed.'
              : 'The answer carried untrusted data and the guard found nothing to remove.'
        }
      />
      <div className="flex flex-col gap-3 p-4 text-[12.5px]">
        <Details
          rows={[['Answer data from', <TaintLabels key="l" labels={check.labels ?? []} />]]}
        />
        {findings.length > 0 && (
          <Table label="Answer check findings">
            <THead>
              <tr>
                <TH>Rule</TH>
                <TH>From</TH>
                <TH>Where in the output</TH>
              </tr>
            </THead>
            <TBody>
              {findings.map((f, i) => (
                <TR key={i}>
                  <TD>{f.rule ? ANSWER_RULE_LABEL[f.rule] : EMPTY}</TD>
                  <TD>
                    <TaintLabels labels={f.label ? [f.label] : []} />
                  </TD>
                  <TD className="font-mono text-[12px]">{f.at || '/'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </Card>
  );
}

/** When the last finished step ended: how long a waiting conversation has waited. */
function lastStepEnd(run: ConsoleRun): string | null {
  let end = Number.NaN;
  for (const st of run.steps) {
    const t = Date.parse(st.started_at) + st.duration_ms;
    if (Number.isFinite(t) && !(t <= end)) end = t;
  }
  return Number.isFinite(end) ? new Date(end).toISOString() : (run.started_at ?? null);
}

/** A run input or output as readable text: a string as is, fields as a list. */
function Readable({ value, label }: { value: unknown; label: string }) {
  if (typeof value === 'string') {
    return (
      <p dir="auto" className="text-[13px] break-words whitespace-pre-wrap">
        {value}
      </p>
    );
  }
  const rows = argRows(value);
  return (
    <dl aria-label={label} className="flex flex-col gap-1.5 text-[13px]">
      {rows.map((r, i) => (
        <div
          key={i}
          className="grid grid-cols-[minmax(6rem,max-content)_1fr] gap-x-3"
          style={{ paddingLeft: `${r.depth}rem` }}
        >
          <dt className="text-[12.5px] text-fg-muted">{r.key}</dt>
          <dd dir="auto" className="min-w-0 break-words whitespace-pre-wrap">
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The conversation first (UX-66): what was asked and the answer, as text in
 * their own direction (Arabic reads right to left), with the raw JSON behind
 * a toggle.
 */
function Conversation({ run }: { run: ConsoleRun }) {
  const [json, setJson] = useState(false);
  if (!run.content_visible) {
    return (
      <Card className="mb-4">
        <p className="p-4 text-[12.5px] text-fg-muted">{CONTENT_HIDDEN}</p>
      </Card>
    );
  }
  const noOutput = run.output === undefined || run.output === null;
  return (
    <Card className="mb-4">
      <CardHeader
        title="The conversation"
        actions={
          <Button size="sm" variant="ghost" aria-pressed={json} onClick={() => setJson((j) => !j)}>
            {json ? 'Show as text' : 'Show as JSON'}
          </Button>
        }
      />
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <section aria-labelledby="asked-h" className="min-w-0">
          <h3 id="asked-h" className="mb-1.5 text-[12.5px] font-semibold">
            What was asked
          </h3>
          {json ? (
            <CodeBlock label="Run input" language="json" code={prettyJson(run.input ?? null)} />
          ) : (
            <Readable value={run.input ?? null} label="What was asked" />
          )}
        </section>
        <section aria-labelledby="answer-h" className="min-w-0">
          <h3 id="answer-h" className="mb-1.5 text-[12.5px] font-semibold">
            The answer{run.partial ? ' (partial)' : ''}
          </h3>
          {noOutput ? (
            <p className="text-[12.5px] text-fg-muted">No answer yet.</p>
          ) : json ? (
            <CodeBlock label="Run output" language="json" code={prettyJson(run.output)} />
          ) : (
            <Readable value={run.output} label="The answer" />
          )}
        </section>
      </div>
    </Card>
  );
}

function Waiting({ tenantId, run }: { tenantId: string; run: ConsoleRun }) {
  const [done, setDone] = useState<string | null>(null);
  const awaiting = run.awaiting;
  // The run detail has no structured approval: the inbox entry of this run has it.
  const inbox = useQuery({
    ...inboxQuery(tenantId),
    enabled: run.status === 'input_required' && awaiting?.kind === 'approval',
  });
  const item = inbox.data?.data.find((i) => i.run_id === run.id && i.step === awaiting?.step);
  if (!awaiting?.step || run.status !== 'input_required') {
    return done ? (
      <p role="status" className="mb-4 text-[12.5px] text-ok">
        {done}
      </p>
    ) : null;
  }
  const kind = awaiting.kind ?? (awaiting.step.endsWith('@approve') ? 'approval' : 'question');
  const approval = kind === 'approval' ? item?.approval : null;
  return (
    <Card className="mb-4 border-warn/50">
      <CardHeader
        title={kind === 'approval' ? 'Waiting for your approval' : 'Waiting for an answer'}
        description={
          <>
            Step <code className="font-mono">{awaiting.step}</code>. Your decision is recorded under
            your name.
          </>
        }
      />
      <div className="flex flex-col gap-3 p-4">
        {kind === 'approval' ? (
          <ApprovalDetails
            approval={approval}
            question={awaiting.question}
            contentVisible={run.content_visible}
            run={run}
          />
        ) : run.content_visible ? (
          <p dir="auto" className="text-[13px] break-words whitespace-pre-wrap">
            {awaiting.question ?? 'The assistant asks for input without a question.'}
          </p>
        ) : null}
        <HumanStepActions
          tenantId={tenantId}
          runId={run.id}
          step={awaiting.step}
          kind={kind}
          approval={approval}
          question={awaiting.question}
          contentVisible={run.content_visible}
          run={run}
          onAnswered={setDone}
        />
      </div>
    </Card>
  );
}

function CancelRun({ tenantId, run }: { tenantId: string; run: ConsoleRun }) {
  const cancel = useCancelRun(tenantId);
  const denied = deniedReason(usePermissions(), 'runs.answer', tenantId);
  const [confirming, setConfirming] = useState(false);
  if (!isRunActive(run.status) || run.cancel_requested) return null;
  const ended = cancel.error instanceof ApiError && cancel.error.status === 409;
  return (
    <>
      <GatedButton
        size="sm"
        variant="danger"
        deniedReason={denied}
        onClick={() => {
          cancel.reset();
          setConfirming(true);
        }}
      >
        Cancel run
      </GatedButton>
      <ConfirmDialog
        open={confirming}
        title={`Cancel run ${run.id}?`}
        confirmLabel="Cancel run"
        loading={cancel.isPending}
        error={ended ? new Error('The run already ended.') : cancel.error}
        onCancel={() => setConfirming(false)}
        onConfirm={() => cancel.mutate(run.id, { onSuccess: () => setConfirming(false) })}
      >
        <p>
          {run.status === 'running'
            ? 'The run stops at its next step: the model call in flight completes and is recorded.'
            : 'The run is waiting, so it ends at once.'}{' '}
          The cancellation is recorded under your name in the audit log.
        </p>
      </ConfirmDialog>
    </>
  );
}

export function RunDetailPage() {
  const { tenantId, runId } = route.useParams();
  const run = useQuery(runQuery(tenantId, runId));
  const tenants = useQuery(tenantsQuery());
  const tenantName = tenants.data?.find((t) => t.id === tenantId)?.name ?? tenantId;
  const r = run.data;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-[12.5px] text-fg-muted">
        <Link to="/runs" search={{ tenant: tenantId }} className="hover:text-fg hover:underline">
          Conversations
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{tenantName}</span>
        <span aria-hidden="true"> / </span>
        <span aria-current="page" className="font-mono">
          {runId}
        </span>
      </nav>
      <PageHeader
        title={r ? `Conversation with ${r.node}` : 'Conversation'}
        description={
          r ? (
            <span className="flex flex-wrap items-center gap-2">
              <code className="font-mono text-[12px]">{runId}</code>
              <Link
                to="/nodes/$tenantId/$nodeName"
                params={{ tenantId, nodeName: r.node }}
                className="font-mono text-fg hover:underline"
              >
                {r.node}
              </Link>
              <Badge>v{r.version}</Badge>
              <RunStatusBadge status={r.status} />
              {isRunActive(r.status) && (
                <span className="text-fg-subtle">Refreshing until it ends.</span>
              )}
            </span>
          ) : undefined
        }
        actions={
          r && (
            <>
              <Link
                to="/runs"
                search={{ tenant: tenantId, node: r.node }}
                className="text-[13px] text-accent hover:underline"
              >
                Other conversations of {r.node}
              </Link>
              <Link
                to="/usage"
                search={{ tenant: tenantId, run: r.id }}
                className="text-[13px] text-accent hover:underline"
              >
                Model calls in Usage
              </Link>
              <SaveAsTest
                tenantId={tenantId}
                runId={r.id}
                node={r.node}
                version={r.version}
                status={r.status}
              />
              <CancelRun tenantId={tenantId} run={r} />
            </>
          )
        }
      />
      {run.isPending ? (
        <LoadingState rows={6} />
      ) : run.isError && isNotFound(run.error) ? (
        <Card>
          <EmptyState
            title="Conversation not found"
            description={`${tenantName} has no conversation ${runId}, or it was removed after its retention period.`}
            action={
              <Link
                to="/runs"
                search={{ tenant: tenantId }}
                className="text-[13px] text-accent hover:underline"
              >
                Back to conversations
              </Link>
            }
          />
        </Card>
      ) : run.isError ? (
        <Card>
          <ErrorState error={run.error} onRetry={() => void run.refetch()} />
        </Card>
      ) : (
        <>
          <Waiting tenantId={tenantId} run={run.data} />
          <Conversation run={run.data} />
          {run.data.answer_check && <AnswerGuard check={run.data.answer_check} />}
          <Steps run={run.data} />
          <Summary run={run.data} />
        </>
      )}
    </>
  );
}
