/** Limits the control plane puts on a tenant's own `caliban/auto` intents. */
export const MAX_INTENTS = 100;
export const MAX_EXEMPLARS = 200;
export const MAX_EXEMPLAR_CHARS = 2000;

const INTENT_NAME = /^[a-z0-9_.-]{1,64}$/;

/** Why an intent name is refused, or null. `pinned` is reserved by the router. */
export function intentNameError(name: string): string | null {
  if (!INTENT_NAME.test(name)) {
    return 'Use 1 to 64 lowercase letters, digits, dots, hyphens or underscores.';
  }
  return name === 'pinned' ? '"pinned" is reserved.' : null;
}

/** Exemplars typed one per line: trimmed, blank lines and repeats dropped, in order. */
export function parseExemplars(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const e = line.trim();
    if (e && !out.includes(e)) out.push(e);
  }
  return out;
}

/** Why a list of exemplars is refused, or null. An empty list is allowed (it removes an intent). */
export function exemplarsError(exemplars: readonly string[]): string | null {
  if (exemplars.length > MAX_EXEMPLARS) return `At most ${MAX_EXEMPLARS} exemplars per intent.`;
  const long = exemplars.findIndex((e) => [...e].length > MAX_EXEMPLAR_CHARS);
  return long >= 0 ? `Exemplar ${long + 1} is longer than ${MAX_EXEMPLAR_CHARS} characters.` : null;
}

/** The node a route hands to (`node/triage`, `node/triage@v3`, `node/triage@published`). */
export function routeNode(route: string): string | null {
  const [, name] = /^node\/([^@/]+)(?:@.+)?$/.exec(route) ?? [];
  return name ?? null;
}
