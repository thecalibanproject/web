import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';
import { clearToken, setCsrfToken, takeSessionExpired } from '@/lib/auth';
import { resetWorkspaceForTests } from '@/lib/workspace';
import { runTeardowns } from './teardowns';

// jsdom parses its default stylesheet the first time anything calls
// getComputedStyle, and every *ByRole query does (to skip hidden elements).
// Left to the first test, that one-time cost lands inside its first findBy*
// window and, on a busy machine, uses up most of the 1 s budget before the
// page's data can render. Pay it here, before any test starts waiting.
beforeAll(() => {
  window.getComputedStyle(document.body);
});

afterEach(() => {
  cleanup();
  // Routers stop listening first, so signing out below navigates nothing.
  runTeardowns();
  clearToken();
  setCsrfToken(null);
  takeSessionExpired();
  window.sessionStorage.clear();
  window.localStorage.clear();
  resetWorkspaceForTests();
});
