import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { tenantQuery } from '@/api/queries';
import { ApiKeysPanel } from '@/components/tenant/api-keys-panel';
import { ProviderKeysPanel } from '@/components/tenant/provider-keys-panel';
import { Badge, ErrorState, LoadingState, PageHeader, Tabs } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { TenantTab } from '@/router';

const route = getRouteApi('/_app/tenants/$tenantId');

const TABS = [
  { value: 'api-keys', label: 'API keys' },
  { value: 'provider-keys', label: 'Provider keys' },
] as const satisfies ReadonlyArray<{ value: TenantTab; label: string }>;

export function TenantDetailPage() {
  const { tenantId } = route.useParams();
  const { tab = 'api-keys' } = route.useSearch();
  const navigate = route.useNavigate();
  const tenant = useQuery(tenantQuery(tenantId));

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-[12.5px] text-fg-muted">
        <Link to="/tenants" className="hover:text-fg hover:underline">
          Tenants
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{tenant.data?.name ?? tenantId}</span>
      </nav>
      {tenant.isPending ? (
        <LoadingState rows={2} />
      ) : tenant.isError ? (
        <ErrorState
          error={tenant.error}
          onRetry={() => void tenant.refetch()}
          className="m-0 mb-4"
        />
      ) : (
        <PageHeader
          title={tenant.data.name}
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-[12px]">{tenant.data.id}</span>
              {tenant.data.region && <Badge>{tenant.data.region}</Badge>}
              {tenant.data.pii_default && (
                <Badge tone="accent">PII: {tenant.data.pii_default}</Badge>
              )}
              <span>Created {formatDate(tenant.data.created_at)}</span>
            </span>
          }
        />
      )}
      <Tabs
        label="Tenant sections"
        tabs={TABS}
        value={tab}
        onChange={(t) => void navigate({ search: { tab: t }, replace: true })}
      >
        {tab === 'api-keys' ? (
          <ApiKeysPanel tenantId={tenantId} />
        ) : (
          <ProviderKeysPanel tenantId={tenantId} />
        )}
      </Tabs>
    </>
  );
}
