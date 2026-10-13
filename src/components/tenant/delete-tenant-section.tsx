import { useId, useState, type FormEvent } from 'react';
import { useDeleteTenant } from '@/api/queries';
import type { Tenant } from '@/api/types';
import { Button, ConfirmDialog, Field, Input } from '../ui';
import { IconTrash } from '../ui/icons';

/**
 * Danger zone on the tenant detail page. Deleting a tenant cascades on the
 * server, so the confirmation asks for the tenant id to be typed out.
 */
export function DeleteTenantSection({
  tenant,
  onDeleted,
}: {
  tenant: Tenant;
  onDeleted: () => void;
}) {
  const del = useDeleteTenant();
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === tenant.id;

  const close = () => {
    setOpen(false);
    setTyped('');
    del.reset();
  };

  const confirm = () => {
    if (!matches || del.isPending) return;
    // A 404 (already deleted elsewhere) also resolves here: the tenant is gone either way.
    del.mutate(tenant.id, {
      onSuccess: () => {
        close();
        onDeleted();
      },
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    confirm();
  };

  return (
    <section
      aria-labelledby={headingId}
      className="mt-4 rounded-lg border first:mt-0 border-danger/40 bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-[13px] font-semibold text-danger">
            Danger zone
          </h2>
          <p className="text-[12px] text-fg-muted">
            Deleting this workspace revokes its app keys, destroys its provider accounts, removes
            its routing and deletes its data connections and assistants. The audit log is kept.
          </p>
        </div>
        <Button variant="danger" icon={<IconTrash size={14} />} onClick={() => setOpen(true)}>
          Delete workspace
        </Button>
      </div>

      <ConfirmDialog
        open={open}
        title="Delete this workspace?"
        confirmLabel="Delete workspace"
        confirmDisabled={!matches}
        loading={del.isPending}
        error={del.error}
        onCancel={close}
        onConfirm={confirm}
      >
        <p>
          Deleting <span className="font-medium">{tenant.name}</span> cannot be undone. In one step,
          Caliban:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>revokes all of its app keys, so applications using them stop working;</li>
          <li>destroys its own provider accounts;</li>
          <li>removes its routing;</li>
          <li>deletes its data connections and assistants.</li>
        </ul>
        <p>
          The audit log is kept. The workspace id <code className="font-mono">{tenant.id}</code>{' '}
          can&apos;t be reused.
        </p>
        <form onSubmit={onSubmit} aria-label="Confirm workspace deletion">
          <Field
            label={
              <>
                Type <code className="font-mono">{tenant.id}</code> to confirm
              </>
            }
          >
            {({ id }) => (
              <Input
                id={id}
                autoComplete="off"
                spellCheck={false}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="font-mono"
              />
            )}
          </Field>
        </form>
      </ConfirmDialog>
    </section>
  );
}
