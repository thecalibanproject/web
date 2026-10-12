import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { usePermissions } from '@/api/auth';
import { ontologyQuery, useReviewElement } from '@/api/queries';
import type { OntologyElement, ReviewDecision } from '@/api/types';
import { ConfidenceMeter, ElementStatusBadge, ProvenanceBadge } from '@/components/badges';
import { BreakingChanges } from '@/components/ontology/breaking-changes';
import { ProposeDrawer } from '@/components/ontology/propose-drawer';
import { TenantFilter } from '@/components/tenant-select';
import { TenantDeletedState } from '@/components/tenant/tenant-deleted-state';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CodeBlock,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  GatedButton,
  LoadingState,
  PageHeader,
  Table,
  TBody,
  TD,
  TH,
  THead,
  Textarea,
  TR,
} from '@/components/ui';
import { IconCheck, IconPlus, IconX } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { errorMessage, isNotFound } from '@/lib/errors';
import { deniedReason } from '@/lib/permissions';
import {
  ALWAYS_REVIEW,
  breakingChanges,
  decisionsFor,
  groupByKind,
  ONTOLOGY_KIND_LABEL,
  reviewQueue,
} from '@/lib/ontology';

const route = getRouteApi('/_app/ontology');

const DECISION_LABEL: Record<ReviewDecision, string> = {
  approve: 'Approve',
  reject: 'Reject',
  deprecate: 'Deprecate',
};

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
        Deprecating withdraws this element: new queries can no longer use it. Published node
        versions whose fixed queries use it would fail on them, so the control plane names them and
        asks you to confirm.
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
            aria-label={`Deprecate ${element.name} anyway`}
          >
            Deprecate anyway
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
              aria-label={`Deprecate ${element.name}`}
            >
              Deprecate
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
            <Badge>{element.kind}</Badge>
            <ElementStatusBadge status={element.status} />
            <ProvenanceBadge provenance={element.provenance} />
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
            <dt className="text-fg-muted">ID</dt>
            <dd className="font-mono text-[12px] break-all">{element.id}</dd>
            <dt className="text-fg-muted">Changed in</dt>
            <dd title="The ontology version its definition or status last changed in. Node queries written for an earlier version keep working while nothing they use changed after it.">
              {changedIn(element)}
            </dd>
            <dt className="text-fg-muted">Confidence</dt>
            <dd>
              <ConfidenceMeter value={element.confidence} />
            </dd>
            <dt className="text-fg-muted">Description</dt>
            <dd>{element.description ?? <span className="text-fg-subtle">None</span>}</dd>
            <dt className="text-fg-muted">Synonyms</dt>
            <dd className="flex flex-wrap gap-1">
              {element.synonyms?.length ? (
                element.synonyms.map((s) => <Badge key={s}>{s}</Badge>)
              ) : (
                <span className="text-fg-subtle">None</span>
              )}
            </dd>
          </dl>
          {ALWAYS_REVIEW.has(element.kind) && (
            <p className="rounded-md bg-info-soft px-3 py-2 text-[12.5px] text-fg">
              {ONTOLOGY_KIND_LABEL[element.kind]} always need human approval before the router uses
              them.
            </p>
          )}
          <section>
            <h3 className="mb-1.5 text-[12.5px] font-medium text-fg-muted">Spec</h3>
            <CodeBlock
              label={`Spec for ${element.name}`}
              code={JSON.stringify(element.spec ?? {}, null, 2)}
              className="max-h-[50dvh]"
            />
          </section>
          {(element.status === 'approved' || element.status === 'stale') && (
            <Withdraw
              key={element.id}
              tenantId={tenantId}
              element={element}
              note={note.trim() || undefined}
            />
          )}
          {decisionsFor(element.status).length > 0 && (
            <Field label="Review note" hint="Optional. Stored with the decision for audit.">
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

function ReviewQueue({
  tenantId,
  queue,
  onOpen,
}: {
  tenantId: string;
  queue: OntologyElement[];
  onOpen: (e: OntologyElement) => void;
}) {
  return (
    <Card className="mb-6">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Review queue <Badge tone={queue.length ? 'warn' : 'ok'}>{queue.length}</Badge>
          </span>
        }
        description="Proposed elements, least confident first."
      />
      {queue.length === 0 ? (
        <EmptyState
          title="Nothing to review"
          description="Run Introspect on a datasource to propose new entities, metrics and policies."
        />
      ) : (
        <Table label="Review queue">
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Kind</TH>
              <TH>Confidence</TH>
              <TH>Provenance</TH>
              <TH>
                <span className="sr-only">Decision</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {queue.map((el) => (
              <TR key={el.id}>
                <TD>
                  <button
                    type="button"
                    onClick={() => onOpen(el)}
                    className="text-left font-medium hover:text-accent hover:underline"
                  >
                    {el.name}
                  </button>
                  {el.description && (
                    <p className="max-w-md truncate text-[12px] text-fg-muted">{el.description}</p>
                  )}
                </TD>
                <TD>
                  <Badge>{el.kind}</Badge>
                </TD>
                <TD>
                  <ConfidenceMeter value={el.confidence} />
                </TD>
                <TD>
                  <ProvenanceBadge provenance={el.provenance} />
                </TD>
                <TD className="text-right">
                  <ReviewActions tenantId={tenantId} element={el} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

export function OntologyPage() {
  const { tenant } = route.useSearch();
  const navigate = route.useNavigate();
  const ontology = useQuery({ ...ontologyQuery(tenant ?? ''), enabled: Boolean(tenant) });
  const [openId, setOpenId] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const cannotReview = deniedReason(usePermissions(), 'ontology.review', tenant);

  const elements = useMemo(() => ontology.data?.elements ?? [], [ontology.data]);
  const queue = useMemo(() => reviewQueue(elements), [elements]);
  const groups = useMemo(() => groupByKind(elements), [elements]);
  // Look the open element up by id so the drawer reflects fresh data after a review.
  const open = openId ? (elements.find((e) => e.id === openId) ?? null) : null;

  return (
    <>
      <PageHeader
        title="Ontology studio"
        description="The Caliban Semantic Model: a governed map of your data that grounds routing and answers."
        actions={
          ontology.data && (
            <>
              <span className="text-[12px] text-fg-subtle">
                Version {ontology.data.version} · {elements.length} elements
              </span>
              <GatedButton
                icon={<IconPlus size={14} />}
                deniedReason={cannotReview}
                onClick={() => setProposing(true)}
              >
                Propose elements
              </GatedButton>
            </>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TenantFilter
          value={tenant}
          allowAll={false}
          onChange={(t) => void navigate({ search: { tenant: t } })}
        />
      </div>

      {!tenant ? (
        <Card>
          <EmptyState
            title="Choose a tenant"
            description="Each tenant has its own ontology. Pick one to review proposals and browse elements."
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
            <h2 id="elements-h" className="mb-3 text-[14px] font-semibold">
              Elements by kind
            </h2>
            {elements.length === 0 ? (
              <Card>
                <EmptyState
                  title="Empty ontology"
                  description="Register a datasource and run Introspect to bootstrap the model."
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
                      <p className="px-4 py-3 text-[12.5px] text-fg-subtle">None yet.</p>
                    ) : (
                      <ul className="max-h-72 overflow-y-auto py-1">
                        {items.map((el) => (
                          <li key={el.id}>
                            <button
                              type="button"
                              onClick={() => setOpenId(el.id)}
                              className="flex w-full items-center justify-between gap-2 px-4 py-1.5 text-left text-[13px] hover:bg-surface-2"
                            >
                              <span className="min-w-0 truncate">{el.name}</span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                {el.changed_in != null && (
                                  <span
                                    className="text-[11.5px] text-fg-subtle tabular-nums"
                                    title={`Changed in version ${el.changed_in}`}
                                  >
                                    v{el.changed_in}
                                  </span>
                                )}
                                <ProvenanceBadge provenance={el.provenance} />
                                <ElementStatusBadge status={el.status} />
                              </span>
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
