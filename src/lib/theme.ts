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

const MOTION_KEY = 'caliban.motion';

/** The manual "reduce motion" switch (research note 10, risk 7): on top of the OS setting. */
export function getReduceMotion(): boolean {
  return readStorage('local', MOTION_KEY) === 'reduce';
}

export function applyReduceMotion(reduce: boolean): void {
  const root = document.documentElement;
  if (reduce) root.setAttribute('data-motion', 'reduce');
  else root.removeAttribute('data-motion');
  writeStorage('local', MOTION_KEY, reduce ? 'reduce' : null);
}
