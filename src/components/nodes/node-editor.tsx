import { useDeferredValue, useMemo, useState, type FormEvent } from 'react';
import { useCreateNodeVersion } from '@/api/queries';
import type { Node } from '@/api/types';
import { doc } from '@/lib/docs';
import { NODE_NAME_PATTERN } from '@/lib/nodes';
import { checkNodeSpec } from '@/lib/nodeSpec';
import { BLANK_TEMPLATE } from '@/lib/templates';
import { useWorkspace } from '@/lib/workspace';
import { LearnMore } from '../help/learn-more';
import { TenantSelect } from '../tenant-select';
import { Button, Field, Input, Tabs } from '../ui';
import { IconAlert, IconCheck } from '../ui/icons';
import { NodeProblems } from './node-problems';
import { SpecFormView } from './spec-form';

type View = 'form' | 'json';

const VIEWS = [
  { value: 'form', label: 'Form' },
  { value: 'json', label: 'JSON' },
] as const;

const parse = (text: string): Record<string, unknown> | null => {
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/**
 * Editor for a draft version: a form for the common settings and the JSON
 * view of the full spec, kept in sync (the text is the one source of truth;
 * the form reads it and writes it back). The text is checked against the
 * spec schema as you type, and nothing is sent while it does not parse or
 * match. The control plane checks the spec again and its refusal is shown
 * problem by problem.
 *
 * Without `target` it creates a new assistant (v1) in a workspace the user may
 * write to; with it, the next version of that assistant, from `initialSpec`.
 */
export function NodeEditor({
  target,
  defaultTenant,
  defaultName,
  initialSpec,
  onCancel,
  onCreated,
}: {
  target?: { tenantId: string; name: string };
  defaultTenant?: string | undefined;
  defaultName?: string;
  initialSpec?: Record<string, unknown>;
  onCancel: () => void;
  onCreated: (node: Node) => void;
}) {
  const create = useCreateNodeVersion();
  const ws = useWorkspace();
  const [chosenTenant, setTenantId] = useState(target?.tenantId ?? defaultTenant);
  const tenantId = chosenTenant ?? ws.id;
  const [name, setName] = useState(target?.name ?? defaultName ?? '');
  const [view, setView] = useState<View>('form');
  const [text, setText] = useState(() =>
    JSON.stringify(initialSpec ?? BLANK_TEMPLATE.spec, null, 2),
  );
  const deferred = useDeferredValue(text);
  const check = useMemo(() => checkNodeSpec(deferred), [deferred]);
  const valid = check.ok && deferred === text;
  const parsed = useMemo(() => parse(text), [text]);

  const edit = (next: string) => {
    setText(next);
    create.reset();
  };

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
      className="flex min-h-full flex-col gap-4"
      aria-label={target ? 'Create version' : 'Create assistant'}
    >
      {target ? (
        <p className="text-[12.5px] text-fg-muted">
          A new draft of <span className="font-mono font-medium text-fg">{target.name}</span>. It
          gets the next version number; published versions are not changed.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Workspace" required>
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
            hint={
              <>
                Apps call it by this name (
                <code className="font-mono">POST /v1/nodes/NAME/runs</code>). Lowercase letters,
                digits, - and _.
              </>
            }
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
                placeholder="support-desk"
                className="font-mono"
              />
            )}
          </Field>
        </div>
      )}

      {/* Grows with the form (no min-h-0): the drawer scrolls, the actions stay below. */}
      <div className="flex flex-1 flex-col">
        <Tabs<View> label="Edit with" tabs={VIEWS} value={view} onChange={setView}>
          {view === 'form' ? (
            parsed ? (
              <SpecFormView
                spec={parsed}
                onChange={(s) => edit(JSON.stringify(s, null, 2))}
                tenantId={tenantId}
              />
            ) : (
              <p role="note" className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
                The JSON view has text the form cannot read. Fix it there to use the form again.
              </p>
            )
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-1">
              <div className="flex items-center justify-between">
                <label htmlFor="node-spec" className="text-[12.5px] font-medium">
                  Settings as JSON
                  <span className="ml-0.5 text-danger" aria-hidden="true">
                    *
                  </span>
                </label>
                <span className="flex items-center gap-2 text-[12.5px]">
                  <LearnMore doc={doc('reference/assistant-spec')}>Every setting</LearnMore>
                  <Button size="sm" variant="ghost" onClick={format}>
                    Format
                  </Button>
                </span>
              </div>
              <textarea
                id="node-spec"
                aria-describedby="node-spec-status node-spec-keys"
                aria-invalid={!check.ok}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                value={text}
                onChange={(e) => edit(e.target.value)}
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
              <p id="node-spec-keys" className="text-[12px] text-fg-muted">
                Tab indents. Press Escape, then Tab, to leave the field.
              </p>
            </div>
          )}
        </Tabs>
        <div id="node-spec-status" aria-live="polite" className="mt-3 text-[12.5px]">
          {check.ok ? (
            <p className="flex items-center gap-1.5 text-ok">
              <IconCheck size={14} /> Settings are complete (checked against{' '}
              <code className="font-mono">node.schema.json</code>)
            </p>
          ) : check.parseError ? (
            <p className="flex items-center gap-1.5 text-danger">
              <IconAlert size={14} /> The JSON view does not parse: {check.parseError}
            </p>
          ) : (
            <div className="rounded-md bg-danger-soft px-3 py-2 text-danger">
              <p className="flex items-center gap-1.5 font-medium">
                <IconAlert size={14} /> {check.issues.length}{' '}
                {check.issues.length === 1 ? 'setting needs' : 'settings need'} a fix
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
          {target ? 'Create draft' : 'Create assistant'}
        </Button>
      </div>
    </form>
  );
}
