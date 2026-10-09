import { getRouteApi } from '@tanstack/react-router';
import { CataloguePanel } from '@/components/models/catalogue-panel';
import { ServersPanel } from '@/components/models/servers-panel';
import { PageHeader, Tabs } from '@/components/ui';
import type { ModelsTab } from '@/router';

const route = getRouteApi('/_app/models');

const TABS = [
  { value: 'catalogue', label: 'Catalogue' },
  { value: 'servers', label: 'Model servers' },
] as const satisfies ReadonlyArray<{ value: ModelsTab; label: string }>;

export function ModelsPage() {
  const { tab = 'catalogue' } = route.useSearch();
  const navigate = route.useNavigate();

  return (
    <>
      <PageHeader
        title="Models"
        description="The model registry the router chooses from, and the shared on-prem servers that serve open models. Trust tier decides which requests a model may see."
      />
      <Tabs
        label="Model sections"
        tabs={TABS}
        value={tab}
        onChange={(t) => void navigate({ search: { tab: t }, replace: true })}
      >
        {tab === 'catalogue' ? <CataloguePanel /> : <ServersPanel />}
      </Tabs>
    </>
  );
}
