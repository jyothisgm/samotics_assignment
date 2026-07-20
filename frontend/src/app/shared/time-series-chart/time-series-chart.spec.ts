import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SensorReadingPoint } from '../../core/assets/assets.models';
import { TimeSeriesChart } from './time-series-chart';

function reading(hour: number, value: number): SensorReadingPoint {
  return { timestamp: `2026-01-01T${String(hour).padStart(2, '0')}:00:00Z`, value };
}

describe('TimeSeriesChart', () => {
  let fixture: ComponentFixture<TimeSeriesChart>;
  let component: TimeSeriesChart;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TimeSeriesChart] });
    fixture = TestBed.createComponent(TimeSeriesChart);
    component = fixture.componentInstance;
  });

  function setReadings(readings: SensorReadingPoint[], unit: string | null = 'mm/s') {
    fixture.componentRef.setInput('title', 'vibration velocity');
    fixture.componentRef.setInput('unit', unit);
    fixture.componentRef.setInput('readings', readings);
    fixture.detectChanges();
  }

  it('produces no points for empty readings', () => {
    setReadings([]);
    expect(component.points()).toEqual([]);
    expect(component.linePath()).toBe('');
    expect(component.areaPath()).toBe('');
    expect(component.latest()).toBeNull();
  });

  it('maps a single reading to one point at the left edge', () => {
    setReadings([reading(0, 5)]);
    const points = component.points();
    expect(points.length).toBe(1);
    expect(points[0].x).toBe(4);
    expect(points[0].value).toBe(5);
  });

  it('scales the minimum value below the maximum value on the y-axis', () => {
    setReadings([reading(0, 0), reading(1, 10)]);
    const [minPoint, maxPoint] = component.points();
    // SVG y grows downward, so the smaller value should have the larger y.
    expect(minPoint.y).toBeGreaterThan(maxPoint.y);
  });

  it('linePath starts with M and has one L per subsequent point', () => {
    setReadings([reading(0, 1), reading(1, 2), reading(2, 3)]);
    const path = component.linePath();
    expect(path.startsWith('M')).toBeTrue();
    expect(path.match(/L/g)?.length).toBe(2);
  });

  it('areaPath closes back down to the baseline', () => {
    setReadings([reading(0, 1), reading(1, 2)]);
    expect(component.areaPath().endsWith('Z')).toBeTrue();
    expect(component.areaPath()).toContain(`${component.baselineY}`);
  });

  it('reports min, max, and latest values', () => {
    setReadings([reading(0, 3), reading(1, 7), reading(2, 5)]);
    expect(component.minValue()).toBe(3);
    expect(component.maxValue()).toBe(7);
    expect(component.latest()?.value).toBe(5);
  });

  it('renders the title and unit', () => {
    setReadings([reading(0, 1)]);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.chart-title')?.textContent).toContain('vibration velocity');
    expect(el.querySelector('.chart-unit')?.textContent).toContain('mm/s');
  });

  it('does not render a unit element when unit is null', () => {
    setReadings([reading(0, 1)], null);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.chart-unit')).toBeFalsy();
  });

  it('shows a "no data" message and no chart when there are no readings', () => {
    setReadings([]);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.no-data')).toBeTruthy();
    expect(el.querySelector('svg')).toBeFalsy();
  });
});
