import { useId, useState, type FormEvent } from 'react';
import { useUpdateTenant } from '@/api/queries';
import type { NodeCaps, Tenant, TenantUpdate } from '@/api/types';
import { formatInt } from '@/lib/format';
import { Badge, Button, Field, FormError, Input } from '../ui';
import { useSavedTenant } from './use-saved-tenant';

/** The control plane's caps when `node_caps` is null. */
const DEFAULT_NODE_CAPS = {
  steps: 200,
  tokens: 2_000_000,
  wall_clock_s: 3600,
  depth: 5,
  fanout: 32,
} as const satisfies NodeCaps;

type CapKey = keyof typeof DEFAULT_NODE_CAPS;

const CAP_FIELDS: Array<{ key: CapKey; label: string; hint: string }> = [
  {
    key: 'steps',
    label: 'Steps per run',
    hint: 'Vertex executions that call a model, a tool or a human.',
  },
  {
    key: 'tokens',
    label: 'Tokens per run',
    hint: 'Prompt plus completion tokens of every model call.',
  },
  {
    key: 'wall_clock_s',
    label: 'Wall clock per run (seconds)',
    hint: 'Execution time, not time waiting for a human or a timer.',
  },
  { key: 'depth', label: 'Subnode depth', hint: 'Nesting of subnode vertices and node:// tools.' },
  { key: 'fanout', label: 'Map fan-out', hint: 'map branches running at once.' },
];

interface Limits extends Record<CapKey, string> {
  usd: string;
  daily_usd: string;
  monthly_usd: string;
}

const str = (n: number | null | undefined) => (n == null ? '' : String(n));

function savedLimits(t: Tenant): Limits {
  const caps = t.node_caps ?? DEFAULT_NODE_CAPS;
  return {
    steps: str(caps.steps),
    tokens: str(caps.tokens),
    wall_clock_s: str(caps.wall_clock_s),
    depth: str(caps.depth),
    fanout: str(caps.fanout),
    usd: str(t.node_caps?.usd),
    daily_usd: str(t.node_spend_caps?.daily_usd),
    monthly_usd: str(t.node_spend_caps?.monthly_usd),
  };
}

/** The default caps, keeping the spend caps as they are. */
function defaultLimits(spend: Pick<Limits, 'daily_usd' | 'monthly_usd'>): Limits {
  return {
    steps: str(DEFAULT_NODE_CAPS.steps),
    tokens: str(DEFAULT_NODE_CAPS.tokens),
    wall_clock_s: str(DEFAULT_NODE_CAPS.wall_clock_s),
    depth: str(DEFAULT_NODE_CAPS.depth),
    fanout: str(DEFAULT_NODE_CAPS.fanout),
    usd: '',
    ...spend,
  };
}

type Errors = Partial<Record<keyof Limits, string>>;

function validate(v: Limits): Errors {
  const e: Errors = {};
  for (const { key } of CAP_FIELDS) {
    const raw = v[key].trim();
    if (!/^\d+$/.test(raw) || Number(raw) < 1) e[key] = 'Enter a whole number of at least 1.';
  }
  const usd = v.usd.trim();
  if (usd && !(Number(usd) > 0)) {
    e.usd = 'Enter an amount above 0, or leave it empty for no per-run cap.';
  }
  for (const key of ['daily_usd', 'monthly_usd'] as const) {
    const raw = v[key].trim();
    if (raw && !(Number(raw) >= 0)) e[key] = 'Enter an amount of 0 or more, or leave it empty.';
  }
  return e;
}

const same = (a: string, b: string) => a.trim() === b.trim() || Number(a) === Number(b);

/**
 * Only what changed: the whole `node_caps` object when any cap changed
 * (`null` when the defaults are restored), and `node_spend_caps` (`null` when
 * both are cleared).
 */
function changes(t: Tenant, saved: Limits, draft: Limits, reset: boolean): TenantUpdate {
  const body: TenantUpdate = {};
  const capsChanged =
    CAP_FIELDS.some(({ key }) => !same(saved[key], draft[key])) ||
    draft.usd.trim() !== saved.usd.trim();
  if (reset) {
    // Restoring the defaults clears the caps; the form shows the default values.
    if (t.node_caps != null) body.node_caps = null;
  } else if (capsChanged) {
    const caps: NodeCaps = {
      steps: Number(draft.steps),
      tokens: Number(draft.tokens),
      wall_clock_s: Number(draft.wall_clock_s),
      depth: Number(draft.depth),
      fanout: Number(draft.fanout),
    };
    if (draft.usd.trim()) caps.usd = Number(draft.usd);
    body.node_caps = caps;
  }
  const spendChanged =
    draft.daily_usd.trim() !== saved.daily_usd.trim() ||
    draft.monthly_usd.trim() !== saved.monthly_usd.trim();
  if (spendChanged) {
    const daily = draft.daily_usd.trim();
    const monthly = draft.monthly_usd.trim();
    body.node_spend_caps =
      daily || monthly
        ? {
            ...(daily ? { daily_usd: Number(daily) } : {}),
            ...(monthly ? { monthly_usd: Number(monthly) } : {}),
          }
        : null;
  }
  return body;
}

/**
 * "Node limits" on the tenant detail page: the caps every node version's
 * budgets must fit when it is published or made live (`node_caps`), and the
 * daily and monthly caps on what the tenant's node runs spend
 * (`node_spend_caps`). Saved with PATCH /tenants/{id}, audited as
 * `tenant.update`.
 */
export function NodeLimitsSection({
  tenant,
  readOnly = false,
}: {
  tenant: Tenant;
  readOnly?: boolean;
}) {
  const update = useUpdateTenant(tenant.id);
  const headingId = useId();
  const { current, saved: showSaved } = useSavedTenant(tenant);
  const saved = savedLimits(current);
  const [draft, setDraft] = useState<{ values: Limits; reset: boolean } | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const values = draft?.values ?? saved;
  const reset = draft?.reset ?? false;
  const errors = validate(values);
  const invalid = Object.keys(errors).length > 0;
  const body = invalid ? {} : changes(current, saved, values, reset);
  const dirty = draft != null && (invalid || Object.keys(body).length > 0);
  const deleted = tenant.status === 'deleted';
  const locked = deleted || readOnly || update.isPending;
  const usingDefaults = current.node_caps == null;

  const edit = (patch: Partial<Limits>) => {
    setDraft({ values: { ...values, ...patch }, reset: false });
    setSavedNotice(false);
    update.reset();
  };

  const restoreDefaults = () => {
    setDraft({
      values: defaultLimits({ daily_usd: values.daily_usd, monthly_usd: values.monthly_usd }),
      reset: true,
    });
    setSavedNotice(false);
    update.reset();
  };

  const cancel = () => {
    setDraft(null);
    update.reset();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || locked || invalid) return;
    update.mutate(body, {
      onSuccess: (after) => {
        showSaved(after);
        setDraft(null);
        setSavedNotice(true);
      },
    });
  };

  // A render prop for `Field`: called, not mounted, so the input keeps its focus.
  const input =
    (key: keyof Limits, decimal = false) =>
    ({
      id,
      describedBy,
      invalid: bad,
    }: {
      id: string;
      describedBy: string | undefined;
      invalid: boolean;
    }) => (
      <Input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={bad}
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={values[key]}
        disabled={locked}
        placeholder={decimal ? 'No cap' : undefined}
        onChange={(e) => edit({ [key]: e.target.value })}
      />
    );

  return (
    <section
      aria-labelledby={headingId}
      className="mt-6 rounded-lg border border-border bg-surface"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h2 id={headingId} className="text-[13px] font-semibold text-fg">
            Node limits
          </h2>
          <p className="text-[12px] text-fg-muted">
            {deleted
              ? 'This tenant was deleted. Its limits can no longer be changed.'
              : readOnly
                ? 'Read only: your role cannot change these limits.'
                : 'Every node version must fit the caps when it is published or made live. Lowering them does not change versions already published. Every change is recorded in the audit log.'}
          </p>
        </div>
        {usingDefaults && !draft && (
          <Badge title="node_caps is not set: the control plane's defaults apply.">Defaults</Badge>
        )}
      </div>
      <form onSubmit={onSubmit} aria-label="Node limits" className="flex flex-col gap-5 p-4">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-[12.5px] font-medium text-fg">
            Caps on a version&apos;s budgets
          </legend>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            {CAP_FIELDS.map(({ key, label, hint }) => (
              <Field
                key={key}
                label={label}
                error={errors[key]}
                hint={`${hint} Default ${formatInt(DEFAULT_NODE_CAPS[key])}.`}
              >
                {input(key)}
              </Field>
            ))}
            <Field
              label="USD per run"
              error={errors.usd}
              hint="When set, every version must declare budgets.usd within it. Empty: no per-run cap."
            >
              {input('usd', true)}
            </Field>
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-[12.5px] font-medium text-fg">Node spend caps</legend>
          <p className="-mt-1 text-[12px] text-fg-muted">
            What the tenant&apos;s node runs may spend on model calls, priced like the metering, per
            UTC day and month, across all workers. Checked before every model call: a run that
            reaches a cap ends gracefully as budget_exhausted. Empty: no cap.
          </p>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Field label="Daily spend cap (USD)" error={errors.daily_usd}>
              {input('daily_usd', true)}
            </Field>
            <Field label="Monthly spend cap (USD)" error={errors.monthly_usd}>
              {input('monthly_usd', true)}
            </Field>
          </div>
        </fieldset>
        <FormError error={update.error} />
        {!readOnly && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {/* Always mounted so screen readers announce the change. */}
            <p role="status" className="mr-auto text-[12.5px] text-fg-muted">
              {dirty ? 'Unsaved changes' : savedNotice ? 'Limits saved.' : ''}
            </p>
            <Button
              variant="ghost"
              onClick={restoreDefaults}
              disabled={locked || (usingDefaults && !draft) || reset}
            >
              Restore default caps
            </Button>
            <Button onClick={cancel} disabled={!dirty || locked}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={update.isPending}
              disabled={!dirty || deleted || invalid}
            >
              Save
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}
