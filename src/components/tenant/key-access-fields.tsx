import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { usePermissions } from '@/api/auth';
import { datasourcesQuery, nodesQuery, ragCollectionsQuery } from '@/api/queries';
import { accessError, splitList, type KeyAccess } from '@/lib/apiKeys';
import { doc } from '@/lib/docs';
import { Advanced } from '../help/advanced';
import { Toggletip } from '../help/toggletip';
import { Checkbox, Field, Input } from '../ui';

const NODE_MODES: Array<{ value: KeyAccess['nodes']; label: string; hint: string }> = [
  {
    value: 'only',
    label: 'Only these assistants',
    hint: 'Recommended: the key runs the assistants you tick, nothing else.',
  },
  { value: 'none', label: 'Model calls only', hint: 'The key runs no assistant.' },
  {
    value: 'all',
    label: 'Every published assistant',
    hint: 'Including assistants added later.',
  },
];

/**
 * Which assistants an app key may run and which data its conversations may
 * read, picked from what the workspace has (UX-28). Controlled, so the same
 * fields can edit an existing key once the control plane accepts changes.
 * Granting assistants needs nodes.run on the workspace.
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
  const rag = useQuery({
    ...ragCollectionsQuery(tenantId),
    enabled: perms.can('rag.read', tenantId),
  });
  const sources = useQuery({
    ...datasourcesQuery(tenantId),
    enabled: perms.can('datasources.read', tenantId),
  });
  const offered = useMemo(
    () => [
      ...(rag.data ?? []).map((c) => ({
        scope: `rag.${c.name}:read`,
        label: `Document library ${c.name}`,
      })),
      ...(sources.data ?? []).map((d) => ({
        scope: `${d.name}.*:read`,
        label: `Data connection ${d.name}`,
      })),
    ],
    [rag.data, sources.data],
  );
  const offeredScopes = offered.map((o) => o.scope);
  const [otherText, setOtherText] = useState(() =>
    value.scopes.filter((s) => !offeredScopes.includes(s)).join(', '),
  );
  const group = useId();
  const errorId = useId();
  const error = accessError(value);
  const locked = disabled || !canGrant;
  const pickedScopes = value.scopes.filter((s) => offeredScopes.includes(s));
  const setScopes = (picked: string[], other: string) =>
    onChange({ ...value, scopes: [...new Set([...picked, ...splitList(other)])] });

  return (
    <div className="flex flex-col gap-4">
      <fieldset
        className="flex flex-col gap-2"
        disabled={locked}
        aria-describedby={!canGrant ? `${group}-denied` : undefined}
      >
        <legend className="mb-1 text-[12.5px] font-medium text-fg">
          Assistants this key may run
        </legend>
        {!canGrant && (
          <p id={`${group}-denied`} className="text-[12px] text-fg-muted">
            Your role cannot let keys run assistants in this workspace: the key will make model
            calls only.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
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
          <Toggletip label="key access" doc={doc('guides/api-keys', 'create')}>
            An application calling with this key can only run the assistants allowed here. Model
            calls through automatic routing work either way.
          </Toggletip>
        </div>
        {canGrant && value.nodes === 'only' && (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            {known.length > 0 ? (
              <div
                className="flex flex-wrap gap-x-4 gap-y-1.5"
                role="group"
                aria-label="Assistants"
              >
                {known.map((name) => (
                  <Checkbox
                    key={name}
                    label={name}
                    checked={value.names.includes(name)}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        names: e.target.checked
                          ? [...value.names, name]
                          : value.names.filter((n) => n !== name),
                      })
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-fg-muted">
                {nodes.isPending && nodes.fetchStatus !== 'idle'
                  ? "Loading the workspace's assistants…"
                  : 'This workspace has no assistant yet. Choose model calls only, or create an assistant first.'}
              </p>
            )}
          </div>
        )}
      </fieldset>
      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="mb-1 text-[12.5px] font-medium text-fg">
          Data its conversations may read
        </legend>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {offered.length > 0 ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5" role="group" aria-label="Data">
              {offered.map((o) => (
                <Checkbox
                  key={o.scope}
                  label={o.label}
                  checked={pickedScopes.includes(o.scope)}
                  onChange={(e) =>
                    setScopes(
                      e.target.checked
                        ? [...pickedScopes, o.scope]
                        : pickedScopes.filter((s) => s !== o.scope),
                      otherText,
                    )
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-fg-muted">
              No document library or data connection in this workspace yet.
            </p>
          )}
          <Toggletip label="data access" doc={doc('guides/api-keys', 'scopes')}>
            On top of what each assistant may read. Nothing ticked: each assistant&apos;s own data
            access applies. Also called datasource scopes.
          </Toggletip>
        </div>
      </fieldset>
      <Advanced summary={otherText.trim() ? otherText : 'No other data'}>
        <Field
          label="Other data it may read"
          hint="Comma separated, as <connection>.<collection>:read or rag.<library>:read, such as shop.orders:read."
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={[describedBy, error ? errorId : undefined]
                .filter(Boolean)
                .join(' ')}
              aria-invalid={Boolean(error) && value.scopes.length > 0}
              value={otherText}
              disabled={disabled}
              spellCheck={false}
              placeholder="shop.orders:read"
              className="font-mono"
              onChange={(e) => {
                setOtherText(e.target.value);
                setScopes(pickedScopes, e.target.value);
              }}
            />
          )}
        </Field>
      </Advanced>
      {error && (
        <p id={errorId} className="text-[12px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
