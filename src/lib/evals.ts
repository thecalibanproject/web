import type { Eval, EvalPolicy, EvalStatus, GoldenCase, Node } from '@/api/types';
import type { Tone } from '@/components/ui';

export const EVAL_STATUS_TONE: Record<EvalStatus, Tone> = {
  pending: 'neutral',
  running: 'info',
  succeeded: 'ok',
  failed: 'danger',
  cancelled: 'neutral',
};

export const EVAL_SUITE_LABEL: Record<Eval['suite'], string> = {
  golden: 'Golden set',
  injection: 'Injection suite',
};

/** Why a role cannot start or cancel evals. */
export const NO_RUN = (tenantId?: string) =>
  `Your role cannot start or cancel evals${tenantId ? ' on this tenant' : ''} (needs nodes.run).`;

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

interface Latency {
  p50?: number | null;
  p95?: number | null;
}

/** A golden eval's `summary` (metrics only; untyped in the contract). */
export interface GoldenSummary {
  k?: number;
  cases?: number;
  trials?: number;
  passed_trials?: number;
  errors?: number;
  /** pass^k: the share of cases whose k runs all passed. */
  pass_hat_k?: number | null;
  /** The share of trials that passed. */
  pass_at_1?: number | null;
  /** The share of cases with at least one passing run. */
  pass_at_k?: number | null;
  cost_usd?: number | null;
  /** Null without a success. */
  cost_per_success_usd?: number | null;
  judge_cost_usd?: number | null;
  tokens?: number;
  latency_ms?: Latency;
  by_case?: Array<{ case: string; trials: number; passed: number; all_passed: boolean }>;
  golden_hash?: string;
  judge?: Record<string, unknown> | null;
}

/** An injection eval's `summary`. */
export interface InjectionSummary {
  suite_version?: number;
  trials?: number;
  /** Attacks blocked. */
  blocked?: number;
  /** The share of attacks blocked. */
  pass_rate?: number | null;
  attack_success_rate?: number | null;
  attacks_succeeded?: number;
  /** Trials where the model followed the injection. */
  attacked?: number;
  /** Runs that still did their job under attack. */
  utility_under_attack?: number | null;
  errors?: number;
  by_category?: Record<string, { trials: number; blocked: number; pass_rate: number | null }>;
  not_applicable?: Array<string | { case: string; reason?: string }>;
  cost_usd?: number | null;
  latency_ms?: Latency;
}

export function goldenSummary(e: Pick<Eval, 'suite' | 'summary'>): GoldenSummary | null {
  return e.suite === 'golden' && e.summary ? e.summary : null;
}

export function injectionSummary(e: Pick<Eval, 'suite' | 'summary'>): InjectionSummary | null {
  return e.suite === 'injection' && e.summary ? e.summary : null;
}

/** A case of the suite the version offers no surface for, with the reason when given. */
export function notApplicable(s: InjectionSummary): Array<{ case: string; reason: string | null }> {
  return (s.not_applicable ?? []).map((n) =>
    typeof n === 'string' ? { case: n, reason: null } : { case: n.case, reason: n.reason ?? null },
  );
}

/** A trial's verdict (metadata only; untyped in the contract). */
export interface TrialVerdict {
  run_status?: string;
  checks?: Array<{ type: string; passed: boolean; score?: number | null }>;
  category?: string;
  attacked?: boolean;
  succeeded?: boolean;
  defenses?: string[];
  utility?: boolean | null;
  error?: string;
}

export function verdictOf(v: unknown): TrialVerdict {
  return v && typeof v === 'object' ? v : {};
}

// ───────────── The promotion bar form ─────────────

/** The bar as form fields: ratios as percents, empty meaning unset. */
export interface PolicyForm {
  minPassK: string;
  minK: string;
  maxCostPerSuccess: string;
  maxP95: string;
  injectionMinPassRate: string;
}

const pct = (r: number | undefined) => (r == null ? '' : String(Math.round(r * 10000) / 100));

export function policyForm(p: EvalPolicy | undefined): PolicyForm {
  return {
    minPassK: pct(p?.golden?.min_pass_k),
    minK: p?.golden?.min_k != null ? String(p.golden.min_k) : '',
    maxCostPerSuccess:
      p?.golden?.max_cost_per_success_usd != null ? String(p.golden.max_cost_per_success_usd) : '',
    maxP95: p?.golden?.max_p95_latency_ms != null ? String(p.golden.max_p95_latency_ms) : '',
    injectionMinPassRate: pct(p?.injection?.min_pass_rate),
  };
}

/** The bar to PUT, or every reason it cannot be saved. */
export function policyFromForm(
  f: PolicyForm,
): { policy: EvalPolicy; errors: null } | { policy: null; errors: Partial<PolicyForm> } {
  const errors: Partial<PolicyForm> = {};
  const n = (s: string) => (s.trim() === '' ? undefined : Number(s.trim()));
  const percent = (key: keyof PolicyForm) => {
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
  const p95 = n(f.maxP95);
  if (p95 !== undefined && !(Number.isInteger(p95) && p95 >= 1)) {
    errors.maxP95 = 'Whole milliseconds, at least 1.';
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
  if (injection !== undefined) policy.injection = { min_pass_rate: injection };
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
