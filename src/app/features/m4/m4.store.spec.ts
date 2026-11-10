import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../core/config';
import { Forecast, M4Query, M4Store, validForecast } from './m4.store';
const estateId = '00000000-0000-0000-0000-000000000001';
const blockId = '00000000-0000-0000-0000-000000000002';
const query: M4Query = {
  estateId,
  blockId,
  datasetId: 'a'.repeat(64),
  mode: 'GENERATED_POINT_IN_TIME',
  asOf: '2026-08-08T00:00:00Z',
  labelAsOf: '2026-08-09T00:00:00Z',
};
function sample(): Forecast {
  return {
    scope: { estateId, blockId },
    datasetId: query.datasetId,
    mode: query.mode,
    asOf: query.asOf,
    targetDate: '2026-08-08',
    estateTimezone: 'UTC',
    labelAsOf: query.labelAsOf,
    targets: (['WET', 'DRY'] as const).map((target) => ({
      target,
      modelId: 'b'.repeat(64),
      comparatorModelId: 'c'.repeat(64),
      status: 'ELIGIBLE',
      predictedKg: '10.000',
      comparatorKg: '10.000',
      sources: [],
      anomalyStatus: 'FLAGGED',
      actualKg: '16.000',
      residualKg: '6.000',
      thresholdKg: target === 'WET' ? '5.000' : '1.000',
      labelStatus: 'ELIGIBLE',
      labelSources: [],
    })),
    sourceDataProvenance: 'SIMULATED',
    forecastProvenance: 'PREDICTED',
    coverage: 'OBSERVED_ONLY',
    uncertainty: 'UNCALIBRATED',
  };
}
describe('M4 scope, chronology, exact mass and evidence state', () => {
  let store: M4Store;
  let http: HttpTestingController;
  let visibility: DocumentVisibilityState;
  beforeEach(() => {
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    TestBed.configureTestingModule({
      providers: [
        M4Store,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CONFIG, useValue: { apiBaseUrl: 'https://gateway.example.invalid' } },
      ],
    });
    store = TestBed.inject(M4Store);
    http = TestBed.inject(HttpTestingController);
    store.scope(`${estateId}:${blockId}:generated-subject`, true);
  });
  afterEach(() => {
    http.verify({ ignoreCancelled: true });
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  it('displays eligible exact strings only for the requested scope and cutoff', () => {
    store.load(query);
    http.expectOne(() => true).flush(sample());
    expect(store.data()?.targets[0].predictedKg).toBe('10.000');
    expect(store.status()).toBe('READY');
  });
  it('rejects cross-scope or changed dataset replies', () => {
    for (const f of [
      { ...sample(), scope: { estateId, blockId: estateId } },
      { ...sample(), datasetId: 'd'.repeat(64) },
    ]) {
      store.load(query);
      http.expectOne(() => true).flush(f);
      expect(store.data()).toBeNull();
    }
  });
  it('rejects future labels disguised as feature sources and inconsistent residual arithmetic', () => {
    const f = sample();
    f.targets[0].residualKg = '0.000';
    expect(validForecast(f, query)).toBe(false);
    const wrong = sample();
    wrong.targets[0].sources.push({
      eventId: blockId,
      collectionId: blockId,
      version: 0,
      bodyHash: 'c'.repeat(64),
      collectionDate: '2026-08-01',
      sourceAt: query.asOf,
      availableAt: query.asOf,
    });
    expect(validForecast(wrong, query)).toBe(false);
  });
  it('cancels outstanding reads and clears answers on account or block change', () => {
    store.load(query);
    const pending = http.expectOne(() => true);
    store.scope(`${estateId}:${blockId}:another-subject`, true);
    expect(pending.cancelled).toBe(true);
    expect(store.data()).toBeNull();
    expect(store.answer()).toBeNull();
  });
  it('stops reads after denied response and clears on hidden page', () => {
    store.load(query);
    http.expectOne(() => true).flush({}, { status: 403, statusText: 'Denied' });
    expect(store.status()).toBe('DENIED');
    store.load(query);
    http.expectNone(() => true);
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(store.data()).toBeNull();
  });
  it('does not turn absent prediction or label into zero', () => {
    const f = sample();
    f.targets[0] = {
      ...f.targets[0],
      status: 'INSUFFICIENT_HISTORY',
      predictedKg: null,
      comparatorKg: null,
      actualKg: null,
      residualKg: null,
      anomalyStatus: 'UNSCORED',
    };
    store.load(query);
    http.expectOne(() => true).flush(f);
    expect(store.data()?.targets[0].predictedKg).toBeNull();
    expect(store.status()).toBe('READY');
  });
  it('restricts evidence links to the same scope and internal supported routes', () => {
    expect(
      store.safeLink(
        query,
        `/api/v1/ai/estates/${estateId}/blocks/${blockId}/models/${'b'.repeat(64)}?datasetId=${query.datasetId}`,
      ),
    ).toBe(true);
    for (const href of [
      'https://evil.invalid/api/v1/ai/',
      '//evil.invalid/',
      'javascript:alert(1)',
      `/api/v1/ai/estates/${blockId}/blocks/${blockId}/production/baselines`,
    ])
      expect(store.safeLink(query, href)).toBe(false);
  });
  it('cancels superseded intents and evidence reads within the same selected block', () => {
    store.load(query);
    http.expectOne(() => true).flush(sample());
    store.ask(query, 'FORECAST_EXPLANATION');
    const oldAnswer = http.expectOne(() => true);
    store.ask(query, 'ANOMALY_EXPLANATION');
    const currentAnswer = http.expectOne(() => true);
    expect(oldAnswer.cancelled).toBe(true);
    currentAnswer.flush({
      scope: { estateId, blockId },
      provider: 'DETERMINISTIC_EVIDENCE_V1',
      templateVersion: 'M4_EVIDENCE_TEMPLATES_V1',
      status: 'ANSWERED',
      intent: 'ANOMALY_EXPLANATION',
      statements: [],
      limitations: [],
    });
    expect(store.answer()?.intent).toBe('ANOMALY_EXPLANATION');
    const link =
      store.prefix(query) + '/models/' + 'b'.repeat(64) + '?datasetId=' + query.datasetId;
    store.inspect(query, link);
    const oldEvidence = http.expectOne(() => true);
    store.inspect(query, link);
    const currentEvidence = http.expectOne(() => true);
    expect(oldEvidence.cancelled).toBe(true);
    currentEvidence.flush({ stage: 'DEMO_ONLY' });
    expect(store.inspection()).toEqual({ stage: 'DEMO_ONLY' });
  });
});
