import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { breakingVersions, type BreakingChange } from '@/lib/ontology';
import { Checkbox } from '../ui';
import { IconAlert } from '../ui/icons';

function NodeVersionLink({
  tenantId,
  target,
}: {
  tenantId: string;
  target: ReturnType<typeof breakingVersions>[number];
}) {
  if (target.node === undefined) return <span className="font-mono">{target.ref}</span>;
  return (
    <Link
      to="/nodes/$tenantId/$nodeName"
      params={{ tenantId, nodeName: target.node }}
      search={{ version: target.version }}
      className="font-mono text-accent hover:underline"
    >
      {target.ref}
    </Link>
  );
}

function BreakingList({ tenantId, changes }: { tenantId: string; changes: BreakingChange[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {changes.map((c) => (
        <li key={c.element} className="rounded border border-danger/30 bg-surface p-2.5">
          <span className="font-mono">{c.element}</span>
          <span className="text-fg-muted"> ({c.change})</span> is used by{' '}
          {breakingVersions(c).map((t, i) => (
            <span key={t.ref}>
              {i > 0 && ', '}
              <NodeVersionLink tenantId={tenantId} target={t} />
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

/**
 * The breaking changes a call went ahead with (`acknowledge_breaking`), as its
 * response lists them: those node versions now fail on their queries.
 */
export function AcknowledgedBreaking({
  tenantId,
  changes,
}: {
  tenantId: string;
  changes: BreakingChange[];
}) {
  if (changes.length === 0) return null;
  return (
    <section
      aria-label="Acknowledged breaking changes"
      className="flex flex-col gap-2 rounded-md border border-danger/50 bg-danger-soft p-3 text-[12.5px]"
    >
      <p className="text-fg">
        These assistant versions now fail on their saved questions until new versions, written for
        the new dictionary, are published:
      </p>
      <BreakingList tenantId={tenantId} changes={changes} />
    </section>
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
        This breaks published assistant versions
      </h4>
      {changes.length === 0 ? (
        <p className="text-fg">{message}</p>
      ) : (
        <BreakingList tenantId={tenantId} changes={changes} />
      )}
      <p className="text-fg-muted">
        Their saved questions were written for an earlier version of the dictionary. Once this goes
        ahead they fail on those questions until new versions, written for the new dictionary, are
        published.
      </p>
      <Checkbox
        label="I understand these assistant versions will fail on their questions"
        checked={acknowledged}
        disabled={disabled}
        onChange={(e) => onAcknowledge(e.target.checked)}
      />
      <span>{children}</span>
    </section>
  );
}
