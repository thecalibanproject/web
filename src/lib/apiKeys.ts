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

/**
 * A datasource scope a key may carry: `<datasource>.<object>:read`, or
 * `rag.<collection>:read` for the document collections `rag_search` may search.
 */
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
    return 'Pick at least one assistant, or choose model calls only.';
  }
  const bad = access.scopes.filter((s) => !KEY_SCOPE.test(s));
  if (bad.length > 0) {
    return `Write other data as <connection>.<collection>:read or rag.<library>:read, such as shop.orders:read. Not valid: ${bad.join(', ')}.`;
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

/**
 * The access a new key starts with (UX-28): only the workspace's assistants
 * the user ticks, which starts empty, so the narrowest choice is the default.
 * With no assistant to pick, or no right to grant them, the key makes model
 * calls only.
 */
export function initialKeyAccess(assistants: readonly string[], canGrantNodes: boolean): KeyAccess {
  return {
    nodes: canGrantNodes && assistants.length > 0 ? 'only' : 'none',
    names: [],
    scopes: [],
  };
}

/** One sentence for what a key can reach, before it is created. */
export function describeAccess(access: KeyAccess, canGrantNodes: boolean): string {
  const nodes = !canGrantNodes
    ? 'make model calls only'
    : access.nodes === 'all'
      ? 'run every published assistant, including ones added later'
      : access.nodes === 'none'
        ? 'make model calls only, and run no assistant'
        : access.names.length > 0
          ? `run ${access.names.join(', ')}`
          : 'run the assistants you pick (none yet)';
  const scopes =
    access.scopes.length === 0
      ? "with each assistant's own data access"
      : `reading ${access.scopes.join(', ')}`;
  return `This key can ${nodes}, ${scopes}.`;
}
