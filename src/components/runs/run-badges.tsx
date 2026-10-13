import type { RunStatus } from '@/api/types';
import { RUN_STATUS_LABEL, RUN_STATUS_TONE } from '@/lib/runs';
import { EMPTY } from '@/lib/format';
import { Badge, type Tone } from '../ui';

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge tone={RUN_STATUS_TONE[status]} dot>
      {RUN_STATUS_LABEL[status]}
    </Badge>
  );
}

/** What a label says about where a value came from (also called a taint label). */
function taintOf(label: string): { tone: Tone; text: string; hint: string } {
  if (label === 'pii')
    return { tone: 'neutral', text: 'Personal data', hint: 'Holds personal data.' };
  if (label === 'datasource') {
    return { tone: 'info', text: 'Your database', hint: 'Read from your database.' };
  }
  if (label === 'caller') {
    return {
      tone: 'neutral',
      text: "Customer's message",
      hint: "From the customer's message: untrusted data.",
    };
  }
  if (label === 'retrieved') {
    return { tone: 'neutral', text: 'A document', hint: 'From a document: untrusted data.' };
  }
  if (label.startsWith('tool:')) {
    const tool = label.slice(5);
    return {
      tone: 'neutral',
      text: `Result of ${tool}`,
      hint: `From the result of ${tool}: untrusted data.`,
    };
  }
  return { tone: 'neutral', text: label, hint: 'Where the data came from.' };
}

/** Where the untrusted data in a value came from. */
export function TaintLabels({
  labels,
  empty = EMPTY,
}: {
  labels: readonly string[];
  empty?: string;
}) {
  if (labels.length === 0) return <span className="text-fg-subtle">{empty}</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {labels.map((l) => {
        const { tone, text, hint } = taintOf(l);
        // Plain words in the badge; the recorded label is in the run's JSON.
        return (
          <Badge key={l} tone={tone} title={hint}>
            {text}
          </Badge>
        );
      })}
    </span>
  );
}
