/**
 * Storage access that never throws. Browsers throw on access to Web Storage in
 * some private modes, sandboxed iframes, or when site data is blocked.
 */
type Area = 'session' | 'local';

function area(which: Area): Storage | null {
  try {
    return which === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export function readStorage(which: Area, key: string): string | null {
  try {
    return area(which)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(which: Area, key: string, value: string | null): boolean {
  try {
    const s = area(which);
    if (!s) return false;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
