import { describe, expect, it } from 'vitest';
import { binCounts, chi2Quantile2, confidenceEllipse, convexHull, decorateChart, DEFAULT_LAYERS, linearFit, prepareResult, CLASS_COLUMN } from './chart-layers';
import { buildGeoChart } from './build-geo-chart';
import { DEFAULT_PRESENTATION } from './chart-presentation';
import type { GeoResult, GeoRow } from './geochemistry-api';
import { attributeKey } from './geochemistry-attributes';

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const row = (i: number, x: number, y: number, group = 'G'): GeoRow => ({ row_index: i, sample_id: `S${i}`, group, status: 'valid', reason: null, x, y, z: null, values: null, classification: null, size_value: null, color_value: null });
const result = (rows: GeoRow[], kind = 'scatter'): GeoResult => ({ tool: 't', title: 't', rows, quality: { total: rows.length, used: rows.length, invalid: 0, excluded_qaqc: 0 },
  plot: { kind, x_label: 'X', y_label: 'Y', z_label: '', log_x: false, log_y: false, fields: [] }, warnings: [], formula: '', reference: '', pipeline: {}, created_at: '' });
const style = { pointSize: 7, symbol: 'circle', showLabels: false, attributes: {}, presentation: { ...DEFAULT_PRESENTATION } };
const opts = (over: Partial<Parameters<typeof decorateChart>[1]> = {}) => ({ kind: 'scatter', selection: new Set<number>(), layers: { ...DEFAULT_LAYERS }, logX: false, logY: false, accent: '#00a19a', ...over });

describe('geometry used by the visual layers', () => {
  it('uses the χ²(2) quantile for a 95 % ellipse', () => expect(chi2Quantile2(0.95)).toBeCloseTo(5.991, 3));
  it('draws an axis-aligned ellipse with semi-axes √(5.991·var)', () => {
    const xs = [-2, 2, 0, 0, -2, 2, 0, 0], ys = [0, 0, -1, 1, 0, 0, -1, 1];
    const e = confidenceEllipse(xs, ys)!;
    const varX = 16 / 7, varY = 4 / 7;
    expect(Math.max(...e.map(p => p[0]))).toBeCloseTo(Math.sqrt(5.991 * varX), 2);
    expect(Math.max(...e.map(p => p[1]))).toBeCloseTo(Math.sqrt(5.991 * varY), 2);
    expect(e[0]).toEqual(e[e.length - 1]);
  });
  it('rejects ellipses for too few or collinear points', () => {
    expect(confidenceEllipse([1, 2], [1, 2])).toBeNull();
    expect(confidenceEllipse([1, 2, 3], [2, 4, 6])).toBeNull();
  });
  it('computes a closed convex hull and ignores interior points', () => {
    const h = convexHull([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1]])!;
    expect(h).toHaveLength(5);
    expect(h).not.toContainEqual([1, 1]);
  });
  it('fits least squares with R²', () => {
    const f = linearFit([1, 2, 3, 4], [3, 5, 7, 9])!;
    expect(f.slope).toBeCloseTo(2); expect(f.intercept).toBeCloseTo(1); expect(f.r2).toBeCloseTo(1); expect(f.n).toBe(4);
    expect(linearFit([1, 1, 1], [1, 2, 3])).toBeNull();
  });
  it('bins values into equal widths', () => {
    const h = binCounts([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)!;
    expect(h.edges).toHaveLength(6); expect(h.counts.reduce((a, b) => a + b)).toBe(11);
  });
});

describe('linked selection, isolate and classes (presentation only)', () => {
  const rows = [row(0, 1, 1, 'A'), row(1, 2, 3, 'A'), row(5, 3, 2, 'B'), row(9, 4, 5, 'B')];
  it('tags every plotted point with its row_index', () => {
    const data = buildGeoChart(result(rows), style).data as Loose[];
    expect(data.map(t => t.customdata)).toEqual([[0, 1], [5, 9]]);
  });
  it('highlights the selected rows in every trace without dropping any point', () => {
    const chart = buildGeoChart(result(rows), style);
    const d = decorateChart(chart, opts({ selection: new Set([1, 9]) })).data as Loose[];
    expect(d.map(t => t.selectedpoints)).toEqual([[1], [1]]);
    expect(d.map(t => t.x.length)).toEqual([2, 2]);
    expect((chart.data[0] as Loose).selectedpoints).toBeUndefined();    // input not mutated
  });
  it('overlays the selected values on the same histogram bins', () => {
    const chart = buildGeoChart(result(rows, 'histogram'), style);
    const d = decorateChart(chart, opts({ kind: 'histogram', selection: new Set([1]), selectedValues: [2], selectionLabel: 'Selección' })).data as Loose[];
    expect(d.at(-1)).toMatchObject({ type: 'histogram', x: [2], name: 'Selección', bingroup: 'pyorex' });
    expect(d.filter(t => t.type === 'histogram').every(t => t.bingroup === 'pyorex')).toBe(true);
  });
  it('isolates the selection on a copy and leaves the result untouched', () => {
    const r = result(rows);
    const p = prepareResult(r, { selection: new Set([0, 9]), isolate: true, classes: [], byClass: false, noClassLabel: 'Sin clase' });
    expect(p.result.rows.map(x => x.row_index)).toEqual([0, 9]);
    expect(r.rows).toHaveLength(4);
  });
  it('regroups rows by user class and colours them with the class colour', () => {
    const p = prepareResult(result(rows), { selection: new Set(), isolate: false, byClass: true, noClassLabel: 'Sin clase',
      classes: [{ id: 'c1', name: 'Pórfido', color: '#d55e00', rows: [0, 5] }] });
    expect(p.result.rows.map(r => r.group)).toEqual(['Pórfido', 'Sin clase', 'Pórfido', 'Sin clase']);
    expect(p.result.pipeline.group_column).toBe(CLASS_COLUMN);
    expect(p.attributes[attributeKey(CLASS_COLUMN, 'Pórfido')]).toEqual({ color: '#d55e00' });
  });
});

describe('visual layers', () => {
  const cloud = Array.from({ length: 30 }, (_, i) => row(i, 40 + (i % 10) + (i % 3) * 0.7, 2 + (i % 7) * 0.5 + i * 0.05, i < 15 ? 'A' : 'B'));
  it('adds one ellipse, hull and regression per group and reports the fits', () => {
    const d = decorateChart(buildGeoChart(result(cloud), style), opts({ layers: { ...DEFAULT_LAYERS, ellipses: true, hulls: true, regression: true } }));
    const names = (d.data as Loose[]).map(t => t.name as string);
    expect(names.filter(n => n.endsWith('95 %'))).toHaveLength(2);
    expect(names.filter(n => n.endsWith('hull'))).toHaveLength(2);
    expect(d.fits.map(f => f.group)).toEqual(['A', 'B']);
  });
  it('puts density under the points and marginals on their own axes', () => {
    const d = decorateChart(buildGeoChart(result(cloud), style), opts({ layers: { ...DEFAULT_LAYERS, density: true, marginals: true } }));
    expect((d.data[0] as Loose).type).toBe('histogram2dcontour');
    expect((d.layout as Loose).xaxis2.domain).toEqual([0.86, 1]);
    expect((d.data as Loose[]).some(t => t.yaxis === 'y2')).toBe(true);
  });
  it('computes overlays in log space on log axes', () => {
    const logRows = [row(0, 1, 10), row(1, 10, 100), row(2, 100, 1000), row(3, 1000, 10000)];
    const d = decorateChart(buildGeoChart(result(logRows), style), opts({ logX: true, logY: true, layers: { ...DEFAULT_LAYERS, regression: true } }));
    expect(d.fits[0].slope).toBeCloseTo(1); expect(d.fits[0].r2).toBeCloseTo(1);
  });
  it('never draws geometric layers on renderers that are not XY point clouds', () => {
    const tern = { ...result(cloud, 'ternary') };
    const d = decorateChart(buildGeoChart(tern, style), opts({ kind: 'ternary', layers: { ...DEFAULT_LAYERS, ellipses: true, density: true } }));
    expect(d.data).toHaveLength(buildGeoChart(tern, style).data.length);
  });
  it('can hide the legend', () => {
    expect((decorateChart(buildGeoChart(result(cloud), style), opts({ layers: { ...DEFAULT_LAYERS, legend: false } })).layout as Loose).showlegend).toBe(false);
  });
});
