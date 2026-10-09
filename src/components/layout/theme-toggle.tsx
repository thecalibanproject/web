import { useState } from 'react';
import { applyThemePref, getThemePref, nextThemePref, type ThemePref } from '@/lib/theme';
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
