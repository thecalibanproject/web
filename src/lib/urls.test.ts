import { describe, expect, it } from 'vitest';
import { apiBaseUrl, dataPlaneUrl } from './urls';

describe('urls', () => {
  it('uses the serving origin and path prefix for the admin API', () => {
    expect(apiBaseUrl({ origin: 'http://cal.local:8081', pathname: '/' })).toBe(
      'http://cal.local:8081',
    );
    expect(apiBaseUrl({ origin: 'https://gw.corp', pathname: '/caliban/index.html' })).toBe(
      'https://gw.corp/caliban',
    );
  });

  it('derives the data-plane URL on port 8080', () => {
    expect(dataPlaneUrl({ protocol: 'http:', hostname: '10.0.0.5' })).toBe(
      'http://10.0.0.5:8080/v1',
    );
  });
});
