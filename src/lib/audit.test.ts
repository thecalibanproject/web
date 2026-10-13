import { describe, expect, it } from 'vitest';
import type { AuditEntry } from '@/api/types';
import { actionLabel, actorLabel, chainLinks, shortHash, summarizeAudit } from './audit';

const s = (action: string, detail: Record<string, unknown>) => summarizeAudit({ action, detail });

function entry(seq: number, hash: string, prev: string | null): AuditEntry {
  return {
    seq,
    ts: '2026-10-09T10:00:00Z',
    actor: 'admin',
    action: 'tenant.create',
    detail: {},
    hash,
    prev_hash: prev,
  };
}

describe('summarizeAudit', () => {
  it('lists only the tenant settings that changed', () => {
    expect(
      s('tenant.update', {
        pii_default: { from: 'reversible', to: 'mask' },
        pii_surrogate_scope: { from: 'tenant', to: 'tenant' },
        semantic_cache: { from: 'off', to: 'on' },
      }),
    ).toBe(
      'personal data Hide from the model, restore in the answer → Hide everywhere, reuse similar answers off → on',
    );
    expect(s('tenant.update', { semantic_cache: { from: 'on', to: 'on' } })).toBe(
      'No setting changed',
    );
  });

  it('counts what a tenant delete cascaded to', () => {
    expect(
      s('tenant.delete', {
        api_keys_revoked: ['k1', 'k2'],
        provider_keys_destroyed: ['p1'],
        routes_removed: [],
        datasources_deleted: ['ds1'],
        nodes_deleted: [],
      }),
    ).toBe('2 API keys revoked, 1 provider key destroyed, 1 datasource deleted');
    expect(s('tenant.delete', { api_keys_revoked: [] })).toBe('Nothing else to remove');
  });

  it('names keys by name and prefix, never more', () => {
    expect(s('api_key.revoke', { name: 'ci', prefix: 'cal_abcd' })).toBe(
      'Revoked "ci" (cal_abcd…)',
    );
    expect(s('api_key.create', { name: null, prefix: 'cal_abcd' })).toBe('Minted cal_abcd…');
    expect(
      s('provider_key.create', {
        kind: 'openai',
        base_url: null,
        trust_tier: 't3_public',
        last4: 'wxyz',
      }),
    ).toBe('OpenAI, Public provider, key ending wxyz');
  });

  it('summarizes the other actions the control plane records', () => {
    expect(
      s('tenant.create', {
        name: 'Acme',
        pii_default: 'reversible',
        pii_surrogate_scope: 'tenant',
        semantic_cache: 'off',
      }),
    ).toBe(
      'Created "Acme": personal data Hide from the model, restore in the answer, placeholder consistency Same placeholder across the workspace, reuse similar answers off',
    );
    expect(
      s('routes.set', {
        routes: [
          { intent: 'sql', models: ['local/qwen3-8b', 'gpt-4o'] },
          { intent: 'chitchat', models: ['local/qwen3-4b'] },
        ],
      }),
    ).toBe('2 routes: sql → local/qwen3-8b, gpt-4o; chitchat → local/qwen3-4b');
    expect(s('datasource.delete', { kind: 'postgres', name: 'sales_dw' })).toBe(
      'PostgreSQL "sales_dw"',
    );
    expect(s('node.delete', { name: 'invoice-triage', version: 2 })).toBe('"invoice-triage" v2');
    expect(s('store.seed', { source: 'config file', tenants: 1, models: 3, providers: 0 })).toBe(
      'Seeded from config file: 1 tenant, 3 models, 0 providers',
    );
    expect(s('model.delete', {})).toBe('');
  });

  it('falls back to key: value pairs for actions it does not know', () => {
    expect(s('budget.set', { usd: 10, hard: true, tags: ['a', 'b'] })).toBe(
      'usd: 10, hard: true, tags: 2 items',
    );
  });
});

describe('chainLinks', () => {
  it('links each entry to the one before it and leaves the oldest unchecked', () => {
    const links = chainLinks([entry(12, 'c', 'b'), entry(11, 'b', 'a'), entry(10, 'a', 'z')]);
    expect(Object.fromEntries(links)).toEqual({ 12: 'linked', 11: 'linked', 10: 'unchecked' });
  });

  it('flags a prev_hash that does not match and a missing entry', () => {
    expect(chainLinks([entry(3, 'c', 'x'), entry(2, 'b', 'a')]).get(3)).toBe('broken');
    expect(chainLinks([entry(4, 'd', 'c'), entry(2, 'b', 'a')]).get(4)).toBe('broken');
  });

  it('checks the genesis entry has no prev_hash', () => {
    expect(chainLinks([entry(1, 'a', null)]).get(1)).toBe('linked');
    expect(chainLinks([entry(1, 'a', 'z')]).get(1)).toBe('broken');
  });
});

describe('shortHash', () => {
  it('keeps the first 12 hex characters', () => {
    expect(shortHash('0123456789abcdef0123')).toBe('0123456789ab…');
    expect(shortHash(null)).toBe('');
  });
});

describe('actionLabel and actorLabel', () => {
  it('names actions in plain words and keeps unknown ids', () => {
    expect(actionLabel('node.eval.finish')).toBe('Tests finished');
    expect(actionLabel('tenant.intent.set')).toBe('Topic changed');
    expect(actionLabel('node.write.approve')).toBe('Approved an action');
    expect(actionLabel('node.golden_set.capture')).toBe('Saved a conversation as a test');
    expect(actionLabel('something.new')).toBe('something.new');
  });

  it('says the shared admin token acted, not a person', () => {
    expect(actorLabel('break_glass')).toBe('Shared admin token (emergency access)');
    expect(actorLabel('eval:eval_01:case')).toBe('A test run');
    expect(actorLabel('ada@example.internal')).toBe('ada@example.internal');
  });
});
