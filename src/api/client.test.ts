import { afterEach, describe, expect, it } from 'vitest';
import { clearToken, getToken, setToken } from '@/lib/auth';
import { mockApi } from '@/test/utils';
import { api, ApiError, slashPreservingPath, unwrap } from './client';

describe('api client', () => {
  afterEach(() => clearToken());

  it('sends the admin token as a Bearer header', async () => {
    setToken('adm_123');
    const calls = mockApi({ 'GET /api/v1/models': () => ({ body: [] }) });
    await expect(unwrap(api.GET('/api/v1/models'))).resolves.toEqual([]);
    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer adm_123');
  });

  it('throws ApiError carrying the contract error envelope', async () => {
    setToken('adm_123');
    mockApi({
      'POST /api/v1/tenants': () => ({
        status: 400,
        body: {
          error: {
            message: 'name is required',
            type: 'invalid_request_error',
            code: 'missing_name',
          },
        },
      }),
    });
    const err = await unwrap(api.POST('/api/v1/tenants', { body: { name: '' } })).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      message: 'name is required',
      type: 'invalid_request_error',
    });
  });

  it('drops the token on 401 so the route guard sends the user to login', async () => {
    setToken('expired');
    mockApi({
      'GET /api/v1/tenants': () => ({
        status: 401,
        body: { error: { message: 'bad token', type: 'authentication_error' } },
      }),
    });
    await expect(unwrap(api.GET('/api/v1/tenants'))).rejects.toBeInstanceOf(ApiError);
    expect(getToken()).toBeNull();
  });
});

describe('slashPreservingPath', () => {
  it('keeps slashes in a path param but encodes everything else', () => {
    expect(
      slashPreservingPath('http://h/api/v1/models/{modelId}', { modelId: 'local/qwen3 8b?x' }),
    ).toBe('http://h/api/v1/models/local/qwen3%208b%3Fx');
  });

  it('leaves unknown placeholders alone', () => {
    expect(slashPreservingPath('/a/{b}', {})).toBe('/a/{b}');
  });
});
