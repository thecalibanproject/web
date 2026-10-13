import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { usePermissions } from '@/api/auth';
import { tenantQuery } from '@/api/queries';
import { ApiKeysPanel } from '@/components/tenant/api-keys-panel';
import { IntentsPanel } from '@/components/tenant/intents-panel';
import { DeleteTenantSection } from '@/components/tenant/delete-tenant-section';
import { NodeLimitsSection } from '@/components/tenant/node-limits-section';
import { PiiDetectorsSection } from '@/components/tenant/pii-detectors-section';
import { ProviderKeysPanel } from '@/components/tenant/provider-keys-panel';
import { RoutesCard } from '@/components/tenant/routes-card';
import { TenantDeletedState } from '@/components/tenant/tenant-deleted-state';
import { TenantSettingsSection } from '@/components/tenant/tenant-settings-section';
import { Badge, Card, ErrorState, LoadingState, PageHeader, Tabs } from '@/components/ui';
import { isNotFound } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { PII_MODE_LABEL } from '@/lib/labels';
import type { Permission } from '@/api/types';
import type { TenantTab } from '@/router';

const route = getRouteApi('/_app/tenants/$tenantId');

/**
 * One tab per area, each with its own Save (UX-27). Old deep links keep their
 * tab values (`api-keys`, `provider-keys`, `intents`).
 */
const TABS = [
  { value: 'api-keys', label: 'Apps and keys', perm: 'api_keys.read' },
  { value: 'provider-keys', label: 'Provider accounts', perm: 'provider_keys.read' },
  { value: 'intents', label: 'Topics and routing', perm: 'routes.read' },
  { value: 'privacy', label: 'Privacy', perm: 'tenant.read' },
  { value: 'limits', label: 'Limits and budget', perm: 'tenant.read' },
  { value: 'danger', label: 'Danger zone', perm: 'tenant.delete' },
] as const satisfies ReadonlyArray<{ value: TenantTab; label: string; perm: Permission }>;

export function TenantDetailPage() {
  const { tenantId } = route.useParams();
  const { tab: requested } = route.useSearch();
  const navigate = route.useNavigate();
  const tenant = useQuery(tenantQuery(tenantId));
  const perms = usePermissions();
  // Billing users, for one, see the workspace but not its keys.
  const tabs = TABS.filter((t) => perms.can(t.perm, tenantId));
  const tab = tabs.find((t) => t.value === requested)?.value ?? tabs[0]?.value;
  // A deleted (or unknown) workspace is a 404 on every workspace endpoint.
  const gone = tenant.isError && isNotFound(tenant.error);
  const readOnly = !perms.can('tenant.write', tenantId);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-[12.5px] text-fg-muted">
        <Link to="/tenants" className="hover:text-fg hover:underline">
          Workspaces
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{tenant.data?.name ?? tenantId}</span>
      </nav>
      {tenant.isPending ? (
        <LoadingState rows={2} />
      ) : gone ? (
        <Card>
          <TenantDeletedState
            tenantId={tenantId}
            action={
              <Link to="/tenants" className="text-[13px] text-accent hover:underline">
                Back to workspaces
              </Link>
            }
          />
        </Card>
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
              <span className="font-mono text-[12px]" title="Workspace id">
                {tenant.data.id}
              </span>
              {tenant.data.region && <Badge>{tenant.data.region}</Badge>}
              {tenant.data.pii_default && (
                <Badge tone="accent">
                  Personal data: {PII_MODE_LABEL[tenant.data.pii_default]}
                </Badge>
              )}
              <span>Created {formatDate(tenant.data.created_at)}</span>
            </span>
          }
        />
      )}
      {!gone && tab && (
        <Tabs
          label="Workspace sections"
          tabs={tabs}
          value={tab}
          onChange={(t) => void navigate({ search: { tab: t }, replace: true })}
        >
          {tab === 'api-keys' ? (
            <ApiKeysPanel tenantId={tenantId} />
          ) : tab === 'provider-keys' ? (
            <ProviderKeysPanel tenantId={tenantId} />
          ) : tab === 'intents' ? (
            <>
              <IntentsPanel tenantId={tenantId} />
              <RoutesCard tenantId={tenantId} />
            </>
          ) : !tenant.isSuccess ? (
            <LoadingState rows={2} />
          ) : tab === 'privacy' ? (
            <>
              <TenantSettingsSection tenant={tenant.data} readOnly={readOnly} />
              <PiiDetectorsSection tenant={tenant.data} readOnly={readOnly} />
            </>
          ) : tab === 'limits' ? (
            <NodeLimitsSection tenant={tenant.data} readOnly={readOnly} />
          ) : (
            <DeleteTenantSection
              tenant={tenant.data}
              onDeleted={() => void navigate({ to: '/tenants' })}
            />
          )}
        </Tabs>
      )}
    </>
  );
}
