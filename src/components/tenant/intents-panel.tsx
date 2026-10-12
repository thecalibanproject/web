import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { usePermissions } from '@/api/auth';
import { intentsQuery, useDeleteIntent, useSetIntent } from '@/api/queries';
import type { TenantIntent } from '@/api/types';
import { isNotFound } from '@/lib/errors';
import { formatInt } from '@/lib/format';
import {
  exemplarsError,
  intentNameError,
  MAX_EXEMPLARS,
  MAX_INTENTS,
  parseExemplars,
  routeNode,
} from '@/lib/intents';
import { deniedReason } from '@/lib/permissions';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  GatedButton,
  Input,
  LoadingState,
  Table,
  TBody,
  TD,
  TH,
  THead,
  Textarea,
  TR,
} from '../ui';
import { IconPlus } from '../ui/icons';
import { TenantDeletedState } from './tenant-deleted-state';

function SourceBadge({ source }: { source: TenantIntent['source'] }) {
  return source === 'api' ? (
    <Badge tone="accent" title="Set for this tenant in the console or the admin API.">
      Set here
    </Badge>
  ) : (
    <Badge title="From [routing.tenants.<id>.exemplars] in the deployment config file.">
      Config file
    </Badge>
  );
}

function NodeRoute({ tenantId, route }: { tenantId: string; route: string | null | undefined }) {
  if (!route) return <span className="text-fg-subtle">A model answers</span>;
  const name = routeNode(route);
  return name ? (
    <Link
      to="/nodes/$tenantId/$nodeName"
      params={{ tenantId, nodeName: name }}
      className="font-mono text-[12px] text-accent hover:underline"
    >
      {route}
    </Link>
  ) : (
    <span className="font-mono text-[12px]">{route}</span>
  );
}

/** Creates an intent, or edits one: its exemplars, one per line. */
function IntentEditor({
  tenantId,
  intent,
  existing,
  onClose,
}: {
  tenantId: string;
  /** The intent edited; null for a new one. */
  intent: TenantIntent | null;
  existing: ReadonlySet<string>;
  onClose: () => void;
}) {
  const set = useSetIntent(tenantId);
  const drop = useDeleteIntent(tenantId);
  const [name, setName] = useState('');
  const [text, setText] = useState((intent?.exemplars ?? []).join('\n'));
  const isNew = intent === null;
  const intentName = isNew ? name.trim() : (intent.intent ?? '');
  const exemplars = parseExemplars(text);
  const nameError =
    isNew && name.trim()
      ? (intentNameError(intentName) ??
        (existing.has(intentName) ? 'This tenant already has this intent.' : null))
      : null;
  const listError = exemplarsError(exemplars);
  const busy = set.isPending || drop.isPending;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!intentName || nameError || listError || exemplars.length === 0) return;
    set.mutate({ intent: intentName, exemplars }, { onSuccess: onClose });
  };

  return (
    <form
      onSubmit={onSubmit}
      aria-label={isNew ? 'New intent' : `Intent ${intentName}`}
      className="flex flex-col gap-4 text-[13px]"
    >
      {isNew ? (
        <Field
          label="Intent"
          required
          error={nameError}
          hint="Lowercase letters, digits, dots, hyphens and underscores, as in node routes."
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              required
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="chest_pain"
              className="font-mono"
            />
          )}
        </Field>
      ) : (
        <p className="flex flex-wrap items-center gap-2">
          <SourceBadge source={intent.source} />
          <span className="text-fg-muted">
            Hands to <NodeRoute tenantId={tenantId} route={intent.node} />
          </span>
        </p>
      )}
      <Field
        label="Exemplars"
        required
        error={listError}
        hint={`One request per line, as users phrase it; a handful of varied phrasings per intent is enough to start. At most ${MAX_EXEMPLARS}. ${formatInt(exemplars.length)} now.`}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={'my chest hurts\nI have a pain in my chest when I breathe'}
          />
        )}
      </Field>
      {!isNew && intent.source === 'config' && (
        <p className="text-[12px] text-fg-muted">
          Saving sets this tenant&apos;s own exemplars over the config file&apos;s. To stop routing
          to this intent for this tenant, remove it.
        </p>
      )}
      <FormError error={set.error ?? drop.error} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!isNew && intent.source === 'api' && (
          <Button
            className="mr-auto"
            disabled={busy}
            loading={drop.isPending}
            onClick={() => drop.mutate(intentName, { onSuccess: onClose })}
            title="Drop this tenant's exemplars: the config file's, if it has this intent, apply again."
          >
            Revert to config file
          </Button>
        )}
        {!isNew && intent.source === 'config' && (
          <Button
            className="mr-auto"
            variant="danger"
            disabled={busy}
            loading={set.isPending && exemplars.length === 0}
            onClick={() =>
              set.mutate({ intent: intentName, exemplars: [] }, { onSuccess: onClose })
            }
          >
            Remove for this tenant
          </Button>
        )}
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={set.isPending}
          disabled={
            busy || !intentName || nameError != null || listError != null || !exemplars.length
          }
        >
          Save
        </Button>
      </div>
    </form>
  );
}

/**
 * The tenant's caliban/auto routing intents: the exemplars its requests are
 * classified by (nearest neighbours), where each comes from, and the node it
 * hands to (`node_routes`). Changes ship with the next config snapshot.
 */
export function IntentsPanel({ tenantId }: { tenantId: string }) {
  const intents = useQuery(intentsQuery(tenantId));
  const drop = useDeleteIntent(tenantId);
  const denied = deniedReason(usePermissions(), 'routes.write', tenantId);
  // undefined: closed; null: a new intent.
  const [editing, setEditing] = useState<TenantIntent | null | undefined>(undefined);

  if (intents.isPending) return <LoadingState rows={3} />;
  if (intents.isError) {
    return isNotFound(intents.error) ? (
      <TenantDeletedState tenantId={tenantId} />
    ) : (
      <ErrorState error={intents.error} onRetry={() => void intents.refetch()} />
    );
  }
  const list = intents.data.intents ?? [];
  const removed = intents.data.removed ?? [];
  const names = new Set([...list.map((i) => i.intent ?? ''), ...removed]);
  const full = names.size >= MAX_INTENTS;

  return (
    <Card>
      <CardHeader
        title="Routing intents"
        description="caliban/auto classifies each request by its nearest exemplars. An intent mapped to a node in the tenant's node routes runs that node; otherwise a model answers. Changes reach routers without a restart."
        actions={
          <GatedButton
            size="sm"
            icon={<IconPlus size={14} />}
            deniedReason={denied ?? (full ? `At most ${MAX_INTENTS} intents per tenant.` : null)}
            onClick={() => setEditing(null)}
          >
            New intent
          </GatedButton>
        }
      />
      {list.length === 0 ? (
        <EmptyState
          title="No intents"
          description="Without intents, caliban/auto routes on the deployment's defaults."
        />
      ) : (
        <Table label="Routing intents">
          <THead>
            <tr>
              <TH>Intent</TH>
              <TH className="text-right">Exemplars</TH>
              <TH>Source</TH>
              <TH>Hands to</TH>
            </tr>
          </THead>
          <TBody>
            {list.map((i) => (
              <TR key={i.intent}>
                <TD>
                  <button
                    type="button"
                    onClick={() => setEditing(i)}
                    className="font-mono text-[12.5px] font-medium hover:text-accent hover:underline"
                  >
                    {i.intent}
                  </button>
                </TD>
                <TD className="text-right tabular-nums">{formatInt(i.exemplars?.length ?? 0)}</TD>
                <TD>
                  <SourceBadge source={i.source} />
                </TD>
                <TD>
                  <NodeRoute tenantId={tenantId} route={i.node} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {removed.length > 0 && (
        <div className="border-t border-border px-4 py-3 text-[12.5px]">
          <p className="mb-2 text-fg-muted">
            Config-file intents removed for this tenant (its requests are not routed to them):
          </p>
          <ul className="flex flex-wrap gap-2">
            {removed.map((r) => (
              <li key={r} className="inline-flex items-center gap-1.5">
                <span className="font-mono">{r}</span>
                <GatedButton
                  size="sm"
                  deniedReason={denied}
                  loading={drop.isPending && drop.variables === r}
                  disabled={drop.isPending}
                  onClick={() => drop.mutate(r)}
                  aria-label={`Restore ${r}`}
                >
                  Restore
                </GatedButton>
              </li>
            ))}
          </ul>
          <FormError error={drop.error} />
        </div>
      )}
      <Drawer
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? editing.intent : 'New intent'}
        description={
          denied && editing ? 'Read only: your role cannot change routing intents.' : undefined
        }
      >
        {editing !== undefined &&
          (denied && editing ? (
            <ul className="flex flex-col gap-1.5 text-[13px]">
              {(editing.exemplars ?? []).map((e) => (
                <li key={e} className="rounded border border-border px-2.5 py-1.5">
                  {e}
                </li>
              ))}
            </ul>
          ) : (
            <IntentEditor
              key={editing?.intent ?? 'new'}
              tenantId={tenantId}
              intent={editing}
              existing={names}
              onClose={() => setEditing(undefined)}
            />
          ))}
      </Drawer>
    </Card>
  );
}
