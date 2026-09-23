import { expect, it, describe } from 'vitest';
import type { GeoColumn, GeoColumnRole, GeoRegistryTool } from './geochemistry-api';
import { allowedRolesFor, compatibleGroupColumns, compatibleInputColumns, confidentColumn, roleMapFrom } from './semantic-roles';
import registryFixture from './fixtures/geochemistry-registry.json?raw';

const REGISTRY = JSON.parse(registryFixture) as { tools: GeoRegistryTool[] };
const tool = (id: string) => REGISTRY.tools.find(t => t.id === id)!;

const col = (name: string, numeric = true): GeoColumn => ({ name, numeric });
const role = (column: string, semantic_role: string, confidence: GeoColumnRole['confidence'] = 'high'): GeoColumnRole =>
  ({ column, semantic_role, analyte: null, unit: null, confidence, source: 'name' });

const DATASET_COLUMNS = [
  col('[Order]'), col('Sample_ID', false), col('DHID', false), col('Depth'), col('From_m'), col('To_m'),
  col('East_AMG84_z51'), col('North_AMG84_z51'), col('Long_WGS84'), col('Lat_WGS84'),
  col('SiO2_pct'), col('Cu_ppm'), col('Lithology', false),
];
const DATASET_ROLES = roleMapFrom([
  role('[Order]', 'row_index'), role('Sample_ID', 'sample_id'), role('DHID', 'hole_id'),
  role('Depth', 'depth'), role('From_m', 'depth_from'), role('To_m', 'depth_to'),
  role('East_AMG84_z51', 'easting'), role('North_AMG84_z51', 'northing'),
  role('Long_WGS84', 'longitude'), role('Lat_WGS84', 'latitude'),
  role('SiO2_pct', 'major_oxide'), role('Cu_ppm', 'trace_element'), role('Lithology', 'categorical', 'medium'),
]);

describe('allowedRolesFor', () => {
  it('reads the declared roles for a known tool/key', () => {
    expect(allowedRolesFor(tool('ternary'), 'A')).toEqual(expect.arrayContaining(['major_oxide', 'trace_element', 'ree', 'assay', 'ratio']));
  });
  it('is undefined for an unknown tool or an unrestricted key (backward compat)', () => {
    expect(allowedRolesFor(undefined, 'X')).toBeUndefined();
    expect(allowedRolesFor(tool('boxplot'), 'X')).toEqual([]);
  });
});

describe('compatibleInputColumns', () => {
  it('falls back to "any numeric column" when no roles are declared — CURRENT BEHAVIOR unchanged', () => {
    const result = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, undefined);
    expect(result.map(c => c.name)).toEqual(['[Order]', 'Depth', 'From_m', 'To_m', 'East_AMG84_z51', 'North_AMG84_z51', 'Long_WGS84', 'Lat_WGS84', 'SiO2_pct', 'Cu_ppm']);
  });
  it('scatter/histogram stay permissive: numeric variables incl. depth and coordinates, no identifiers or row_index', () => {
    const result = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, allowedRolesFor(tool('scatter'), 'X'));
    const names = result.map(c => c.name);
    expect(names).toEqual(expect.arrayContaining(['Depth', 'East_AMG84_z51', 'North_AMG84_z51', 'Long_WGS84', 'Lat_WGS84', 'SiO2_pct', 'Cu_ppm']));
    expect(names).not.toEqual(expect.arrayContaining(['Sample_ID', 'DHID', 'Lithology', '[Order]']));
  });
  it('ternary excludes east/north/lat/lon/depth/row_index, sample id and hole id', () => {
    const result = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, allowedRolesFor(tool('ternary'), 'A'));
    const names = result.map(c => c.name);
    expect(names).toEqual(['SiO2_pct', 'Cu_ppm']);
    for (const excluded of ['East_AMG84_z51', 'North_AMG84_z51', 'Long_WGS84', 'Lat_WGS84', 'Depth', '[Order]', 'Sample_ID', 'DHID'])
      expect(names).not.toContain(excluded);
  });
  it('downhole depth selector accepts only Depth/From/To', () => {
    const result = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, allowedRolesFor(tool('downhole'), 'Depth'));
    expect(result.map(c => c.name)).toEqual(['Depth', 'From_m', 'To_m']);
  });
  it('downhole value selector accepts geological numeric variables, never row_index', () => {
    const result = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, allowedRolesFor(tool('downhole'), 'Value'));
    expect(result.map(c => c.name)).toEqual(['SiO2_pct', 'Cu_ppm']);
  });
  it('never offers a non-numeric column even if some future role restriction included it', () => {
    const result = compatibleInputColumns(DATASET_COLUMNS, DATASET_ROLES, ['hole_id', 'major_oxide']);
    expect(result.map(c => c.name)).toEqual(['SiO2_pct']);   // DHID has role hole_id but numeric:false
  });
});

describe('compatibleGroupColumns', () => {
  it('shows every column when no restriction is declared — CURRENT BEHAVIOR unchanged (not numeric-only)', () => {
    const result = compatibleGroupColumns(DATASET_COLUMNS, DATASET_ROLES, undefined);
    expect(result).toHaveLength(DATASET_COLUMNS.length);
    expect(result.map(c => c.name)).toContain('Lithology');
  });
  it('downhole group prioritizes hole_id: only DHID is offered, even though it is not numeric', () => {
    const result = compatibleGroupColumns(DATASET_COLUMNS, DATASET_ROLES, allowedRolesFor(tool('downhole'), 'Depth') && tool('downhole').group_allowed_roles);
    expect(result.map(c => c.name)).toEqual(['DHID']);
  });
});

describe('confidentColumn: automapping never picks an absurd low-confidence column', () => {
  it('does not auto-fill from a role-restricted input when only a low-confidence candidate exists', () => {
    const onlyOrder = [col('[Order]')];
    const roles = roleMapFrom([role('[Order]', 'numeric_generic', 'low')]);
    expect(confidentColumn(onlyOrder, roles, ['numeric_generic'])).toBeUndefined();
  });
  it('auto-fills once a high-confidence compatible column exists', () => {
    expect(confidentColumn(DATASET_COLUMNS, DATASET_ROLES, allowedRolesFor(tool('ternary'), 'A'))?.name).toBe('SiO2_pct');
  });
  it('a medium-confidence match (e.g. enriched only by the coarse existing catalog role, not a direct name/unit match) is never auto-picked either — regression: a real dataset column named "[Order]" that the importer merely calls "calculated_numeric" got enriched to medium and was still being auto-selected for scatter/histogram X', () => {
    const roles = roleMapFrom([role('[Order]', 'numeric_generic', 'medium')]);
    expect(confidentColumn([col('[Order]')], roles, ['numeric_generic'])).toBeUndefined();
  });
  it('keeps the old "first numeric column" behavior when no roles are declared', () => {
    expect(confidentColumn(DATASET_COLUMNS, DATASET_ROLES, undefined)?.name).toBe('[Order]');
  });
});
