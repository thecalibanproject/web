import { describe, expect, it } from 'vitest';
import { DATASOURCE_KINDS } from '@/api/types';
import { buildConnection, CONNECTION_FIELDS, initialConnection } from './datasourceFields';

describe('datasource connection fields', () => {
  it('lists MongoDB first with uri, database and read preference', () => {
    expect(DATASOURCE_KINDS[0]).toBe('mongodb');
    expect(CONNECTION_FIELDS.mongodb.map((f) => f.key)).toEqual([
      'uri',
      'database',
      'read_preference',
    ]);
    expect(CONNECTION_FIELDS.mongodb.find((f) => f.key === 'uri')?.type).toBe('secret');
  });

  it('defines fields for every kind in the contract', () => {
    for (const k of DATASOURCE_KINDS) expect(CONNECTION_FIELDS[k].length).toBeGreaterThan(0);
  });

  it('builds the connection body: trims, drops blanks, coerces ports', () => {
    const values = {
      ...initialConnection('postgres'),
      host: ' db ',
      database: 'sales',
      user: 'ro',
      password: '',
    };
    expect(buildConnection('postgres', values)).toEqual({
      host: 'db',
      port: 5432,
      database: 'sales',
      user: 'ro',
    });
  });

  it('defaults MongoDB reads to secondaryPreferred', () => {
    expect(initialConnection('mongodb').read_preference).toBe('secondaryPreferred');
  });
});
