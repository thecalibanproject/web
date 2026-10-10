import { useMemo, useState, type FormEvent } from 'react';
import { useImportTools } from '@/api/queries';
import { parseManifests } from '@/lib/tools';
import { Button, FormError } from '../ui';
import { IconAlert, IconCheck } from '../ui/icons';

const EXAMPLE = JSON.stringify(
  {
    manifests: [
      {
        name: 'find_services',
        description: 'Finds catalogue services matching a category.',
        input_schema: {
          type: 'object',
          properties: { category: { type: 'string' } },
          required: ['category'],
        },
      },
    ],
  },
  null,
  2,
);

/**
 * Records manifests for a server the control plane cannot reach (another
 * network zone, an air gap). They are pinned and scanned like discovered ones
 * and still need approval.
 */
export function ImportManifestsForm({
  tenantId,
  server,
  onDone,
}: {
  tenantId: string;
  server: string;
  onDone: () => void;
}) {
  const importTools = useImportTools(tenantId, server);
  const [text, setText] = useState(EXAMPLE);
  const parsed = useMemo(() => parseManifests(text), [text]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (parsed.ok) importTools.mutate(parsed.body, { onSuccess: onDone });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-label="Import manifests">
      <p className="text-[12.5px] text-fg-muted">
        For a server the control plane cannot reach. Paste what its tools/list returns: each
        manifest is pinned and scanned like a discovered one, and still needs approval. At run time
        the worker checks that the server lists exactly this manifest.
      </p>
      <label htmlFor="tool-manifests" className="text-[12.5px] font-medium">
        Manifests (JSON)
      </label>
      <textarea
        id="tool-manifests"
        aria-describedby="tool-manifests-status"
        aria-invalid={!parsed.ok}
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          importTools.reset();
        }}
        className="min-h-64 resize-y rounded-md border border-border-strong bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed text-fg focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring aria-[invalid=true]:border-danger"
      />
      <p id="tool-manifests-status" aria-live="polite" className="text-[12.5px]">
        {parsed.ok ? (
          <span className="flex items-center gap-1.5 text-ok">
            <IconCheck size={14} /> {parsed.body.manifests.length} manifest
            {parsed.body.manifests.length === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-danger">
            <IconAlert size={14} /> {parsed.error}
          </span>
        )}
      </p>
      <FormError error={importTools.error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button
          type="submit"
          variant="primary"
          loading={importTools.isPending}
          disabled={!parsed.ok}
        >
          Import manifests
        </Button>
      </div>
    </form>
  );
}
