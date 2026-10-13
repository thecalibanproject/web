import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabDef<T extends string> {
  value: T;
  label: ReactNode;
}

/**
 * WAI-ARIA tabs (automatic activation). Arrow keys / Home / End move between
 * tabs; only the active tab is in the tab order.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  children,
}: {
  tabs: ReadonlyArray<TabDef<T>>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  children: ReactNode;
}) {
  const base = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(
    0,
    tabs.findIndex((t) => t.value === value),
  );

  const focusAt = (i: number) => {
    const n = tabs.length;
    const next = ((i % n) + n) % n;
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') focusAt(index + 1);
    else if (e.key === 'ArrowLeft') focusAt(index - 1);
    else if (e.key === 'Home') focusAt(0);
    else if (e.key === 'End') focusAt(tabs.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex overflow-x-auto border-b border-border"
      >
        {tabs.map((t, i) => {
          const selected = t.value === value;
          return (
            <button
              key={t.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.value}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.value)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-[13px] whitespace-nowrap font-medium transition-colors',
                selected
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${value}`}
        tabIndex={0}
        className="pt-4 focus-visible:outline-none"
      >
        {children}
      </div>
    </div>
  );
}
