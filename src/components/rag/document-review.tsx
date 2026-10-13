import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { usePermissions } from '@/api/auth';
import { ragDocumentQuery, useReleaseRagDocument } from '@/api/queries';
import type { RagCollection, RagDocument, RagFinding } from '@/api/types';
import { EMPTY, formatDateTime, formatInt } from '@/lib/format';
import { deniedReason } from '@/lib/permissions';
import {
  contentTypeLabel,
  findingHint,
  findingLabel,
  findingPlace,
  formatBytes,
  formatSeconds,
  settingsOf,
  vettingOf,
} from '@/lib/rag';
import { Badge, Checkbox, ErrorState, FormError, GatedButton, LoadingState } from '../ui';
import { IconAlert, IconCheck } from '../ui/icons';
import { DocumentStatusBadge, TrustBadge, VettingBadge } from './rag-badges';

/** What the ingest checks flagged in a version. No excerpts: document text stays sealed. */
function Findings({
  findings,
  acknowledged,
  quarantined,
  trusted,
}: {
  findings: RagFinding[];
  acknowledged: boolean;
  quarantined: boolean;
  trusted: boolean;
}) {
  return (
    <section
      aria-label="What the checks found"
      className="rounded-md border border-danger/50 bg-danger-soft p-3 text-[12.5px]"
    >
      <h4 className="flex items-center gap-1.5 text-[13px] font-semibold text-danger">
        <IconAlert size={15} className="shrink-0" />
        The checks found {findings.length} problem{findings.length === 1 ? '' : 's'}
      </h4>
      <p className="mt-1 text-fg-muted">
        {quarantined
          ? 'This version is held for review: assistants cannot search it. '
          : trusted && !acknowledged
            ? 'It is from your team, so these problems were recorded without holding it back. '
            : ''}
        The document text stays encrypted, so each problem names the passage it is in and the
        headings above it, not the text: check that part of the original before releasing it.
        {acknowledged && ' An approver has read these problems and released it.'}
      </p>
      <ul className="mt-2.5 flex flex-col gap-2">
        {findings.map((f, i) => (
          <li
            key={i}
            className="flex flex-col gap-1 rounded border border-danger/30 bg-surface p-2.5"
          >
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone="danger">{findingLabel(f.kind)}</Badge>
              <span className="text-[12px] text-fg-muted">{findingPlace(f)}</span>
            </span>
            <span className="text-[12px] text-fg-subtle">{findingHint(f.kind)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Releasing a quarantined version: the findings acknowledged, by someone with rag.approve. */
function Release({
  tenantId,
  collection,
  doc,
}: {
  tenantId: string;
  collection: RagCollection;
  doc: RagDocument;
}) {
  const release = useReleaseRagDocument(tenantId, collection.name);
  const [ack, setAck] = useState(false);
  const denied = deniedReason(usePermissions(), 'rag.approve', tenantId);
  const deadline = formatSeconds(settingsOf(collection).vet_deadline_secs);

  if (release.isSuccess) {
    return (
      <p role="status" className="text-[12.5px] text-ok">
        Released. Version {doc.version} is prepared again, and searched once it is ready.
      </p>
    );
  }
  return (
    <section
      aria-label="Release"
      className="flex flex-col gap-3 rounded-md border border-border p-3 text-[12.5px]"
    >
      <p className="text-fg-muted">
        Releasing prepares this version again; it is searched once ready. The release is recorded in
        the audit log with the problems found. Passages from it still count as untrusted data, so an
        action they lead to still needs a person to approve it.
      </p>
      {doc.trust === 'untrusted' && (
        <p className="text-fg-muted">
          Its checks then get {deadline} from the release: if they have not passed by then, the
          version fails instead of being searched.
        </p>
      )}
      <Checkbox
        label="I have read these problems and release this document"
        checked={ack}
        disabled={Boolean(denied)}
        onChange={(e) => {
          setAck(e.target.checked);
          release.reset();
        }}
      />
      <FormError error={release.error} />
      <span>
        <GatedButton
          variant="primary"
          deniedReason={denied}
          loading={release.isPending}
          disabled={!ack}
          onClick={() => release.mutate({ docId: doc.doc_id, version: doc.version })}
        >
          Release document
        </GatedButton>
      </span>
    </section>
  );
}

function Version({
  tenantId,
  collection,
  doc,
  live,
}: {
  tenantId: string;
  collection: RagCollection;
  doc: RagDocument;
  live: boolean;
}) {
  const quarantined = doc.status === 'quarantined';
  const rows: Array<[string, ReactNode]> = [
    ['Written by', <TrustBadge key="t" trust={doc.trust} />],
    [
      'Time left for checks',
      <span key="v" className="inline-flex flex-wrap items-center gap-2">
        <VettingBadge vetting={vettingOf(doc, collection)} />
        {doc.vet_deadline_at && doc.status !== 'quarantined' && (
          <span className="text-fg-muted">{formatDateTime(doc.vet_deadline_at)}</span>
        )}
      </span>,
    ],
    ['Format', contentTypeLabel(doc.content_type)],
    ['Size', formatBytes(doc.bytes)],
    ['Passages', formatInt(doc.chunks)],
    ['Tokens (estimated)', formatInt(doc.tokens)],
    ['Personal data', `${formatInt(doc.pii_entities)} items hidden before indexing`],
    ['Source', doc.source || EMPTY],
    ['Valid from', formatDateTime(doc.valid_from)],
    ['Valid until', formatDateTime(doc.valid_to)],
    ['Added', `${formatDateTime(doc.created_at)} by ${doc.created_by}`],
    ['Indexed', formatDateTime(doc.indexed_at)],
    ['Attempts', formatInt(doc.attempts)],
  ];
  if (doc.released_at) {
    rows.push(['Released', `${formatDateTime(doc.released_at)} by ${doc.released_by ?? EMPTY}`]);
  }

  return (
    <section
      aria-label={`Version ${doc.version}`}
      className="flex flex-col gap-3 rounded-md border border-border p-3"
    >
      <h3 className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
        <Badge>v{doc.version}</Badge>
        <DocumentStatusBadge status={doc.status} />
        {live && (
          <Badge tone="accent" title="The version searches use.">
            Searched
          </Badge>
        )}
      </h3>
      {doc.error && (
        <p className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-[12.5px] text-fg">
          <IconAlert size={14} className="mt-0.5 shrink-0 text-danger" />
          {doc.error}
        </p>
      )}
      {doc.findings.length > 0 ? (
        <Findings
          findings={doc.findings}
          acknowledged={doc.findings_acknowledged}
          quarantined={quarantined}
          trusted={doc.trust === 'trusted'}
        />
      ) : (
        doc.status === 'ready' && (
          <p className="flex items-start gap-2 rounded-md bg-ok-soft px-3 py-2 text-[12.5px] text-fg">
            <IconCheck size={14} className="mt-0.5 shrink-0 text-ok" />
            The checks found nothing.
          </p>
        )
      )}
      {quarantined && <Release tenantId={tenantId} collection={collection} doc={doc} />}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-fg-muted">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Every version of a document, newest first: state, indexing figures, scan
 * findings, and the release of a quarantined version. Never the content.
 */
export function DocumentReview({
  tenantId,
  collection,
  docId,
}: {
  tenantId: string;
  collection: RagCollection;
  docId: string;
}) {
  const doc = useQuery(ragDocumentQuery(tenantId, collection.name, docId));
  if (doc.isPending) return <LoadingState rows={3} />;
  if (doc.isError) return <ErrorState error={doc.error} onRetry={() => void doc.refetch()} />;
  const { versions, live_version: live } = doc.data;
  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <p className="text-[12.5px] text-fg-muted">
        {live != null
          ? `Searches use version ${live}.`
          : 'No version is ready: assistants cannot search this document yet.'}{' '}
        The content is encrypted with the workspace&apos;s key and never shown.
      </p>
      {versions.map((v) => (
        <Version
          key={v.version}
          tenantId={tenantId}
          collection={collection}
          doc={v}
          live={v.version === live}
        />
      ))}
    </div>
  );
}
