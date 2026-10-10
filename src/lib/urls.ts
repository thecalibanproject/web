/**
 * Where the console sends `/api/v1/*` calls.
 *
 * Default: the same origin *and path prefix* the console was loaded from, so a
 * reverse proxy that mounts the control plane under `/caliban/` keeps working.
 * Override at build time with VITE_CALIBAN_API_BASE.
 */
export function apiBaseUrl(loc: Pick<Location, 'origin' | 'pathname'> = window.location): string {
  const override = import.meta.env.VITE_CALIBAN_API_BASE as string | undefined;
  if (override) return override.replace(/\/+$/, '');
  const dir = loc.pathname.replace(/[^/]*$/, ''); // strip a trailing "index.html"
  return `${loc.origin}${dir}`.replace(/\/+$/, '');
}

/** The data-plane (OpenAI-compatible) URL SDK users point `base_url` at. */
export function dataPlaneUrl(
  loc: Pick<Location, 'protocol' | 'hostname'> = window.location,
): string {
  return `${loc.protocol}//${loc.hostname}:8080/v1`;
}

/**
 * An in-app href to return to after signing in (`/usage?tenant=x`), or `/`.
 * Only paths inside the console: never another origin (`//host`), and never
 * the sign-in screen itself.
 */
export function safeRedirect(href: string | undefined): string {
  if (!href || !href.startsWith('/') || href.startsWith('//') || href.startsWith('/\\')) return '/';
  if (href === '/login' || href.startsWith('/login?')) return '/';
  return href;
}

/**
 * Where "Sign in with SSO" goes: the control plane's `/auth/login` (or the
 * `login_url` it advertises), asking it to come back to `redirect` in the
 * console once the identity provider has signed the user in.
 */
export function ssoLoginUrl(
  loginUrl: string | null | undefined,
  redirect: string | undefined,
  loc: Pick<Location, 'origin' | 'pathname'> = window.location,
): string {
  const path = loginUrl || '/auth/login';
  const base = /^https?:\/\//.test(path) ? path : `${apiBaseUrl(loc)}${path}`;
  // Hash routing: the console page itself, then the route after '#'.
  const returnTo = `${loc.pathname}#${safeRedirect(redirect)}`;
  return `${base}${base.includes('?') ? '&' : '?'}return_to=${encodeURIComponent(returnTo)}`;
}
