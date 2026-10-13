import { doc, type DocLink } from './docs';

/**
 * The setup checklist on Home (UX-01; research note 10, section 1): short
 * phases, each item derived from live state, so it can never drift from what
 * is really set up. `undefined` means not known (loading, or the user's role
 * cannot see it): such items are left out rather than shown as to do.
 */
export interface SetupFacts {
  serverReachable?: boolean;
  chatModel?: boolean;
  workspace?: boolean;
  appKey?: boolean;
  firstRequest?: boolean;
  data?: boolean;
  assistant?: boolean;
  published?: boolean;
  live?: boolean;
}

export type ChecklistLink =
  | { to: '/models'; search: { tab: 'servers' | 'catalogue' } }
  | { to: '/tenants' }
  | { to: '/tenants/$tenantId'; params: { tenantId: string }; search: { tab: 'api-keys' } }
  | { to: '/settings' }
  | { to: '/rag' }
  | { to: '/nodes'; search: { new?: 1 } };

export interface ChecklistItem {
  id: keyof SetupFacts;
  title: string;
  /** What to do, one sentence. */
  how: string;
  done: boolean;
  link: ChecklistLink;
  action: string;
  doc: DocLink;
}

export interface ChecklistPhase {
  id: 'install' | 'assistant';
  title: string;
  description: string;
  items: ChecklistItem[];
}

export function setupPhases(facts: SetupFacts, workspaceId: string | undefined): ChecklistPhase[] {
  const item = (
    id: keyof SetupFacts,
    rest: Omit<ChecklistItem, 'id' | 'done'>,
  ): ChecklistItem | null => {
    const v = facts[id];
    return v === undefined ? null : { id, done: v, ...rest };
  };
  const keys: ChecklistLink = workspaceId
    ? { to: '/tenants/$tenantId', params: { tenantId: workspaceId }, search: { tab: 'api-keys' } }
    : { to: '/tenants' };
  const install = [
    item('serverReachable', {
      title: 'A model server is reachable',
      how: 'Add the server your models run on; Caliban checks it can reach it.',
      link: { to: '/models', search: { tab: 'servers' } },
      action: 'Add a model server',
      doc: doc('guides/models', 'add-a-model-server'),
    }),
    item('chatModel', {
      title: 'A chat model is available',
      how: 'Add a model, or let Caliban discover the models on your server.',
      link: { to: '/models', search: { tab: 'catalogue' } },
      action: 'Add a model',
      doc: doc('guides/models', 'add-a-model'),
    }),
    item('workspace', {
      title: 'A workspace exists',
      how: 'A workspace keeps its own keys, data, assistants and budget.',
      link: { to: '/tenants' },
      action: 'Create a workspace',
      doc: doc('guides/workspaces', 'create'),
    }),
    item('appKey', {
      title: 'An app key is created',
      how: 'Applications call Caliban with a key of the workspace.',
      link: keys,
      action: 'Create an app key',
      doc: doc('guides/api-keys', 'create'),
    }),
    item('firstRequest', {
      title: 'A first request went through',
      how: 'Point an application at Caliban, or copy a snippet and run it.',
      link: { to: '/settings' },
      action: 'Copy a snippet',
      doc: doc('start/gateway-quickstart', 'see-the-request'),
    }),
  ].filter((i): i is ChecklistItem => i !== null);
  const assistant = [
    item('data', {
      title: 'Your data is connected',
      how: 'Upload documents to a library, or connect a database, for assistants to use.',
      link: { to: '/rag' },
      action: 'Add documents',
      doc: doc('start/first-assistant', 'connect-data'),
    }),
    item('assistant', {
      title: 'A first assistant is created',
      how: 'Start from a template: triage, legal research, support desk or a router.',
      link: { to: '/nodes', search: { new: 1 } },
      action: 'New assistant',
      doc: doc('start/first-assistant', 'pick-a-template'),
    }),
    item('published', {
      title: 'A version is published and tested',
      how: 'Publishing freezes a version so its tests can run.',
      link: { to: '/nodes', search: {} },
      action: 'Open assistants',
      doc: doc('guides/tests-and-go-live', 'run-tests'),
    }),
    item('live', {
      title: 'An assistant is live',
      how: 'Once its tests pass the go-live bar, make the version live.',
      link: { to: '/nodes', search: {} },
      action: 'Go live',
      doc: doc('start/first-assistant', 'go-live'),
    }),
  ].filter((i): i is ChecklistItem => i !== null);
  return [
    {
      id: 'install' as const,
      title: 'Install and connect',
      description: 'Usually done once, by the IT administrator.',
      items: install,
    },
    {
      id: 'assistant' as const,
      title: 'Your first assistant',
      description: 'Build an assistant over your own data and put it live.',
      items: assistant,
    },
  ].filter((p) => p.items.length > 0);
}

export function phaseDone(p: ChecklistPhase): boolean {
  return p.items.every((i) => i.done);
}

/** The phase to open: the first with something left to do. */
export function currentPhase(phases: ChecklistPhase[]): ChecklistPhase | undefined {
  return phases.find((p) => !phaseDone(p));
}
