import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { EMPTY, expand, map, reduce } from 'rxjs';
import { CONFIG } from '../config';
import { Page } from '../../shared/models';
@Injectable({ providedIn: 'root' })
export class ApiClient {
  readonly http = inject(HttpClient);
  readonly baseUrl = inject(CONFIG).apiBaseUrl;
  get<T>(path: string) {
    return this.http.get<T>(this.baseUrl + '/api/v1' + path);
  }
  all<T>(path: string) {
    const page = (index: number) => this.get<Page<T>>(path + '?page=' + index + '&size=100');
    return page(0).pipe(
      expand((p) => ((p.page + 1) * p.size < p.totalElements ? page(p.page + 1) : EMPTY)),
      map((p) => p.content),
      reduce((all, items) => all.concat(items), [] as T[]),
    );
  }
}
