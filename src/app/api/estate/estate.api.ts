import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { Estate, Division, Block } from '../../shared/models';
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
}
