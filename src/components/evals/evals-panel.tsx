import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { usePermissions } from '@/api/auth';
import { evalPolicyQuery, evalsQuery, gateQuery, usePutEvalPolicy } from '@/api/queries';
import type { Eval, Node } from '@/api/types';
import { cn } from '@/lib/cn';
import { doc } from '@/lib/docs';
import {
  defaultEvalVersion,
  EVAL_SUITE_LABEL,
  evidenceEvals,
  goldenSummary,
  injectionSummary,
  isEvalActive,
  NO_RUN,
  policyForm,
  policyFromForm,
  type PolicyErrors,
  type PolicyForm,
  type PolicyTextField,
} from '@/lib/evals';
import { EMPTY, formatDateTime, formatMs, formatPercent, formatUsd } from '@/lib/format';
import { failedEveryTry, failingCases, latestSucceeded, requirements } from '@/lib/goLive';
import { Advanced } from '../help/advanced';
import { LearnMore } from '../help/learn-more';
import { TermTip } from '../help/toggletip';
import { deniedReason } from '@/lib/permissions';
import { LiveBadge, NodeStateBadge } from '../nodes/node-badges';
import { VersionDialog } from '../nodes/version-dialogs';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  GatedButton,
  Input,
  LoadingState,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../ui';
import { IconAlert, IconCheck } from '../ui/icons';
import { EvalStatusBadge } from './eval-badges';
import { EvalDetail } from './eval-detail';
import { GoldenSetCard } from './golden-set-card';
import { StartEvalDrawer } from './start-eval';

function GateCard({
  tenantId,
  name,
  version,
  live,
  evals,
  polling,
  onOpenEval,
}: {
  tenantId: string;
  name: string;
  version: Node;
  live: number | undefined;
  /** The version's evals, newest first. */
  evals: readonly Eval[];
  polling: boolean;
  onOpenEval: (id: string) => void;
}) {
  const gate = useQuery({
    ...gateQuery(tenantId, name, version.version),
    refetchInterval: polling ? 5_000 : false,
  });
  const policy = useQuery(evalPolicyQuery(tenantId, name));
  const cannotPublish = deniedReason(usePermissions(), 'nodes.publish', tenantId);
  const [promoting, setPromoting] = useState(false);
  const g = gate.data;
  const input = { version, evals, gate: g, policy: policy.data?.policy };
  const reqs = requirements(input);
  const latest = latestSucceeded(evals, 'golden');
  const failing = failingCases(latest ? goldenSummary(latest) : null);
  const zero = failedEveryTry(failing);
  const evidence = evidenceEvals(g?.evidence);
  return (
    <Card>
      <CardHeader
        title="Go-live check"
        description={`What making v${version.version} live would say now.`}
        actions={
          version.state === 'published' &&
          !version.live && (
            <GatedButton
              size="sm"
              variant="primary"
              deniedReason={cannotPublish}
              onClick={() => setPromoting(true)}
            >
              Make v{version.version} live
            </GatedButton>
          )
        }
      />
      <div className="flex flex-col gap-3 p-4 text-[12.5px]">
        {gate.isPending ? (
          <LoadingState rows={2} />
        ) : gate.isError ? (
          <ErrorState error={gate.error} onRetry={() => void gate.refetch()} className="m-0" />
        ) : (
          <>
            <p className="flex flex-wrap items-center gap-2">
              {!g?.allowed ? (
                <Badge tone="danger">
                  <IconAlert size={12} /> Not ready to go live
                </Badge>
              ) : zero.length > 0 ? (
                <Badge tone="warn">
                  <IconAlert size={12} /> Allowed to go live, with failing test cases
                </Badge>
              ) : (
                <Badge tone="ok">
                  <IconCheck size={12} /> Ready to go live
                </Badge>
              )}
              {g?.has_write_tools && (
                <Badge tone="warn" title="Safety tests are always required before it goes live.">
                  Can change things
                </Badge>
              )}
              {g?.has_untrusted_reads && !g.has_write_tools && (
                <Badge
                  tone="info"
                  title="It reads documents, databases or tools, and what it reads can steer its answer, so it needs safety tests unless the bar makes them optional."
                >
                  Reads outside data
                </Badge>
              )}
              {version.live && <LiveBadge />}
            </p>
            {failing.length > 0 && (
              <section aria-label="Failing test cases" className="rounded-md bg-surface-2 p-3">
                <h3 className="mb-1 font-semibold">
                  {zero.length > 0
                    ? `${zero.length} test case${zero.length === 1 ? '' : 's'} failed every try`
                    : 'Test cases that failed some tries'}
                </h3>
                <ul className="flex flex-col gap-0.5">
                  {failing.map((c) => (
                    <li key={c.case} className="flex flex-wrap items-baseline gap-2">
                      <code className="font-mono text-[12px]">{c.case}</code>
                      <span className={c.passed === 0 ? 'text-danger' : 'text-warn'}>
                        {c.passed === 0
                          ? `failed all ${c.tries} tries`
                          : `passed ${c.passed} of ${c.tries} tries`}
                      </span>
                    </li>
                  ))}
                </ul>
                {latest && (
                  <button
                    type="button"
                    className="mt-1 text-accent hover:underline"
                    onClick={() => onOpenEval(latest.id)}
                  >
                    See every try
                  </button>
                )}
              </section>
            )}
            {reqs.length === 0 ? (
              <p className="text-fg-muted">
                No bar applies: there is no quality bar, and this version neither changes things nor
                reads outside data.
              </p>
            ) : (
              <ul aria-label="Requirements" className="flex flex-col gap-1.5">
                {reqs.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={cn('mt-0.5 shrink-0', r.met ? 'text-ok' : 'text-danger')}>
                      {r.met ? <IconCheck size={14} /> : <IconAlert size={14} />}
                    </span>
                    <span>
                      <span className="sr-only">{r.met ? 'Met: ' : 'Not met: '}</span>
                      {r.label}
                      {r.detail && <span className="block text-fg-muted">{r.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {evidence.length > 0 && (
              <p className="text-fg-muted">
                Based on{' '}
                {evidence.map(({ label, eval: id }, i) => (
                  <span key={id}>
                    {i > 0 && ', '}
                    <button
                      type="button"
                      className="text-accent hover:underline"
                      title={id}
                      onClick={() => onOpenEval(id)}
                    >
                      {label
                        .replace(/\bgolden\b/, 'the quality tests')
                        .replace(/\binjection\b/, 'the safety tests')}
                    </button>
                  </span>
                ))}
                .
              </p>
            )}
          </>
        )}
      </div>
      <VersionDialog
        action={promoting ? 'promote' : null}
        version={promoting ? version : null}
        live={live}
        onClose={() => {
          setPromoting(false);
          void gate.refetch();
        }}
      />
    </Card>
  );
}

const pctText = (r: number | undefined) => (r == null ? null : formatPercent(r));

/** Ready-made bars, in plain sentences (UX-40). */
const PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  detail: string;
  minPassK: string;
  minK: string;
}> = [
  {
    id: 'strict',
    label: 'Strict',
    detail: '9 of 10 test cases must pass all 3 tries.',
    minPassK: '90',
    minK: '3',
  },
  {
    id: 'standard',
    label: 'Standard (recommended)',
    detail: '8 of 10 test cases must pass all 3 tries.',
    minPassK: '80',
    minK: '3',
  },
  {
    id: 'lenient',
    label: 'Lenient',
    detail: '6 of 10 test cases must pass all 3 tries. Only for early trials.',
    minPassK: '60',
    minK: '3',
  },
];

/** Below this share, lowering the bar gets a warning. */
const RECOMMENDED_MIN_PASS = 80;

function PolicyEditor({
  tenantId,
  name,
  initial,
  onClose,
}: {
  tenantId: string;
  name: string;
  initial: PolicyForm;
  onClose: () => void;
}) {
  const put = usePutEvalPolicy(tenantId, name);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<PolicyErrors>({});
  const set = (k: PolicyTextField) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = policyFromForm(form);
    if (r.errors) {
      setErrors(r.errors);
      return;
    }
    put.mutate(r.policy, { onSuccess: onClose });
  };
  const minPass = Number(form.minPassK);
  const lowered =
    form.minPassK.trim() !== '' &&
    Number.isFinite(minPass) &&
    minPass < RECOMMENDED_MIN_PASS &&
    minPass < (Number(initial.minPassK) || 100);
  const field = (k: PolicyTextField, label: string, hint: string, unit?: string) => (
    <Field label={label} hint={hint} error={errors[k]}>
      {({ id, describedBy, invalid }) => (
        <span className="flex items-center gap-2">
          <Input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            inputMode="decimal"
            value={form[k]}
            onChange={(e) => set(k)(e.target.value)}
            className="w-32"
          />
          {unit && <span className="text-[12.5px] text-fg-muted">{unit}</span>}
        </span>
      )}
    </Field>
  );
  return (
    <Drawer
      open
      onClose={onClose}
      title={`Go-live bar of ${name}`}
      description="What a version's latest test results must meet before it can go live. Every change is recorded in the audit log with the old and the new bar."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="eval-policy" loading={put.isPending}>
            Save bar
          </Button>
        </>
      }
    >
      <form id="eval-policy" onSubmit={submit} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[12.5px] font-semibold">Quality tests</legend>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Ready-made bars">
            {PRESETS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                aria-pressed={form.minPassK === p.minPassK && form.minK === p.minK}
                title={p.detail}
                onClick={() => {
                  setForm((f) => ({ ...f, minPassK: p.minPassK, minK: p.minK }));
                  setErrors({});
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          {field(
            'minPassK',
            'Test cases that must pass every try',
            'Empty: no quality bar. Also called pass^k.',
            '%',
          )}
          {lowered && (
            <p role="note" className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
              This is below the recommended {RECOMMENDED_MIN_PASS}%: versions that fail a test case
              more often can go live. The change is recorded in the audit log under your name.
            </p>
          )}
          {field('minK', 'Tries per test case', 'How many times each case runs. Default 1.')}
          <Advanced summary="No limit on cost or answer time">
            {field('maxCostPerSuccess', 'Most a good answer may cost', 'Optional.', 'USD')}
            {field(
              'maxP95',
              'Slowest typical answer',
              'Optional. 95 of 100 answers must be faster than this.',
              'seconds',
            )}
          </Advanced>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[12.5px] font-semibold">Safety tests</legend>
          {field(
            'injectionMinPassRate',
            'Attacks that must be blocked',
            'Empty: 100%, every attack. Versions that can change things always need safety tests.',
            '%',
          )}
          <Field
            label="Versions that only read"
            hint="Versions that read documents, databases or tools but change nothing: what they read can still steer their answer."
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={form.injectionReadOnly}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    injectionReadOnly: e.target.value === 'optional' ? 'optional' : 'required',
                  }))
                }
                className="w-auto"
              >
                <option value="required">Need safety tests (default)</option>
                <option value="optional">Safety tests optional</option>
              </Select>
            )}
          </Field>
        </fieldset>
        <FormError error={put.error} />
        <p className="text-[12.5px]">
          <LearnMore doc={doc('guides/tests-and-go-live', 'the-bar')}>How to set the bar</LearnMore>
        </p>
      </form>
    </Drawer>
  );
}

function PolicyCard({ tenantId, name }: { tenantId: string; name: string }) {
  const q = useQuery(evalPolicyQuery(tenantId, name));
  const cannotPublish = deniedReason(usePermissions(), 'nodes.publish', tenantId);
  const [editing, setEditing] = useState(false);
  const p = q.data?.policy;
  const rows: Array<[string, string]> = p?.golden
    ? [
        ['Test cases that must pass every try', pctText(p.golden.min_pass_k) ?? EMPTY],
        ['Tries per test case', String(p.golden.min_k ?? 1)],
        [
          'Most a good answer may cost',
          p.golden.max_cost_per_success_usd != null
            ? formatUsd(p.golden.max_cost_per_success_usd)
            : 'no limit',
        ],
        [
          'Slowest typical answer',
          p.golden.max_p95_latency_ms != null ? formatMs(p.golden.max_p95_latency_ms) : 'no limit',
        ],
      ]
    : [['Quality bar', 'none']];
  rows.push([
    'Attacks that must be blocked',
    `${pctText(q.data?.injection_bar) ?? EMPTY}${p?.injection ? '' : ' (default)'}`,
  ]);
  rows.push([
    'Versions that only read',
    p?.injection?.read_only === 'optional'
      ? 'Safety tests optional'
      : 'Need safety tests (default)',
  ]);
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1">
            Go-live bar <TermTip term="goLiveBar" />
          </span>
        }
        description="For every version of this assistant."
        actions={
          q.isSuccess && (
            <GatedButton size="sm" deniedReason={cannotPublish} onClick={() => setEditing(true)}>
              Edit bar
            </GatedButton>
          )
        }
      />
      <div className="p-4 text-[12.5px]">
        {q.isPending ? (
          <LoadingState rows={2} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} className="m-0" />
        ) : (
          <>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
              {rows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-fg-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {q.data.updated_at && (
              <p className="mt-2 text-[12px] text-fg-subtle">
                Set {formatDateTime(q.data.updated_at)}
                {q.data.updated_by && ` by ${q.data.updated_by}`}
              </p>
            )}
          </>
        )}
      </div>
      {editing && (
        <PolicyEditor
          tenantId={tenantId}
          name={name}
          initial={policyForm(p)}
          onClose={() => setEditing(false)}
        />
      )}
    </Card>
  );
}

/** The headline metrics of an eval for the list. */
function Metrics({ e }: { e: Eval }) {
  const g = goldenSummary(e);
  const i = injectionSummary(e);
  if (g) {
    return (
      <span className="tabular-nums">
        {g.by_case.filter((c) => c.all_passed).length} of {g.cases} passed all {g.k} tries
        {failedEveryTry(failingCases(g)).length > 0 &&
          `, ${failedEveryTry(failingCases(g)).length} failed every try`}{' '}
        · {formatUsd(g.cost_per_success_usd)} per good answer · 95% under{' '}
        {formatMs(g.latency_ms?.p95)}
      </span>
    );
  }
  if (i) {
    return (
      <span className="tabular-nums">
        {i.pass_rate == null
          ? 'No result (errors)'
          : `${formatPercent(i.pass_rate)} of attacks blocked`}{' '}
        · still did its job in {formatPercent(i.utility_under_attack)}
      </span>
    );
  }
  return <span className="text-fg-subtle">{e.error ?? EMPTY}</span>;
}

function EvalList({
  evals,
  onOpen,
}: {
  evals: UseQueryResult<{ data?: Eval[] }>;
  onOpen: (id: string) => void;
}) {
  if (evals.isPending) return <LoadingState rows={3} />;
  if (evals.isError) return <ErrorState error={evals.error} onRetry={() => void evals.refetch()} />;
  const list = evals.data.data ?? [];
  if (list.length === 0) {
    return (
      <EmptyState
        title="No tests of this version yet"
        description="Quality tests check its answers against your test cases; safety tests check it is not tricked by what it reads."
        learnMore={doc('guides/tests-and-go-live', 'run-tests')}
      />
    );
  }
  return (
    <Table label="Test runs">
      <THead>
        <tr>
          <TH>Test run</TH>
          <TH>Tests</TH>
          <TH>Status</TH>
          <TH className="text-right">Cases × tries</TH>
          <TH>Results</TH>
          <TH>Started</TH>
          <TH>By</TH>
        </tr>
      </THead>
      <TBody>
        {list.map((e) => (
          <TR key={e.id}>
            <TD>
              <Button
                size="sm"
                variant="ghost"
                className="font-mono"
                aria-label={`Open test run ${e.id}`}
                title={e.id}
                onClick={() => onOpen(e.id)}
              >
                {formatDateTime(e.created_at)}
              </Button>
            </TD>
            <TD>
              <Badge tone={e.suite === 'injection' ? 'warn' : 'accent'}>
                {EVAL_SUITE_LABEL[e.suite]}
              </Badge>
            </TD>
            <TD>
              <EvalStatusBadge status={e.status} />
            </TD>
            <TD className="text-right whitespace-nowrap tabular-nums">
              {e.case_count} × {e.k}
            </TD>
            <TD className="text-[12.5px]">
              <Metrics e={e} />
            </TD>
            <TD className="whitespace-nowrap text-fg-muted">{formatDateTime(e.created_at)}</TD>
            <TD className="max-w-48 truncate text-fg-muted" title={e.created_by}>
              {e.created_by ?? EMPTY}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

/**
 * The Tests tab of an assistant: per version, the go-live check, the go-live
 * bar, the test cases, and the version's test runs with their detail.
 */
export function EvalsPanel({
  tenantId,
  name,
  versions,
  version,
  evalId,
  onVersion,
  onEval,
}: {
  tenantId: string;
  name: string;
  versions: readonly Node[];
  version: number | undefined;
  evalId: string | undefined;
  onVersion: (v: number) => void;
  onEval: (id: string | undefined) => void;
}) {
  const perms = usePermissions();
  const [starting, setStarting] = useState(false);
  const selected =
    versions.find((v) => v.version === version) ??
    versions.find((v) => v.version === defaultEvalVersion(versions));
  const evals = useQuery({
    ...evalsQuery(tenantId, name, selected?.version ?? 0),
    enabled: Boolean(selected),
  });
  if (!selected) return null;
  const running = (evals.data?.data ?? []).some((e) => isEvalActive(e.status));
  const hasWriteTools = (
    (selected.spec as { tools?: Array<{ effect?: string }> }).tools ?? []
  ).some((t) => t.effect === 'write');
  const cannotStart = !perms.can('nodes.run', tenantId)
    ? NO_RUN(tenantId)
    : selected.state !== 'published'
      ? `Only published versions can be tested: v${selected.version} is a ${selected.state === 'draft' ? 'draft' : 'retired version'}.`
      : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
          Version
          <Select
            value={String(selected.version)}
            onChange={(e) => onVersion(Number(e.target.value))}
            className="w-56"
          >
            {[...versions].reverse().map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version} (
                {v.state === 'draft' ? 'draft' : v.state === 'published' ? 'published' : 'retired'}
                {v.live ? ', live' : ''})
              </option>
            ))}
          </Select>
        </label>
        <span className="inline-flex items-center gap-1.5">
          <NodeStateBadge state={selected.state} />
          {selected.live && <LiveBadge />}
        </span>
        <GatedButton
          variant="primary"
          className="ml-auto"
          deniedReason={cannotStart}
          onClick={() => setStarting(true)}
        >
          Run tests
        </GatedButton>
      </div>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <GateCard
          key={selected.version}
          tenantId={tenantId}
          name={name}
          version={selected}
          live={versions.find((v) => v.live)?.version}
          evals={evals.data?.data ?? []}
          polling={running}
          onOpenEval={onEval}
        />
        <PolicyCard tenantId={tenantId} name={name} />
      </div>
      <GoldenSetCard tenantId={tenantId} name={name} version={selected.version} />
      <Card>
        <CardHeader
          title={`Test runs of v${selected.version}`}
          description="Newest first. The go-live check counts the latest finished run of each kind of test."
        />
        <EvalList evals={evals} onOpen={onEval} />
      </Card>
      {starting && (
        <StartEvalDrawer
          tenantId={tenantId}
          name={name}
          version={selected.version}
          hasWriteTools={hasWriteTools}
          onClose={() => setStarting(false)}
          onStarted={(e) => {
            setStarting(false);
            onEval(e.id);
          }}
        />
      )}
      <Drawer
        open={evalId !== undefined}
        onClose={() => onEval(undefined)}
        title={evalId ? 'Test run' : ''}
        description={`${name}: results per test case and every try.`}
      >
        {evalId && <EvalDetail tenantId={tenantId} evalId={evalId} />}
      </Drawer>
    </>
  );
}
