import { useState } from 'react';
import {
  applyReduceMotion,
  applyThemePref,
  getReduceMotion,
  getThemePref,
  nextThemePref,
  type ThemePref,
} from '@/lib/theme';
import { IconMonitor, IconMoon, IconSun } from '../ui/icons';

const LABEL: Record<ThemePref, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  const Icon = pref === 'light' ? IconSun : pref === 'dark' ? IconMoon : IconMonitor;
  const next = nextThemePref(pref);
  return (
    <button
      type="button"
      onClick={() => {
        applyThemePref(next);
        setPref(next);
      }}
      title={`Theme: ${LABEL[pref]} (switch to ${LABEL[next]})`}
      aria-label={`Theme: ${LABEL[pref]}. Switch to ${LABEL[next]}.`}
      className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg"
    >
      <Icon />
      {!compact && <span className="md:sr-only lg:not-sr-only">Theme: {LABEL[pref]}</span>}
    </button>
  );
}

/** Turns animations down to short fades, whatever the operating system says. */
export function MotionToggle() {
  const [reduce, setReduce] = useState(getReduceMotion);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={reduce}
      onClick={() => {
        applyReduceMotion(!reduce);
        setReduce(!reduce);
      }}
      title="Reduce motion"
      className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg"
    >
      <span
        aria-hidden="true"
        className={`inline-flex h-3.5 w-6 shrink-0 items-center rounded-full border transition-colors ${reduce ? 'border-transparent bg-accent' : 'border-border-strong bg-surface-3'}`}
      >
        <span
          className={`inline-block size-2.5 rounded-full bg-surface transition-transform ${reduce ? 'translate-x-3' : 'translate-x-0.5'}`}
        />
      </span>
      <span className="md:sr-only lg:not-sr-only">Reduce motion</span>
    </button>
  );
}
