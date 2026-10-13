import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { docsHref, type DocLink } from '@/lib/docs';
import { IconExternal } from '../ui/icons';

/**
 * "Learn more" link into the bundled docs. Opens in a new tab so a half-filled
 * form is not lost; the docs are served by the same installation.
 */
export function LearnMore({
  doc,
  children = 'Learn more',
  className,
}: {
  doc: DocLink;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={docsHref(doc)}
      target="_blank"
      rel="noopener"
      className={cn(
        'inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline',
        className,
      )}
    >
      {children}
      <IconExternal size={12} />
      <span className="sr-only"> (opens the docs in a new tab)</span>
    </a>
  );
}
