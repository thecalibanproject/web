import { ONTOLOGY_KINDS, type OntologyElement, type OntologyElementKind } from '@/api/types';

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
