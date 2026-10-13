/**
 * Links from the console into the user docs, served on the same origin under
 * `/docs/` (bundled with the release, so they work without network access).
 *
 * This table mirrors the console to docs contract
 * (`.targets/ux-audit/docs-links.md`): the console links only to these pages
 * and anchors. `docsHref` is typed against it, so a link to a page or anchor
 * the docs do not promise does not compile.
 */
export const DOCS_PAGES = {
  start: [],
  'start/gateway-quickstart': ['point-your-app', 'protect-personal-data', 'see-the-request'],
  'start/first-assistant': ['pick-a-template', 'connect-data', 'try-it', 'go-live'],
  'start/sandbox': [],
  'guides/models': ['add-a-model-server', 'add-a-model', 'external-providers', 'local-models'],
  'guides/workspaces': [
    'create',
    'privacy',
    'limits-and-budget',
    'apps-and-keys',
    'provider-accounts',
  ],
  'guides/privacy': ['modes', 'custom-patterns', 'dictionary', 'check-what-the-model-saw'],
  'guides/data-connections': ['connect-mongodb', 'scan-the-schema'],
  'guides/data-dictionary': ['review-suggestions', 'bulk-approve', 'versions'],
  'guides/topics': [
    'add-a-topic',
    'examples',
    'send-to-an-assistant',
    'fix-a-misroute',
    'test-a-sentence',
  ],
  'guides/assistants': [
    'create-from-template',
    'edit-with-the-form',
    'edit-json',
    'budgets',
    'versions',
  ],
  'guides/knowledge': ['create-a-library', 'upload-documents', 'held-back-documents'],
  'guides/tests-and-go-live': [
    'test-cases',
    'save-a-run-as-a-test',
    'run-tests',
    'the-bar',
    'go-live',
    'write-tools-in-tests',
  ],
  'guides/approvals': ['what-needs-approval', 'approve-or-reject', 'notifications'],
  'guides/connected-systems': ['add-a-tool-server', 'approve-a-tool'],
  'guides/conversations-and-runs': ['read-a-run', 'timeline', 'costs'],
  'guides/usage-and-costs': ['usage', 'spend-caps', 'timings'],
  'guides/audit': ['read-the-log', 'verify-the-chain'],
  'guides/people-and-roles': ['roles', 'invite', 'single-sign-on'],
  'guides/api-keys': ['create', 'scopes', 'rotate'],
  'concepts/how-routing-works': [],
  'concepts/how-privacy-works': [],
  'concepts/safety-model': [],
  'concepts/assistants-and-versions': [],
  'concepts/data-dictionary': [],
  'concepts/caching': [],
  'reference/glossary': [
    // One anchor per plain term (the docs list the old names and point here).
    'workspace',
    'assistant',
    'step',
    'topic',
    'data-dictionary',
    'data-connection',
    'query-plan',
    'test-cases',
    'go-live-bar',
    'personal-data',
    'untrusted-data',
    'trust-level',
    'knowledge',
    'connected-system',
    'conversation',
    'automatic-routing',
  ],
  'reference/api': [],
  'reference/assistant-spec': [],
  'reference/limits': [],
  'reference/configuration': [],
} as const satisfies Record<string, readonly string[]>;

export type DocsPage = keyof typeof DOCS_PAGES;
export type DocsAnchor<P extends DocsPage> = (typeof DOCS_PAGES)[P][number];

/** A page of the docs, and optionally one of its promised anchors. */
export interface DocLink<P extends DocsPage = DocsPage> {
  page: P;
  anchor?: DocsAnchor<P>;
}

export function doc<P extends DocsPage>(page: P, anchor?: DocsAnchor<P>): DocLink<P> {
  return anchor ? { page, anchor } : { page };
}

/**
 * Where the docs are served. Relative to the console's origin by default; a
 * build can point it at an internal mirror (`VITE_DOCS_BASE`).
 */
export const DOCS_BASE: string =
  (import.meta.env.VITE_DOCS_BASE as string | undefined)?.replace(/\/?$/, '/') ?? '/docs/';

export function docsHref(link: DocLink): string {
  return `${DOCS_BASE}${link.page}/${link.anchor ? `#${link.anchor}` : ''}`;
}
