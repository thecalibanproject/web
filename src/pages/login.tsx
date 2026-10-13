import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { authStateQuery } from '@/api/auth';
import { api, unwrap } from '@/api/client';
import { Button, buttonClassName, ErrorState, Field, FormError, Input } from '@/components/ui';
import { IconAlert, IconKey, LogoMark } from '@/components/ui/icons';
import { clearToken, setToken } from '@/lib/auth';
import { isNotFound } from '@/lib/errors';
import { safeRedirect, ssoLoginUrl } from '@/lib/urls';
import type { LoginError } from '@/router';

const route = getRouteApi('/login');

const LOGIN_ERROR_TEXT: Record<LoginError, string> = {
  login_failed:
    'Sign-in failed: the identity provider’s answer could not be verified. Try again. If it keeps failing, an administrator can find the reason in the audit log.',
  login_expired: 'That sign-in took too long or was already used. Sign in again.',
  idp_unavailable: 'The identity provider could not be reached. Try again in a moment.',
};

function Notice({ tone, children }: { tone: 'warn' | 'danger'; children: ReactNode }) {
  return (
    <p
      role="alert"
      className={
        tone === 'danger'
          ? 'flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-[12.5px] text-danger'
          : 'flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-fg'
      }
    >
      <IconAlert size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * The admin token form. The token is verified against the control plane
 * before it is kept, and stored in sessionStorage only.
 */
function TokenForm({ redirect, breakGlass }: { redirect?: string; breakGlass: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [token, setTokenValue] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Submit stays enabled (AGENTS.md, Forms): an empty token is explained, not blocked.
    if (!token.trim()) {
      setMissing(true);
      input.current?.focus();
      return;
    }
    setMissing(false);
    setBusy(true);
    setError(null);
    setToken(token);
    try {
      try {
        await unwrap(api.GET('/auth/me'));
      } catch (err) {
        // A control plane from before single sign-on: any admin endpoint works.
        if (!isNotFound(err)) throw err;
        await unwrap(api.GET('/api/v1/tenants'));
      }
      qc.clear();
      // `redirect` is an in-app href captured by the route guard (e.g. "/usage?tenant=x").
      await navigate({ href: safeRedirect(redirect), replace: true });
    } catch (err) {
      clearToken();
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={breakGlass ? 'Break-glass sign-in' : 'Sign in with the admin token'}
      className="flex flex-col gap-4"
    >
      <Field
        label="Admin token"
        required
        error={missing ? 'Enter the admin token to sign in.' : null}
        hint={
          breakGlass
            ? 'Emergency access with CALIBAN_ADMIN_TOKEN. Every use is recorded in the audit log. Kept for this browser tab only.'
            : 'The value of CALIBAN_ADMIN_TOKEN. Kept for this browser tab only.'
        }
      >
        {({ id, describedBy, invalid }) => (
          <Input
            ref={input}
            id={id}
            type="password"
            autoComplete="current-password"
            spellCheck={false}
            // Single-purpose screen: the token field is the only thing to do here.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            required
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={token}
            onChange={(e) => {
              setTokenValue(e.target.value);
              setMissing(false);
            }}
            className="font-mono"
          />
        )}
      </Field>
      <FormError error={error} />
      <Button type="submit" variant={breakGlass ? 'secondary' : 'primary'} loading={busy}>
        {breakGlass ? 'Sign in with the token' : 'Sign in'}
      </Button>
    </form>
  );
}

/**
 * Sign-in. With single sign-on configured on the control plane, the main way
 * in is the organization's identity provider; the break-glass admin token is
 * offered as a secondary option while the control plane still accepts it.
 * Without single sign-on, the admin token is the way in, as before.
 */
export function LoginPage() {
  const { redirect, error, reason } = route.useSearch();
  const auth = useQuery(authStateQuery());
  const [showToken, setShowToken] = useState(false);
  const config = auth.data?.config;
  const sso = config?.sso_enabled ?? false;

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
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-panel">
          {reason === 'expired' && (
            <Notice tone="warn">Your session has ended. Sign in again to continue.</Notice>
          )}
          {error && <Notice tone="danger">{LOGIN_ERROR_TEXT[error]}</Notice>}
          {auth.data?.error ? (
            <ErrorState
              title="Cannot check how to sign in"
              error={auth.data.error}
              onRetry={() => void auth.refetch()}
              className="m-0"
            />
          ) : null}
          {sso && config ? (
            <>
              <a
                href={ssoLoginUrl(config.login_url, redirect)}
                className={buttonClassName({ variant: 'primary' })}
              >
                Sign in with SSO
              </a>
              <p className="-mt-2 text-center text-[12px] text-fg-subtle">
                Continues at your organization’s identity provider.
              </p>
              {config.break_glass_enabled && (
                <div className="border-t border-border pt-4">
                  {showToken ? (
                    <TokenForm redirect={redirect} breakGlass />
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<IconKey size={14} />}
                      className="w-full"
                      aria-expanded={false}
                      onClick={() => setShowToken(true)}
                    >
                      Use the break-glass admin token
                    </Button>
                  )}
                </div>
              )}
            </>
          ) : (
            <TokenForm redirect={redirect} breakGlass={false} />
          )}
        </div>
        <p className="mt-4 text-center text-[12px] text-fg-subtle">
          This console runs entirely on your infrastructure. No telemetry.
        </p>
      </div>
    </main>
  );
}
