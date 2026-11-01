import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { components } from '../../../api/operations.generated';
export type AlertRow = components['schemas']['ANPAlertView'];
export type AlertCounts = components['schemas']['ANCounts'];
export type AlertPage = components['schemas']['ANPAlertPage'];
export type AlertHistory = components['schemas']['ANPHistoryPage'];
export type AlertCommand = { path: string; key: string; body: Record<string, number> };
@Injectable({ providedIn: 'root' })
export class AlertsApi {
  private readonly api = inject(ApiClient);
  get<T>(path: string) {
    return this.api.http.get<T>(this.api.baseUrl + '/api/v2/alerts' + path);
  }
  command(command: AlertCommand) {
    return this.api.http.post<AlertRow>(
      this.api.baseUrl + '/api/v2/alerts' + command.path,
      command.body,
      { headers: { 'Idempotency-Key': command.key } },
    );
  }
}
