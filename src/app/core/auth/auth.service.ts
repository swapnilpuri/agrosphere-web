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
  readonly estateIds = signal<string[]>([]);
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
      const scope: unknown = this.client.tokenParsed?.['estate_ids'];
      this.estateIds.set(
        Array.isArray(scope) &&
          scope.every(
            (id) =>
              typeof id === 'string' &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
          )
          ? scope
          : [],
      );
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
  canEnterWorkspace(): boolean {
    return this.canRead() || this.estateIds().some((id) => this.canReadWorkforce(id));
  }
  canCreateEstate(): boolean {
    return this.roles().includes('PLATFORM_ADMIN');
  }
  canReadWorkforce(id: string): boolean {
    return this.workforcePermission(id, [
      'ESTATE_ADMIN',
      'ESTATE_MANAGER',
      'FIELD_SUPERVISOR',
      'AUDITOR',
    ]);
  }
  canManageWorkforce(id: string): boolean {
    return this.workforcePermission(id, ['ESTATE_ADMIN', 'ESTATE_MANAGER']);
  }
  canRecordWorkforce(id: string): boolean {
    return this.workforcePermission(id, ['ESTATE_ADMIN', 'ESTATE_MANAGER', 'FIELD_SUPERVISOR']);
  }
  canReadWorkforceHistory(id: string): boolean {
    return this.workforcePermission(id, ['ESTATE_ADMIN', 'ESTATE_MANAGER', 'AUDITOR']);
  }
  private workforcePermission(id: string, roles: string[]): boolean {
    return (
      this.authenticated() &&
      !!id &&
      (this.roles().includes('PLATFORM_ADMIN') ||
        (this.estateIds().includes(id) && this.roles().some((role) => roles.includes(role))))
    );
  }
  canManageEstate(id: string): boolean {
    return (
      this.canCreateEstate() ||
      (this.roles().some((role) => ['ESTATE_ADMIN', 'ESTATE_MANAGER'].includes(role)) &&
        this.estateIds().includes(id))
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
    this.estateIds.set([]);
    this.username.set('');
  }
  async token(): Promise<string> {
    try {
      const refreshed = await this.client.updateToken(30);
      if (!this.client.token) throw new Error('No session');
      if (refreshed) {
        this.roles.set(this.client.realmAccess?.roles ?? []);
        const scope: unknown = this.client.tokenParsed?.['estate_ids'];
        this.estateIds.set(
          Array.isArray(scope) &&
            scope.every(
              (id) =>
                typeof id === 'string' &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id),
            )
            ? scope
            : [],
        );
      }
      return this.client.token;
    } catch {
      this.clear();
      throw new Error('Session expired. Sign in again.');
    }
  }
}
