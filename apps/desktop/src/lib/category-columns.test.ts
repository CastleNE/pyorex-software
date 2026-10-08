import { describe, expect, it } from 'vitest';
import { categoryOptions } from './category-columns';
import type { ColumnRoleMap } from './semantic-roles';

const col = (name: string, numeric = false) => ({ name, numeric });
const roles = (r: Record<string, string>): ColumnRoleMap => Object.fromEntries(Object.entries(r).map(([column, semantic_role]) => [column, { column, semantic_role, analyte: null, unit: null, confidence: 'high', source: 'test' }])) as ColumnRoleMap;

describe('category columns («Clasificar por»)', () => {
  const columns = [col('Sample_ID'), col('LITOL'), col('ALTERACION'), col('CAMPAÑA'), col('AÑO', true), col('Este', true), col('Cu_ppm', true), col('Prof', true), col('Fase', true), col('Var7', true)];
  const r = roles({ Sample_ID: 'sample_id', LITOL: 'categorical', ALTERACION: 'categorical', CAMPAÑA: 'categorical', 'AÑO': 'numeric_generic', Este: 'easting', Cu_ppm: 'assay', Prof: 'depth', Fase: 'numeric_generic', Var7: 'numeric_generic' });
  it('offers text categories and label-like numbers (year, campaign, phase), never ids, coordinates, depths or analytes', () => {
    const o = categoryOptions(columns, r);
    expect(o.text.map(c => c.name)).toEqual(['LITOL', 'ALTERACION', 'CAMPAÑA']);
    expect(o.numeric.map(c => c.name)).toEqual(['AÑO', 'Fase', 'Var7']);
    expect(o.restricted).toBe(false);
  });
  it('keeps the restriction of tools that need a specific group (hole id for down-hole profiles)', () => {
    const o = categoryOptions([...columns, col('Hole')], roles({ Hole: 'hole_id', LITOL: 'categorical' }), ['hole_id']);
    expect(o).toMatchObject({ restricted: true, text: [{ name: 'Hole' }], numeric: [] });
  });
});
