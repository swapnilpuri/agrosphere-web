import {
  Component,
  DestroyRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { EstateStore } from '../estates/estate.store';
import {
  CropCommand,
  CropHealthApi,
  CropHistory,
  CropPage,
  CropRow,
  Inspection,
} from './crop-health.api';
import {
  CropAction,
  CropEditor,
  CropMode,
  cropCommand,
  cropEditor,
  cropInstant,
  isInspection,
} from './crop-health.forms';

@Component({
  standalone: true,
  imports: [RouterLink],
  templateUrl: './crop-health.component.html',
  styleUrl: './crop-health.component.css',
})
export class CropHealthComponent {
  readonly auth = inject(AuthService);
  readonly store = inject(EstateStore);
  private readonly api = inject(CropHealthApi);
  private readonly destroy = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  readonly mode = this.route.snapshot.data['cropMode'] as CropMode;
  private readonly cancel = new Subject<void>();
  private readonly cancelDetail = new Subject<void>();
  readonly permitted = computed(() => this.auth.canReadCropHealth(this.store.estateId()));
  readonly manager = computed(() => this.auth.canManageCropHealth(this.store.estateId()));
  readonly canCreate = computed(() => this.auth.canCreateCropHealth(this.store.estateId()));
  readonly canHistory = computed(() => this.auth.canReadCropHealthHistory(this.store.estateId()));
  readonly rows = signal<CropRow[]>([]);
  readonly detail = signal<CropRow | null>(null);
  readonly parentVersion = signal<number | null>(null);
  readonly history = signal<CropHistory | null>(null);
  readonly historyPage = signal(0);
  readonly historyBusy = signal(false);
  readonly editor = signal<CropEditor | null>(null);
  readonly pending = signal<CropCommand | null>(null);
  readonly latest = signal<CropRow | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly saving = signal(false);
  readonly detailBusy = signal(false);
  readonly blocked = signal(false);
  readonly page = signal(0);
  readonly total = signal(0);
  blockFilter = '';
  statusFilter = 'ACTIVE';
  outcomeFilter = '';
  stateFilter = '';
  categoryFilter = '';
  severityFilter = '';
  from = '';
  to = '';
  readonly isInspection = isInspection;
  readonly context = computed(() =>
    JSON.stringify([
      this.auth.authenticated(),
      this.auth.roles(),
      this.auth.estateIds(),
      this.store.estateId(),
    ]),
  );
  constructor() {
    effect(() => {
      this.context();
      untracked(() => {
        this.cancel.next();
        this.cancelDetail.next();
        this.clear();
        if (this.permitted()) {
          this.load(0);
          const requested = this.route.snapshot.queryParamMap.get('report');
          if (requested) this.openDetail(requested);
        }
      });
    });
    this.destroy.onDestroy(() => {
      this.cancel.next();
      this.cancelDetail.next();
      this.store.cropHealthDirty.set(false);
      this.store.mutating.set(false);
    });
  }
  private clear() {
    this.rows.set([]);
    this.detail.set(null);
    this.history.set(null);
    this.editor.set(null);
    this.pending.set(null);
    this.latest.set(null);
    this.parentVersion.set(null);
    this.error.set('');
    this.notice.set('');
    this.total.set(0);
    this.page.set(0);
    this.busy.set(false);
    this.saving.set(false);
    this.detailBusy.set(false);
    this.historyBusy.set(false);
    this.blocked.set(false);
    this.store.cropHealthDirty.set(false);
    this.store.mutating.set(false);
    this.blockFilter = '';
    this.statusFilter = 'ACTIVE';
    this.outcomeFilter = '';
    this.stateFilter = '';
    this.categoryFilter = '';
    this.severityFilter = '';
    this.from = '';
    this.to = '';
  }
  load(page = this.page()) {
    if (!this.permitted() || this.editor()) return;
    this.cancel.next();
    this.busy.set(true);
    this.error.set('');
    this.page.set(page);
    const query = new URLSearchParams({
      estateId: this.store.estateId(),
      provenance: 'SIMULATED',
      page: String(page),
      size: '25',
    });
    if (this.blockFilter) query.set('blockId', this.blockFilter);
    if (this.mode === 'inspections') {
      if (this.outcomeFilter) query.set('outcome', this.outcomeFilter);
      if (this.stateFilter) query.set('state', this.stateFilter);
    } else {
      if (this.categoryFilter) query.set('category', this.categoryFilter);
      if (this.severityFilter) query.set('severity', this.severityFilter);
      if (this.statusFilter === 'ALL')
        for (const status of ['OPEN', 'IN_REVIEW', 'RESOLVED', 'VOIDED'])
          query.append('status', status);
      else if (this.statusFilter !== 'ACTIVE') query.set('status', this.statusFilter);
    }
    try {
      if (this.from || this.to) {
        query.set('observedFrom', cropInstant(this.from));
        query.set('observedTo', cropInstant(this.to));
      }
    } catch (e) {
      this.error.set((e as Error).message);
      this.busy.set(false);
      return;
    }
    this.api
      .get<CropPage>('/' + this.mode, query)
      .pipe(takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (result) => {
          this.rows.set(result.content);
          this.total.set(result.totalElements);
          this.busy.set(false);
        },
        error: (e) => {
          this.rows.set([]);
          this.total.set(0);
          this.busy.set(false);
          this.failure(e);
        },
      });
  }
  openDetail(id: string) {
    if (this.editor()) return;
    this.cancelDetail.next();
    this.detail.set(null);
    this.history.set(null);
    this.parentVersion.set(null);
    this.detailBusy.set(true);
    this.error.set('');
    this.api
      .get<CropRow>('/' + this.mode + '/' + id)
      .pipe(takeUntil(this.cancelDetail), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (row) => {
          this.detail.set(row);
          if (!isInspection(row) && row.inspectionId)
            this.api
              .get<Inspection>('/inspections/' + row.inspectionId)
              .pipe(takeUntil(this.cancelDetail), takeUntilDestroyed(this.destroy))
              .subscribe({
                next: (parent) => {
                  this.parentVersion.set(parent.version);
                  this.detailBusy.set(false);
                },
                error: (e) => {
                  this.detailBusy.set(false);
                  this.failure(e);
                },
              });
          else this.detailBusy.set(false);
        },
        error: (e) => {
          this.detailBusy.set(false);
          this.failure(e);
        },
      });
  }
  open(action: CropAction) {
    if (
      this.detailBusy() ||
      this.blocked() ||
      (action === 'create' ? !this.canCreate() : !this.manager())
    )
      return;
    this.editor.set(
      cropEditor(action, action === 'create' ? null : this.detail(), this.parentVersion()),
    );
    this.pending.set(null);
    this.latest.set(null);
    this.error.set('');
    this.notice.set('');
    this.store.cropHealthDirty.set(true);
    setTimeout(() => document.querySelector<HTMLElement>('#crop-editor-title')?.focus());
  }
  showReportFields(e: CropEditor) {
    return (
      this.mode === 'incidents' ||
      (e.outcome === 'FOLLOW_UP' &&
        (!e.original || (isInspection(e.original) && !e.original.linkedIncidentId)))
    );
  }
  save() {
    const editor = this.editor();
    if (!editor || this.pending() || this.saving()) return;
    try {
      this.pending.set(cropCommand(this.mode, this.store.estateId(), editor, crypto.randomUUID()));
      this.retry();
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
  retry() {
    const pending = this.pending();
    if (!pending || this.saving() || this.blocked()) return;
    this.saving.set(true);
    this.store.mutating.set(true);
    this.error.set('');
    this.api
      .command(pending)
      .pipe(takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (result) => {
          const row = 'inspection' in result ? result.inspection : result;
          this.saving.set(false);
          this.store.mutating.set(false);
          this.editor.set(null);
          this.pending.set(null);
          this.store.cropHealthDirty.set(false);
          this.notice.set('Saved. The latest record is loading.');
          this.load();
          this.openDetail(row.id);
        },
        error: (e) => {
          this.saving.set(false);
          this.store.mutating.set(false);
          this.failure(e);
          if (e instanceof HttpErrorResponse && e.status === 409 && this.editor()?.original) {
            this.api
              .get<CropRow>('/' + this.mode + '/' + this.editor()!.original!.id)
              .pipe(takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
              .subscribe({
                next: (row) => this.latest.set(row),
                error: () =>
                  this.notice.set(
                    'The current record could not be loaded. Your submitted report is retained in memory.',
                  ),
              });
          }
        },
      });
  }
  private failure(e: unknown) {
    const status = e instanceof HttpErrorResponse ? e.status : 0;
    if (status === 401 || status === 403) {
      this.clear();
      this.blocked.set(true);
      if (status === 401) this.auth.clear();
      this.error.set('Your session or permissions no longer allow this operation.');
      return;
    }
    this.error.set(
      status === 409
        ? 'This report conflicts with the current record. Compare it below, then reload and review your change.'
        : status === 400 || status === 422
          ? 'Check the report fields and canonical field status. Discard this submission to revise it.'
          : 'The result is uncertain. Retry the identical submission to reconcile it safely.',
    );
  }
  discard() {
    if (this.saving()) return;
    if (!confirm('Discard the unsaved report and any pending submission?')) return;
    const id = this.editor()?.original?.id;
    this.editor.set(null);
    this.pending.set(null);
    this.latest.set(null);
    this.store.cropHealthDirty.set(false);
    this.error.set('');
    if (id) this.openDetail(id);
  }
  historyLoad(page = 0) {
    const row = this.detail();
    if (!row || !this.canHistory()) return;
    this.historyBusy.set(true);
    this.api
      .get<CropHistory>(
        '/' + this.mode + '/' + row.id + '/history',
        new URLSearchParams({ page: String(page), size: '25' }),
      )
      .pipe(takeUntil(this.cancelDetail), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (result) => {
          this.history.set(result);
          this.historyPage.set(page);
          this.historyBusy.set(false);
        },
        error: (e) => {
          this.historyBusy.set(false);
          this.failure(e);
        },
      });
  }
  label(row: CropRow) {
    return isInspection(row) ? row.outcome + ' · ' + row.state : row.summary;
  }
  state(row: CropRow) {
    return isInspection(row) ? row.state : row.status;
  }
  localTime(value: string) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: this.store.estate()?.timezone,
      }).format(new Date(value));
    } catch {
      return value;
    }
  }
  field(id: string) {
    return this.store.blocks().find((b) => b.id === id)?.name ?? id;
  }
  canLeave() {
    return (
      !this.editor() ||
      (!this.saving() && confirm('Discard the unsaved crop report before leaving?'))
    );
  }
  @HostListener('window:beforeunload', ['$event']) unload(event: BeforeUnloadEvent) {
    if (this.editor()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
