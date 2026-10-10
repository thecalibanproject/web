const intFmt = new Intl.NumberFormat('en-US');
const compactFmt = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const pctFmt = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

export function formatInt(n: number | null | undefined): string {
  return n == null ? '—' : intFmt.format(n);
}

export function formatCompact(n: number | null | undefined): string {
  return n == null ? '—' : compactFmt.format(n);
}

export function formatPercent(ratio: number | null | undefined): string {
  return ratio == null || !Number.isFinite(ratio) ? '—' : pctFmt.format(ratio);
}

/** Fraction digits `formatUsd` shows: 4 for sub-cent amounts, otherwise 2. */
function usdDigits(n: number): number {
  const abs = Math.abs(n);
  return abs > 0 && abs < 0.01 ? 4 : 2;
}

/**
 * `n` rounded to the precision `formatUsd` shows, with anything that rounds to
 * zero (negative zero included) returned as +0. The control plane sends -0.0
 * for a sum over no priced events, and float noise in a difference such as
 * billed minus cost can land a hair below zero; neither should read as a
 * negative amount.
 */
export function roundUsd(n: number): number {
  const rounded = Number(n.toFixed(usdDigits(n)));
  return rounded === 0 ? 0 : rounded;
}

/** True when `formatUsd(n)` shows a negative amount (not for -0 or sub-display noise). */
export function isNegativeUsd(n: number | null | undefined): boolean {
  return n != null && Number.isFinite(n) && roundUsd(n) < 0;
}

/**
 * USD with more precision for small per-request amounts. A value that rounds
 * to zero at the shown precision is "$0.00", never "-$0.00" or "$0.0000".
 */
export function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const value = roundUsd(n);
  const digits = usdDigits(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Price per million tokens, e.g. "$2.50 / Mtok". */
export function formatPricePerMtok(n: number | null | undefined): string {
  return n == null ? '—' : `${formatUsd(n)}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export function formatMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${intFmt.format(ms)} ms`;
}
