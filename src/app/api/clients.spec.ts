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
  it('posts new estate records without fabricating a version and uses PUT with the observed version', () => {
    const api = TestBed.inject(EstateApi);
    const body = {
      estateCode: 'GA01',
      name: 'Supplied estate',
      countryCode: 'GA',
      timezone: 'Africa/Libreville',
      status: 'ACTIVE' as const,
    };
    api.saveEstate(body).subscribe();
    const created = http.expectOne('http://gateway/api/v1/estates');
    expect(created.request.method).toBe('POST');
    expect(created.request.body).not.toHaveProperty('version');
    created.flush({ id: 'canonical' });
    api.saveEstate({ ...body, version: 4 }, 'canonical').subscribe();
    const updated = http.expectOne('http://gateway/api/v1/estates/canonical');
    expect(updated.request.method).toBe('PUT');
    expect(updated.request.body.version).toBe(4);
    updated.flush({ id: 'canonical', version: 5 });
  });
  it('preserves canonical division parents and polls the service-owned import job through Gateway', () => {
    const api = TestBed.inject(EstateApi);
    const body = {
      estateId: 'estate',
      divisionCode: 'D1',
      name: 'Division',
      status: 'ACTIVE' as const,
    };
    api.saveDivision(body).subscribe();
    const r = http.expectOne('http://gateway/api/v1/estates/estate/divisions');
    expect(r.request.body.estateId).toBe('estate');
    r.flush({ id: 'division' });
    api.saveDivision({ ...body, version: 2 }, 'division').subscribe();
    const put = http.expectOne('http://gateway/api/v1/divisions/division');
    expect(put.request.method).toBe('PUT');
    put.flush({ id: 'division' });
    const spatial = TestBed.inject(SpatialApi);
    spatial
      .importBoundaries({
        estateId: 'estate',
        sourceFilename: 'survey.geojson',
        geojson: { type: 'FeatureCollection', features: [] },
      })
      .subscribe();
    const upload = http.expectOne('http://gateway/api/v1/spatial/imports/geojson');
    expect(upload.request.method).toBe('POST');
    upload.flush({ id: 'job', status: 'PENDING' });
    spatial.importJob('job').subscribe();
    http
      .expectOne('http://gateway/api/v1/spatial/imports/job')
      .flush({ id: 'job', status: 'COMPLETED' });
  });
});
