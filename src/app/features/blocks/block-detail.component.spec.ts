import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect } from 'vitest';
import { BlockDetailComponent } from './block-detail.component';
import { EstateStore } from '../estates/estate.store';
describe('Block detail panel', () => {
  it('distinguishes absent clone and GIS from zero counts', () => {
    TestBed.configureTestingModule({
      imports: [BlockDetailComponent],
      providers: [
        {
          provide: EstateStore,
          useValue: {
            selectedBlock: signal({
              id: 'block-uuid',
              blockCode: 'B-12',
              name: 'North',
              status: 'ACTIVE',
              divisionId: 'div',
              rubberCloneCode: null,
              plantingDate: null,
              plantedAreaHectares: 1,
              plantedTreeCount: 0,
              tappableTreeCount: 0,
            }),
            estate: signal({ name: 'Rubber estate' }),
            divisions: signal([{ id: 'div', name: 'North division' }]),
            selectedGeometry: signal(undefined),
            detailError: signal(''),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(BlockDetailComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('B-12');
    expect(text).toContain('Not supplied');
    expect(text).toContain('No active geometry');
    expect(text).toContain('block-uuid');
  });
});
