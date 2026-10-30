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
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { EstateStore } from '../estates/estate.store';
import { Command, Day, History, Roster, Schemas, Worker, WorkforceApi } from './workforce.api';
import { Editor, Kind, buildCommand, businessDate, nextDate } from './workforce.forms';

@Component({
  standalone: true,
  templateUrl: './workforce.component.html',
  styleUrl: './workforce.component.css',
})
export class WorkforceComponent {
  readonly auth = inject(AuthService);
  readonly store = inject(EstateStore);
  private readonly api = inject(WorkforceApi);
  private readonly destroy = inject(DestroyRef);
  readonly mode = inject(ActivatedRoute).snapshot.data['workforceMode'] as 'workers' | 'attendance';
  private readonly cancel = new Subject<void>();
  private readonly cancelDetail = new Subject<void>();
  private readonly minute = signal(Date.now());
  readonly today = computed(() =>
    businessDate(this.store.estate()?.timezone ?? '', new Date(this.minute())),
  );
  readonly permitted = computed(() => this.auth.canReadWorkforce(this.store.estateId()));
  readonly manager = computed(() => this.auth.canManageWorkforce(this.store.estateId()));
  readonly historyAllowed = computed(() =>
    this.auth.canReadWorkforceHistory(this.store.estateId()),
  );
  readonly canRecord = computed(
    () =>
      this.auth.canRecordWorkforce(this.store.estateId()) &&
      (this.manager() || this.date() === this.today()),
  );
  readonly date = signal('');
  readonly division = signal('');
  readonly name = signal('');
  readonly code = signal('');
  readonly activeOn = signal('');
  readonly recordedOnly = signal(false);
  readonly page = signal(0);
  readonly total = signal(0);
  readonly workers = signal<Worker[]>([]);
  readonly days = signal<Day[]>([]);
  readonly roster = signal<Roster | null>(null);
  readonly busy = signal(false);
  readonly saving = signal(false);
  readonly denied = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly editor = signal<Editor | null>(null);
  readonly pending = signal<Command | null>(null);
  readonly detail = signal<Worker | Day | null>(null);
  readonly history = signal<History | null>(null);
  readonly historyPage = signal(0);
  readonly historyPath = signal('');
  readonly detailBusy = signal(false);
  readonly latest = signal<Worker | Day | null>(null);
  readonly context = computed(() =>
    JSON.stringify([
      this.auth.authenticated(),
      [...this.auth.roles()].sort(),
      [...this.auth.estateIds()].sort(),
      this.store.estateId(),
      this.store.estate()?.timezone,
    ]),
  );
  constructor() {
    effect(() => {
      this.context();
      untracked(() => {
        this.cancel.next();
        this.cancelDetail.next();
        this.clearProtected();
        this.denied.set(false);
        this.date.set(this.today());
        this.page.set(0);
        this.division.set('');
        this.name.set('');
        this.code.set('');
        this.activeOn.set('');
        if (this.permitted() && this.date()) this.load();
      });
    });
    const timer = setInterval(() => this.minute.set(Date.now()), 60000);
    this.destroy.onDestroy(() => {
      clearInterval(timer);
      this.cancel.next();
      this.cancelDetail.next();
      this.store.workforceDirty.set(false);
    });
  }
  private clearProtected() {
    this.workers.set([]);
    this.days.set([]);
    this.roster.set(null);
    this.total.set(0);
    this.detail.set(null);
    this.history.set(null);
    this.editor.set(null);
    this.pending.set(null);
    this.latest.set(null);
    this.error.set('');
    this.notice.set('');
    this.busy.set(false);
    this.saving.set(false);
    this.detailBusy.set(false);
    this.store.workforceDirty.set(false);
  }
  invalidateFilters() {
    this.cancel.next();
    this.cancelDetail.next();
    this.busy.set(false);
    this.workers.set([]);
    this.days.set([]);
    this.roster.set(null);
    this.detail.set(null);
    this.history.set(null);
    this.total.set(0);
    this.notice.set('Filters changed. Apply filters to load matching records.');
  }
  load(page = this.page()) {
    if (!this.permitted() || this.denied() || this.editor()) return;
    this.cancel.next();
    this.busy.set(true);
    this.error.set('');
    this.page.set(page);
    const params: Record<string, string> = {
      estateId: this.store.estateId(),
      provenance: 'SIMULATED',
      page: String(page),
      size: '20',
    };
    const path =
      this.mode === 'workers'
        ? '/workers'
        : this.recordedOnly()
          ? '/attendance/days'
          : '/attendance/roster';
    if (this.mode === 'workers') {
      if (this.name().trim()) params['name'] = this.name().trim();
      if (this.code().trim()) params['code'] = this.code().trim();
      if (this.activeOn()) params['activeOn'] = this.activeOn();
    } else if (this.recordedOnly()) {
      params['from'] = this.date();
      params['to'] = this.date();
    } else params['date'] = this.date();
    if (this.division() && !this.recordedOnly()) params['divisionId'] = this.division();
    this.workers.set([]);
    this.days.set([]);
    this.roster.set(null);
    this.detail.set(null);
    this.history.set(null);
    this.cancelDetail.next();
    this.api
      .get<Schemas['WorkerPage'] | Schemas['AttendancePage'] | Roster>(path, params)
      .pipe(takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (value) => {
          this.busy.set(false);
          this.total.set(value.totalElements);
          if (this.mode === 'workers') this.workers.set((value as Schemas['WorkerPage']).content);
          else if (this.recordedOnly()) this.days.set((value as Schemas['AttendancePage']).content);
          else this.roster.set(value as Roster);
        },
        error: (e) => {
          this.busy.set(false);
          this.failure(e);
        },
      });
  }
  private failure(e: { status?: number }) {
    if (e.status === 401 || e.status === 403) {
      this.cancel.next();
      this.cancelDetail.next();
      this.clearProtected();
      this.denied.set(true);
      this.error.set(
        'Access is no longer available. Protected records and drafts have been cleared.',
      );
    } else
      this.error.set(
        e.status === 409
          ? 'Conflict: nothing was overwritten. Inspect the latest record and reconcile your draft before submitting again.'
          : e.status === 400 || e.status === 422
            ? 'The request could not be accepted. Check the fields, dates and active estate/division, then retry.'
            : e.status === 404
              ? 'The record is unavailable.'
              : 'The service response is uncertain. Keep this page open and retry the same command.',
      );
  }
  open(kind: Kind, worker?: Worker, day?: Day, workerId?: string) {
    if (
      this.editor() ||
      !this.permitted() ||
      (kind === 'RECORD' ? !this.canRecord() : !this.manager())
    )
      return;
    if ((worker?.dataProvenance ?? day?.dataProvenance ?? 'SIMULATED') !== 'SIMULATED') return;
    this.error.set('');
    this.notice.set('');
    this.latest.set(null);
    this.editor.set({
      kind,
      worker,
      day,
      workerId,
      date: this.date(),
      values: {
        name: worker?.displayName ?? '',
        code: worker?.workerCode ?? '',
        division: worker?.divisionId ?? '',
        date: kind === 'CLOSE' ? nextDate(this.today()) : this.today(),
        reason: '',
        status: day?.status === 'VOIDED' ? '' : (day?.status ?? ''),
      },
    });
    this.store.workforceDirty.set(true);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          '.editor input, .editor select, .editor textarea, .editor button',
        )
        ?.focus(),
    );
  }
  change(key: string, value: string) {
    if (this.pending() || this.saving()) return;
    this.editor.update((editor) =>
      editor ? { ...editor, values: { ...editor.values, [key]: value } } : null,
    );
  }
  save() {
    const editor = this.editor();
    if (
      !editor ||
      this.saving() ||
      !this.permitted() ||
      (editor.kind === 'RECORD' ? !this.canRecord() : !this.manager())
    )
      return;
    try {
      const command = this.pending() ?? buildCommand(editor, this.store.estateId(), this.today());
      this.pending.set(command);
      this.saving.set(true);
      this.error.set('');
      this.api
        .command(command)
        .pipe(takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.pending.set(null);
            this.editor.set(null);
            this.store.workforceDirty.set(false);
            this.notice.set('Saved. The list has been refreshed.');
            this.load();
          },
          error: (e) => {
            this.saving.set(false);
            // A 409 can also represent an in-flight reservation: keep the exact command for retry.
            if ([400, 404, 422].includes(e.status)) this.pending.set(null);
            this.failure(e);
          },
        });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Check this draft.');
    }
  }
  discard() {
    if (this.saving()) return;
    if (
      !confirm(
        this.pending()
          ? 'This command may already have succeeded. Discard this draft and inspect refreshed records before making another command?'
          : 'Discard this unsaved draft?',
      )
    )
      return;
    this.editor.set(null);
    this.pending.set(null);
    this.latest.set(null);
    this.store.workforceDirty.set(false);
    this.load();
  }
  inspectLatest() {
    const editor = this.editor();
    const id = editor?.worker?.id ?? editor?.day?.id;
    if (!id) {
      this.error.set(
        'For a new record, retry the identical command to resolve its outcome before discarding.',
      );
      return;
    }
    this.readDetail((editor?.worker ? '/workers/' : '/attendance/days/') + id, true);
  }
  show(record: Worker | Day) {
    this.readDetail(
      ('workerCode' in record ? '/workers/' : '/attendance/days/') + record.id,
      false,
    );
  }
  private readDetail(path: string, latest: boolean) {
    this.cancelDetail.next();
    this.detailBusy.set(true);
    this.api
      .get<Worker | Day>(path)
      .pipe(takeUntil(this.cancelDetail), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (value) => {
          this.detailBusy.set(false);
          if (latest) this.latest.set(value);
          else {
            this.detail.set(value);
            this.history.set(null);
            this.historyPath.set(path + '/history');
          }
        },
        error: (e) => {
          this.detailBusy.set(false);
          this.failure(e);
        },
      });
  }
  showHistory(page = 0) {
    if (!this.historyAllowed() || !this.historyPath()) return;
    this.cancelDetail.next();
    this.detailBusy.set(true);
    this.api
      .get<History>(this.historyPath(), { page: String(page), size: '20' })
      .pipe(takeUntil(this.cancelDetail), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (value) => {
          this.detailBusy.set(false);
          this.history.set(value);
          this.historyPage.set(page);
        },
        error: (e) => {
          this.detailBusy.set(false);
          this.failure(e);
        },
      });
  }
  asWorker(record: Worker | Day): Worker | null {
    return 'workerCode' in record ? record : null;
  }
  asDay(record: Worker | Day): Day | null {
    return 'attendanceDate' in record ? record : null;
  }
  hasOpenPeriod(worker: Worker) {
    return worker.activePeriods.some((p) => p.activeTo === null);
  }
  canLeave(): boolean {
    return (
      !this.saving() &&
      (!this.editor() ||
        confirm(
          'Leave this page and discard the draft? An uncertain save may already have succeeded.',
        ))
    );
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent) {
    if (this.editor()) event.preventDefault();
  }
}
