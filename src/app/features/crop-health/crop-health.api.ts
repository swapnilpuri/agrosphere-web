import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { components } from '../../../api/operations.generated';
export type CropSchemas = components['schemas'];
export type Inspection = CropSchemas['CHInspectionView'];
export type Incident = CropSchemas['CHIncidentView'];
export type CropRow = Inspection | Incident;
export type CropPage = CropSchemas['CHInspectionPage'] | CropSchemas['CHIncidentPage'];
export type CropHistory =
  CropSchemas['CHInspectionHistoryPage'] | CropSchemas['CHIncidentHistoryPage'];
export type CreatedInspection = CropSchemas['CHInspectionCreateResult'];
export type CropCommand = { path: string; body: Record<string, unknown>; key: string };
@Injectable({ providedIn: 'root' })
export class CropHealthApi {
  private readonly api = inject(ApiClient);
  get<T>(path: string, query?: URLSearchParams) {
    return this.api.get<T>(path + (query ? '?' + query.toString() : ''));
  }
  command(command: CropCommand) {
    return this.api.http.post<CropRow | CreatedInspection>(
      this.api.baseUrl + '/api/v1' + command.path,
      command.body,
      { headers: { 'Idempotency-Key': command.key } },
    );
  }
}
