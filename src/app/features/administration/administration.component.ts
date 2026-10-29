import { Component, computed, DestroyRef, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { finalize, Observable } from 'rxjs';
import { EstateApi } from '../../api/estate/estate.api';
import { AuthService } from '../../core/auth/auth.service';
import { EstateStore } from '../estates/estate.store';
import { Block, Division, Estate } from '../../shared/models';
import { errorMessage } from '../../core/errors';
import {
  blockBody,
  divisionBody,
  estateBody,
  fields,
  RecordKind,
  Values,
} from './administration.forms';
import { BoundaryImportComponent } from './boundary-import.component';

interface Editor {
  kind: RecordKind;
  id?: string;
  version?: number;
  estateId: string;
  values: Values;
}
@Component({
  standalone: true,
  imports: [DecimalPipe, RouterLink, BoundaryImportComponent],
  templateUrl: './administration.component.html',
  styleUrl: './administration.component.css',
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
})
export class AdministrationComponent {
  readonly store = inject(EstateStore);
  readonly auth = inject(AuthService);
  private readonly api = inject(EstateApi);
  private readonly destroy = inject(DestroyRef);
  readonly editor = signal<Editor | null>(null);
  readonly error = signal('');
  readonly message = signal('');
  readonly clones = signal<{ value: string; label: string }[]>([]);
  readonly cloneError = signal('');
  private readonly boundaries = viewChild(BoundaryImportComponent);
  readonly mayWrite = computed(() => this.auth.canManageEstate(this.store.estateId()));
  readonly editorFields = computed(() => {
    const clone = this.editor()?.values['rubberCloneCode'];
    const clones =
      clone && !this.clones().some((c) => c.value === clone)
        ? [...this.clones(), { value: String(clone), label: String(clone) + ' (current)' }]
        : this.clones();
    return fields(
      this.editor()?.kind ?? 'estate',
      this.store.divisions().map((d) => ({ value: d.id, label: d.divisionCode + ' · ' + d.name })),
      clones,
    );
  });
  constructor() {
    this.destroy.onDestroy(() => this.store.editingRecord.set(false));
    effect(() => this.store.editingRecord.set(!!this.editor()));
    effect(() => {
      this.store.estateId();
      this.editor.set(null);
      this.error.set('');
    });
    this.api
      .clones()
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (values) =>
          this.clones.set(
            values.map((c) => ({
              value: c.cloneCode,
              label: c.cloneCode + (c.status === 'INACTIVE' ? ' (inactive)' : ''),
            })),
          ),
        error: () =>
          this.cloneError.set(
            'Rubber clones could not be loaded. Leave the optional clone blank or refresh before editing it.',
          ),
      });
  }
  canLeave() {
    if (!this.auth.authenticated()) return true;
    if (this.store.mutating()) {
      this.error.set('Wait for the save or import to finish before leaving this page.');
      return false;
    }
    return (
      !this.store.hasUnsavedChanges() ||
      window.confirm('Discard the unsaved form or boundary preview and leave this page?')
    );
  }
  beforeUnload(event: BeforeUnloadEvent) {
    if (this.store.mutating() || this.store.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  open(kind: RecordKind, value?: Estate | Division | Block) {
    if (
      this.store.mutating() ||
      this.store.estateBusy() ||
      this.store.busy() ||
      (kind === 'estate' && !value ? !this.auth.canCreateEstate() : !this.mayWrite())
    )
      return;
    if (this.store.previewingBoundaries()) {
      if (!window.confirm('Discard the boundary preview before editing a record?')) return;
      this.boundaries()?.resetPreview();
    }
    if (this.editor() && !window.confirm('Discard the current unsaved form?')) return;
    const values: Values = { status: 'ACTIVE' };
    if (value)
      for (const field of fields(kind, [], []))
        values[field.name] = (value as unknown as Values)[field.name] ?? null;
    this.editor.set({
      kind,
      id: value?.id,
      version: value?.version,
      estateId: this.store.estateId(),
      values,
    });
    this.error.set('');
    this.message.set('');
  }
  cancel() {
    if (!this.store.mutating() && window.confirm('Discard the current unsaved form?'))
      this.editor.set(null);
  }
  divisionName(id: string) {
    return this.store.divisions().find((d) => d.id === id)?.name ?? id;
  }
  refresh() {
    if (
      this.store.mutating() ||
      (this.store.hasUnsavedChanges() &&
        !window.confirm('Discard this form or preview and load the latest records?'))
    )
      return;
    this.editor.set(null);
    this.boundaries()?.resetPreview();
    this.store.load();
  }
  save(event: Event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const edit = this.editor();
    if (!edit || this.store.mutating() || !form.reportValidity()) return;
    if (
      edit.kind === 'estate' && !edit.id
        ? !this.auth.canCreateEstate()
        : !this.auth.canManageEstate(edit.estateId)
    ) {
      this.error.set('You do not have permission to save this record.');
      return;
    }
    try {
      const data = new FormData(form);
      let request: Observable<Estate | Division | Block>;
      if (edit.kind === 'estate')
        request = this.api.saveEstate(estateBody(data, edit.version), edit.id);
      else if (edit.kind === 'division')
        request = this.api.saveDivision(divisionBody(data, edit.estateId, edit.version), edit.id);
      else
        request = this.api.saveBlock(
          blockBody(
            data,
            edit.estateId,
            this.store.divisions().map((d) => d.id),
            edit.version,
          ),
          edit.id,
        );
      this.store.mutating.set(true);
      this.error.set('');
      request
        .pipe(
          takeUntilDestroyed(this.destroy),
          finalize(() => this.store.mutating.set(false)),
        )
        .subscribe({
          next: (saved) => {
            this.editor.set(null);
            this.message.set(
              (edit.kind === 'block' ? 'Field' : edit.kind === 'division' ? 'Division' : 'Estate') +
                ' saved: ' +
                saved.name +
                '.',
            );
            this.store.load(edit.kind === 'estate' ? saved.id : edit.estateId);
          },
          error: (error) =>
            this.error.set(
              error.status === 409
                ? 'This code is already in use, or the record changed since you opened it. Keep your entries, or use Refresh records to load the latest version.'
                : error.status === 400
                  ? 'Check the code, timezone, parent division, areas and tree counts. The service rejected this record.'
                  : errorMessage(error),
            ),
        });
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}
