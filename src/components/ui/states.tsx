import type { ReactNode } from 'react';
import { errorMessage, isForbidden } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { IconAlert, IconLock, IconRefresh } from './icons';
import { Spinner } from './spinner';

export function LoadingState({ label = 'Loading…', rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="p-4">
      <span className="sr-only">{label}</span>
      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="h-6 animate-pulse rounded bg-surface-3"
            style={{ width: `${92 - ((i * 13) % 30)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function InlineLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-fg-muted">
      <Spinner size={14} /> {label}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-1.5 px-6 py-10 text-center', className)}>
      <p className="text-[13.5px] font-medium text-fg">{title}</p>
      {description && <p className="max-w-md text-[12.5px] text-fg-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  title = 'Something went wrong',
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
}) {
  if (isForbidden(error)) return <ForbiddenState error={error} className={className} />;
  return (
    <div
      role="alert"
      className={cn(
        'm-4 flex items-start gap-3 rounded-md border border-danger/40 bg-danger-soft p-3',
        className,
      )}
    >
      <IconAlert className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-fg">{title}</p>
        <p className="mt-0.5 text-[12.5px] break-words text-fg-muted">{errorMessage(error)}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" icon={<IconRefresh size={14} />} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/**
 * A 403: the signed-in user's roles do not allow this. Not an error to retry,
 * so it is calm and says who can help.
 */
export function ForbiddenState({ error, className }: { error?: unknown; className?: string }) {
  const detail = error instanceof Error ? error.message : null;
  return (
    <div
      role="alert"
      className={cn(
        'm-4 flex items-start gap-3 rounded-md border border-border bg-surface-2 p-3',
        className,
      )}
    >
      <IconLock className="mt-0.5 shrink-0 text-fg-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-fg">Your role does not allow this</p>
        <p className="mt-0.5 text-[12.5px] break-words text-fg-muted">
          Ask an owner or admin of this deployment for access.
          {detail && <span className="text-fg-subtle"> The control plane said: {detail}.</span>}
        </p>
      </div>
    </div>
  );
}

/** Inline alert for form-level mutation errors. */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
      {errorMessage(error)}
    </p>
  );
}
