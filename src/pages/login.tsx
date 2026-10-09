import { useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { api, unwrap } from '@/api/client';
import { Button, Field, FormError, Input } from '@/components/ui';
import { LogoMark } from '@/components/ui/icons';
import { clearToken, setToken } from '@/lib/auth';

const route = getRouteApi('/login');

/**
 * Sign-in with the bootstrap admin token (CALIBAN_ADMIN_TOKEN). The token is
 * verified against an authenticated endpoint before it is kept, and stored in
 * sessionStorage only.
 */
export function LoginPage() {
  const { redirect } = route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [token, setTokenValue] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    setToken(token);
    try {
      // Any admin endpoint works as a credential check; tenants is cheap.
      await unwrap(api.GET('/api/v1/tenants'));
      qc.clear();
      // `redirect` is an in-app href captured by the route guard (e.g. "/usage?tenant=x").
      const target =
        redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/';
      await navigate({ href: target, replace: true });
    } catch (err) {
      clearToken();
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <LogoMark size={28} />
          <div>
            <h1 className="text-[16px] font-semibold tracking-tight">Caliban console</h1>
            <p className="text-[12.5px] text-fg-muted">Sign in to the control plane</p>
          </div>
        </div>
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-panel"
        >
          <Field
            label="Admin token"
            required
            hint="The value of CALIBAN_ADMIN_TOKEN. Kept for this browser tab only."
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                type="password"
                autoComplete="current-password"
                spellCheck={false}
                // Single-purpose screen: the token field is the only thing to do here.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                required
                aria-describedby={describedBy}
                value={token}
                onChange={(e) => setTokenValue(e.target.value)}
                className="font-mono"
              />
            )}
          </Field>
          <FormError error={error} />
          <Button type="submit" variant="primary" loading={busy} disabled={!token.trim()}>
            Sign in
          </Button>
        </form>
        <p className="mt-4 text-center text-[12px] text-fg-subtle">
          This console runs entirely on your infrastructure. No telemetry.
        </p>
      </div>
    </main>
  );
}
