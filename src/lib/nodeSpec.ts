import Ajv2020, { type ErrorObject } from 'ajv/dist/2020';
import nodeSchema from '@/schemas/node.schema.json';

/**
 * Client-side validation of a node spec against core/schemas/node.schema.json
 * (vendored into src/schemas by `pnpm sync:schemas`). The control plane
 * validates again on POST; this only gives fast, inline feedback.
 */
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(nodeSchema);

export interface SpecIssue {
  path: string;
  message: string;
}

export type SpecCheck =
  | { ok: true; spec: Record<string, unknown> }
  | { ok: false; parseError: string | null; issues: SpecIssue[] };

function describe(e: ErrorObject): SpecIssue {
  const path = e.instancePath || '/';
  if (e.keyword === 'additionalProperties') {
    const prop = (e.params as { additionalProperty?: string }).additionalProperty;
    return { path, message: `unknown property "${prop ?? '?'}"` };
  }
  if (e.keyword === 'required') {
    const prop = (e.params as { missingProperty?: string }).missingProperty;
    return { path, message: `missing required property "${prop ?? '?'}"` };
  }
  if (e.keyword === 'enum') {
    const allowed = (e.params as { allowedValues?: unknown[] }).allowedValues ?? [];
    return { path, message: `must be one of: ${allowed.map((v) => JSON.stringify(v)).join(', ')}` };
  }
  return { path, message: e.message ?? 'is invalid' };
}

/** Parses JSON text and validates it as a node spec. */
export function checkNodeSpec(text: string): SpecCheck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, parseError: e instanceof Error ? e.message : String(e), issues: [] };
  }
  if (validate(parsed)) return { ok: true, spec: parsed };
  return { ok: false, parseError: null, issues: (validate.errors ?? []).map(describe) };
}

/** A minimal valid agent spec used to pre-fill the editor. */
export const NODE_SPEC_TEMPLATE = {
  kind: 'agent',
  description: 'Triage inbound invoices and extract key fields.',
  prompt: {
    system: 'You are an accounts-payable assistant. Extract vendor, amount and due date.',
    output_schema: {
      type: 'object',
      properties: {
        vendor: { type: 'string' },
        amount: { type: 'number' },
        due_date: { type: 'string' },
      },
      required: ['vendor', 'amount'],
    },
  },
  model_policy: {
    candidates: ['tier:small'],
    escalate_on: ['schema_violation'],
    max_cost_usd: 0.05,
    min_trust_tier: 't1_attested',
  },
  guardrails: { pii: 'reversible', injection_mode: 'plan_then_execute' },
  budgets: { steps: 8, tokens: 20000, wall_clock_s: 60 },
  exposure: { http: true, mcp_tool: true, a2a_agent: false },
};
