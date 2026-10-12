import type { RagDocumentStatus, RagFinding, RagTrust } from '@/api/types';
import { EMPTY, formatDateTime } from '@/lib/format';
import {
  findingLabel,
  STATUS_HINT,
  STATUS_LABEL,
  STATUS_TONE,
  TRUST_HINT,
  TRUST_LABEL,
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
      <IconAlert size={12} /> {n} finding{n === 1 ? '' : 's'}
    </Badge>
  );
}

/** Where an untrusted document stands against its collection's vetting deadline. */
export function VettingBadge({ vetting }: { vetting: Vetting }) {
  if (vetting.kind === 'none') return <span className="text-fg-subtle">{EMPTY}</span>;
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
      Deadline passed
    </Badge>
  );
}
