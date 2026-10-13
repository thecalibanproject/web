import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';
import { usePermissions } from '@/api/auth';
import { ragCollectionsQuery, useDeleteRagCollection } from '@/api/queries';
import type { RagCollection } from '@/api/types';
import { CollectionDocuments } from '@/components/rag/collection-documents';
import { CreateCollectionForm } from '@/components/rag/create-collection-form';
import { DocumentCountBadges, TrustBadge } from '@/components/rag/rag-badges';
import { TermTip } from '@/components/help/toggletip';
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
import { doc } from '@/lib/docs';
import { isNotFound } from '@/lib/errors';
import { EMPTY, formatDateTime } from '@/lib/format';
import { deniedReason } from '@/lib/permissions';
import { settingsOf } from '@/lib/rag';
import { useScopedTenant } from '@/lib/workspace';

const route = getRouteApi('/_app/rag');

export function RagPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const tenantId = useScopedTenant(search.tenant);

  const setSearch = (patch: Partial<typeof search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-1">
            Knowledge <TermTip term="knowledge" />
          </span>
        }
        description="Document libraries your assistants can search and cite. A document is searched once it is prepared and its safety checks passed; documents a check flags are held for review."
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
          tenantId={tenantId}
          selected={search.collection}
          docId={search.doc}
          onSelect={(c) => setSearch({ collection: c, doc: undefined })}
          onDoc={(d) => setSearch({ doc: d })}
        />
      ) : (
        <Card>
          <EmptyState
            title="No workspace yet"
            description="Document libraries belong to a workspace. Create a workspace first."
            learnMore={doc('guides/workspaces', 'create')}
          />
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
        New library
      </GatedButton>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New document library"
        description="A library's search index is kept apart from every other library's."
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
  tenantId,
  selected,
  docId,
  onSelect,
  onDoc,
}: {
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
        {collections.isPending ? (
          <LoadingState rows={3} />
        ) : collections.isError ? (
          isNotFound(collections.error) ? (
            <EmptyState title="Workspace not found" description="It may have been deleted." />
          ) : (
            <ErrorState error={collections.error} onRetry={() => void collections.refetch()} />
          )
        ) : collections.data.length === 0 ? (
          <EmptyState
            title="No document libraries yet"
            description="Create a library, upload your documents, then let an assistant search it."
            action={<NewCollectionButton tenantId={tenantId} onCreated={(c) => onSelect(c)} />}
            learnMore={doc('guides/knowledge', 'create-a-library')}
          />
        ) : (
          <Table label="Document libraries">
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Description</TH>
                <TH>Documents</TH>
                <TH>New documents</TH>
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
                    <TD
                      dir="auto"
                      className="max-w-64 truncate text-fg-muted"
                      title={c.description}
                    >
                      {c.description || EMPTY}
                    </TD>
                    <TD>
                      <DocumentCountBadges counts={c.document_counts} />
                    </TD>
                    <TD>
                      <TrustBadge trust={settings.default_trust} />
                    </TD>
                    <TD className="whitespace-nowrap text-fg-muted">
                      {formatDateTime(c.created_at)}
                      <span className="block max-w-48 truncate text-[11.5px] text-fg-muted">
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
        title="Delete this library?"
        confirmLabel="Delete library"
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
          in it? They stop being searched at once, and their search index is wiped.
        </p>
        <p className="text-fg-muted">
          A library that a published assistant version searches cannot be deleted: retire those
          versions first.
        </p>
      </ConfirmDialog>
    </>
  );
}
