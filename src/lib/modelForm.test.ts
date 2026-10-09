import { describe, expect, it } from 'vitest';
import {
  draftFromModel,
  emptyModelDraft,
  modelBody,
  parseList,
  validateModel,
  validateServer,
} from './modelForm';

describe('modelForm', () => {
  it('parses tenant allow-lists', () => {
    expect(parseList(' acme, globex\nacme ,, ')).toEqual(['acme', 'globex']);
    expect(parseList('')).toEqual([]);
  });

  it('validates server drafts', () => {
    const base = {
      kind: 'openai_compatible' as const,
      trustTier: 't0_sovereign' as const,
      cacheSalt: false,
      apiKey: '',
      tenants: '',
    };
    expect(
      validateServer({ ...base, id: 'qwen3-30b', baseUrl: 'http://qwen3-30b:8000/v1' }),
    ).toEqual({});
    expect(validateServer({ ...base, id: '-x', baseUrl: 'ftp://x' })).toEqual({
      id: expect.any(String),
      baseUrl: expect.any(String),
    });
  });

  it('accepts slash-namespaced model ids and round-trips a suggestion', () => {
    const d = draftFromModel({
      id: 'local/qwen3-8b',
      provider: 'qwen3-30b',
      upstream_model: 'Qwen/Qwen3-8B',
      trust_tier: 't0_sovereign',
      context_window: 32768,
    });
    expect(validateModel(d)).toEqual({});
    expect(modelBody(d)).toEqual({
      id: 'local/qwen3-8b',
      provider: 'qwen3-30b',
      upstream_model: 'Qwen/Qwen3-8B',
      kind: 'chat',
      family: null,
      capabilities: {
        tools: false,
        vision: false,
        reasoning: 'none',
        reasoning_control: 'none',
        inline_think_tags: false,
        rejects_stream_options: false,
      },
      trust_tier: 't0_sovereign',
      licence: null,
      context_window: 32768,
      price_in_per_mtok: null,
      price_out_per_mtok: null,
    });
    expect(
      validateModel({ ...emptyModelDraft(), id: 'local//x', contextWindow: '1.5' }),
    ).toMatchObject({
      id: expect.any(String),
      provider: expect.any(String),
      upstreamModel: expect.any(String),
      contextWindow: expect.any(String),
    });
  });

  it('keeps a discovered rejects_stream_options flag', () => {
    const d = draftFromModel({
      id: 'local/old-server',
      provider: 'legacy',
      upstream_model: 'old',
      trust_tier: 't0_sovereign',
      capabilities: { rejects_stream_options: true },
    });
    expect(d.capabilities.rejects_stream_options).toBe(true);
    expect(d.capabilities.tools).toBe(false);
    expect(modelBody(d).capabilities?.rejects_stream_options).toBe(true);
  });
});
