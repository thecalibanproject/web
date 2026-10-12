import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { usePermissions } from '@/api/auth';
import { nodesQuery } from '@/api/queries';
import { accessError, splitList, type KeyAccess } from '@/lib/apiKeys';
import { Checkbox, Field, Input } from '../ui';

const NODE_MODES: Array<{ value: KeyAccess['nodes']; label: string; hint: string }> = [
  { value: 'all', label: 'Every published node', hint: 'No allowlist: new nodes are included.' },
  { value: 'only', label: 'Only these nodes', hint: 'An allowlist of node names.' },
  { value: 'none', label: 'No nodes', hint: 'The key only makes model calls.' },
];

/**
 * Which nodes an API key may run (its node allowlist) and which datasource
 * scopes the built-in query tool may read in its runs. Controlled, so the same
 * fields can edit an existing key once the control plane accepts changes.
 * Granting node access needs nodes.run on the tenant.
 */
export function KeyAccessFields({
  tenantId,
  value,
  onChange,
  disabled = false,
}: {
  tenantId: string;
  value: KeyAccess;
  onChange: (access: KeyAccess) => void;
  disabled?: boolean;
}) {
  const perms = usePermissions();
  const canGrant = perms.can('nodes.run', tenantId);
  const nodes = useQuery({
    ...nodesQuery(tenantId),
    enabled: canGrant && perms.can('nodes.read', tenantId),
  });
  const known = useMemo(
    () => [...new Set((nodes.data ?? []).map((n) => n.name))].sort(),
    [nodes.data],
  );
  const [otherText, setOtherText] = useState(() =>
    value.names.filter((n) => !known.includes(n)).join(', '),
  );
  const [scopeText, setScopeText] = useState(() => value.scopes.join(', '));
  const group = useId();
  const errorId = useId();
  const error = accessError(value);
  const locked = disabled || !canGrant;

  const setNames = (picked: string[], other: string) =>
    onChange({ ...value, names: [...new Set([...picked, ...splitList(other)])] });
  const picked = value.names.filter((n) => known.includes(n));

  return (
    <div className="flex flex-col gap-4">
      <fieldset
        className="flex flex-col gap-2"
        disabled={locked}
        aria-describedby={!canGrant ? `${group}-denied` : undefined}
      >
        <legend className="mb-1 text-[12.5px] font-medium text-fg">Nodes this key may run</legend>
        {!canGrant && (
          <p id={`${group}-denied`} className="text-[12px] text-fg-muted">
            Your role cannot grant node access on this tenant (needs nodes.run): the key will run no
            nodes.
          </p>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {NODE_MODES.map((m) => (
            <label
              key={m.value}
              className="inline-flex items-center gap-2 text-[13px]"
              title={m.hint}
            >
              <input
                type="radio"
                name={`${group}-nodes`}
                value={m.value}
                checked={canGrant ? value.nodes === m.value : m.value === 'none'}
                onChange={() => onChange({ ...value, nodes: m.value })}
                className="size-3.5 accent-accent"
              />
              {m.label}
            </label>
          ))}
        </div>
        {canGrant && value.nodes === 'only' && (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            {known.length > 0 ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5" role="group" aria-label="Nodes">
                {known.map((name) => (
                  <Checkbox
                    key={name}
                    label={<span className="font-mono text-[12.5px]">{name}</span>}
                    checked={picked.includes(name)}
                    disabled={disabled}
                    onChange={(e) =>
                      setNames(
                        e.target.checked ? [...picked, name] : picked.filter((n) => n !== name),
                        otherText,
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-fg-muted">
                {nodes.isPending && nodes.fetchStatus !== 'idle'
                  ? "Loading the tenant's nodes…"
                  : 'No nodes listed for this tenant yet. Type the names below.'}
              </p>
            )}
            <Field
              label={known.length > 0 ? 'Other node names' : 'Node names'}
              hint="Comma separated. A node does not need to exist yet."
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={otherText}
                  disabled={disabled}
                  spellCheck={false}
                  placeholder="triage, intake"
                  className="font-mono"
                  onChange={(e) => {
                    setOtherText(e.target.value);
                    setNames(picked, e.target.value);
                  }}
                />
              )}
            </Field>
          </div>
        )}
      </fieldset>
      <Field
        label="Datasource scopes"
        hint="What the built-in datasource query tool may read, and which document collections rag_search may search (rag.<collection>:read), in this key's runs, on top of each node's own scopes. Comma separated, such as shop.orders:read or rag.handbook:read. Empty: every scope of the nodes it runs."
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={[describedBy, error ? errorId : undefined].filter(Boolean).join(' ')}
            aria-invalid={Boolean(error) && value.scopes.length > 0}
            value={scopeText}
            disabled={disabled}
            spellCheck={false}
            placeholder="shop.orders:read"
            className="font-mono"
            onChange={(e) => {
              setScopeText(e.target.value);
              onChange({ ...value, scopes: splitList(e.target.value) });
            }}
          />
        )}
      </Field>
      {error && (
        <p id={errorId} className="text-[12px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
