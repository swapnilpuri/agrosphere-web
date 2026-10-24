import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { EstateStore } from '../estates/estate.store';
import { CesiumViewerComponent } from './cesium-viewer.component';
import { BlockDetailComponent } from '../blocks/block-detail.component';
import { LayerManagerComponent } from '../spatial-layers/layer-manager.component';
@Component({
  standalone: true,
  imports: [CesiumViewerComponent, BlockDetailComponent, LayerManagerComponent, DatePipe],
  templateUrl: './digital-twin.component.html',
})
export class DigitalTwinComponent {
  readonly store = inject(EstateStore);
}
