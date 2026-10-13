import { doc, type DocLink } from './docs';

/**
 * What the "?" help panel says on each page: the page's purpose, the two or
 * three things people do there, and where the docs explain them. Keyed by
 * route id. Help is pulled by the user, never pushed: no automatic tours
 * (research note 10, section 3).
 */
export interface PageHelp {
  title: string;
  purpose: string;
  tasks: readonly string[];
  links: ReadonlyArray<{ label: string; doc: DocLink }>;
}

export const PAGE_HELP: Record<string, PageHelp> = {
  '/_app/': {
    title: 'Home',
    purpose:
      'What needs your attention now, spend against the caps, and the setup steps that are left.',
    tasks: [
      'Answer approvals that are waiting.',
      'Follow the setup checklist from a model to a first live assistant.',
      'Check spend this month against the workspace caps.',
    ],
    links: [
      { label: 'Where to begin', doc: doc('start') },
      { label: 'Put Caliban in front of your model', doc: doc('start/gateway-quickstart') },
      { label: 'Build a first assistant', doc: doc('start/first-assistant') },
    ],
  },
  '/_app/inbox': {
    title: 'Approvals',
    purpose:
      'Conversations wait here when an assistant asks a question or wants to take an action that needs a person.',
    tasks: [
      'Read why an action needs approval, then approve or reject it with a reason.',
      'Answer a question an assistant asked.',
      'Use J and K to move between cards, A to approve, R to reject.',
    ],
    links: [
      { label: 'What needs approval', doc: doc('guides/approvals', 'what-needs-approval') },
      { label: 'Approve or reject', doc: doc('guides/approvals', 'approve-or-reject') },
      { label: 'The safety model', doc: doc('concepts/safety-model') },
    ],
  },
  '/_app/nodes': {
    title: 'Assistants',
    purpose:
      'Each assistant answers one kind of request with your data and tools, within limits, and is kept in versions.',
    tasks: [
      'Create an assistant from a template.',
      'Open an assistant to test it and make a version live.',
    ],
    links: [
      { label: 'Create from a template', doc: doc('guides/assistants', 'create-from-template') },
      { label: 'Assistants and versions', doc: doc('concepts/assistants-and-versions') },
    ],
  },
  '/_app/nodes/$tenantId/$nodeName': {
    title: 'An assistant',
    purpose:
      'Its versions, its tests and the steps to go live. Only the live version answers requests.',
    tasks: [
      'Go live: publish a version, run its tests, check the bar, make it live.',
      'Create a new version with the form or the JSON view.',
      'Compare two versions.',
    ],
    links: [
      { label: 'Go live', doc: doc('guides/tests-and-go-live', 'go-live') },
      { label: 'Test cases', doc: doc('guides/tests-and-go-live', 'test-cases') },
      { label: 'Edit with the form', doc: doc('guides/assistants', 'edit-with-the-form') },
    ],
  },
  '/_app/runs': {
    title: 'Conversations',
    purpose: 'Every request an assistant handled: what it did, how long it took and what it cost.',
    tasks: ['Filter by assistant or outcome.', 'Open a conversation to read its steps.'],
    links: [
      { label: 'Read a conversation', doc: doc('guides/conversations-and-runs', 'read-a-run') },
      { label: 'Costs', doc: doc('guides/conversations-and-runs', 'costs') },
    ],
  },
  '/_app/runs/$tenantId/$runId': {
    title: 'A conversation',
    purpose: 'What was asked, the answer, and each step the assistant took to get there.',
    tasks: [
      'Read the timeline of steps.',
      'Save the conversation as a test case, as a right or a wrong answer.',
      'Answer or approve a step that waits for a person.',
    ],
    links: [
      { label: 'The timeline', doc: doc('guides/conversations-and-runs', 'timeline') },
      { label: 'Save as a test', doc: doc('guides/tests-and-go-live', 'save-a-run-as-a-test') },
    ],
  },
  '/_app/rag': {
    title: 'Knowledge',
    purpose: 'Document libraries your assistants can search and cite.',
    tasks: [
      'Create a library and upload documents (several at once).',
      'Review documents held back by the safety checks.',
    ],
    links: [
      { label: 'Create a library', doc: doc('guides/knowledge', 'create-a-library') },
      { label: 'Upload documents', doc: doc('guides/knowledge', 'upload-documents') },
      { label: 'Held-back documents', doc: doc('guides/knowledge', 'held-back-documents') },
    ],
  },
  '/_app/usage': {
    title: 'Usage and costs',
    purpose: 'Requests, tokens, cache savings and spend, per model and per assistant.',
    tasks: ['Filter by workspace or assistant.', 'Check spend against the caps.'],
    links: [
      { label: 'Usage', doc: doc('guides/usage-and-costs', 'usage') },
      { label: 'Spend caps', doc: doc('guides/usage-and-costs', 'spend-caps') },
    ],
  },
  '/_app/models': {
    title: 'Models',
    purpose: 'The model servers Caliban can reach, and the models it may route requests to.',
    tasks: [
      'Add a model server, then let Caliban discover its models.',
      'Add an outside provider model.',
    ],
    links: [
      { label: 'Add a model server', doc: doc('guides/models', 'add-a-model-server') },
      { label: 'Add a model', doc: doc('guides/models', 'add-a-model') },
    ],
  },
  '/_app/datasources': {
    title: 'Data connections',
    purpose: 'Read-only links to your databases. A scan proposes entries for the data dictionary.',
    tasks: ['Connect a database.', 'Scan it to suggest data dictionary entries.'],
    links: [
      { label: 'Connect MongoDB', doc: doc('guides/data-connections', 'connect-mongodb') },
      { label: 'Scan the schema', doc: doc('guides/data-connections', 'scan-the-schema') },
    ],
  },
  '/_app/ontology': {
    title: 'Data dictionary',
    purpose:
      'Business names and meanings for your data. Assistants can only ask about what is approved here.',
    tasks: [
      'Approve every suggestion above a confidence in one step.',
      'Review the rest with the keyboard: A approves, R rejects, J and K move.',
    ],
    links: [
      { label: 'Review suggestions', doc: doc('guides/data-dictionary', 'review-suggestions') },
      { label: 'Approve in bulk', doc: doc('guides/data-dictionary', 'bulk-approve') },
      { label: 'About the data dictionary', doc: doc('concepts/data-dictionary') },
    ],
  },
  '/_app/tools': {
    title: 'Connected systems',
    purpose: 'Outside systems assistants may call. Each action is approved by a person first.',
    tasks: ['Add a tool server.', 'Review and approve its actions.'],
    links: [
      { label: 'Add a tool server', doc: doc('guides/connected-systems', 'add-a-tool-server') },
      { label: 'Approve a tool', doc: doc('guides/connected-systems', 'approve-a-tool') },
    ],
  },
  '/_app/tenants': {
    title: 'Workspaces',
    purpose:
      'Separate spaces with their own keys, data, assistants and budget. Nothing crosses between them.',
    tasks: ['Create a workspace.', 'Open one to set privacy, limits, topics and app keys.'],
    links: [
      { label: 'Create a workspace', doc: doc('guides/workspaces', 'create') },
      { label: 'Privacy settings', doc: doc('guides/workspaces', 'privacy') },
    ],
  },
  '/_app/tenants/$tenantId': {
    title: 'A workspace',
    purpose: 'Its app keys, provider accounts, topics, privacy and limits.',
    tasks: [
      'Create an app key for an application.',
      'Choose how personal data is protected.',
      'Set spend caps and limits.',
    ],
    links: [
      { label: 'Apps and keys', doc: doc('guides/workspaces', 'apps-and-keys') },
      { label: 'Privacy', doc: doc('guides/workspaces', 'privacy') },
      { label: 'Limits and budget', doc: doc('guides/workspaces', 'limits-and-budget') },
    ],
  },
  '/_app/audit': {
    title: 'Audit log',
    purpose: 'Every change and decision, in a tamper-evident chain.',
    tasks: ['Filter by workspace or action.', 'Check that the chain is intact.'],
    links: [
      { label: 'Read the log', doc: doc('guides/audit', 'read-the-log') },
      { label: 'Verify the chain', doc: doc('guides/audit', 'verify-the-chain') },
    ],
  },
  '/_app/users': {
    title: 'People and roles',
    purpose: 'Who can sign in and what each role may do.',
    tasks: ['Grant a role to a person or a group.', 'Revoke the sessions of someone who left.'],
    links: [
      { label: 'Roles', doc: doc('guides/people-and-roles', 'roles') },
      { label: 'Single sign-on', doc: doc('guides/people-and-roles', 'single-sign-on') },
    ],
  },
  '/_app/settings': {
    title: 'Developer',
    purpose: 'The addresses and code snippets an application needs to call Caliban.',
    tasks: ['Copy a snippet for Python, TypeScript or curl.', 'Point an existing app at Caliban.'],
    links: [
      {
        label: 'Point your app at Caliban',
        doc: doc('start/gateway-quickstart', 'point-your-app'),
      },
      { label: 'The API', doc: doc('reference/api') },
    ],
  },
};
