import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { CONFIG } from '../core/config';
import { EstateApi } from './estate/estate.api';
import { SpatialApi } from './spatial/spatial.api';
describe('Gateway API contracts', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CONFIG, useValue: { apiBaseUrl: 'http://gateway' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('loads every estate page, preserving canonical UUIDs', () => {
    let ids: string[] = [];
    TestBed.inject(EstateApi)
      .estates()
      .subscribe((v) => (ids = v.map((e) => e.id)));
    http
      .expectOne('http://gateway/api/v1/estates?page=0&size=100')
      .flush({ content: [{ id: 'estate-a' }], page: 0, size: 1, totalElements: 2 });
    http
      .expectOne('http://gateway/api/v1/estates?page=1&size=100')
      .flush({ content: [{ id: 'estate-b' }], page: 1, size: 1, totalElements: 2 });
    expect(ids).toEqual(['estate-a', 'estate-b']);
  });
  it('uses implemented spatial feature and block geometry routes', () => {
    const api = TestBed.inject(SpatialApi);
    api.features('estate-a').subscribe((v) => expect(v).toEqual([]));
    http
      .expectOne('http://gateway/api/v1/spatial/estates/estate-a/features?page=0&size=100')
      .flush({ content: [], page: 0, size: 100, totalElements: 0 });
    api.geometry('block-a').subscribe((v) => expect(v.referenceEntityId).toBe('block-a'));
    http
      .expectOne('http://gateway/api/v1/spatial/blocks/block-a/geometry')
      .flush({ id: 'feature-a', referenceEntityId: 'block-a' });
  });
  it('propagates permission failures without fabricated fallback data', () => {
    let status = 0;
    TestBed.inject(EstateApi)
      .block('block-a')
      .subscribe({ error: (e) => (status = e.status) });
    http
      .expectOne('http://gateway/api/v1/blocks/block-a')
      .flush({}, { status: 403, statusText: 'Forbidden' });
    expect(status).toBe(403);
  });
});
