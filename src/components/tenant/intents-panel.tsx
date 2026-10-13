import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { usePermissions } from '@/api/auth';
import {
  intentsQuery,
  nodesQuery,
  qk,
  tenantQuery,
  useDeleteIntent,
  useSetIntent,
  useUpdateTenant,
} from '@/api/queries';
import type { TenantIntent } from '@/api/types';
import { doc } from '@/lib/docs';
import { isNotFound } from '@/lib/errors';
import { formatInt } from '@/lib/format';
import {
  exemplarsError,
  intentNameError,
  MAX_EXEMPLARS,
  MAX_INTENTS,
  parseExemplars,
  routeNode,
  withNodeRoute,
} from '@/lib/intents';
import { deniedReason } from '@/lib/permissions';
import { Toggletip } from '../help/toggletip';
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
  Select,
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

/** Who set a topic: the console or the API, or the server's config file (UX-79). */
function SourceBadge({ source }: { source: TenantIntent['source'] }) {
  return source === 'api' ? (
    <Badge tone="accent" title="Set for this workspace in the console or through the admin API.">
      Console or API
    </Badge>
  ) : (
    <Badge title="From the configuration file of the installation.">Server config</Badge>
  );
}

/** Where a topic goes: an assistant (by name), or a model. */
function SendsTo({ tenantId, route }: { tenantId: string; route: string | null | undefined }) {
  if (!route) return <span className="text-fg-muted">A model answers</span>;
  const name = routeNode(route);
  return name ? (
    <Link
      to="/nodes/$tenantId/$nodeName"
      params={{ tenantId, nodeName: name }}
      className="font-medium text-accent hover:underline"
      title={route}
    >
      {name}
    </Link>
  ) : (
    <code className="font-mono text-[12px]">{route}</code>
  );
}

/** The workspace's assistants with a live version: what a topic can be sent to. */
function useLiveAssistants(tenantId: string): string[] {
  const nodes = useQuery(nodesQuery(tenantId));
  return [...new Set((nodes.data ?? []).filter((n) => n.live).map((n) => n.name))].sort();
}

/** Creates a topic, or edits one: its example sentences and where it is sent. */
function TopicEditor({
  tenantId,
  intent,
  existing,
  canRoute,
  onClose,
}: {
  tenantId: string;
  /** The topic edited; null for a new one. */
  intent: TenantIntent | null;
  existing: ReadonlySet<string>;
  /** The user may change where the workspace's topics are sent. */
  canRoute: boolean;
  onClose: () => void;
}) {
  const set = useSetIntent(tenantId);
  const drop = useDeleteIntent(tenantId);
  const tenant = useQuery(tenantQuery(tenantId));
  const update = useUpdateTenant(tenantId);
  const qc = useQueryClient();
  const live = useLiveAssistants(tenantId);
  const [name, setName] = useState('');
  const [text, setText] = useState((intent?.exemplars ?? []).join('\n'));
  const isNew = intent === null;
  const intentName = isNew ? name.trim() : (intent.intent ?? '');
  const ownRoutes = tenant.data?.node_routes ?? null;
  const ownRoute = ownRoutes?.[intentName];
  const currentTarget = ownRoute ? routeNode(ownRoute) : null;
  const [sendsTo, setSendsTo] = useState<string>(() =>
    intent?.node ? (routeNode(intent.node) ?? '') : '',
  );
  const exemplars = parseExemplars(text);
  const nameError =
    isNew && name.trim()
      ? (intentNameError(intentName) ??
        (existing.has(intentName) ? 'This workspace already has this topic.' : null))
      : null;
  const listError = exemplarsError(exemplars);
  const busy = set.isPending || drop.isPending || update.isPending;
  const routeChanged = canRoute && (sendsTo || null) !== (currentTarget ?? null);
  const options = sendsTo && !live.includes(sendsTo) ? [...live, sendsTo] : live;

  const saveRoute = () => {
    if (!routeChanged) {
      onClose();
      return;
    }
    update.mutate(
      { node_routes: withNodeRoute(ownRoutes, intentName, sendsTo || null) },
      {
        // The topics list shows where each topic is sent.
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: qk.intents(tenantId) });
          onClose();
        },
      },
    );
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!intentName || nameError || listError || exemplars.length === 0) return;
    set.mutate({ intent: intentName, exemplars }, { onSuccess: saveRoute });
  };

  return (
    <form
      onSubmit={onSubmit}
      aria-label={isNew ? 'New topic' : `Topic ${intentName}`}
      className="flex flex-col gap-4 text-[13px]"
    >
      {isNew ? (
        <Field
          label="Topic name"
          required
          error={nameError}
          hint="Lowercase letters, digits, dots, hyphens and underscores, such as chest_pain."
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
        </p>
      )}
      <Field
        label="Example sentences"
        required
        error={listError}
        hint={`One per line, as people would write them; a handful of varied ones, in each language you serve, is enough to start. At most ${MAX_EXEMPLARS}. ${formatInt(exemplars.length)} now.`}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={text}
            dir="auto"
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={'my chest hurts\nI have a pain in my chest when I breathe'}
          />
        )}
      </Field>
      <p className="-mt-2 text-[12px]">
        <Toggletip label="example sentences" doc={doc('guides/topics', 'examples')}>
          Automatic routing compares each message with these sentences and picks the topic whose
          examples it resembles most. Also called exemplars.
        </Toggletip>{' '}
        <span className="text-fg-muted">How example sentences are used</span>
      </p>
      <Field
        label="Sends to"
        hint={
          canRoute
            ? live.length === 0
              ? 'No assistant of this workspace is live yet, so a model answers.'
              : 'Messages on this topic go to the live version of this assistant. Only assistants with a live version are listed.'
            : 'Your role cannot change where topics are sent.'
        }
      >
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={sendsTo}
            disabled={!canRoute || busy}
            onChange={(e) => setSendsTo(e.target.value)}
          >
            <option value="">A model answers</option>
            {options.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {!isNew && intent.source === 'config' && (
        <p className="text-[12px] text-fg-muted">
          Saving sets this workspace&apos;s own example sentences over the server config&apos;s. To
          stop routing to this topic in this workspace, remove it.
        </p>
      )}
      <FormError error={set.error ?? drop.error ?? update.error} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!isNew && intent.source === 'api' && (
          <Button
            className="mr-auto"
            disabled={busy}
            loading={drop.isPending}
            onClick={() => drop.mutate(intentName, { onSuccess: onClose })}
            title="Drop this workspace's example sentences: the server config's, if it has this topic, apply again."
          >
            Go back to the server config
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
            Remove from this workspace
          </Button>
        )}
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={set.isPending || update.isPending}
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
 * The workspace's topics for automatic routing: the example sentences each
 * message is compared with, where each topic comes from, and the assistant it
 * is sent to (`node_routes`). Changes reach the gateways without a restart.
 */
export function IntentsPanel({ tenantId }: { tenantId: string }) {
  const intents = useQuery(intentsQuery(tenantId));
  const drop = useDeleteIntent(tenantId);
  const perms = usePermissions();
  const denied = deniedReason(perms, 'routes.write', tenantId);
  const canRoute = perms.can('tenant.write', tenantId);
  // undefined: closed; null: a new topic.
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
  const newTopic = (
    <GatedButton
      size="sm"
      icon={<IconPlus size={14} />}
      deniedReason={denied ?? (full ? `At most ${MAX_INTENTS} topics per workspace.` : null)}
      onClick={() => setEditing(null)}
    >
      New topic
    </GatedButton>
  );

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1">
            Topics
            <Toggletip label="topics" doc={doc('concepts/how-routing-works')}>
              Automatic routing picks the topic of each message from the example sentences, then
              sends it to the topic&apos;s assistant, or lets a model answer. Also called intents.
            </Toggletip>
          </span>
        }
        description="Each message goes to the topic whose example sentences it resembles most, then to that topic's assistant; otherwise a model answers. Changes apply without a restart."
        actions={newTopic}
      />
      {list.length === 0 ? (
        <EmptyState
          title="No topics yet"
          description="Add a topic with a few example sentences to send those messages to an assistant; until then the installation's default routing applies."
          action={newTopic}
          learnMore={doc('guides/topics', 'add-a-topic')}
        />
      ) : (
        <Table label="Topics">
          <THead>
            <tr>
              <TH>Topic</TH>
              <TH className="text-right">Example sentences</TH>
              <TH>Set by</TH>
              <TH>Sends to</TH>
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
                  <SendsTo tenantId={tenantId} route={i.node} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {removed.length > 0 && (
        <div className="border-t border-border px-4 py-3 text-[12.5px]">
          <p className="mb-2 text-fg-muted">
            Server config topics removed from this workspace (its messages are not routed to them):
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
        title={editing ? editing.intent : 'New topic'}
        description={denied && editing ? 'Read only: your role cannot change topics.' : undefined}
      >
        {editing !== undefined &&
          (denied && editing ? (
            <ul className="flex flex-col gap-1.5 text-[13px]">
              {(editing.exemplars ?? []).map((e) => (
                <li key={e} dir="auto" className="rounded border border-border px-2.5 py-1.5">
                  {e}
                </li>
              ))}
            </ul>
          ) : (
            <TopicEditor
              key={editing?.intent ?? 'new'}
              tenantId={tenantId}
              intent={editing}
              existing={names}
              canRoute={canRoute}
              onClose={() => setEditing(undefined)}
            />
          ))}
      </Drawer>
    </Card>
  );
}
