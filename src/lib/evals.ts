import type {
  Eval,
  EvalPolicy,
  EvalStatus,
  EvalTrial,
  GateEvidence,
  GoldenCase,
  GoldenSummary,
  GoldenVerdict,
  InjectionSummary,
  InjectionVerdict,
  Node,
} from '@/api/types';
import type { Tone } from '@/components/ui';

export const EVAL_STATUS_TONE: Record<EvalStatus, Tone> = {
  pending: 'neutral',
  running: 'info',
  succeeded: 'ok',
  failed: 'danger',
  cancelled: 'neutral',
};

/** A test run's state in plain words: "succeeded" read as "the tests passed", which it does not mean. */
export const EVAL_STATUS_LABEL: Record<EvalStatus, string> = {
  pending: 'Waiting to start',
  running: 'Running',
  succeeded: 'Finished',
  failed: 'Could not finish',
  cancelled: 'Cancelled',
};

export const EVAL_SUITE_LABEL: Record<Eval['suite'], string> = {
  golden: 'Quality tests',
  injection: 'Safety tests',
};

/** Why a role cannot start or cancel evals. */
export const NO_RUN = (tenantId?: string) =>
  `Your role cannot start or cancel tests${tenantId ? ' in this workspace' : ''} (needs nodes.run).`;

/** The version the Evals tab opens on: the live one, else the newest published, else the newest. */
export function defaultEvalVersion(versions: readonly Node[]): number | undefined {
  const live = versions.find((v) => v.live);
  if (live) return live.version;
  const published = versions.filter((v) => v.state === 'published');
  return (published[published.length - 1] ?? versions[versions.length - 1])?.version;
}

/** The eval has not ended: it is polled, and it can be cancelled. */
export function isEvalActive(status: EvalStatus): boolean {
  return status === 'pending' || status === 'running';
}

export function goldenSummary(e: Pick<Eval, 'suite' | 'summary'>): GoldenSummary | null {
  return e.summary?.suite === 'golden' ? e.summary : null;
}

export function injectionSummary(e: Pick<Eval, 'suite' | 'summary'>): InjectionSummary | null {
  return e.summary?.suite === 'injection' ? e.summary : null;
}

/** A trial's verdict (metadata only): golden checks, an injection verdict, or why it failed. */
export type TrialVerdict = NonNullable<EvalTrial['verdict']>;

export function isInjectionVerdict(v: TrialVerdict | undefined): v is InjectionVerdict {
  return Boolean(v && 'category' in v);
}

export function isGoldenVerdict(v: TrialVerdict | undefined): v is GoldenVerdict {
  return Boolean(v && 'checks' in v);
}

/** The error of a trial whose run could not be created. */
export function verdictError(v: TrialVerdict | undefined): string | null {
  return v && 'error' in v && typeof v.error === 'string' ? v.error : null;
}

/** The evals that met the bar, by suite, then those of each pinned subnode version. */
export function evidenceEvals(
  evidence: GateEvidence | null | undefined,
  prefix = '',
): Array<{ label: string; eval: string }> {
  if (!evidence) return [];
  const out: Array<{ label: string; eval: string }> = [];
  if (evidence.golden) out.push({ label: `${prefix}golden`, eval: evidence.golden.eval });
  if (evidence.injection) out.push({ label: `${prefix}injection`, eval: evidence.injection.eval });
  for (const [sub, e] of Object.entries(evidence.subnodes ?? {})) {
    out.push(...evidenceEvals(e, `${prefix}${sub} `));
  }
  return out;
}

// ───────────── The promotion bar form ─────────────

/** The bar as form fields: ratios as percents, empty meaning unset. */
export interface PolicyForm {
  minPassK: string;
  minK: string;
  maxCostPerSuccess: string;
  maxP95: string;
  injectionMinPassRate: string;
  /** Whether read-only versions (read tools, no write tool) need an injection eval. */
  injectionReadOnly: 'required' | 'optional';
}

const pct = (r: number | undefined) => (r == null ? '' : String(Math.round(r * 10000) / 100));

export function policyForm(p: EvalPolicy | undefined): PolicyForm {
  return {
    minPassK: pct(p?.golden?.min_pass_k),
    minK: p?.golden?.min_k != null ? String(p.golden.min_k) : '',
    maxCostPerSuccess:
      p?.golden?.max_cost_per_success_usd != null ? String(p.golden.max_cost_per_success_usd) : '',
    // Typed in seconds, stored in milliseconds (UX-40).
    maxP95: p?.golden?.max_p95_latency_ms != null ? String(p.golden.max_p95_latency_ms / 1000) : '',
    injectionMinPassRate: pct(p?.injection?.min_pass_rate),
    injectionReadOnly: p?.injection?.read_only ?? 'required',
  };
}

/** The text fields of the bar form. */
export type PolicyTextField = Exclude<keyof PolicyForm, 'injectionReadOnly'>;
export type PolicyErrors = Partial<Record<PolicyTextField, string>>;

/** The bar to PUT, or every reason it cannot be saved. */
export function policyFromForm(
  f: PolicyForm,
): { policy: EvalPolicy; errors: null } | { policy: null; errors: PolicyErrors } {
  const errors: PolicyErrors = {};
  const n = (s: string) => (s.trim() === '' ? undefined : Number(s.trim()));
  const percent = (key: PolicyTextField) => {
    const v = n(f[key]);
    if (v === undefined) return undefined;
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      errors[key] = 'A percent from 0 to 100.';
      return undefined;
    }
    return v / 100;
  };
  const minPassK = percent('minPassK');
  const injection = percent('injectionMinPassRate');
  const minK = n(f.minK);
  if (minK !== undefined && !(Number.isInteger(minK) && minK >= 1 && minK <= 10)) {
    errors.minK = 'A whole number from 1 to 10.';
  }
  const cost = n(f.maxCostPerSuccess);
  if (cost !== undefined && !(Number.isFinite(cost) && cost > 0)) {
    errors.maxCostPerSuccess = 'An amount above 0.';
  }
  const p95s = n(f.maxP95);
  const p95 = p95s === undefined ? undefined : Math.round(p95s * 1000);
  if (p95s !== undefined && !(Number.isFinite(p95s) && p95 !== undefined && p95 >= 1)) {
    errors.maxP95 = 'A number of seconds above 0.';
  }
  const goldenSet = minK !== undefined || cost !== undefined || p95 !== undefined;
  if (minPassK === undefined && goldenSet && !errors.minPassK) {
    errors.minPassK = 'Set the least pass^k to use the other golden bars.';
  }
  if (Object.keys(errors).length > 0) return { policy: null, errors };
  const policy: EvalPolicy = {};
  if (minPassK !== undefined) {
    policy.golden = {
      min_pass_k: minPassK,
      ...(minK !== undefined ? { min_k: minK } : {}),
      ...(cost !== undefined ? { max_cost_per_success_usd: cost } : {}),
      ...(p95 !== undefined ? { max_p95_latency_ms: p95 } : {}),
    };
  }
  // `optional` needs a bar to sit in: the default, every attack blocked.
  if (injection !== undefined || f.injectionReadOnly === 'optional') {
    policy.injection = {
      min_pass_rate: injection ?? 1,
      ...(f.injectionReadOnly === 'optional' ? { read_only: 'optional' as const } : {}),
    };
  }
  return { policy, errors: null };
}

// ───────────── Golden set editing ─────────────

export const MAX_GOLDEN_CASES = 200;
const CASE_ID = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * Parses the golden set editor's JSON (an array of cases). Only the shape is
 * checked here; the control plane checks inputs against the input schema.
 */
export function parseGoldenCases(
  text: string,
): { cases: GoldenCase[]; error: null } | { cases: null; error: string } {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    return { cases: null, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (v && typeof v === 'object' && !Array.isArray(v) && 'cases' in v) v = v.cases;
  if (!Array.isArray(v)) return { cases: null, error: 'Expected an array of cases.' };
  if (v.length > MAX_GOLDEN_CASES) {
    return { cases: null, error: `At most ${MAX_GOLDEN_CASES} cases (found ${v.length}).` };
  }
  const seen = new Set<string>();
  for (const [i, c] of v.entries()) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      return { cases: null, error: `Case ${i + 1} is not an object.` };
    }
    const { id } = c as { id?: unknown };
    if (typeof id !== 'string' || !CASE_ID.test(id)) {
      return {
        cases: null,
        error: `Case ${i + 1} needs an id of 1 to 64 letters, digits, '_', '.' or '-'.`,
      };
    }
    if (seen.has(id)) return { cases: null, error: `Case id '${id}' is used twice.` };
    seen.add(id);
    if (!('input' in c)) return { cases: null, error: `Case '${id}' has no input.` };
  }
  return { cases: v as GoldenCase[], error: null };
}

/** The kinds of checks a case runs (`expected` counts as an exact check). */
export function checkKinds(c: GoldenCase): string[] {
  const kinds = (c.checks ?? []).map((k) => k.type);
  if (c.expected !== undefined) kinds.unshift('exact');
  return kinds;
}

/** What each kind of check asks of an answer, in plain words. */
export const CHECK_LABEL: Record<string, string> = {
  exact: 'Must equal',
  contains: 'Must mention',
  regex: 'Must match a pattern',
  json_schema: 'Must have these fields',
  llm_judge: 'Grader',
  // The same type checks both "must call" and "must not call": the per-try
  // verdict does not say which, so the label names the check, not the rule.
  tool_call: 'Action check',
};

export function checkLabel(type: string): string {
  return CHECK_LABEL[type] ?? type;
}

/** One check of a test case, described for people (the JSON stays in the editor). */
export function describeCheck(c: NonNullable<GoldenCase['checks']>[number]): string {
  const v = c as Record<string, unknown> & { type: string };
  const text = (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x));
  switch (v.type) {
    case 'contains': {
      const vals = Array.isArray(v.value) ? v.value : [v.value];
      return `Must mention ${vals.map((x) => `"${text(x)}"`).join(', ')}`;
    }
    case 'exact':
      return `Must equal ${text(v.value)}`;
    case 'regex':
      return `Must match the pattern ${text(v.pattern)}`;
    case 'json_schema':
      return 'Must have the expected fields';
    case 'llm_judge':
      return `Grader: ${text(v.rubric)}${v.reference !== undefined ? ' (compared with a reference answer)' : ''}`;
    case 'tool_call': {
      const args =
        v.args && typeof v.args === 'object' && Object.keys(v.args).length > 0
          ? ` with ${Object.entries(v.args as Record<string, unknown>)
              .map(([k, x]) => `${k} = ${text(x)}`)
              .join(', ')}`
          : '';
      return v.must_not_call
        ? `Must not call ${text(v.tool)}${args}`
        : `Must call ${text(v.tool)}${args}`;
    }
    default:
      return checkLabel(v.type);
  }
}
