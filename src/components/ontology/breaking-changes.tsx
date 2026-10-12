import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { parseNodeVersion, type BreakingChange } from '@/lib/ontology';
import { Checkbox } from '../ui';
import { IconAlert } from '../ui/icons';

function NodeVersionLink({ tenantId, nodeRef }: { tenantId: string; nodeRef: string }) {
  const parsed = parseNodeVersion(nodeRef);
  if (!parsed) return <span className="font-mono">{nodeRef}</span>;
  return (
    <Link
      to="/nodes/$tenantId/$nodeName"
      params={{ tenantId, nodeName: parsed.name }}
      className="font-mono text-accent hover:underline"
    >
      {nodeRef}
    </Link>
  );
}

/**
 * A breaking-change refusal (`409`): the approved elements a change would
 * withdraw and the published node versions whose fixed queries use them, with
 * the explicit acknowledgement that sends it again with `acknowledge_breaking`.
 */
export function BreakingChanges({
  tenantId,
  changes,
  message,
  acknowledged,
  onAcknowledge,
  disabled,
  children,
}: {
  tenantId: string;
  changes: BreakingChange[];
  /** The server's message, shown when it named nothing the console could read. */
  message: string;
  acknowledged: boolean;
  onAcknowledge: (ack: boolean) => void;
  disabled?: boolean;
  /** The action that goes ahead (enabled once acknowledged). */
  children: ReactNode;
}) {
  return (
    <section
      aria-label="Breaking change"
      className="flex flex-col gap-3 rounded-md border border-danger/50 bg-danger-soft p-3 text-[12.5px]"
    >
      <h4 className="flex items-center gap-1.5 text-[13px] font-semibold text-danger">
        <IconAlert size={15} className="shrink-0" />
        This breaks published node versions
      </h4>
      {changes.length === 0 ? (
        <p className="text-fg">{message}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {changes.map((c) => (
            <li key={c.element} className="rounded border border-danger/30 bg-surface p-2.5">
              <span className="font-mono">{c.element}</span>
              {c.change && <span className="text-fg-muted"> ({c.change})</span>} is used by{' '}
              {c.nodes.map((n, i) => (
                <span key={n}>
                  {i > 0 && ', '}
                  <NodeVersionLink tenantId={tenantId} nodeRef={n} />
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
      <p className="text-fg-muted">
        Their fixed queries were written for an earlier ontology version. Once this goes ahead they
        fail on those queries until versions written on the new ontology are published.
      </p>
      <Checkbox
        label="I understand these node versions will fail on their queries"
        checked={acknowledged}
        disabled={disabled}
        onChange={(e) => onAcknowledge(e.target.checked)}
      />
      <span>{children}</span>
    </section>
  );
}
