import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// A JSON string (a key when followed by a colon), a literal, or a number.
const JSON_TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/** Colours keys, strings, numbers and literals of pretty-printed JSON. */
function highlightJson(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of code.matchAll(JSON_TOKEN)) {
    const at = m.index;
    if (at > last) out.push(code.slice(last, at));
    const [whole, str, colon, literal, num] = m;
    const tone =
      str !== undefined
        ? colon !== undefined
          ? 'text-accent'
          : 'text-fg'
        : literal !== undefined
          ? 'text-fg-muted'
          : 'text-info';
    const token = str ?? literal ?? num ?? whole;
    out.push(
      <span key={at} className={tone}>
        {token}
      </span>,
    );
    if (colon !== undefined) out.push(colon);
    last = at + whole.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export function CodeBlock({
  code,
  label,
  className,
  language,
}: {
  code: string;
  label?: string;
  className?: string;
  /** `json` colours keys, strings, numbers and literals. */
  language?: 'json';
}) {
  return (
    // Focusable so keyboard users can scroll long JSON horizontally (WCAG 2.1.1).
    <pre
      aria-label={label}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      className={cn(
        'scope-code overflow-x-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-fg',
        className,
      )}
    >
      <code>{language === 'json' ? highlightJson(code) : code}</code>
    </pre>
  );
}
