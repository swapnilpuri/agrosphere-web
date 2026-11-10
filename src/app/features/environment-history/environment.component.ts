import { Component, effect, inject, input, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { EnvironmentalStore } from './environment.store';
import type { Observation } from './environment-state';
@Component({
  selector: 'agro-environment-history',
  standalone: true,
  providers: [EnvironmentalStore],
  templateUrl: './environment.component.html',
  styleUrl: '../production/production.component.css',
})
export class EnvironmentComponent {
  readonly estateId = input.required<string>();
  readonly blockId = input.required<string>();
  readonly auth = inject(AuthService);
  readonly history = inject(EnvironmentalStore);
  readonly from = signal('');
  readonly to = signal('');
  constructor() {
    effect(() => {
      this.blockId();
      this.from();
      this.to();
      this.history.scope(this.estateId(), this.auth.canReadProduction(this.estateId()));
      this.history.selectionChanged();
    });
  }
  load() {
    this.history.load({
      estateId: this.estateId(),
      blockId: this.blockId(),
      from: this.from(),
      to: this.to(),
    });
  }
  interval(row: Observation) {
    return row.kind === 'INTERVAL_RAINFALL'
      ? `${row.intervalStart} to ${row.intervalEnd}`
      : 'Not an interval measurement';
  }
}
