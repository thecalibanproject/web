import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Dense data table. Wrap in a scroll container so wide tables never break the page. */
export function Table({
  className,
  label,
  ...rest
}: HTMLAttributes<HTMLTableElement> & { label?: string }) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        aria-label={label}
        className={cn('w-full border-collapse text-left text-[13px]', className)}
        {...rest}
      />
    </div>
  );
}

export function THead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TR({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('border-b border-border last:border-b-0 hover:bg-surface-2/60', className)}
      {...rest}
    />
  );
}

export function TH({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'sticky top-0 border-b border-border bg-surface-2 px-3 py-1.5 text-[11.5px] font-medium tracking-wide text-fg-muted uppercase whitespace-nowrap',
        className,
      )}
      {...rest}
    />
  );
}

export function TD({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-1.5 align-middle', className)} {...rest} />;
}
