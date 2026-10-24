import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, vi } from 'vitest';
import { CesiumViewerComponent } from './cesium-viewer.component';
import { CesiumViewerService } from './cesium-viewer.service';
import { EstateStore } from '../estates/estate.store';
import { CONFIG } from '../../core/config';
describe('Cesium lifecycle', () => {
  it('initializes once and destroys its viewer on route teardown', async () => {
    const engine = {
      initialize: vi.fn(async () => {}),
      load: vi.fn(async () => 0),
      setVisible: vi.fn(),
      setSourceVisible: vi.fn(),
      select: vi.fn(),
      fly: vi.fn(),
      destroy: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [CesiumViewerComponent],
      providers: [
        { provide: CONFIG, useValue: { cesium: {} } },
        {
          provide: EstateStore,
          useValue: {
            features: signal([]),
            assets: signal([]),
            layers: signal([]),
            visible: signal(new Set()),
            sourceVisible: signal(new Set()),
            selectedBlock: signal(null),
            selectedDivision: signal(''),
            selectBlock: vi.fn(),
          },
        },
      ],
    });
    TestBed.overrideComponent(CesiumViewerComponent, {
      set: { providers: [{ provide: CesiumViewerService, useValue: engine }] },
    });
    const f = TestBed.createComponent(CesiumViewerComponent);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    expect(engine.initialize).toHaveBeenCalledTimes(1);
    expect(engine.load).toHaveBeenCalled();
    f.destroy();
    expect(engine.destroy).toHaveBeenCalledTimes(1);
  });
});
