import { Injectable, inject, signal } from '@angular/core';
import Keycloak from 'keycloak-js';
import { CONFIG } from '../config';
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly client = new Keycloak(inject(CONFIG).keycloak);
  readonly authenticated = signal(false);
  readonly ready = signal(false);
  readonly error = signal('');
  readonly username = signal('');
  readonly roles = signal<string[]>([]);
  private pending?: Promise<void>;
  initialize(): Promise<void> {
    return (this.pending ??= this.start());
  }
  private async start() {
    try {
      this.client.onAuthLogout = () => this.clear();
      this.client.onTokenExpired = () => {
        void this.token().catch(() => this.clear());
      };
      this.authenticated.set(
        await this.client.init({
          onLoad: 'check-sso',
          responseMode: 'query',
          pkceMethod: 'S256',
          checkLoginIframe: false,
          scope: 'openid agrosphere-api',
          silentCheckSsoRedirectUri: location.origin + '/silent-check-sso.html',
          silentCheckSsoFallback: false,
        }),
      );
      this.username.set(
        this.client.tokenParsed?.['preferred_username'] ?? this.client.subject ?? 'Signed-in user',
      );
      this.roles.set(this.client.realmAccess?.roles ?? []);
    } catch {
      this.error.set('Identity service unavailable. Retry signing in.');
    } finally {
      this.ready.set(true);
    }
  }
  canRead(): boolean {
    return this.roles().some((r) =>
      ['PLATFORM_ADMIN', 'ESTATE_ADMIN', 'ESTATE_MANAGER', 'VIEWER'].includes(r),
    );
  }
  async login() {
    await this.initialize();
    await this.client.login({ redirectUri: location.origin + '/dashboard' });
  }
  async logout() {
    await this.client.logout({ redirectUri: location.origin + '/login' });
  }
  clear() {
    this.client.clearToken();
    this.authenticated.set(false);
    this.roles.set([]);
    this.username.set('');
  }
  async token(): Promise<string> {
    try {
      await this.client.updateToken(30);
      if (!this.client.token) throw new Error('No session');
      return this.client.token;
    } catch {
      this.clear();
      throw new Error('Session expired. Sign in again.');
    }
  }
}
