import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconChevronRight } from '../ui/icons';

/**
 * The second (and last) disclosure level of a form or card: expert settings
 * with safe defaults (research note 10, section 2; Carbon disclosures). Never
 * put an Advanced section inside another one, and never hide what the task
 * needs. `summary` says what the defaults are, so closed is still informative.
 */
export function Advanced({
  children,
  summary,
  title = 'Advanced',
  defaultOpen = false,
  className,
}: {
  children: ReactNode;
  /** One line about the defaults, shown next to the title. */
  summary?: ReactNode;
  title?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details
      className={cn('group rounded-md border border-border bg-surface-2/40', className)}
      open={defaultOpen || undefined}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[12.5px] font-medium text-fg select-none [&::-webkit-details-marker]:hidden">
        <IconChevronRight
          size={14}
          className="shrink-0 text-fg-muted transition-transform duration-(--duration-fast) group-open:rotate-90"
        />
        <span>{title}</span>
        {summary && <span className="font-normal text-fg-muted">{summary}</span>}
      </summary>
      <div className="flex flex-col gap-4 border-t border-border px-3 py-3">{children}</div>
    </details>
  );
}
