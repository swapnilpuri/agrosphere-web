import { Component, inject } from '@angular/core';
import { EstateStore } from '../estates/estate.store';
import { categories, colors } from '../../shared/models';
@Component({
  selector: 'agro-layer-manager',
  standalone: true,
  templateUrl: './layer-manager.component.html',
})
export class LayerManagerComponent {
  readonly store = inject(EstateStore);
  readonly categories = categories;
  readonly colors = colors;
}
