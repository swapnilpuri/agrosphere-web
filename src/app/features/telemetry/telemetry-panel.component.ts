import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TelemetryStore } from './telemetry.store';
import { telemetryKinds, telemetryLabels, telemetryUnits } from './telemetry-state';
@Component({
  selector: 'agro-telemetry-panel',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './telemetry-panel.component.html',
  styles: [
    ':host{display:block}.telemetry-panel{padding:18px;border:1px solid #cbd9d7;border-radius:8px;margin-top:12px;background:var(--panel,#fff)}.reading{padding:10px 0;border-top:1px solid #dce5e3}.reading h3{font-size:14px;margin:0 0 6px}.reading p{margin:5px 0;font-size:12px}.value{font-size:20px;font-weight:650}.legend{font-size:12px;display:grid;gap:4px;margin-top:10px}.current{color:#1763a3}.stale{color:#8a5900}.clock{color:#7952ad}',
  ],
})
export class TelemetryPanelComponent {
  readonly telemetry = inject(TelemetryStore);
  readonly kinds = telemetryKinds;
  readonly labels = telemetryLabels;
  readonly units = telemetryUnits;
  reading(kind: string) {
    return this.telemetry.data()?.readings.find((r) => r.kind === kind);
  }
}
