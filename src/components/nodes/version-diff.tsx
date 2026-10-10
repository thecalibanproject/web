import { useQuery } from '@tanstack/react-query';
import { nodeDiffQuery } from '@/api/queries';
import type { Node, NodeDiffChange } from '@/api/types';
import { shortHash } from '@/lib/nodes';
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  type Tone,
} from '../ui';

const OP_TONE: Record<NodeDiffChange['op'], Tone> = {
  added: 'ok',
  removed: 'danger',
  changed: 'warn',
};

function Value({ value, present }: { value: unknown; present: boolean }) {
  if (!present) return <span className="text-fg-subtle">—</span>;
  const text = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value, null, 2);
  return (
    <pre className="max-h-48 max-w-96 overflow-auto font-mono text-[12px] whitespace-pre-wrap break-words">
      {text}
    </pre>
  );
}

/**
 * Compares two versions with the control plane's diff: both content hashes
 * and every changed JSON pointer (arrays compared index by index).
 */
export function VersionDiff({
  tenantId,
  name,
  versions,
  from,
  to,
  onChange,
}: {
  tenantId: string;
  name: string;
  versions: Node[];
  from: number | undefined;
  to: number | undefined;
  onChange: (from: number, to: number) => void;
}) {
  const ready = from !== undefined && to !== undefined && from !== to;
  const diff = useQuery({
    ...nodeDiffQuery(tenantId, name, from ?? 0, to ?? 0),
    enabled: ready,
  });

  const picker = (label: string, value: number | undefined, set: (v: number) => void) => (
    <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
      {label}
      <Select
        value={value === undefined ? '' : String(value)}
        onChange={(e) => set(Number(e.target.value))}
        className="w-36"
      >
        <option value="" disabled>
          Version…
        </option>
        {versions.map((v) => (
          <option key={v.version} value={v.version}>
            v{v.version} ({v.state})
          </option>
        ))}
      </Select>
    </label>
  );

  return (
    <Card role="region" aria-label="Compare versions" className="mt-6">
      <CardHeader
        title="Compare versions"
        description="What changed between two versions, by JSON pointer."
        actions={
          <>
            {picker('From', from, (v) => onChange(v, to ?? v))}
            {picker('To', to, (v) => onChange(from ?? v, v))}
          </>
        }
      />
      {versions.length < 2 ? (
        <EmptyState
          title="Only one version"
          description="Create another version to compare it with this one."
        />
      ) : !ready ? (
        <EmptyState
          title="Pick two different versions"
          description="Choose a version on each side to see what changed."
        />
      ) : diff.isPending ? (
        <LoadingState rows={3} />
      ) : diff.isError ? (
        <ErrorState error={diff.error} onRetry={() => void diff.refetch()} />
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 text-[12px] text-fg-muted">
            <span>
              v{diff.data.from?.version}{' '}
              <code className="font-mono" title={diff.data.from?.hash}>
                {shortHash(diff.data.from?.hash ?? '')}
              </code>
            </span>
            <span aria-hidden="true">→</span>
            <span>
              v{diff.data.to?.version}{' '}
              <code className="font-mono" title={diff.data.to?.hash}>
                {shortHash(diff.data.to?.hash ?? '')}
              </code>
            </span>
          </p>
          {diff.data.identical || (diff.data.changes ?? []).length === 0 ? (
            <EmptyState
              title="Identical specs"
              description="Both versions have the same content hash: only key order or formatting differ, if anything."
            />
          ) : (
            <Table label="Changes">
              <THead>
                <tr>
                  <TH>Path</TH>
                  <TH>Change</TH>
                  <TH>v{diff.data.from?.version}</TH>
                  <TH>v{diff.data.to?.version}</TH>
                </tr>
              </THead>
              <TBody>
                {(diff.data.changes ?? []).map((c) => (
                  <TR key={`${c.op}:${c.path}`} className="align-top">
                    <TD className="align-top font-mono text-[12px] break-all">{c.path || '/'}</TD>
                    <TD className="align-top">
                      <Badge tone={OP_TONE[c.op]}>{c.op}</Badge>
                    </TD>
                    <TD className="align-top">
                      <Value value={c.from} present={c.op !== 'added'} />
                    </TD>
                    <TD className="align-top">
                      <Value value={c.to} present={c.op !== 'removed'} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </>
      )}
    </Card>
  );
}
