import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { DashboardComponent } from './dashboard.component';
import { EstateApi } from '../../api/estate/estate.api';
vi.mock('echarts/core', () => ({
  init: () => ({ setOption: () => {}, dispose: () => {}, resize: () => {} }),
  use: () => {},
}));
describe('Portfolio dashboard', () => {
  it('aggregates every accessible estate and division', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        {
          provide: EstateApi,
          useValue: {
            estates: () => of([{ id: 'a' }, { id: 'b' }]),
            divisions: () => of([{}]),
            blocks: () =>
              of([
                {
                  plantedAreaHectares: 2,
                  plantedTreeCount: 100,
                  tappableTreeCount: 70,
                  status: 'ACTIVE',
                },
              ]),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.estates()).toBe(2);
    expect(fixture.componentInstance.divisions()).toBe(2);
    expect(fixture.componentInstance.stats().planted).toBe(200);
    expect(fixture.componentInstance.stats().area).toBe(4);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('200');
    await fixture.whenStable();
    fixture.destroy();
    vi.unstubAllGlobals();
  });
});
