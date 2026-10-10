import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { clearSession, clearToken, getToken, setCsrfToken } from '@/lib/auth';
import { browser } from '@/lib/browser';
import { permissionsOf, type Permissions, type Principal } from '@/lib/permissions';
import { api, ApiError, unwrap } from './client';
import { qk } from './queries';
import type { AuthConfig } from './types';

/**
 * What the console knows about signing in: how the control plane offers it
 * (`/auth/config`) and who is signed in (`/auth/me`).
 */
export interface AuthState {
  config: AuthConfig;
  /** Null when nobody is signed in. */
  principal: Principal | null;
  /** The control plane could not be asked (network error, 5xx). */
  error: unknown;
}

/** A control plane without `/auth/config` predates single sign-on. */
const NO_SSO: AuthConfig = { sso_enabled: false, break_glass_enabled: true, login_url: null };

const is = (e: unknown, status: number) => e instanceof ApiError && e.status === status;

/**
 * Token in this tab: token mode, as before single sign-on. Otherwise, with
 * single sign-on configured, the session cookie decides: `/auth/me` answers
 * with the user and the CSRF token, or 401 when there is no session.
 */
export async function fetchAuthState(): Promise<AuthState> {
  let config = NO_SSO;
  let configError: unknown = null;
  try {
    config = await unwrap(api.GET('/auth/config'));
  } catch (e) {
    if (!is(e, 404)) configError = e;
  }
  const token = getToken();
  if (!token && !config.sso_enabled) {
    setCsrfToken(null);
    return { config, principal: null, error: configError };
  }
  try {
    const me = await unwrap(api.GET('/auth/me'));
    if (token) return { config, principal: { mode: 'token', me }, error: null };
    setCsrfToken(me.csrf_token ?? null);
    return { config, principal: { mode: 'session', me }, error: null };
  } catch (e) {
    // No session, or the token was refused (the client already dropped it).
    if (is(e, 401)) return { config, principal: null, error: null };
    // A token, but no `/auth/me` to describe it (an older control plane) or
    // the control plane is unreachable: carry on as before roles existed.
    // Pages show their own errors, and the server decides what is allowed.
    if (token) return { config, principal: { mode: 'token', me: null }, error: null };
    return { config, principal: null, error: e };
  }
}

export const authStateQuery = () =>
  queryOptions({
    queryKey: qk.authState,
    queryFn: fetchAuthState,
    staleTime: 60_000,
    retry: false,
  });

/**
 * The sign-in state as last loaded by the route guard. Reads the cache only;
 * the app shell keeps it fresh (see `useAuthStateRefresh`).
 */
export function useAuthState(): AuthState | undefined {
  return useQuery({ ...authStateQuery(), enabled: false }).data;
}

/**
 * Keeps roles current: refetched when the tab regains focus. Not polled, so
 * an idle console does not keep its session alive past the idle timeout.
 */
export function useAuthStateRefresh() {
  useQuery({ ...authStateQuery(), refetchOnWindowFocus: true });
}

/** What the signed-in user may do (see `permissionsOf`). */
export function usePermissions(): Permissions {
  const principal = useAuthState()?.principal;
  return useMemo(() => permissionsOf(principal), [principal]);
}

/**
 * Signs out. A console session is ended on the control plane, and when the
 * identity provider has a logout endpoint the browser goes there next
 * (RP-initiated logout). A token is simply forgotten.
 */
export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const mode = useAuthState()?.principal?.mode;
  const m = useMutation({
    mutationFn: async (): Promise<string | null> => {
      if (mode !== 'session') {
        clearToken();
        return null;
      }
      try {
        const out = await unwrap(api.POST('/auth/logout'));
        return out.end_session_url ?? null;
      } catch {
        // Already expired or revoked: there is nothing left to end.
        return null;
      } finally {
        clearSession();
      }
    },
    onSuccess: (endSessionUrl) => {
      qc.clear();
      if (endSessionUrl) browser.assign(endSessionUrl);
      else void navigate({ to: '/login' });
    },
  });
  return { signOut: () => m.mutate(), pending: m.isPending };
}
