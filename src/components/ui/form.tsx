import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

const control =
  'w-full rounded-md border border-border-strong bg-surface px-2.5 text-[13px] text-fg ' +
  'placeholder:text-fg-subtle transition-colors hover:border-fg-subtle ' +
  'focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, 'h-8', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'min-h-20 py-2 leading-snug', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, 'h-8 pr-7', className)} {...rest}>
      {children}
    </select>
  );
}

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  /** Render prop gets the ids to wire label/description to the control. */
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Label + control + hint/error with correct id wiring for screen readers. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[12.5px] font-medium text-fg">
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="text-[12px] text-fg-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="text-[12px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Checkbox with its label (and optional hint) wired for screen readers. */
export function Checkbox({
  label,
  hint,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <label htmlFor={id} className="inline-flex items-center gap-2 text-[13px] text-fg">
        <input
          id={id}
          type="checkbox"
          aria-describedby={hintId}
          className="size-3.5 shrink-0 accent-accent disabled:cursor-not-allowed"
          {...rest}
        />
        {label}
      </label>
      {hint && (
        <p id={hintId} className="pl-5.5 text-[12px] text-fg-subtle">
          {hint}
        </p>
      )}
    </div>
  );
}
