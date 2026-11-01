import {
  Component,
  Injector,
  afterNextRender,
  DestroyRef,
  HostListener,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { uuidV7 } from './uuid-v7';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { EstateStore } from '../estates/estate.store';
import { AlertInbox } from './alert-inbox';
import { AlertCommand, AlertHistory, AlertPage, AlertRow, AlertsApi } from './alerts.api';

@Component({
  standalone: true,
  imports: [RouterLink],
  templateUrl: './alerts.component.html',
  styleUrl: './alerts.component.css',
})
export class AlertsComponent {
  readonly store = inject(EstateStore);
  readonly auth = inject(AuthService);
  readonly inbox = inject(AlertInbox);
  private readonly api = inject(AlertsApi);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly cancel = new Subject<void>();
  private readonly detailCancel = new Subject<void>();
  readonly rows = signal<AlertRow[]>([]);
  readonly detail = signal<AlertRow | null>(null);
  readonly history = signal<AlertHistory | null>(null);
  readonly pending = signal<AlertCommand | null>(null);
  readonly state = signal('ACTIVE');
  readonly severity = signal('');
  readonly block = signal('');
  readonly unreadOnly = signal(false);
  readonly unacknowledgedOnly = signal(false);
  readonly page = signal(0);
  readonly total = signal(0);
  readonly historyPage = signal(0);
  readonly busy = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly refreshed = signal('');
  constructor() {
    effect(() => {
      this.inbox.context();
      untracked(() => {
        this.cancel.next();
        this.detailCancel.next();
        this.rows.set([]);
        this.detail.set(null);
        this.history.set(null);
        this.pending.set(null);
        this.error.set('');
        this.notice.set('');
        this.refreshed.set('');
        this.total.set(0);
        this.busy.set(false);
        this.saving.set(false);
        this.store.alertCommandPending.set(false);
        this.state.set('ACTIVE');
        this.severity.set('');
        this.block.set('');
        this.unreadOnly.set(false);
        this.unacknowledgedOnly.set(false);
        if (this.inbox.permitted()) this.load(0);
      });
    });
    this.destroy.onDestroy(() => {
      this.cancel.next();
      this.detailCancel.next();
      this.store.alertCommandPending.set(false);
    });
  }
  private fail(error: HttpErrorResponse) {
    if (error.status === 401) this.auth.clear();
    if (error.status === 401 || error.status === 403) {
      this.rows.set([]);
      this.detail.set(null);
      this.history.set(null);
    }
    this.error.set(errorMessage(error));
  }
  load(page = 0) {
    if (this.pending() || !this.inbox.permitted()) return;
    this.cancel.next();
    this.busy.set(true);
    this.error.set('');
    this.page.set(page);
    const q = new URLSearchParams({
      estateId: this.store.estateId(),
      state: this.state(),
      page: String(page),
      size: '20',
      unreadOnly: String(this.unreadOnly()),
      unacknowledgedOnly: String(this.unacknowledgedOnly()),
    });
    if (this.severity()) q.set('severity', this.severity());
    if (this.block()) q.set('blockId', this.block());
    this.api
      .get<AlertPage>('?' + q)
      .pipe(takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (p) => {
          this.rows.set(p.content);
          this.total.set(p.totalElements);
          this.refreshed.set(p.generatedAt);
          this.busy.set(false);
        },
        error: (e) => {
          this.busy.set(false);
          this.fail(e);
        },
      });
  }
  open(id: string) {
    if (this.pending()) return;
    this.detailCancel.next();
    this.detail.set(null);
    this.history.set(null);
    this.error.set('');
    this.api
      .get<AlertRow>('/' + id)
      .pipe(takeUntil(this.detailCancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (a) => {
          this.detail.set(a);
          afterNextRender(() => document.getElementById('alert-details')?.focus(), {
            injector: this.injector,
          });
        },
        error: (e) => this.fail(e),
      });
  }
  act(ack: boolean) {
    const row = this.detail();
    if (!row || this.pending() || this.saving()) return;
    if (!ack && row.readState === 'EXPIRED') return;
    if (![row.attentionVersion, row.alertVersion].every((v) => Number.isSafeInteger(v) && v >= 1)) {
      this.error.set(
        'Alert version cannot be represented safely. Refresh and request support before acting.',
      );
      return;
    }
    if (
      ack &&
      !confirm(
        'Acknowledge attention for the estate team? This does not resolve or assign the incident.',
      )
    )
      return;
    const body: Record<string, number> = { attentionVersion: row.attentionVersion };
    if (ack) body['expectedAlertVersion'] = row.alertVersion;
    this.pending.set({
      path: '/' + row.id + (ack ? '/acknowledgements' : '/read'),
      body,
      key: uuidV7(),
    });
    this.store.alertCommandPending.set(true);
    this.retry();
  }
  retry() {
    const command = this.pending();
    if (!command || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.api
      .command(command)
      .pipe(takeUntil(this.cancel), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (a) => {
          this.saving.set(false);
          this.pending.set(null);
          this.store.alertCommandPending.set(false);
          this.notice.set(
            'Recorded. Refreshing the current alert; an identical retry may return its original snapshot.',
          );
          this.open(a.id);
          this.load(this.page());
          this.inbox.refresh();
        },
        error: (e: HttpErrorResponse) => {
          this.saving.set(false);
          if ([400, 401, 403, 404, 409, 410].includes(e.status)) {
            this.pending.set(null);
            this.store.alertCommandPending.set(false);
            this.fail(e);
            if (e.status === 409 || e.status === 410) {
              this.notice.set(
                e.status === 410
                  ? 'This command or read state expired. Review refreshed facts; no new action was submitted.'
                  : 'Alert changed, clock needs correction, or prior outcome is unknown. Review the refreshed facts before acting again.',
              );
              const id = this.detail()?.id;
              if (id) this.open(id);
              this.load(this.page());
            }
          } else
            this.error.set(
              'Outcome uncertain. Retry the identical submission with its original key.',
            );
        },
      });
  }
  showHistory(page = 0) {
    const row = this.detail();
    if (!row || !this.auth.canReadCropHealthHistory(this.store.estateId()) || this.pending())
      return;
    this.detailCancel.next();
    this.historyPage.set(page);
    this.api
      .get<AlertHistory>('/' + row.id + '/history?page=' + page + '&size=20')
      .pipe(takeUntil(this.detailCancel), takeUntilDestroyed(this.destroy))
      .subscribe({ next: (h) => this.history.set(h), error: (e) => this.fail(e) });
  }
  field(id: string) {
    return this.store.blocks().find((b) => b.id === id)?.name ?? id;
  }
  at(value: string | null) {
    if (!value) return '—';
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: this.store.estate()?.timezone ?? 'UTC',
    }).format(new Date(value));
  }
  canLeave() {
    return (
      !this.pending() ||
      (!this.saving() &&
        confirm(
          'Leave this uncertain command? Its original retry is only retained in this session.',
        ))
    );
  }
  @HostListener('window:beforeunload', ['$event']) unload(event: BeforeUnloadEvent) {
    if (this.pending()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
