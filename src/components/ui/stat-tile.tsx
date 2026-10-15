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
    <div className="flex min-w-0 flex-col gap-1 rounded-sm border-y border-border bg-surface-2 px-4 py-3">
      <dt className="font-[B612] text-[10px] tracking-wider uppercase break-words text-fg-muted">
        {label}
      </dt>
      <dd className="readout text-[28px] leading-9 text-fg">{value}</dd>
      {/* Wraps rather than truncates: the detail explains the number (a phone has two tiles a row). */}
      {detail && <dd className="text-[12px] break-words text-fg-subtle">{detail}</dd>}
    </div>
  );
}
