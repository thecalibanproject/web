import type { PiiPattern, PiiTerm } from '@/api/types';

/** Labels with built-in surrogates; any other label gets shape-preserving ones. */
export const PII_BUILTIN_LABELS = [
  'PERSON',
  'EMAIL',
  'PHONE',
  'NATIONAL_ID',
  'ORG',
  'LOCATION',
  'IBAN',
  'CARD',
] as const;

export const MAX_PII_PATTERNS = 50;
export const MAX_PII_TERMS = 10_000;
const MAX_PATTERN_CHARS = 500;
const LABEL = /^[A-Za-z0-9_]{1,40}$/;

export function labelError(label: string): string | null {
  return LABEL.test(label) ? null : 'Use 1 to 40 letters, digits or underscores.';
}

/**
 * Why a pattern is refused, or null. The regex itself is checked by the
 * control plane (the Rust regex syntax: no lookaround or backreferences),
 * which the browser's engine cannot stand in for.
 */
export function patternError(p: PiiPattern): string | null {
  const label = labelError(p.label);
  if (label) return `Label: ${label}`;
  if (!p.pattern) return 'Enter a pattern.';
  return p.pattern.length > MAX_PATTERN_CHARS
    ? `A pattern is at most ${MAX_PATTERN_CHARS} characters.`
    : null;
}

/** The dictionary as text: one `LABEL: term` per line. */
export function formatDictionary(terms: readonly PiiTerm[]): string {
  return terms.map((t) => `${t.label}: ${t.term}`).join('\n');
}

export type DictionaryParse = { ok: true; terms: PiiTerm[] } | { ok: false; error: string };

/**
 * Reads `LABEL: term` lines (a label has no colon, so the first one splits).
 * Blank lines are skipped and repeats (same term, ignoring case, and label)
 * dropped: matching is case-insensitive anyway.
 */
export function parseDictionary(text: string): DictionaryParse {
  const terms: PiiTerm[] = [];
  const seen = new Set<string>();
  const lines = text.split('\n');
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) continue;
    const at = line.indexOf(':');
    const label = at < 0 ? '' : line.slice(0, at).trim();
    const term = at < 0 ? '' : line.slice(at + 1).trim();
    if (at < 0 || labelError(label)) {
      return {
        ok: false,
        error: `Line ${i + 1}: write it as LABEL: term, such as ORG: Northwind.`,
      };
    }
    const len = [...term].length;
    if (len < 2 || len > 200) {
      return { ok: false, error: `Line ${i + 1}: a term is 2 to 200 characters.` };
    }
    const key = `${label}\u0000${term.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push({ term, label });
  }
  return terms.length > MAX_PII_TERMS
    ? { ok: false, error: `At most ${MAX_PII_TERMS.toLocaleString('en')} terms.` }
    : { ok: true, terms };
}

/** Whether two lists hold the same entries in the same order. */
export function sameList<T extends object>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x, i) => JSON.stringify(x) === JSON.stringify(b[i]));
}
