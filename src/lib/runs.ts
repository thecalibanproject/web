import type { AnswerCheck, AnswerRule, ConsoleRun, RunStatus, RunStep } from '@/api/types';
import type { components } from '@/api/schema';
import { RUN_STATUSES } from '@/api/types';

export type MastLabel = components['schemas']['MastLabel'];
export type GoldenCaseCapture = components['schemas']['GoldenCaseCapture'];
export type CapturedGoldenCase = components['schemas']['CapturedGoldenCase'];
import type { Tone } from '@/components/ui';

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  sleeping: 'Sleeping',
  input_required: 'Waiting for a person',
  succeeded: 'Succeeded',
  failed: 'Failed',
  budget_exhausted: 'Budget used up',
  cancelled: 'Cancelled',
};

export const RUN_STATUS_TONE: Record<RunStatus, Tone> = {
  pending: 'neutral',
  running: 'info',
  sleeping: 'neutral',
  input_required: 'warn',
  succeeded: 'ok',
  failed: 'danger',
  budget_exhausted: 'warn',
  cancelled: 'neutral',
};

const ACTIVE: readonly RunStatus[] = ['pending', 'running', 'sleeping', 'input_required'];

/** The run has not ended: its detail is polled until it does. */
export function isRunActive(status: RunStatus): boolean {
  return ACTIVE.includes(status);
}

/** The status filter: one status, or every status of a run that has not ended. */
export type RunStatusFilter = RunStatus | 'active';

export function isRunStatusFilter(v: unknown): v is RunStatusFilter {
  return v === 'active' || (RUN_STATUSES as readonly unknown[]).includes(v);
}

/** The API's comma-separated `status` for a filter. */
export function statusParam(filter: RunStatusFilter | undefined): string | undefined {
  if (!filter) return undefined;
  return filter === 'active' ? ACTIVE.join(',') : filter;
}

/** Time range presets of the run list (the API filters on `created_after`). */
export const RUN_SINCE = ['1h', '24h', '7d', '30d'] as const;
export type RunSince = (typeof RUN_SINCE)[number];

export const RUN_SINCE_LABEL: Record<RunSince, string> = {
  '1h': 'Last hour',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
};

const SINCE_MS: Record<RunSince, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
};

/** `created_after` for a preset, from `now`. */
export function sinceIso(since: RunSince, now: number = Date.now()): string {
  return new Date(now - SINCE_MS[since]).toISOString();
}

/** Milliseconds between two timestamps, or null when either is missing. */
export function elapsedMs(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  if (!from || !to) return null;
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/** One step placed on the run's timeline, in percent of the run's span. */
export interface TimelineStep {
  step: RunStep;
  /** Milliseconds from the first step's start. */
  offsetMs: number;
  left: number;
  width: number;
}

/**
 * Places steps on a common time axis: from the first step's start to the last
 * step's end. Steps of a map run side by side, so they can overlap.
 */
export function timeline(steps: readonly RunStep[]): { steps: TimelineStep[]; spanMs: number } {
  const starts = steps.map((s) => Date.parse(s.started_at));
  const valid = starts.filter(Number.isFinite);
  if (valid.length === 0) {
    return { steps: steps.map((step) => ({ step, offsetMs: 0, left: 0, width: 0 })), spanMs: 0 };
  }
  const t0 = Math.min(...valid);
  const end = Math.max(
    ...steps.map((s, i) => (Number.isFinite(starts[i]) ? starts[i]! + s.duration_ms : t0)),
  );
  const span = Math.max(end - t0, 1);
  return {
    spanMs: end - t0,
    steps: steps.map((step, i) => {
      const offsetMs = Number.isFinite(starts[i]) ? starts[i]! - t0 : 0;
      return {
        step,
        offsetMs,
        left: (offsetMs / span) * 100,
        width: Math.max((step.duration_ms / span) * 100, 0.5),
      };
    }),
  };
}

/** One budget dimension of a run: what it used against its limit. */
export interface BudgetRow {
  label: string;
  used: number | null;
  limit: number | null;
  unit: 'int' | 'usd' | 'ms';
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The run's budget as rows (the console run's `budget` is untyped in the contract). */
export function budgetRows(budget: ConsoleRun['budget']): BudgetRow[] {
  const b = budget as Record<string, unknown>;
  const rows: BudgetRow[] = [
    { label: 'Steps', used: num(b.steps_used), limit: num(b.steps_limit), unit: 'int' },
    { label: 'Tokens', used: num(b.tokens_used), limit: num(b.tokens_limit), unit: 'int' },
    { label: 'Spend', used: num(b.usd), limit: num(b.usd_limit), unit: 'usd' },
    {
      label: 'Execution time',
      used: num(b.wall_clock_ms_used),
      limit: num(b.wall_clock_ms_limit),
      unit: 'ms',
    },
    {
      label: 'Levels of sub-assistants',
      used: num(b.depth_used),
      limit: num(b.depth_limit),
      unit: 'int',
    },
    {
      label: 'Tasks in parallel',
      used: num(b.fanout_used),
      limit: num(b.fanout_limit),
      unit: 'int',
    },
  ];
  return rows.filter((r) => r.used != null || r.limit != null);
}

/** A JSON value as indented text for a code block. */
export function prettyJson(v: unknown): string {
  if (typeof v === 'string') return v;
  return JSON.stringify(v, null, 2) ?? 'null';
}

export const ANSWER_RULE_LABEL: Record<AnswerRule, string> = {
  untrusted_link: 'Link from untrusted text',
  untrusted_contact: 'Contact from untrusted text',
  untrusted_reference: 'Reference from an injected instruction',
  instruction_echo: 'Echo of an injected instruction',
};

export const ANSWER_ACTION_TONE: Record<NonNullable<AnswerCheck['action']>, Tone> = {
  passed: 'ok',
  redacted: 'warn',
  refused: 'danger',
};

/**
 * A trial run of a test: origin `eval:<eval>:<case>` (or the older
 * `eval:<eval>`). Hidden from the conversation list by default (UX-65).
 */
export function isTestRun(origin: string | null | undefined): boolean {
  return typeof origin === 'string' && origin.startsWith('eval:');
}

/** The eval and, in the newer form, the case a test run belongs to. */
export function testRunOf(
  origin: string | null | undefined,
): { evalId: string; caseId: string | null } | null {
  if (!isTestRun(origin)) return null;
  const [, evalId = '', ...rest] = origin!.split(':');
  return { evalId, caseId: rest.length ? rest.join(':') : null };
}

/** Who started a run, in plain words; the raw id stays in the title. */
export function startedBy(invoker: string | null | undefined, origin?: string | null): string {
  if (isTestRun(origin)) return 'A test run';
  if (!invoker) return 'Unknown';
  if (invoker === 'break_glass') return 'Shared admin token';
  if (invoker.startsWith('api_key:')) return `An app key (${invoker.slice(8, 14)})`;
  if (invoker.startsWith('eval:')) return 'A test run';
  return invoker;
}

/**
 * The MAST failure modes (arXiv 2503.13657) a reviewer can pick when saving a
 * wrong answer as a test, in plain words.
 */
export const MAST_LABEL: Record<MastLabel, string> = {
  disobey_task_specification: 'Did not do what the task asked',
  disobey_role_specification: 'Acted outside its role',
  step_repetition: 'Repeated the same step',
  loss_of_conversation_history: 'Forgot what was said earlier',
  unaware_of_termination_conditions: 'Did not know when to stop',
  conversation_reset: 'Started over for no reason',
  fail_to_ask_for_clarification: 'Should have asked a question first',
  task_derailment: 'Went off topic',
  information_withholding: 'Left out information it had',
  ignored_other_agent_input: 'Ignored what another assistant said',
  reasoning_action_mismatch: 'Did something other than what it reasoned',
  premature_termination: 'Stopped too early',
  no_or_incomplete_verification: 'Did not check its answer',
  incorrect_verification: 'Checked its answer wrongly',
};

/** Step kinds in plain words. */
export const STEP_KIND_LABEL: Record<string, string> = {
  llm: 'Model',
  tool: 'Tool or lookup',
  router: 'Choice',
  map: 'Parallel tasks',
  reduce: 'Merge',
  verify: 'Check',
  human: 'Person',
  approval: 'Approval',
  subnode: 'Sub-assistant',
  code: 'Code',
};
