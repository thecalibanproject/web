import type { NodeState } from '@/api/types';
import { Badge, type Tone } from '../ui';

const STATE_TONE: Record<NodeState, Tone> = { draft: 'info', published: 'ok', retired: 'neutral' };

const STATE_LABEL: Record<NodeState, string> = {
  draft: 'Draft',
  published: 'Published',
  retired: 'Retired',
};

const STATE_HINT: Record<NodeState, string> = {
  draft: 'Not answering requests yet. Publish it to test it.',
  published: 'Frozen and ready to test. Requests can name this version.',
  retired: 'No longer answers new requests. Conversations already started finished on it.',
};

export function NodeStateBadge({ state }: { state: NodeState }) {
  return (
    <Badge tone={STATE_TONE[state]} title={STATE_HINT[state]}>
      {STATE_LABEL[state]}
    </Badge>
  );
}

/** The live version: what answers requests that name no version. */
export function LiveBadge() {
  return (
    <Badge tone="accent" dot title="The live version answers requests that name no version.">
      Live
    </Badge>
  );
}
