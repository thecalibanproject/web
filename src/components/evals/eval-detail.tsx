import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Fragment, useState, type ReactNode } from 'react';
import { usePermissions } from '@/api/auth';
import { evalQuery, useCancelEval } from '@/api/queries';
import type { Eval, GoldenSummary, InjectionSummary } from '@/api/types';
import {
  EVAL_SUITE_LABEL,
  goldenSummary,
  injectionSummary,
  isEvalActive,
  isGoldenVerdict,
  isInjectionVerdict,
  NO_RUN,
  verdictError,
  type TrialVerdict,
} from '@/lib/evals';
import { formatDateTime, formatInt, formatMs, formatPercent, formatUsd } from '@/lib/format';
import { shortHash } from '@/lib/nodes';
import { prettyJson } from '@/lib/runs';
import {
  Badge,
  Button,
  CodeBlock,
  ErrorState,
  FormError,
  GatedButton,
  LoadingState,
  StatTile,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../ui';
import { EvalStatusBadge, TrialStatusBadge } from './eval-badges';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-[12.5px] font-semibold text-fg">{title}</h3>
      {children}
    </section>
  );
}

function GoldenMetrics({ s }: { s: GoldenSummary }) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="pass^k"
          value={formatPercent(s.pass_hat_k)}
          detail={`Cases whose ${s.k ?? 'k'} runs all passed`}
        />
        <StatTile
          label="pass@1"
          value={formatPercent(s.pass_at_1)}
          detail={`${formatInt(s.passed_trials)} of ${formatInt(s.trials)} trials passed`}
        />
        <StatTile
          label="Cost per success"
          value={formatUsd(s.cost_per_success_usd)}
          detail={`${formatUsd(s.cost_usd)} in all, judge ${formatUsd(s.judge_cost_usd)}`}
        />
        <StatTile
          label="p95 latency"
          value={formatMs(s.latency_ms?.p95)}
          detail={`p50 ${formatMs(s.latency_ms?.p50)}`}
        />
      </dl>
      <p className="mt-2 text-[12px] text-fg-muted">
        pass@k {formatPercent(s.pass_at_k)} (cases with at least one passing run) ·{' '}
        {formatInt(s.cases)} cases · {formatInt(s.errors ?? 0)} errors · {formatInt(s.tokens)}{' '}
        tokens
        {s.golden_hash && (
          <>
            {' '}
            · golden set <code className="font-mono">{shortHash(s.golden_hash)}</code>
          </>
        )}
      </p>
      {s.by_case && s.by_case.length > 0 && (
        <Section title="By case">
          <Table label="Cases">
            <THead>
              <tr>
                <TH>Case</TH>
                <TH className="text-right">Passed</TH>
                <TH>All k passed</TH>
              </tr>
            </THead>
            <TBody>
              {s.by_case.map((c) => (
                <TR key={c.case}>
                  <TD className="font-mono text-[12px]">{c.case}</TD>
                  <TD className="text-right tabular-nums">
                    {c.passed} of {c.trials}
                  </TD>
                  <TD>
                    <Badge tone={c.all_passed ? 'ok' : 'danger'}>
                      {c.all_passed ? 'yes' : 'no'}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </>
  );
}

function InjectionMetrics({ s }: { s: InjectionSummary }) {
  const na = s.not_applicable;
  const categories = Object.entries(s.by_category ?? {});
  return (
    <>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="Attacks blocked"
          value={formatPercent(s.pass_rate)}
          detail={`${formatInt(s.blocked)} of ${formatInt(s.trials)}`}
        />
        <StatTile
          label="Attack success rate"
          value={formatPercent(s.attack_success_rate)}
          detail={`${formatInt(s.attacks_succeeded)} attacks got through`}
        />
        <StatTile
          label="Utility under attack"
          value={formatPercent(s.utility_under_attack)}
          detail="Runs that still did their job"
        />
        <StatTile
          label="Model followed"
          value={`${formatInt(s.attacked)} of ${formatInt(s.trials)}`}
          detail="Blocked by the defenses, not the model"
        />
      </dl>
      <p className="mt-2 text-[12px] text-fg-muted">
        Suite v{s.suite_version ?? '?'} · {formatUsd(s.cost_usd)} · p95{' '}
        {formatMs(s.latency_ms?.p95)} · {formatInt(s.errors ?? 0)} errors
      </p>
      {categories.length > 0 && (
        <Section title="By category">
          <Table label="Categories">
            <THead>
              <tr>
                <TH>Category</TH>
                <TH className="text-right">Blocked</TH>
                <TH className="text-right">Pass rate</TH>
              </tr>
            </THead>
            <TBody>
              {categories.map(([cat, c]) => (
                <TR key={cat}>
                  <TD className="font-mono text-[12px]">{cat}</TD>
                  <TD className="text-right tabular-nums">
                    {c.blocked} of {c.trials}
                  </TD>
                  <TD className="text-right tabular-nums">{formatPercent(c.pass_rate)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
      {na.length > 0 && (
        <Section title="Not applicable to this version">
          <ul className="list-disc pl-5 text-[12.5px] text-fg-muted">
            {na.map((n) => (
              <li key={n.case}>
                <code className="font-mono text-fg">{n.case}</code>
                {n.reason && `: ${n.reason}`}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function Verdict({ verdict: v }: { verdict: TrialVerdict | undefined }) {
  const error = verdictError(v);
  if (error) return <span className="text-danger">{error}</span>;
  if (isInjectionVerdict(v)) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <Badge>{v.category}</Badge>
        <Badge tone={v.attacked ? 'warn' : 'neutral'}>
          {v.attacked ? 'model followed' : 'model ignored'}
        </Badge>
        {v.defenses.map((d) => (
          <Badge key={d} tone="ok" className="font-mono">
            {d}
          </Badge>
        ))}
        {v.utility != null && (
          <Badge tone={v.utility ? 'ok' : 'neutral'}>{v.utility ? 'useful' : 'not useful'}</Badge>
        )}
      </span>
    );
  }
  const checks = isGoldenVerdict(v) ? v.checks : [];
  if (checks.length === 0) return <span className="text-fg-subtle">-</span>;
  const passed = checks.filter((c) => c.passed).length;
  return (
    <span
      className="inline-flex flex-wrap items-center gap-1"
      title={checks
        .map(
          (c) =>
            `${c.type}: ${c.passed ? 'passed' : 'failed'}${c.score != null ? ` (${c.score})` : ''}`,
        )
        .join(', ')}
    >
      <span className="tabular-nums">
        {passed} of {checks.length} checks
      </span>
      {checks
        .filter((c) => !c.passed)
        .map((c, i) => (
          <Badge key={i} tone="danger">
            {c.type}
          </Badge>
        ))}
    </span>
  );
}

function Trials({ e, tenantId }: { e: Eval; tenantId: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const injection = e.suite === 'injection';
  const trials = e.trials ?? [];
  if (trials.length === 0) {
    return <p className="text-[12.5px] text-fg-muted">No trial has finished yet.</p>;
  }
  return (
    <Table label="Trials">
      <THead>
        <tr>
          <TH>Case</TH>
          <TH className="text-right">Trial</TH>
          <TH>Result</TH>
          <TH>Verdict</TH>
          <TH className="text-right">Cost</TH>
          <TH className="text-right">Latency</TH>
          <TH>Run</TH>
          {e.content_visible && (
            <TH>
              <span className="sr-only">Detail</span>
            </TH>
          )}
        </tr>
      </THead>
      <TBody>
        {trials.map((t) => {
          const key = `${t.case}#${t.trial}`;
          return (
            <Fragment key={key}>
              <TR>
                <TD className="font-mono text-[12px]">{t.case}</TD>
                <TD className="text-right tabular-nums">{t.trial}</TD>
                <TD>
                  <TrialStatusBadge status={t.status} injection={injection} />
                </TD>
                <TD>
                  <Verdict verdict={t.verdict} />
                </TD>
                <TD className="text-right whitespace-nowrap tabular-nums">
                  {formatUsd(t.cost_usd)}
                </TD>
                <TD className="text-right whitespace-nowrap tabular-nums">
                  {formatMs(t.latency_ms)}
                </TD>
                <TD>
                  {t.run_id ? (
                    <Link
                      to="/runs/$tenantId/$runId"
                      params={{ tenantId, runId: t.run_id }}
                      className="font-mono text-[12px] text-accent hover:underline"
                    >
                      {t.run_id}
                    </Link>
                  ) : (
                    <span className="text-fg-subtle">-</span>
                  )}
                </TD>
                {e.content_visible && (
                  <TD className="text-right">
                    {t.detail != null && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-expanded={open === key}
                        aria-label={`${open === key ? 'Hide' : 'Show'} detail of ${key}`}
                        onClick={() => setOpen(open === key ? null : key)}
                      >
                        {open === key ? 'Hide' : 'Detail'}
                      </Button>
                    )}
                  </TD>
                )}
              </TR>
              {open === key && (
                <tr className="border-b border-border">
                  <td colSpan={8} className="px-3 pb-3">
                    <CodeBlock
                      label={`Detail of ${key}`}
                      language="json"
                      code={prettyJson(t.detail)}
                      className="max-h-80"
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </TBody>
    </Table>
  );
}

/** An eval: its metrics, per-case (or per-category) results and every trial. */
export function EvalDetail({ tenantId, evalId }: { tenantId: string; evalId: string }) {
  const q = useQuery(evalQuery(tenantId, evalId));
  const cancel = useCancelEval(tenantId);
  const perms = usePermissions();
  const cannotRun = perms.can('nodes.run', tenantId) ? null : NO_RUN(tenantId);
  if (q.isPending) return <LoadingState rows={6} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const e = q.data;
  const golden = goldenSummary(e);
  const injection = injectionSummary(e);
  const active = isEvalActive(e.status);
  return (
    <div className="text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={e.suite === 'injection' ? 'warn' : 'accent'}>
          {EVAL_SUITE_LABEL[e.suite]}
        </Badge>
        <EvalStatusBadge status={e.status} />
        {e.cancel_requested && <Badge>cancel requested</Badge>}
        {active && (
          <GatedButton
            size="sm"
            variant="danger"
            deniedReason={cannotRun}
            loading={cancel.isPending}
            onClick={() => cancel.mutate(e.id)}
            className="ml-auto"
          >
            Cancel eval
          </GatedButton>
        )}
      </div>
      <FormError error={cancel.error} />
      <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[12.5px]">
        <dt className="text-fg-muted">Version</dt>
        <dd>
          v{e.version}{' '}
          <code className="font-mono text-[12px] text-fg-muted" title={e.hash}>
            {shortHash(e.hash)}
          </code>
        </dd>
        <dt className="text-fg-muted">Trials</dt>
        <dd>
          {e.case_count} cases × k = {e.k}
          {e.concurrency != null && `, ${e.concurrency} at a time`}
        </dd>
        <dt className="text-fg-muted">Started by</dt>
        <dd className="break-all">
          {e.created_by ?? '-'}
          {e.api_key_id && <span className="text-fg-muted"> as API key {e.api_key_id}</span>}
        </dd>
        <dt className="text-fg-muted">Created</dt>
        <dd>{formatDateTime(e.created_at)}</dd>
        <dt className="text-fg-muted">Finished</dt>
        <dd>{formatDateTime(e.finished_at)}</dd>
        {e.cancelled_by && (
          <>
            <dt className="text-fg-muted">Cancelled by</dt>
            <dd>{e.cancelled_by}</dd>
          </>
        )}
        {e.error && (
          <>
            <dt className="text-fg-muted">Error</dt>
            <dd className="text-danger">{e.error}</dd>
          </>
        )}
      </dl>
      {(golden || injection) && (
        <Section title="Metrics">
          {golden && <GoldenMetrics s={golden} />}
          {injection && <InjectionMetrics s={injection} />}
        </Section>
      )}
      {!e.summary && active && (
        <p className="mt-4 text-[12.5px] text-fg-muted">
          Metrics appear when the eval ends. Refreshing while it runs.
        </p>
      )}
      <Section title="Trials">
        <Trials e={e} tenantId={tenantId} />
        {e.content_purged && (
          <p className="mt-2 text-[12px] text-fg-muted">
            The run retention cleared this eval&apos;s trial detail. Its metrics and verdicts stay.
          </p>
        )}
        {!e.content_visible && !e.content_purged && (e.trials?.length ?? 0) > 0 && (
          <p className="mt-2 text-[12px] text-fg-muted">
            Trial detail (outputs, what the scorers said, what sandboxed tools received) is run
            content: your role cannot see it (needs runs.data).
          </p>
        )}
      </Section>
    </div>
  );
}
