import type { AuditEntry, DatasourceKind, ProviderKind, TrustTier } from '@/api/types';
import {
  DATASOURCE_LABEL,
  PII_MODE_LABEL,
  PROVIDER_SHORT,
  SURROGATE_SCOPE_LABEL,
  TRUST_TIER_LABEL,
} from './labels';

/** Window sizes offered for GET /api/v1/audit?limit= (the API caps it at 1000). */
export const AUDIT_LIMITS = [100, 250, 500, 1000] as const;
export const AUDIT_PAGE_SIZE = 50;

/** First 12 hex characters: enough to tell rows apart, short enough for a table cell. */
export function shortHash(hash: string | null | undefined): string {
  if (!hash) return '';
  return hash.length > 12 ? `${hash.slice(0, 12)}…` : hash;
}

// `detail` is free-form JSON. These read one field and ignore anything of
// another type, so a summary never throws on a row written by an older server.
type Detail = AuditEntry['detail'];
const str = (d: Detail, k: string): string | undefined => {
  const v = d[k];
  return typeof v === 'string' && v ? v : undefined;
};
const num = (d: Detail, k: string): number | undefined => {
  const v = d[k];
  return typeof v === 'number' ? v : undefined;
};
const list = (d: Detail, k: string): unknown[] => {
  const v = d[k];
  return Array.isArray(v) ? (v as unknown[]) : [];
};
const change = (d: Detail, k: string): { from: unknown; to: unknown } | undefined => {
  const v = d[k];
  return v && typeof v === 'object' && 'to' in v
    ? (v as { from: unknown; to: unknown })
    : undefined;
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function quoted(name: string | undefined): string | undefined {
  return name ? `"${name}"` : undefined;
}

function keyLabel(d: Detail): string {
  const name = quoted(str(d, 'name'));
  const prefix = str(d, 'prefix');
  if (name && prefix) return `${name} (${prefix}…)`;
  return name ?? (prefix ? `${prefix}…` : 'key');
}

const providerLabel = (kind: string | undefined) =>
  kind ? (PROVIDER_SHORT[kind as ProviderKind] ?? kind) : undefined;
const tierLabel = (tier: string | undefined) =>
  tier ? (TRUST_TIER_LABEL[tier as TrustTier] ?? tier) : undefined;
const datasourceLabel = (kind: string | undefined) =>
  kind ? (DATASOURCE_LABEL[kind as DatasourceKind] ?? kind) : undefined;

const TENANT_FIELDS: Array<[string, string]> = [
  ['pii_default', 'personal data'],
  ['pii_surrogate_scope', 'placeholder consistency'],
  ['semantic_cache', 'reuse similar answers'],
];

const fmt = (v: unknown): string => {
  if (v == null) return 'unset';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return `${v}`;
  return JSON.stringify(v);
};

/** A tenant setting's value in the words the settings page uses. */
function settingValue(k: string, v: unknown): string {
  const labels: Record<string, Record<string, string>> = {
    pii_default: PII_MODE_LABEL,
    pii_surrogate_scope: SURROGATE_SCOPE_LABEL,
  };
  return typeof v === 'string' ? (labels[k]?.[v] ?? v) : fmt(v);
}

/** Fallback for actions this console does not know yet: `key: value` pairs. */
function genericSummary(d: Detail): string {
  const parts = Object.entries(d).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}: ${plural(v.length, 'item')}`;
    if (v && typeof v === 'object') return `${k}: ${JSON.stringify(v)}`;
    return `${k}: ${fmt(v)}`;
  });
  const text = parts.join(', ');
  return text.length > 160 ? `${text.slice(0, 159)}…` : text;
}

/**
 * One readable line for an audit row's `detail`, by action. Returns '' when
 * there is nothing to add to the action and target (e.g. `model.delete`).
 */
export function summarizeAudit(entry: Pick<AuditEntry, 'action' | 'detail'>): string {
  const d = entry.detail ?? {};
  switch (entry.action) {
    case 'tenant.create': {
      const settings = TENANT_FIELDS.flatMap(([k, label]) => {
        const v = str(d, k);
        return v ? [`${label} ${settingValue(k, v)}`] : [];
      });
      const name = quoted(str(d, 'name'));
      return [name ? `Created ${name}` : 'Created', settings.join(', ')].filter(Boolean).join(': ');
    }
    case 'tenant.update': {
      // Only the fields the change carried (a partial update is not a reset, UX-72).
      const changed = TENANT_FIELDS.flatMap(([k, label]) => {
        const c = change(d, k);
        return c && c.from !== c.to && c.to !== undefined
          ? [`${label} ${settingValue(k, c.from)} → ${settingValue(k, c.to)}`]
          : [];
      });
      return changed.length ? changed.join(', ') : 'No setting changed';
    }
    case 'tenant.delete': {
      const parts = [
        [list(d, 'api_keys_revoked').length, 'API key', 'revoked'],
        [list(d, 'provider_keys_destroyed').length, 'provider key', 'destroyed'],
        [list(d, 'routes_removed').length, 'route', 'removed'],
        [list(d, 'datasources_deleted').length, 'datasource', 'deleted'],
        [list(d, 'nodes_deleted').length, 'node', 'deleted'],
      ] as const;
      const done = parts
        .filter(([n]) => n > 0)
        .map(([n, what, verb]) => `${plural(n, what)} ${verb}`);
      return done.length ? done.join(', ') : 'Nothing else to remove';
    }
    case 'api_key.create':
      return `Minted ${keyLabel(d)}`;
    case 'api_key.revoke':
      return `Revoked ${keyLabel(d)}`;
    case 'provider_key.create':
    case 'provider.create': {
      const last4 = str(d, 'last4');
      return [
        providerLabel(str(d, 'kind')),
        str(d, 'base_url'),
        tierLabel(str(d, 'trust_tier')),
        last4 ? `key ending ${last4}` : undefined,
        d.has_api_key === true ? 'with an API key' : undefined,
      ]
        .filter(Boolean)
        .join(', ');
    }
    case 'model.create': {
      const upstream = str(d, 'upstream_model');
      const provider = str(d, 'provider');
      return [upstream, provider && `on ${provider}`].filter(Boolean).join(' ');
    }
    case 'routes.set': {
      const routes = list(d, 'routes').flatMap((r) => {
        if (!r || typeof r !== 'object') return [];
        const { intent, models } = r as { intent?: unknown; models?: unknown };
        const to = Array.isArray(models) ? models.join(', ') : '';
        return [`${fmt(intent)} → ${to}`];
      });
      return routes.length
        ? `${plural(routes.length, 'route')}: ${routes.join('; ')}`
        : 'No routes';
    }
    case 'datasource.create':
    case 'datasource.delete':
      return [datasourceLabel(str(d, 'kind')), quoted(str(d, 'name'))].filter(Boolean).join(' ');
    case 'datasource.status':
    case 'ontology.review': {
      const status = str(d, 'status');
      return status ? `Status ${status}` : '';
    }
    case 'node.create':
    case 'node.delete': {
      const version = num(d, 'version');
      return [quoted(str(d, 'name')), version != null ? `v${version}` : undefined]
        .filter(Boolean)
        .join(' ');
    }
    case 'ontology.propose':
      return `${plural(list(d, 'elements').length, 'element')} proposed`;
    case 'store.seed':
      return `Seeded from ${str(d, 'source') ?? 'config'}: ${plural(num(d, 'tenants') ?? 0, 'tenant')}, ${plural(num(d, 'models') ?? 0, 'model')}, ${plural(num(d, 'providers') ?? 0, 'provider')}`;
    default:
      return genericSummary(d);
  }
}

export type ChainLink = 'linked' | 'broken' | 'unchecked';

/**
 * Checks, for each row, that `prev_hash` is the `hash` of the row before it
 * (by `seq`) and that no row is missing in between. This only compares
 * strings already in the response: recomputing the SHA-256 needs the canonical
 * row encoding and a secure context, so hash correctness stays with the
 * server's `chain_verified`. The oldest row of a window has nothing to compare
 * with and is `unchecked`, unless it is the genesis row (seq 1, no prev_hash).
 */
export function chainLinks(entries: readonly AuditEntry[]): Map<number, ChainLink> {
  const bySeq = new Map(entries.map((e) => [e.seq, e]));
  const oldest = Math.min(...entries.map((e) => e.seq));
  const links = new Map<number, ChainLink>();
  for (const e of entries) {
    if (e.seq === 1) {
      links.set(e.seq, e.prev_hash ? 'broken' : 'linked');
      continue;
    }
    const prev = bySeq.get(e.seq - 1);
    if (prev) links.set(e.seq, e.prev_hash === prev.hash ? 'linked' : 'broken');
    // A gap inside the window means rows were removed.
    else links.set(e.seq, e.seq > oldest ? 'broken' : 'unchecked');
  }
  return links;
}

/** What each audit action means, in plain words (UX-72). The id stays as a tooltip. */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'api_key.create': 'App key created',
  'api_key.revoke': 'App key revoked',
  'api_key.update': 'App key changed',
  'auth.break_glass': 'Signed in with the shared admin token',
  'auth.login': 'Signed in',
  'auth.login_failed': 'Sign-in failed',
  'auth.logout': 'Signed out',
  'datasource.create': 'Data connection added',
  'datasource.delete': 'Data connection deleted',
  'datasource.introspection': 'Data connection scanned',
  'datasource.status': 'Data connection status changed',
  'keys.migrate': 'Encryption keys migrated',
  'keys.rotate': 'Encryption keys rotated',
  'model.create': 'Model added',
  'model.delete': 'Model deleted',
  'node.create': 'Assistant version created',
  'node.delete': 'Assistant version deleted',
  'node.eval.start': 'Tests started',
  'node.eval.finish': 'Tests finished',
  'node.eval.cancel': 'Tests cancelled',
  'node.eval_policy.update': 'Go-live bar changed',
  'node.golden_set.update': 'Test cases changed',
  'node.golden_set.delete': 'Test cases deleted',
  'node.golden_set.capture': 'Saved a conversation as a test',
  'node.publish': 'Version published',
  'node.promote': 'Version made live',
  'node.retire': 'Version retired',
  'node.run.answer': 'Answered a question',
  'node.run.cancel': 'Conversation stopped',
  'node.write.approve': 'Approved an action',
  'node.write.deny': 'Rejected an action',
  'ontology.propose': 'Data dictionary entries suggested',
  'ontology.review': 'Data dictionary reviewed',
  'provider.create': 'Model server added',
  'provider.delete': 'Model server deleted',
  'provider_key.create': 'Provider account added',
  'provider_key.delete': 'Provider account deleted',
  'rag.collection.create': 'Document library created',
  'rag.collection.delete': 'Document library deleted',
  'rag.document.ingest': 'Document added',
  'rag.document.delete': 'Document deleted',
  'rag.document.release': 'Held document allowed',
  'role_binding.create': 'Role granted',
  'role_binding.delete': 'Role revoked',
  'routes.set': 'Model routing changed',
  'store.seed': 'Initial setup loaded',
  'tenant.create': 'Workspace created',
  'tenant.update': 'Workspace settings changed',
  'tenant.delete': 'Workspace deleted',
  'tenant.intent.set': 'Topic changed',
  'tenant.intent.delete': 'Topic removed',
  'tool.approve': 'Action approved for assistants',
  'tool.revoke': 'Action approval revoked',
  'tool.discover': 'Checked a system for tools',
  'tool_server.create': 'Connected system added',
  'tool_server.update': 'Connected system changed',
  'tool_server.delete': 'Connected system deleted',
  'user.create': 'Person added',
  'user.sessions_revoke': 'Sessions ended',
};

/** The plain name of an action, or the id itself for one this console does not know yet. */
export function actionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action;
}

/**
 * Who acted, for people. `break_glass` is the shared admin token: name it so
 * an auditor knows no one person is identified (UX-07). Eval actors are tests.
 */
export function actorLabel(actor: string): string {
  if (actor === 'break_glass') return 'Shared admin token (emergency access)';
  if (actor.startsWith('eval:')) return 'A test run';
  return actor;
}
