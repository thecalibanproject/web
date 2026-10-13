import blank from '@/templates/blank.json';
import questionsOnDocuments from '@/templates/questions-on-documents.json';
import routerToSpecialists from '@/templates/router-to-specialists.json';
import supportDesk from '@/templates/support-desk.json';
import triageAndBooking from '@/templates/triage-and-booking.json';

/**
 * Assistant templates, bundled with the console (no network), taken from the
 * four demo scenarios with customer data turned into fill-in fields. Their
 * `{{key}}` placeholders name fields; other `{{...}}` (such as
 * `{{input.message}}`) are run-time references of the spec and stay as they are.
 */
export type TemplateFieldKind = 'text' | 'scopes' | 'library' | 'assistant';

export interface TemplateField {
  key: string;
  label: string;
  kind: TemplateFieldKind;
  default: string;
  hint?: string;
}

export interface AssistantTemplate {
  id: string;
  title: string;
  description: string;
  /** The demo it comes from; empty for the blank one. */
  source: string;
  fields: TemplateField[];
  spec: Record<string, unknown>;
  /** Example test cases to start the version's test set from. */
  tests?: unknown[];
}

export const TEMPLATES: readonly AssistantTemplate[] = [
  triageAndBooking,
  questionsOnDocuments,
  supportDesk,
  routerToSpecialists,
  blank,
] as unknown as AssistantTemplate[];

export const BLANK_TEMPLATE = TEMPLATES[TEMPLATES.length - 1]!;

export type TemplateValues = Record<string, string>;

export function defaultValues(t: AssistantTemplate): TemplateValues {
  return Object.fromEntries(t.fields.map((f) => [f.key, f.default]));
}

/** "a, b , ,c" as a list. */
function splitList(v: string): string[] {
  return v
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The template's spec with its fields filled in. Replacement happens inside
 * string values only, so a value can never break the JSON. A list field that
 * is the whole of an array item expands into one item per value; an array item
 * left empty is dropped (an unused optional tool, for example).
 */
export function fillTemplate(
  t: AssistantTemplate,
  values: TemplateValues,
): Record<string, unknown> {
  const kinds = new Map(t.fields.map((f) => [f.key, f.kind]));
  const value = (key: string) => (values[key] ?? '').trim();
  const fillString = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (m, key: string) => (kinds.has(key) ? value(key) : m));
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return fillString(v);
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      for (const item of v) {
        const whole = typeof item === 'string' ? /^\{\{(\w+)\}\}$/.exec(item) : null;
        if (whole && kinds.get(whole[1]!) === 'scopes') {
          out.push(...splitList(value(whole[1]!)));
          continue;
        }
        const filled = walk(item);
        if (filled === '') continue;
        if (isEmptyTool(filled)) continue;
        out.push(filled);
      }
      return out;
    }
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(t.spec) as Record<string, unknown>;
}

/** A tool entry whose reference was left blank. */
function isEmptyTool(v: unknown): boolean {
  if (!v || typeof v !== 'object' || !('ref' in v)) return false;
  const { ref } = v;
  return typeof ref === 'string' && /^(mcp|node):\/\/$|^$/.test(ref);
}

/** The fields still empty, by label, for the "fill these in" hint. */
export function missingFields(t: AssistantTemplate, values: TemplateValues): string[] {
  return t.fields.filter((f) => !(values[f.key] ?? '').trim()).map((f) => f.label);
}
