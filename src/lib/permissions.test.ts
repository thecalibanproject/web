import { describe, expect, it } from 'vitest';
import { meWith } from '@/test/auth';
import { displayName, permissionsOf } from './permissions';

describe('permissionsOf', () => {
  it('offers everything when the auth state is unknown or predates roles', () => {
    for (const p of [undefined, { mode: 'token' as const, me: null }]) {
      const perms = permissionsOf(p);
      expect(perms.can('tenant.delete', 'acme')).toBe(true);
      expect(perms.isOwner).toBe(true);
      expect(perms.hasNoRole).toBe(false);
    }
  });

  it('denies everything when nobody is signed in', () => {
    const perms = permissionsOf(null);
    expect(perms.canSomewhere('tenant.read')).toBe(false);
    expect(perms.tenantsWith('tenant.read')).toEqual([]);
  });

  it('keeps tenant roles to their tenant', () => {
    const perms = permissionsOf({
      mode: 'session',
      me: meWith([
        { role: 'developer', tenant_id: 'acme' },
        { role: 'billing', tenant_id: 'globex' },
      ]),
    });
    expect(perms.can('api_keys.write', 'acme')).toBe(true);
    expect(perms.can('api_keys.write', 'globex')).toBe(false);
    expect(perms.can('api_keys.write')).toBe(false);
    expect(perms.can('usage.read', 'globex')).toBe(true);
    // Tenant roles read the model catalogue, deployment-wide.
    expect(perms.can('catalog.read')).toBe(true);
    expect(perms.can('catalog.write')).toBe(false);
    expect(perms.canSomewhere('nodes.write')).toBe(true);
    expect(perms.canSomewhere('audit.read')).toBe(false);
    expect(perms.tenantsWith('api_keys.read')).toEqual(['acme']);
    expect(perms.isOwner).toBe(false);
  });

  it('applies deployment roles to every tenant', () => {
    const auditor = permissionsOf({ mode: 'session', me: meWith([{ role: 'auditor' }]) });
    expect(auditor.can('api_keys.read', 'any-tenant')).toBe(true);
    expect(auditor.can('api_keys.write', 'any-tenant')).toBe(false);
    expect(auditor.tenantsWith('usage.read')).toBe('all');
    expect(auditor.can('rbac.read')).toBe(true);
    expect(auditor.can('rbac.write')).toBe(false);
  });

  it('knows owners from admins, and users without any role', () => {
    expect(permissionsOf({ mode: 'session', me: meWith([{ role: 'owner' }]) }).isOwner).toBe(true);
    expect(permissionsOf({ mode: 'session', me: meWith([{ role: 'admin' }]) }).isOwner).toBe(false);
    expect(permissionsOf({ mode: 'session', me: meWith([]) }).hasNoRole).toBe(true);
  });
});

describe('displayName', () => {
  it('prefers the name, then the email, and calls the token what it is', () => {
    expect(displayName({ mode: 'session', me: meWith([], { name: 'Ada' }) })).toBe('Ada');
    expect(displayName({ mode: 'session', me: meWith([], { name: '' }) })).toBe(
      'ada@example.internal',
    );
    expect(
      displayName({ mode: 'token', me: meWith([{ role: 'owner' }], { method: 'break_glass' }) }),
    ).toBe('Admin token');
    expect(displayName({ mode: 'token', me: null })).toBe('Admin token');
  });
});
