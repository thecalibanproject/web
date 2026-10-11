import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { usePermissions } from '@/api/auth';
import { toolManifestsQuery, useRevokeTool } from '@/api/queries';
import type { ToolServer } from '@/api/types';
import { EMPTY, formatDateTime } from '@/lib/format';
import { shortHash } from '@/lib/nodes';
import { deniedReason } from '@/lib/permissions';
import { manifestRows } from '@/lib/tools';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  CopyButton,
  Drawer,
  EmptyState,
  ErrorState,
  GatedButton,
  LoadingState,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../ui';
import { IconAlert, IconRefresh } from '../ui/icons';
import { ImportManifestsForm } from './import-manifests-form';
import { FindingsBadge, ToolReview, ToolStatusBadge } from './tool-review';

/**
 * The manifests recorded for one server: each tool's pin, scan findings and
 * approval state, with review and approval, and re-approval when the server
 * changed a tool that was approved.
 */
export function ServerTools({
  tenantId,
  server,
  discovering,
  discoverNotice,
  onDiscover,
}: {
  tenantId: string;
  server: ToolServer;
  discovering: boolean;
  discoverNotice: ReactNode;
  onDiscover: () => void;
}) {
  const name = server.name ?? '';
  const manifests = useQuery(toolManifestsQuery(tenantId, name));
  const rows = useMemo(() => manifestRows(manifests.data ?? []), [manifests.data]);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const revoke = useRevokeTool(tenantId, name);
  const perms = usePermissions();
  const cannotWrite = deniedReason(perms, 'tools.write', tenantId);
  const cannotApprove = deniedReason(perms, 'tools.approve', tenantId);
  const review = rows.find((r) => r.manifest.id === reviewing) ?? null;
  const revokeRow = rows.find((r) => r.manifest.id === revoking) ?? null;
  const changed = rows.filter((r) => r.reapproval).length;

  const closeRevoke = () => {
    setRevoking(null);
    revoke.reset();
  };

  return (
    <Card role="region" aria-label={`Tools of ${name}`} className="mt-6">
      <CardHeader
        title={
          <>
            Tools of <code className="font-mono">{name}</code>
          </>
        }
        description="Every manifest discovered on this server. Only approved manifests reach the data plane, and a node can only pin those."
        actions={
          <>
            <GatedButton size="sm" deniedReason={cannotWrite} onClick={() => setImporting(true)}>
              Import manifests
            </GatedButton>
            <GatedButton
              size="sm"
              icon={<IconRefresh size={14} />}
              deniedReason={cannotWrite}
              loading={discovering}
              onClick={onDiscover}
            >
              Discover tools
            </GatedButton>
          </>
        }
      />
      {discoverNotice}
      {changed > 0 && (
        <p
          role="status"
          className="mx-4 mt-3 flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-fg"
        >
          <IconAlert size={14} className="mt-0.5 shrink-0 text-warn" />
          {changed} tool{changed === 1 ? '' : 's'} changed since approval. Runs refuse a changed
          tool until its new manifest is approved; node versions must then pin the new reference.
        </p>
      )}
      {manifests.isPending ? (
        <LoadingState rows={3} />
      ) : manifests.isError ? (
        <ErrorState error={manifests.error} onRetry={() => void manifests.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No tools discovered yet"
          description="Discover the server's tools, or import their manifests if the control plane cannot reach it."
        />
      ) : (
        <Table label={`Manifests of ${name}`}>
          <THead>
            <tr>
              <TH>Tool</TH>
              <TH>Description</TH>
              <TH>Pin</TH>
              <TH>Status</TH>
              <TH>Scan findings</TH>
              <TH>Approved</TH>
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => {
              const m = r.manifest;
              return (
                <TR
                  key={m.id ?? `${m.name}-${m.pin}`}
                  className={r.superseded ? 'text-fg-subtle' : undefined}
                >
                  <TD className="font-mono text-[12.5px] font-medium">{m.name}</TD>
                  <TD className="max-w-72 truncate text-fg-muted" title={m.description}>
                    {m.description || EMPTY}
                  </TD>
                  <TD className="whitespace-nowrap">
                    <code className="font-mono text-[12px] text-fg-muted" title={m.pin}>
                      {shortHash(m.pin ?? '')}
                    </code>
                    <CopyButton value={m.pin ?? ''} label={`Copy pin of ${m.name}`} compact />
                  </TD>
                  <TD>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <ToolStatusBadge status={m.status} />
                      {r.reapproval && (
                        <Badge
                          tone="warn"
                          title="The server changed this tool after it was approved."
                        >
                          Changed: needs approval
                        </Badge>
                      )}
                      {r.superseded && (
                        <Badge title="The server now lists a different manifest: calls pinned to this one are refused.">
                          Superseded
                        </Badge>
                      )}
                    </span>
                  </TD>
                  <TD>
                    <FindingsBadge findings={m.findings} />
                  </TD>
                  <TD className="whitespace-nowrap text-fg-muted">
                    {m.approved_at ? formatDateTime(m.approved_at) : EMPTY}
                    {m.approved_by && (
                      <span className="block text-[11.5px] text-fg-subtle">{m.approved_by}</span>
                    )}
                  </TD>
                  <TD className="text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant={m.status === 'approved' ? 'ghost' : 'primary'}
                      aria-label={`Review ${m.name} (${shortHash(m.pin ?? '')})`}
                      onClick={() => setReviewing(m.id ?? null)}
                    >
                      {m.status === 'approved' ? 'View' : 'Review'}
                    </Button>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      <Drawer
        open={review !== null}
        onClose={() => setReviewing(null)}
        title={review ? `Review ${review.manifest.name}` : ''}
        description={`On ${name}. What the model sees when a node offers this tool.`}
      >
        {review && (
          <ToolReview
            tenantId={tenantId}
            server={name}
            row={review}
            onRevoke={() => setRevoking(review.manifest.id ?? null)}
          />
        )}
      </Drawer>
      <Drawer
        open={importing}
        onClose={() => setImporting(false)}
        title={`Import manifests for ${name}`}
      >
        {importing && (
          <ImportManifestsForm
            tenantId={tenantId}
            server={name}
            onDone={() => setImporting(false)}
          />
        )}
      </Drawer>
      <ConfirmDialog
        open={revokeRow !== null}
        title={`Revoke the approval of ${revokeRow?.manifest.name ?? ''}?`}
        confirmLabel="Revoke approval"
        loading={revoke.isPending}
        error={revoke.error}
        onCancel={closeRevoke}
        onConfirm={() => {
          if (revokeRow && !cannotApprove) {
            revoke.mutate(
              { tool: revokeRow.manifest.name ?? '', pin: revokeRow.manifest.pin ?? '' },
              { onSuccess: closeRevoke },
            );
          }
        }}
      >
        <p>
          Nodes can no longer pin this manifest, and it leaves the data plane with the next
          snapshot. Published versions that call it fail their calls to this tool.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
