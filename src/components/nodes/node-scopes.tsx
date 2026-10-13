import { Link } from '@tanstack/react-router';
import { usePermissions } from '@/api/auth';
import { EMPTY } from '@/lib/format';
import { specScopes, usesRagSearch, type RagScope } from '@/lib/rag';
import { Badge } from '../ui';

/** One `rag.<collection>:read` scope, linked to the collection for those who may read it. */
function CollectionScope({
  tenantId,
  scope,
  canRead,
}: {
  tenantId: string;
  scope: RagScope;
  canRead: boolean;
}) {
  const every = scope.collection === '*';
  const code = <code className="font-mono text-[12px]">{scope.scope}</code>;
  const what = every ? 'every document library of the workspace' : `library ${scope.collection}`;
  return (
    <li className="flex flex-wrap items-center gap-1.5">
      {canRead ? (
        <Link
          to="/rag"
          search={every ? { tenant: tenantId } : { tenant: tenantId, collection: scope.collection }}
          aria-label={`${scope.scope}: open ${what} in Knowledge`}
          className="text-accent hover:underline"
        >
          {code}
        </Link>
      ) : (
        code
      )}
      <span className="text-[12px] text-fg-subtle">
        {every
          ? 'searches every document library of the workspace'
          : `searches ${scope.collection}`}
      </span>
    </li>
  );
}

/**
 * What a node version may read: the document collections `rag_search` may
 * search (`rag.<collection>:read`, linked to the collection) and the
 * datasource scopes of the built-in query tool.
 */
export function NodeScopes({ tenantId, spec }: { tenantId: string; spec: unknown }) {
  const { rag, datasources } = specScopes(spec);
  const canRead = usePermissions().can('rag.read', tenantId);
  const searches = usesRagSearch(spec);
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
      <dt className="text-fg-muted">Document libraries</dt>
      <dd className="min-w-0">
        {rag.length === 0 ? (
          <span className="text-fg-subtle">{EMPTY}</span>
        ) : (
          <ul aria-label="Document libraries" className="flex flex-col gap-1">
            {rag.map((s) => (
              <CollectionScope key={s.scope} tenantId={tenantId} scope={s} canRead={canRead} />
            ))}
          </ul>
        )}
        {rag.length > 0 && !searches && (
          <Badge
            className="mt-1"
            title="The settings name libraries but no builtin://rag_search tool."
          >
            Document search is off
          </Badge>
        )}
      </dd>
      <dt className="text-fg-muted">Data it may look up</dt>
      <dd className="min-w-0">
        {datasources.length === 0 ? (
          <span className="text-fg-subtle">{EMPTY}</span>
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {datasources.map((s) => (
              <code key={s} className="font-mono text-[12px]">
                {s}
              </code>
            ))}
          </span>
        )}
      </dd>
    </dl>
  );
}
