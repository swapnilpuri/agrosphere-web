import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, of, switchMap, takeWhile, timer } from 'rxjs';
import { SpatialApi } from '../../api/spatial/spatial.api';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { EstateStore } from '../estates/estate.store';
import { boundaryRequest, BoundaryRow, BoundaryTarget, previewBoundaries } from './boundary-import';
import type { components } from '../../../api/spatial.generated';

@Component({
  selector: 'agro-boundary-import',
  standalone: true,
  templateUrl: './boundary-import.component.html',
  styleUrl: './administration.component.css',
})
export class BoundaryImportComponent {
  readonly store = inject(EstateStore);
  readonly auth = inject(AuthService);
  private readonly api = inject(SpatialApi);
  private readonly destroy = inject(DestroyRef);
  readonly rows = signal<BoundaryRow[]>([]);
  readonly filename = signal('');
  readonly provenance = signal('');
  readonly error = signal('');
  readonly reading = signal(false);
  readonly job = signal<components['schemas']['ImportJob'] | null>(null);
  readonly pending = computed(() => ['PENDING', 'VALIDATING'].includes(this.job()?.status ?? ''));
  private generation = 0;
  readonly targets = computed<BoundaryTarget[]>(() => {
    const estate = this.store.estate();
    const all: BoundaryTarget[] = estate
      ? [
          {
            key: 'ESTATE:' + estate.id,
            id: estate.id,
            kind: 'ESTATE',
            code: estate.estateCode,
            label: 'Estate · ' + estate.name,
          },
        ]
      : [];
    all.push(
      ...this.store.divisions().map((d) => ({
        key: 'DIVISION:' + d.id,
        id: d.id,
        kind: 'DIVISION' as const,
        code: d.divisionCode,
        label: 'Division · ' + d.divisionCode + ' · ' + d.name,
      })),
    );
    all.push(
      ...this.store.blocks().map((b) => ({
        key: 'BLOCK:' + b.id,
        id: b.id,
        kind: 'BLOCK' as const,
        code: b.blockCode,
        label: 'Field · ' + b.blockCode + ' · ' + b.name,
      })),
    );
    return all.filter(
      (target) =>
        !this.store
          .features()
          .some((f) => f.referenceEntityType === target.kind && f.referenceEntityId === target.id),
    );
  });
  readonly jobErrors = computed(() => {
    const report = this.job()?.validationReport as Record<string, unknown> | undefined;
    return Array.isArray(report?.['errors']) ? report['errors'].map(String) : [];
  });
  constructor() {
    this.destroy.onDestroy(() => this.store.previewingBoundaries.set(false));
    effect(() => this.store.previewingBoundaries.set(this.rows().length > 0));
    effect(() => {
      this.store.estateId();
      ++this.generation;
      this.rows.set([]);
      this.filename.set('');
      this.provenance.set('');
      this.error.set('');
      this.job.set(null);
      this.reading.set(false);
    });
  }
  resetPreview() {
    ++this.generation;
    this.rows.set([]);
    this.error.set('');
    this.job.set(null);
    this.provenance.set('');
  }
  clear() {
    if (!this.store.mutating() && window.confirm('Discard this boundary preview?'))
      this.resetPreview();
  }
  async read(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.store.mutating() || this.store.editingRecord()) return;
    const generation = ++this.generation;
    const estate = this.store.estateId();
    this.rows.set([]);
    this.job.set(null);
    this.error.set('');
    this.reading.set(true);
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose a GeoJSON file up to 1 MiB.');
      const raw = await file.text();
      if (generation !== this.generation || estate !== this.store.estateId()) return;
      const rows = previewBoundaries(raw, estate);
      this.filename.set(
        (
          'boundaries-' +
          file.name.replace(/[^A-Za-z0-9_.-]/g, '_').replace(/\.(geojson|json)$/i, '')
        ).slice(0, 180) + '.geojson',
      );
      this.rows.set(rows);
    } catch (error) {
      if (generation === this.generation) this.error.set(errorMessage(error));
    } finally {
      if (generation === this.generation) this.reading.set(false);
      input.value = '';
    }
  }
  map(index: number, key: string) {
    const target = this.targets().find((t) => t.key === key);
    this.rows.update((rows) =>
      rows.map((row, i) =>
        i === index
          ? {
              ...row,
              target: key,
              code: target ? (target.kind + '_' + target.code).slice(0, 64) : '',
            }
          : row,
      ),
    );
  }
  code(index: number, value: string) {
    this.rows.update((rows) => rows.map((row, i) => (i === index ? { ...row, code: value } : row)));
  }
  submit() {
    if (
      this.store.mutating() ||
      this.store.editingRecord() ||
      this.pending() ||
      this.store.busy() ||
      !this.auth.canManageEstate(this.store.estateId())
    )
      return;
    try {
      const body = boundaryRequest(
        this.store.estateId(),
        this.filename(),
        this.rows(),
        this.targets(),
        this.provenance(),
      );
      if (new TextEncoder().encode(JSON.stringify(body)).length > 1900000)
        throw new Error('The mapped request is too large. Split the file into smaller imports.');
      this.error.set('');
      this.store.mutating.set(true);
      this.api
        .importBoundaries(body)
        .pipe(
          switchMap((job) => {
            this.job.set(job);
            if (['COMPLETED', 'FAILED'].includes(job.status)) return of(job);
            return timer(0, 1000).pipe(
              switchMap(() => this.api.importJob(job.id)),
              takeWhile(
                (current, index) => !['COMPLETED', 'FAILED'].includes(current.status) && index < 29,
                true,
              ),
            );
          }),
          takeUntilDestroyed(this.destroy),
          finalize(() => this.store.mutating.set(false)),
        )
        .subscribe({
          next: (job) => {
            this.job.set(job);
            if (job.status === 'COMPLETED') {
              this.rows.set([]);
              this.store.reset();
            }
          },
          error: (error) =>
            this.error.set(
              errorMessage(error) +
                ' If a request timed out, check Digital twin before submitting again; the import may have committed.',
            ),
        });
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
  checkStatus() {
    const job = this.job();
    if (!job || this.store.mutating()) return;
    this.store.mutating.set(true);
    this.error.set('');
    this.api
      .importJob(job.id)
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.store.mutating.set(false)),
      )
      .subscribe({
        next: (current) => {
          this.job.set(current);
          if (current.status === 'COMPLETED') {
            this.rows.set([]);
            this.store.reset();
          }
        },
        error: (error) => this.error.set(errorMessage(error)),
      });
  }
}
