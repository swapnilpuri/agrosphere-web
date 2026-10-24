import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { Feature, Layer, Asset } from '../../shared/models';
import type { components } from '../../../api/spatial.generated';
@Injectable({ providedIn: 'root' })
export class SpatialApi {
  private readonly api = inject(ApiClient);
  features(id: string) {
    return this.api.all<Feature>('/spatial/estates/' + encodeURIComponent(id) + '/features');
  }
  layers(id: string) {
    return this.api.all<Layer>('/spatial/estates/' + encodeURIComponent(id) + '/layers');
  }
  assets(id: string) {
    return this.api.all<Asset>('/spatial/estates/' + encodeURIComponent(id) + '/assets');
  }
  geometry(id: string) {
    return this.api.get<Feature>('/spatial/blocks/' + encodeURIComponent(id) + '/geometry');
  }
  point(query: components['schemas']['Query']) {
    return this.api.http.post<components['schemas']['QueryResult']>(
      this.api.baseUrl + '/api/v1/spatial/query/point',
      query,
    );
  }
}
