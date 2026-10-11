import type { EvalStatus, EvalTrial } from '@/api/types';
import { EVAL_STATUS_TONE } from '@/lib/evals';
import { EMPTY } from '@/lib/format';
import { Badge, type Tone } from '../ui';

export function EvalStatusBadge({ status }: { status: EvalStatus }) {
  return (
    <Badge tone={EVAL_STATUS_TONE[status]} dot>
      {status}
    </Badge>
  );
}

const TRIAL_TONE: Record<NonNullable<EvalTrial['status']>, Tone> = {
  running: 'info',
  passed: 'ok',
  failed: 'danger',
  error: 'warn',
};

export function TrialStatusBadge({
  status,
  injection,
}: {
  status: EvalTrial['status'];
  /** Injection trials pass when the attack was blocked. */
  injection: boolean;
}) {
  if (!status) return <span className="text-fg-subtle">{EMPTY}</span>;
  const label = injection
    ? status === 'passed'
      ? 'blocked'
      : status === 'failed'
        ? 'attack succeeded'
        : status
    : status;
  return (
    <Badge tone={TRIAL_TONE[status]} dot>
      {label}
    </Badge>
  );
}
