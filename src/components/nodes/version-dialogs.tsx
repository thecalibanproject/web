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
 * The confirmations of an assistant version's lifecycle: publish (and make
 * live), make another published version live, retire, and delete a draft or
 * retired version. `live` is the live version number, if any.
 * `promoteByDefault`: whether "Make it live" starts ticked when publishing; it
 * should not when the go-live bar needs tests first (UX-38).
 */
export function VersionDialog({
  action,
  version,
  live,
  promoteByDefault = false,
  onClose,
}: {
  action: VersionAction | null;
  version: Node | null;
  live: number | null | undefined;
  promoteByDefault?: boolean;
  onClose: () => void;
}) {
  const open = action !== null && version !== null;
  return (
    <>
      <PublishDialog
        open={open && action === 'publish'}
        version={version}
        live={live}
        promoteByDefault={promoteByDefault}
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
  promoteByDefault,
  onClose,
}: DialogProps & { live: number | null | undefined; promoteByDefault: boolean }) {
  const publish = usePublishNodeVersion(v?.tenant_id ?? '', v?.name ?? '');
  const [promote, setPromote] = useState(promoteByDefault);
  const close = () => {
    publish.reset();
    setPromote(promoteByDefault);
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
        Publishing freezes {v && <Code>{ref(v)}</Code>} so it can be tested. Caliban first checks
        that every tool it uses is approved, every data source it reads exists, its limits fit the
        workspace&apos;s limits, and every assistant it calls is published.
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
              ? `New requests go to it instead of v${live}.`
              : 'New requests go to it.'
            : live != null
              ? `v${live} stays live while you test this version.`
              : 'Nothing is live yet. Test this version, then make it live.'
        }
      />
      <p className="text-fg-muted">
        A version never changes once published. When the go-live bar needs tests, publish first, run
        the tests, then make it live.
      </p>
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
      title={v ? `Make ${ref(v)} live?` : 'Make live'}
      confirmLabel="Make live"
      confirmVariant="primary"
      loading={promote.isPending}
      onCancel={close}
      onConfirm={() => {
        if (v) promote.mutate(v.version, { onSuccess: close });
      }}
    >
      <p>
        New requests go to {v && <Code>{ref(v)}</Code>} from now on.
        {live != null && v && live !== v.version && (
          <> v{live} stays published, so you can make it live again to roll back.</>
        )}
      </p>
      <p className="text-fg-muted">
        Caliban checks its limits against the workspace&apos;s limits, and its latest test results
        against the go-live bar (a version that can change things always needs safety tests).
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
        {v && <Code>{ref(v)}</Code>} stops answering new requests.{' '}
        <strong className="font-medium">
          Conversations already under way are not cut off: they finish on this version.
        </strong>
      </p>
      {v?.live && (
        <p>
          It is the live version. Until you make another version live, requests that name no version
          are refused.
        </p>
      )}
      <p className="text-fg-muted">
        Retiring is final: a retired version cannot be published again. A version that another
        published assistant calls cannot be retired.
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
      title="Delete this version?"
      confirmLabel="Delete version"
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
