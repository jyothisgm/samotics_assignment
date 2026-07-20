import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';

import { SensorReadingPoint } from '../../core/assets/assets.models';

const WIDTH = 320;
const HEIGHT = 96;
const PAD_X = 4;
const PAD_Y = 10;

@Component({
  selector: 'app-time-series-chart',
  imports: [DatePipe, DecimalPipe],
  templateUrl: './time-series-chart.html',
  styleUrl: './time-series-chart.scss',
})
export class TimeSeriesChart {
  readonly title = input.required<string>();
  readonly unit = input<string | null>(null);
  readonly readings = input.required<SensorReadingPoint[]>();

  readonly width = WIDTH;
  readonly height = HEIGHT;
  readonly baselineY = HEIGHT - PAD_Y;

  readonly points = computed(() => {
    const data = this.readings();
    if (data.length === 0) {
      return [];
    }

    const values = data.map((r) => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const stepX = data.length > 1 ? (WIDTH - PAD_X * 2) / (data.length - 1) : 0;

    return data.map((r, i) => ({
      x: PAD_X + i * stepX,
      y: PAD_Y + (HEIGHT - PAD_Y * 2) * (1 - (r.value - min) / span),
      value: r.value,
      timestamp: r.timestamp,
    }));
  });

  readonly linePath = computed(() =>
    this.points()
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' '),
  );

  readonly areaPath = computed(() => {
    const pts = this.points();
    if (pts.length === 0) {
      return '';
    }
    const first = pts[0];
    const last = pts[pts.length - 1];
    return `${this.linePath()} L${last.x.toFixed(1)},${this.baselineY} L${first.x.toFixed(1)},${this.baselineY} Z`;
  });

  readonly latest = computed(() => {
    const pts = this.points();
    return pts.length ? pts[pts.length - 1] : null;
  });

  readonly minValue = computed(() => Math.min(...this.readings().map((r) => r.value)));
  readonly maxValue = computed(() => Math.max(...this.readings().map((r) => r.value)));
}
