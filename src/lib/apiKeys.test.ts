import { describe, expect, it } from 'vitest';
import {
  accessBody,
  accessError,
  accessOf,
  DEFAULT_KEY_ACCESS,
  describeAccess,
  initialKeyAccess,
  splitList,
} from './apiKeys';

describe('API key access', () => {
  it('sends nothing for the defaults: every published node, the nodes own scopes', () => {
    expect(accessBody(DEFAULT_KEY_ACCESS, true)).toEqual({});
  });

  it('sends the allowlist and scopes when set', () => {
    expect(
      accessBody({ nodes: 'only', names: ['triage'], scopes: ['shop.orders:read'] }, true),
    ).toEqual({ nodes: ['triage'], datasource_scopes: ['shop.orders:read'] });
    expect(accessBody({ nodes: 'none', names: [], scopes: [] }, true)).toEqual({ nodes: [] });
  });

  it('never sends nodes without nodes.run', () => {
    expect(accessBody({ nodes: 'only', names: ['triage'], scopes: [] }, false)).toEqual({});
  });

  it('checks the allowlist and the scope format', () => {
    expect(accessError({ nodes: 'only', names: [], scopes: [] })).toMatch(/at least one assistant/);
    expect(accessError({ nodes: 'all', names: [], scopes: ['shop.orders:write', 'shop'] })).toBe(
      'Write other data as <connection>.<collection>:read or rag.<library>:read, such as shop.orders:read. Not valid: shop.orders:write, shop.',
    );
    expect(accessError({ nodes: 'all', names: [], scopes: ['shop.*:read'] })).toBeNull();
    expect(accessError({ nodes: 'all', names: [], scopes: ['rag.handbook:read'] })).toBeNull();
  });

  it('reads a stored key back', () => {
    expect(accessOf({ nodes: null })).toEqual(DEFAULT_KEY_ACCESS);
    expect(accessOf({ nodes: [], datasource_scopes: ['a.b:read'] })).toEqual({
      nodes: 'none',
      names: [],
      scopes: ['a.b:read'],
    });
  });

  it('splits lists on commas and new lines', () => {
    expect(splitList('a.b:read, c.d:read\n a.b:read ,')).toEqual(['a.b:read', 'c.d:read']);
  });
});

describe('new key defaults (UX-28)', () => {
  it('starts with only the ticked assistants, or model calls only when there is none', () => {
    expect(initialKeyAccess(['triage'], true)).toEqual({ nodes: 'only', names: [], scopes: [] });
    expect(initialKeyAccess([], true).nodes).toBe('none');
    expect(initialKeyAccess(['triage'], false).nodes).toBe('none');
    expect(describeAccess({ nodes: 'only', names: ['triage'], scopes: [] }, true)).toBe(
      "This key can run triage, with each assistant's own data access.",
    );
  });
});
