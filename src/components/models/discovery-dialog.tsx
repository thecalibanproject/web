import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { ApiError } from '@/api/client';
import { createModel, discoveryQuery, modelsQuery, qk } from '@/api/queries';
import {
  MODEL_KINDS,
  type DiscoveryResult,
  type ModelKind,
  type SharedProvider,
} from '@/api/types';
import { TrustTierBadge } from '@/components/badges';
import {
  Badge,
  Button,
  Checkbox,
  Drawer,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Select,
} from '@/components/ui';
import { IconAlert, IconRefresh } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { MODEL_KIND_LABEL } from '@/lib/labels';
import {
  draftFromModel,
  hasErrors,
  modelBody,
  validateModel,
  type FieldErrors,
  type ModelDraft,
  type ModelField,
} from '@/lib/modelForm';
import { CapabilitiesFields } from './capabilities-fields';

type RowStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Row {
  key: string;
  selected: boolean;
  draft: ModelDraft;
  errors: FieldErrors<ModelField>;
  status: RowStatus;
  message?: string;
}

function initialRows(data: DiscoveryResult): Row[] {
  return data.suggested.map((s, i) => ({
    key: `${i}:${s.upstream_model}`,
    selected: true,
    draft: draftFromModel(s),
    errors: {},
    status: 'idle',
  }));
}

function saveError(e: unknown): string {
  if (e instanceof ApiError && e.status === 409) {
    return `Conflict (409): ${e.message}. Change the model ID and try again.`;
  }
  return errorMessage(e);
}

/**
 * Lists what a model server serves and lets the admin review the server's
 * heuristic catalogue suggestions before adding the selected ones.
 */
export function DiscoveryDialog({
  server,
  onClose,
}: {
  server: SharedProvider | null;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={server !== null}
      onClose={onClose}
      side="center"
      size="lg"
      title={server ? `Discover models on ${server.id}` : 'Discover models'}
      description={server && <span className="font-mono">{server.base_url}</span>}
    >
      {server && <DiscoverySession key={server.id} server={server} onClose={onClose} />}
    </Drawer>
  );
}

function DiscoverySession({ server, onClose }: { server: SharedProvider; onClose: () => void }) {
  const discovery = useQuery(discoveryQuery(server.id));

  if (discovery.isPending) return <LoadingState label="Asking the server what it serves…" />;
  if (discovery.isError) {
    return (
      <ErrorState
        title="Discovery failed"
        error={discovery.error}
        onRetry={() => void discovery.refetch()}
        className="m-0"
      />
    );
  }
  return (
    <SuggestionsEditor
      // A re-scan replaces the suggestions, so start a fresh edit session.
      key={discovery.dataUpdatedAt}
      server={server}
      data={discovery.data}
      rescanning={discovery.isFetching}
      onRescan={() => void discovery.refetch()}
      onClose={onClose}
    />
  );
}

function SuggestionsEditor({
  server,
  data,
  rescanning,
  onRescan,
  onClose,
}: {
  server: SharedProvider;
  data: DiscoveryResult;
  rescanning: boolean;
  onRescan: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const models = useQuery(modelsQuery());
  const [rows, setRows] = useState<Row[]>(() => initialRows(data));
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState('');
  const headingId = useId();

  const patch = (key: string, p: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const editDraft = (key: string, d: Partial<ModelDraft>) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const errors = { ...r.errors };
        for (const k of Object.keys(d)) delete errors[k as ModelField];
        return {
          ...r,
          draft: { ...r.draft, ...d },
          errors,
          ...(r.status === 'error' ? { status: 'idle' as const, message: undefined } : {}),
        };
      }),
    );

  const registered = new Set(
    (models.data ?? []).filter((m) => m.provider_id === server.id).map((m) => m.upstream_model),
  );
  const suggestedUpstream = new Set(data.suggested.map((s) => s.upstream_model));
  const pending = rows.filter((r) => r.status !== 'saved');
  const selected = pending.filter((r) => r.selected);
  const allSelected = pending.length > 0 && selected.length === pending.length;

  const addSelected = async () => {
    // Validate everything first so one typo doesn't leave a half-applied batch.
    let invalid = false;
    const checked = rows.map((r) => {
      if (!r.selected || r.status === 'saved') return r;
      const errors = validateModel(r.draft);
      if (hasErrors(errors)) invalid = true;
      return { ...r, errors };
    });
    setRows(checked);
    if (invalid) {
      setSummary('Fix the highlighted fields first.');
      return;
    }

    setBusy(true);
    setSummary('');
    let added = 0;
    let failed = 0;
    for (const r of checked) {
      if (!r.selected || r.status === 'saved') continue;
      patch(r.key, { status: 'saving', message: undefined });
      try {
        await createModel(modelBody(r.draft));
        added += 1;
        patch(r.key, { status: 'saved', selected: false, message: undefined });
      } catch (e) {
        failed += 1;
        patch(r.key, { status: 'error', message: saveError(e) });
      }
    }
    setBusy(false);
    setSummary(
      `${added} added${failed ? `, ${failed} failed` : ''}.` +
        (failed ? ' Fix the failed rows and try again.' : ''),
    );
    if (added) await qc.invalidateQueries({ queryKey: qk.models });
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        role="note"
        className="flex items-start gap-2.5 rounded-md border border-warn/40 bg-warn-soft px-3 py-2.5 text-[12.5px] text-fg"
      >
        <IconAlert className="mt-0.5 shrink-0 text-warn" />
        <p>
          <strong className="font-semibold">Suggestions are heuristic.</strong> Kind, family,
          capabilities and context window are guessed from model names and server metadata. Review
          each entry, and <strong className="font-semibold">confirm the licence</strong> on the
          model card before adding: Caliban does not verify licences.
        </p>
      </div>

      <section aria-labelledby={`${headingId}-available`}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h3 id={`${headingId}-available`} className="text-[12.5px] font-medium text-fg-muted">
            Served by {data.provider} ({data.available.length})
          </h3>
          <Button
            size="sm"
            variant="ghost"
            icon={<IconRefresh size={14} />}
            loading={rescanning}
            disabled={busy}
            onClick={onRescan}
          >
            Scan again
          </Button>
        </div>
        {data.available.length === 0 ? (
          <p className="text-[12.5px] text-fg-subtle">The server reports no models.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5" aria-label="Available models">
            {data.available.map((name) => (
              <li
                key={name}
                className="inline-flex items-center gap-1.5 rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-[12px]"
              >
                {name}
                {registered.has(name) ? (
                  <Badge tone="ok">in catalogue</Badge>
                ) : suggestedUpstream.has(name) ? (
                  <Badge tone="accent">suggested</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`${headingId}-suggested`} className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 id={`${headingId}-suggested`} className="text-[12.5px] font-medium text-fg-muted">
            Suggested catalogue entries ({rows.length})
          </h3>
          {pending.length > 0 && (
            <Checkbox
              label="Select all"
              checked={allSelected}
              disabled={busy}
              onChange={(e) =>
                setRows((prev) =>
                  prev.map((r) =>
                    r.status === 'saved' ? r : { ...r, selected: e.target.checked },
                  ),
                )
              }
            />
          )}
        </div>
        {rows.length === 0 ? (
          <p className="rounded-md border border-border px-3 py-6 text-center text-[12.5px] text-fg-muted">
            Nothing new to add: every model this server serves is already in the catalogue.
          </p>
        ) : (
          rows.map((r) => (
            <SuggestionRow
              key={r.key}
              row={r}
              disabled={busy || r.status === 'saved'}
              onSelect={(selected) => patch(r.key, { selected })}
              onEdit={(d) => editDraft(r.key, d)}
            />
          ))
        )}
      </section>

      <div className="sticky bottom-0 -mx-5 -mb-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-5 py-3">
        <p className="mr-auto text-[12.5px] text-fg-muted" role="status" aria-live="polite">
          {summary}
        </p>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="primary"
          loading={busy}
          disabled={selected.length === 0}
          onClick={() => void addSelected()}
        >
          Add selected ({selected.length})
        </Button>
      </div>
    </div>
  );
}

function SuggestionRow({
  row,
  disabled,
  onSelect,
  onEdit,
}: {
  row: Row;
  disabled: boolean;
  onSelect: (selected: boolean) => void;
  onEdit: (d: Partial<ModelDraft>) => void;
}) {
  const { draft: d, errors } = row;
  return (
    <fieldset
      aria-label={d.upstreamModel}
      disabled={disabled}
      className={cn(
        'flex flex-col gap-3 rounded-md border p-3',
        row.status === 'error' ? 'border-danger/60' : 'border-border',
        row.status === 'saved' && 'opacity-70',
        !row.selected && row.status !== 'saved' && 'bg-surface-2',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Checkbox
          label={<span className="font-mono text-[12.5px] font-medium">{d.upstreamModel}</span>}
          checked={row.selected}
          onChange={(e) => onSelect(e.target.checked)}
        />
        <span className="flex items-center gap-2">
          <TrustTierBadge tier={d.trustTier} />
          {row.status === 'saving' && <Badge tone="info">adding…</Badge>}
          {row.status === 'saved' && (
            <Badge tone="ok" dot>
              added
            </Badge>
          )}
          {row.status === 'error' && (
            <Badge tone="danger" dot>
              failed
            </Badge>
          )}
        </span>
      </div>
      {(errors.provider ?? errors.upstreamModel) && (
        <p role="alert" className="rounded bg-danger-soft px-2.5 py-1.5 text-[12.5px] text-danger">
          The server returned an incomplete suggestion: {errors.provider ?? errors.upstreamModel}
        </p>
      )}
      {row.message && (
        <p role="alert" className="rounded bg-danger-soft px-2.5 py-1.5 text-[12.5px] text-danger">
          {row.message}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <Field label="Model ID" required error={errors.id}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={d.id}
              onChange={(e) => onEdit({ id: e.target.value })}
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </Field>
        <Field label="Kind">
          {({ id }) => (
            <Select
              id={id}
              value={d.kind}
              onChange={(e) => onEdit({ kind: e.target.value as ModelKind })}
            >
              {MODEL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {MODEL_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Family">
          {({ id }) => (
            <Input
              id={id}
              value={d.family}
              onChange={(e) => onEdit({ family: e.target.value })}
              className="font-mono"
            />
          )}
        </Field>
        <Field
          label="Licence"
          hint={d.licence ? 'Confirm on the model card.' : 'Unknown: check the model card.'}
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={d.licence}
              onChange={(e) => onEdit({ licence: e.target.value })}
            />
          )}
        </Field>
        <Field label="Context window" error={errors.contextWindow}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              inputMode="numeric"
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={d.contextWindow}
              onChange={(e) => onEdit({ contextWindow: e.target.value })}
            />
          )}
        </Field>
      </div>
      <CapabilitiesFields
        value={d.capabilities}
        onChange={(capabilities) => onEdit({ capabilities })}
      />
    </fieldset>
  );
}
