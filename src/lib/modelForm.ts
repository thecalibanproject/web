import type { ModelCapabilities, ModelCreate, SharedProviderCreate } from '@/api/types';

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Ids are referenced from routing policy and caliban.toml, so keep them tame. */
export const PROVIDER_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
/** Model ids may be namespaced with '/', e.g. local/qwen3-8b. */
export const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*(\/[A-Za-z0-9][A-Za-z0-9._:-]*)*$/;

export const DEFAULT_CAPABILITIES: Required<ModelCapabilities> = {
  tools: false,
  vision: false,
  reasoning: 'none',
  reasoning_control: 'none',
  inline_think_tags: false,
};

export function withDefaultCapabilities(c: ModelCapabilities | undefined) {
  return { ...DEFAULT_CAPABILITIES, ...c };
}

/** Splits a comma / whitespace separated list, dropping blanks and duplicates. */
export function parseList(raw: string): string[] {
  return [...new Set(raw.split(/[\s,]+/).filter(Boolean))];
}

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// ───────────── Shared model server ─────────────

export interface ServerDraft {
  id: string;
  kind: SharedProviderCreate['kind'];
  baseUrl: string;
  trustTier: SharedProviderCreate['trust_tier'];
  cacheSalt: boolean;
  apiKey: string;
  tenants: string;
}

export type ServerField = 'id' | 'baseUrl';

export function validateServer(d: ServerDraft): FieldErrors<ServerField> {
  const errors: FieldErrors<ServerField> = {};
  const id = d.id.trim();
  if (!id) errors.id = 'Enter an id, for example qwen3-30b.';
  else if (!PROVIDER_ID_RE.test(id))
    errors.id = 'Use lowercase letters, digits, hyphens and underscores.';
  const url = d.baseUrl.trim();
  if (!url) errors.baseUrl = 'Enter the server’s OpenAI-compatible base URL.';
  else if (!isHttpUrl(url)) errors.baseUrl = 'Enter a full http:// or https:// URL.';
  return errors;
}

export function serverBody(d: ServerDraft): SharedProviderCreate {
  const tenants = parseList(d.tenants);
  return {
    id: d.id.trim(),
    kind: d.kind,
    base_url: d.baseUrl.trim().replace(/\/+$/, ''),
    trust_tier: d.trustTier,
    cache_salt: d.cacheSalt,
    ...(d.apiKey ? { api_key: d.apiKey } : {}),
    ...(tenants.length ? { tenants } : {}),
  };
}

// ───────────── Catalogue model ─────────────

export interface ModelDraft {
  id: string;
  provider: string;
  upstreamModel: string;
  kind: NonNullable<ModelCreate['kind']>;
  family: string;
  capabilities: Required<ModelCapabilities>;
  trustTier: ModelCreate['trust_tier'];
  licence: string;
  contextWindow: string;
  priceIn: string;
  priceOut: string;
}

export type ModelField =
  'id' | 'provider' | 'upstreamModel' | 'contextWindow' | 'priceIn' | 'priceOut';

export function draftFromModel(m: ModelCreate): ModelDraft {
  return {
    id: m.id,
    provider: m.provider,
    upstreamModel: m.upstream_model,
    kind: m.kind ?? 'chat',
    family: m.family ?? '',
    capabilities: withDefaultCapabilities(m.capabilities),
    trustTier: m.trust_tier,
    licence: m.licence ?? '',
    contextWindow: m.context_window != null ? String(m.context_window) : '',
    priceIn: m.price_in_per_mtok != null ? String(m.price_in_per_mtok) : '',
    priceOut: m.price_out_per_mtok != null ? String(m.price_out_per_mtok) : '',
  };
}

export function emptyModelDraft(): ModelDraft {
  return draftFromModel({ id: '', provider: '', upstream_model: '', trust_tier: 't0_sovereign' });
}

function nonNegative(raw: string): boolean {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isFinite(n) && n >= 0;
}

export function validateModel(d: ModelDraft): FieldErrors<ModelField> {
  const errors: FieldErrors<ModelField> = {};
  const id = d.id.trim();
  if (!id) errors.id = 'Enter a model id, for example local/qwen3-8b.';
  else if (!MODEL_ID_RE.test(id))
    errors.id = 'Letters, digits, . _ : - and / between segments (no spaces).';
  if (!d.provider.trim()) errors.provider = 'Enter the provider id that serves this model.';
  if (!d.upstreamModel.trim()) errors.upstreamModel = 'Enter the name the server expects.';
  const ctx = d.contextWindow.trim();
  if (ctx && !(Number.isInteger(Number(ctx)) && Number(ctx) > 0))
    errors.contextWindow = 'Enter a whole number of tokens.';
  if (d.priceIn.trim() && !nonNegative(d.priceIn)) errors.priceIn = 'Enter a price ≥ 0.';
  if (d.priceOut.trim() && !nonNegative(d.priceOut)) errors.priceOut = 'Enter a price ≥ 0.';
  return errors;
}

export function modelBody(d: ModelDraft): ModelCreate {
  const opt = (v: string) => v.trim() || null;
  const num = (v: string) => (v.trim() ? Number(v) : null);
  return {
    id: d.id.trim(),
    provider: d.provider.trim(),
    upstream_model: d.upstreamModel.trim(),
    kind: d.kind,
    family: opt(d.family),
    capabilities: d.capabilities,
    trust_tier: d.trustTier,
    licence: opt(d.licence),
    context_window: num(d.contextWindow),
    price_in_per_mtok: num(d.priceIn),
    price_out_per_mtok: num(d.priceOut),
  };
}

export function hasErrors(e: object): boolean {
  return Object.keys(e).length > 0;
}
