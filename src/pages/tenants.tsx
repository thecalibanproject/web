import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { usePermissions } from '@/api/auth';
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
import { doc } from '@/lib/docs';
import { EMPTY, formatDate } from '@/lib/format';
import { PII_MODE_LABEL, PII_MODE_OPTIONS } from '@/lib/labels';

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
      title="New workspace"
      description="A workspace keeps its own keys, data, assistants and budget: nothing crosses between workspaces."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Name" required>
          {({ id }) => (
            <Input
              id={id}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Northwind Clinic"
            />
          )}
        </Field>
        <Field
          label="Region"
          hint="Optional: where its data lives, such as eu-west-1 or on-prem-dc1."
        >
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
          label="How personal data is protected"
          hint="Names, ID numbers and phone numbers are hidden from models. You can change this later in the workspace's Privacy tab."
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={pii}
              onChange={(e) => setPii(e.target.value as Pii)}
            >
              {PII_MODE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {PII_MODE_LABEL[m]}
                  {m === 'reversible' ? ' (recommended)' : ''}
                </option>
              ))}
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
            Create workspace
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
  const canCreate = usePermissions().can('tenants.create');

  return (
    <>
      <PageHeader
        title="Workspaces"
        description="Each workspace has its own app keys, provider accounts, data, assistants and budget."
        actions={
          canCreate && (
            <Button
              variant="primary"
              icon={<IconPlus size={14} />}
              onClick={() => setCreating(true)}
            >
              New workspace
            </Button>
          )
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
          canCreate ? (
            <EmptyState
              title="No workspaces yet"
              description="A workspace holds the keys, data and assistants of one team or customer. Create one to start."
              action={
                <Button
                  variant="primary"
                  icon={<IconPlus size={14} />}
                  onClick={() => setCreating(true)}
                >
                  New workspace
                </Button>
              }
              learnMore={doc('guides/workspaces', 'create')}
            />
          ) : (
            <EmptyState
              title="No workspaces to show"
              description="Your roles do not cover any workspace yet. An owner or admin can grant you a role on one."
              learnMore={doc('guides/people-and-roles', 'roles')}
            />
          )
        ) : (
          <Table label="Workspaces">
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>ID</TH>
                <TH>Region</TH>
                <TH>Personal data</TH>
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
                    <TD>{t.region ?? <span className="text-fg-subtle">{EMPTY}</span>}</TD>
                    <TD>
                      {t.pii_default ? (
                        <Badge>{PII_MODE_LABEL[t.pii_default]}</Badge>
                      ) : (
                        <span className="text-fg-subtle">{EMPTY}</span>
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
      {canCreate && <CreateTenantDialog open={creating} onClose={() => setCreating(false)} />}
    </>
  );
}
