import { describe, expect, it } from 'vitest';
import { buildMap, fmtDistance, mapExtent, niceLength } from './build-map';
import { DEFAULT_MAP } from '../stores/map-store';
import { DARK_CHART_THEME } from './chart-theme';
import type { MapResult } from './maps-api';

const base = (over: Partial<MapResult> = {}): MapResult => ({
  dataset_id: 'd', value_label: 'Cu_ppm', value_columns: ['Cu_ppm'], category_column: null,
  crs: { source: 'projected_xy', epsg: 32718, label: 'UTM 18S', geographic: false, unit: 'm', x_column: 'Este', y_column: 'Norte', interpolable: true },
  points: [
    { row_index: 0, sample_id: 'a', x: 0, y: 0, value: 10, reason: null, category: 'A' },
    { row_index: 1, sample_id: 'b', x: 1000, y: 0, value: 100, reason: null, category: 'B' },
    { row_index: 2, sample_id: 'c', x: 0, y: 1000, value: null, reason: 'censurado', category: 'A' },
    { row_index: 3, sample_id: 'd', x: 1000, y: 1000, value: 1000, reason: null, category: null },
  ],
  quality: { total: 4, mapped: 4, no_coordinates: 0, no_value: 1, excluded_qaqc: 0 },
  grid: { x: [0, 500, 1000], y: [0, 500, 1000], z: [[10, 50, 100], [20, 60, 500], [null, 300, 1000]], epsg: 32718, coordinate_unit: 'metre', log: false },
  grid_metrics: null, warnings: [], idw: null, created_at: '', ...over,
});
const ctx = { selection: new Set<number>(), dragmode: 'lasso' as const, theme: DARK_CHART_THEME, t: (x: { es: string }) => x.es };

describe('sample map figure', () => {
  it('colours points by class and leaves samples without value grey', () => {
    const f = buildMap(base(), { ...DEFAULT_MAP, colorClasses: 3, colorMethod: 'manual', colorBreaks: [50, 500] }, ctx);
    const pts = f.data.at(-1) as { marker: { color: string[] }; customdata: number[] };
    expect(pts.customdata).toEqual([0, 1, 2, 3]);
    expect(pts.marker.color[2]).toBe('#a1a1aa');
    expect(new Set([pts.marker.color[0], pts.marker.color[1], pts.marker.color[3]]).size).toBe(3);
    expect(f.legend.kind).toBe('classes');
    if (f.legend.kind === 'classes') { expect(f.legend.classes.map(c => c.count)).toEqual([1, 1, 1]); expect(f.legend.missing).toBe(1); }
  });
  it('draws the surface with the same classes and one isoline per limit', () => {
    const f = buildMap(base(), { ...DEFAULT_MAP, surface: true, colorMethod: 'manual', colorBreaks: [50, 500], colorClasses: 3 }, ctx);
    const heat = f.data.find(d => d.type === 'heatmap') as { z: (number | null)[][] };
    expect(heat.z).toEqual([[0, 1, 1], [0, 1, 2], [null, 1, 2]]);
    const lines = f.data.filter(d => d.type === 'contour') as { contours: { start: number } }[];
    expect(lines.map(l => l.contours.start)).toEqual([50, 500]);
    const off = buildMap(base(), { ...DEFAULT_MAP, surface: false }, ctx);
    expect(off.data.some(d => d.type === 'heatmap')).toBe(false);
  });
  it('uses categories as colours without a value and as symbols with one', () => {
    const onlyCat = buildMap(base({ value_label: null, category_column: 'Sector', grid: null }), DEFAULT_MAP, ctx);
    expect(onlyCat.legend.kind).toBe('categories');
    if (onlyCat.legend.kind === 'categories') expect(onlyCat.legend.items.map(i => [i.name, i.count])).toEqual([['A', 2], ['B', 1], ['Sin dato', 1]]);
    const both = buildMap(base({ category_column: 'Sector' }), DEFAULT_MAP, ctx);
    expect(both.symbols.map(s => s.name)).toEqual(['A', 'B', 'Sin dato']);
    expect((both.data.at(-1) as { marker: { symbol: string[] } }).marker.symbol).toEqual(['circle', 'square', 'circle', 'triangle-up']);
  });
  it('keeps one metre equal on both axes and adds a scale bar', () => {
    const f = buildMap(base(), DEFAULT_MAP, ctx);
    expect(f.layout.yaxis?.scaleanchor).toBe('x');
    expect(f.layout.yaxis?.scaleratio).toBe(1);
    expect(f.layout.annotations?.some(a => a.text === '200 m')).toBe(true);
    const geo = buildMap(base({ crs: { ...base().crs, geographic: true, source: 'wgs84_lonlat' }, points: base().points.map(p => ({ ...p, x: -76 + p.x / 1e5, y: -9 + p.y / 1e5 })) }), DEFAULT_MAP, ctx);
    expect(geo.layout.yaxis?.scaleratio).toBeCloseTo(1 / Math.cos((-9 + 0.005) * Math.PI / 180), 3);
  });
  it('highlights the shared selection', () => {
    const f = buildMap(base(), DEFAULT_MAP, { ...ctx, selection: new Set([3, 99]) });
    expect((f.data.at(-1) as { selectedpoints: number[] }).selectedpoints).toEqual([3]);
  });
  it('helpers', () => {
    expect(niceLength(1120)).toBe(200);
    expect(niceLength(30000)).toBe(5000);
    expect(fmtDistance(5000)).toBe('5 km');
    expect(fmtDistance(200)).toBe('200 m');
    const e = mapExtent([0, 100], [0, 50]);
    expect(e.x0).toBeLessThan(0); expect(e.y1).toBeGreaterThan(50);
  });
});
