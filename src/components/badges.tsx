import type {
  CacheStatus,
  CacheTier,
  Datasource,
  ModelCapabilities,
  ModelKind,
  OntologyElement,
  TrustTier,
} from '@/api/types';
import { formatPercent } from '@/lib/format';
import {
  CACHE_TIER_LABEL,
  MODEL_KIND_LABEL,
  REASONING_CONTROL_LABEL,
  TRUST_TIER_HINT,
  TRUST_TIER_LABEL,
} from '@/lib/labels';
import { Badge, type Tone } from './ui';

const TIER_TONE: Record<TrustTier, Tone> = {
  t0_sovereign: 'ok',
  t1_attested: 'info',
  t2_contracted: 'warn',
  t3_public: 'danger',
};

export function TrustTierBadge({ tier }: { tier: TrustTier }) {
  return (
    <Badge tone={TIER_TONE[tier]} title={TRUST_TIER_HINT[tier]}>
      {TRUST_TIER_LABEL[tier]}
    </Badge>
  );
}

const DS_TONE: Record<Datasource['status'], Tone> = {
  pending: 'neutral',
  connected: 'ok',
  error: 'danger',
  introspecting: 'info',
};

export function DatasourceStatusBadge({ status }: { status: Datasource['status'] }) {
  return (
    <Badge tone={DS_TONE[status]} dot>
      {status}
    </Badge>
  );
}

const PROV_LABEL: Record<OntologyElement['provenance'], string> = {
  introspect: 'Introspected',
  profile: 'Profiled',
  query_log: 'Query log',
  llm: 'LLM-proposed',
  human: 'Human',
};

const PROV_HINT: Record<OntologyElement['provenance'], string> = {
  introspect: 'Read from the source schema.',
  profile: 'Inferred from data profiling.',
  query_log: 'Mined from the source query log.',
  llm: 'Proposed by a model. Check carefully.',
  human: 'Authored by a person.',
};

export function ProvenanceBadge({ provenance }: { provenance: OntologyElement['provenance'] }) {
  return (
    <Badge
      tone={provenance === 'llm' ? 'accent' : provenance === 'human' ? 'ok' : 'neutral'}
      title={PROV_HINT[provenance]}
    >
      {PROV_LABEL[provenance]}
    </Badge>
  );
}

const STATUS_TONE: Record<OntologyElement['status'], Tone> = {
  proposed: 'warn',
  approved: 'ok',
  rejected: 'danger',
  stale: 'neutral',
  deprecated: 'neutral',
};

export function ElementStatusBadge({ status }: { status: OntologyElement['status'] }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

const CACHE_TONE: Record<CacheStatus, Tone> = { hit: 'ok', miss: 'neutral', bypass: 'warn' };

export function CacheBadge({ cache }: { cache: CacheStatus }) {
  return <Badge tone={CACHE_TONE[cache]}>{cache}</Badge>;
}

const CACHE_TIER_HINT: Record<CacheTier, string> = {
  exact: 'Answered from a byte-identical (pseudonymized) earlier request.',
  semantic: 'Answered from an earlier, semantically similar request of the same tenant.',
};

export function CacheTierBadge({ tier }: { tier: CacheTier }) {
  return (
    <Badge tone={tier === 'semantic' ? 'accent' : 'info'} title={CACHE_TIER_HINT[tier]}>
      {CACHE_TIER_LABEL[tier]}
    </Badge>
  );
}

/** Confidence as a small bar + percentage. Null renders as "unknown". */
export function ConfidenceMeter({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-[12px] text-fg-subtle">unknown</span>;
  const pct = Math.max(0, Math.min(1, value));
  const tone = pct < 0.5 ? 'bg-danger' : pct < 0.8 ? 'bg-warn' : 'bg-ok';
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-3"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={pct}
        aria-label="Confidence"
      >
        <span className={`block h-full ${tone}`} style={{ width: `${pct * 100}%` }} />
      </span>
      <span className="tabular text-[12px] text-fg-muted">{formatPercent(pct)}</span>
    </span>
  );
}

const KIND_TONE: Record<ModelKind, Tone> = { chat: 'neutral', embedding: 'info', rerank: 'accent' };

export function ModelKindBadge({ kind }: { kind: ModelKind }) {
  return <Badge tone={KIND_TONE[kind]}>{MODEL_KIND_LABEL[kind]}</Badge>;
}

/** Tools / vision / reasoning badges. Renders a dash when the model has none. */
export function CapabilityBadges({ capabilities: c }: { capabilities: ModelCapabilities }) {
  const reasoning = c.reasoning ?? 'none';
  const control = c.reasoning_control ?? 'none';
  const items: Array<{ key: string; label: string; title: string }> = [];
  if (c.tools)
    items.push({ key: 'tools', label: 'tools', title: 'Supports tool / function calling.' });
  if (c.vision) items.push({ key: 'vision', label: 'vision', title: 'Accepts image inputs.' });
  if (reasoning !== 'none') {
    items.push({
      key: 'reasoning',
      label: reasoning === 'hybrid' ? 'reasoning · hybrid' : 'reasoning',
      title:
        (reasoning === 'hybrid'
          ? 'Thinking can be switched on or off per request (caliban.reasoning).'
          : 'Always produces reasoning before answering.') +
        (control !== 'none' ? ` Control: ${REASONING_CONTROL_LABEL[control]}.` : '') +
        (c.inline_think_tags ? ' <think> tags are moved to reasoning_content.' : ''),
    });
  }
  if (items.length === 0) return <span className="text-fg-subtle">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {items.map((i) => (
        <Badge key={i.key} tone={i.key === 'reasoning' ? 'accent' : 'info'} title={i.title}>
          {i.label}
        </Badge>
      ))}
    </span>
  );
}
