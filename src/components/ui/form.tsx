import { useId, type ComponentProps, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const control =
  'w-full rounded-md border border-border-strong bg-surface px-2.5 text-[13px] text-fg ' +
  'placeholder:text-fg-subtle transition-colors hover:border-fg-subtle ' +
  'focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger';

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cn(control, 'h-8', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
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
}: Omit<ComponentProps<'input'>, 'type'> & { label: ReactNode; hint?: ReactNode }) {
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

/**
 * On/off switch (`role="switch"`). Render it inside `Field` and pass the `id`
 * so the field label names it. The visible state text is for sighted users;
 * assistive tech reads `aria-checked`.
 */
export function Switch({
  id,
  checked,
  onChange,
  disabled,
  onLabel = 'On',
  offLabel = 'Off',
  'aria-describedby': describedBy,
}: {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  onLabel?: string;
  offLabel?: string;
  'aria-describedby'?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          'disabled:cursor-not-allowed disabled:opacity-60',
          checked ? 'border-transparent bg-accent' : 'border-border-strong bg-surface-3',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block size-3.5 rounded-full bg-surface shadow-sm transition-transform',
            checked ? 'translate-x-4.5' : 'translate-x-0.5',
          )}
        />
      </button>
      <span aria-hidden="true" className="text-[13px] text-fg">
        {checked ? onLabel : offLabel}
      </span>
    </span>
  );
}
