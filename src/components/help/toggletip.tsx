import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { DocLink } from '@/lib/docs';
import { GLOSSARY, type GlossaryId } from '@/lib/glossary';
import { IconHelp } from '../ui/icons';
import { LearnMore } from './learn-more';

/**
 * A toggletip (Carbon, Pickering's inclusive-components pattern): a "?" button
 * that shows a short explanation on click or Enter, never on hover only, so it
 * works with a keyboard and on touch screens. The text is announced through a
 * live region; Escape or a click elsewhere closes it. It may hold a link.
 */
export function Toggletip({
  label,
  children,
  doc,
  className,
}: {
  /** What the tip is about, for the button's accessible name ("About ..."). */
  label: string;
  children: ReactNode;
  doc?: DocLink;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <span ref={ref} className={cn('relative inline-flex align-middle', className)}>
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className="inline-flex size-6 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg"
      >
        <IconHelp size={14} />
      </button>
      <span id={id} role="status" className="contents">
        {open && (
          <span className="absolute top-full left-1/2 z-40 mt-1 block w-72 -translate-x-1/2 rounded-md border border-border bg-surface p-3 text-left text-[12.5px] leading-snug font-normal text-fg shadow-panel motion-safe:animate-rise-in">
            {children}
            {doc && (
              <span className="mt-2 block">
                <LearnMore doc={doc} />
              </span>
            )}
          </span>
        )}
      </span>
    </span>
  );
}

/** A toggletip that explains a glossary term, with its old names as "also called". */
export function TermTip({ term, className }: { term: GlossaryId; className?: string }) {
  const e = GLOSSARY[term];
  return (
    <Toggletip label={e.label} doc={e.doc} className={className}>
      <span className="block">{e.definition}</span>
      {e.also.length > 0 && (
        <span className="mt-1 block text-fg-muted">Also called: {e.also.join(', ')}.</span>
      )}
    </Toggletip>
  );
}
