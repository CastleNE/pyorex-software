import { describe, expect, it } from 'vitest';
import { buildSection } from './build-section';
import { DEFAULT_MAP } from '../stores/map-store';
import { DARK_CHART_THEME } from './chart-theme';
import type { SectionResult } from './maps-api';

const sec = (over: Partial<SectionResult> = {}): SectionResult => ({
  dataset_id: 'd', line: { start: [0, 0], end: [1000, 0], length: 1000, azimuth: 90, width: 200 },
  crs: { epsg: 32718, label: null, source: 'projected_xy', x_column: 'E', y_column: 'N' },
  value_label: 'Cu_ppm', category_column: null,
  points: [
    { row_index: 0, sample_id: 'a', distance: 100, offset: -10, z: 2500, value: 10, category: null, hole: null, depth: null },
    { row_index: 1, sample_id: 'DDH1', distance: 500, offset: 5, z: 2300, value: 1000, category: null, hole: 'DDH1', depth: 150 },
    { row_index: 2, sample_id: 'b', distance: 800, offset: 20, z: null, value: 100, category: null, hole: null, depth: null },
  ],
  holes: [{ hole: 'DDH1', collar_distance: 450, collar_offset: 0, collar_z: 2450, end_distance: 600, end_z: 2190, max_depth: 300, azimuth: 90, dip: -60 }],
  topography: [[0, 2490], [500, 2460], [1000, null]], topography_source: 'dem', dem: null,
  quality: { total: 3, in_section: 3, outside: 0, no_coordinates: 0, no_elevation: 1, no_value: 0, excluded_qaqc: 0 }, warnings: [], created_at: '', ...over,
});
const ctx = { selection: new Set<number>(), dragmode: 'lasso' as const, theme: DARK_CHART_THEME, t: (x: { es: string }) => x.es, classes: null };

describe('section figure', () => {
  it('draws the value profile on top and the elevation section below with the same distance axis', () => {
    const f = buildSection(sec(), { ...DEFAULT_MAP, section: { start: [0, 0], end: [1000, 0], width: 200, exaggeration: 2, elevationColumn: null, demPath: null, drill: null, open: true } }, ctx);
    expect(f.hasElevation).toBe(true);
    const profile = f.data[0] as { x: number[]; yaxis: string };
    expect(profile.yaxis).toBe('y'); expect(profile.x).toEqual([100, 500, 800]);
    const samples = f.data.at(-1) as { x: number[]; yaxis: string; marker: { symbol: string[] } };
    expect(samples.yaxis).toBe('y2'); expect(samples.x).toEqual([100, 500]);            // the sample without elevation stays in the profile only
    expect(samples.marker.symbol).toEqual(['circle', 'square']);
    expect(f.data.some(d => (d as { name?: string }).name === 'DDH1')).toBe(true);
    expect(f.layout.yaxis2?.scaleratio).toBe(2);
    expect((f.layout.xaxis2 as { matches?: string }).matches).toBe('x');
  });
  it('uses the classes of the map when given', () => {
    const classes = { breaks: [50], percents: [50], counts: [1, 2], missing: 0, min: 10, max: 1000, log: false, boundary: 'up' as const, colors: ['#000000', '#ffffff'] };
    const f = buildSection(sec(), DEFAULT_MAP, { ...ctx, classes });
    expect((f.data[0] as { marker: { color: string[] } }).marker.color).toEqual(['#000000', '#ffffff', '#ffffff']);
  });
  it('only draws the profile when nothing has an elevation', () => {
    const f = buildSection(sec({ points: sec().points.map(p => ({ ...p, z: null })), topography: null, holes: [] }), DEFAULT_MAP, ctx);
    expect(f.hasElevation).toBe(false);
    expect(f.layout.yaxis2).toBeUndefined();
  });
});
