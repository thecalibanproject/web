import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { usePermissions } from '@/api/auth';
import { ragCollectionsQuery, tenantsQuery, useDeleteRagCollection } from '@/api/queries';
import type { RagCollection } from '@/api/types';
import { CollectionDocuments } from '@/components/rag/collection-documents';
import { CreateCollectionForm } from '@/components/rag/create-collection-form';
import { DocumentCountBadges, TrustBadge } from '@/components/rag/rag-badges';
import { TenantSelect } from '@/components/tenant-select';
import {
  Button,
  Card,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  GatedButton,
  LoadingState,
  PageHeader,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import { IconPlus, IconTrash } from '@/components/ui/icons';
import { isNotFound } from '@/lib/errors';
import { EMPTY, formatDateTime } from '@/lib/format';
import { deniedReason } from '@/lib/permissions';
import { formatSeconds, settingsOf } from '@/lib/rag';

const route = getRouteApi('/_app/rag');

export function RagPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const perms = usePermissions();
  const tenants = useQuery(tenantsQuery());
  const readable = perms.tenantsWith('rag.read');
  const firstReadable = tenants.data?.find(
    (t) => readable === 'all' || readable.includes(t.id),
  )?.id;
  const tenantId = search.tenant ?? firstReadable;

  const setSearch = (patch: Partial<typeof search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
      <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
        Tenant
        <TenantSelect
          value={tenantId}
          permission="rag.read"
          className="w-52"
          onChange={(t) => setSearch({ tenant: t, collection: undefined, doc: undefined })}
        />
      </label>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Retrieval"
        description="Document collections a tenant's nodes search with builtin://rag_search. A document is searched only once a worker has indexed it and its checks passed; flagged documents stay quarantined until someone who may approve releases them."
        actions={
          tenantId && (
            <NewCollectionButton
              tenantId={tenantId}
              onCreated={(c) => setSearch({ collection: c, doc: undefined })}
            />
          )
        }
      />
      {tenantId ? (
        <CollectionList
          toolbar={toolbar}
          tenantId={tenantId}
          selected={search.collection}
          docId={search.doc}
          onSelect={(c) => setSearch({ collection: c, doc: undefined })}
          onDoc={(d) => setSearch({ doc: d })}
        />
      ) : (
        <Card>
          {toolbar}
          {tenants.isPending ? (
            <LoadingState rows={2} />
          ) : tenants.isError ? (
            <ErrorState error={tenants.error} onRetry={() => void tenants.refetch()} />
          ) : (
            <EmptyState
              title="No tenant to show"
              description="Document collections belong to a tenant. Your roles do not cover a tenant with retrieval yet."
            />
          )}
        </Card>
      )}
    </>
  );
}

function NewCollectionButton({
  tenantId,
  onCreated,
}: {
  tenantId: string;
  onCreated: (collection: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const denied = deniedReason(usePermissions(), 'rag.write', tenantId);
  return (
    <>
      <GatedButton
        variant="primary"
        icon={<IconPlus size={14} />}
        deniedReason={denied}
        onClick={() => setOpen(true)}
      >
        New collection
      </GatedButton>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New collection"
        description="Its vectors live in a vector index collection of their own, separate from every other collection."
      >
        {open && (
          <CreateCollectionForm
            tenantId={tenantId}
            onCancel={() => setOpen(false)}
            onCreated={(c) => {
              setOpen(false);
              onCreated(c);
            }}
          />
        )}
      </Drawer>
    </>
  );
}

function CollectionList({
  toolbar,
  tenantId,
  selected,
  docId,
  onSelect,
  onDoc,
}: {
  toolbar: ReactNode;
  tenantId: string;
  selected: string | undefined;
  docId: string | undefined;
  onSelect: (collection: string | undefined) => void;
  onDoc: (docId: string | undefined) => void;
}) {
  const collections = useQuery(ragCollectionsQuery(tenantId));
  const del = useDeleteRagCollection(tenantId);
  const [deleting, setDeleting] = useState<RagCollection | null>(null);
  const cannotWrite = deniedReason(usePermissions(), 'rag.write', tenantId);
  const current = collections.data?.find((c) => c.name === selected);

  const closeDelete = () => {
    setDeleting(null);
    del.reset();
  };

  return (
    <>
      <Card>
        {toolbar}
        {collections.isPending ? (
          <LoadingState rows={3} />
        ) : collections.isError ? (
          isNotFound(collections.error) ? (
            <EmptyState title="Tenant not found" description="It may have been deleted." />
          ) : (
            <ErrorState error={collections.error} onRetry={() => void collections.refetch()} />
          )
        ) : collections.data.length === 0 ? (
          <EmptyState
            title="No collections"
            description="Create a collection with an embedding model, ingest documents into it, then name it in a node's scopes as rag.<collection>:read."
          />
        ) : (
          <Table label="Collections">
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Description</TH>
                <TH>Documents</TH>
                <TH>Embedding model</TH>
                <TH>Rerank model</TH>
                <TH>Default trust</TH>
                <TH>Vetting deadline</TH>
                <TH>Created</TH>
                <TH>
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {collections.data.map((c) => {
                const isSelected = c.name === selected;
                const settings = settingsOf(c);
                return (
                  <TR key={c.id} className={isSelected ? 'bg-accent-soft/40' : undefined}>
                    <TD>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onSelect(isSelected ? undefined : c.name)}
                        className="font-mono text-[12.5px] font-medium hover:text-accent hover:underline"
                      >
                        {c.name}
                      </button>
                    </TD>
                    <TD className="max-w-64 truncate text-fg-muted" title={c.description}>
                      {c.description || EMPTY}
                    </TD>
                    <TD>
                      <DocumentCountBadges counts={c.document_counts} />
                    </TD>
                    <TD className="font-mono text-[12px]">{c.embedding_model}</TD>
                    <TD className="font-mono text-[12px] text-fg-muted">
                      {c.rerank_model ?? EMPTY}
                    </TD>
                    <TD>
                      <TrustBadge trust={settings.default_trust} />
                    </TD>
                    <TD className="whitespace-nowrap text-fg-muted">
                      {formatSeconds(settings.vet_deadline_secs)}
                    </TD>
                    <TD className="whitespace-nowrap text-fg-muted">
                      {formatDateTime(c.created_at)}
                      <span className="block max-w-48 truncate text-[11.5px] text-fg-subtle">
                        {c.created_by}
                      </span>
                    </TD>
                    <TD className="text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Show the documents of ${c.name}`}
                          onClick={() => onSelect(c.name)}
                        >
                          Documents
                        </Button>
                        <GatedButton
                          size="sm"
                          variant="danger"
                          icon={<IconTrash size={14} />}
                          deniedReason={cannotWrite}
                          aria-label={`Delete ${c.name}`}
                          onClick={() => setDeleting(c)}
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
        )}
      </Card>

      {current && (
        <CollectionDocuments
          key={current.name}
          tenantId={tenantId}
          collection={current}
          docId={docId}
          onDoc={onDoc}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete collection?"
        confirmLabel="Delete collection"
        loading={del.isPending}
        error={del.error}
        onCancel={closeDelete}
        onConfirm={() => {
          const name = deleting?.name;
          if (!name) return;
          del.mutate(name, {
            onSuccess: () => {
              if (selected === name) onSelect(undefined);
              closeDelete();
            },
          });
        }}
      >
        <p>
          Delete <code className="font-mono font-medium">{deleting?.name}</code> and every document
          in it? They stop being searched at once, and workers then drop the vectors.
        </p>
        <p className="text-fg-muted">
          A collection that a published node version names in its scopes cannot be deleted: retire
          those versions first.
        </p>
      </ConfirmDialog>
    </>
  );
}
