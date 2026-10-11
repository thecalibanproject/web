import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { Fragment, useState, type ReactNode } from 'react';
import { usePermissions } from '@/api/auth';
import { ApiError } from '@/api/client';
import { inboxQuery, runQuery, tenantsQuery, useCancelRun } from '@/api/queries';
import type { ConsoleRun } from '@/api/types';
import { ApprovalDetails, HumanStepActions } from '@/components/runs/human-step';
import { RunStatusBadge, TaintLabels } from '@/components/runs/run-badges';
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
import { isNotFound } from '@/lib/errors';
import { EMPTY, formatDateTime, formatInt, formatMs, formatUsd } from '@/lib/format';
import { shortHash } from '@/lib/nodes';
import { deniedReason } from '@/lib/permissions';
import {
  budgetRows,
  elapsedMs,
  isRunActive,
  prettyJson,
  timeline,
  type BudgetRow,
} from '@/lib/runs';

const route = getRouteApi('/_app/runs/$tenantId/$runId');

const CONTENT_HIDDEN =
  'Run content (input, output, step outputs, questions) is hidden: your role sees what happened, not what was said (needs runs.data).';

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
  const rows: Array<[string, ReactNode]> = [
    [
      'Started by',
      <span key="i" className="font-mono text-[12px]">
        {run.invoker ?? EMPTY}
      </span>,
    ],
    ...(run.origin
      ? [
          [
            'Origin',
            <span key="o" className="font-mono text-[12px]">
              {run.origin}
            </span>,
          ] as [string, ReactNode],
        ]
      : []),
    [
      'Version hash',
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
    [
      'Input labels',
      <TaintLabels
        key="l"
        labels={run.input_labels ?? []}
        empty="none: the caller marked no input as untrusted"
      />,
    ],
    ['Created', formatDateTime(run.created_at)],
    ['Started', formatDateTime(run.started_at)],
    ['Finished', formatDateTime(run.finished_at)],
    ['Duration', ms != null ? formatMs(ms) : run.finished_at ? EMPTY : 'not ended'],
    ['Cost', formatUsd(run.cost_usd)],
    [
      'Tokens',
      usage
        ? `${formatInt(usage.total_tokens)} (${formatInt(usage.prompt_tokens)} prompt, ${formatInt(usage.completion_tokens)} completion)`
        : EMPTY,
    ],
  ];
  if (run.claims != null && run.claims > 1) {
    rows.push(['Claims', `${run.claims} (taken over or resumed by another worker)`]);
  }
  if (run.error)
    rows.push([
      'Error',
      <span key="e" className="text-danger">
        {run.error}
      </span>,
    ]);
  if (run.stop_reason) rows.push(['Stop reason', run.stop_reason]);
  if (run.partial) rows.push(['Output', 'Partial: the run ended on a budget']);
  if (run.cancelled_by) rows.push(['Cancelled by', run.cancelled_by]);
  if (run.cancel_requested) rows.push(['Cancel', 'Requested: the run stops at its next step']);
  const budget = budgetRows(run.budget);
  return (
    <div className="mb-4 grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Run" />
        <div className="p-4">
          <Details rows={rows} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Budget" description="What the run used against its version's budgets." />
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
        title="Steps"
        description={`Each vertex execution, model call, tool call and approval, in order. ${steps.length} step${steps.length === 1 ? '' : 's'} over ${formatMs(spanMs)}.`}
      />
      {steps.length === 0 ? (
        <EmptyState title="No steps yet" description="The run has not completed a step." />
      ) : (
        <Table label="Steps">
          <THead>
            <tr>
              <TH>Step</TH>
              <TH>Vertex</TH>
              <TH>Kind</TH>
              <TH>Status</TH>
              <TH className="w-[22%]">Timeline</TH>
              <TH className="text-right">Duration</TH>
              <TH className="text-right">Tokens</TH>
              <TH className="text-right">Cost</TH>
              <TH>Taint labels</TH>
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
                    <Badge tone={s.kind === 'approval' ? 'warn' : 'neutral'}>{s.kind}</Badge>
                  </TD>
                  <TD>
                    <Badge tone={s.status === 'completed' ? 'ok' : 'danger'} dot>
                      {s.status}
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

function Content({ run }: { run: ConsoleRun }) {
  if (!run.content_visible) {
    return (
      <Card>
        <p className="p-4 text-[12.5px] text-fg-muted">{CONTENT_HIDDEN}</p>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Input" />
        <div className="p-4">
          <CodeBlock label="Run input" language="json" code={prettyJson(run.input ?? null)} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Output" description={run.partial ? 'Partial result' : undefined} />
        <div className="p-4">
          {run.output === undefined || run.output === null ? (
            <p className="text-[12.5px] text-fg-muted">No output yet.</p>
          ) : (
            <CodeBlock label="Run output" language="json" code={prettyJson(run.output)} />
          )}
        </div>
      </Card>
    </div>
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
        title={
          kind === 'approval' ? 'Waiting for approval of a tainted call' : 'Waiting for an answer'
        }
        description={
          <>
            Step <code className="font-mono">{awaiting.step}</code>. Your decision is recorded under
            your name in the audit log.
          </>
        }
      />
      <div className="flex flex-col gap-3 p-4">
        {kind === 'approval' ? (
          <ApprovalDetails
            approval={approval}
            question={awaiting.question}
            contentVisible={run.content_visible}
          />
        ) : run.content_visible ? (
          <p className="text-[13px] break-words whitespace-pre-wrap">
            {awaiting.question ?? 'The run asks for input without a question.'}
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
          Runs
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{tenantName}</span>
        <span aria-hidden="true"> / </span>
        <span aria-current="page" className="font-mono">
          {runId}
        </span>
      </nav>
      <PageHeader
        title={<span className="font-mono">{runId}</span>}
        description={
          r ? (
            <span className="flex flex-wrap items-center gap-2">
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
                <span className="text-fg-subtle">Refreshing while the run is not ended.</span>
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
                Runs of {r.node}
              </Link>
              <Link
                to="/usage"
                search={{ tenant: tenantId, run: r.id }}
                className="text-[13px] text-accent hover:underline"
              >
                Model calls in Usage
              </Link>
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
            title="Run not found"
            description={`${tenantName} has no run ${runId}, or it was removed by the run retention.`}
            action={
              <Link
                to="/runs"
                search={{ tenant: tenantId }}
                className="text-[13px] text-accent hover:underline"
              >
                Back to runs
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
          <Summary run={run.data} />
          <Steps run={run.data} />
          <Content run={run.data} />
        </>
      )}
    </>
  );
}
