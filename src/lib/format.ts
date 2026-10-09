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

/** USD with more precision for small per-request amounts. */
export function formatUsd(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const digits = abs === 0 ? 2 : abs < 0.01 ? 4 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
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
