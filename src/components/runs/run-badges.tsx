import type { RunStatus } from '@/api/types';
import { RUN_STATUS_LABEL, RUN_STATUS_TONE } from '@/lib/runs';
import { Badge, type Tone } from '../ui';

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge tone={RUN_STATUS_TONE[status]} dot>
      {RUN_STATUS_LABEL[status]}
    </Badge>
  );
}

/** What a taint label says about where a value came from. */
function taintOf(label: string): { tone: Tone; hint: string } {
  if (label === 'pii') return { tone: 'danger', hint: 'Holds personal data.' };
  if (label === 'datasource') return { tone: 'info', hint: 'Read from a tenant datasource.' };
  if (label === 'caller') {
    return { tone: 'warn', hint: 'Untrusted data the caller passed in the run input.' };
  }
  if (label === 'retrieved') return { tone: 'warn', hint: 'Retrieved from a document store.' };
  if (label.startsWith('tool:')) {
    return { tone: 'warn', hint: `Came from the output of the untrusted tool ${label.slice(5)}.` };
  }
  return { tone: 'neutral', hint: 'Taint label.' };
}

/** Taint labels of a value: where untrusted data in it came from. */
export function TaintLabels({
  labels,
  empty = '-',
}: {
  labels: readonly string[];
  empty?: string;
}) {
  if (labels.length === 0) return <span className="text-fg-subtle">{empty}</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {labels.map((l) => {
        const { tone, hint } = taintOf(l);
        return (
          <Badge key={l} tone={tone} title={hint} className="font-mono">
            {l}
          </Badge>
        );
      })}
    </span>
  );
}
