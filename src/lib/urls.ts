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
