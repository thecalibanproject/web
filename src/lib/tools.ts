import type { ToolAuthMethod, ToolFindingKind, ToolImport, ToolManifest } from '@/api/types';

export const TOOL_AUTH_LABEL: Record<ToolAuthMethod, string> = {
  caliban_token: 'Caliban token',
  api_key: 'API key',
  oauth_client_credentials: 'OAuth client credentials',
  none: 'None',
};

export const TOOL_AUTH_HINT: Record<ToolAuthMethod, string> = {
  caliban_token:
    "Recommended. Caliban mints a token for each call, scoped to the one tool and valid for 60 seconds. The server verifies it against Caliban's JWKS (/.well-known/caliban-tool-jwks.json). Client tokens are never passed through.",
  api_key: 'Caliban sends the key the server issued, in the header you name.',
  oauth_client_credentials:
    "Caliban gets an access token from the server's authorization server with the client credentials grant, and caches it until shortly before it expires.",
  none: 'Caliban sends nothing. Only for a server on a private network that needs no authentication.',
};

/** Methods that need a secret: the API key, or the OAuth client secret. */
export const NEEDS_CREDENTIAL: Record<ToolAuthMethod, string | null> = {
  caliban_token: null,
  api_key: 'API key',
  oauth_client_credentials: 'Client secret',
  none: null,
};

export const FINDING_LABEL: Record<ToolFindingKind, string> = {
  instruction: 'Instructions to the model',
  hidden_unicode: 'Hidden characters',
  url: 'Links',
  exfiltration: 'Data exfiltration',
};

export const FINDING_HINT: Record<ToolFindingKind, string> = {
  instruction:
    'Text addressed to the model rather than describing the tool, such as "ignore previous instructions", "do not tell the user" or role markers.',
  hidden_unicode:
    'Zero-width, bidirectional-control or Unicode tag characters, which hide text from the person approving the tool. They are shown below as ⟦U+…⟧.',
  url: 'Links, www. hosts or e-mail addresses.',
  exfiltration: 'Requests for secrets (keys, passwords, ~/.ssh, .env) or to send data somewhere.',
};

/** What node specs pin: `mcp://server/tool#sha256:<hex>`. */
export function toolRef(server: string, tool: string, pin: string): string {
  return `mcp://${server}/${tool}#${pin}`;
}

// Zero-width, bidirectional controls, word joiners, the BOM and Unicode tags.
const HIDDEN =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]/gu;

/** Shows the characters the injection scan calls hidden as ⟦U+XXXX⟧, so a reviewer sees them. */
export function revealHidden(text: string): string {
  return text.replace(
    HIDDEN,
    (c) => `⟦U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}⟧`,
  );
}

export interface ManifestRow {
  manifest: ToolManifest;
  /** An approved manifest the server no longer lists (a newer one exists): runs refuse it. */
  superseded: boolean;
  /** The server changed a tool that was approved: this manifest needs its own approval. */
  reapproval: boolean;
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

/**
 * Every manifest of a server, grouped by tool (newest first within a tool).
 * A tool whose newest manifest is not approved while an older one is has
 * changed since it was approved (a rug pull, or an honest update): at run
 * time the call is refused until the new manifest is approved.
 */
export function manifestRows(manifests: readonly ToolManifest[]): ManifestRow[] {
  const byTool = new Map<string, ToolManifest[]>();
  for (const m of manifests) {
    const name = m.name ?? '';
    byTool.set(name, [...(byTool.get(name) ?? []), m]);
  }
  const rows: ManifestRow[] = [];
  for (const name of [...byTool.keys()].sort()) {
    const ms = [...byTool.get(name)!].sort((a, b) => time(b.discovered_at) - time(a.discovered_at));
    const newest = ms[0]!;
    const changed = newest.status !== 'approved' && ms.some((m) => m.status === 'approved');
    for (const m of ms) {
      rows.push({
        manifest: m,
        // The server lists the newest manifest now: calls pinned to an older one are refused.
        superseded: m !== newest && m.status === 'approved',
        reapproval: changed && m === newest,
      });
    }
  }
  return rows;
}

type Parsed = { ok: true; body: ToolImport } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** `{"manifests": [...]}` or a bare array, each with a name, a description and an input schema. */
export function parseManifests(text: string): Parsed {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const list = Array.isArray(v) ? v : isObject(v) ? v.manifests : undefined;
  if (!Array.isArray(list) || list.length === 0) {
    return { ok: false, error: 'Expected {"manifests": [...]} with at least one manifest.' };
  }
  for (const [i, m] of list.entries()) {
    if (!isObject(m) || typeof m.name !== 'string' || !m.name) {
      return { ok: false, error: `Manifest ${i + 1}: "name" must be a non-empty string.` };
    }
    if (typeof m.description !== 'string') {
      return { ok: false, error: `Manifest ${i + 1} (${m.name}): "description" must be a string.` };
    }
    if (!isObject(m.input_schema)) {
      return {
        ok: false,
        error: `Manifest ${i + 1} (${m.name}): "input_schema" must be an object.`,
      };
    }
  }
  return { ok: true, body: { manifests: list as ToolImport['manifests'] } };
}
