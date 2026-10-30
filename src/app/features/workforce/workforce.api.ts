import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { components } from '../../../api/operations.generated';
export type Schemas = components['schemas'];
export type Worker = Schemas['WorkerView'];
export type Day = Schemas['AttendanceView'];
export type Roster = Schemas['AttendanceRosterPage'];
export type History = Schemas['WorkerHistoryPage'] | Schemas['AttendanceHistoryPage'];
export type Command = { method: 'POST' | 'PATCH'; path: string; body: object; key: string };
@Injectable({ providedIn: 'root' })
export class WorkforceApi {
  private readonly api = inject(ApiClient);
  get<T>(path: string, params: Record<string, string> = {}) {
    const query = new URLSearchParams(params).toString();
    return this.api.get<T>(path + (query ? '?' + query : ''));
  }
  command(command: Command) {
    return this.api.http.request<Worker | Day>(
      command.method,
      this.api.baseUrl + '/api/v1' + command.path,
      { body: command.body, headers: { 'Idempotency-Key': command.key } },
    );
  }
}
