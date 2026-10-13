import { useState } from 'react';
import { usePermissions } from '@/api/auth';
import { useApproveTool } from '@/api/queries';
import type { ToolFinding, ToolStatus } from '@/api/types';
import { formatDateTime } from '@/lib/format';
import { deniedReason } from '@/lib/permissions';
import { FINDING_HINT, FINDING_LABEL, revealHidden, toolRef, type ManifestRow } from '@/lib/tools';
import { Badge, Checkbox, CodeBlock, CopyButton, FormError, GatedButton, type Tone } from '../ui';
import { IconAlert, IconCheck } from '../ui/icons';

const STATUS_TONE: Record<ToolStatus, Tone> = {
  discovered: 'warn',
  approved: 'ok',
  revoked: 'neutral',
};

const STATUS_LABEL: Record<ToolStatus, string> = {
  discovered: 'Not approved',
  approved: 'Approved',
  revoked: 'Revoked',
};

export function ToolStatusBadge({ status }: { status: ToolStatus | undefined }) {
  const s = status ?? 'discovered';
  return <Badge tone={STATUS_TONE[s]}>{STATUS_LABEL[s]}</Badge>;
}

export function FindingsBadge({ findings }: { findings: ToolFinding[] | undefined }) {
  const n = findings?.length ?? 0;
  if (n === 0) return <span className="text-fg-subtle">None</span>;
  return (
    <Badge
      tone="danger"
      title={[...new Set(findings!.map((f) => FINDING_LABEL[f.kind ?? 'instruction']))].join(', ')}
    >
      <IconAlert size={12} /> {n} finding{n === 1 ? '' : 's'}
    </Badge>
  );
}

/** What the injection scan flagged, shown before anything else about the tool. */
function Findings({ findings, acknowledged }: { findings: ToolFinding[]; acknowledged: boolean }) {
  return (
    <section
      aria-label="Injection scan findings"
      className="rounded-md border border-danger/50 bg-danger-soft p-3 text-[12.5px]"
    >
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-danger">
        <IconAlert size={15} className="shrink-0" />
        The injection scan flagged {findings.length} finding{findings.length === 1 ? '' : 's'}
      </h3>
      <p className="mt-1 text-fg-muted">
        This text reaches the model with every call. Read each finding: a tool description that
        talks to the model, hides text or asks for secrets is a prompt injection.
        {acknowledged && ' An approver acknowledged these findings.'}
      </p>
      <ul className="mt-2.5 flex flex-col gap-2.5">
        {findings.map((f, i) => {
          const kind = f.kind ?? 'instruction';
          return (
            <li
              key={i}
              className="flex flex-col gap-1 rounded border border-danger/30 bg-surface p-2.5"
            >
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone="danger">{FINDING_LABEL[kind]}</Badge>
                {f.location && (
                  <code className="font-mono text-[12px] text-fg-muted">{f.location}</code>
                )}
              </span>
              {f.excerpt && (
                <code className="font-mono text-[12px] break-words whitespace-pre-wrap text-fg">
                  {revealHidden(f.excerpt)}
                </code>
              )}
              <span className="text-[12px] text-fg-subtle">{FINDING_HINT[kind]}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Review of one manifest before approval: the scan findings first, then the
 * pin, the description and the input schema exactly as the model would see
 * them (hidden characters made visible). A manifest with findings is
 * approved only after an explicit acknowledgement.
 */
export function ToolReview({
  tenantId,
  server,
  row,
  onRevoke,
}: {
  tenantId: string;
  server: string;
  row: ManifestRow;
  onRevoke: () => void;
}) {
  const m = row.manifest;
  const name = m.name ?? '';
  const pin = m.pin ?? '';
  const findings = m.findings ?? [];
  const approve = useApproveTool(tenantId, server);
  const [ack, setAck] = useState(false);
  const denied = deniedReason(usePermissions(), 'tools.approve', tenantId);
  const approved = m.status === 'approved';
  const ref = toolRef(server, name, pin);

  return (
    <div className="flex flex-col gap-4 text-[13px]">
      {findings.length > 0 ? (
        <Findings findings={findings} acknowledged={Boolean(m.findings_acknowledged)} />
      ) : (
        <p className="flex items-start gap-2 rounded-md bg-ok-soft px-3 py-2 text-[12.5px] text-fg">
          <IconCheck size={14} className="mt-0.5 shrink-0 text-ok" />
          The injection scan found nothing. It is a heuristic: read the description and the schema
          anyway.
        </p>
      )}
      {row.reapproval && (
        <p className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-fg">
          <IconAlert size={14} className="mt-0.5 shrink-0 text-warn" />
          The system changed this action since it was approved. It is refused until this version is
          approved, and assistants then need a new version that uses it.
        </p>
      )}
      {row.superseded && (
        <p className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-fg">
          <IconAlert size={14} className="mt-0.5 shrink-0 text-warn" />
          The server now lists a different manifest for this tool, so calls pinned to this one are
          refused. Review the newer manifest.
        </p>
      )}

      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
        <dt className="text-fg-muted">Status</dt>
        <dd>
          <ToolStatusBadge status={m.status} />
        </dd>
        <dt className="text-fg-muted">Pin</dt>
        <dd className="flex min-w-0 items-center gap-1">
          <code className="font-mono text-[12px] break-all">{pin}</code>
          <CopyButton value={pin} label="Copy pin" compact />
        </dd>
        <dt className="text-fg-muted">Discovered</dt>
        <dd>{formatDateTime(m.discovered_at)}</dd>
        {m.approved_at && (
          <>
            <dt className="text-fg-muted">Approved</dt>
            <dd>
              {formatDateTime(m.approved_at)}
              {m.approved_by && ` by ${m.approved_by}`}
            </dd>
          </>
        )}
      </dl>

      <section aria-label="Description" className="flex flex-col gap-1">
        <h3 className="text-[12.5px] font-medium">Description</h3>
        <p className="rounded-md border border-border bg-surface-2 p-3 font-mono text-[12px] break-words whitespace-pre-wrap">
          {m.description ? revealHidden(m.description) : '(none)'}
        </p>
      </section>
      <section aria-label="Input schema" className="flex flex-col gap-1">
        <h3 className="text-[12.5px] font-medium">Input schema</h3>
        <CodeBlock
          label="Input schema JSON"
          language="json"
          code={revealHidden(JSON.stringify(m.input_schema ?? {}, null, 2))}
        />
      </section>

      {approved ? (
        <section
          aria-label="Reference"
          className="flex flex-col gap-2 rounded-md border border-border p-3"
        >
          <p className="text-[12.5px] text-fg-muted">
            Assistants use this action by this reference (the form fills it in):
          </p>
          <span className="flex min-w-0 items-center gap-1.5">
            <code className="min-w-0 flex-1 font-mono text-[12px] break-all">{ref}</code>
            <CopyButton value={ref} label="Copy reference" />
          </span>
          <span>
            <GatedButton size="sm" variant="danger" deniedReason={denied} onClick={onRevoke}>
              Revoke approval
            </GatedButton>
          </span>
        </section>
      ) : (
        <section
          aria-label="Approval"
          className="flex flex-col gap-3 rounded-md border border-border p-3"
        >
          {approve.isSuccess ? (
            <p role="status" className="text-[12.5px] text-ok">
              Approved. Assistants can now use{' '}
              <code className="font-mono break-all">{approve.data.ref ?? ref}</code>.
            </p>
          ) : (
            <>
              <p className="text-[12.5px] text-fg-muted">
                Approving lets the assistants of this workspace call this exact version of the
                action. Approvals are recorded in the audit log
                {findings.length > 0 ? ', with the findings and your acknowledgement.' : '.'}
              </p>
              {findings.length > 0 && (
                <Checkbox
                  label="I have read these findings and still approve this tool"
                  checked={ack}
                  disabled={Boolean(denied)}
                  onChange={(e) => {
                    setAck(e.target.checked);
                    approve.reset();
                  }}
                />
              )}
              <FormError error={approve.error} />
              <span>
                <GatedButton
                  variant="primary"
                  deniedReason={denied}
                  loading={approve.isPending}
                  disabled={findings.length > 0 && !ack}
                  onClick={() =>
                    approve.mutate({
                      tool: name,
                      pin,
                      acknowledgeFindings: findings.length > 0 && ack,
                    })
                  }
                >
                  Approve tool
                </GatedButton>
              </span>
            </>
          )}
        </section>
      )}
    </div>
  );
}
