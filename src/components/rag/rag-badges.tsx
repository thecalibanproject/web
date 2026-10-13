import type { RagDocumentStatus, RagFinding, RagTrust } from '@/api/types';
import { EMPTY, formatDateTime, formatInt } from '@/lib/format';
import {
  findingLabel,
  STATUS_HINT,
  STATUS_LABEL,
  STATUS_TONE,
  TRUST_HINT,
  TRUST_LABEL,
  documentCounts,
  type DocumentCounts,
  type Vetting,
} from '@/lib/rag';
import { Badge } from '../ui';
import { IconAlert } from '../ui/icons';

export function DocumentStatusBadge({ status }: { status: RagDocumentStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} title={STATUS_HINT[status]} dot>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function TrustBadge({ trust }: { trust: RagTrust }) {
  return (
    <Badge tone={trust === 'trusted' ? 'accent' : 'neutral'} title={TRUST_HINT[trust]}>
      {TRUST_LABEL[trust]}
    </Badge>
  );
}

export function DocFindingsBadge({ findings }: { findings: RagFinding[] }) {
  const n = findings.length;
  if (n === 0) return <span className="text-fg-subtle">None</span>;
  return (
    <Badge tone="danger" title={[...new Set(findings.map((f) => findingLabel(f.kind)))].join(', ')}>
      <IconAlert size={12} /> {n} problem{n === 1 ? '' : 's'}
    </Badge>
  );
}

/** Where an untrusted document stands against its collection's vetting deadline. */
export function VettingBadge({ vetting }: { vetting: Vetting }) {
  if (vetting.kind === 'none') return <span className="text-fg-subtle">{EMPTY}</span>;
  if (vetting.kind === 'on_release') {
    return (
      <Badge
        title={`Waiting for a person to decide. Releasing it gives its checks ${vetting.window} from the release.`}
      >
        {vetting.window} after release
      </Badge>
    );
  }
  const at = formatDateTime(vetting.deadline.toISOString());
  return vetting.kind === 'open' ? (
    <Badge tone="warn" title={`Its checks must pass by ${at}, or it fails.`}>
      {vetting.remaining} left
    </Badge>
  ) : (
    <Badge
      tone="danger"
      title={`The deadline passed at ${at}. A worker fails it instead of indexing it.`}
    >
      Time ran out
    </Badge>
  );
}

/** A collection's documents per status (newest version of each), as badges. */
export function DocumentCountBadges({ counts }: { counts: DocumentCounts | undefined }) {
  const rows = documentCounts(counts);
  if (rows.length === 0) return <span className="text-fg-subtle">None</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {rows.map(({ status, count }) => (
        <Badge key={status} tone={STATUS_TONE[status]} title={STATUS_HINT[status]}>
          {formatInt(count)} {STATUS_LABEL[status].toLowerCase()}
        </Badge>
      ))}
    </span>
  );
}
