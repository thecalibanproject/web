import { getRouteApi } from '@tanstack/react-router';
import { CataloguePanel } from '@/components/models/catalogue-panel';
import { ServersPanel } from '@/components/models/servers-panel';
import { TermTip } from '@/components/help/toggletip';
import { PageHeader, Tabs } from '@/components/ui';
import type { ModelsTab } from '@/router';

const route = getRouteApi('/_app/models');

const TABS = [
  { value: 'servers', label: 'Model servers' },
  { value: 'catalogue', label: 'Models' },
] as const satisfies ReadonlyArray<{ value: ModelsTab; label: string }>;

export function ModelsPage() {
  const { tab = 'servers' } = route.useSearch();
  const navigate = route.useNavigate();

  return (
    <>
      <PageHeader
        title="Models"
        description={
          <>
            The servers your open models run on, and the models Caliban may send requests to. Where
            a model runs decides which data it may see. <TermTip term="trustLevel" />
          </>
        }
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
