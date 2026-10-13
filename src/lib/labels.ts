import type {
  CacheTier,
  DatasourceKind,
  ModelKind,
  PiiMode,
  ProviderKind,
  ReasoningControl,
  ReasoningMode,
  Role,
  RouteStage,
  SurrogateScope,
  TrustTier,
} from '@/api/types';

export const TRUST_TIER_LABEL: Record<TrustTier, string> = {
  t0_sovereign: 'On your servers (T0)',
  t1_attested: 'Verified enclave (T1)',
  t2_contracted: 'Provider under contract (T2)',
  t3_public: 'Public provider (T3)',
};

export const TRUST_TIER_HINT: Record<TrustTier, string> = {
  t0_sovereign: 'Runs on your own servers or in your private cloud.',
  t1_attested: 'Runs in a confidential enclave that proves what it runs.',
  t2_contracted: 'An outside provider under a data contract (no retention).',
  t3_public: 'A public provider with no contract about your data.',
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

/** In the order the console offers them (the recommended default first). */
export const PII_MODE_OPTIONS = ['reversible', 'mask', 'off'] as const satisfies readonly PiiMode[];

export const PII_MODE_LABEL: Record<PiiMode, string> = {
  reversible: 'Hide from the model, restore in the answer',
  mask: 'Hide everywhere',
  off: 'Do not hide',
};

export const SURROGATE_SCOPE_LABEL: Record<SurrogateScope, string> = {
  tenant: 'Same placeholder across the workspace',
  session: 'New placeholders for each conversation',
};

export const CACHE_TIER_LABEL: Record<CacheTier, string> = {
  exact: 'Exact',
  semantic: 'Semantic',
};

export const ROUTE_STAGE_LABEL: Record<RouteStage, string> = {
  rules: 'By a rule',
  knn: 'By example sentences',
  keyword: 'By keywords',
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  auditor: 'Auditor',
  tenant_admin: 'Workspace admin',
  developer: 'Developer',
  viewer: 'Viewer',
  billing: 'Billing',
};

/** Plain wording of the control plane's `GET /api/v1/roles` (workspace for tenant). */
export const ROLE_DESCRIPTION: Record<Role, string> = {
  owner: 'Everything, including granting and revoking the owner role.',
  admin: 'Everything except granting or revoking the owner role.',
  auditor: 'Read-only access to everything, including the audit log.',
  tenant_admin:
    'Manages one workspace: settings, app keys, provider accounts, routing, data connections and assistants.',
  developer:
    'App keys, routing, assistants and the data dictionary review of one workspace; reads the rest.',
  viewer: 'Read-only access to one workspace.',
  billing: 'Usage and spend of one workspace.',
};
