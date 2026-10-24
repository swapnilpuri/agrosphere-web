import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { EstateStore } from './estate.store';
import { EstateApi } from '../../api/estate/estate.api';
import { SpatialApi } from '../../api/spatial/spatial.api';
import { Block, Estate } from '../../shared/models';
describe('Estate state', () => {
  function setup() {
    const pending = new Subject<Block[]>();
    const api = {
      estates: () => of([{ id: 'a' }, { id: 'b' }] as Estate[]),
      divisions: () => of([]),
      blocks: vi.fn((id: string) =>
        id === 'a' ? pending : of([{ id: 'b-block', estateId: 'b' }] as Block[]),
      ),
      block: (id: string) => of({ id, estateId: 'b' } as Block),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: EstateApi, useValue: api },
        {
          provide: SpatialApi,
          useValue: { features: () => of([]), layers: () => of([]), assets: () => of([]) },
        },
      ],
    });
    return { store: TestBed.inject(EstateStore), pending };
  }
  it('cancels obsolete estate loads and ignores stale results', () => {
    const { store, pending } = setup();
    store.load();
    store.selectEstate('b');
    pending.next([{ id: 'stale' }] as Block[]);
    pending.complete();
    expect(store.blocks()[0].id).toBe('b-block');
    expect(store.estateId()).toBe('b');
  });
  it('toggles individual layers immutably', () => {
    const { store } = setup();
    const original = store.visible();
    store.toggle('BLOCK');
    expect(original.has('BLOCK')).toBe(true);
    expect(store.visible().has('BLOCK')).toBe(false);
    expect(store.visible().has('ESTATE')).toBe(true);
    store.toggle('BLOCK');
    expect(store.visible().has('BLOCK')).toBe(true);
  });
  it('selects block details by canonical identity', () => {
    const { store } = setup();
    store.load();
    store.selectEstate('b');
    store.selectBlock('b-block');
    expect(store.selectedBlock()?.id).toBe('b-block');
  });
});
