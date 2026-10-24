import { Component, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { EstateStore } from '../estates/estate.store';
@Component({
  selector: 'agro-block-detail',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  templateUrl: './block-detail.component.html',
})
export class BlockDetailComponent {
  readonly store = inject(EstateStore);
  divisionName(id: string) {
    return this.store.divisions().find((d) => d.id === id)?.name ?? id;
  }
}
