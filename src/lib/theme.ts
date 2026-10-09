import { readStorage, writeStorage } from './storage';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'caliban.theme';

export function getThemePref(): ThemePref {
  const v = readStorage('local', KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

/** Applies a theme preference to <html data-theme> and persists it. */
export function applyThemePref(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  writeStorage('local', KEY, pref === 'system' ? null : pref);
}

export function nextThemePref(pref: ThemePref): ThemePref {
  return pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system';
}
