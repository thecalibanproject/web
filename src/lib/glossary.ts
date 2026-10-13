import { doc, type DocLink } from './docs';

/**
 * The console's one glossary: every internal term the engine and its API use,
 * the plain label the console shows instead, a one-line definition, where the
 * docs explain it, and the old names (`also`), which the command palette
 * searches and toggletips show as "also called". One term per concept: UI copy
 * takes its words from here (research note 10, section 5; jargon.json).
 *
 * Technical names stay visible where an expert needs them: in Advanced
 * sections, JSON views and the "also called" line of a toggletip.
 */
export interface GlossaryEntry {
  /** Plain label, as shown in the UI. */
  label: string;
  /** One sentence, plain words. */
  definition: string;
  /** Internal and older names: the API's, the engine's, the old console's. */
  also: readonly string[];
  doc: DocLink;
}

const g = (
  label: string,
  definition: string,
  also: readonly string[],
  link: DocLink,
): GlossaryEntry => ({ label, definition, also, doc: link });

export const GLOSSARY = {
  workspace: g(
    'Workspace',
    'A separate space with its own keys, data, assistants and budget; nothing crosses between workspaces.',
    ['tenant', 'tenants', 'organisation'],
    doc('reference/glossary', 'workspace'),
  ),
  assistant: g(
    'Assistant',
    'An AI helper with instructions, data access, tools and limits, kept in versions.',
    ['node', 'nodes', 'node spec', 'agent', 'workflow'],
    doc('reference/glossary', 'assistant'),
  ),
  step: g(
    'Step',
    'One thing an assistant does: think with a model, look something up, call a tool or ask a person.',
    ['vertex', 'vertices'],
    doc('reference/glossary', 'step'),
  ),
  subAssistant: g(
    'Sub-assistant',
    'An assistant that another assistant calls for part of the job.',
    ['subnode', 'node://'],
    doc('concepts/assistants-and-versions'),
  ),
  topic: g(
    'Topic',
    'A kind of request. Automatic routing picks the topic of a message from its example sentences.',
    ['intent', 'routing intent', 'exemplars', 'kNN'],
    doc('reference/glossary', 'topic'),
  ),
  dataDictionary: g(
    'Data dictionary',
    'Business names and meanings for your database, reviewed by a person; assistants only query what is approved.',
    ['ontology', 'semantic model', 'CSM', 'ontology studio'],
    doc('reference/glossary', 'data-dictionary'),
  ),
  dataConnection: g(
    'Data connection',
    'A read-only link to one of your databases. A scan proposes data dictionary entries.',
    ['datasource', 'datasources', 'introspection', 'introspect'],
    doc('reference/glossary', 'data-connection'),
  ),
  queryPlan: g(
    'Query plan',
    'The structured question an assistant asks your data; Caliban turns it into a safe database query.',
    ['CQIR'],
    doc('reference/glossary', 'query-plan'),
  ),
  testCases: g(
    'Test cases',
    'Example requests with what a good answer looks like, run before a version goes live.',
    ['golden set', 'golden cases', 'eval', 'evals', 'golden eval'],
    doc('reference/glossary', 'test-cases'),
  ),
  safetyTests: g(
    'Safety tests',
    'Attacks hidden in data the assistant reads, to check it is not tricked into acting on them.',
    ['injection suite', 'injection eval', 'prompt injection'],
    doc('concepts/safety-model'),
  ),
  passedAllTries: g(
    'Passed every try',
    'A test case counts as passed only when it passes on every one of its tries.',
    ['pass^k', 'pass hat k', 'k'],
    doc('guides/tests-and-go-live', 'the-bar'),
  ),
  goLiveBar: g(
    'Go-live bar',
    'The minimum test results a version needs before it can go live.',
    ['promotion bar', 'promotion gate', 'eval policy', 'gate'],
    doc('reference/glossary', 'go-live-bar'),
  ),
  grader: g(
    'Grader',
    'A model that reads an answer and the description of a good answer, and says pass or fail.',
    ['judge model', 'llm_judge', 'rubric'],
    doc('guides/tests-and-go-live', 'test-cases'),
  ),
  personalData: g(
    'Personal data',
    'Names, ID numbers, phone numbers and similar, replaced before a model sees them.',
    ['PII', 'pseudonymization', 'masking'],
    doc('reference/glossary', 'personal-data'),
  ),
  placeholderConsistency: g(
    'Placeholder consistency',
    'Whether the same personal data gets the same placeholder across conversations, or only within one.',
    ['surrogate scope', 'surrogate', 'stand-in'],
    doc('guides/privacy', 'modes'),
  ),
  untrustedData: g(
    'Untrusted data',
    'Text that came from a customer, a document or a tool: used as data, never obeyed as instructions.',
    ['taint', 'tainted', 'taint labels', 'tainted call'],
    doc('reference/glossary', 'untrusted-data'),
  ),
  trustLevel: g(
    'Where the model runs',
    'Decides which data a model may receive: on your servers, a verified enclave, a provider under contract or a public provider.',
    ['trust tier', 'T0', 'T1', 'T2', 'T3', 'sovereign', 'attested'],
    doc('reference/glossary', 'trust-level'),
  ),
  knowledge: g(
    'Knowledge',
    'Document libraries your assistants can search and cite.',
    ['retrieval', 'RAG', 'collection', 'collections'],
    doc('reference/glossary', 'knowledge'),
  ),
  connectedSystem: g(
    'Connected system',
    'An outside system an assistant may call; each of its actions is approved by a person first.',
    ['tool server', 'MCP', 'tools', 'manifest'],
    doc('reference/glossary', 'connected-system'),
  ),
  conversation: g(
    'Conversation',
    'One request to an assistant and everything it did to answer it.',
    ['run', 'runs', 'node run'],
    doc('reference/glossary', 'conversation'),
  ),
  approvals: g(
    'Approvals',
    'Conversations waiting for a person: a question to answer, or an action to approve.',
    ['inbox', 'human step', 'input_required'],
    doc('guides/approvals', 'what-needs-approval'),
  ),
  automaticRouting: g(
    'Automatic routing',
    'The model name apps use to let Caliban pick the assistant or model for each message.',
    ['caliban/auto', 'route', 'routes'],
    doc('reference/glossary', 'automatic-routing'),
  ),
  sharedAdminToken: g(
    'Shared admin token',
    'The emergency sign-in for when single sign-on is not set up; actions are recorded as the shared token.',
    ['break_glass', 'break glass', 'admin token'],
    doc('guides/people-and-roles', 'single-sign-on'),
  ),
  appKey: g(
    'App key',
    'The key an application uses to call Caliban for one workspace, limited to the assistants and data it names.',
    ['API key', 'api_key', 'Caliban key'],
    doc('guides/api-keys', 'create'),
  ),
  providerAccount: g(
    'Provider account',
    "Your own account with an outside model provider, used for this workspace's requests.",
    ['BYOK', 'provider key', 'provider keys'],
    doc('guides/workspaces', 'provider-accounts'),
  ),
  answerCheck: g(
    'Answer check',
    'Checks the final answer for links, contacts or instructions that came only from untrusted text.',
    ['answer guard', 'guardrails.answer', 'redact'],
    doc('concepts/safety-model'),
  ),
  documentLibrary: g(
    'Document library',
    'A set of documents in Knowledge that assistants can search and cite.',
    ['collection', 'rag collection'],
    doc('guides/knowledge', 'create-a-library'),
  ),
  heldForReview: g(
    'Held for review',
    'An uploaded document the safety checks stopped; assistants cannot read it until someone allows it.',
    ['quarantined', 'quarantine', 'vetting'],
    doc('guides/knowledge', 'held-back-documents'),
  ),
  scan: g(
    'Scan',
    'Reads the structure of a data connection and suggests entries for the data dictionary.',
    ['introspect', 'introspection'],
    doc('guides/data-connections', 'scan-the-schema'),
  ),
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryId = keyof typeof GLOSSARY;

/**
 * Words that must not appear in basic UI copy (they may appear in Advanced
 * sections, JSON views and toggletips). Checked by `copy-lint.test.ts`.
 */
export const BANNED_IN_BASIC_COPY: readonly RegExp[] = [
  /\bCQIR\b/i,
  /\bkNN\b/i,
  /\btaint(ed)?\b/i,
  /pass\^k/i,
  /pass@1/i,
  // Google's "Vertex AI" is a product name, not the engine's term.
  /\bvert(ex(?! AI)|ices)\b/i,
  /\bsurrogate\b/i,
  /\bontology\b/i,
  /\btenants?\b/i,
  /\bnodes?\b/i,
  /\bintents?\b/i,
  /\bexemplars?\b/i,
  /\bbreak_glass\b/i,
  /\bpromotion (bar|gate)\b/i,
  /\bgolden set\b/i,
  /\btrust tiers?\b/i,
  // The house rule: no em or en dashes in copy.
  /—/,
  /–/,
];

/** The glossary entries a free-text query matches, by label, old name or definition. */
export function searchGlossary(query: string): Array<[GlossaryId, GlossaryEntry]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return (Object.entries(GLOSSARY) as Array<[GlossaryId, GlossaryEntry]>).filter(
    ([, e]) => e.label.toLowerCase().includes(q) || e.also.some((a) => a.toLowerCase().includes(q)),
  );
}
