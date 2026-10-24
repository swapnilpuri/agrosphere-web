import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CesiumViewerService } from './cesium-viewer.service';
import { EstateStore } from '../estates/estate.store';
import { CONFIG } from '../../core/config';
@Component({
  selector: 'agro-cesium-viewer',
  standalone: true,
  providers: [CesiumViewerService],
  templateUrl: './cesium-viewer.component.html',
  styles: [
    ':host{display:block;position:relative;height:100%;min-height:460px}.canvas{position:absolute;inset:0}.viewer-status{position:absolute;bottom:30px;left:12px;background:#10292eed;color:#e6f5f1;padding:8px;border-radius:6px;max-width:70%;font-size:12px}.viewer-tools{position:absolute;top:12px;left:12px;display:flex;gap:6px}',
  ],
})
export class CesiumViewerComponent implements AfterViewInit, OnDestroy {
  readonly store = inject(EstateStore);
  private readonly engine = inject(CesiumViewerService);
  private readonly config = inject(CONFIG);
  private readonly zone = inject(NgZone);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('canvas');
  readonly moving = signal(false);
  readonly renderedCount = signal(0);
  readonly ready = signal(false);
  readonly status = signal('Starting 3D viewer…');
  readonly error = signal('');
  readonly navigation = signal('');
  constructor() {
    effect(() => {
      const features = this.store.features();
      const assets = this.store.assets();
      const layers = this.store.layers();
      if (this.ready())
        this.zone.runOutsideAngular(() => {
          void this.engine
            .load(features, assets, layers)
            .then((count) => {
              if (count !== undefined) this.zone.run(() => this.renderedCount.set(count));
            })
            .catch(() =>
              this.zone.run(() =>
                this.error.set('Geometry could not be rendered. Reload the estate.'),
              ),
            );
        });
    });
    effect(() => {
      const ids = this.store.sourceVisible();
      if (this.ready()) this.engine.setSourceVisible(ids);
    });
    effect(() => {
      const visible = this.store.visible();
      if (this.ready()) this.engine.setVisible(visible);
    });
    effect(() => {
      const id = this.store.selectedBlock()?.id ?? this.store.selectedDivision();
      if (this.ready()) {
        this.engine.select(id);
        if (id && !this.engine.fly(id))
          this.navigation.set('No geometry available for the selected record.');
        else this.navigation.set('');
      }
    });
  }
  ngAfterViewInit() {
    this.zone.runOutsideAngular(() => {
      void this.engine
        .initialize(
          this.host().nativeElement,
          this.config.cesium,
          (id) => this.zone.run(() => this.store.selectBlock(id)),
          (message) => this.zone.run(() => this.status.set(message)),
          (busy) => this.zone.run(() => this.moving.set(busy)),
        )
        .then(() => this.zone.run(() => this.ready.set(true)))
        .catch(() =>
          this.zone.run(() =>
            this.error.set(
              'WebGL is unavailable. Use the estate explorer and detail panel, or enable browser hardware acceleration.',
            ),
          ),
        );
    });
  }
  reset() {
    this.engine.reset();
  }
  mode(mode: '2D' | '3D') {
    this.engine.mode(mode);
  }
  ngOnDestroy() {
    this.engine.destroy();
  }
}
