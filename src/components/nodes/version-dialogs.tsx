import { useState } from 'react';
import {
  useDeleteNode,
  usePromoteNode,
  usePublishNodeVersion,
  useRetireNodeVersion,
} from '@/api/queries';
import type { Node } from '@/api/types';
import { Checkbox, ConfirmDialog } from '../ui';
import { NodeProblems } from './node-problems';

export type VersionAction = 'publish' | 'promote' | 'retire' | 'delete';

const ref = (v: Node) => `${v.name} v${v.version}`;

function Code({ children }: { children: string }) {
  return <code className="font-mono font-medium">{children}</code>;
}

/**
 * The confirmations of a node version's lifecycle: publish (and promote),
 * promote another published version, retire, and delete a draft or retired
 * version. `live` is the node's live version number, if any.
 */
export function VersionDialog({
  action,
  version,
  live,
  onClose,
}: {
  action: VersionAction | null;
  version: Node | null;
  live: number | null | undefined;
  onClose: () => void;
}) {
  const open = action !== null && version !== null;
  return (
    <>
      <PublishDialog
        open={open && action === 'publish'}
        version={version}
        live={live}
        onClose={onClose}
      />
      <PromoteDialog
        open={open && action === 'promote'}
        version={version}
        live={live}
        onClose={onClose}
      />
      <RetireDialog open={open && action === 'retire'} version={version} onClose={onClose} />
      <DeleteDialog open={open && action === 'delete'} version={version} onClose={onClose} />
    </>
  );
}

interface DialogProps {
  open: boolean;
  version: Node | null;
  onClose: () => void;
}

function PublishDialog({
  open,
  version: v,
  live,
  onClose,
}: DialogProps & { live: number | null | undefined }) {
  const publish = usePublishNodeVersion(v?.tenant_id ?? '', v?.name ?? '');
  const [promote, setPromote] = useState(true);
  const close = () => {
    publish.reset();
    setPromote(true);
    onClose();
  };
  return (
    <ConfirmDialog
      open={open}
      title={v ? `Publish ${ref(v)}?` : 'Publish'}
      confirmLabel={promote ? 'Publish and make live' : 'Publish'}
      confirmVariant="primary"
      loading={publish.isPending}
      onCancel={close}
      onConfirm={() => {
        if (v) publish.mutate({ version: v.version, promote }, { onSuccess: close });
      }}
    >
      <p>
        The control plane checks {v && <Code>{ref(v)}</Code>} against this tenant first: every MCP
        tool is an approved manifest with that pin, every datasource scope exists, the budgets fit
        the tenant&apos;s node caps, and every node it calls is published. Then it ships the
        version, sealed, to routers and workers.
      </p>
      <Checkbox
        label="Make it the live version"
        checked={promote}
        disabled={publish.isPending}
        onChange={(e) => {
          setPromote(e.target.checked);
          publish.reset();
        }}
        hint={
          promote
            ? live != null
              ? `Runs that name no version run it instead of v${live}.`
              : 'Runs that name no version run it.'
            : live != null
              ? `v${live} stays live. Runs can still name this version.`
              : 'The node keeps no live version. Runs can still name this version.'
        }
      />
      <p className="text-fg-muted">Versions are immutable: publishing never changes the spec.</p>
      <NodeProblems error={publish.error} />
    </ConfirmDialog>
  );
}

function PromoteDialog({
  open,
  version: v,
  live,
  onClose,
}: DialogProps & { live: number | null | undefined }) {
  const promote = usePromoteNode(v?.tenant_id ?? '', v?.name ?? '');
  const close = () => {
    promote.reset();
    onClose();
  };
  return (
    <ConfirmDialog
      open={open}
      title={v ? `Make ${ref(v)} live?` : 'Promote'}
      confirmLabel="Make live"
      confirmVariant="primary"
      loading={promote.isPending}
      onCancel={close}
      onConfirm={() => {
        if (v) promote.mutate(v.version, { onSuccess: close });
      }}
    >
      <p>
        Runs that name no version run {v && <Code>{ref(v)}</Code>} from now on.
        {live != null && v && live !== v.version && (
          <>
            {' '}
            v{live} stays published, so runs that name it keep working, and you can make it live
            again to roll back.
          </>
        )}
      </p>
      <p className="text-fg-muted">
        Its budgets are checked against the tenant&apos;s current node caps first.
      </p>
      <NodeProblems error={promote.error} />
    </ConfirmDialog>
  );
}

function RetireDialog({ open, version: v, onClose }: DialogProps) {
  const retire = useRetireNodeVersion(v?.tenant_id ?? '', v?.name ?? '');
  const close = () => {
    retire.reset();
    onClose();
  };
  return (
    <ConfirmDialog
      open={open}
      title={v ? `Retire ${ref(v)}?` : 'Retire'}
      confirmLabel="Retire version"
      loading={retire.isPending}
      error={retire.error}
      onCancel={close}
      onConfirm={() => {
        if (v) retire.mutate(v.version, { onSuccess: close });
      }}
    >
      <p>
        {v && <Code>{ref(v)}</Code>} leaves the data plane: new runs of it are refused.{' '}
        <strong className="font-medium">
          Runs already in flight are not cut off: they finish on the version they started on.
        </strong>
      </p>
      {v?.live && (
        <p>
          It is the live version. Until you make another version live, runs that name no version are
          refused.
        </p>
      )}
      <p className="text-fg-muted">
        Retirement is final: a retired version cannot be published again. A version that another
        published version calls (node://) cannot be retired.
      </p>
    </ConfirmDialog>
  );
}

function DeleteDialog({ open, version: v, onClose }: DialogProps) {
  const del = useDeleteNode();
  const close = () => {
    del.reset();
    onClose();
  };
  return (
    <ConfirmDialog
      open={open}
      title="Delete node version?"
      confirmLabel="Delete node version"
      loading={del.isPending}
      error={del.error}
      onCancel={close}
      onConfirm={() => {
        // A 404 (already deleted) resolves too; the list refreshes either way.
        if (v) del.mutate({ tenantId: v.tenant_id, nodeId: v.id }, { onSuccess: close });
      }}
    >
      <p>
        Delete {v && <Code>{ref(v)}</Code>}? Only this {v?.state ?? ''} version is deleted, and it
        is no longer listed. Its version number is not reused by later versions.
      </p>
      <p>Audit history is kept.</p>
    </ConfirmDialog>
  );
}
