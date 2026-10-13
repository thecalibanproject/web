/**
 * The assistant form: the fields a domain owner edits, read from and written
 * onto the full spec object (research note 10, section 4). The form never
 * drops what it does not show: `applyForm` changes only its own fields, and
 * `unsupportedParts` names the rest so the form can say "only the JSON view
 * can edit these".
 */
type Spec = Record<string, unknown>;

export const RAG_SEARCH = 'builtin://rag_search';
export const DATA_LOOKUP = 'builtin://datasource_query';
export const AUTO_MODEL = 'caliban/auto';

export type PiiChoice = '' | 'reversible' | 'mask' | 'off';
export type AnswerChoice = '' | 'redact' | 'refuse' | 'off';

export interface SpecForm {
  description: string;
  instructions: string;
  model: string;
  searchDocuments: boolean;
  lookUpData: boolean;
  /** Every data access name (`rag.<library>:read`, `<source>.<object>:read`). */
  scopes: string[];
  pii: PiiChoice;
  answer: AnswerChoice;
  /** Budgets as typed: numbers are parsed on the way into the spec. */
  steps: string;
  tokens: string;
  wallClock: string;
  usd: string;
  depth: string;
  fanout: string;
}

const obj = (v: unknown): Spec =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Spec) : {};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const numText = (v: unknown): string =>
  typeof v === 'number' || typeof v === 'string' ? String(v) : '';
const tools = (spec: Spec): Spec[] =>
  Array.isArray(spec.tools) ? (spec.tools as unknown[]).map(obj) : [];

export function specToForm(spec: Spec): SpecForm {
  const prompt = obj(spec.prompt);
  const mp = obj(spec.model_policy);
  const ds = obj(spec.datasources);
  const g = obj(spec.guardrails);
  const b = obj(spec.budgets);
  const refs = tools(spec).map((t) => t.ref);
  const pii = str(g.pii);
  const answer = str(g.answer);
  return {
    description: str(spec.description),
    instructions: str(prompt.system),
    model: str(mp.model),
    searchDocuments: refs.includes(RAG_SEARCH),
    lookUpData: refs.includes(DATA_LOOKUP),
    scopes: Array.isArray(ds.scopes) ? (ds.scopes as unknown[]).map(String) : [],
    pii: (['reversible', 'mask', 'off'].includes(pii) ? pii : '') as PiiChoice,
    answer: (['redact', 'refuse', 'off'].includes(answer) ? answer : '') as AnswerChoice,
    steps: numText(b.steps),
    tokens: numText(b.tokens),
    wallClock: numText(b.wall_clock_s),
    usd: numText(b.usd),
    depth: numText(b.depth),
    fanout: numText(b.fanout),
  };
}

/**
 * A typed number: a number when it parses, else the text as it is, so the
 * schema check says what is wrong rather than the value silently vanishing.
 */
function num(text: string, integer: boolean): number | string | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n))) return t;
  return n;
}

function setOrDelete(o: Spec, key: string, v: unknown) {
  if (v === undefined || v === '') delete o[key];
  else o[key] = v;
}

/** The spec with the form's fields applied; everything else is kept as it was. */
export function applyForm(spec: Spec, form: SpecForm): Spec {
  const out: Spec = structuredClone(spec);
  setOrDelete(out, 'description', form.description);

  out.prompt = { ...obj(out.prompt), system: form.instructions };

  const mp = { ...obj(out.model_policy) };
  setOrDelete(mp, 'model', form.model.trim());
  if (Object.keys(mp).length) out.model_policy = mp;
  else delete out.model_policy;

  // Built-in tools follow the checkboxes; existing entries (with their
  // settings) are kept, and every other tool is left alone.
  const current = tools(out);
  const keep = current.filter((t) => t.ref !== RAG_SEARCH && t.ref !== DATA_LOOKUP);
  const builtin = (ref: string, on: boolean) =>
    on ? [current.find((t) => t.ref === ref) ?? { ref, effect: 'read' }] : [];
  const nextTools = [
    ...builtin(DATA_LOOKUP, form.lookUpData),
    ...builtin(RAG_SEARCH, form.searchDocuments),
    ...keep,
  ];
  if (nextTools.length) out.tools = nextTools;
  else delete out.tools;

  const ds = { ...obj(out.datasources) };
  const scopes = [...new Set(form.scopes.map((s) => s.trim()).filter(Boolean))];
  if (scopes.length) ds.scopes = scopes;
  else delete ds.scopes;
  if (Object.keys(ds).length) out.datasources = ds;
  else delete out.datasources;

  const g = { ...obj(out.guardrails) };
  setOrDelete(g, 'pii', form.pii);
  setOrDelete(g, 'answer', form.answer);
  if (Object.keys(g).length) out.guardrails = g;
  else delete out.guardrails;

  const b = { ...obj(out.budgets) };
  setOrDelete(b, 'steps', num(form.steps, true));
  setOrDelete(b, 'tokens', num(form.tokens, true));
  setOrDelete(b, 'wall_clock_s', num(form.wallClock, true));
  setOrDelete(b, 'usd', num(form.usd, false));
  setOrDelete(b, 'depth', num(form.depth, true));
  setOrDelete(b, 'fanout', num(form.fanout, true));
  out.budgets = b;
  return out;
}

const KNOWN_TOP = new Set([
  'kind',
  'description',
  'prompt',
  'model_policy',
  'tools',
  'datasources',
  'guardrails',
  'budgets',
  'exposure',
]);

/** What the spec holds that the form cannot show, in plain words. */
export function unsupportedParts(spec: Spec): string[] {
  const parts: string[] = [];
  if (spec.kind === 'workflow' || spec.graph !== undefined) parts.push('a step-by-step flow');
  const ts = tools(spec);
  if (ts.some((t) => str(t.ref).startsWith('mcp://'))) parts.push('actions in connected systems');
  if (ts.some((t) => str(t.ref).startsWith('node://'))) parts.push('sub-assistants it calls');
  if (ts.some((t) => t.requires !== undefined || t.allow_tainted !== undefined))
    parts.push('tool permissions');
  const prompt = obj(spec.prompt);
  if (prompt.input_schema !== undefined) parts.push('the input format');
  if (prompt.output_schema !== undefined) parts.push('the answer format');
  if (Object.keys(prompt).some((k) => !['system', 'input_schema', 'output_schema'].includes(k)))
    parts.push('other prompt settings');
  if (Object.keys(obj(spec.model_policy)).some((k) => k !== 'model'))
    parts.push('model choice rules');
  if (spec.memory !== undefined) parts.push('memory');
  if (spec.agent !== undefined) parts.push('the limit on tool rounds');
  if (spec.guards !== undefined) parts.push('loop and retry guards');
  if (spec.eval !== undefined) parts.push('test settings');
  const exposure = obj(spec.exposure);
  if (Object.entries(exposure).some(([k, v]) => !(k === 'http' && v === true)))
    parts.push('how apps can reach it');
  const g = obj(spec.guardrails);
  if (Object.keys(g).some((k) => k !== 'pii' && k !== 'answer'))
    parts.push('other safety settings');
  const b = obj(spec.budgets);
  if (
    Object.keys(b).some(
      (k) => !['steps', 'tokens', 'wall_clock_s', 'usd', 'depth', 'fanout'].includes(k),
    )
  )
    parts.push('other limits');
  const ds = obj(spec.datasources);
  if (Object.keys(ds).some((k) => k !== 'scopes')) parts.push('other data settings');
  if (
    Object.keys(spec).some(
      (k) => !KNOWN_TOP.has(k) && !['graph', 'memory', 'agent', 'guards', 'eval'].includes(k),
    )
  )
    parts.push('other settings');
  return parts;
}

/** Data access names of a document library. */
export const libraryScope = (name: string) => `rag.${name}:read`;
