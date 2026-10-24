import { Component, inject } from '@angular/core';
import { AuthService } from './auth.service';
@Component({ standalone: true, templateUrl: './login.component.html' })
export class LoginComponent {
  readonly auth = inject(AuthService);
  async login() {
    try {
      await this.auth.login();
    } catch {
      this.auth.error.set('Unable to open Keycloak. Check identity configuration and retry.');
    }
  }
}
