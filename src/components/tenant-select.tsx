import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '@/api/auth';
import { tenantsQuery } from '@/api/queries';
import type { Permission } from '@/api/types';
import { Select } from './ui';

/**
 * Tenant picker backed by GET /api/v1/tenants. `allowAll` adds an
 * "All tenants" option (value ""), for list filters. `permission` keeps only
 * the tenants the signed-in user holds it on, for forms that create something.
 */
export function TenantSelect({
  id,
  value,
  onChange,
  allowAll = false,
  required = false,
  className,
  permission,
  'aria-describedby': describedBy,
}: {
  id?: string;
  value: string | undefined;
  onChange: (tenantId: string | undefined) => void;
  allowAll?: boolean;
  required?: boolean;
  className?: string;
  permission?: Permission;
  'aria-describedby'?: string;
}) {
  const { data, isPending, isError } = useQuery(tenantsQuery());
  const perms = usePermissions();
  const options = permission ? data?.filter((t) => perms.can(permission, t.id)) : data;
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
      {options?.map((t) => (
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
