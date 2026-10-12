import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { usePermissions } from '@/api/auth';
import { evalPolicyQuery, evalsQuery, gateQuery, usePutEvalPolicy } from '@/api/queries';
import type { Eval, Node } from '@/api/types';
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
  polling,
  onOpenEval,
}: {
  tenantId: string;
  name: string;
  version: Node;
  live: number | undefined;
  polling: boolean;
  onOpenEval: (id: string) => void;
}) {
  const gate = useQuery({
    ...gateQuery(tenantId, name, version.version),
    refetchInterval: polling ? 5_000 : false,
  });
  const cannotPublish = deniedReason(usePermissions(), 'nodes.publish', tenantId);
  const [promoting, setPromoting] = useState(false);
  const g = gate.data;
  // `path` names a pinned subnode version whose own gate failed.
  const problems = (g?.problems ?? []).map((p) => (p.path ? `${p.path}: ${p.message}` : p.message));
  const evidence = evidenceEvals(g?.evidence);
  return (
    <Card>
      <CardHeader
        title="Promotion gate"
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
      <div className="flex flex-col gap-2 p-4 text-[12.5px]">
        {gate.isPending ? (
          <LoadingState rows={2} />
        ) : gate.isError ? (
          <ErrorState error={gate.error} onRetry={() => void gate.refetch()} className="m-0" />
        ) : (
          <>
            <p className="flex flex-wrap items-center gap-2">
              {g?.allowed ? (
                <Badge tone="ok">
                  <IconCheck size={12} /> Meets the bar
                </Badge>
              ) : (
                <Badge tone="danger">
                  <IconAlert size={12} /> Blocked by the promotion bar
                </Badge>
              )}
              {g?.has_write_tools && (
                <Badge
                  tone="warn"
                  title="An injection eval is always required before it is made live."
                >
                  Write tools
                </Badge>
              )}
              {g?.has_untrusted_reads && !g.has_write_tools && (
                <Badge
                  tone="info"
                  title="Read tools that bring data in (MCP, datasource_query, rag_search): what it reads can steer its answer, so it needs an injection eval unless the bar makes that optional for read-only versions."
                >
                  Untrusted reads
                </Badge>
              )}
              {version.live && <LiveBadge />}
            </p>
            {g?.allowed && evidence.length === 0 && (
              <p className="text-fg-muted">
                No bar applies: the node sets no golden bar, and the version has no write tools and
                no reads that need an injection eval.
              </p>
            )}
            {evidence.length > 0 && (
              <p className="text-fg-muted">
                Met by{' '}
                {evidence.map(({ label, eval: id }, i) => (
                  <span key={id}>
                    {i > 0 && ', '}
                    the {label} eval{' '}
                    <button
                      type="button"
                      className="font-mono text-accent hover:underline"
                      onClick={() => onOpenEval(id)}
                    >
                      {id}
                    </button>
                  </span>
                ))}
                .
              </p>
            )}
            {problems.length > 0 && (
              <ul aria-label="Why the gate refuses" className="list-disc pl-5 text-danger">
                {problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
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
      title={`Promotion bar of ${name}`}
      description="What a version's latest evals must meet before it is made live. Changes are audited with the old and new bar."
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
        <h3 className="text-[12.5px] font-semibold">Golden set</h3>
        {field(
          'minPassK',
          'Least pass^k',
          'The share of cases whose k runs all passed. Empty: no golden bar.',
          '%',
        )}
        {field('minK', 'Least k', 'Runs per case the eval must have used. Default 1.')}
        {field('maxCostPerSuccess', 'Most cost per success', 'Optional.', 'USD')}
        {field('maxP95', 'Most p95 latency', 'Optional.', 'ms')}
        <h3 className="text-[12.5px] font-semibold">Injection suite</h3>
        {field(
          'injectionMinPassRate',
          'Least share of attacks blocked',
          'Empty: 100%, every attack blocked. Versions with write tools always need an injection eval, whatever the bar.',
          '%',
        )}
        <Field
          label="Read-only versions"
          hint="Versions with read tools that bring data in (MCP, datasource_query, rag_search) and no write tool: what they read can steer their answer, their only effect. Optional lets them be made live without an injection eval; one that ran is still checked against the bar."
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
              <option value="required">Need an injection eval (default)</option>
              <option value="optional">Injection eval optional</option>
            </Select>
          )}
        </Field>
        <FormError error={put.error} />
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
        ['Least pass^k', pctText(p.golden.min_pass_k) ?? EMPTY],
        ['Least k', String(p.golden.min_k ?? 1)],
        [
          'Most cost per success',
          p.golden.max_cost_per_success_usd != null
            ? formatUsd(p.golden.max_cost_per_success_usd)
            : 'none',
        ],
        [
          'Most p95 latency',
          p.golden.max_p95_latency_ms != null ? formatMs(p.golden.max_p95_latency_ms) : 'none',
        ],
      ]
    : [['Golden bar', 'none']];
  rows.push([
    'Attacks blocked',
    `${pctText(q.data?.injection_bar) ?? EMPTY}${p?.injection ? '' : ' (default)'}`,
  ]);
  rows.push([
    'Read-only versions',
    p?.injection?.read_only === 'optional'
      ? 'Injection eval optional'
      : 'Need an injection eval (default)',
  ]);
  return (
    <Card>
      <CardHeader
        title="Promotion bar"
        description="For every version of this node."
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
        pass^k {formatPercent(g.pass_hat_k)} · pass@1 {formatPercent(g.pass_at_1)} · per success{' '}
        {formatUsd(g.cost_per_success_usd)} · p95 {formatMs(g.latency_ms?.p95)}
      </span>
    );
  }
  if (i) {
    return (
      <span className="tabular-nums">
        blocked {formatPercent(i.pass_rate)} · attack success {formatPercent(i.attack_success_rate)}{' '}
        · utility {formatPercent(i.utility_under_attack)}
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
        title="No evals of this version yet"
        description="Start a golden eval to measure pass^k and cost per success, or the injection suite to measure how the defenses hold."
      />
    );
  }
  return (
    <Table label="Evals">
      <THead>
        <tr>
          <TH>Eval</TH>
          <TH>Suite</TH>
          <TH>Status</TH>
          <TH className="text-right">Trials</TH>
          <TH>Metrics</TH>
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
                aria-label={`Open eval ${e.id}`}
                onClick={() => onOpen(e.id)}
              >
                {e.id}
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
 * The Evals tab of a node: per version, the promotion gate, the node's
 * promotion bar, the golden set, and the version's evals with their detail.
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
  const cannotStart = !perms.can('nodes.run', tenantId)
    ? NO_RUN(tenantId)
    : selected.state !== 'published'
      ? `Only published versions are evaluated: v${selected.version} is ${selected.state}.`
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
                v{v.version} ({v.state}
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
          Start eval
        </GatedButton>
      </div>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <GateCard
          key={selected.version}
          tenantId={tenantId}
          name={name}
          version={selected}
          live={versions.find((v) => v.live)?.version}
          polling={running}
          onOpenEval={onEval}
        />
        <PolicyCard tenantId={tenantId} name={name} />
      </div>
      <GoldenSetCard tenantId={tenantId} name={name} version={selected.version} />
      <Card>
        <CardHeader
          title={`Evals of v${selected.version}`}
          description="Newest first. The gate counts each suite's latest succeeded eval of this version."
        />
        <EvalList evals={evals} onOpen={onEval} />
      </Card>
      {starting && (
        <StartEvalDrawer
          tenantId={tenantId}
          name={name}
          version={selected.version}
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
        title={evalId ? `Eval ${evalId}` : ''}
        description={`${name}: metrics, results per case and every trial.`}
      >
        {evalId && <EvalDetail tenantId={tenantId} evalId={evalId} />}
      </Drawer>
    </>
  );
}
