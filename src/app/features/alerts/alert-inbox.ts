import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import { EstateStore } from '../estates/estate.store';
import { AlertCounts, AlertsApi } from './alerts.api';

/** One selected-estate poller per shell. Data and tokens stay in memory. */
@Injectable()
export class AlertInbox {
  private readonly auth = inject(AuthService);
  private readonly store = inject(EstateStore);
  private readonly api = inject(AlertsApi);
  private readonly destroy = inject(DestroyRef);
  readonly counts = signal<AlertCounts | null>(null);
  readonly unavailable = signal(false);
  readonly lastSuccess = signal('');
  readonly permitted = computed(() => this.auth.canReadCropHealth(this.store.estateId()));
  readonly context = computed(() =>
    JSON.stringify([
      this.auth.authenticated(),
      this.auth.roles(),
      this.auth.estateIds(),
      this.store.estateId(),
    ]),
  );
  private request?: Subscription;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private failures = 0;
  private retryAt = 0;
  private active = false;
  constructor() {
    effect(() => {
      this.context();
      untracked(() => {
        this.reset();
        this.refresh();
      });
    });
    const resume = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) this.refresh();
      else {
        this.stopTimer();
        if (!navigator.onLine) {
          this.counts.set(null);
          this.unavailable.set(true);
        }
      }
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', resume);
    window.addEventListener('focus', resume);
    this.destroy.onDestroy(() => {
      this.reset();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', resume);
      window.removeEventListener('focus', resume);
    });
  }
  private stopTimer() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
  private reset() {
    this.generation++;
    this.request?.unsubscribe();
    this.active = false;
    this.stopTimer();
    this.counts.set(null);
    this.lastSuccess.set('');
    this.unavailable.set(false);
    this.failures = 0;
    this.retryAt = 0;
  }
  private later(ms: number) {
    this.stopTimer();
    if (document.visibilityState !== 'visible' || !navigator.onLine || !this.permitted()) return;
    this.timer = setTimeout(() => this.refresh(), ms);
  }
  refresh() {
    if (
      !this.permitted() ||
      this.active ||
      document.visibilityState !== 'visible' ||
      !navigator.onLine
    )
      return;
    if (Date.now() < this.retryAt) {
      this.later(this.retryAt - Date.now());
      return;
    }
    this.stopTimer();
    const generation = this.generation;
    this.active = true;
    this.request = this.api
      .get<AlertCounts>('/counts?estateId=' + encodeURIComponent(this.store.estateId()))
      .subscribe({
        next: (counts) => {
          if (generation !== this.generation) return;
          this.active = false;
          if (!navigator.onLine) {
            this.counts.set(null);
            this.unavailable.set(true);
            return;
          }
          this.failures = 0;
          this.retryAt = 0;
          this.counts.set(counts);
          this.lastSuccess.set(counts.generatedAt);
          this.unavailable.set(false);
          this.later(30_000 + Math.random() * 5_000);
        },
        error: (error: HttpErrorResponse) => {
          if (generation !== this.generation) return;
          this.active = false;
          this.counts.set(null);
          this.unavailable.set(true);
          if (error.status === 401) {
            this.auth.clear();
            return;
          }
          if (error.status === 403) {
            this.lastSuccess.set('');
            return;
          }
          let delay = Math.min(300_000, 30_000 * 2 ** this.failures++);
          if (error.status === 429) {
            const retry = error.headers?.get('Retry-After');
            const ms =
              retry && /^\d+$/.test(retry)
                ? Number(retry) * 1000
                : retry
                  ? Date.parse(retry) - Date.now()
                  : 0;
            if (Number.isFinite(ms)) delay = Math.max(delay, ms);
          }
          this.retryAt = Date.now() + delay;
          this.later(delay);
        },
      });
  }
}
