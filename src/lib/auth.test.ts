import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearToken, getToken, isAuthenticated, onAuthChange, setToken } from './auth';

describe('admin token storage', () => {
  afterEach(() => clearToken());

  it('round-trips through sessionStorage, trimmed', () => {
    setToken('  secret-admin-token \n');
    expect(getToken()).toBe('secret-admin-token');
    expect(window.sessionStorage.getItem('caliban.adminToken')).toBe('secret-admin-token');
    expect(window.localStorage.getItem('caliban.adminToken')).toBeNull();
    clearToken();
    expect(isAuthenticated()).toBe(false);
  });

  it('keeps working in memory when sessionStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => setToken('t')).not.toThrow();
    expect(getToken()).toBe('t');
  });

  it('notifies listeners on sign-in and sign-out', () => {
    const listener = vi.fn();
    const off = onAuthChange(listener);
    setToken('a');
    clearToken();
    off();
    setToken('b');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
