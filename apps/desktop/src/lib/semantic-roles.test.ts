import { expect, it, describe } from 'vitest';
import type { GeoColumn, GeoColumnRole, GeoRegistryTool } from './geochemistry-api';
import { compatibleGroupColumns, compatibleInputColumns, confidentColumn, inputConstraintFor, roleMapFrom } from './semantic-roles';
import registryFixture from './fixtures/geochemistry-registry.json?raw';

const REGISTRY = JSON.parse(registryFixture) as { tools: GeoRegistryTool[] };
const tool = (id: string) => REGISTRY.tools.find(t => t.id === id)!;

const col = (name: string, numeric = true): GeoColumn => ({ name, numeric });
const role = (column: string, semantic_role: string, opts: Partial<GeoColumnRole> = {}): GeoColumnRole =>
  ({ column, semantic_role, analyte: null, unit: null, confidence: 'high', source: 'name', ...opts });

const DATASET_COLUMNS = [
  col('[Order]'), col('Sample_ID', false), col('DHID', false), col('Depth'), col('From_m'), col('To_m'),
  col('East_AMG84_z51'), col('North_AMG84_z51'), col('Long_WGS84'), col('Lat_WGS84'),
  col('SiO2_pct'), col('Na2O_pct'), col('K2O_pct'), col('CaO_pct'), col('Cu_ppm'), col('Lithology', false),
];
const DATASET_ROLES = roleMapFrom([
  role('[Order]', 'row_index'), role('Sample_ID', 'sample_id'), role('DHID', 'hole_id'),
  role('Depth', 'depth'), role('From_m', 'depth_from'), role('To_m', 'depth_to'),
  role('East_AMG84_z51', 'easting'), role('North_AMG84_z51', 'northing'),
  role('Long_WGS84', 'longitude'), role('Lat_WGS84', 'latitude'),
  role('SiO2_pct', 'major_oxide', { analyte: 'SiO2', unit: 'wt%', source: 'unit' }),
  role('Na2O_pct', 'major_oxide', { analyte: 'Na2O', unit: 'wt%', source: 'unit' }),
  role('K2O_pct', 'major_oxide', { analyte: 'K2O', unit: 'wt%', source: 'unit' }),
  role('CaO_pct', 'major_oxide', { analyte: 'CaO', unit: 'wt%', source: 'unit' }),
  role('Cu_ppm', 'trace_element', { analyte: 'Cu', unit: 'ppm', source: 'unit' }),
  role('Lithology', 'categorical', { confidence: 'medium' }),
]);

describe('inputConstraintFor', () => {
  it('reads the declared roles and analytes for a known tool/key', () => {
    expect(inputConstraintFor(tool('ternary'), 'A')).toEqual({
      allowed_roles: expect.arrayContaining(['major_oxide', 'trace_element', 'ree', 'assay', 'ratio']),
      allowed_analytes: [],
    });
    expect(inputConstraintFor(tool('tas'), 'SiO2')).toEqual({ allowed_roles: ['major_oxide'], allowed_analytes: ['SiO2'] });
  });
  it('is undefined for an unknown tool, defined-but-empty for an unrestricted key (backward compat)', () => {
    expect(inputConstraintFor(undefined, 'X')).toBeUndefined();
    expect(inputConstraintFor(tool('boxplot'), 'X')).toEqual({ allowed_roles: [], allowed_analytes: [] });
  });
});

describe('compatibleInputColumns', () => {
  it('falls back to "any numeric column" when no constraint is declared — CURRENT BEHAVIOR unchanged', () => {
    const result = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, undefined);
    expect(result.map(c => c.name)).toEqual(['[Order]', 'Depth', 'From_m', 'To_m', 'East_AMG84_z51', 'North_AMG84_z51',
      'Long_WGS84', 'Lat_WGS84', 'SiO2_pct', 'Na2O_pct', 'K2O_pct', 'CaO_pct', 'Cu_ppm']);
  });
  it('scatter/histogram stay permissive: numeric variables incl. depth and coordinates, no identifiers or row_index', () => {
    const result = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, inputConstraintFor(tool('scatter'), 'X'));
    const names = result.map(c => c.name);
    expect(names).toEqual(expect.arrayContaining(['Depth', 'East_AMG84_z51', 'North_AMG84_z51', 'Long_WGS84', 'Lat_WGS84', 'SiO2_pct', 'Cu_ppm']));
    expect(names).not.toEqual(expect.arrayContaining(['Sample_ID', 'DHID', 'Lithology', '[Order]']));
  });
  it('ternary excludes east/north/lat/lon/depth/row_index, sample id and hole id', () => {
    const result = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, inputConstraintFor(tool('ternary'), 'A'));
    const names = result.map(c => c.name);
    expect(names).toEqual(['SiO2_pct', 'Na2O_pct', 'K2O_pct', 'CaO_pct', 'Cu_ppm']);
    for (const excluded of ['East_AMG84_z51', 'North_AMG84_z51', 'Long_WGS84', 'Lat_WGS84', 'Depth', '[Order]', 'Sample_ID', 'DHID'])
      expect(names).not.toContain(excluded);
  });
  it('downhole depth selector accepts only Depth/From/To', () => {
    const result = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, inputConstraintFor(tool('downhole'), 'Depth'));
    expect(result.map(c => c.name)).toEqual(['Depth', 'From_m', 'To_m']);
  });
  it('downhole value selector accepts geological numeric variables, never row_index', () => {
    const result = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, inputConstraintFor(tool('downhole'), 'Value'));
    expect(result.map(c => c.name)).toEqual(['SiO2_pct', 'Na2O_pct', 'K2O_pct', 'CaO_pct', 'Cu_ppm']);
  });
  it('never offers a non-numeric column even if some future constraint included its role', () => {
    const result = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, { allowed_roles: ['hole_id', 'major_oxide'], allowed_analytes: [] });
    expect(result.map(c => c.name)).toEqual(['SiO2_pct', 'Na2O_pct', 'K2O_pct', 'CaO_pct']);   // DHID has role hole_id but numeric:false
  });

  // ── TAS: role AND exact analyte, per input (section 5/12) ─────────────────────────────────────
  it('TAS SiO2/Na2O/K2O each accept only their own exact oxide, not the other two or East/North/Order', () => {
    const siO2 = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, inputConstraintFor(tool('tas'), 'SiO2'));
    const na2O = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, inputConstraintFor(tool('tas'), 'Na2O'));
    const k2O = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, inputConstraintFor(tool('tas'), 'K2O'));
    expect(siO2.map(c => c.name)).toEqual(['SiO2_pct']);
    expect(na2O.map(c => c.name)).toEqual(['Na2O_pct']);
    expect(k2O.map(c => c.name)).toEqual(['K2O_pct']);
  });
  it('a column with the right role but the wrong analyte is rejected (role alone is not enough once allowed_analytes is set)', () => {
    const result = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, { allowed_roles: ['major_oxide'], allowed_analytes: ['SiO2'] });
    expect(result.map(c => c.name)).toEqual(['SiO2_pct']);
    expect(result.map(c => c.name)).not.toContain('Na2O_pct');
  });
  it('a column with no classified analyte at all never matches an allowed_analytes constraint', () => {
    const noAnalyte = roleMapFrom([role('Generic_numeric_SiO2_like', 'major_oxide', { analyte: null, confidence: 'low' })]);
    const result = compatibleInputColumns([col('Generic_numeric_SiO2_like')], noAnalyte, { allowed_roles: ['major_oxide'], allowed_analytes: ['SiO2'] });
    expect(result).toEqual([]);
  });
  it('Harker Oxide has no analyte restriction: any major oxide is offered, but SiO2 stays pinned', () => {
    const oxide = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, inputConstraintFor(tool('harker'), 'Oxide'));
    expect(oxide.map(c => c.name)).toEqual(['SiO2_pct', 'Na2O_pct', 'K2O_pct', 'CaO_pct']);
    const siO2 = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, inputConstraintFor(tool('harker'), 'SiO2'));
    expect(siO2.map(c => c.name)).toEqual(['SiO2_pct']);
  });
});

describe('compatibleGroupColumns', () => {
  it('shows every column when no restriction is declared — CURRENT BEHAVIOR unchanged (not numeric-only)', () => {
    const result = compatibleGroupColumns(DATASET_COLUMNS, DATASET_ROLES, undefined);
    expect(result).toHaveLength(DATASET_COLUMNS.length);
    expect(result.map(c => c.name)).toContain('Lithology');
  });
  it('downhole group prioritizes hole_id: only DHID is offered, even though it is not numeric', () => {
    const result = compatibleGroupColumns(DATASET_COLUMNS, DATASET_ROLES, tool('downhole').group_allowed_roles);
    expect(result.map(c => c.name)).toEqual(['DHID']);
  });
});

describe('confidentColumn: automapping never picks an absurd low-confidence column', () => {
  it('does not auto-fill from a role-restricted input when only a low-confidence candidate exists', () => {
    const onlyOrder = [col('[Order]')];
    const roles = roleMapFrom([role('[Order]', 'numeric_generic', { confidence: 'low' })]);
    expect(confidentColumn(onlyOrder, roles, { allowed_roles: ['numeric_generic'], allowed_analytes: [] })).toBeUndefined();
  });
  it('auto-fills once a high-confidence compatible column exists', () => {
    expect(confidentColumn(DATASET_COLUMNS, DATASET_ROLES, inputConstraintFor(tool('ternary'), 'A'))?.name).toBe('SiO2_pct');
  });
  it('a medium-confidence match (e.g. enriched only by the coarse existing catalog role, not a direct name/unit match) is never auto-picked either — regression: a real dataset column named "[Order]" that the importer merely calls "calculated_numeric" got enriched to medium and was still being auto-selected for scatter/histogram X', () => {
    const roles = roleMapFrom([role('[Order]', 'numeric_generic', { confidence: 'medium' })]);
    expect(confidentColumn([col('[Order]')], roles, { allowed_roles: ['numeric_generic'], allowed_analytes: [] })).toBeUndefined();
  });
  it('keeps the old "first numeric column" behavior when no constraint is declared', () => {
    expect(confidentColumn(DATASET_COLUMNS, DATASET_ROLES, undefined)?.name).toBe('[Order]');
  });

  // ── TAS: the first real per-key analyte automapping case (section 5/13) ────────────────────────
  it('TAS auto-fills SiO2/Na2O/K2O from their exact, high-confidence analyte matches', () => {
    expect(confidentColumn(DATASET_COLUMNS, DATASET_ROLES, inputConstraintFor(tool('tas'), 'SiO2'))?.name).toBe('SiO2_pct');
    expect(confidentColumn(DATASET_COLUMNS, DATASET_ROLES, inputConstraintFor(tool('tas'), 'Na2O'))?.name).toBe('Na2O_pct');
    expect(confidentColumn(DATASET_COLUMNS, DATASET_ROLES, inputConstraintFor(tool('tas'), 'K2O'))?.name).toBe('K2O_pct');
  });
  it('a column that merely looks like SiO2 by name, with no confident semantic metadata, never auto-maps', () => {
    const weak = roleMapFrom([role('Generic_numeric_SiO2_like', 'numeric_generic', { analyte: null, confidence: 'low' })]);
    const result = confidentColumn([col('Generic_numeric_SiO2_like')], weak, inputConstraintFor(tool('tas'), 'SiO2'));
    expect(result).toBeUndefined();
  });
});
