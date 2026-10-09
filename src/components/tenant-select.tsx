import { useQuery } from '@tanstack/react-query';
import { tenantsQuery } from '@/api/queries';
import { Select } from './ui';

/**
 * Tenant picker backed by GET /api/v1/tenants. `allowAll` adds an
 * "All tenants" option (value ""), for list filters.
 */
export function TenantSelect({
  id,
  value,
  onChange,
  allowAll = false,
  required = false,
  className,
  'aria-describedby': describedBy,
}: {
  id?: string;
  value: string | undefined;
  onChange: (tenantId: string | undefined) => void;
  allowAll?: boolean;
  required?: boolean;
  className?: string;
  'aria-describedby'?: string;
}) {
  const { data, isPending, isError } = useQuery(tenantsQuery());
  return (
    <Select
      id={id}
      className={className}
      value={value ?? ''}
      required={required}
      aria-describedby={describedBy}
      disabled={isPending || isError}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      {allowAll ? (
        <option value="">All tenants</option>
      ) : (
        <option value="" disabled>
          {isPending ? 'Loading tenants…' : isError ? 'Could not load tenants' : 'Select a tenant…'}
        </option>
      )}
      {data?.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </Select>
  );
}

/** Labelled tenant filter used in page toolbars. */
export function TenantFilter({
  value,
  onChange,
  allowAll = true,
}: {
  value: string | undefined;
  onChange: (tenantId: string | undefined) => void;
  allowAll?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
      Tenant
      <TenantSelect value={value} onChange={onChange} allowAll={allowAll} className="w-52" />
    </label>
  );
}
