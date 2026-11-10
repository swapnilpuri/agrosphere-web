import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { CONFIG } from '../../core/config';
import { ProductionStore } from './production.store';
import { validHistory, validQuery, trend } from './production-state';
import { productionSample } from '../../../../e2e/production-fixtures';
const sample = productionSample();
const query = {
  estateId: sample.estateId,
  blockId: sample.blockId,
  from: sample.from,
  to: sample.to,
};
describe('Materialized production state', () => {
  let store: ProductionStore;
  let http: HttpTestingController;
  let visibility: DocumentVisibilityState;
  beforeEach(() => {
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    TestBed.configureTestingModule({
      providers: [
        ProductionStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CONFIG, useValue: { apiBaseUrl: 'https://gateway.example.invalid' } },
      ],
    });
    store = TestBed.inject(ProductionStore);
    http = TestBed.inject(HttpTestingController);
    store.scope(query.estateId, true);
  });
  afterEach(() => {
    http.verify({ ignoreCancelled: true });
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  it('keeps exact masses, unknown DRC and absent days distinct', () => {
    store.load(query);
    http
      .expectOne((r) => r.url.includes('/analytics/') && r.params.get('from') === query.from)
      .flush(productionSample());
    expect(store.data()?.days[0].metrics?.totalWetLatexKg).toBe('10.000');
    expect(store.data()?.days[0].metrics?.knownDryRubberKg).toBeNull();
    expect(store.data()?.days[1].metrics).toBeNull();
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
      .flush({ ...productionSample(), blockId: '00000000-0000-4000-8000-000000000999' });
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
    http.expectOne(() => true).flush(productionSample());
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
describe('Production wire checks and illustrative trend', () => {
  it('rejects false completeness, unsafe count precision and mixed provenance', () => {
    expect(validHistory(productionSample(), query)).toBe(true);
    for (const change of [
      { projectionState: 'COMPLETE' },
      { dataProvenance: 'REAL' },
      { conflictCount: Number.MAX_SAFE_INTEGER + 1 },
      { workerId: 'not-shared' },
    ])
      expect(validHistory({ ...productionSample(), ...change } as typeof sample, query)).toBe(
        false,
      );
    const inconsistent = productionSample();
    inconsistent.days[0].metrics!.knownDryRubberKg = '0.000';
    expect(validHistory(inconsistent, query)).toBe(false);
  });
  it('validates real date ordering and the inclusive 367-date boundary', () => {
    expect(validQuery({ ...query, from: '2026-02-30' })).toBe(false);
    expect(validQuery({ ...query, to: '2025-12-31' })).toBe(false);
    expect(validQuery({ ...query, to: '2027-01-02' })).toBe(true);
    expect(validQuery({ ...query, to: '2027-01-03' })).toBe(false);
  });
  it('uses bounded integer ratios for huge exact masses and never fills unknown dry points', () => {
    const data = productionSample();
    data.days[0].metrics!.totalWetLatexKg = '9'.repeat(100) + '.000';
    data.days[0].metrics!.pendingWetLatexKg = data.days[0].metrics!.totalWetLatexKg;
    expect(validHistory(data, query)).toBe(true);
    expect(trend(data, 'totalWetLatexKg').join()).not.toMatch(/NaN|Infinity/);
    expect(trend(data, 'knownDryRubberKg')).toEqual([]);
  });
});
