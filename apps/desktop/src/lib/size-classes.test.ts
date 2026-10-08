import { describe, expect, it } from 'vitest';
import { breaksProblem, classIndex, classRange, classSizes, classSizesFor, computeSizeBreaks, fmtLimit, percentBelow, percentilesProblem, resolveSizeBreaks, seriesBreaks, sizeClassLegend, suggestBreak, unitOf, type SizeClassSettings } from './size-classes';
import { buildGeoChart } from './build-geo-chart';
import { DEFAULT_PRESENTATION } from './chart-presentation';
import { sanitizePresentation } from './geochemistry-session';
import type { GeoResult, GeoRow } from './geochemistry-api';

const S = (over: Partial<SizeClassSettings> = {}): SizeClassSettings => ({ sizeClasses: 5, sizeMethod: 'quantile', sizeBreaks: null, sizePercentiles: null, sizeMin: 5, sizeMax: 18, sizeLog: false, sizeBoundary: 'up', ...over });
const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('size classes: limits', () => {
  it('computes n−1 limits with each method', () => {
    expect(computeSizeBreaks(ten, 'equal', 4, false)).toEqual([3.25, 5.5, 7.75]);
    expect(computeSizeBreaks(ten, 'quantile', 5, false)).toEqual([2.8, 4.6, 6.4, 8.2]);
    for (const n of [4, 5, 6]) expect(computeSizeBreaks(ten, 'jenks', n, false)).toHaveLength(n - 1);
  });
  it('natural breaks separate clear clusters', () => {
    expect(computeSizeBreaks([1, 1.1, 1.2, 10, 10.5, 11, 50, 52, 55, 100, 101, 102], 'jenks', 4, false)).toEqual([10, 50, 100]);
  });
  it('works in log10 and ignores values ≤ 0 on a log scale', () => {
    expect(computeSizeBreaks([1, 10, 100, 1000, 10000], 'equal', 4, true).map(b => +b.toFixed(6))).toEqual([10, 100, 1000]);
    expect(computeSizeBreaks([-5, 0, 10, 100, 1000], 'equal', 4, true)).toHaveLength(3);
  });
  it('validates manual limits', () => {
    expect(breaksProblem([10, 50, 100], false)).toBeNull();
    expect(breaksProblem([], false)).toBe('count');
    expect(breaksProblem(Array.from({ length: 20 }, (_, i) => i), false)).toBe('count');
    expect(breaksProblem([10, 10, 100], false)).toBe('increasing');
    expect(breaksProblem([0, 10, 100], true)).toBe('positive');
    expect(breaksProblem([1, Number.NaN, 3], false)).toBe('number');
    expect(percentilesProblem([10, 50, 90])).toBeNull();
    expect(percentilesProblem([0, 50])).toBe('pctRange');
    expect(percentilesProblem([50, 100])).toBe('pctRange');
    expect(percentilesProblem([50, 25])).toBe('increasing');
  });
  it('uses valid manual limits and falls back to quantiles when they are not usable', () => {
    expect(resolveSizeBreaks(ten, S({ sizeClasses: 4, sizeMethod: 'manual', sizeBreaks: [2, 5, 9] }))).toEqual([2, 5, 9]);
    expect(resolveSizeBreaks(ten, S({ sizeClasses: 4, sizeMethod: 'manual', sizeBreaks: [9, 5, 2] }))).toEqual(computeSizeBreaks(ten, 'quantile', 4, false));
  });
});

describe('size classes: more classes, percentiles and values (ioGAS-like bin ranges)', () => {
  const hundred = Array.from({ length: 101 }, (_, i) => i); // 0..100: percentile p is value p
  it('allows up to 20 classes with the computed methods', () => {
    expect(resolveSizeBreaks(hundred, S({ sizeClasses: 10 }))).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(resolveSizeBreaks(hundred, S({ sizeClasses: 20, sizeMethod: 'equal' }))).toHaveLength(19);
    expect(resolveSizeBreaks(hundred, S({ sizeClasses: 50 }))).toHaveLength(19); // clamped to 20 classes
  });
  it('turns own percentiles into limits in data units', () => {
    expect(resolveSizeBreaks(hundred, S({ sizeMethod: 'percentile', sizePercentiles: [50, 75, 90, 95, 98] }))).toEqual([50, 75, 90, 95, 98]);
    expect(resolveSizeBreaks(hundred, S({ sizeMethod: 'percentile', sizePercentiles: [50, 25] }))).toEqual(computeSizeBreaks(hundred, 'quantile', 5, false));
  });
  it('drops percentiles that collapse onto the same value because of ties', () => {
    expect(resolveSizeBreaks([1, 1, 1, 1, 1, 1, 1, 1, 5, 9], S({ sizeMethod: 'percentile', sizePercentiles: [10, 20, 90] }))).toEqual([1, 5.4]);
  });
  it('uses own values with any count of classes', () => {
    const legend = sizeClassLegend(hundred, S({ sizeMethod: 'manual', sizeBreaks: [5, 10, 20, 40, 60, 80, 90, 95] }));
    expect(legend.sizes).toHaveLength(9);
    expect(legend.counts.reduce((a, b) => a + b, 0)).toBe(101);
  });
  it('builds the 1-2-5 series inside the data range', () => {
    expect(seriesBreaks([31, 80, 262])).toEqual([50, 100, 200]);
    expect(seriesBreaks([0.3, 4, 12])).toEqual([0.5, 1, 2, 5, 10]);
    expect(seriesBreaks([-1, 0])).toEqual([]);
  });
  it('expresses each limit as the share of samples below it', () => {
    expect(percentBelow(ten, 4)).toBe(30);
    expect(percentBelow(ten, 4, 'down')).toBe(40);
    expect(sizeClassLegend(hundred, S({ sizeMethod: 'manual', sizeBreaks: [25.5] })).percents).toEqual([26 / 101 * 100]);
  });
  it('follows the boundary rule: cases equal to a limit go up or down', () => {
    expect([2, 5, 9].map(x => classIndex(x, [2, 5, 9], 'down'))).toEqual([0, 1, 2]);
    const down = sizeClassLegend(ten, S({ sizeMethod: 'manual', sizeBreaks: [3, 6, 9], sizeBoundary: 'down' }));
    expect(down.counts).toEqual([3, 3, 3, 1]);
    expect([0, 1, 3].map(k => classRange(down, k))).toEqual(['≤ 3', '3 – 6', '> 9']);
    expect(classRange({ ...down, boundary: 'up' }, 0)).toBe('< 3');
  });
  it('suggests a new break inside the fullest class', () => {
    const b = suggestBreak(hundred, [10, 90]);
    expect(b).toBeGreaterThan(10); expect(b).toBeLessThan(90);
    expect(suggestBreak([1], [])).toBeNull();
  });
  it('reads the unit from column and axis labels', () => {
    expect(['Cu_ppm', 'Au (ppb)', 'SiO2 (wt%)', 'TiO2_pct', 'Au_g/t', 'Fe2O3_%', 'Sector', 'La/Yb'].map(unitOf)).toEqual(['ppm', 'ppb', 'wt%', '%', 'g/t', '%', '', '']);
  });
});

describe('size classes: symbols and counts', () => {
  it('assigns a value equal to a limit to the upper class', () => {
    expect([1.9, 2, 4.99, 5, 9, 99].map(x => classIndex(x, [2, 5, 9]))).toEqual([0, 1, 1, 2, 3, 3]);
  });
  it('grows the symbol area evenly between min and max', () => {
    const d = classSizes(5, 4, 16);
    expect(d[0]).toBe(4); expect(d[4]).toBe(16);
    const areas = d.map(x => x * x);
    expect(areas[2] - areas[1]).toBeGreaterThan(0);
  });
  it('counts samples per class and reports values left out', () => {
    const legend = sizeClassLegend([...ten, null, -1], S({ sizeClasses: 4, sizeMethod: 'manual', sizeBreaks: [3, 6, 9], sizeLog: true }));
    expect(legend.counts).toEqual([2, 3, 3, 2]);
    expect(legend.missing).toBe(2);
    expect([legend.min, legend.max]).toEqual([1, 10]);
    expect(classSizesFor([1, 10, null, -1], legend, 7)).toEqual([legend.sizes[0], legend.sizes[3], 7, 7]);
  });
  it('formats limits compactly', () => {
    expect(fmtLimit(1234.5678)).toBe('1235'); expect(fmtLimit(0.012345)).toBe('0.01235'); expect(fmtLimit(1e-5)).toBe('1.00e-5');
  });
});

describe('size classes in charts and sessions', () => {
  const row = (i: number, y: number): GeoRow => ({ row_index: i, sample_id: `S${i}`, group: 'G', status: 'valid', reason: null, x: i, y, z: null, values: null, classification: null, size_value: y * 10, color_value: null });
  const result: GeoResult = { tool: 'scatter', title: 't', rows: ten.map(v => row(v, v)), quality: { total: 10, used: 10, invalid: 0, excluded_qaqc: 0 },
    plot: { kind: 'scatter', x_label: 'SiO2', y_label: 'Cu (ppm)', z_label: '', log_x: false, log_y: false, fields: [] }, warnings: [], formula: '', reference: '', pipeline: { size_column: 'Cu_ppm' }, created_at: '' };
  const style = { pointSize: 7, symbol: 'circle', showLabels: false, attributes: {} };
  it('sizes each point by its class and returns a legend', () => {
    const out = buildGeoChart(result, { ...style, presentation: { ...DEFAULT_PRESENTATION, sizeMode: 'classes', sizeSource: 'column', sizeClasses: 4, sizeMethod: 'manual', sizeBreaks: [30, 60, 90], sizeMin: 4, sizeMax: 16 } });
    const sizes = (out.data[0] as { marker: { size: number[] } }).marker.size;
    expect(sizes[0]).toBe(4); expect(sizes[9]).toBe(16);
    expect(out.sizeLegend).toMatchObject({ label: 'Cu_ppm', breaks: [30, 60, 90], counts: [2, 3, 3, 2] });
  });
  it('has no size legend in the other modes', () => {
    expect(buildGeoChart(result, { ...style, presentation: { ...DEFAULT_PRESENTATION } }).sizeLegend).toBeNull();
  });
  it('keeps class settings in saved sessions and rejects broken ones', () => {
    const ok = sanitizePresentation({ ...DEFAULT_PRESENTATION, sizeMode: 'classes', sizeClasses: 12, sizeMethod: 'percentile', sizeBreaks: [1, 2, 3, 4, 5, 6, 7, 8], sizePercentiles: [50, 75, 90, 95, 98], sizeMin: 3, sizeMax: 30, sizeLog: true, sizeBoundary: 'down' });
    expect(ok).toMatchObject({ sizeMode: 'classes', sizeClasses: 12, sizeMethod: 'percentile', sizeBreaks: [1, 2, 3, 4, 5, 6, 7, 8], sizePercentiles: [50, 75, 90, 95, 98], sizeMin: 3, sizeMax: 30, sizeLog: true, sizeBoundary: 'down' });
    const bad = sanitizePresentation({ sizeMode: 'classes', sizeClasses: 21, sizeMethod: 'magic', sizeBreaks: [1, 'x'], sizePercentiles: [0, 100], sizeBoundary: 'sideways' });
    expect(bad).toMatchObject({ sizeMode: 'classes', sizeClasses: 5, sizeMethod: 'quantile', sizeBreaks: null, sizePercentiles: null, sizeBoundary: 'up' });
    expect(sanitizePresentation({ sizeClasses: 4.5 }).sizeClasses).toBe(5);
  });
});
