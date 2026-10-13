import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { usePermissions } from '@/api/auth';
import {
  datasourcesQuery,
  introspectionQuery,
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
import { Advanced } from '@/components/help/advanced';
import { TermTip } from '@/components/help/toggletip';
import { TenantSelect } from '@/components/tenant-select';
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
import { doc } from '@/lib/docs';
import { DATASOURCE_LABEL } from '@/lib/labels';
import { useScopedTenant } from '@/lib/workspace';
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Connect a database">
      <Field label="Workspace" required>
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
        <Field
          label="Name"
          required
          hint="A short id, such as sales_dw: lowercase letters, digits and underscores. Assistants are given access to it by this name."
        >
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
          Connect
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
        disabled={ds.status === 'introspecting'}
        onClick={() => introspect.mutate(ds.id)}
        title="Reads a sample of the database and suggests data dictionary entries for review (also called introspection)"
        aria-label={`Scan ${ds.name}`}
      >
        Scan
      </Button>
    </span>
  );
}

const DS_TONE: Record<Datasource['status'], Tone> = {
  pending: 'neutral',
  connected: 'ok',
  ready: 'ok',
  error: 'danger',
  failed: 'danger',
  introspecting: 'info',
};

const DS_LABEL: Record<Datasource['status'], string> = {
  pending: 'Not scanned yet',
  connected: 'Connected',
  ready: 'Ready',
  error: 'Error',
  failed: 'Failed',
  introspecting: 'Scanning',
};

function StatusBadge({ status }: { status: Datasource['status'] }) {
  return (
    <Badge tone={DS_TONE[status] ?? 'neutral'} dot title={`Status: ${status}`}>
      {DS_LABEL[status] ?? status}
    </Badge>
  );
}

const JOB_TONE: Record<NonNullable<IntrospectionJob['status']>, Tone> = {
  running: 'info',
  succeeded: 'ok',
  failed: 'danger',
};

const JOB_LABEL: Record<NonNullable<IntrospectionJob['status']>, string> = {
  running: 'Scanning',
  succeeded: 'Scanned',
  failed: 'Scan failed',
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
    return <span className="text-fg-muted">Not scanned yet</span>;
  }
  return (
    <span className="flex flex-col gap-0.5 text-[12px]">
      <span className="inline-flex items-center gap-1.5">
        <Badge tone={JOB_TONE[j.status]}>{JOB_LABEL[j.status]}</Badge>
        <span className="text-fg-subtle">{formatDateTime(j.finished_at ?? j.started_at)}</span>
      </span>
      {j.status === 'failed' ? (
        <span className="max-w-72 truncate text-danger" title={j.error}>
          {j.error ?? 'Failed'}
        </span>
      ) : (
        j.status === 'succeeded' && (
          <span className="text-fg-muted">
            {formatInt(j.objects)} collections read, {formatInt(j.proposed)} entries suggested,{' '}
            {formatInt(j.skipped)} already reviewed
            {j.version != null && (
              <>
                {' in '}
                <Link
                  to="/ontology"
                  search={{ tenant: ds.tenant_id }}
                  className="text-accent hover:underline"
                >
                  the data dictionary (version {j.version})
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
  const search = route.useSearch();
  const tenant = useScopedTenant(search.tenant);
  const sources = useQuery({ ...datasourcesQuery(tenant), enabled: Boolean(tenant) });
  const [registering, setRegistering] = useState(false);
  const del = useDeleteDatasource();
  const [deleting, setDeleting] = useState<Datasource | null>(null);
  const perms = usePermissions();
  const canRegister = perms.canSomewhere('datasources.write');

  const closeDelete = () => {
    setDeleting(null);
    del.reset();
  };

  const connect = canRegister && (
    <Button variant="primary" icon={<IconPlus size={14} />} onClick={() => setRegistering(true)}>
      Connect a database
    </Button>
  );

  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-1">
            Data connections <TermTip term="dataConnection" />
          </span>
        }
        description="Read-only links to your databases. Scan one to suggest entries for the data dictionary, then review them there."
        actions={connect}
      />
      <Card>
        {!tenant || sources.isPending ? (
          <LoadingState />
        ) : sources.isError ? (
          <ErrorState error={sources.error} onRetry={() => void sources.refetch()} />
        ) : sources.data.length === 0 ? (
          <EmptyState
            title="No data connections yet"
            description="Connect a database with a read-only user: its credentials are stored encrypted and never shown again."
            action={connect}
            learnMore={doc('guides/data-connections', 'connect-mongodb')}
          />
        ) : (
          <Table label="Data connections">
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Kind</TH>
                <TH>Status</TH>
                <TH>Last scan</TH>
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
                    <StatusBadge status={ds.status} />
                  </TD>
                  <TD>
                    <IntrospectionCell ds={ds} />
                  </TD>
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
      {sources.data && sources.data.length > 0 && (
        <Advanced
          className="mt-4"
          summary="Schema change counters, for troubleshooting."
          title="Technical details"
        >
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-[12.5px]">
            {sources.data.map((ds) => (
              <div key={ds.id} className="contents">
                <dt className="font-mono">{ds.name}</dt>
                <dd className="text-fg-muted">
                  Epoch {ds.epoch ?? EMPTY} (counts schema changes seen since it was connected)
                </dd>
              </div>
            ))}
          </dl>
        </Advanced>
      )}
      <Drawer
        open={registering}
        onClose={() => setRegistering(false)}
        title="Connect a database"
        description="Use a read-only user. Caliban never writes to your database when it scans it or answers questions."
      >
        {registering && (
          <RegisterDatasourceForm defaultTenant={tenant} onDone={() => setRegistering(false)} />
        )}
      </Drawer>
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this data connection?"
        confirmLabel="Delete connection"
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
          <span className="font-medium">this workspace</span>? Its stored connection settings are
          wiped and it can no longer be scanned.
        </p>
        <p>The audit log keeps its history, and the name can be used again.</p>
      </ConfirmDialog>
    </>
  );
}
