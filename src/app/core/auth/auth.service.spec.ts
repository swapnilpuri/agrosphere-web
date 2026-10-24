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
  tokenParsed: { preferred_username: 'viewer' },
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
  beforeEach(() => {
    vi.clearAllMocks();
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
});
