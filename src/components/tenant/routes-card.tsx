import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { usePermissions } from '@/api/auth';
import { modelsQuery, routesQuery, useSetRoutes } from '@/api/queries';
import { doc } from '@/lib/docs';
import { isNotFound } from '@/lib/errors';
import { DEFAULT_ROUTE, withDefaultModel } from '@/lib/intents';
import { deniedReason } from '@/lib/permissions';
import { Toggletip } from '../help/toggletip';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  GatedButton,
  LoadingState,
  Select,
} from '../ui';

/**
 * "Which model answers" (UX-20): the model a message goes to when no
 * assistant takes its topic, from the workspace's routes
 * (`GET/PUT .../routes`). The default route is editable here; routes for a
 * single topic are listed.
 */
export function RoutesCard({ tenantId }: { tenantId: string }) {
  const routes = useQuery(routesQuery(tenantId));
  const models = useQuery(modelsQuery());
  const save = useSetRoutes(tenantId);
  const denied = deniedReason(usePermissions(), 'routes.write', tenantId);
  const chat = (models.data ?? []).filter((m) => m.kind === 'chat').map((m) => m.id);
  const list = routes.data ?? [];
  const current = list.find((r) => r.intent === DEFAULT_ROUTE)?.models[0];
  // Prefilled with the only chat model when nothing is set yet.
  const [picked, setPicked] = useState<string | null>(null);
  const value = picked ?? current ?? (chat.length === 1 ? chat[0]! : '');
  const [saved, setSaved] = useState(false);
  const others = list.filter((r) => r.intent !== DEFAULT_ROUTE);
  const options = value && !chat.includes(value) ? [value, ...chat] : chat;

  return (
    <Card className="mt-4">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1">
            Which model answers
            <Toggletip label="which model answers" doc={doc('concepts/how-routing-works')}>
              Messages whose topic has no assistant go to this model. Also called the default route.
            </Toggletip>
          </span>
        }
        description="The model that answers messages no assistant takes."
      />
      <div className="flex flex-col gap-3 p-4 text-[13px]">
        {routes.isPending ? (
          <LoadingState rows={2} />
        ) : routes.isError && !isNotFound(routes.error) ? (
          <ErrorState error={routes.error} onRetry={() => void routes.refetch()} className="m-0" />
        ) : chat.length === 0 && !current ? (
          <EmptyState
            className="py-4"
            title="No chat model yet"
            description="Add a chat model first; then choose here which one answers this workspace's messages."
            learnMore={doc('guides/models', 'add-a-model')}
          />
        ) : (
          <form
            aria-label="Which model answers"
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!value || denied) return;
              save.mutate(withDefaultModel(list, value), {
                onSuccess: () => {
                  setPicked(null);
                  setSaved(true);
                },
              });
            }}
          >
            <Field
              label="Default model"
              hint={
                current ? undefined : 'Not set yet: messages fall back to the installation default.'
              }
              className="min-w-64"
            >
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={value}
                  disabled={Boolean(denied) || save.isPending}
                  onChange={(e) => {
                    setPicked(e.target.value);
                    setSaved(false);
                    save.reset();
                  }}
                >
                  {!value && <option value="">Choose a model…</option>}
                  {options.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <GatedButton
              type="submit"
              variant="primary"
              deniedReason={denied}
              loading={save.isPending}
              disabled={!value || value === current}
            >
              Save
            </GatedButton>
            <p role="status" className="text-[12.5px] text-fg-muted">
              {saved ? 'Default model saved.' : ''}
            </p>
          </form>
        )}
        <FormError error={save.error} />
        {others.length > 0 && (
          <div>
            <p className="mb-1 text-[12.5px] font-medium">Models for single topics</p>
            <ul className="flex flex-col gap-0.5 text-[12.5px]">
              {others.map((r) => (
                <li key={r.intent}>
                  <span className="font-mono">{r.intent}</span>
                  <span className="text-fg-muted">: {r.models.join(', then ')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
