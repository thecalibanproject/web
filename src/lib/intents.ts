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

/** The route a topic sends to an assistant (its live version). */
export function nodeRouteFor(name: string): string {
  return `node/${name}`;
}

/**
 * The workspace's node routes with one topic sent to `assistant` (or, with
 * null, back to a model): the whole map, as the API replaces it, or null
 * when nothing is left.
 */
export function withNodeRoute(
  routes: Readonly<Record<string, string>> | null | undefined,
  topic: string,
  assistant: string | null,
): Record<string, string> | null {
  const next: Record<string, string> = { ...(routes ?? {}) };
  if (assistant) next[topic] = nodeRouteFor(assistant);
  else delete next[topic];
  return Object.keys(next).length > 0 ? next : null;
}

/** The route of messages no topic route covers. */
export const DEFAULT_ROUTE = 'default';

/** The routes with the default route's first model set to `model` (its fallbacks kept). */
export function withDefaultModel(
  routes: ReadonlyArray<{ intent: string; models: string[] }>,
  model: string,
): Array<{ intent: string; models: string[] }> {
  const current = routes.find((r) => r.intent === DEFAULT_ROUTE);
  const models = [model, ...(current?.models ?? []).filter((m) => m !== model)];
  return current
    ? routes.map((r) => (r.intent === DEFAULT_ROUTE ? { intent: r.intent, models } : r))
    : [{ intent: DEFAULT_ROUTE, models }, ...routes];
}
