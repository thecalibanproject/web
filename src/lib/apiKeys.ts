import type { ApiKeyCreate, ApiKeyInfo } from '@/api/types';

/**
 * Which nodes a key may run and which datasource scopes its runs may read.
 * The same shape serves creation now and editing once the control plane can
 * change a key's access.
 */
export interface KeyAccess {
  /** `all`: every published node (no allowlist); `none`: `[]`; `only`: the names. */
  nodes: 'all' | 'none' | 'only';
  names: string[];
  /** Empty: every scope of the nodes the key runs. */
  scopes: string[];
}

export const DEFAULT_KEY_ACCESS: KeyAccess = { nodes: 'all', names: [], scopes: [] };

/** A key's access as stored (for editing it later). */
export function accessOf(key: Pick<ApiKeyInfo, 'nodes' | 'datasource_scopes'>): KeyAccess {
  const nodes = key.nodes == null ? 'all' : key.nodes.length === 0 ? 'none' : 'only';
  return { nodes, names: key.nodes ?? [], scopes: key.datasource_scopes ?? [] };
}

/** A datasource scope a key may carry: `<datasource>.<object>:read`. */
const KEY_SCOPE = /^[^\s.:]+\.[^\s:]+:read$/;

/** Splits a comma- or newline-separated list, dropping blanks and repeats. */
export function splitList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

/** Why the access cannot be saved, or null. */
export function accessError(access: KeyAccess): string | null {
  if (access.nodes === 'only' && access.names.length === 0) {
    return 'Pick at least one node, or choose every published node or no nodes.';
  }
  const bad = access.scopes.filter((s) => !KEY_SCOPE.test(s));
  if (bad.length > 0) {
    return `Scopes are <datasource>.<object>:read, such as shop.orders:read. Not valid: ${bad.join(', ')}.`;
  }
  return null;
}

/**
 * The request fields for `access`. `nodes` is sent only by someone who may
 * grant node access (nodes.run): the control plane refuses it otherwise, and
 * a key created without it runs no nodes.
 */
export function accessBody(
  access: KeyAccess,
  canGrantNodes: boolean,
): Pick<ApiKeyCreate, 'nodes' | 'datasource_scopes'> {
  const body: Pick<ApiKeyCreate, 'nodes' | 'datasource_scopes'> = {};
  if (canGrantNodes && access.nodes !== 'all') {
    body.nodes = access.nodes === 'none' ? [] : access.names;
  }
  if (access.scopes.length > 0) body.datasource_scopes = access.scopes;
  return body;
}

/** One line for a key's access, for summaries. */
export function describeAccess(access: KeyAccess, canGrantNodes: boolean): string {
  const nodes = !canGrantNodes
    ? 'no nodes'
    : access.nodes === 'all'
      ? 'every published node'
      : access.nodes === 'none'
        ? 'no nodes'
        : access.names.join(', ') || 'no node picked yet';
  const scopes = access.scopes.length === 0 ? "the nodes' own scopes" : access.scopes.join(', ');
  return `Runs ${nodes}; datasource scopes: ${scopes}`;
}
