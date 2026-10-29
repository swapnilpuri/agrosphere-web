import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, forkJoin, of, switchMap, tap } from 'rxjs';
import { EstateApi } from '../../api/estate/estate.api';
import { SpatialApi } from '../../api/spatial/spatial.api';
import {
  Asset,
  Block,
  Category,
  Division,
  Estate,
  Feature,
  Layer,
  aggregate,
  categories,
  searchBlocks,
} from '../../shared/models';
import { errorMessage } from '../../core/errors';
@Injectable({ providedIn: 'root' })
export class EstateStore {
  private readonly estateApi = inject(EstateApi);
  private readonly spatialApi = inject(SpatialApi);
  private readonly destroy = inject(DestroyRef);
  readonly sourceVisible = signal<ReadonlySet<string>>(new Set());
  readonly estates = signal<Estate[]>([]);
  readonly estateId = signal('');
  readonly divisions = signal<Division[]>([]);
  readonly blocks = signal<Block[]>([]);
  readonly features = signal<Feature[]>([]);
  readonly layers = signal<Layer[]>([]);
  readonly assets = signal<Asset[]>([]);
  readonly selectedBlock = signal<Block | null>(null);
  readonly selectedDivision = signal('');
  readonly query = signal('');
  readonly busy = signal(false);
  readonly estateBusy = signal(false);
  readonly mutating = signal(false);
  readonly editingRecord = signal(false);
  readonly previewingBoundaries = signal(false);
  readonly hasUnsavedChanges = computed(() => this.editingRecord() || this.previewingBoundaries());
  readonly error = signal('');
  readonly spatialError = signal('');
  readonly detailError = signal('');
  readonly timestamp = signal('');
  readonly visible = signal<ReadonlySet<Category>>(new Set(categories));
  readonly estate = computed(() => this.estates().find((e) => e.id === this.estateId()));
  readonly stats = computed(() => aggregate(this.blocks()));
  readonly results = computed(() =>
    searchBlocks(this.blocks(), this.query()).filter(
      (b) => !this.selectedDivision() || b.divisionId === this.selectedDivision(),
    ),
  );
  readonly selectedGeometry = computed(() =>
    this.features().find(
      (f) =>
        f.referenceEntityType === 'BLOCK' &&
        f.referenceEntityId === this.selectedBlock()?.id &&
        f.status === 'ACTIVE',
    ),
  );
  private readonly estateChanges = new Subject<string>();
  private readonly blockChanges = new Subject<string>();
  constructor() {
    this.estateChanges
      .pipe(
        tap((id) => {
          this.estateId.set(id);
          this.busy.set(true);
          this.error.set('');
          this.spatialError.set('');
          this.blocks.set([]);
          this.divisions.set([]);
          this.features.set([]);
          this.assets.set([]);
          this.layers.set([]);
          this.selectedBlock.set(null);
          this.selectedDivision.set('');
          this.blockChanges.next('');
        }),
        switchMap((id) =>
          forkJoin({
            metadata: forkJoin({
              divisions: this.estateApi.divisions(id),
              blocks: this.estateApi.blocks(id),
            }).pipe(
              catchError((e) => {
                this.error.set(errorMessage(e));
                return of(null);
              }),
            ),
            spatial: forkJoin({
              features: this.spatialApi.features(id),
              layers: this.spatialApi.layers(id),
              assets: this.spatialApi.assets(id),
            }).pipe(
              catchError((e) => {
                this.spatialError.set(errorMessage(e));
                return of(null);
              }),
            ),
          }),
        ),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe(({ metadata, spatial }) => {
        if (metadata) {
          this.divisions.set(metadata.divisions);
          this.blocks.set(metadata.blocks);
        }
        if (spatial) {
          this.features.set(spatial.features.filter((f) => f.status === 'ACTIVE'));
          this.layers.set(spatial.layers);
          this.sourceVisible.set(new Set(spatial.layers.filter((l) => l.enabled).map((l) => l.id)));
          this.assets.set(spatial.assets.filter((a) => a.status === 'ACTIVE'));
        }
        this.busy.set(false);
        this.timestamp.set(new Date().toISOString());
      });
    this.blockChanges
      .pipe(
        tap(() => {
          this.selectedBlock.set(null);
          this.detailError.set('');
        }),
        switchMap((id) =>
          id
            ? this.estateApi.block(id).pipe(
                catchError((e) => {
                  this.detailError.set(errorMessage(e));
                  return of(null);
                }),
              )
            : of(null),
        ),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe((b) => {
        if (b?.estateId === this.estateId()) this.selectedBlock.set(b);
      });
  }
  load(preferredId?: string) {
    this.estateBusy.set(true);
    this.error.set('');
    this.estateApi
      .estates()
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (estates) => {
          this.estates.set(estates);
          this.estateBusy.set(false);
          if (estates.length)
            this.selectEstate(
              estates.some((e) => e.id === (preferredId ?? this.estateId()))
                ? (preferredId ?? this.estateId())
                : estates[0].id,
            );
        },
        error: (e) => {
          this.error.set(errorMessage(e));
          this.estateBusy.set(false);
        },
      });
  }
  selectEstate(id: string) {
    if (this.estates().some((e) => e.id === id)) this.estateChanges.next(id);
  }
  selectBlock(id: string) {
    if (this.selectedBlock()?.id === id) return;
    this.blockChanges.next(id);
  }
  toggleSource(id: string) {
    this.sourceVisible.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  toggle(category: Category) {
    this.visible.update((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }
  reset() {
    if (this.estateId()) this.estateChanges.next(this.estateId());
  }
}
