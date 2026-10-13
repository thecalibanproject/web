import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconX } from './icons';

/**
 * Modal panel built on the native <dialog> element, which provides the focus
 * trap, Escape-to-close, inert background and top-layer stacking for free.
 * `side="right"` renders a drawer; `side="center"` a dialog.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  side = 'right',
  size = 'md',
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  side?: 'right' | 'center';
  /** Width of a centred dialog. */
  size?: 'md' | 'lg';
  footer?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      // jsdom (tests) and very old browsers lack showModal.
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  return (
    // Backdrop click is a mouse convenience; keyboard users close with Escape
    // (native dialog `cancel`) or the Close button.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself) closes.
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        'border border-border bg-surface p-0 text-fg shadow-panel backdrop:bg-overlay',
        side === 'right'
          ? 'fixed top-0 right-0 bottom-0 left-auto m-0 h-dvh max-h-dvh w-[min(560px,100vw)] max-w-none rounded-none border-y-0 border-r-0'
          : cn(
              'm-auto rounded-lg',
              size === 'lg' ? 'w-[min(920px,calc(100vw-32px))]' : 'w-[min(520px,calc(100vw-32px))]',
            ),
      )}
    >
      {open && (
        <div
          className={cn(
            'flex flex-col',
            side === 'right'
              ? 'h-full motion-safe:animate-drawer-in'
              : 'max-h-[85dvh] motion-safe:animate-dialog-in',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-3.5">
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-[15px] font-semibold">
                {title}
              </h2>
              {description && (
                <div className="mt-0.5 text-[12.5px] text-fg-muted">{description}</div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <IconX />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
          )}
        </div>
      )}
    </dialog>
  );
}
