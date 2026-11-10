import { Component, effect, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { EstateStore } from '../estates/estate.store';
import { CesiumViewerComponent } from './cesium-viewer.component';
import { BlockDetailComponent } from '../blocks/block-detail.component';
import { LayerManagerComponent } from '../spatial-layers/layer-manager.component';
import { TelemetryStore } from '../telemetry/telemetry.store';
import { TelemetryPanelComponent } from '../telemetry/telemetry-panel.component';
import { AuthService } from '../../core/auth/auth.service';
@Component({
  standalone: true,
  imports: [
    CesiumViewerComponent,
    BlockDetailComponent,
    LayerManagerComponent,
    DatePipe,
    TelemetryPanelComponent,
  ],
  providers: [TelemetryStore],
  templateUrl: './digital-twin.component.html',
})
export class DigitalTwinComponent {
  readonly store = inject(EstateStore);
  readonly telemetry = inject(TelemetryStore);
  private readonly auth = inject(AuthService);
  constructor() {
    effect(() => {
      const estate = this.store.estateId();
      this.telemetry.select(
        estate,
        this.store.selectedBlock()?.id ?? '',
        this.auth.canReadTelemetry(estate),
      );
    });
  }
}
