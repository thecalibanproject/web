import type { DatasourceKind } from '@/api/types';

/**
 * Connection fields rendered per datasource kind. Keys become the
 * `connection` object in DatasourceCreate. `secret` fields are rendered as
 * password inputs and are encrypted at rest by the control plane.
 */
export interface ConnectionField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'secret' | 'select' | 'textarea';
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
  defaultValue?: string;
}

const host = (port: string): ConnectionField[] => [
  { key: 'host', label: 'Host', type: 'text', required: true, placeholder: 'db.internal' },
  { key: 'port', label: 'Port', type: 'number', placeholder: port, defaultValue: port },
  { key: 'database', label: 'Database', type: 'text', required: true },
  { key: 'user', label: 'User', type: 'text', required: true },
  { key: 'password', label: 'Password', type: 'secret' },
];

export const READ_PREFERENCES = [
  'primary',
  'primaryPreferred',
  'secondary',
  'secondaryPreferred',
  'nearest',
] as const;

export const CONNECTION_FIELDS: Record<DatasourceKind, ConnectionField[]> = {
  mongodb: [
    {
      key: 'uri',
      label: 'Connection URI',
      type: 'secret',
      required: true,
      placeholder: 'mongodb://user:pass@mongo-0.internal:27017/?replicaSet=rs0',
      hint: 'May contain credentials. Stored encrypted; never shown again.',
    },
    { key: 'database', label: 'Database', type: 'text', required: true, placeholder: 'sales' },
    {
      key: 'read_preference',
      label: 'Read from',
      type: 'select',
      defaultValue: 'secondaryPreferred',
      hint: 'Reading from a replica (secondary) keeps scans and assistant questions off the main database server. Recommended.',
      options: READ_PREFERENCES.map((v) => ({ value: v, label: v })),
    },
  ],
  postgres: host('5432'),
  mysql: host('3306'),
  sqlserver: host('1433'),
  snowflake: [
    {
      key: 'account',
      label: 'Account',
      type: 'text',
      required: true,
      placeholder: 'xy12345.eu-west-1',
    },
    { key: 'warehouse', label: 'Warehouse', type: 'text', required: true },
    { key: 'database', label: 'Database', type: 'text', required: true },
    { key: 'schema', label: 'Schema', type: 'text', placeholder: 'PUBLIC' },
    { key: 'user', label: 'User', type: 'text', required: true },
    { key: 'password', label: 'Password', type: 'secret', required: true },
  ],
  bigquery: [
    { key: 'project_id', label: 'Project ID', type: 'text', required: true },
    { key: 'dataset', label: 'Dataset', type: 'text', required: true },
    {
      key: 'credentials_json',
      label: 'Service account JSON',
      type: 'textarea',
      required: true,
      hint: 'Stored encrypted; never shown again.',
    },
  ],
  clickhouse: [
    {
      key: 'url',
      label: 'URL',
      type: 'text',
      required: true,
      placeholder: 'http://clickhouse.internal:8123',
    },
    { key: 'database', label: 'Database', type: 'text', required: true },
    { key: 'user', label: 'User', type: 'text' },
    { key: 'password', label: 'Password', type: 'secret' },
  ],
  elasticsearch: [
    {
      key: 'url',
      label: 'URL',
      type: 'text',
      required: true,
      placeholder: 'https://es.internal:9200',
    },
    { key: 'index_pattern', label: 'Index pattern', type: 'text', placeholder: 'logs-*' },
    { key: 'api_key', label: 'API key', type: 'secret' },
  ],
  rest_openapi: [
    { key: 'spec_url', label: 'OpenAPI spec URL', type: 'text', required: true },
    { key: 'base_url', label: 'Base URL', type: 'text' },
    { key: 'auth_header', label: 'Authorization header', type: 'secret', placeholder: 'Bearer …' },
  ],
  s3_parquet: [
    { key: 'endpoint', label: 'Endpoint', type: 'text', placeholder: 'http://minio.internal:9000' },
    { key: 'bucket', label: 'Bucket', type: 'text', required: true },
    { key: 'prefix', label: 'Prefix', type: 'text', placeholder: 'warehouse/' },
    { key: 'region', label: 'Region', type: 'text' },
    { key: 'access_key_id', label: 'Access key ID', type: 'text' },
    { key: 'secret_access_key', label: 'Secret access key', type: 'secret' },
  ],
  mcp: [
    {
      key: 'url',
      label: 'Server URL',
      type: 'text',
      required: true,
      placeholder: 'http://mcp.internal:3000/mcp',
    },
    { key: 'auth_token', label: 'Auth token', type: 'secret' },
  ],
};

export function initialConnection(kind: DatasourceKind): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of CONNECTION_FIELDS[kind]) out[f.key] = f.defaultValue ?? '';
  return out;
}

/** Drops empty strings and converts number fields, producing the API body. */
export function buildConnection(
  kind: DatasourceKind,
  values: Record<string, string>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const f of CONNECTION_FIELDS[kind]) {
    const raw = values[f.key]?.trim() ?? '';
    if (raw === '') continue;
    out[f.key] = f.type === 'number' && /^\d+$/.test(raw) ? Number(raw) : raw;
  }
  return out;
}
