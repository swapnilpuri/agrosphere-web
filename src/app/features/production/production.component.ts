import { Component, computed, effect, inject, signal } from '@angular/core';
import { EstateStore } from '../estates/estate.store';
import { AuthService } from '../../core/auth/auth.service';
import { ProductionStore } from './production.store';
import { trend } from './production-state';
import { EnvironmentComponent } from '../environment-history/environment.component';
import { M4Component } from '../m4/m4.component';
@Component({
  selector: 'agro-production-history',
  standalone: true,
  imports: [EnvironmentComponent, M4Component],
  providers: [ProductionStore],
  templateUrl: './production.component.html',
  styleUrl: './production.component.css',
})
export class ProductionComponent {
  readonly estates = inject(EstateStore);
  readonly auth = inject(AuthService);
  readonly history = inject(ProductionStore);
  readonly block = signal('');
  readonly from = signal('');
  readonly to = signal('');
  readonly wet = computed(() => trend(this.history.data(), 'totalWetLatexKg'));
  readonly dry = computed(() => trend(this.history.data(), 'knownDryRubberKg'));
  private selected = '';
  constructor() {
    effect(() => {
      this.block();
      this.from();
      this.to();
      const estate = this.estates.estateId();
      const allowed = this.auth.canReadProduction(estate);
      this.history.scope(estate, allowed);
      this.history.selectionChanged();
      if (estate !== this.selected) {
        this.selected = estate;
        this.block.set('');
      }
    });
  }
  load() {
    this.history.load({
      estateId: this.estates.estateId(),
      blockId: this.block(),
      from: this.from(),
      to: this.to(),
    });
  }
}
