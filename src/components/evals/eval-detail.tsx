import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Fragment, useState, type ReactNode } from 'react';
import { usePermissions } from '@/api/auth';
import { evalQuery, useCancelEval } from '@/api/queries';
import type { Eval, GoldenSummary, InjectionSummary } from '@/api/types';
import {
  checkLabel,
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
import { EMPTY, formatDateTime, formatInt, formatMs, formatPercent, formatUsd } from '@/lib/format';
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
          label="Passed every try"
          value={formatPercent(s.pass_hat_k)}
          detail={`Test cases that passed all ${s.k} tries`}
        />
        <StatTile
          label="Tries that passed"
          value={formatPercent(s.pass_at_1)}
          detail={`${formatInt(s.passed_trials)} of ${formatInt(s.trials)} tries`}
        />
        <StatTile
          label="Cost of a good answer"
          value={formatUsd(s.cost_per_success_usd)}
          detail={`${formatUsd(s.cost_usd)} in all, grader ${formatUsd(s.judge_cost_usd)}`}
        />
        <StatTile
          label="Slowest typical answer"
          value={formatMs(s.latency_ms?.p95)}
          detail={`Half under ${formatMs(s.latency_ms?.p50)}`}
        />
      </dl>
      <p className="mt-2 text-[12px] text-fg-muted">
        {formatPercent(s.pass_at_k)} of test cases passed at least once · {formatInt(s.cases)} test
        cases · {formatInt(s.errors ?? 0)} errors · {formatInt(s.tokens)} tokens
        {s.golden_hash && (
          <>
            {' '}
            · test cases{' '}
            <code className="font-mono" title="Fingerprint of the test cases">
              {shortHash(s.golden_hash)}
            </code>
          </>
        )}
      </p>
      {s.by_case && s.by_case.length > 0 && (
        <Section title="By test case (failing first)">
          <Table label="Test cases">
            <THead>
              <tr>
                <TH>Test case</TH>
                <TH className="text-right">Tries passed</TH>
                <TH>Passed all tries</TH>
              </tr>
            </THead>
            <TBody>
              {[...s.by_case]
                .sort((a, b) => Number(a.all_passed) - Number(b.all_passed) || a.passed - b.passed)
                .map((c) => (
                  <TR key={c.case}>
                    <TD className="font-mono text-[12px]">{c.case}</TD>
                    <TD className="text-right tabular-nums">
                      {c.passed} of {c.trials}
                    </TD>
                    <TD>
                      <Badge tone={c.all_passed ? 'ok' : 'danger'}>
                        {c.all_passed ? 'Yes' : c.passed === 0 ? 'No, failed every try' : 'No'}
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
          label="Attacks that worked"
          value={formatPercent(s.attack_success_rate)}
          detail={`${formatInt(s.attacks_succeeded)} got through`}
        />
        <StatTile
          label="Still did its job"
          value={formatPercent(s.utility_under_attack)}
          detail="Conversations that still answered the request"
        />
        <StatTile
          label="Model fooled, then stopped"
          value={`${formatInt(s.attacked)} of ${formatInt(s.trials)}`}
          detail="The model obeyed the attack; Caliban's defenses blocked it"
        />
      </dl>
      {s.inconclusive && (
        <p role="note" className="mt-2 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
          {formatInt(s.errors ?? 0)} tries ended on an error, so these results do not count toward
          going live. Run the safety tests again.
        </p>
      )}
      <p className="mt-2 text-[12px] text-fg-muted">
        Attack set v{s.suite_version ?? '?'} · {formatUsd(s.cost_usd)} · 95% under{' '}
        {formatMs(s.latency_ms?.p95)} · {formatInt(s.errors ?? 0)} errors
      </p>
      {categories.length > 0 && (
        <Section title="By kind of attack">
          <Table label="Kinds of attack">
            <THead>
              <tr>
                <TH>Kind of attack</TH>
                <TH className="text-right">Blocked</TH>
                <TH className="text-right">Share blocked</TH>
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
        <Section title="Attacks that do not apply to this version">
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
          {v.attacked ? 'model fooled' : 'model not fooled'}
        </Badge>
        {v.defenses.map((d) => (
          <Badge key={d} tone="ok" className="font-mono">
            {d}
          </Badge>
        ))}
        {v.utility != null && (
          <Badge tone={v.utility ? 'ok' : 'neutral'}>
            {v.utility ? 'did its job' : 'did not do its job'}
          </Badge>
        )}
      </span>
    );
  }
  const checks = isGoldenVerdict(v) ? v.checks : [];
  if (checks.length === 0) return <span className="text-fg-subtle">{EMPTY}</span>;
  const passed = checks.filter((c) => c.passed).length;
  return (
    <span
      className="inline-flex flex-wrap items-center gap-1"
      title={checks
        .map(
          (c) =>
            `${checkLabel(c.type)}: ${c.passed ? 'passed' : 'failed'}${c.score != null ? ` (${c.score})` : ''}`,
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
            {checkLabel(c.type)}
          </Badge>
        ))}
      {isGoldenVerdict(v) && (v.sandboxed_calls ?? 0) > 0 && (
        <Badge tone="info" title="Actions that change things go to a stand-in during tests.">
          {v.sandboxed_calls} action{v.sandboxed_calls === 1 ? '' : 's'} answered by the stand-in
        </Badge>
      )}
    </span>
  );
}

function Trials({ e, tenantId }: { e: Eval; tenantId: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const injection = e.suite === 'injection';
  const trials = e.trials ?? [];
  if (trials.length === 0) {
    return <p className="text-[12.5px] text-fg-muted">No try has finished yet.</p>;
  }
  return (
    <Table label="Trials">
      <THead>
        <tr>
          <TH>Test case</TH>
          <TH className="text-right">Try</TH>
          <TH>Result</TH>
          <TH>Verdict</TH>
          <TH className="text-right">Cost</TH>
          <TH className="text-right">Latency</TH>
          <TH>Conversation</TH>
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
                    <span className="text-fg-subtle">{EMPTY}</span>
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
        {e.cancel_requested && <Badge>Stopping</Badge>}
        {active && (
          <GatedButton
            size="sm"
            variant="danger"
            deniedReason={cannotRun}
            loading={cancel.isPending}
            onClick={() => cancel.mutate(e.id)}
            className="ml-auto"
          >
            Cancel tests
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
        <dt className="text-fg-muted">Tries</dt>
        <dd>
          {e.case_count} test cases × {e.k} tries
          {e.concurrency != null && `, ${e.concurrency} at a time`}
        </dd>
        <dt className="text-fg-muted">Started by</dt>
        <dd className="break-all">
          {e.created_by ?? EMPTY}
          {e.api_key_id && <span className="text-fg-muted"> with app key {e.api_key_id}</span>}
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
        <Section title="Results">
          {golden && <GoldenMetrics s={golden} />}
          {injection && <InjectionMetrics s={injection} />}
        </Section>
      )}
      {!e.summary && active && (
        <p className="mt-4 text-[12.5px] text-fg-muted">
          Results appear when the tests end. This page updates while they run.
        </p>
      )}
      <Section title="Every try">
        <Trials e={e} tenantId={tenantId} />
        {e.content_purged && (
          <p className="mt-2 text-[12px] text-fg-muted">
            The retention period cleared the detail of these tries. Results and verdicts stay.
          </p>
        )}
        {!e.content_visible && !e.content_purged && (e.trials?.length ?? 0) > 0 && (
          <p className="mt-2 text-[12px] text-fg-muted">
            The detail of each try (answers, what the checks said, what the stand-in tools received)
            is conversation content: your role cannot see it (needs runs.data).
          </p>
        )}
      </Section>
    </div>
  );
}
