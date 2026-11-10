import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CONFIG } from '../../core/config';
import { TelemetryStore, TELEMETRY_NOW } from './telemetry.store';
import { LatestReadings, freshness, validLatest } from './telemetry-state';
const estate = '00000000-0000-4000-8000-000000000001';
const block = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
const generated = '2026-01-01T12:00:00Z';
export function sample(): LatestReadings {
  return {
    estateId: estate,
    blockId: block,
    generatedAt: generated,
    dataProvenance: 'SIMULATED',
    coverage: 'PARTIAL',
    readings: [
      {
        schemaVersion: 1,
        observationId: '00000000-0000-4000-8000-000000000004',
        deviceId: '00000000-0000-4000-8000-000000000005',
        estateId: estate,
        blockId: block,
        kind: 'AIR_TEMPERATURE',
        unit: 'CELSIUS',
        value: '27.500000',
        observedAt: generated,
        receivedAt: generated,
        dataProvenance: 'SIMULATED',
      },
    ],
  };
}
describe('Telemetry selected-block state', () => {
  let store: TelemetryStore;
  let http: HttpTestingController;
  let now: number;
  let visibility: DocumentVisibilityState;
  beforeEach(() => {
    vi.useFakeTimers();
    now = 1000;
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    TestBed.configureTestingModule({
      providers: [
        TelemetryStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CONFIG, useValue: { apiBaseUrl: 'https://gateway.example.invalid' } },
        { provide: TELEMETRY_NOW, useValue: () => now },
      ],
    });
    store = TestBed.inject(TelemetryStore);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify({ ignoreCancelled: true });
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  function selected() {
    store.select(estate, block, true);
    return http.expectOne((r) => r.url.endsWith(`/${block}/latest`));
  }
  it('does not query for no selection, malformed IDs or denied scope', () => {
    store.select('', '', true);
    store.select('other', block, true);
    store.select(estate, block, false);
    expect(store.status()).toBe('DENIED');
    http.expectNone(() => true);
  });
  it('preserves exact decimal strings and presence coverage without zero filling', () => {
    selected().flush(sample());
    expect(store.status()).toBe('READY');
    expect(store.data()?.readings[0].value).toBe('27.500000');
    expect(store.data()?.coverage).toBe('PARTIAL');
    expect(store.data()?.readings).toHaveLength(1);
  });
  it('cancels old selection and immediately clears its readings and tint', () => {
    const old = selected();
    store.select(estate, other, true);
    expect(old.cancelled).toBe(true);
    expect(store.data()).toBeNull();
    http
      .expectOne((r) => r.url.endsWith(`/${other}/latest`))
      .flush({ ...sample(), blockId: other, coverage: 'NONE', readings: [] });
    expect(store.data()?.blockId).toBe(other);
  });
  it('rejects a late cross-block response even from the current request', () => {
    selected().flush({ ...sample(), blockId: other });
    expect(store.data()).toBeNull();
    expect(store.status()).toBe('UNAVAILABLE');
  });
  it('pauses on hidden and invalidates pending requests, then requires a new response', () => {
    selected().flush(sample());
    store.refresh();
    const pending = http.expectOne(() => true);
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pending.cancelled).toBe(true);
    expect(store.status()).toBe('PAUSED');
    now += 100000;
    vi.advanceTimersByTime(100000);
    http.expectNone(() => true);
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(store.status()).toBe('PENDING');
    http.expectOne(() => true).flush(sample());
    expect(store.status()).toBe('READY');
  });
  it.each([401, 403])('clears readings and stops polling on server denial %i', (status) => {
    selected().flush(sample());
    store.refresh();
    http.expectOne(() => true).flush({}, { status, statusText: 'Denied' });
    expect(store.status()).toBe('DENIED');
    expect(store.data()).toBeNull();
    now += 60000;
    vi.advanceTimersByTime(60000);
    http.expectNone(() => true);
  });
  it('separates unknown reference and outage while retaining only labelled same-block last-known data', () => {
    selected().flush(sample());
    store.refresh();
    http.expectOne(() => true).flush({}, { status: 503, statusText: 'Unavailable' });
    expect(store.status()).toBe('UNAVAILABLE');
    expect(store.data()?.blockId).toBe(block);
    store.overlayEnabled.set(true);
    expect(store.tint()).toBeUndefined();
    store.refresh();
    http.expectOne(() => true).flush({}, { status: 404, statusText: 'Unknown' });
    expect(store.status()).toBe('UNKNOWN_BLOCK');
    expect(store.data()).toBeNull();
  });
  it('uses monotonic elapsed time for age and only foreground bounded polling', () => {
    selected().flush(sample());
    store.overlayEnabled.set(true);
    now += 1000;
    vi.advanceTimersByTime(1000);
    expect(store.state(sample().readings[0])).toBe('CURRENT');
    now += 30000;
    vi.advanceTimersByTime(1000);
    http.expectOne(() => true).flush(sample());
    expect(store.data()?.estateId).toBe(estate);
  });
  it('unsubscribes and clears its timer on route destruction', () => {
    const request = selected();
    TestBed.resetTestingModule();
    expect(request.cancelled).toBe(true);
    now += 60000;
    vi.advanceTimersByTime(60000);
    http.expectNone(() => true);
  });
});
describe('Telemetry wire and age rules', () => {
  it('has inclusive age boundary, distinct clock-ahead and absent states', () => {
    const r = sample().readings[0];
    const time = Date.parse(generated);
    expect(freshness(r, time + 300000, 300)).toBe('CURRENT');
    expect(freshness(r, time + 300001, 300)).toBe('STALE');
    expect(freshness(r, time - 1, 300)).toBe('CLOCK_AHEAD');
    expect(freshness(undefined, time, 300)).toBe('NONE');
  });
  it('rejects wrong provenance, duplicate kinds, impossible times, unit and coverage lies', () => {
    expect(validLatest(sample(), estate, block)).toBe(true);
    expect(validLatest({ ...sample(), coverage: 'COMPLETE' }, estate, block)).toBe(false);
    expect(
      validLatest(
        { ...sample(), readings: [sample().readings[0], sample().readings[0]] },
        estate,
        block,
      ),
    ).toBe(false);
    const invalid = structuredClone(sample());
    invalid.readings[0].observedAt = '2026-02-30T12:00:00Z';
    expect(validLatest(invalid, estate, block)).toBe(false);
    const real = structuredClone(sample());
    (real as { dataProvenance: string }).dataProvenance = 'REAL';
    expect(validLatest(real, estate, block)).toBe(false);
  });
});
