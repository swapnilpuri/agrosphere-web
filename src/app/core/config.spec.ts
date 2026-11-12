import { describe, expect, it } from 'vitest';
import { AppConfig, fixtureVerification } from './config';

describe('owned fixture diagnostics', () => {
  const config: AppConfig = {
    apiBaseUrl: 'http://127.0.0.1:50001',
    keycloak: { url: 'http://localhost:50002', realm: 'agrosphere', clientId: 'agrosphere-web' },
    cesium: {},
    verification: { runId: 'a'.repeat(32) },
  };
  it('requires explicit generated run and loopback Gateway and identity origins', () => {
    expect(fixtureVerification(config)).toBe('a'.repeat(32));
    expect(fixtureVerification({ ...config, verification: undefined })).toBeUndefined();
    for (const url of [
      'https://example.invalid',
      'http://example.invalid:50001',
      'http://localhost',
      'http://user:password@localhost:50001',
      'http://localhost:50001/private',
    ]) {
      expect(fixtureVerification({ ...config, apiBaseUrl: url })).toBeUndefined();
      expect(
        fixtureVerification({ ...config, keycloak: { ...config.keycloak, url } }),
      ).toBeUndefined();
    }
    expect(fixtureVerification({ ...config, verification: { runId: 'unowned' } })).toBeUndefined();
  });
});
