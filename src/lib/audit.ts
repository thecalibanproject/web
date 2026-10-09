import type { AuditEntry, DatasourceKind, ProviderKind, TrustTier } from '@/api/types';
import { DATASOURCE_LABEL, PROVIDER_SHORT, TRUST_TIER_LABEL } from './labels';

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
  ['pii_default', 'PII default'],
  ['pii_surrogate_scope', 'surrogate scope'],
  ['semantic_cache', 'semantic cache'],
];

const fmt = (v: unknown): string => {
  if (v == null) return 'unset';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return `${v}`;
  return JSON.stringify(v);
};

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
        return v ? [`${label} ${v}`] : [];
      });
      const name = quoted(str(d, 'name'));
      return [name ? `Created ${name}` : 'Created', settings.join(', ')].filter(Boolean).join(': ');
    }
    case 'tenant.update': {
      const changed = TENANT_FIELDS.flatMap(([k, label]) => {
        const c = change(d, k);
        return c && c.from !== c.to ? [`${label} ${fmt(c.from)} → ${fmt(c.to)}`] : [];
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
