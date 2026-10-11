import type { ConsoleRun, RunStatus, RunStep } from '@/api/types';
import { RUN_STATUSES } from '@/api/types';
import type { Tone } from '@/components/ui';

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  sleeping: 'Sleeping',
  input_required: 'Waiting for a human',
  succeeded: 'Succeeded',
  failed: 'Failed',
  budget_exhausted: 'Budget exhausted',
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

/** A tainted write waiting for approval, read from the question the executor asks. */
export interface ApprovalRequest {
  /** The tool reference (`mcp://server/tool#sha256:...`). */
  tool: string;
  /** The untrusted taint labels its arguments carry (`tool:crm/find`, `datasource`, ...). */
  labels: string[];
  /** The arguments, parsed when they are complete JSON. */
  args: unknown;
  /** The executor cut the arguments at 2000 characters: `args` is the raw text. */
  truncated: boolean;
}

// The question `approve_write` (core, caliban-nodes executor/graph.rs) asks.
const APPROVAL =
  /^Approve this write\? Tool (\S+) \(effect: write\) would be called with arguments derived from untrusted data \(([^)]*)\): ([\s\S]*)\. Answer \{"approve": true\} or \{"approve": false\}\.$/;

/**
 * The tool, taint labels and arguments of an approval question. Null when the
 * question has another shape: the caller then shows it as it is.
 */
export function parseApproval(question: string | null | undefined): ApprovalRequest | null {
  if (!question) return null;
  const m = APPROVAL.exec(question);
  if (!m) return null;
  const raw = m[3]!;
  const labels = m[2]!
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);
  if (raw.endsWith('...')) return { tool: m[1]!, labels, args: raw, truncated: true };
  try {
    return { tool: m[1]!, labels, args: JSON.parse(raw) as unknown, truncated: false };
  } catch {
    return { tool: m[1]!, labels, args: raw, truncated: true };
  }
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
    { label: 'Subnode depth', used: num(b.depth_used), limit: num(b.depth_limit), unit: 'int' },
    { label: 'Map fan-out', used: num(b.fanout_used), limit: num(b.fanout_limit), unit: 'int' },
  ];
  return rows.filter((r) => r.used != null || r.limit != null);
}

/** A JSON value as indented text for a code block. */
export function prettyJson(v: unknown): string {
  if (typeof v === 'string') return v;
  return JSON.stringify(v, null, 2) ?? 'null';
}
