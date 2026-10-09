import type {
  DatasourceKind,
  ModelKind,
  ProviderKind,
  ReasoningControl,
  ReasoningMode,
  TrustTier,
} from '@/api/types';

export const TRUST_TIER_LABEL: Record<TrustTier, string> = {
  t0_sovereign: 'T0 Sovereign',
  t1_attested: 'T1 Attested',
  t2_contracted: 'T2 Contracted',
  t3_public: 'T3 Public',
};

export const TRUST_TIER_HINT: Record<TrustTier, string> = {
  t0_sovereign: 'Runs inside your trust boundary (on-prem / your VPC).',
  t1_attested: 'Confidential compute with remote attestation.',
  t2_contracted: 'Third party under contract (DPA, zero data retention).',
  t3_public: 'Public API, no contractual data guarantees.',
};

export const PROVIDER_LABEL: Record<ProviderKind, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openai_compatible: 'OpenAI-compatible (vLLM, llama.cpp, Ollama, SGLang)',
  azure_openai: 'Azure OpenAI',
  bedrock: 'AWS Bedrock',
  vertex: 'Google Vertex AI',
};

export const PROVIDER_SHORT: Record<ProviderKind, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openai_compatible: 'OpenAI-compatible',
  azure_openai: 'Azure OpenAI',
  bedrock: 'Bedrock',
  vertex: 'Vertex AI',
};

export const DATASOURCE_LABEL: Record<DatasourceKind, string> = {
  mongodb: 'MongoDB',
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  sqlserver: 'SQL Server',
  snowflake: 'Snowflake',
  bigquery: 'BigQuery',
  clickhouse: 'ClickHouse',
  elasticsearch: 'Elasticsearch',
  rest_openapi: 'REST (OpenAPI)',
  s3_parquet: 'S3 / Parquet',
  mcp: 'MCP server',
};

export const MODEL_KIND_LABEL: Record<ModelKind, string> = {
  chat: 'Chat',
  embedding: 'Embedding',
  rerank: 'Rerank',
};

export const REASONING_LABEL: Record<ReasoningMode, string> = {
  none: 'None',
  always: 'Always reasons',
  hybrid: 'Hybrid (thinking can be toggled)',
};

export const REASONING_CONTROL_LABEL: Record<ReasoningControl, string> = {
  none: 'None',
  enable_thinking: 'enable_thinking (Qwen3 chat template)',
  reasoning_effort: 'reasoning_effort (low / medium / high)',
};
