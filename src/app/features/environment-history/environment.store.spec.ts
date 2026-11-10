import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { CONFIG } from '../../core/config';
import { EnvironmentalStore } from './environment.store';
import { validEnvironmentHistory, validEnvironmentQuery } from './environment-state';
import { environmentSample } from '../../../../e2e/environment-fixtures';
const sample = environmentSample();
const query = {
  estateId: sample.estateId,
  blockId: sample.blockId,
  from: sample.from,
  to: sample.to,
};
describe('Environmental history state', () => {
  let store: EnvironmentalStore;
  let http: HttpTestingController;
  let visibility: DocumentVisibilityState;
  beforeEach(() => {
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    TestBed.configureTestingModule({
      providers: [
        EnvironmentalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CONFIG, useValue: { apiBaseUrl: 'https://gateway.example.invalid' } },
      ],
    });
    store = TestBed.inject(EnvironmentalStore);
    http = TestBed.inject(HttpTestingController);
    store.scope(query.estateId, true);
  });
  afterEach(() => {
    http.verify({ ignoreCancelled: true });
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  it('keeps exact temperature and measured zero as per-device observations', () => {
    store.load(query);
    http.expectOne((r) => r.url.includes('/environment/observations')).flush(environmentSample());
    expect(store.data()?.observations[0].value).toBe('-2.125000');
    expect(store.data()?.observations[1].value).toBe('0');
  });
  it('cancels and clears immediately when selection controls or estate change', () => {
    store.load(query);
    const pending = http.expectOne(() => true);
    store.selectionChanged();
    expect(pending.cancelled).toBe(true);
    expect(store.data()).toBeNull();
    store.scope('00000000-0000-4000-8000-000000000999', true);
    store.load(query);
    http.expectNone(() => true);
    expect(store.status()).toBe('INVALID');
  });
  it('refuses a cross-scope response from the current request', () => {
    store.load(query);
    http
      .expectOne(() => true)
      .flush({ ...environmentSample(), blockId: '00000000-0000-4000-8000-000000000999' });
    expect(store.status()).toBe('UNAVAILABLE');
    expect(store.data()).toBeNull();
  });
  it.each([401, 403])('clears protected data and stops hidden resume after %i', (status) => {
    store.load(query);
    http.expectOne(() => true).flush({}, { status, statusText: 'Denied' });
    expect(store.data()).toBeNull();
    expect(store.status()).toBe('DENIED');
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    http.expectNone(() => true);
  });
  it('distinguishes unknown block from unavailable projection', () => {
    for (const status of [404, 503]) {
      store.load(query);
      http.expectOne(() => true).flush({}, { status, statusText: 'Fixture' });
      expect(store.status()).toBe(status === 404 ? 'UNKNOWN' : 'UNAVAILABLE');
      expect(store.data()).toBeNull();
    }
  });
  it('pauses pending reads while hidden and requires a fresh response on return', () => {
    store.load(query);
    const old = http.expectOne(() => true);
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(old.cancelled).toBe(true);
    expect(store.status()).toBe('PAUSED');
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    http.expectOne(() => true).flush(environmentSample());
    expect(store.status()).toBe('READY');
  });
  it('destroys the pending subscription and visibility handler', () => {
    store.load(query);
    const request = http.expectOne(() => true);
    TestBed.resetTestingModule();
    expect(request.cancelled).toBe(true);
    document.dispatchEvent(new Event('visibilitychange'));
    http.expectNone(() => true);
  });
});
describe('Environmental wire and time boundaries', () => {
  it('requires explicit positive half-open UTC windows of at most 24 hours', () => {
    expect(validEnvironmentQuery(query)).toBe(true);
    for (const change of [
      { to: query.from },
      { to: '2026-01-02T00:00:00.001Z' },
      { from: '2026-01-01T00:00:00+00:00' },
      { from: '2026-02-30T00:00:00Z' },
      { from: '2026-01-01T24:00:00Z' },
    ])
      expect(validEnvironmentQuery({ ...query, ...change })).toBe(false);
  });
  it('preserves none/zero/conflict/truncation and exact source identity', () => {
    expect(validEnvironmentHistory(environmentSample(), query)).toBe(true);
    for (const change of [
      { dataProvenance: 'REAL' },
      { projectionState: 'COMPLETE' },
      { truncated: true },
      { availability: 'NONE' },
      { totalMatchingCount: '4' },
      { blockId: '00000000-0000-4000-8000-000000000999' },
    ])
      expect(
        validEnvironmentHistory({ ...environmentSample(), ...change } as typeof sample, query),
      ).toBe(false);
    const none = environmentSample();
    none.observations = [];
    none.totalMatchingCount = '0';
    none.availability = 'NONE';
    none.returnedKindCounts = { AIR_TEMPERATURE: 0, SOIL_MOISTURE: 0, INTERVAL_RAINFALL: 0 };
    none.projectionState = 'INCOMPLETE';
    none.conflictCount = 1;
    expect(validEnvironmentHistory(none, query)).toBe(true);
    const bad = environmentSample();
    bad.observations[0].value = '1e0';
    expect(validEnvironmentHistory(bad, query)).toBe(false);
    const end = environmentSample();
    end.observations[0].observedAt = query.to;
    expect(validEnvironmentHistory(end, query)).toBe(false);
  });
});
