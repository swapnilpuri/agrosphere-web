import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, vi } from 'vitest';
import { LayerManagerComponent } from './layer-manager.component';
import { EstateStore } from '../estates/estate.store';
describe('Layer controls', () => {
  it('exposes accessible checkboxes and calls the layer state', () => {
    const toggle = vi.fn();
    TestBed.configureTestingModule({
      imports: [LayerManagerComponent],
      providers: [
        {
          provide: EstateStore,
          useValue: { visible: signal(new Set(['ESTATE', 'BLOCK'])), toggle },
        },
      ],
    });
    const f = TestBed.createComponent(LayerManagerComponent);
    f.detectChanges();
    const inputs = f.nativeElement.querySelectorAll('input');
    expect(inputs).toHaveLength(7);
    inputs[2].click();
    expect(toggle).toHaveBeenCalledWith('BLOCK');
  });
});
