import { ApiError } from '@/api/client';
import {
  ONTOLOGY_KINDS,
  type OntologyBreaking,
  type OntologyElement,
  type OntologyElementKind,
  type OntologyElementProposal,
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

/** The `error.code` of a breaking-change refusal (`409`). */
export const BREAKING_CODE = 'ontology_breaking_change';

/**
 * An approved element a review decision or a proposal withdraws, and the
 * published node versions whose fixed queries use it. `change` is
 * `approved -> deprecated`; `versions` is empty only when the control plane
 * sent `nodes` alone.
 */
export type BreakingChange = OntologyBreaking;

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function readVersions(v: unknown): BreakingChange['versions'] | null {
  if (!Array.isArray(v)) return null;
  const out: BreakingChange['versions'] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') return null;
    const { node, version } = x as Record<string, unknown>;
    if (typeof node !== 'string' || typeof version !== 'number') return null;
    out.push({ node, version });
  }
  return out;
}

/**
 * Reads a `breaking` list as the control plane sends it (in a `409` and in
 * the response of a call that acknowledged it). Null when it is not one: an
 * unexpected shape is not guessed at.
 */
export function readBreaking(value: unknown): BreakingChange[] | null {
  if (!Array.isArray(value)) return null;
  const out: BreakingChange[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const b = raw as Record<string, unknown>;
    if (typeof b.element !== 'string' || typeof b.change !== 'string') return null;
    if (!isStringArray(b.nodes)) return null;
    const versions = b.versions === undefined ? [] : readVersions(b.versions);
    if (!versions) return null;
    out.push({ element: b.element, change: b.change, nodes: b.nodes, versions });
  }
  return out;
}

/**
 * The breaking changes a `409` names: `error.code` `ontology_breaking_change`
 * with `error.breaking`. Null for any other error. An empty list when the
 * error is a breaking-change refusal whose list the console cannot read
 * (the caller shows the server's message then).
 */
export function breakingChanges(error: unknown): BreakingChange[] | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  if (error.code !== BREAKING_CODE) return null;
  return readBreaking(error.breaking) ?? [];
}

/**
 * The node versions a breaking change names, structured: from `versions`,
 * or read from `nodes` (`name@vN`) when the control plane sent only those.
 * A ref that is not `name@vN` is kept as text.
 */
export function breakingVersions(
  change: BreakingChange,
): Array<{ ref: string; node?: string; version?: number }> {
  if (change.versions.length > 0) {
    return change.versions.map((v) => ({ ref: `${v.node}@v${v.version}`, ...v }));
  }
  return change.nodes.map((ref) => {
    const parsed = parseNodeVersion(ref);
    return parsed ? { ref, node: parsed.name, version: parsed.version } : { ref };
  });
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
  { ok: true; elements: OntologyElementProposal[] } | { ok: false; error: string };

const MAX_PROPOSALS = 5000;

/**
 * Reads pasted proposals: a JSON array of elements, or `{"elements": [...]}`
 * (an exported ontology). Each needs `id`, `kind` and `name`. `status` and
 * `changed_in` are dropped: the server writes every one as `proposed` and
 * sets the version. A missing `provenance` becomes `human`. The server checks
 * the rest.
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
  const elements: OntologyElementProposal[] = [];
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
    // Both are the control plane's to set.
    const rest = { ...e };
    delete rest.status;
    delete rest.changed_in;
    elements.push({
      ...rest,
      provenance: (e.provenance as OntologyElement['provenance'] | undefined) ?? 'human',
    } as OntologyElementProposal);
  }
  return { ok: true, elements };
}
