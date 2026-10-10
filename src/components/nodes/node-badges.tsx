import type { NodeState } from '@/api/types';
import { Badge, type Tone } from '../ui';

const STATE_TONE: Record<NodeState, Tone> = { draft: 'info', published: 'ok', retired: 'neutral' };

const STATE_HINT: Record<NodeState, string> = {
  draft: 'Not on the data plane yet. Publish it to make it runnable.',
  published: 'On the data plane: runs can name this version.',
  retired: 'Off the data plane: new runs are refused. Runs already started finished on it.',
};

export function NodeStateBadge({ state }: { state: NodeState }) {
  return (
    <Badge tone={STATE_TONE[state]} title={STATE_HINT[state]}>
      {state}
    </Badge>
  );
}

/** The version the promotion pointer names: what a run without a version runs. */
export function LiveBadge() {
  return (
    <Badge tone="accent" dot title="The live version: what a run that names no version runs.">
      live
    </Badge>
  );
}
