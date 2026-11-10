import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, DestroyRef, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { CONFIG } from '../../core/config';
import {
  LatestReadings,
  Reading,
  Freshness,
  canonicalId,
  freshness,
  telemetryColors,
  validLatest,
} from './telemetry-state';

export const TELEMETRY_NOW = new InjectionToken<() => number>('telemetry monotonic clock', {
  providedIn: 'root',
  factory: () => () => performance.now(),
});
type Status = 'EMPTY' | 'PENDING' | 'READY' | 'PAUSED' | 'DENIED' | 'UNKNOWN_BLOCK' | 'UNAVAILABLE';
@Injectable()
export class TelemetryStore {
  private readonly http = inject(HttpClient);
  private readonly config = inject(CONFIG);
  private readonly document = inject(DOCUMENT);
  private readonly now = inject(TELEMETRY_NOW);
  readonly selection = signal<{ estate: string; block: string } | null>(null);
  readonly data = signal<LatestReadings | null>(null);
  readonly status = signal<Status>('EMPTY');
  readonly overlayEnabled = signal(false);
  readonly elapsed = signal(0);
  readonly ageSeconds = this.bound(this.config.telemetry?.displayAgeSeconds, 300, 1, 86400);
  readonly pollSeconds = this.bound(this.config.telemetry?.pollSeconds, 30, 5, 300);
  private receivedAt = 0;
  private lastPoll = 0;
  private generation = 0;
  private key = '';
  private allowed = false;
  private destroyed = false;
  private request?: Subscription;
  private readonly onVisibility = () => {
    this.invalidate();
    if (this.selection() && this.allowed) {
      if (this.document.visibilityState === 'hidden') this.status.set('PAUSED');
      else this.refresh();
    }
  };
  readonly message = computed(
    () =>
      ({
        EMPTY: 'Select a block to view environmental readings.',
        PENDING: 'Refreshing environmental readings…',
        READY: '',
        PAUSED: 'Refresh paused while this page is hidden.',
        DENIED: 'Environmental readings are not permitted for this session and estate.',
        UNKNOWN_BLOCK: 'This block is unknown or inactive.',
        UNAVAILABLE: 'Environmental readings are unavailable. Retry when connected.',
      })[this.status()],
  );
  readonly tint = computed(() => {
    this.elapsed();
    if (!this.overlayEnabled() || this.status() !== 'READY') return undefined;
    const states = (this.data()?.readings ?? []).map((r) => this.state(r));
    const state: Freshness = states.includes('CLOCK_AHEAD')
      ? 'CLOCK_AHEAD'
      : states.includes('STALE')
        ? 'STALE'
        : states.length
          ? 'CURRENT'
          : 'NONE';
    return telemetryColors[state];
  });
  constructor() {
    this.document.addEventListener('visibilitychange', this.onVisibility);
    const timer = setInterval(() => {
      if (this.document.visibilityState === 'hidden' || !this.selection() || !this.allowed) return;
      this.elapsed.set(Math.max(0, this.now() - this.receivedAt));
      if (this.now() - this.lastPoll >= this.pollSeconds * 1000) this.refresh();
    }, 1000);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.invalidate();
      clearInterval(timer);
      this.document.removeEventListener('visibilitychange', this.onVisibility);
    });
  }
  private bound(value: number | undefined, fallback: number, min: number, max: number) {
    return value !== undefined && Number.isFinite(value) && value >= min && value <= max
      ? value
      : fallback;
  }
  private invalidate() {
    this.generation++;
    this.request?.unsubscribe();
    this.request = undefined;
  }
  select(estate: string, block: string, allowed: boolean) {
    const key = `${estate}/${block}/${allowed}`;
    if (key === this.key) return;
    this.key = key;
    this.invalidate();
    this.allowed = allowed;
    this.data.set(null);
    this.elapsed.set(0);
    const valid = canonicalId(estate) && canonicalId(block);
    this.selection.set(valid ? { estate, block } : null);
    this.status.set(
      !valid
        ? 'EMPTY'
        : !allowed
          ? 'DENIED'
          : this.document.visibilityState === 'hidden'
            ? 'PAUSED'
            : 'PENDING',
    );
    if (valid && allowed && this.document.visibilityState !== 'hidden') this.refresh();
  }
  refresh() {
    const selected = this.selection();
    if (this.destroyed || !selected || !this.allowed || this.document.visibilityState === 'hidden')
      return;
    this.invalidate();
    const generation = this.generation;
    this.lastPoll = this.now();
    this.status.set('PENDING');
    this.request = this.http
      .get<LatestReadings>(
        `${this.config.apiBaseUrl}/api/v1/telemetry/estates/${selected.estate}/blocks/${selected.block}/latest`,
      )
      .subscribe({
        next: (value) => {
          if (generation !== this.generation || this.destroyed) return;
          if (!validLatest(value, selected.estate, selected.block)) {
            this.status.set('UNAVAILABLE');
            return;
          }
          this.receivedAt = this.now();
          this.elapsed.set(0);
          this.data.set(value);
          this.status.set('READY');
        },
        error: (error: unknown) => {
          if (generation !== this.generation || this.destroyed) return;
          const status = error instanceof HttpErrorResponse ? error.status : 0;
          this.status.set(
            status === 401 || status === 403
              ? 'DENIED'
              : status === 404
                ? 'UNKNOWN_BLOCK'
                : 'UNAVAILABLE',
          );
          if (status === 401 || status === 403) this.allowed = false;
          if (status === 401 || status === 403 || status === 404) this.data.set(null);
        },
      });
  }
  state(reading?: Reading): Freshness {
    return freshness(
      reading,
      Date.parse(this.data()?.generatedAt ?? '') + this.elapsed(),
      this.ageSeconds,
    );
  }
}
