import { useId, type MouseEvent } from 'react';
import { cn } from '@/lib/cn';
import { Button, type ButtonProps } from './button';

/**
 * A button the signed-in user may not be allowed to use. With `deniedReason`
 * it stays visible and focusable but does nothing: `aria-disabled` rather than
 * `disabled`, so the tooltip shows on hover and screen readers read the reason
 * as its description. The control plane checks every request again anyway.
 */
export function GatedButton({
  deniedReason,
  onClick,
  className,
  'aria-describedby': describedBy,
  ...rest
}: ButtonProps & { deniedReason: string | null | undefined }) {
  const reasonId = useId();
  if (!deniedReason) {
    return (
      <Button onClick={onClick} className={className} aria-describedby={describedBy} {...rest} />
    );
  }
  return (
    <>
      <Button
        {...rest}
        type="button"
        aria-disabled="true"
        aria-describedby={[describedBy, reasonId].filter(Boolean).join(' ')}
        title={deniedReason}
        className={cn('cursor-not-allowed opacity-50', className)}
        onClick={(e: MouseEvent<HTMLButtonElement>) => e.preventDefault()}
      />
      <span id={reasonId} hidden>
        {deniedReason}
      </span>
    </>
  );
}
