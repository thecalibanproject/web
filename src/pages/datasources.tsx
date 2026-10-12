import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useMemo, useState, type FormEvent } from 'react';
import { usePermissions } from '@/api/auth';
import {
  datasourcesQuery,
  introspectionQuery,
  tenantsQuery,
  useCreateDatasource,
  useDeleteDatasource,
  useIntrospectDatasource,
} from '@/api/queries';
import {
  DATASOURCE_KINDS,
  type Datasource,
  type DatasourceKind,
  type IntrospectionJob,
} from '@/api/types';
import { DatasourceStatusBadge, type DatasourceStatus } from '@/components/badges';
import { TenantFilter, TenantSelect } from '@/components/tenant-select';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
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
  Textarea,
  TR,
  type Tone,
} from '@/components/ui';
import { IconPlus, IconRefresh, IconTrash } from '@/components/ui/icons';
import {
  buildConnection,
  CONNECTION_FIELDS,
  initialConnection,
  type ConnectionField,
} from '@/lib/datasourceFields';
import { DATASOURCE_LABEL } from '@/lib/labels';
import { errorMessage } from '@/lib/errors';
import { EMPTY, formatDateTime, formatInt } from '@/lib/format';

const route = getRouteApi('/_app/datasources');

function ConnectionInput({
  field,
  value,
  onChange,
}: {
  field: ConnectionField;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={field.label} required={field.required} hint={field.hint}>
      {({ id, describedBy }) => {
        const common = {
          id,
          required: field.required,
          'aria-describedby': describedBy,
          value,
          placeholder: field.placeholder,
        };
        switch (field.type) {
          case 'select':
            return (
              <Select {...common} onChange={(e) => onChange(e.target.value)}>
                {field.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            );
          case 'textarea':
            return (
              <Textarea
                {...common}
                spellCheck={false}
                className="font-mono text-[12px]"
                onChange={(e) => onChange(e.target.value)}
              />
            );
          case 'secret':
            return (
              <Input
                {...common}
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                onChange={(e) => onChange(e.target.value)}
              />
            );
          case 'number':
            return (
              <Input {...common} inputMode="numeric" onChange={(e) => onChange(e.target.value)} />
            );
          default:
            return (
              <Input {...common} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
            );
        }
      }}
    </Field>
  );
}

export function RegisterDatasourceForm({
  defaultTenant,
  onDone,
}: {
  defaultTenant: string | undefined;
  onDone: () => void;
}) {
  const create = useCreateDatasource();
  const [tenantId, setTenantId] = useState(defaultTenant);
  const [kind, setKind] = useState<DatasourceKind>('mongodb');
  const [name, setName] = useState('');
  const [conn, setConn] = useState<Record<string, string>>(() => initialConnection('mongodb'));

  const onKind = (k: DatasourceKind) => {
    setKind(k);
    setConn(initialConnection(k));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    create.mutate(
      { tenant_id: tenantId, kind, name: name.trim(), connection: buildConnection(kind, conn) },
      {
        // Connection secrets are write-only; clear them from memory either way.
        onSettled: () => setConn(initialConnection(kind)),
        onSuccess: onDone,
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Register datasource">
      <Field label="Tenant" required>
        {({ id }) => (
          <TenantSelect
            id={id}
            value={tenantId}
            onChange={setTenantId}
            permission="datasources.write"
            required
          />
        )}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Kind" required>
          {({ id }) => (
            <Select id={id} value={kind} onChange={(e) => onKind(e.target.value as DatasourceKind)}>
              {DATASOURCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DATASOURCE_LABEL[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Name" required hint="Lowercase id used in node scopes, e.g. sales_dw.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              required
              aria-describedby={describedBy}
              pattern="[a-z0-9_]+"
              title="Lowercase letters, digits and underscores"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="sales_dw"
              className="font-mono"
            />
          )}
        </Field>
      </div>
      <fieldset className="flex flex-col gap-4 rounded-md border border-border p-3.5">
        <legend className="px-1 text-[12px] font-medium text-fg-muted">
          {DATASOURCE_LABEL[kind]} connection
        </legend>
        {CONNECTION_FIELDS[kind].map((f) => (
          <ConnectionInput
            key={`${kind}.${f.key}`}
            field={f}
            value={conn[f.key] ?? ''}
            onChange={(v) => setConn((c) => ({ ...c, [f.key]: v }))}
          />
        ))}
      </fieldset>
      <FormError error={create.error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button
          type="submit"
          variant="primary"
          loading={create.isPending}
          disabled={!tenantId || !name.trim()}
        >
          Register datasource
        </Button>
      </div>
    </form>
  );
}

function IntrospectButton({ ds }: { ds: Datasource }) {
  const introspect = useIntrospectDatasource();
  return (
    <span className="inline-flex items-center gap-2">
      {introspect.isError && (
        <span className="max-w-60 truncate text-[12px] text-danger" role="alert">
          {errorMessage(introspect.error)}
        </span>
      )}
      <Button
        size="sm"
        icon={<IconRefresh size={14} />}
        loading={introspect.isPending}
        disabled={(ds.status as DatasourceStatus) === 'introspecting'}
        onClick={() => introspect.mutate(ds.id)}
        title="Sample the source and propose ontology elements for review"
        aria-label={`Introspect ${ds.name}`}
      >
        Introspect
      </Button>
    </span>
  );
}

const JOB_TONE: Record<NonNullable<IntrospectionJob['status']>, Tone> = {
  running: 'info',
  succeeded: 'ok',
  failed: 'danger',
};

/**
 * The newest introspection job: what it found and proposed, the ontology
 * version it wrote, or why it failed. Re-read while it runs.
 */
function IntrospectionCell({ ds }: { ds: Datasource }) {
  const job = useQuery(introspectionQuery(ds.id));
  if (job.isPending) return <span className="text-fg-subtle">{EMPTY}</span>;
  if (job.isError) {
    return (
      <span className="text-[12px] text-danger" title={errorMessage(job.error)}>
        Could not load
      </span>
    );
  }
  const j = job.data;
  if (!j?.status) {
    return (
      <span
        className="text-fg-subtle"
        title="No introspection job on this control plane. Jobs are kept by the replica that ran them; the status column is stored for all."
      >
        {EMPTY}
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-0.5 text-[12px]">
      <span className="inline-flex items-center gap-1.5">
        <Badge tone={JOB_TONE[j.status]}>{j.status}</Badge>
        <span className="text-fg-subtle">{formatDateTime(j.finished_at ?? j.started_at)}</span>
      </span>
      {j.status === 'failed' ? (
        <span className="max-w-72 truncate text-danger" title={j.error}>
          {j.error ?? 'Failed'}
        </span>
      ) : (
        j.status === 'succeeded' && (
          <span className="text-fg-muted">
            {formatInt(j.objects)} collections, {formatInt(j.proposed)} proposed,{' '}
            {formatInt(j.skipped)} skipped
            {j.version != null && (
              <>
                {' in '}
                <Link
                  to="/ontology"
                  search={{ tenant: ds.tenant_id }}
                  className="text-accent hover:underline"
                >
                  version {j.version}
                </Link>
              </>
            )}
          </span>
        )
      )}
    </span>
  );
}

export function DatasourcesPage() {
  const { tenant } = route.useSearch();
  const navigate = route.useNavigate();
  const sources = useQuery(datasourcesQuery(tenant));
  const tenants = useQuery(tenantsQuery());
  const [registering, setRegistering] = useState(false);
  const del = useDeleteDatasource();
  const [deleting, setDeleting] = useState<Datasource | null>(null);
  const perms = usePermissions();
  const canRegister = perms.canSomewhere('datasources.write');
  const names = useMemo(
    () => new Map((tenants.data ?? []).map((t) => [t.id, t.name])),
    [tenants.data],
  );

  const closeDelete = () => {
    setDeleting(null);
    del.reset();
  };

  return (
    <>
      <PageHeader
        title="Datasources"
        description="Connect a source once. Introspection proposes ontology elements you approve in the Ontology studio."
        actions={
          canRegister && (
            <Button
              variant="primary"
              icon={<IconPlus size={14} />}
              onClick={() => setRegistering(true)}
            >
              Register datasource
            </Button>
          )
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <TenantFilter value={tenant} onChange={(t) => void navigate({ search: { tenant: t } })} />
        </div>
        {sources.isPending ? (
          <LoadingState />
        ) : sources.isError ? (
          <ErrorState error={sources.error} onRetry={() => void sources.refetch()} />
        ) : sources.data.length === 0 ? (
          <EmptyState
            title="No datasources"
            description="Register a MongoDB deployment to get started. Credentials are encrypted at rest like BYOK secrets."
            action={
              canRegister && (
                <Button
                  variant="primary"
                  icon={<IconPlus size={14} />}
                  onClick={() => setRegistering(true)}
                >
                  Register datasource
                </Button>
              )
            }
          />
        ) : (
          <Table label="Datasources">
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Kind</TH>
                <TH>Tenant</TH>
                <TH>Status</TH>
                <TH>Introspection</TH>
                <TH className="text-right">Epoch</TH>
                <TH>
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {sources.data.map((ds) => (
                <TR key={ds.id}>
                  <TD className="font-mono text-[12.5px] font-medium">{ds.name}</TD>
                  <TD>{DATASOURCE_LABEL[ds.kind]}</TD>
                  <TD>
                    <Link
                      to="/ontology"
                      search={{ tenant: ds.tenant_id }}
                      className="hover:text-accent hover:underline"
                      title="Open this tenant's ontology"
                    >
                      {names.get(ds.tenant_id) ?? ds.tenant_id}
                    </Link>
                  </TD>
                  <TD>
                    <DatasourceStatusBadge status={ds.status} />
                  </TD>
                  <TD>
                    <IntrospectionCell ds={ds} />
                  </TD>
                  <TD className="text-right text-fg-muted">{ds.epoch ?? EMPTY}</TD>
                  <TD className="text-right whitespace-nowrap">
                    {perms.can('datasources.write', ds.tenant_id) && (
                      <span className="inline-flex items-center gap-1.5">
                        <IntrospectButton ds={ds} />
                        <Button
                          size="sm"
                          variant="danger"
                          icon={<IconTrash size={14} />}
                          aria-label={`Delete ${ds.name}`}
                          onClick={() => setDeleting(ds)}
                        >
                          Delete
                        </Button>
                      </span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Drawer
        open={registering}
        onClose={() => setRegistering(false)}
        title="Register datasource"
        description="Read-only credentials are recommended. Caliban never writes to your sources during introspection."
      >
        {registering && (
          <RegisterDatasourceForm defaultTenant={tenant} onDone={() => setRegistering(false)} />
        )}
      </Drawer>
      <ConfirmDialog
        open={deleting !== null}
        title="Delete datasource?"
        confirmLabel="Delete datasource"
        loading={del.isPending}
        error={del.error}
        onCancel={closeDelete}
        onConfirm={() => {
          // A 404 (already deleted) resolves too; the list refreshes either way.
          if (deleting) {
            del.mutate(
              { tenantId: deleting.tenant_id, datasourceId: deleting.id },
              { onSuccess: closeDelete },
            );
          }
        }}
      >
        <p>
          Delete <code className="font-mono font-medium">{deleting?.name}</code> from{' '}
          <span className="font-medium">
            {deleting ? (names.get(deleting.tenant_id) ?? deleting.tenant_id) : ''}
          </span>
          ? Its stored connection settings are wiped and it can no longer be introspected.
        </p>
        <p>Audit history is kept, and the name can be used again for a new datasource.</p>
      </ConfirmDialog>
    </>
  );
}
