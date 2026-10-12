import { ApiError } from '@/api/client';
import type { Node, ProblemDetail } from '@/api/types';

/**
 * Node names (and tool server names): 1 to 64 characters of a-z, 0-9, '-'
 * and '_', starting with a letter or digit. For the `pattern` attribute.
 */
export const NODE_NAME_PATTERN = '[a-z0-9][a-z0-9_\\-]{0,63}';

/** One node of a tenant: its versions summed up for the list. */
export interface NodeSummary {
  tenantId: string;
  name: string;
  /** The live version (the promotion pointer), if any. */
  live: Node | undefined;
  /** The highest version number. */
  latest: Node;
  versions: number;
  /** Last time a version was created, published or retired. */
  updatedAt: string;
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

function lastChange(n: Node): string {
  return [n.created_at, n.published_at, n.retired_at].reduce<string>(
    (a, b) => (b && time(b) > time(a) ? b : a),
    n.created_at,
  );
}

/**
 * Groups the versions `GET /api/v1/nodes` lists into one row per node, most
 * recently changed first.
 */
export function summarizeNodes(versions: readonly Node[]): NodeSummary[] {
  const byNode = new Map<string, Node[]>();
  for (const v of versions) {
    const key = `${v.tenant_id}\u0000${v.name}`;
    byNode.set(key, [...(byNode.get(key) ?? []), v]);
  }
  return [...byNode.values()]
    .map((vs) => {
      const sorted = [...vs].sort((a, b) => a.version - b.version);
      const latest = sorted[sorted.length - 1]!;
      return {
        tenantId: latest.tenant_id,
        name: latest.name,
        live: sorted.find((v) => v.live),
        latest,
        versions: sorted.length,
        updatedAt: sorted.map(lastChange).reduce((a, b) => (time(b) > time(a) ? b : a)),
      };
    })
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt) || a.name.localeCompare(b.name));
}

/** `sha256:` plus the first 12 hex characters, for tables. */
export function shortHash(hash: string): string {
  const [algo, hex] = hash.includes(':') ? hash.split(':', 2) : ['', hash];
  const head = (hex ?? '').slice(0, 12);
  return algo ? `${algo}:${head}` : head;
}

export type ProblemKind =
  'pin' | 'tool' | 'scope' | 'cap' | 'code' | 'reference' | 'gate' | 'golden' | 'spec';

export interface NodeProblem {
  kind: ProblemKind;
  text: string;
}

/** What each kind of problem is called, and what to do about it. */
export const PROBLEM_KIND: Record<ProblemKind, { label: string; hint: string }> = {
  pin: {
    label: 'Unpinned tool',
    hint: 'Pin every MCP tool to an approved manifest: mcp://server/tool#sha256:<pin>. Copy the reference from Tools once the manifest is approved.',
  },
  tool: {
    label: 'Tool not approved',
    hint: 'The tool must be an approved manifest, with exactly this pin, of a server registered for this tenant. Approve it in Tools, or approve the new manifest if the server changed the tool.',
  },
  scope: {
    label: 'Unknown datasource scope',
    hint: 'Scopes are <datasource>.<object>:<read|write>. The datasource must be registered for this tenant, and the object must be * or an approved ontology entity bound to it. rag.<collection>:read must name a document collection of this tenant (Retrieval), and builtin://rag_search needs at least one.',
  },
  cap: {
    label: 'Over the node caps',
    hint: "Lower the budget in the spec, or raise the tenant's node caps (tenant page, Node limits).",
  },
  code: {
    label: 'Not supported yet',
    hint: 'Code vertices arrive with the WASM sandbox. Use llm, tool, router, map, reduce, verify, human or subnode vertices for now.',
  },
  reference: {
    label: 'Node reference',
    hint: 'node://name@vN must name a published version of this tenant, and node references must not form a cycle.',
  },
  gate: {
    label: 'Promotion bar not met',
    hint: "Run the version's evals on the node's Evals tab until its latest evals meet the bar. A version with write tools always needs an injection eval. Someone with nodes.publish can change the bar. A draft is published without making it live, evaluated, then made live.",
  },
  golden: {
    label: 'Golden set',
    hint: "Every case needs a unique id and at least one check, and its input must match the version's prompt.input_schema. At most 200 cases.",
  },
  spec: {
    label: 'Spec',
    hint: 'See docs/nodes.md in core for the spec format.',
  },
};

function kindOf(text: string): ProblemKind {
  if (/`code` vertex type is not yet supported/.test(text)) return 'code';
  if (/must be pinned with #sha256|is malformed \(expected mcp:\/\//.test(text)) return 'pin';
  if (/^tool '[^']*': /.test(text) || /no approved manifest|no tool server named/.test(text)) {
    return 'tool';
  }
  if (/^datasource scope '|datasources?\.scopes/.test(text)) return 'scope';
  if (/exceeds the tenant's node cap|budgets\.usd is required/.test(text)) return 'cap';
  if (/^node:\/\/|node references form a cycle|node reference '/.test(text)) return 'reference';
  return 'spec';
}

// Problems of a publish refusal are joined with "; ", and one of them holds
// "; " itself. A fragment that only continues the previous problem is put back.
const CONTINUATIONS = new Set(['publish it first']);

/**
 * Splits the control plane's refusal of a node version into problems:
 * `cannot publish name@vN: a; b; c` when publishing (every problem), or one
 * static check when a draft is created (`MCP tool '…' must be pinned …`).
 */
export function nodeProblems(
  message: string,
  details: readonly ProblemDetail[] = [],
): { title: string | null; problems: NodeProblem[] } {
  const promote = /^(\S+) cannot be promoted: /.exec(message);
  if (details.length > 0) {
    const publishing = /^cannot publish (\S+): /.exec(message);
    return {
      title: publishing
        ? `Cannot publish ${publishing[1]!}`
        : promote
          ? `Cannot make ${promote[1]!} live`
          : null,
      problems: details.map((d) => ({
        kind:
          d.kind === 'eval_gate' ? 'gate' : d.kind === 'golden_set' ? 'golden' : kindOf(d.message),
        text: d.message,
      })),
    };
  }
  const publish = /^cannot publish (\S+): ([\s\S]*)$/.exec(message);
  const body = publish ? publish[2]! : message;
  const parts: string[] = [];
  for (const piece of publish ? body.split('; ') : [body]) {
    const last = parts.length - 1;
    if (last >= 0 && CONTINUATIONS.has(piece.trim())) parts[last] = `${parts[last]}; ${piece}`;
    else if (piece.trim()) parts.push(piece.trim());
  }
  return {
    title: publish ? `Cannot publish ${publish[1]!}` : null,
    problems: parts.map((text) => ({ kind: kindOf(text), text })),
  };
}

/** A refusal of the spec (422), as opposed to a conflict, a missing key or a network error. */
export function isSpecRefusal(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 422;
}
