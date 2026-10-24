import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { concatMap, forkJoin, from, reduce, switchMap, finalize } from 'rxjs';
import { EstateApi } from '../../api/estate/estate.api';
import { aggregate, Block } from '../../shared/models';
import { errorMessage } from '../../core/errors';
import type { ECharts } from 'echarts/core';
@Component({ standalone: true, imports: [DecimalPipe], templateUrl: './dashboard.component.html' })
export class DashboardComponent implements AfterViewInit, OnDestroy {
  private readonly api = inject(EstateApi);
  private readonly destroy = inject(DestroyRef);
  private readonly chartHost = viewChild.required<ElementRef<HTMLDivElement>>('chart');
  private chart?: ECharts;
  private resize?: ResizeObserver;
  private destroyed = false;
  readonly busy = signal(true);
  readonly error = signal('');
  readonly estates = signal(0);
  readonly divisions = signal(0);
  readonly stats = signal(aggregate([]));
  ngAfterViewInit() {
    this.load();
  }
  load() {
    this.busy.set(true);
    this.error.set('');
    this.api
      .estates()
      .pipe(
        switchMap((estates) => {
          this.estates.set(estates.length);
          return from(estates).pipe(
            concatMap((e) =>
              forkJoin({ divisions: this.api.divisions(e.id), blocks: this.api.blocks(e.id) }),
            ),
            reduce(
              (all, v) => ({
                divisions: all.divisions + v.divisions.length,
                blocks: all.blocks.concat(v.blocks),
              }),
              { divisions: 0, blocks: [] as Block[] },
            ),
          );
        }),
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (data) => {
          this.divisions.set(data.divisions);
          this.stats.set(aggregate(data.blocks));
          void this.renderChart();
        },
        error: (e) => this.error.set(errorMessage(e)),
      });
  }
  private async renderChart() {
    const [{ init, use }, { PieChart }, { TooltipComponent, LegendComponent }, { CanvasRenderer }] =
      await Promise.all([
        import('echarts/core'),
        import('echarts/charts'),
        import('echarts/components'),
        import('echarts/renderers'),
      ]);
    if (this.destroyed) return;
    use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer]);
    this.chart ??= init(this.chartHost().nativeElement);
    this.chart.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['52%', '76%'],
          label: { show: false },
          data: [
            { name: 'Active blocks', value: this.stats().active, itemStyle: { color: '#176a58' } },
            {
              name: 'Inactive blocks',
              value: this.stats().inactive,
              itemStyle: { color: '#c3cdd0' },
            },
          ],
        },
      ],
    });
    this.resize ??= new ResizeObserver(() => this.chart?.resize());
    this.resize.observe(this.chartHost().nativeElement);
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.resize?.disconnect();
    this.chart?.dispose();
  }
}
