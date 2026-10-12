/**
 * What a node spec says about its answer and its model calls (docs/nodes.md):
 * the answer guard, the PII floor, and per model vertex the reasoning effort
 * and how structured output is asked for. Read from the untyped spec, with
 * the control plane's defaults.
 */

export type AnswerGuardMode = 'redact' | 'refuse' | 'off';
export type Reasoning = 'off' | 'low' | 'medium' | 'high';
export type StructuredOutput = 'json_schema' | 'prompt';

export interface ModelVertex {
  id: string;
  type: string;
  /** The vertex's own `config.reasoning`; undefined: the node's default applies. */
  reasoning: Reasoning | undefined;
  /** How the schema is asked for; undefined when the call has no schema or labels to enforce. */
  structuredOutput: StructuredOutput | undefined;
}

export interface SpecBehavior {
  answerGuard: AnswerGuardMode;
  /** The spec sets `guardrails.answer` (otherwise the default, redact, applies). */
  answerGuardSet: boolean;
  /** `guardrails.pii`: a floor on the PII protection of the node's model calls. */
  piiFloor: string | undefined;
  /** `model_policy.reasoning`: the default effort of the node's model calls. */
  reasoning: Reasoning | undefined;
  vertices: ModelVertex[];
}

const REASONING = ['off', 'low', 'medium', 'high'] as const;
const GUARD = ['redact', 'refuse', 'off'] as const;

function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function oneOf<T extends string>(values: readonly T[], v: unknown): T | undefined {
  return values.find((x) => x === v);
}

function modelVertex(id: string, v: Record<string, unknown>): ModelVertex | null {
  const type = typeof v.type === 'string' ? v.type : '';
  const config = obj(v.config) ?? {};
  const isModel =
    type === 'llm' ||
    type === 'router' ||
    type === 'verify' ||
    (type === 'reduce' && config.mode === 'llm');
  if (!isModel) return null;
  // Routers constrain their label; the others only when they declare an output schema.
  const enforced = type === 'router' || config.output_schema !== undefined;
  return {
    id,
    type: type === 'reduce' ? 'reduce (llm)' : type,
    reasoning: oneOf(REASONING, config.reasoning),
    structuredOutput: enforced
      ? (oneOf(['json_schema', 'prompt'] as const, config.structured_output) ?? 'json_schema')
      : undefined,
  };
}

export function specBehavior(spec: unknown): SpecBehavior {
  const s = obj(spec) ?? {};
  const guardrails = obj(s.guardrails) ?? {};
  const policy = obj(s.model_policy) ?? {};
  const graph = obj(s.graph) ?? {};
  const vertices: ModelVertex[] = [];
  for (const raw of Array.isArray(graph.vertices) ? graph.vertices : []) {
    const v = obj(raw);
    if (!v) continue;
    const id = typeof v.id === 'string' ? v.id : '?';
    const own = modelVertex(id, v);
    if (own) vertices.push(own);
    // A map applies its body vertex to every item.
    const body = v.type === 'map' ? obj(obj(v.config)?.body) : undefined;
    const inner = body && modelVertex(`${id}/body`, body);
    if (inner) vertices.push(inner);
  }
  const answer = oneOf(GUARD, guardrails.answer);
  return {
    answerGuard: answer ?? 'redact',
    answerGuardSet: answer !== undefined,
    piiFloor: typeof guardrails.pii === 'string' ? guardrails.pii : undefined,
    reasoning: oneOf(REASONING, policy.reasoning),
    vertices,
  };
}
