import { cn } from '@/lib/cn';

export function CodeBlock({
  code,
  label,
  className,
}: {
  code: string;
  label?: string;
  className?: string;
}) {
  return (
    // Focusable so keyboard users can scroll long JSON horizontally (WCAG 2.1.1).
    <pre
      aria-label={label}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      className={cn(
        'overflow-x-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-fg',
        className,
      )}
    >
      <code>{code}</code>
    </pre>
  );
}
