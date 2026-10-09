import type { ReactNode } from 'react';

export function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3">
      <dt className="truncate text-[12px] text-fg-muted">{label}</dt>
      <dd className="tabular text-[22px] leading-7 font-semibold tracking-tight text-fg">
        {value}
      </dd>
      {detail && <dd className="truncate text-[12px] text-fg-subtle">{detail}</dd>}
    </div>
  );
}
