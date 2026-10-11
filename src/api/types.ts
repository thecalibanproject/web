import type { components, paths } from './schema';

type S = components['schemas'];

export type ApiErrorBody = S['Error'];
export type Health = S['Health'];
export type Tenant = S['Tenant'];
export type TenantCreate = S['TenantCreate'];
export type TenantUpdate = S['TenantUpdate'];
export type PiiMode = NonNullable<Tenant['pii_default']>;
export type SurrogateScope = NonNullable<Tenant['pii_surrogate_scope']>;
export type SemanticCacheMode = NonNullable<Tenant['semantic_cache']>;
export type ApiKeyInfo = S['ApiKeyInfo'];
export type ApiKeyCreated = S['ApiKeyCreated'];
export type ProviderKind = S['ProviderKind'];
export type TrustTier = S['TrustTier'];
export type ProviderKey = S['ProviderKey'];
export type ProviderKeyCreate = S['ProviderKeyCreate'];
export type Model = S['Model'];
export type ModelCreate = S['ModelCreate'];
export type ModelKind = S['ModelKind'];
export type ModelCapabilities = S['ModelCapabilities'];
export type ReasoningMode = NonNullable<ModelCapabilities['reasoning']>;
export type ReasoningControl = NonNullable<ModelCapabilities['reasoning_control']>;
export type SharedProvider = S['SharedProvider'];
export type SharedProviderCreate = S['SharedProviderCreate'];
export type ProviderHealth =
  paths['/api/v1/providers/{providerId}/health']['get']['responses'][200]['content']['application/json'];
export type ProviderHealthStatus = ProviderHealth['status'];
export type DiscoveryResult =
  paths['/api/v1/providers/{providerId}/discover']['post']['responses'][200]['content']['application/json'];
export type DatasourceKind = S['DatasourceKind'];
export type Datasource = S['Datasource'];
export type DatasourceCreate = S['DatasourceCreate'];
export type OntologyElementKind = S['OntologyElementKind'];
export type OntologyElement = S['OntologyElement'];
export type Ontology = S['Ontology'];
export type Node = S['Node'];
export type NodeCreate = S['NodeCreate'];
export type NodeState = Node['state'];
export type NodeCaps = S['NodeCaps'];
export type NodeSpendCaps = S['NodeSpendCaps'];
/** `GET .../nodes/{name}/versions`: every version not deleted, oldest first, and the live one. */
export type NodeVersions =
  paths['/api/v1/tenants/{tenantId}/nodes/{nodeName}/versions']['get']['responses'][200]['content']['application/json'];
/** `GET .../nodes/{name}/diff`: both hashes and a structural diff (JSON pointers). */
export type NodeDiff =
  paths['/api/v1/tenants/{tenantId}/nodes/{nodeName}/diff']['get']['responses'][200]['content']['application/json'];
export type NodeDiffChange = NonNullable<NodeDiff['changes']>[number];
export type RunStatus = S['RunStatus'];
export type RunStep = S['RunStep'];
export type RunUsage = S['RunUsage'];
export type NodeRunSummary = S['NodeRunSummary'];
export type NodeRunList = S['NodeRunList'];
export type ConsoleRun = S['ConsoleRun'];
/** `GET .../inbox`: runs waiting for a human, oldest wait first. */
export type Inbox =
  paths['/api/v1/tenants/{tenantId}/inbox']['get']['responses'][200]['content']['application/json'];
export type InboxItem = Inbox['data'][number];
/** What a call waiting for approval would do: tool, effect, labels, arguments (with runs.data). */
export type Approval = NonNullable<InboxItem['approval']>;
export type GoldenCase = S['GoldenCase'];
export type EvalCheck = S['EvalCheck'];
export type GoldenSet = S['GoldenSet'];
export type EvalPolicy = S['EvalPolicy'];
/** `GET .../nodes/{name}/eval-policy`: the bar, and the injection bar in effect. */
export type EvalPolicyView = S['EvalPolicyView'];
export type Eval = S['Eval'];
export type EvalSuite = Eval['suite'];
export type EvalStatus = Eval['status'];
export type EvalTrial = NonNullable<Eval['trials']>[number];
export type EvalStart =
  paths['/api/v1/tenants/{tenantId}/nodes/{nodeName}/versions/{version}/evals']['post']['requestBody']['content']['application/json'];
/** `GET .../versions/{v}/gate`: what promoting the version would say. */
export type PromotionGate =
  paths['/api/v1/tenants/{tenantId}/nodes/{nodeName}/versions/{version}/gate']['get']['responses'][200]['content']['application/json'];
export type ProblemDetail = S['Problem'];
export type GateEvidence = S['GateEvidence'];
export type GoldenSummary = S['GoldenSummary'];
export type InjectionSummary = S['InjectionSummary'];
export type GoldenVerdict = S['GoldenVerdict'];
export type InjectionVerdict = S['InjectionVerdict'];
export type ToolAuth = S['ToolAuth'];
export type ToolAuthMethod = ToolAuth['method'];
export type ToolServer = S['ToolServer'];
export type ToolServerCreate = S['ToolServerCreate'];
export type ToolManifest = S['ToolManifest'];
export type ToolFinding = NonNullable<ToolManifest['findings']>[number];
export type ToolFindingKind = NonNullable<ToolFinding['kind']>;
export type ToolStatus = NonNullable<ToolManifest['status']>;
export type ToolImport =
  paths['/api/v1/tenants/{tenantId}/tool-servers/{server}/tools']['post']['requestBody']['content']['application/json'];
export type ToolApproved =
  paths['/api/v1/tenants/{tenantId}/tool-servers/{server}/tools/{tool}/approve']['post']['responses'][200]['content']['application/json'];
export type ApiKeyCreate = NonNullable<
  paths['/api/v1/tenants/{tenantId}/api-keys']['post']['requestBody']
>['content']['application/json'];
export type UsageEvent = S['UsageEvent'];
export type UsageReport = S['UsageReport'];
export type UsageByNode = NonNullable<UsageReport['by_node']>[number];
export type UsageTotals = S['UsageTotals'];
export type CacheStatus = UsageEvent['cache'];
export type CacheTier = NonNullable<UsageEvent['cache_tier']>;
export type RouteStage = NonNullable<UsageEvent['route_stage']>;
export type AuditEntry = S['AuditEntry'];
export type AuditLog = S['AuditLog'];
export type ReviewDecision = 'approve' | 'reject';
export type AuthConfig = S['AuthConfig'];
export type Me = S['Me'];
export type Role = S['Role'];
export type Permission = S['Permission'];
export type User = S['User'];
export type RoleBinding = S['RoleBinding'];
export type RoleBindingCreate = S['RoleBindingCreate'];
export type RoleBindingList = S['RoleBindingList'];
export type GroupMapping = S['GroupMapping'];
export type SubjectKind = RoleBinding['subject_kind'];

// Enum value lists, kept in the order of the OpenAPI contract. `satisfies`
// makes the compiler flag drift when `pnpm gen:api` changes the unions.
export const SURROGATE_SCOPES = ['tenant', 'session'] as const satisfies readonly SurrogateScope[];

export const PROVIDER_KINDS = [
  'openai',
  'anthropic',
  'openai_compatible',
  'azure_openai',
  'bedrock',
  'vertex',
] as const satisfies readonly ProviderKind[];

export const TRUST_TIERS = [
  't0_sovereign',
  't1_attested',
  't2_contracted',
  't3_public',
] as const satisfies readonly TrustTier[];

export const MODEL_KINDS = ['chat', 'embedding', 'rerank'] as const satisfies readonly ModelKind[];

export const REASONING_MODES = [
  'none',
  'always',
  'hybrid',
] as const satisfies readonly ReasoningMode[];

export const REASONING_CONTROLS = [
  'none',
  'enable_thinking',
  'reasoning_effort',
] as const satisfies readonly ReasoningControl[];

export const DATASOURCE_KINDS = [
  'mongodb',
  'postgres',
  'mysql',
  'sqlserver',
  'snowflake',
  'bigquery',
  'clickhouse',
  'elasticsearch',
  'rest_openapi',
  's3_parquet',
  'mcp',
] as const satisfies readonly DatasourceKind[];

export const ONTOLOGY_KINDS = [
  'entity',
  'attribute',
  'relation',
  'metric',
  'dimension',
  'glossary_term',
  'policy',
  'verified_query',
] as const satisfies readonly OntologyElementKind[];

export const NODE_STATES = [
  'draft',
  'published',
  'retired',
] as const satisfies readonly NodeState[];

export const TOOL_AUTH_METHODS = [
  'caliban_token',
  'api_key',
  'oauth_client_credentials',
  'none',
] as const satisfies readonly ToolAuthMethod[];

export const TOOL_FINDING_KINDS = [
  'instruction',
  'hidden_unicode',
  'url',
  'exfiltration',
] as const satisfies readonly ToolFindingKind[];

export const CACHE_STATUSES = ['hit', 'miss', 'bypass'] as const satisfies readonly CacheStatus[];

export const CACHE_TIERS = ['exact', 'semantic'] as const satisfies readonly CacheTier[];

export const RUN_STATUSES = [
  'pending',
  'running',
  'sleeping',
  'input_required',
  'succeeded',
  'failed',
  'budget_exhausted',
  'cancelled',
] as const satisfies readonly RunStatus[];

export const EVAL_SUITES = ['golden', 'injection'] as const satisfies readonly EvalSuite[];

export const EVAL_STATUSES = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const satisfies readonly EvalStatus[];

export const ROUTE_STAGES = ['rules', 'knn', 'keyword'] as const satisfies readonly RouteStage[];

/** Deployment roles first, then tenant roles, as in the contract. */
export const ROLES = [
  'owner',
  'admin',
  'auditor',
  'tenant_admin',
  'developer',
  'viewer',
  'billing',
] as const satisfies readonly Role[];

export const TENANT_ROLES = [
  'tenant_admin',
  'developer',
  'viewer',
  'billing',
] as const satisfies readonly Role[];
