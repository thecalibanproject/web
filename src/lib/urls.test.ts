import { describe, expect, it } from 'vitest';
import { apiBaseUrl, dataPlaneUrl, safeRedirect, ssoLoginUrl } from './urls';

describe('urls', () => {
  it('uses the serving origin and path prefix for the admin API', () => {
    expect(apiBaseUrl({ origin: 'http://cal.local:8081', pathname: '/' })).toBe(
      'http://cal.local:8081',
    );
    expect(apiBaseUrl({ origin: 'https://gw.corp', pathname: '/caliban/index.html' })).toBe(
      'https://gw.corp/caliban',
    );
  });

  it('derives the data-plane URL on port 8080', () => {
    expect(dataPlaneUrl({ protocol: 'http:', hostname: '10.0.0.5' })).toBe(
      'http://10.0.0.5:8080/v1',
    );
  });
});

describe('safeRedirect', () => {
  it('keeps in-app paths and refuses anything else', () => {
    expect(safeRedirect('/usage?tenant=acme')).toBe('/usage?tenant=acme');
    for (const bad of [undefined, '', 'https://evil.example', '//evil.example', '/\\evil', 'x']) {
      expect(safeRedirect(bad)).toBe('/');
    }
    expect(safeRedirect('/login?redirect=%2F')).toBe('/');
  });
});

describe('ssoLoginUrl', () => {
  const loc = { origin: 'https://caliban.example.internal', pathname: '/' };

  it('asks the control plane to come back to the current route', () => {
    expect(ssoLoginUrl('/auth/login', '/tenants/acme?tab=provider-keys', loc)).toBe(
      `https://caliban.example.internal/auth/login?return_to=${encodeURIComponent('/#/tenants/acme?tab=provider-keys')}`,
    );
  });

  it('keeps a reverse-proxy prefix and falls back to /auth/login', () => {
    expect(ssoLoginUrl(null, undefined, { origin: 'https://gw.corp', pathname: '/caliban/' })).toBe(
      `https://gw.corp/caliban/auth/login?return_to=${encodeURIComponent('/caliban/#/')}`,
    );
  });
});
