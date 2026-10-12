import { ApiError } from '@/api/client';
import {
  ONTOLOGY_KINDS,
  type OntologyElement,
  type OntologyElementKind,
  type ReviewDecision,
} from '@/api/types';

/**
 * The curation queue: proposed elements, least confident first so reviewers
 * spend attention where the bootstrap was least sure. Unknown confidence
 * (null) sorts before everything else. Ties break on name for stability.
 */
export function reviewQueue(elements: readonly OntologyElement[]): OntologyElement[] {
  return elements
    .filter((e) => e.status === 'proposed')
    .sort((a, b) => {
      const ca = a.confidence ?? -1;
      const cb = b.confidence ?? -1;
      return ca !== cb ? ca - cb : a.name.localeCompare(b.name);
    });
}

/** Groups elements by kind in the canonical kind order; empty kinds are kept. */
export function groupByKind(
  elements: readonly OntologyElement[],
): Array<{ kind: OntologyElementKind; items: OntologyElement[] }> {
  return ONTOLOGY_KINDS.map((kind) => ({
    kind,
    items: elements.filter((e) => e.kind === kind).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export const ONTOLOGY_KIND_LABEL: Record<OntologyElementKind, string> = {
  entity: 'Entities',
  attribute: 'Attributes',
  relation: 'Relations',
  metric: 'Metrics',
  dimension: 'Dimensions',
  glossary_term: 'Glossary terms',
  policy: 'Policies',
  verified_query: 'Verified queries',
};

/** Kinds the architecture says must always be human-approved. */
export const ALWAYS_REVIEW: ReadonlySet<OntologyElementKind> = new Set([
  'relation',
  'metric',
  'policy',
]);

/** A published node version that a review decision or a proposal would break. */
export interface BreakingChange {
  /** The element id. */
  element: string;
  /** `approved -> deprecated`, when the control plane says. */
  change?: string;
  /** `name@vN` of the published versions whose fixed queries use the element. */
  nodes: string[];
}

/**
 * The breaking changes a `409` names. The control plane lists them only in
 * the message, after `acknowledge_breaking: true`, as
 * `Service (approved -> deprecated): triage@v3, desk@v1; Other: ...`.
 * Returns null for any other error, and an empty list when the message is a
 * breaking-change refusal the console cannot read (show the message then).
 */
export function breakingChanges(error: unknown): BreakingChange[] | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const marker = 'acknowledge_breaking: true';
  const at = error.message.indexOf(marker);
  if (at < 0) return null;
  // `...acknowledge_breaking: true: <list>` (reviews) or `... true to go ahead: <list>` (proposals).
  const tail = error.message.slice(at + marker.length);
  const start = tail.indexOf(': ');
  if (start < 0) return [];
  const rest = tail.slice(start + 2);
  const out: BreakingChange[] = [];
  for (const part of rest.split('; ')) {
    const sep = part.lastIndexOf(': ');
    if (sep <= 0) continue;
    const head = part.slice(0, sep).trim();
    const nodes = part
      .slice(sep + 2)
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    const m = /^(.+?) \(([^()]+)\)$/.exec(head);
    const [, element, change] = m ?? [];
    out.push(element && change ? { element, change, nodes } : { element: head, nodes });
  }
  return out;
}

/** `triage@v3` as a node name and version; null when it is not one. */
export function parseNodeVersion(ref: string): { name: string; version: number } | null {
  const [, name, version] = /^(.+)@v(\d+)$/.exec(ref) ?? [];
  return name && version ? { name, version: Number(version) } : null;
}

/**
 * The decisions offered on an element. Proposals are approved or rejected;
 * an approved element can be withdrawn (deprecated); a stale one (its source
 * changed) is approved again or deprecated.
 */
export function decisionsFor(status: OntologyElement['status']): ReviewDecision[] {
  switch (status) {
    case 'proposed':
      return ['approve', 'reject'];
    case 'approved':
      return ['deprecate'];
    case 'stale':
      return ['approve', 'deprecate'];
    default:
      return [];
  }
}

/** Elements made outside Caliban, as `POST .../ontology/proposals` takes them. */
export type ProposalsParse =
  { ok: true; elements: OntologyElement[] } | { ok: false; error: string };

const MAX_PROPOSALS = 5000;

/**
 * Reads pasted proposals: a JSON array of elements, or `{"elements": [...]}`
 * (an exported ontology). Each needs `id`, `kind` and `name`; `status` is
 * set to `proposed` (the server writes every one as proposed anyway) and a
 * missing `provenance` becomes `human`. The server checks the rest.
 */
export function parseProposals(text: string): ProposalsParse {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This is not valid JSON.' };
  }
  const list =
    value && typeof value === 'object' && !Array.isArray(value) && 'elements' in value
      ? value.elements
      : value;
  if (!Array.isArray(list) || list.length === 0) {
    return { ok: false, error: 'Paste a non-empty array of elements, or {"elements": [...]}.' };
  }
  if (list.length > MAX_PROPOSALS) {
    return { ok: false, error: `At most ${MAX_PROPOSALS} elements at once.` };
  }
  const ids = new Set<string>();
  const elements: OntologyElement[] = [];
  for (const [i, raw] of list.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: `Element ${i + 1} is not an object.` };
    }
    const e = raw as Record<string, unknown>;
    for (const k of ['id', 'kind', 'name'] as const) {
      if (typeof e[k] !== 'string' || !e[k]) {
        return { ok: false, error: `Element ${i + 1} has no ${k}.` };
      }
    }
    if (!(ONTOLOGY_KINDS as readonly string[]).includes(e.kind as string)) {
      return { ok: false, error: `Element ${i + 1} has an unknown kind "${String(e.kind)}".` };
    }
    if (ids.has(e.id as string)) {
      return { ok: false, error: `Element id "${String(e.id)}" is repeated.` };
    }
    ids.add(e.id as string);
    // `changed_in` is the control plane's to set.
    const rest = { ...e };
    delete rest.changed_in;
    elements.push({
      ...rest,
      status: 'proposed',
      provenance: (e.provenance as OntologyElement['provenance'] | undefined) ?? 'human',
    } as OntologyElement);
  }
  return { ok: true, elements };
}
