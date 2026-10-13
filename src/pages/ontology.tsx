import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { usePermissions } from '@/api/auth';
import { ontologyQuery, useReviewBatch, useReviewElement } from '@/api/queries';
import type { OntologyElement, ReviewDecision } from '@/api/types';
import { ConfidenceMeter } from '@/components/badges';
import { Advanced } from '@/components/help/advanced';
import { TermTip } from '@/components/help/toggletip';
import { BreakingChanges } from '@/components/ontology/breaking-changes';
import { ProposeDrawer } from '@/components/ontology/propose-drawer';
import { TenantDeletedState } from '@/components/tenant/tenant-deleted-state';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CodeBlock,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  GatedButton,
  LoadingState,
  PageHeader,
  Select,
  Textarea,
  type Tone,
} from '@/components/ui';
import { IconCheck, IconPlus, IconX } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { doc } from '@/lib/docs';
import { errorMessage, isNotFound } from '@/lib/errors';
import { formatPercent } from '@/lib/format';
import { deniedReason } from '@/lib/permissions';
import {
  aboveConfidence,
  ALWAYS_REVIEW,
  breakingChanges,
  CONFIDENCE_THRESHOLDS,
  countByStatus,
  decisionsFor,
  ELEMENT_STATUS_LABEL,
  groupByKind,
  ONTOLOGY_KIND_LABEL,
  ONTOLOGY_KIND_SINGULAR,
  PROVENANCE_LABEL,
  reviewQueue,
  sampleValues,
} from '@/lib/ontology';
import { useScopedTenant } from '@/lib/workspace';

const route = getRouteApi('/_app/ontology');

const DECISION_LABEL: Record<ReviewDecision, string> = {
  approve: 'Approve',
  reject: 'Reject',
  deprecate: 'Withdraw',
};

const STATUS_TONE: Record<OntologyElement['status'], Tone> = {
  proposed: 'warn',
  approved: 'ok',
  rejected: 'danger',
  stale: 'neutral',
  deprecated: 'neutral',
};

function StatusBadge({ status }: { status: OntologyElement['status'] }) {
  return <Badge tone={STATUS_TONE[status]}>{ELEMENT_STATUS_LABEL[status]}</Badge>;
}

function SuggestedBy({ provenance }: { provenance: OntologyElement['provenance'] }) {
  return (
    <Badge tone={provenance === 'llm' ? 'accent' : 'neutral'} title={`Provenance: ${provenance}`}>
      {PROVENANCE_LABEL[provenance]}
    </Badge>
  );
}

/** Two example values when the entry carries them, else its description. */
function Example({ element }: { element: OntologyElement }) {
  const samples = sampleValues(element);
  if (samples.length > 0) {
    return (
      <p className="max-w-md truncate text-[12px] text-fg-muted">
        For example:{' '}
        {samples.map((v, i) => (
          <span key={i}>
            {i > 0 && ', '}
            <span dir="auto" className="text-fg">
              {v}
            </span>
          </span>
        ))}
      </p>
    );
  }
  return element.description ? (
    <p dir="auto" className="max-w-md truncate text-[12px] text-fg-muted">
      {element.description}
    </p>
  ) : null;
}

/** Approve or reject a proposal, or approve a stale element again. */
function ReviewActions({
  tenantId,
  element,
  note,
  onDone,
  size = 'sm',
}: {
  tenantId: string;
  element: OntologyElement;
  note?: string;
  onDone?: () => void;
  size?: 'sm' | 'md';
}) {
  const review = useReviewElement(tenantId);
  const canReview = usePermissions().can('ontology.review', tenantId);
  const [pending, setPending] = useState<ReviewDecision | null>(null);
  const decide = (decision: ReviewDecision) => {
    setPending(decision);
    review.mutate(
      { elementId: element.id, decision, note },
      { onSettled: () => setPending(null), onSuccess: () => onDone?.() },
    );
  };
  // Withdrawing (deprecate) has its own section, which handles breaking changes.
  const decisions = decisionsFor(element.status).filter((d) => d !== 'deprecate');
  if (!canReview || decisions.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      {review.isError && (
        <span role="alert" className="text-[12px] text-danger">
          {errorMessage(review.error)}
        </span>
      )}
      {decisions.map((d) => (
        <Button
          key={d}
          size={size}
          variant={d === 'approve' ? 'success' : 'danger'}
          icon={d === 'approve' ? <IconCheck size={14} /> : <IconX size={14} />}
          loading={pending === d}
          disabled={review.isPending}
          onClick={() => decide(d)}
          aria-label={`${DECISION_LABEL[d]} ${element.name}`}
        >
          {DECISION_LABEL[d]}
        </Button>
      ))}
    </span>
  );
}

/**
 * Withdrawing an approved (or stale) element: deprecating it. When published
 * node versions' fixed queries use it, the control plane refuses with the
 * versions it would break, and the reviewer goes ahead only by acknowledging.
 */
function Withdraw({
  tenantId,
  element,
  note,
}: {
  tenantId: string;
  element: OntologyElement;
  note?: string;
}) {
  const review = useReviewElement(tenantId);
  const denied = deniedReason(usePermissions(), 'ontology.review', tenantId);
  const [ack, setAck] = useState(false);
  const breaking = breakingChanges(review.error);
  const deprecate = (acknowledgeBreaking: boolean) =>
    review.mutate({ elementId: element.id, decision: 'deprecate', note, acknowledgeBreaking });

  return (
    <section
      aria-label="Withdraw"
      className="flex flex-col gap-3 rounded-md border border-border p-3 text-[12.5px]"
    >
      <p className="text-fg-muted">
        Withdrawing an entry stops new questions from using it. Published assistant versions whose
        saved questions use it would fail on them, so Caliban names them and asks you to confirm.
      </p>
      {breaking ? (
        <BreakingChanges
          tenantId={tenantId}
          changes={breaking}
          message={errorMessage(review.error)}
          acknowledged={ack}
          onAcknowledge={setAck}
          disabled={review.isPending}
        >
          <Button
            variant="danger"
            disabled={!ack}
            loading={review.isPending}
            onClick={() => deprecate(true)}
            aria-label={`Withdraw ${element.name} anyway`}
          >
            Withdraw anyway
          </Button>
        </BreakingChanges>
      ) : (
        <>
          <FormError error={review.error} />
          <span>
            <GatedButton
              variant="danger"
              deniedReason={denied}
              loading={review.isPending}
              onClick={() => deprecate(false)}
              aria-label={`Withdraw ${element.name}`}
            >
              Withdraw
            </GatedButton>
          </span>
        </>
      )}
    </section>
  );
}

/** `changed_in`: the ontology version its spec or status last changed in. */
function changedIn(element: OntologyElement): string {
  return element.changed_in != null ? `Version ${element.changed_in}` : 'Not recorded';
}

function ElementDrawer({
  tenantId,
  element,
  onClose,
}: {
  tenantId: string;
  element: OntologyElement | null;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  return (
    <Drawer
      open={element !== null}
      onClose={() => {
        setNote('');
        onClose();
      }}
      title={element?.name ?? ''}
      description={
        element && (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge>{ONTOLOGY_KIND_SINGULAR[element.kind]}</Badge>
            <StatusBadge status={element.status} />
            <SuggestedBy provenance={element.provenance} />
          </span>
        )
      }
      footer={
        element && (element.status === 'proposed' || element.status === 'stale') ? (
          <ReviewActions
            tenantId={tenantId}
            element={element}
            note={note.trim() || undefined}
            size="md"
            onDone={() => {
              setNote('');
              onClose();
            }}
          />
        ) : undefined
      }
    >
      {element && (
        <div className="flex flex-col gap-5">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[13px]">
            <dt className="text-fg-muted">Confidence</dt>
            <dd>
              <ConfidenceMeter value={element.confidence} />
            </dd>
            <dt className="text-fg-muted">Description</dt>
            <dd dir="auto">
              {element.description ?? <span className="text-fg-subtle">None</span>}
            </dd>
            <dt className="text-fg-muted">Examples</dt>
            <dd dir="auto">
              {sampleValues(element).join(', ') || <span className="text-fg-subtle">None</span>}
            </dd>
            <dt className="text-fg-muted">Synonyms</dt>
            <dd className="flex flex-wrap gap-1">
              {element.synonyms?.length ? (
                element.synonyms.map((s) => (
                  <Badge key={s}>
                    <span dir="auto">{s}</span>
                  </Badge>
                ))
              ) : (
                <span className="text-fg-subtle">None</span>
              )}
            </dd>
          </dl>
          {ALWAYS_REVIEW.has(element.kind) && (
            <p className="rounded-md bg-info-soft px-3 py-2 text-[12.5px] text-fg">
              {ONTOLOGY_KIND_LABEL[element.kind]} always need a person to approve them before
              assistants use them.
            </p>
          )}
          <Advanced summary="Its id, version and definition as JSON.">
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[13px]">
              <dt className="text-fg-muted">ID</dt>
              <dd className="font-mono text-[12px] break-all">{element.id}</dd>
              <dt className="text-fg-muted">Kind</dt>
              <dd className="font-mono text-[12px]">{element.kind}</dd>
              <dt className="text-fg-muted">Changed in</dt>
              <dd title="The ontology version its definition or status last changed in. Node queries written for an earlier version keep working while nothing they use changed after it.">
                {changedIn(element)}
              </dd>
            </dl>
            <CodeBlock
              label={`Spec for ${element.name}`}
              code={JSON.stringify(element.spec ?? {}, null, 2)}
              className="max-h-[50dvh]"
            />
          </Advanced>
          {(element.status === 'approved' || element.status === 'stale') && (
            <Withdraw
              key={element.id}
              tenantId={tenantId}
              element={element}
              note={note.trim() || undefined}
            />
          )}
          {decisionsFor(element.status).length > 0 && (
            <Field label="Review note" hint="Optional. Kept with the decision in the audit log.">
              {({ id, describedBy }) => (
                <Textarea
                  id={id}
                  aria-describedby={describedBy}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
              )}
            </Field>
          )}
        </div>
      )}
    </Drawer>
  );
}

/**
 * "Approve every suggestion above N% confidence" in one batch (UX-34), after
 * a confirmation that says how many.
 */
function BulkApprove({
  tenantId,
  queue,
  onDone,
}: {
  tenantId: string;
  queue: readonly OntologyElement[];
  onDone: (message: string) => void;
}) {
  const batch = useReviewBatch(tenantId);
  const [threshold, setThreshold] = useState<number>(0.9);
  const [confirming, setConfirming] = useState(false);
  const picked = aboveConfidence(queue, threshold);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 text-[12.5px]">
      <label className="flex items-center gap-2 text-fg-muted">
        Confidence at least
        <Select
          value={String(threshold)}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-24"
        >
          {CONFIDENCE_THRESHOLDS.map((t) => (
            <option key={t} value={t}>
              {formatPercent(t)}
            </option>
          ))}
        </Select>
      </label>
      <Button
        size="sm"
        variant="success"
        icon={<IconCheck size={14} />}
        disabled={picked.length === 0}
        onClick={() => {
          batch.reset();
          setConfirming(true);
        }}
      >
        Approve {picked.length} suggestion{picked.length === 1 ? '' : 's'} at or above{' '}
        {formatPercent(threshold)}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={`Approve ${picked.length} suggestion${picked.length === 1 ? '' : 's'}?`}
        confirmLabel={`Approve ${picked.length}`}
        confirmVariant="primary"
        loading={batch.isPending}
        error={batch.error}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          batch.mutate(
            { decisions: picked.map((e) => ({ id: e.id, decision: 'approve' as const })) },
            {
              onSuccess: () => {
                setConfirming(false);
                onDone(`Approved ${picked.length} suggestions in one step.`);
              },
            },
          )
        }
      >
        <p>
          Every suggestion with a confidence of {formatPercent(threshold)} or more is approved in
          one step, as one new version of the data dictionary. Assistants can use these entries
          right away. The rest stay in the queue.
        </p>
        <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-[12.5px] text-fg-muted">
          {picked.map((e) => (
            <li key={e.id} dir="auto">
              {e.name} ({ONTOLOGY_KIND_SINGULAR[e.kind]}, {formatPercent(e.confidence ?? 0)})
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </div>
  );
}

/** Keys of the review queue; only while focus is in the queue, never in a text field. */
function isTyping(target: EventTarget): boolean {
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLInputElement && el.type !== 'checkbox';
}

/**
 * The review queue: suggestions, least confident first. Bulk approve above a
 * confidence, select rows to approve or reject together, and a keyboard
 * queue (J and K move, A approves, R rejects after a confirmation), like an
 * annotation queue (research note 10, section 6).
 */
function ReviewQueue({
  tenantId,
  queue,
  onOpen,
}: {
  tenantId: string;
  queue: OntologyElement[];
  onOpen: (e: OntologyElement) => void;
}) {
  const canReview = usePermissions().can('ontology.review', tenantId);
  const single = useReviewElement(tenantId);
  const batch = useReviewBatch(tenantId);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState(0);
  const [rejecting, setRejecting] = useState<OntologyElement[] | null>(null);
  const [status, setStatus] = useState('');
  const rows = useRef<Array<HTMLButtonElement | null>>([]);
  const chosen = queue.filter((e) => selected.has(e.id));
  const allSelected = queue.length > 0 && chosen.length === queue.length;

  const focusRow = (i: number) => {
    const n = queue.length;
    if (n === 0) return;
    const next = Math.max(0, Math.min(n - 1, i));
    setActive(next);
    rows.current[next]?.focus();
  };

  const decide = (els: OntologyElement[], decision: 'approve' | 'reject') => {
    const done = () => {
      const verb = decision === 'approve' ? 'Approved' : 'Rejected';
      setStatus(els.length === 1 ? `${verb} ${els[0]!.name}.` : `${verb} ${els.length} entries.`);
      setSelected(new Set());
      setRejecting(null);
    };
    if (els.length === 1) {
      single.mutate({ elementId: els[0]!.id, decision }, { onSuccess: done });
    } else {
      batch.mutate({ decisions: els.map((e) => ({ id: e.id, decision })) }, { onSuccess: done });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
    const el = queue[active];
    const key = e.key.toLowerCase();
    if (key === 'j' || e.key === 'ArrowDown') focusRow(active + 1);
    else if (key === 'k' || e.key === 'ArrowUp') focusRow(active - 1);
    else if (key === 'a' && el && canReview) decide([el], 'approve');
    else if (key === 'r' && el && canReview) setRejecting([el]);
    else return;
    e.preventDefault();
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const error = single.error ?? batch.error;

  return (
    <Card className="mb-6">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            To review <Badge tone={queue.length ? 'warn' : 'ok'}>{queue.length}</Badge>
          </span>
        }
        description="Suggestions, least confident first."
        actions={
          <p role="status" aria-live="polite" className="text-[12.5px] text-ok">
            {status}
          </p>
        }
      />
      {queue.length === 0 ? (
        <EmptyState
          title="Nothing to review"
          description="Scan a data connection to suggest things, details and measures for the dictionary."
          learnMore={doc('guides/data-connections', 'scan-the-schema')}
        />
      ) : (
        <>
          {canReview && (
            <BulkApprove tenantId={tenantId} queue={queue} onDone={(m) => setStatus(m)} />
          )}
          {canReview && (
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-[12.5px]">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-3.5 accent-accent"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(queue.map((e) => e.id)))
                  }
                />
                Select all
              </label>
              <Button
                size="sm"
                variant="success"
                disabled={chosen.length === 0}
                loading={batch.isPending && !rejecting}
                onClick={() => decide(chosen, 'approve')}
              >
                Approve selected ({chosen.length})
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={chosen.length === 0}
                onClick={() => setRejecting(chosen)}
              >
                Reject selected ({chosen.length})
              </Button>
              <p className="ml-auto text-fg-muted" id="queue-keys">
                Keys in the list: <kbd className="font-mono">J</kbd>/
                <kbd className="font-mono">K</kbd> move, <kbd className="font-mono">A</kbd>{' '}
                approves, <kbd className="font-mono">R</kbd> rejects.
              </p>
            </div>
          )}
          {error && (
            <div className="px-4 pt-3">
              <FormError error={error} />
            </div>
          )}
          {/* Keys bubble up from the focused row's controls; the list itself is not a widget. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <ul
            aria-label="Review queue"
            aria-describedby={canReview ? 'queue-keys' : undefined}
            onKeyDown={onKeyDown}
            className="divide-y divide-border"
          >
            {queue.map((el, i) => (
              <li
                key={el.id}
                onFocus={() => setActive(i)}
                className={cn(
                  'flex flex-wrap items-center gap-3 px-4 py-2',
                  i === active && 'bg-surface-2/60',
                )}
              >
                {canReview && (
                  <input
                    type="checkbox"
                    aria-label={`Select ${el.name}`}
                    className="size-3.5 accent-accent"
                    checked={selected.has(el.id)}
                    onChange={() => toggle(el.id)}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    ref={(b) => {
                      rows.current[i] = b;
                    }}
                    onClick={() => onOpen(el)}
                    className="text-left text-[13px] font-medium hover:text-accent hover:underline"
                  >
                    <span dir="auto">{el.name}</span>
                  </button>
                  <Example element={el} />
                </div>
                <Badge>{ONTOLOGY_KIND_SINGULAR[el.kind]}</Badge>
                <ConfidenceMeter value={el.confidence} />
                <SuggestedBy provenance={el.provenance} />
                <ReviewActions tenantId={tenantId} element={el} />
              </li>
            ))}
          </ul>
        </>
      )}
      <ConfirmDialog
        open={rejecting !== null}
        title={
          rejecting?.length === 1
            ? `Reject ${rejecting[0]!.name}?`
            : `Reject ${rejecting?.length ?? 0} entries?`
        }
        confirmLabel="Reject"
        loading={single.isPending || batch.isPending}
        error={error}
        onCancel={() => setRejecting(null)}
        onConfirm={() => rejecting && decide(rejecting, 'reject')}
      >
        <p>
          Rejected entries stay out of the dictionary: assistants cannot ask about them. A later
          scan does not suggest them again.
        </p>
      </ConfirmDialog>
    </Card>
  );
}

export function OntologyPage() {
  const search = route.useSearch();
  const tenant = useScopedTenant(search.tenant);
  const ontology = useQuery({ ...ontologyQuery(tenant ?? ''), enabled: Boolean(tenant) });
  const [openId, setOpenId] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const cannotReview = deniedReason(usePermissions(), 'ontology.review', tenant);

  const elements = useMemo(() => ontology.data?.elements ?? [], [ontology.data]);
  const counts = useMemo(() => countByStatus(elements), [elements]);
  const queue = useMemo(() => reviewQueue(elements), [elements]);
  const groups = useMemo(
    () => groupByKind(showRejected ? elements : elements.filter((e) => e.status !== 'rejected')),
    [elements, showRejected],
  );
  // Look the open element up by id so the drawer reflects fresh data after a review.
  const open = openId ? (elements.find((e) => e.id === openId) ?? null) : null;

  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-1">
            Data dictionary <TermTip term="dataDictionary" />
          </span>
        }
        description="Business names and meanings for your data. Assistants can only ask about entries that are in use."
        actions={
          ontology.data && (
            <>
              <span
                className="text-[12px] text-fg-muted"
                title={`Version ${ontology.data.version}`}
              >
                {counts.inUse} in use · {counts.suggested} to review · {counts.rejected} rejected
              </span>
              <GatedButton
                icon={<IconPlus size={14} />}
                deniedReason={cannotReview}
                onClick={() => setProposing(true)}
              >
                Import entries
              </GatedButton>
            </>
          )
        }
      />

      {!tenant ? (
        <Card>
          <EmptyState
            title="No workspace yet"
            description="Each workspace has its own data dictionary. Create a workspace first."
            learnMore={doc('guides/workspaces', 'create')}
          />
        </Card>
      ) : ontology.isPending ? (
        <Card>
          <LoadingState rows={6} />
        </Card>
      ) : ontology.isError && isNotFound(ontology.error) ? (
        <Card>
          <TenantDeletedState tenantId={tenant} />
        </Card>
      ) : ontology.isError ? (
        <Card>
          <ErrorState error={ontology.error} onRetry={() => void ontology.refetch()} />
        </Card>
      ) : (
        <>
          <ReviewQueue tenantId={tenant} queue={queue} onOpen={(e) => setOpenId(e.id)} />

          <section aria-labelledby="elements-h">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 id="elements-h" className="text-[14px] font-semibold">
                Entries by kind
              </h2>
              {counts.rejected > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setShowRejected((v) => !v)}>
                  {showRejected
                    ? `Hide ${counts.rejected} rejected`
                    : `Show ${counts.rejected} rejected`}
                </Button>
              )}
            </div>
            {elements.length === 0 ? (
              <Card>
                <EmptyState
                  title="The dictionary is empty"
                  description="Connect a database and scan it: the scan suggests entries for you to review here."
                  learnMore={doc('guides/data-dictionary', 'review-suggestions')}
                />
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {groups.map(({ kind, items }) => (
                  <Card key={kind} className={cn(items.length === 0 && 'opacity-70')}>
                    <CardHeader
                      title={
                        <span className="flex items-center gap-2">
                          {ONTOLOGY_KIND_LABEL[kind]} <Badge>{items.length}</Badge>
                        </span>
                      }
                    />
                    {items.length === 0 ? (
                      <p className="px-4 py-3 text-[12.5px] text-fg-muted">None yet.</p>
                    ) : (
                      <ul className="max-h-72 overflow-y-auto py-1">
                        {items.map((el) => (
                          <li key={el.id}>
                            <button
                              type="button"
                              onClick={() => setOpenId(el.id)}
                              className="flex w-full items-center justify-between gap-2 px-4 py-1.5 text-left text-[13px] hover:bg-surface-2"
                            >
                              <span dir="auto" className="min-w-0 truncate">
                                {el.name}
                              </span>
                              <StatusBadge status={el.status} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </section>

          <ElementDrawer tenantId={tenant} element={open} onClose={() => setOpenId(null)} />
          <ProposeDrawer tenantId={tenant} open={proposing} onClose={() => setProposing(false)} />
        </>
      )}
    </>
  );
}
