import { describe, expect, it } from 'vitest';
import type { ColumnProfile } from './data-api';
import { columnIssues, fmtNum, hasIssues, histogramMarker, roleChip } from './column-profile';

const col = (over: Partial<ColumnProfile> = {}): ColumnProfile => ({
  name: 'Cu_ppm', kind: 'numeric', valid: 10, below_lod: 0, not_analyzed: 0, missing: 0, distinct: 10, constant: false,
  numeric: null, top: null, ...over,
});

describe('column profile helpers', () => {
  it('formats numbers compactly', () => {
    expect(fmtNum(58.912)).toBe('58.9');
    expect(fmtNum(0.4831)).toBe('0.483');
    expect(fmtNum(1234.56)).toBe('1234.6');
    expect(fmtNum(25000)).toBe('25 000');
    expect(fmtNum(0.0004)).toBe('4.0e-4');
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(0)).toBe('0');
  });
  it('lists issues with censored values first', () => {
    const c = col({ below_lod: 5, missing: 2, constant: true });
    expect(columnIssues(c).map(i => i.id)).toEqual(['lod', 'missing', 'constant']);
    expect(columnIssues(c)[0].label).toEqual({ es: '<LD 5', en: '<DL 5' });
    expect(hasIssues(col())).toBe(false);
  });
  it('places a value on a linear or log10 histogram', () => {
    expect(histogramMarker({ scale: 'linear', start: 50, width: 2.5, counts: Array(16).fill(1) }, 70)).toBeCloseTo(0.5);
    expect(histogramMarker({ scale: 'log10', start: 1, width: 0.125, counts: Array(16).fill(1) }, 100)).toBeCloseTo(0.5);
    expect(histogramMarker({ scale: 'log10', start: 1, width: 0.125, counts: Array(16).fill(1) }, 0)).toBeNull();
    expect(histogramMarker({ scale: 'linear', start: 5, width: 0, counts: [3] }, 5)).toBeNull();
  });
  it('uses the geochemical role when known', () => {
    expect(roleChip('major_oxide', 'numeric')).toEqual({ es: 'Óxido', en: 'Oxide' });
    expect(roleChip('unknown', 'text')).toEqual({ es: 'Texto', en: 'Text' });
    expect(roleChip(undefined, 'numeric').es).toBe('Número');
  });
});

describe('grid helpers', () => {
  it('hides engine columns and labels censored cells', async () => {
    const { isInternalColumn, censoredLabel } = await import('./column-profile');
    expect(['_nulltype_Au_ppb', '__sample_type__', 'internal_feature_id', 'Au_ppb'].filter(c => !isInternalColumn(c))).toEqual(['Au_ppb']);
    expect(censoredLabel('BELOW_LOD')).toEqual({ es: '<LD', en: '<DL' });
    expect(censoredLabel('MISSING')).toBeNull();
  });
});
