import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { CONFIG } from '../../core/config';
import {
  EnvironmentHistory,
  EnvironmentQuery,
  canonicalId,
  validEnvironmentQuery,
  validEnvironmentHistory,
} from './environment-state';
@Injectable()
export class EnvironmentalStore {
  private readonly http = inject(HttpClient);
  private readonly config = inject(CONFIG);
  private readonly document = inject(DOCUMENT);
  private request?: Subscription;
  private generation = 0;
  private estate = '';
  private allowed = false;
  private last?: EnvironmentQuery;
  readonly data = signal<EnvironmentHistory | null>(null);
  readonly status = signal('EMPTY');
  readonly message = signal(
    'Choose a block and UTC window to read materialized environmental history.',
  );
  private abort() {
    this.generation++;
    this.request?.unsubscribe();
    this.request = undefined;
    this.data.set(null);
  }
  private readonly visibility = () => {
    this.abort();
    if (this.document.visibilityState === 'hidden') {
      this.status.set('PAUSED');
      this.message.set('Environmental history refresh paused while hidden.');
    } else if (this.last && this.allowed) this.load(this.last);
  };
  constructor() {
    this.document.addEventListener('visibilitychange', this.visibility);
    inject(DestroyRef).onDestroy(() => {
      this.abort();
      this.document.removeEventListener('visibilitychange', this.visibility);
    });
  }
  scope(estate: string, allowed: boolean) {
    if (estate === this.estate && allowed === this.allowed) return;
    this.abort();
    this.estate = estate;
    this.allowed = allowed;
    this.last = undefined;
    this.status.set(allowed ? 'EMPTY' : 'DENIED');
    this.message.set(
      allowed
        ? 'Choose a block and UTC window.'
        : 'Environmental history is not permitted for this estate and session.',
    );
  }
  selectionChanged() {
    this.abort();
    this.last = undefined;
    this.status.set(this.allowed ? 'EMPTY' : 'DENIED');
    this.message.set(
      this.allowed
        ? 'Choose a block and UTC window, then read history.'
        : 'Environmental history access denied.',
    );
  }
  load(q: EnvironmentQuery) {
    if (
      !this.allowed ||
      !canonicalId(this.estate) ||
      q.estateId !== this.estate ||
      !validEnvironmentQuery(q)
    ) {
      this.abort();
      this.status.set('INVALID');
      this.message.set(
        'Choose valid canonical scope and an explicit UTC window of at most 24 hours.',
      );
      return;
    }
    this.abort();
    this.last = { ...q };
    if (this.document.visibilityState === 'hidden') {
      this.status.set('PAUSED');
      return;
    }
    const generation = this.generation;
    this.status.set('PENDING');
    this.message.set('Reading environmental observations…');
    this.request = this.http
      .get<EnvironmentHistory>(
        `${this.config.apiBaseUrl}/api/v1/analytics/estates/${q.estateId}/blocks/${q.blockId}/environment/observations`,
        { params: { from: q.from, to: q.to } },
      )
      .subscribe({
        next: (value) => {
          if (generation !== this.generation) return;
          if (!validEnvironmentHistory(value, q)) {
            this.status.set('UNAVAILABLE');
            this.message.set(
              'Environmental history is inconsistent with the selected scope, window or supported count precision.',
            );
            return;
          }
          this.data.set(value);
          this.status.set('READY');
          this.message.set('');
        },
        error: (error: unknown) => {
          if (generation !== this.generation) return;
          const status = error instanceof HttpErrorResponse ? error.status : 0;
          this.status.set(
            status === 401 || status === 403
              ? 'DENIED'
              : status === 404
                ? 'UNKNOWN'
                : 'UNAVAILABLE',
          );
          this.message.set(
            status === 401 || status === 403
              ? 'Environmental history access denied.'
              : status === 404
                ? 'The canonical block is unknown or inactive.'
                : 'Materialized environmental history is unavailable. Retry when connected.',
          );
          if (status === 401 || status === 403) {
            this.allowed = false;
            this.last = undefined;
          }
        },
      });
  }
}
