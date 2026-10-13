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
      <dt className="text-[12px] break-words text-fg-muted">{label}</dt>
      <dd className="tabular text-[22px] leading-7 font-semibold tracking-tight text-fg">
        {value}
      </dd>
      {/* Wraps rather than truncates: the detail explains the number (a phone has two tiles a row). */}
      {detail && <dd className="text-[12px] break-words text-fg-subtle">{detail}</dd>}
    </div>
  );
}
