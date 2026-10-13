import type { ConsoleRun } from '@/api/types';

/**
 * Plain readings of a call waiting for approval: which action on which
 * system, why it needs a person, and its arguments as a readable list, each
 * checked against what the conversation holds (research note 10, section 6;
 * audit UX-58, UX-59).
 */

export interface ToolName {
  /** The action, e.g. `issue_refund`. */
  tool: string;
  /** The connected system, e.g. `bank-ops`; null for built-in or unknown references. */
  system: string | null;
  /** The pin (`sha256:...`), shown to experts only. */
  pin: string | null;
}

/** `mcp://bank-ops/issue_refund#sha256:2031...` read as action, system and pin. */
export function parseToolRef(ref: string | null | undefined): ToolName {
  if (!ref) return { tool: 'an action', system: null, pin: null };
  const [path, pin] = ref.split('#', 2) as [string, string | undefined];
  const m = /^([a-z]+):\/\/([^/]+)(?:\/(.+))?$/.exec(path);
  if (!m) return { tool: path, system: null, pin: pin ?? null };
  const [, scheme, host, rest] = m;
  if (scheme === 'mcp' && rest) return { tool: rest, system: host!, pin: pin ?? null };
  if (scheme === 'node') return { tool: host!, system: null, pin: pin ?? null };
  return { tool: rest ?? host!, system: null, pin: pin ?? null };
}

/** "issue_refund on bank-ops", for headings and button names. */
export function actionName(approval: { tool?: string } | null | undefined): string {
  const t = parseToolRef(approval?.tool);
  return t.system ? `${t.tool} on ${t.system}` : t.tool;
}

export const REJECT_REASONS = [
  'The details do not match the account on file',
  'The request looks suspicious',
  'The customer is not entitled to this',
  'More information is needed first',
  'Other',
] as const;

/** Where untrusted data in the arguments came from, in plain words. */
export function labelSource(label: string): string {
  if (label === 'caller') return "the customer's message";
  if (label === 'retrieved') return 'a document';
  if (label === 'datasource') return 'your database';
  if (label === 'pii') return 'personal data';
  if (label.startsWith('tool:')) return `the result of ${label.slice(5)}`;
  return label;
}

/** One line: why this call waits for a person. */
export function whyApproval(effect: string | null | undefined, labels: readonly string[]): string {
  const what =
    effect === 'write'
      ? 'It changes something in another system'
      : effect
        ? 'It sends data out of Caliban'
        : 'It acts on another system';
  const sources = labels.filter((l) => l !== 'pii').map(labelSource);
  const personal = labels.includes('pii');
  const from = sources.length
    ? `, and its details came from ${sources.join(' and ')}`
    : ', with details from outside your team';
  return `${what}${from}${personal ? ' (includes personal data)' : ''}.`;
}

/** One argument as a row of the readable list. */
export interface ArgRow {
  /** Path in plain form, e.g. `account / iban`. */
  key: string;
  /** Depth, for indenting nested objects. */
  depth: number;
  /** Displayed value; null for a heading row of a nested object or list. */
  value: string | null;
}

/** Flattens arguments into rows: nested objects indented, never JSON. */
export function argRows(args: unknown, depth = 0, prefix = ''): ArgRow[] {
  if (args === null || args === undefined) return [];
  if (typeof args !== 'object') return [{ key: prefix || 'value', depth, value: scalar(args) }];
  const entries: Array<[string, unknown]> = Array.isArray(args)
    ? args.map((v, i) => [`${i + 1}`, v])
    : Object.entries(args as Record<string, unknown>);
  const rows: ArgRow[] = [];
  for (const [k, v] of entries) {
    if (v !== null && typeof v === 'object') {
      rows.push({ key: k, depth, value: null });
      rows.push(...argRows(v, depth + 1, k));
    } else {
      rows.push({ key: k, depth, value: scalar(v) });
    }
  }
  return rows;
}

function text(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'bigint' ? `${v}` : '';
}

function scalar(v: unknown): string {
  if (v === null || v === undefined) return 'empty';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return text(v);
}

/** Case, spaces and punctuation ignored: `FR76 1273 9000` equals `fr7612739000`. */
export function normalise(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Every scalar in a JSON value, as text. */
function scalars(v: unknown, out: string[] = []): string[] {
  if (v === null || v === undefined) return out;
  if (typeof v === 'object') {
    for (const x of Array.isArray(v) ? v : Object.values(v as Record<string, unknown>)) {
      scalars(x, out);
    }
  } else out.push(typeof v === 'boolean' ? `${v}` : text(v));
  return out;
}

export type Provenance =
  /** `step` is the step id (for links and experts); `name` its step name, shown to people. */
  | { kind: 'on-file'; step: string; name: string }
  | { kind: 'customer-only' }
  | { kind: 'not-found' }
  /** Too short or too common to say anything (a boolean, "1"). */
  | { kind: 'unknown' };

/** Steps whose output is data the business holds (database lookups, reads). */
function isLookup(step: ConsoleRun['steps'][number]): boolean {
  return step.kind === 'tool' || step.labels.includes('datasource');
}

/**
 * Where an argument's value appears in the conversation: in the output of an
 * earlier lookup step (the account on file), only in the customer's message,
 * or nowhere. Values are compared normalised, so an IBAN with or without
 * spaces is the same value; the customer's message is searched as text.
 */
export function provenance(
  value: string,
  run: Pick<ConsoleRun, 'input' | 'steps'>,
  beforeStep?: string,
): Provenance {
  const v = normalise(value);
  if (v.length < 4 || v === 'true' || v === 'false') return { kind: 'unknown' };
  const steps = run.steps;
  const until = beforeStep ? steps.findIndex((s) => s.id === beforeStep) : -1;
  const earlier = until >= 0 ? steps.slice(0, until) : steps;
  for (const s of earlier) {
    if (!isLookup(s) || s.output === undefined) continue;
    if (scalars(s.output).some((x) => normalise(x) === v))
      return { kind: 'on-file', step: s.id, name: s.vertex };
  }
  const message = scalars(run.input).map(normalise).join(' ');
  if (message.includes(v)) return { kind: 'customer-only' };
  return { kind: 'not-found' };
}

export function provenanceText(p: Provenance): string | null {
  switch (p.kind) {
    case 'on-file':
      return `Matches the account on file (from the ${p.name} step)`;
    case 'customer-only':
      return "Only in the customer's message";
    case 'not-found':
      return 'Not found in this conversation';
    default:
      return null;
  }
}
