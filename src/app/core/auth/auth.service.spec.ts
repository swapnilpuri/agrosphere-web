import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';
import { CONFIG } from '../config';
const fake = vi.hoisted(() => ({
  init: vi.fn(),
  updateToken: vi.fn(),
  clearToken: vi.fn(),
  logout: vi.fn(),
  login: vi.fn(),
  token: 'access',
  tokenParsed: { preferred_username: 'viewer' } as Record<string, unknown>,
  realmAccess: { roles: ['VIEWER'] },
}));
vi.mock('keycloak-js', () => ({
  default: class {
    constructor() {
      return fake;
    }
  },
}));
describe('Keycloak session', () => {
  it('applies the narrower workforce role matrix and refreshes revoked claims', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const auth = TestBed.inject(AuthService);
    await auth.initialize();
    auth.estateIds.set([id]);
    for (const role of ['VIEWER', 'PLANTATION_ADMIN', 'WORKER']) {
      auth.roles.set([role]);
      expect(auth.canReadWorkforce(id)).toBe(false);
    }
    auth.roles.set(['FIELD_SUPERVISOR']);
    expect(auth.canRecordWorkforce(id)).toBe(true);
    expect(auth.canManageWorkforce(id)).toBe(false);
    expect(auth.canReadWorkforceHistory(id)).toBe(false);
    expect(auth.canReadWorkforce('foreign')).toBe(false);
    auth.roles.set(['AUDITOR']);
    expect(auth.canReadWorkforceHistory(id)).toBe(true);
    expect(auth.canRecordWorkforce(id)).toBe(false);
    fake.updateToken.mockResolvedValueOnce(true);
    await auth.token();
    expect(auth.canReadWorkforce(id)).toBe(false);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    fake.realmAccess.roles = ['VIEWER'];
    fake.tokenParsed = { preferred_username: 'viewer' };
    fake.init.mockResolvedValue(true);
    fake.updateToken.mockResolvedValue(false);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CONFIG,
          useValue: {
            keycloak: { url: 'http://identity', realm: 'agrosphere', clientId: 'agrosphere-web' },
          },
        },
      ],
    });
  });
  it('initializes with S256 PKCE and renews memory tokens', async () => {
    const auth = TestBed.inject(AuthService);
    await auth.initialize();
    await auth.initialize();
    expect(fake.init).toHaveBeenCalledTimes(1);
    expect(fake.init.mock.calls[0][0]).toMatchObject({ pkceMethod: 'S256', onLoad: 'check-sso' });
    expect(auth.canRead()).toBe(true);
    expect(await auth.token()).toBe('access');
    expect(fake.updateToken).toHaveBeenCalledWith(30);
  });
  it('preserves logout ID token hint until the adapter redirects', async () => {
    await TestBed.inject(AuthService).logout();
    expect(fake.logout).toHaveBeenCalled();
    expect(fake.clearToken).not.toHaveBeenCalled();
  });
  it('clears an expired refresh session', async () => {
    fake.updateToken.mockRejectedValueOnce(new Error('expired'));
    const auth = TestBed.inject(AuthService);
    await expect(auth.token()).rejects.toThrow('Session expired');
    expect(auth.authenticated()).toBe(false);
    expect(fake.clearToken).toHaveBeenCalled();
  });
  it('permits estate creation only for platform administrators and scoped maintenance for managers', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    fake.realmAccess.roles = ['ESTATE_MANAGER', 'VIEWER'];
    fake.tokenParsed['estate_ids'] = [id];
    const auth = TestBed.inject(AuthService);
    await auth.initialize();
    expect(auth.canCreateEstate()).toBe(false);
    expect(auth.canManageEstate(id)).toBe(true);
    expect(auth.canManageEstate('foreign')).toBe(false);
    auth.roles.set(['VIEWER']);
    expect(auth.canManageEstate(id)).toBe(false);
    auth.roles.set(['PLATFORM_ADMIN']);
    expect(auth.canCreateEstate()).toBe(true);
    expect(auth.canManageEstate('foreign')).toBe(true);
  });
  it('fails closed on missing or malformed trusted estate claims', async () => {
    fake.realmAccess.roles = ['ESTATE_ADMIN'];
    fake.tokenParsed['estate_ids'] = ['00000000-0000-4000-8000-000000000001', 123];
    const auth = TestBed.inject(AuthService);
    await auth.initialize();
    expect(auth.estateIds()).toEqual([]);
    expect(auth.canManageEstate('00000000-0000-4000-8000-000000000001')).toBe(false);
    auth.clear();
    expect(auth.estateIds()).toEqual([]);
  });
});
