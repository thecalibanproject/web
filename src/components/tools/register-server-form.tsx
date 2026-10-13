import { Advanced } from '@/components/help/advanced';
import { useState, type FormEvent } from 'react';
import { useRegisterToolServer } from '@/api/queries';
import { TOOL_AUTH_METHODS, type ToolAuth, type ToolAuthMethod } from '@/api/types';
import { NEEDS_CREDENTIAL, TOOL_AUTH_HINT, TOOL_AUTH_LABEL } from '@/lib/tools';
import { NODE_NAME_PATTERN } from '@/lib/nodes';
import { Button, Field, FormError, Input, Select, Switch } from '../ui';
import { IconAlert } from '../ui/icons';

interface AuthFields {
  audience: string;
  header: string;
  token_url: string;
  client_id: string;
  scope: string;
}

const EMPTY: AuthFields = { audience: '', header: '', token_url: '', client_id: '', scope: '' };

/** The `auth` object for `method`, with only the fields it uses and only when set. */
function buildAuth(method: ToolAuthMethod, f: AuthFields): ToolAuth {
  const auth: ToolAuth = { method };
  const set = (key: keyof AuthFields) => {
    const v = f[key].trim();
    if (v) auth[key] = v;
  };
  if (method === 'caliban_token') set('audience');
  if (method === 'api_key') set('header');
  if (method === 'oauth_client_credentials') {
    set('token_url');
    set('client_id');
    set('scope');
  }
  return auth;
}

/** Explains the trusted flag: who sees personal data in tool arguments. */
export const TRUSTED_HINT =
  "Off (the default): the system gets placeholders instead of personal data, as the workspace's privacy setting says. On: Caliban puts the real values back before each call. Turn it on only for a system on your own network that may process personal data.";

/**
 * Registers an MCP server (Streamable HTTP) for a tenant. The credential, for
 * API key and OAuth servers, is sealed by the control plane at once and never
 * returned: the field is cleared after every attempt and nothing echoes it.
 */
export function RegisterServerForm({
  tenantId,
  onCancel,
  onRegistered,
}: {
  tenantId: string;
  onCancel: () => void;
  onRegistered: (name: string) => void;
}) {
  const register = useRegisterToolServer(tenantId);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<ToolAuthMethod>('caliban_token');
  const [fields, setFields] = useState<AuthFields>(EMPTY);
  const [credential, setCredential] = useState('');
  const [trusted, setTrusted] = useState(false);
  const secretLabel = NEEDS_CREDENTIAL[method];
  const oauth = method === 'oauth_client_credentials';

  const field = (key: keyof AuthFields) => ({
    value: fields[key],
    onChange: (e: { target: { value: string } }) =>
      setFields((f) => ({ ...f, [key]: e.target.value })),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    register.mutate(
      {
        name: trimmed,
        url: url.trim(),
        auth: buildAuth(method, fields),
        ...(secretLabel && credential ? { credential } : {}),
        trusted,
      },
      {
        // Write-only: the secret leaves memory whatever the outcome.
        onSettled: () => setCredential(''),
        onSuccess: () => onRegistered(trimmed),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Add a connected system">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required hint="A short name for this system, such as crm.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              required
              aria-describedby={describedBy}
              pattern={NODE_NAME_PATTERN}
              title="1 to 64 lowercase letters, digits, - and _"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="crm"
              className="font-mono"
            />
          )}
        </Field>
        <Field label="Authentication" required>
          {({ id }) => (
            <Select
              id={id}
              value={method}
              onChange={(e) => {
                setMethod(e.target.value as ToolAuthMethod);
                setCredential('');
              }}
            >
              {TOOL_AUTH_METHODS.map((m) => (
                <option key={m} value={m}>
                  {TOOL_AUTH_LABEL[m]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Address" required hint="The tool server's https or http address.">
        {({ id, describedBy }) => (
          <Input
            id={id}
            type="url"
            required
            aria-describedby={describedBy}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://crm.internal:8443/mcp"
            spellCheck={false}
            className="font-mono"
          />
        )}
      </Field>

      <fieldset className="flex flex-col gap-4 rounded-md border border-border p-3.5">
        <legend className="px-1 text-[12px] font-medium text-fg-muted">
          {TOOL_AUTH_LABEL[method]}
        </legend>
        <p className="text-[12.5px] text-fg-muted">{TOOL_AUTH_HINT[method]}</p>
        {(method === 'caliban_token' || method === 'api_key') && (
          <Advanced
            summary={
              method === 'caliban_token'
                ? "Tokens are made for the address's origin"
                : 'The key goes in Authorization: Bearer'
            }
          >
            <p className="text-[12px] text-fg-muted">
              Only Streamable HTTP servers are supported (not stdio). Caliban checks the address
              against its outgoing rules: no link-local or cloud metadata addresses.
            </p>
            {method === 'caliban_token' && (
              <Field
                label="Audience"
                hint="The aud claim of minted tokens. Default: the address's origin."
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    spellCheck={false}
                    {...field('audience')}
                  />
                )}
              </Field>
            )}
            {method === 'api_key' && (
              <Field
                label="Header"
                hint="The header that carries the key. Default: Authorization: Bearer."
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    spellCheck={false}
                    placeholder="X-Api-Key"
                    {...field('header')}
                  />
                )}
              </Field>
            )}
          </Advanced>
        )}
        {oauth && (
          <>
            <Field label="Token URL" required>
              {({ id }) => (
                <Input
                  id={id}
                  type="url"
                  required
                  spellCheck={false}
                  className="font-mono"
                  {...field('token_url')}
                />
              )}
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Client ID" required>
                {({ id }) => <Input id={id} required spellCheck={false} {...field('client_id')} />}
              </Field>
              <Field label="Scope" hint="Requested scope, to down-scope the token.">
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    spellCheck={false}
                    {...field('scope')}
                  />
                )}
              </Field>
            </div>
          </>
        )}
        {secretLabel && (
          <Field
            label={secretLabel}
            required
            hint="Encrypted with the workspace's data key as soon as Caliban receives it, and never shown again. To change it, delete the system and add it again."
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                type="password"
                required
                autoComplete="off"
                spellCheck={false}
                aria-describedby={describedBy}
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                className="font-mono"
              />
            )}
          </Field>
        )}
      </fieldset>

      <Field label="Trusted with personal data" hint={TRUSTED_HINT}>
        {({ id, describedBy }) => (
          <Switch
            id={id}
            aria-describedby={describedBy}
            checked={trusted}
            onChange={setTrusted}
            onLabel="Trusted: gets the real values"
            offLabel="Not trusted: gets placeholders"
          />
        )}
      </Field>
      {trusted && (
        <p className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-fg">
          <IconAlert size={14} className="mt-0.5 shrink-0 text-warn" />
          This system will receive personal data in its arguments. This can only be changed by
          deleting the system and adding it again.
        </p>
      )}

      <FormError error={register.error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          type="submit"
          variant="primary"
          loading={register.isPending}
          disabled={!name.trim() || !url.trim()}
        >
          Add system
        </Button>
      </div>
    </form>
  );
}
