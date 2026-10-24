import { HttpClient } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {providedIn: 'root', factory: () => environment.apiBaseUrl});
/** Transport boundary. Feature clients will map versioned contract DTOs here. */
@Injectable({providedIn: 'root'})
export class ApiClient {
  readonly http = inject(HttpClient);
  readonly baseUrl = inject(API_BASE_URL);
}
