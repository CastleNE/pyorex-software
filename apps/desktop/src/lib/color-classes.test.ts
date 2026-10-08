import { describe, expect, it } from 'vitest';
import { COLOR_RAMPS, MISSING_COLOR, colorClassLegend, rampColors, type ColorClassSettings } from './color-classes';
import { buildGeoChart } from './build-geo-chart';
import { DEFAULT_PRESENTATION } from './chart-presentation';
import { sanitizePresentation } from './geochemistry-session';
import type { GeoResult, GeoRow } from './geochemistry-api';

const C = (over: Partial<ColorClassSettings> = {}): ColorClassSettings => ({ colorClasses: 5, colorMethod: 'equal', colorBreaks: null, colorPercentiles: null, colorLog: false, colorBoundary: 'up', colorRamp: 'rainbow', colorReverse: false, colorCustom: null, ...over });
const hundred = Array.from({ length: 101 }, (_, i) => i);

describe('colour by value with user classes', () => {
  it('samples the ramp end to end for any class count', () => {
    for (const n of [2, 5, 12, 20]) {
      const c = rampColors('viridis', n);
      expect(c).toHaveLength(n);
      expect(c[0]).toBe(COLOR_RAMPS.viridis[0]); expect(c[n - 1]).toBe(COLOR_RAMPS.viridis[5]);
    }
    expect(rampColors('viridis', 3, true)[0]).toBe(COLOR_RAMPS.viridis[5]);
  });
  it('uses the same limit rules as the size classes (percentiles, values, boundary)', () => {
    expect(colorClassLegend(hundred, C({ colorMethod: 'percentile', colorPercentiles: [50, 75, 90, 95, 98] })).breaks).toEqual([50, 75, 90, 95, 98]);
    const l = colorClassLegend([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], C({ colorMethod: 'manual', colorBreaks: [3, 6, 9], colorBoundary: 'down' }));
    expect(l.counts).toEqual([3, 3, 3, 1]);
    expect(l.colors).toHaveLength(4);
  });
  it('keeps colours picked by hand while the class count matches', () => {
    const custom = ['#000000', '#111111', '#222222', '#333333'];
    expect(colorClassLegend(hundred, C({ colorClasses: 4, colorCustom: custom })).colors).toEqual(custom);
    expect(colorClassLegend(hundred, C({ colorClasses: 6, colorCustom: custom })).colors).toEqual(rampColors('rainbow', 6));
  });
  it('colours each point by its class and greys samples without data', () => {
    const row = (i: number, v: number | null): GeoRow => ({ row_index: i, sample_id: `S${i}`, group: 'G', status: 'valid', reason: null, x: i, y: i, z: null, values: null, classification: null, size_value: null, color_value: v });
    const result: GeoResult = { tool: 'scatter', title: 't', rows: [row(0, 10), row(1, 60), row(2, 300), row(3, null)], quality: { total: 4, used: 4, invalid: 0, excluded_qaqc: 0 },
      plot: { kind: 'scatter', x_label: 'x', y_label: 'y', z_label: '', log_x: false, log_y: false, fields: [] }, warnings: [], formula: '', reference: '', pipeline: { color_column: 'Cu_ppm' }, created_at: '' };
    const out = buildGeoChart(result, { pointSize: 7, symbol: 'circle', showLabels: false, attributes: {}, presentation: { ...DEFAULT_PRESENTATION, colorMethod: 'manual', colorBreaks: [50, 100] } });
    const colors = (out.data[0] as { marker: { color: string[] } }).marker.color;
    const ramp = rampColors('rainbow', 3);
    expect(colors).toEqual([ramp[0], ramp[1], ramp[2], MISSING_COLOR]);
    expect(out.colorLegend).toMatchObject({ label: 'Cu_ppm', breaks: [50, 100], counts: [1, 1, 1], missing: 1 });
  });
  it('keeps colour class settings in saved sessions and rejects broken ones', () => {
    const ok = sanitizePresentation({ ...DEFAULT_PRESENTATION, colorClasses: 9, colorMethod: 'percentile', colorPercentiles: [10, 50, 90], colorRamp: 'heat', colorReverse: true, colorBoundary: 'down', colorCustom: ['#ff0000', '#00ff00'] });
    expect(ok).toMatchObject({ colorClasses: 9, colorMethod: 'percentile', colorPercentiles: [10, 50, 90], colorRamp: 'heat', colorReverse: true, colorBoundary: 'down', colorCustom: ['#ff0000', '#00ff00'] });
    const bad = sanitizePresentation({ colorClasses: 1, colorMethod: 'x', colorRamp: 'neon', colorCustom: ['red', 'blue'], colorBreaks: [5, 1] });
    expect(bad).toMatchObject({ colorClasses: 5, colorMethod: 'equal', colorRamp: 'rainbow', colorCustom: null, colorBreaks: null });
  });
});
