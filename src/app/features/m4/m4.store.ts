import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { CONFIG } from '../../core/config';
import type { components } from '../../../api/ai.generated';

export type Forecast = components['schemas']['Forecast'];
export type Answer = components['schemas']['AssistantAnswer'];
export interface M4Query {
  estateId: string;
  blockId: string;
  datasetId: string;
  mode: 'GENERATED_POINT_IN_TIME' | 'LIVE_FIRST_RECEIPT';
  asOf: string;
  labelAsOf: string;
}
const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const hash = /^[0-9a-f]{64}$/;
const instant = (v: string) => /(?:Z|\+00:00)$/.test(v) && Number.isFinite(Date.parse(v));
const kg = (v: string) => BigInt(v.replace('.', ''));
const mass = (v: unknown): v is string =>
  typeof v === 'string' && /^-?(?:0|[1-9][0-9]*)\.[0-9]{3}$/.test(v);
export function validForecast(f: Forecast, q: M4Query) {
  try {
    return (
      f.scope.estateId === q.estateId &&
      f.scope.blockId === q.blockId &&
      f.datasetId === q.datasetId &&
      f.mode === q.mode &&
      Date.parse(f.asOf) === Date.parse(q.asOf) &&
      (f.labelAsOf === null ? !q.labelAsOf : Date.parse(f.labelAsOf) === Date.parse(q.labelAsOf)) &&
      f.sourceDataProvenance === 'SIMULATED' &&
      f.forecastProvenance === 'PREDICTED' &&
      f.coverage === 'OBSERVED_ONLY' &&
      f.uncertainty === 'UNCALIBRATED' &&
      f.targets.length === 2 &&
      f.targets.map((r) => r.target).join() === 'WET,DRY' &&
      f.targets.every(
        (r) =>
          hash.test(r.modelId) &&
          hash.test(r.comparatorModelId) &&
          r.thresholdKg === (r.target === 'WET' ? '5.000' : '1.000') &&
          ['ELIGIBLE', 'INSUFFICIENT_HISTORY', 'INCOMPLETE_SOURCE', 'PENDING_DRC'].includes(
            r.status,
          ) &&
          (r.status === 'ELIGIBLE' ? mass(r.predictedKg) : r.predictedKg === null) &&
          (r.comparatorKg === null || mass(r.comparatorKg)) &&
          (r.actualKg === null || mass(r.actualKg)) &&
          (r.residualKg === null || mass(r.residualKg)) &&
          r.sources.every(
            (s) =>
              id.test(s.eventId) &&
              id.test(s.collectionId) &&
              hash.test(s.bodyHash) &&
              Number.isSafeInteger(s.version) &&
              s.version >= 0 &&
              Date.parse(s.sourceAt) < Date.parse(f.asOf) &&
              Date.parse(s.availableAt) < Date.parse(f.asOf) &&
              s.collectionDate < f.targetDate,
          ) &&
          (f.labelAsOf === null
            ? r.actualKg === null &&
              r.residualKg === null &&
              r.anomalyStatus === 'NOT_EVALUATED' &&
              r.labelSources.length === 0
            : r.actualKg === null || r.predictedKg === null
              ? r.residualKg === null && r.anomalyStatus === 'UNSCORED'
              : r.residualKg !== null) &&
          r.labelSources.every(
            (s) =>
              f.labelAsOf !== null &&
              Date.parse(s.sourceAt) < Date.parse(f.labelAsOf) &&
              Date.parse(s.availableAt) < Date.parse(f.labelAsOf),
          ) &&
          (r.residualKg === null ||
            (r.actualKg !== null &&
              r.predictedKg !== null &&
              kg(r.residualKg) === kg(r.actualKg) - kg(r.predictedKg) &&
              r.anomalyStatus ===
                ((kg(r.residualKg) < 0n ? -kg(r.residualKg) : kg(r.residualKg)) > kg(r.thresholdKg)
                  ? 'FLAGGED'
                  : 'NOT_FLAGGED'))),
      )
    );
  } catch {
    return false;
  }
}

@Injectable()
export class M4Store {
  private readonly http = inject(HttpClient);
  private readonly config = inject(CONFIG);
  private readonly document = inject(DOCUMENT);
  private requests: Subscription[] = [];
  private answerRequest?: Subscription;
  private inspectionRequest?: Subscription;
  private generation = 0;
  private key = '';
  private allowed = false;
  readonly data = signal<Forecast | null>(null);
  readonly answer = signal<Answer | null>(null);
  readonly inspection = signal<unknown>(null);
  readonly status = signal('EMPTY');
  readonly message = signal('Choose an evaluation dataset and explicit cutoffs.');
  constructor() {
    const hide = () => {
      if (this.document.visibilityState === 'hidden') this.reset();
    };
    this.document.addEventListener('visibilitychange', hide);
    inject(DestroyRef).onDestroy(() => {
      this.reset();
      this.document.removeEventListener('visibilitychange', hide);
    });
  }
  reset() {
    this.generation++;
    for (const r of this.requests) r.unsubscribe();
    this.requests = [];
    this.data.set(null);
    this.answer.set(null);
    this.inspection.set(null);
    this.status.set('EMPTY');
  }
  scope(key: string, allowed: boolean) {
    this.reset();
    this.key = key;
    this.allowed = allowed;
    if (!allowed) {
      this.status.set('DENIED');
      this.message.set('AI evidence is not permitted for this estate and session.');
    }
  }
  prefix(q: M4Query) {
    return `/api/v1/ai/estates/${q.estateId}/blocks/${q.blockId}`;
  }
  private valid(q: M4Query) {
    return (
      this.allowed &&
      id.test(q.estateId) &&
      id.test(q.blockId) &&
      hash.test(q.datasetId) &&
      instant(q.asOf) &&
      (!q.labelAsOf || instant(q.labelAsOf)) &&
      ['GENERATED_POINT_IN_TIME', 'LIVE_FIRST_RECEIPT'].includes(q.mode) &&
      this.key.startsWith(`${q.estateId}:${q.blockId}:`) &&
      this.document.visibilityState !== 'hidden'
    );
  }
  private failed(error: unknown) {
    const code = error instanceof HttpErrorResponse ? error.status : 0;
    this.data.set(null);
    this.answer.set(null);
    this.inspection.set(null);
    this.status.set(code === 401 || code === 403 ? 'DENIED' : 'UNAVAILABLE');
    if (code === 401 || code === 403) this.allowed = false;
    this.message.set('Evidence unavailable or denied. No prediction or answer is inferred.');
  }
  load(q: M4Query) {
    this.reset();
    if (!this.valid(q)) {
      this.status.set('INVALID');
      this.message.set('Select canonical scope, dataset fingerprint and explicit UTC cutoffs.');
      return;
    }
    const generation = this.generation;
    this.status.set('PENDING');
    const params = {
      datasetId: q.datasetId,
      mode: q.mode,
      asOf: q.asOf,
      ...(q.labelAsOf ? { labelAsOf: q.labelAsOf } : {}),
    };
    this.requests.push(
      this.http
        .get<Forecast>(this.config.apiBaseUrl + this.prefix(q) + '/production/baselines', {
          params,
        })
        .subscribe({
          next: (f) => {
            if (generation !== this.generation) return;
            if (!validForecast(f, q)) {
              this.failed(null);
              return;
            }
            this.data.set(f);
            this.status.set('READY');
            this.message.set('');
          },
          error: (e) => {
            if (generation === this.generation) this.failed(e);
          },
        }),
    );
  }
  ask(q: M4Query, intent: components['schemas']['AssistantRequest']['intent']) {
    this.answerRequest?.unsubscribe();
    this.inspectionRequest?.unsubscribe();
    this.answer.set(null);
    this.inspection.set(null);
    if (!this.valid(q) || !this.data()) return;
    const generation = this.generation;
    this.requests.push(
      (this.answerRequest = this.http
        .post<Answer>(this.config.apiBaseUrl + this.prefix(q) + '/assistant', {
          datasetId: q.datasetId,
          mode: q.mode,
          asOf: q.asOf,
          labelAsOf: q.labelAsOf || null,
          intent,
          environmentFrom: null,
          environmentTo: null,
        })
        .subscribe({
          next: (a) => {
            if (generation !== this.generation) return;
            if (
              a.scope.estateId !== q.estateId ||
              a.scope.blockId !== q.blockId ||
              a.provider !== 'DETERMINISTIC_EVIDENCE_V1' ||
              a.templateVersion !== 'M4_EVIDENCE_TEMPLATES_V1' ||
              a.intent !== intent ||
              !['ANSWERED', 'PARTIAL', 'REFUSED'].includes(a.status) ||
              a.statements.length > 10 ||
              a.statements.some(
                (s) => s.text.length > 500 || s.evidenceRefs.some((r) => !this.safeLink(q, r.href)),
              )
            ) {
              this.failed(null);
              return;
            }
            this.answer.set(a);
          },
          error: (e) => {
            if (generation === this.generation) this.failed(e);
          },
        })),
    );
  }
  safeLink(q: M4Query, href: string) {
    try {
      const u = new URL(href, 'https://evidence.invalid');
      const prefix = `/api/v1/(?:ai|analytics)/estates/${q.estateId}/blocks/${q.blockId}`;
      return (
        u.origin === 'https://evidence.invalid' &&
        !u.hash &&
        new RegExp(
          `^${prefix}/(?:production/(?:baselines|daily)|models/[0-9a-f]{64}|evaluations/[0-9a-f]{64}|environment/observations)$`,
        ).test(u.pathname)
      );
    } catch {
      return false;
    }
  }
  inspect(q: M4Query, href: string) {
    this.inspectionRequest?.unsubscribe();
    this.inspection.set(null);
    if (!this.valid(q) || !this.safeLink(q, href)) return;
    const generation = this.generation;
    this.requests.push(
      (this.inspectionRequest = this.http.get<unknown>(this.config.apiBaseUrl + href).subscribe({
        next: (v) => {
          if (generation === this.generation) this.inspection.set(v);
        },
        error: (e) => {
          if (generation === this.generation) this.failed(e);
        },
      })),
    );
  }
}
