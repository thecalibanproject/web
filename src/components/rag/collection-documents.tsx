import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { usePermissions } from '@/api/auth';
import { ragCollectionQuery, ragDocumentsQuery, useDeleteRagDocument } from '@/api/queries';
import type { RagCollection, RagDocument, RagDocumentStatus } from '@/api/types';
import { formatDateTime, formatInt } from '@/lib/format';
import { deniedReason } from '@/lib/permissions';
import {
  formatBytes,
  formatSeconds,
  settingsOf,
  STATUS_FILTERS,
  STATUS_LABEL,
  TRUST_LABEL,
  vettingOf,
} from '@/lib/rag';
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
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../ui';
import { IconAlert, IconPlus, IconTrash } from '../ui/icons';
import { DocumentReview } from './document-review';
import { IngestForm } from './ingest-form';
import { DocFindingsBadge, DocumentStatusBadge, TrustBadge, VettingBadge } from './rag-badges';

/** The published node versions that search the collection, linked to their nodes. */
function UsedBy({ tenantId, collection }: { tenantId: string; collection: string }) {
  const detail = useQuery(ragCollectionQuery(tenantId, collection));
  const users = detail.data?.used_by;
  if (!users) return null;
  return (
    <p className="text-[12.5px] text-fg-muted">
      {users.length === 0 ? (
        'No published node version names it in its scopes.'
      ) : (
        <>
          Searched by{' '}
          {users.map((u, i) => {
            const name = u.replace(/@v\d+$/, '');
            return (
              <span key={u}>
                {i > 0 && ', '}
                <Link
                  to="/nodes/$tenantId/$nodeName"
                  params={{ tenantId, nodeName: name }}
                  className="font-mono text-accent hover:underline"
                >
                  {u}
                </Link>
              </span>
            );
          })}
          . It cannot be deleted while they are published.
        </>
      )}
    </p>
  );
}

/**
 * The documents of one collection: the newest version of each with its
 * indexing state, findings and vetting deadline; ingest, delete, and the
 * review (and release) of a document's versions.
 */
export function CollectionDocuments({
  tenantId,
  collection,
  docId,
  onDoc,
}: {
  tenantId: string;
  collection: RagCollection;
  docId: string | undefined;
  onDoc: (docId: string | undefined) => void;
}) {
  const name = collection.name;
  const [status, setStatus] = useState<RagDocumentStatus | undefined>(undefined);
  const docs = useInfiniteQuery(ragDocumentsQuery(tenantId, name, status));
  const del = useDeleteRagDocument(tenantId, name);
  const [ingesting, setIngesting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const perms = usePermissions();
  const cannotWrite = deniedReason(perms, 'rag.write', tenantId);
  const settings = settingsOf(collection);
  const rows = docs.data?.pages.flatMap((p) => p.documents) ?? [];
  const quarantined = rows.filter((d) => d.status === 'quarantined').length;
  const scope = `rag.${name}:read`;

  const closeDelete = () => {
    setDeleting(null);
    del.reset();
  };

  const ingested = (doc: RagDocument & { unchanged?: boolean }) => {
    setIngesting(false);
    setNotice(
      doc.unchanged
        ? `${doc.doc_id} is unchanged: version ${doc.version} already has this content and these settings.`
        : `${doc.doc_id} version ${doc.version} is pending. It is searched once a worker has indexed it and its checks passed.`,
    );
  };

  return (
    <Card role="region" aria-label={`Documents of ${name}`} className="mt-6">
      <CardHeader
        title={
          <>
            Documents of <code className="font-mono">{name}</code>
          </>
        }
        description={`Embedded with ${collection.embedding_model}${
          collection.rerank_model ? `, reranked with ${collection.rerank_model}` : ''
        }. Default trust: ${TRUST_LABEL[settings.default_trust]}. Vetting deadline: ${formatSeconds(
          settings.vet_deadline_secs,
        )}. Chunks of at most ${formatInt(settings.chunk_tokens)} tokens.`}
        actions={
          <GatedButton
            size="sm"
            variant="primary"
            icon={<IconPlus size={14} />}
            deniedReason={cannotWrite}
            onClick={() => {
              setNotice(null);
              setIngesting(true);
            }}
          >
            Ingest document
          </GatedButton>
        }
      />
      <div className="flex flex-col gap-2 border-b border-border px-4 py-2.5">
        <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-fg-muted">
          Nodes search it with the scope <code className="font-mono text-fg">{scope}</code>
          <CopyButton value={scope} label={`Copy ${scope}`} compact />
        </p>
        <UsedBy tenantId={tenantId} collection={name} />
      </div>
      {notice && (
        <p role="status" className="mx-4 mt-3 text-[12.5px] text-ok">
          {notice}
        </p>
      )}
      {quarantined > 0 && (
        <p
          role="status"
          className="mx-4 mt-3 flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-fg"
        >
          <IconAlert size={14} className="mt-0.5 shrink-0 text-warn" />
          {quarantined} document{quarantined === 1 ? ' is' : 's are'} quarantined. Review the
          findings; someone with rag.approve can release a document or it can be deleted.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
          Status
          <Select
            className="w-40"
            value={status ?? ''}
            onChange={(e) => setStatus((e.target.value || undefined) as RagDocumentStatus)}
          >
            <option value="">All</option>
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {docs.isPending ? (
        <LoadingState rows={3} />
      ) : docs.isError ? (
        <ErrorState error={docs.error} onRetry={() => void docs.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={status ? `No ${STATUS_LABEL[status].toLowerCase()} documents` : 'No documents yet'}
          description={
            status
              ? 'No document whose newest version is in this state.'
              : 'Ingest Markdown, HTML or plain text. Each document is indexed by a worker and searched once its checks pass.'
          }
        />
      ) : (
        <>
          <Table label={`Documents of ${name}`}>
            <THead>
              <tr>
                <TH>Document</TH>
                <TH>Status</TH>
                <TH>Trust</TH>
                <TH>Size</TH>
                <TH>Personal data</TH>
                <TH>Findings</TH>
                <TH>Vetting deadline</TH>
                <TH>Ingested</TH>
                <TH>
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((d) => {
                const live = d.live_version;
                return (
                  <TR key={d.doc_id}>
                    <TD>
                      <button
                        type="button"
                        onClick={() => onDoc(d.doc_id)}
                        className="font-mono text-[12.5px] font-medium hover:text-accent hover:underline"
                      >
                        {d.doc_id}
                      </button>
                      <span className="block text-[11.5px] text-fg-subtle">
                        v{d.version}
                        {d.source && ` · ${d.source}`}
                      </span>
                    </TD>
                    <TD>
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <DocumentStatusBadge status={d.status} />
                        {live != null && live !== d.version && (
                          <Badge
                            tone="accent"
                            title={`rag_search serves version ${live} until this one is ready.`}
                          >
                            Searching v{live}
                          </Badge>
                        )}
                      </span>
                    </TD>
                    <TD>
                      <TrustBadge trust={d.trust} />
                    </TD>
                    <TD className="whitespace-nowrap text-fg-muted">
                      {formatBytes(d.bytes)}
                      {d.chunks > 0 && (
                        <span className="block text-[11.5px] text-fg-subtle">
                          {formatInt(d.chunks)} chunks, {formatInt(d.tokens)} tokens
                        </span>
                      )}
                    </TD>
                    <TD className="text-fg-muted">
                      {d.pii_entities > 0 ? `${formatInt(d.pii_entities)} pseudonymised` : 'None'}
                    </TD>
                    <TD>
                      <DocFindingsBadge findings={d.findings} />
                    </TD>
                    <TD>
                      <VettingBadge vetting={vettingOf(d, collection)} />
                    </TD>
                    <TD className="whitespace-nowrap text-fg-muted">
                      {formatDateTime(d.created_at)}
                      <span className="block max-w-48 truncate text-[11.5px] text-fg-subtle">
                        {d.created_by}
                      </span>
                    </TD>
                    <TD className="text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant={d.status === 'quarantined' ? 'primary' : 'ghost'}
                          aria-label={`${d.status === 'quarantined' ? 'Review' : 'View'} ${d.doc_id}`}
                          onClick={() => onDoc(d.doc_id)}
                        >
                          {d.status === 'quarantined' ? 'Review' : 'View'}
                        </Button>
                        <GatedButton
                          size="sm"
                          variant="danger"
                          icon={<IconTrash size={14} />}
                          deniedReason={cannotWrite}
                          aria-label={`Delete ${d.doc_id}`}
                          onClick={() => setDeleting(d.doc_id)}
                        >
                          Delete
                        </GatedButton>
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {docs.hasNextPage && (
            <div className="flex justify-center border-t border-border px-4 py-2.5">
              <Button
                size="sm"
                loading={docs.isFetchingNextPage}
                onClick={() => void docs.fetchNextPage()}
              >
                Load more documents
              </Button>
            </div>
          )}
        </>
      )}

      <Drawer
        open={ingesting}
        onClose={() => setIngesting(false)}
        title={`Ingest into ${name}`}
        description="The content is sealed under the tenant's key at once and never shown again."
      >
        {ingesting && (
          <IngestForm
            tenantId={tenantId}
            collection={collection}
            onCancel={() => setIngesting(false)}
            onIngested={ingested}
          />
        )}
      </Drawer>
      <Drawer
        open={docId !== undefined}
        onClose={() => onDoc(undefined)}
        title={docId ?? ''}
        description={`In ${name}. Every version, newest first.`}
      >
        {docId !== undefined && (
          <DocumentReview tenantId={tenantId} collection={collection} docId={docId} />
        )}
      </Drawer>
      <ConfirmDialog
        open={deleting !== null}
        title="Delete document?"
        confirmLabel="Delete document"
        loading={del.isPending}
        error={del.error}
        onCancel={closeDelete}
        onConfirm={() => {
          const id = deleting;
          if (!id) return;
          del.mutate(id, {
            onSuccess: () => {
              if (docId === id) onDoc(undefined);
              closeDelete();
            },
          });
        }}
      >
        <p>
          Delete every version of <code className="font-mono font-medium">{deleting}</code>? It
          stops being searched at once, its sealed content is wiped, and workers then delete its
          vectors.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
