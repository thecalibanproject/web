import { useDeferredValue, useMemo, useState, type FormEvent } from 'react';
import { useCreateNodeVersion } from '@/api/queries';
import type { Node } from '@/api/types';
import { NODE_NAME_PATTERN } from '@/lib/nodes';
import { checkNodeSpec, NODE_SPEC_TEMPLATE } from '@/lib/nodeSpec';
import { TenantSelect } from '../tenant-select';
import { Button, Field, Input } from '../ui';
import { IconAlert, IconCheck } from '../ui/icons';
import { NodeProblems } from './node-problems';

/**
 * JSON editor for a draft version. The text is parsed and checked against
 * node.schema.json as you type, and nothing is sent while it does not parse
 * or match. The control plane checks the spec again (pinned tools, schema
 * keywords, unsupported vertices) and its refusal is shown problem by problem.
 *
 * Without `target` it creates a new node (v1) in a tenant the user may write
 * to; with it, the next version of that node, starting from `initialSpec`.
 */
export function NodeEditor({
  target,
  defaultTenant,
  initialSpec,
  onCancel,
  onCreated,
}: {
  target?: { tenantId: string; name: string };
  defaultTenant?: string | undefined;
  initialSpec?: Record<string, unknown>;
  onCancel: () => void;
  onCreated: (node: Node) => void;
}) {
  const create = useCreateNodeVersion();
  const [tenantId, setTenantId] = useState(target?.tenantId ?? defaultTenant);
  const [name, setName] = useState(target?.name ?? '');
  const [text, setText] = useState(() =>
    JSON.stringify(initialSpec ?? NODE_SPEC_TEMPLATE, null, 2),
  );
  const deferred = useDeferredValue(text);
  const check = useMemo(() => checkNodeSpec(deferred), [deferred]);
  const valid = check.ok && deferred === text;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const now = checkNodeSpec(text);
    if (!now.ok || !tenantId || !name.trim()) return;
    create.mutate({ tenantId, name: name.trim(), spec: now.spec }, { onSuccess: onCreated });
  };

  const format = () => {
    try {
      setText(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      /* leave as-is; the parse error is already shown */
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex h-full flex-col gap-4"
      aria-label={target ? 'Create version' : 'Create node'}
    >
      {target ? (
        <p className="text-[12.5px] text-fg-muted">
          A new draft of <code className="font-mono font-medium text-fg">{target.name}</code>. It
          gets the next version number; published versions are not changed.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tenant" required>
            {({ id }) => (
              <TenantSelect
                id={id}
                value={tenantId}
                onChange={setTenantId}
                permission="nodes.write"
                required
              />
            )}
          </Field>
          <Field
            label="Name"
            required
            hint="Runs call it as POST /v1/nodes/{name}/runs. Lowercase letters, digits, - and _."
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                required
                aria-describedby={describedBy}
                pattern={NODE_NAME_PATTERN}
                title="1 to 64 lowercase letters, digits, - and _"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  create.reset();
                }}
                placeholder="invoice-triage"
                className="font-mono"
              />
            )}
          </Field>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between">
          <label htmlFor="node-spec" className="text-[12.5px] font-medium">
            Spec (JSON)
            <span className="ml-0.5 text-danger" aria-hidden="true">
              *
            </span>
          </label>
          <Button size="sm" variant="ghost" onClick={format}>
            Format
          </Button>
        </div>
        <textarea
          id="node-spec"
          aria-describedby="node-spec-status"
          aria-invalid={!check.ok}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            create.reset();
          }}
          onKeyDown={(e) => {
            // Tab inserts two spaces; Escape-then-Tab still leaves the field (WCAG 2.1.2).
            if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
              const ta = e.currentTarget;
              if (ta.dataset.escaped === '1') return;
              e.preventDefault();
              const { selectionStart: s, selectionEnd: end } = ta;
              setText(text.slice(0, s) + '  ' + text.slice(end));
              requestAnimationFrame(() => ta.setSelectionRange(s + 2, s + 2));
            }
            e.currentTarget.dataset.escaped = e.key === 'Escape' ? '1' : '0';
          }}
          className="min-h-80 flex-1 resize-y rounded-md border border-border-strong bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed text-fg focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring aria-[invalid=true]:border-danger"
        />
        <div id="node-spec-status" aria-live="polite" className="text-[12.5px]">
          {check.ok ? (
            <p className="flex items-center gap-1.5 text-ok">
              <IconCheck size={14} /> Valid against node.schema.json
            </p>
          ) : check.parseError ? (
            <p className="flex items-center gap-1.5 text-danger">
              <IconAlert size={14} /> Invalid JSON: {check.parseError}
            </p>
          ) : (
            <div className="rounded-md bg-danger-soft px-3 py-2 text-danger">
              <p className="flex items-center gap-1.5 font-medium">
                <IconAlert size={14} /> {check.issues.length} schema issue
                {check.issues.length === 1 ? '' : 's'}
              </p>
              <ul className="mt-1 list-disc pl-5 font-mono text-[12px]">
                {check.issues.slice(0, 12).map((i, n) => (
                  <li key={n}>
                    <span className="text-fg">{i.path}</span> {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <NodeProblems error={create.error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          type="submit"
          variant="primary"
          loading={create.isPending}
          disabled={!valid || !tenantId || !name.trim()}
        >
          {target ? 'Create draft' : 'Create node'}
        </Button>
      </div>
    </form>
  );
}
