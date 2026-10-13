import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useMemo, useState } from 'react';
import { usePermissions } from '@/api/auth';
import { modelsQuery, useDeleteModel } from '@/api/queries';
import { MODEL_KINDS, TRUST_TIERS, type Model, type ModelKind, type TrustTier } from '@/api/types';
import { doc } from '@/lib/docs';
import { CapabilityBadges, ModelKindBadge, TrustTierBadge } from '@/components/badges';
import {
  Button,
  Card,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import { IconPlus, IconTrash } from '@/components/ui/icons';
import { EMPTY, formatCompact, formatUsd } from '@/lib/format';
import { MODEL_KIND_LABEL, PROVIDER_SHORT, TRUST_TIER_LABEL } from '@/lib/labels';
import { ModelForm } from './model-form';

export function CataloguePanel() {
  const models = useQuery(modelsQuery());
  const del = useDeleteModel();
  const [q, setQ] = useState('');
  const [tier, setTier] = useState<TrustTier | ''>('');
  const [kind, setKind] = useState<ModelKind | ''>('');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Model | null>(null);
  const query = useDeferredValue(q.trim().toLowerCase());
  const canWrite = usePermissions().can('catalog.write');

  const rows = useMemo(
    () =>
      (models.data ?? []).filter(
        (m) =>
          (!tier || m.trust_tier === tier) &&
          (!kind || m.kind === kind) &&
          (!query ||
            [m.id, m.upstream_model, m.provider_id, m.family ?? '', m.licence ?? ''].some((v) =>
              v.toLowerCase().includes(query),
            )),
      ),
    [models.data, tier, kind, query],
  );

  const closeDelete = () => {
    setDeleting(null);
    del.reset();
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Input
          type="search"
          aria-label="Filter models"
          placeholder="Filter by id, upstream, provider, family or licence…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select
          aria-label="Model kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as ModelKind | '')}
          className="w-36"
        >
          <option value="">All kinds</option>
          {MODEL_KINDS.map((k) => (
            <option key={k} value={k}>
              {MODEL_KIND_LABEL[k]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Where it runs"
          value={tier}
          onChange={(e) => setTier(e.target.value as TrustTier | '')}
          className="w-44"
        >
          <option value="">Anywhere</option>
          {TRUST_TIERS.map((t) => (
            <option key={t} value={t}>
              {TRUST_TIER_LABEL[t]}
            </option>
          ))}
        </Select>
        <span className="ml-auto flex items-center gap-3">
          {models.data && (
            <span className="text-[12px] text-fg-subtle" aria-live="polite">
              {rows.length} of {models.data.length}
            </span>
          )}
          {canWrite && (
            <Button
              size="sm"
              variant="primary"
              icon={<IconPlus size={14} />}
              onClick={() => setAdding(true)}
            >
              Add model
            </Button>
          )}
        </span>
      </div>
      {models.isPending ? (
        <LoadingState />
      ) : models.isError ? (
        <ErrorState error={models.error} onRetry={() => void models.refetch()} />
      ) : models.data.length === 0 ? (
        <EmptyState
          title="No models yet"
          description="Add a model server and let Caliban find its models, or add a model by hand."
          action={
            canWrite && (
              <Button
                variant="primary"
                icon={<IconPlus size={14} />}
                onClick={() => setAdding(true)}
              >
                Add model
              </Button>
            )
          }
          learnMore={doc('guides/models', 'add-a-model')}
        />
      ) : rows.length === 0 ? (
        <EmptyState title="No matches" description="No model matches the current filters." />
      ) : (
        <Table label="Models">
          <THead>
            <tr>
              <TH>Model</TH>
              <TH>Kind</TH>
              <TH>Family</TH>
              <TH>Capabilities</TH>
              <TH>Provider</TH>
              <TH>Where it runs</TH>
              <TH>Licence</TH>
              <TH className="text-right">Context</TH>
              <TH className="text-right">In / out per million tokens</TH>
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((m) => (
              <TR key={m.id}>
                <TD className="max-w-72">
                  <div className="truncate font-mono text-[12.5px] font-medium" title={m.id}>
                    {m.id}
                  </div>
                  <div
                    className="truncate font-mono text-[11.5px] text-fg-subtle"
                    title={m.upstream_model}
                  >
                    {m.upstream_model}
                  </div>
                </TD>
                <TD>
                  <ModelKindBadge kind={m.kind} />
                </TD>
                <TD className="font-mono text-[12px] text-fg-muted">{m.family ?? EMPTY}</TD>
                <TD>
                  <CapabilityBadges capabilities={m.capabilities} />
                </TD>
                <TD>
                  <div className="font-mono text-[12px]">{m.provider_id}</div>
                  {m.provider_kind && (
                    <div className="text-[11.5px] text-fg-subtle">
                      {PROVIDER_SHORT[m.provider_kind]}
                    </div>
                  )}
                </TD>
                <TD>
                  <TrustTierBadge tier={m.trust_tier} />
                </TD>
                <TD className="text-fg-muted">{m.licence ?? EMPTY}</TD>
                <TD className="text-right">
                  {m.context_window ? formatCompact(m.context_window) : EMPTY}
                </TD>
                <TD className="text-right whitespace-nowrap">
                  {m.price_in_per_mtok == null && m.price_out_per_mtok == null
                    ? EMPTY
                    : `${formatUsd(m.price_in_per_mtok)} / ${formatUsd(m.price_out_per_mtok)}`}
                </TD>
                <TD className="text-right">
                  {canWrite && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<IconTrash size={14} />}
                      onClick={() => setDeleting(m)}
                    >
                      <span className="sr-only">Delete {m.id}</span>
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Drawer
        open={adding}
        onClose={() => setAdding(false)}
        title="Add model"
        description="Add a model Caliban may send requests to. Check the licence on the model card before routing traffic to it."
      >
        {adding && <ModelForm onDone={() => setAdding(false)} />}
      </Drawer>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete model?"
        confirmLabel="Delete model"
        loading={del.isPending}
        error={del.error}
        onCancel={closeDelete}
        onConfirm={() => {
          if (deleting) del.mutate(deleting.id, { onSuccess: closeDelete });
        }}
      >
        <p>
          Remove <code className="font-mono font-medium">{deleting?.id}</code> from the catalogue?
          Requests that name it will fail. The server refuses if a route still uses it.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
