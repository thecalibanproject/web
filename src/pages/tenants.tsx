import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { tenantsQuery, useCreateTenant } from '@/api/queries';
import type { TenantCreate } from '@/api/types';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import { IconChevronRight, IconPlus } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';

type Pii = NonNullable<TenantCreate['pii_default']>;

function CreateTenantDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateTenant();
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [pii, setPii] = useState<Pii>('reversible');

  const reset = () => {
    setName('');
    setRegion('');
    setPii('reversible');
    create.reset();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name: name.trim(), pii_default: pii, ...(region.trim() ? { region: region.trim() } : {}) },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      },
    );
  };

  return (
    <Drawer
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      side="center"
      title="New tenant"
      description="A tenant is an isolation boundary: keys, cache, ontology and budgets never cross it."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Name" required>
          {({ id }) => (
            <Input
              id={id}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="acme-finance"
            />
          )}
        </Field>
        <Field label="Region" hint="Optional data-residency label, e.g. eu-west-1 or on-prem-dc1.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Default PII handling"
          hint="Reversible pseudonymizes before the model and restores in the response."
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={pii}
              onChange={(e) => setPii(e.target.value as Pii)}
            >
              <option value="reversible">Reversible pseudonymization</option>
              <option value="mask">Mask (irreversible)</option>
              <option value="off">Off</option>
            </Select>
          )}
        </Field>
        <FormError error={create.error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            loading={create.isPending}
            disabled={!name.trim()}
          >
            Create tenant
          </Button>
        </div>
      </form>
    </Drawer>
  );
}

export function TenantsPage() {
  const [showDeleted, setShowDeleted] = useState(false);
  const tenants = useQuery(tenantsQuery(showDeleted));
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Each tenant has its own API keys, BYOK provider credentials, datasources and ontology."
        actions={
          <Button variant="primary" icon={<IconPlus size={14} />} onClick={() => setCreating(true)}>
            New tenant
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <Checkbox
            label="Show deleted"
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
          />
        </div>
        {tenants.isPending ? (
          <LoadingState />
        ) : tenants.isError ? (
          <ErrorState error={tenants.error} onRetry={() => void tenants.refetch()} />
        ) : tenants.data.length === 0 ? (
          <EmptyState
            title="No tenants yet"
            description="Create a tenant, then add a provider key (BYOK) and mint an API key for your apps."
            action={
              <Button
                variant="primary"
                icon={<IconPlus size={14} />}
                onClick={() => setCreating(true)}
              >
                New tenant
              </Button>
            }
          />
        ) : (
          <Table label="Tenants">
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>ID</TH>
                <TH>Region</TH>
                <TH>PII default</TH>
                <TH>Created</TH>
                {showDeleted && <TH>Status</TH>}
                <TH>
                  <span className="sr-only">Open</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {tenants.data.map((t) => {
                const deleted = t.status === 'deleted';
                return (
                  <TR key={t.id} className={cn(deleted && 'text-fg-subtle')}>
                    <TD className="font-medium">
                      {deleted ? (
                        <span className="line-through">{t.name}</span>
                      ) : (
                        <Link
                          to="/tenants/$tenantId"
                          params={{ tenantId: t.id }}
                          className="hover:text-accent hover:underline"
                        >
                          {t.name}
                        </Link>
                      )}
                    </TD>
                    <TD className="font-mono text-[12px] text-fg-muted">{t.id}</TD>
                    <TD>{t.region ?? <span className="text-fg-subtle">—</span>}</TD>
                    <TD>
                      {t.pii_default ? (
                        <Badge>{t.pii_default}</Badge>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </TD>
                    <TD className="text-fg-muted">{formatDate(t.created_at)}</TD>
                    {showDeleted && (
                      <TD>
                        {deleted ? (
                          <span className="inline-flex items-center gap-2 whitespace-nowrap">
                            <Badge tone="danger">Deleted</Badge>
                            <span className="text-fg-subtle">{formatDate(t.deleted_at)}</span>
                          </span>
                        ) : (
                          <span className="text-fg-muted">Active</span>
                        )}
                      </TD>
                    )}
                    <TD className="w-8 text-right">
                      {!deleted && (
                        <Link
                          to="/tenants/$tenantId"
                          params={{ tenantId: t.id }}
                          aria-label={`Open ${t.name}`}
                          className="inline-flex rounded p-1 text-fg-subtle hover:text-fg"
                        >
                          <IconChevronRight />
                        </Link>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      <CreateTenantDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
