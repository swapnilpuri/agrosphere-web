import { JsonPipe } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { EstateStore } from '../estates/estate.store';
import { M4Store, M4Query, hash } from './m4.store';
@Component({
  selector: 'agro-m4',
  standalone: true,
  imports: [JsonPipe],
  providers: [M4Store],
  templateUrl: './m4.component.html',
  styleUrl: '../production/production.component.css',
})
export class M4Component {
  readonly estateId = input.required<string>();
  readonly blockId = input.required<string>();
  readonly auth = inject(AuthService);
  readonly estates = inject(EstateStore);
  readonly ai = inject(M4Store);
  readonly dataset = signal('');
  readonly evaluation = signal('');
  readonly asOf = signal('');
  readonly labelAsOf = signal('');
  readonly mode = signal<M4Query['mode']>('GENERATED_POINT_IN_TIME');
  constructor() {
    effect(() => {
      this.dataset();
      this.asOf();
      this.labelAsOf();
      this.mode();
      const key = `${this.estateId()}:${this.blockId()}:${this.auth.username()}:${this.auth.roles().join()}:${this.auth.estateIds().join()}`;
      this.ai.scope(key, this.auth.canReadProduction(this.estateId()));
    });
  }
  query(): M4Query {
    return {
      estateId: this.estateId(),
      blockId: this.blockId(),
      datasetId: this.dataset(),
      mode: this.mode(),
      asOf: this.asOf(),
      labelAsOf: this.labelAsOf(),
    };
  }
  model(id: string) {
    this.ai.inspect(
      this.query(),
      this.ai.prefix(this.query()) + '/models/' + id + '?datasetId=' + this.dataset(),
    );
  }
  inspectEvaluation() {
    if (hash.test(this.evaluation()))
      this.ai.inspect(
        this.query(),
        this.ai.prefix(this.query()) +
          '/evaluations/' +
          this.evaluation() +
          '?datasetId=' +
          this.dataset(),
      );
  }
  hotspot() {
    this.estates.selectBlock(this.blockId());
  }
}
