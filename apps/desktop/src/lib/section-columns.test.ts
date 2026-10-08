import { describe, expect, it } from 'vitest';
import { defaultWidth, guessDrill, guessElevation } from './section-columns';

const cols = (...names: [string, boolean][]) => names.map(([name, numeric]) => ({ name, numeric }));
const role = (column: string, semantic_role: string) => ({ [column]: { column, semantic_role, analyte: null, unit: null, confidence: 'high' as const, source: 'name' } });

describe('section columns', () => {
  it('finds drill-hole fields by role or usual names', () => {
    const c = cols(['HOLE_ID', false], ['ESTE', true], ['COTA', true], ['DESDE', true], ['HASTA', true], ['AZIMUT', true], ['INCLINACION', true], ['Cu_ppm', true]);
    expect(guessDrill(c, {})).toEqual({ hole_column: 'HOLE_ID', from_column: 'DESDE', to_column: 'HASTA', depth_column: null, azimuth_column: 'AZIMUT', dip_column: 'INCLINACION', azimuth: 0, dip: -90 });
    expect(guessElevation(c, {})).toBe('COTA');
    expect(guessDrill(cols(['BHID', false], ['DEPTH', true]), {})).toMatchObject({ hole_column: 'BHID', depth_column: 'DEPTH', from_column: null });
    expect(guessDrill(cols(['Sample', false], ['Cu', true]), {})).toBeNull();
    expect(guessElevation(cols(['Altura_msnm', true]), role('Altura_msnm', 'elevation'))).toBe('Altura_msnm');
  });
  it('proposes a round band width', () => {
    expect(defaultWidth(7000)).toBe(500);
    expect(defaultWidth(100)).toBe(10);
    expect(defaultWidth(25000)).toBe(2000);
  });
});
