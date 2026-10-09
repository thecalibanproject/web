import type { ReactNode } from 'react';
import { Button } from './button';
import { Drawer } from './drawer';
import { FormError } from './states';

/**
 * In-app confirmation for destructive actions (never `window.confirm`, which
 * blocks the tab, can't be styled and is suppressed in some kiosk setups).
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Delete',
  loading = false,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  loading?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Drawer
      open={open}
      onClose={onCancel}
      side="center"
      title={title}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="danger" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[13px]">
        {children}
        <FormError error={error} />
      </div>
    </Drawer>
  );
}
