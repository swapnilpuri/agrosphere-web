import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { Estate, Division, Block } from '../../shared/models';
import type { components } from '../../../api/estate.generated';
export type EstateWrite = components['schemas']['EstateWrite'];
export type DivisionWrite = components['schemas']['DivisionWrite'];
export type BlockWrite = components['schemas']['BlockWrite'];
@Injectable({ providedIn: 'root' })
export class EstateApi {
  private readonly api = inject(ApiClient);
  estates() {
    return this.api.all<Estate>('/estates');
  }
  divisions(id: string) {
    return this.api.all<Division>('/estates/' + encodeURIComponent(id) + '/divisions');
  }
  blocks(id: string) {
    return this.api.all<Block>('/estates/' + encodeURIComponent(id) + '/blocks');
  }
  block(id: string) {
    return this.api.get<Block>('/blocks/' + encodeURIComponent(id));
  }
  clones() {
    return this.api.all<components['schemas']['RubberClone']>('/rubber-clones');
  }
  saveEstate(body: EstateWrite, id?: string) {
    return id
      ? this.api.http.put<Estate>(
          this.api.baseUrl + '/api/v1/estates/' + encodeURIComponent(id),
          body,
        )
      : this.api.http.post<Estate>(this.api.baseUrl + '/api/v1/estates', body);
  }
  saveDivision(body: DivisionWrite, id?: string) {
    return id
      ? this.api.http.put<Division>(
          this.api.baseUrl + '/api/v1/divisions/' + encodeURIComponent(id),
          body,
        )
      : this.api.http.post<Division>(
          this.api.baseUrl + '/api/v1/estates/' + encodeURIComponent(body.estateId) + '/divisions',
          body,
        );
  }
  saveBlock(body: BlockWrite, id?: string) {
    return id
      ? this.api.http.put<Block>(
          this.api.baseUrl + '/api/v1/blocks/' + encodeURIComponent(id),
          body,
        )
      : this.api.http.post<Block>(
          this.api.baseUrl + '/api/v1/divisions/' + encodeURIComponent(body.divisionId) + '/blocks',
          body,
        );
  }
}
