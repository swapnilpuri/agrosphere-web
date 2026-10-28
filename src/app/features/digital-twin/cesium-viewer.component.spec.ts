import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, vi } from 'vitest';
import { CesiumViewerComponent } from './cesium-viewer.component';
import { CesiumViewerService } from './cesium-viewer.service';
import { EstateStore } from '../estates/estate.store';
import { CONFIG } from '../../core/config';
import { Block, Feature } from '../../shared/models';
describe('Cesium lifecycle', () => {
  it('retries the current selection and clears the warning after geometry finishes loading', async () => {
    const features = signal<Feature[]>([]);
    const selectedBlock = signal<Block | null>(null);
    const engine = {
      initialize: vi.fn(async () => {}),
      load: vi.fn<() => Promise<number | undefined>>(async () => 0),
      setVisible: vi.fn(),
      setSourceVisible: vi.fn(),
      select: vi.fn(),
      fly: vi.fn(() => false),
      destroy: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [CesiumViewerComponent],
      providers: [
        { provide: CONFIG, useValue: { cesium: {} } },
        {
          provide: EstateStore,
          useValue: {
            features,
            assets: signal([]),
            layers: signal([]),
            visible: signal(new Set()),
            sourceVisible: signal(new Set()),
            selectedBlock,
            selectedDivision: signal(''),
            selectBlock: vi.fn(),
          },
        },
      ],
    });
    TestBed.overrideComponent(CesiumViewerComponent, {
      set: { providers: [{ provide: CesiumViewerService, useValue: engine }] },
    });
    const fixture = TestBed.createComponent(CesiumViewerComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    selectedBlock.set({ id: 'selected-block' } as Block);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.navigation()).toContain('No geometry available');

    let complete!: (count: number) => void;
    engine.load.mockImplementationOnce(() => new Promise((resolve) => (complete = resolve)));
    features.set([{ id: 'geometry', referenceEntityId: 'selected-block' } as Feature]);
    fixture.detectChanges();
    engine.fly.mockReturnValue(true);
    complete(1);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.renderedCount()).toBe(1);
    expect(fixture.componentInstance.navigation()).toBe('');
    expect(engine.fly).toHaveBeenLastCalledWith('selected-block');
    fixture.destroy();
  });

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
