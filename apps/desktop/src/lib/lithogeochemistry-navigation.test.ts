/** LITOGEOQUÍMICA vertical slice: Familia -> Herramienta built the same way as DIAGRAMS (see
 * geochemistry-registry.test.ts and lib/geochemistry-registry.ts's shared `familiesForModule`), plus TAS/Harker
 * automapping through the real (fixture-captured) Tool Registry response — no mocked constraints. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./rpc', () => ({ callRpc: vi.fn() }));
import registryFixture from './fixtures/geochemistry-registry.json?raw';
import editorSource from '../components/geochemistry/Editor.tsx?raw';
import { callRpc } from './rpc';
import type { GeoColumn, GeoRegistry, GeoTool } from './geochemistry-api';
import { EMPTY_SAVED } from './geochemistry-session';
import { lithoFamilyLabel, lithogeochemistryFamilies } from './geochemistry-registry';
import { useGeochemistryStore } from '../stores/geochemistry-store';
import { useGeoRegistryStore } from '../stores/geochemistry-registry-store';

const REGISTRY = JSON.parse(registryFixture) as GeoRegistry;
const call = vi.mocked(callRpc);

const LITHO_TOOL_IDS = ['tas', 'qapf', 'afm', 'k2o-sio2', 'mali', 'fe-index', 'harker', 'ree-normalization',
  'primitive-mantle', 'fertility-eu-eu', 'fertility-ce-ce', 'shand-index', 'a-cnk', 'a-nk'];

describe('lithogeochemistryFamilies (module=lithogeochemistry, status=implemented — never legacy_group)', () => {
  const families = lithogeochemistryFamilies(REGISTRY);

  it('produces exactly 14 tools across exactly 5 families, in the requested order', () => {
    const all = families.flatMap(f => f.tools);
    expect(all).toHaveLength(14);
    expect(new Set(all.map(t => t.id)).size).toBe(14);
    expect(families.map(f => f.id)).toEqual(['classification', 'magmatic_series', 'variation', 'normalization', 'calculations']);
  });

  it('matches the exact family -> tool layout from the spec', () => {
    const byFamily = Object.fromEntries(families.map(f => [f.id, f.tools.map(t => t.id)]));
    expect(byFamily).toEqual({
      classification: ['tas', 'qapf'],
      magmatic_series: ['afm', 'k2o-sio2', 'mali', 'fe-index'],
      variation: ['harker'],
      normalization: ['ree-normalization', 'primitive-mantle', 'fertility-eu-eu', 'fertility-ce-ce'],
      calculations: ['shand-index', 'a-cnk', 'a-nk'],
    });
  });

  it('counts: Classification=2, Magmatic Series=4, Variation=1, Normalization=4, Calculations=3', () => {
    expect(families.map(f => f.tools.length)).toEqual([2, 4, 1, 4, 3]);
  });

  it('uses the Spanish presentation labels, without renaming the canonical family ids', () => {
    expect(families.map(f => f.label)).toEqual(['Clasificación', 'Series magmáticas', 'Variación', 'Normalización', 'Cálculos']);
    expect(['classification', 'magmatic_series', 'variation', 'normalization', 'calculations'].map(lithoFamilyLabel))
      .toEqual(['Clasificación', 'Series magmáticas', 'Variación', 'Normalización', 'Cálculos']);
    expect(lithoFamilyLabel('something_else')).toBe('something_else');   // unknown family: id passthrough, no crash
  });

  it('every listed tool really is module=lithogeochemistry, status=implemented in the fixture', () => {
    for (const id of LITHO_TOOL_IDS) {
      const spec = REGISTRY.tools.find(t => t.id === id)!;
      expect(spec.module).toBe('lithogeochemistry');
      expect(spec.status).toBe('implemented');
    }
  });
});

describe('Editor never hardcodes a lithogeochemistry tool id', () => {
  it('reads constraints only through InputSpec (allowed_roles/allowed_analytes), never by checking tool.id', () => {
    for (const id of LITHO_TOOL_IDS) expect(editorSource).not.toMatch(new RegExp(`['"\`]${id}['"\`]`));
    expect(editorSource).toContain('inputConstraintFor');
  });
});

describe('TAS/K2O-SiO2/MALI/Fe-index/Shand/A-CNK/A-NK/Harker automapping through the store', () => {
  const oxideColumns = (extra: GeoColumn[] = []): GeoColumn[] => [
    { name: '[Order]', numeric: true }, { name: 'SiO2_pct', numeric: true }, { name: 'Na2O_pct', numeric: true },
    { name: 'K2O_pct', numeric: true }, { name: 'CaO_pct', numeric: true }, { name: 'Al2O3_pct', numeric: true },
    { name: 'Fe2O3_pct', numeric: true }, { name: 'MgO_pct', numeric: true }, { name: 'East_AMG84_z51', numeric: true },
    { name: 'North_AMG84_z51', numeric: true }, ...extra,
  ];
  const roleFor = (column: string, semantic_role: string, analyte: string | null, unit: string | null, confidence: 'high' | 'medium' = 'high') =>
    ({ column, semantic_role, analyte, unit, confidence, source: analyte ? 'unit' : 'name' });
  // Fe2O3_pct is deliberately MEDIUM, mirroring analysis/geochemistry/semantics.py: a bare "Fe2O3" does not say
  // "total" the way "Fe2O3T"/"FeOT" do, so it must never be auto-picked for FeTotal (see the Fe-index tests below).
  const oxideRoles = (extra: ReturnType<typeof roleFor>[] = []) => [
    roleFor('[Order]', 'row_index', null, null),
    roleFor('SiO2_pct', 'major_oxide', 'SiO2', 'wt%'), roleFor('Na2O_pct', 'major_oxide', 'Na2O', 'wt%'),
    roleFor('K2O_pct', 'major_oxide', 'K2O', 'wt%'), roleFor('CaO_pct', 'major_oxide', 'CaO', 'wt%'),
    roleFor('Al2O3_pct', 'major_oxide', 'Al2O3', 'wt%'), roleFor('Fe2O3_pct', 'major_oxide', 'Fe2O3', 'wt%', 'medium'),
    roleFor('MgO_pct', 'major_oxide', 'MgO', 'wt%'),
    roleFor('East_AMG84_z51', 'easting', null, null), roleFor('North_AMG84_z51', 'northing', null, null), ...extra,
  ];
  const tool = (id: string, inputs: string[]): GeoTool =>
    ({ id, label: id, group: 'lithogeochemistry', inputs, kind: id, unit: 'pct', formula: '', reference: '', optional_inputs: false });
  const TOOLS = [
    tool('tas', ['SiO2', 'Na2O', 'K2O']), tool('k2o-sio2', ['SiO2', 'K2O']), tool('mali', ['SiO2', 'Na2O', 'K2O', 'CaO']),
    tool('fe-index', ['SiO2', 'FeTotal', 'MgO']), tool('shand-index', ['Al2O3', 'CaO', 'Na2O', 'K2O']),
    tool('a-cnk', ['Al2O3', 'CaO', 'Na2O', 'K2O']), tool('a-nk', ['Al2O3', 'Na2O', 'K2O']), tool('harker', ['SiO2', 'Oxide']),
  ];

  beforeEach(() => {
    call.mockReset();
    useGeoRegistryStore.setState({ registry: null, loading: false, error: null });
    // `saved` (localStorage-backed automapping/workspace cache) must be reset too: several tests below reuse the
    // same datasetId+toolId (fe-index) with a different dataset shape each time, and a leftover saved workspace
    // would otherwise be restored verbatim instead of recomputing the automapping from the new columns.
    useGeochemistryStore.setState({ datasetId: null, tools: [], columns: [], columnRoles: {}, selectedTool: null, config: null, result: null, loading: false, running: false, error: null, requestVersion: 0, saved: EMPTY_SAVED });
    call.mockImplementation(async (method: string) => {
      if (method === 'geochemistry.registry') return REGISTRY;
      if (method === 'geochemistry.catalog') return { tools: TOOLS, columns: oxideColumns(), dataset_id: 'ds', dataset_name: 'Data Demo geoquimica' };
      if (method === 'geochemistry.column_roles') return { dataset_id: 'ds', columns: oxideRoles() };
      throw new Error(`unexpected ${method}`);
    });
  });

  async function mapped(toolId: string) {
    await useGeochemistryStore.getState().load('ds', 'lithogeochemistry');
    useGeochemistryStore.getState().select(toolId);
    return useGeochemistryStore.getState().config!.columns;
  }

  /** Same fixture plus one extra iron column, for the FeTotal-specific cases below. */
  async function mappedWithExtraIron(toolId: string, extraColumn: string, extraRole: ReturnType<typeof roleFor>) {
    call.mockImplementation(async (method: string) => {
      if (method === 'geochemistry.registry') return REGISTRY;
      if (method === 'geochemistry.catalog') return { tools: TOOLS, columns: oxideColumns([{ name: extraColumn, numeric: true }]), dataset_id: 'ds', dataset_name: 'Data Demo geoquimica' };
      if (method === 'geochemistry.column_roles') return { dataset_id: 'ds', columns: oxideRoles([extraRole]) };
      throw new Error(`unexpected ${method}`);
    });
    await useGeochemistryStore.getState().load('ds', 'lithogeochemistry');
    useGeochemistryStore.getState().select(toolId);
    return useGeochemistryStore.getState().config!;
  }

  it('TAS receives SiO2_pct/Na2O_pct/K2O_pct automatically', async () => {
    expect(await mapped('tas')).toEqual({ SiO2: 'SiO2_pct', Na2O: 'Na2O_pct', K2O: 'K2O_pct' });
  });
  it('K2O-SiO2 receives SiO2_pct/K2O_pct automatically', async () => {
    expect(await mapped('k2o-sio2')).toEqual({ SiO2: 'SiO2_pct', K2O: 'K2O_pct' });
  });
  it('MALI receives all four oxides automatically', async () => {
    expect(await mapped('mali')).toEqual({ SiO2: 'SiO2_pct', Na2O: 'Na2O_pct', K2O: 'K2O_pct', CaO: 'CaO_pct' });
  });
  // ── Fe-index: FeTotal only auto-maps from an unambiguous "total" analyte, and syncs iron_basis to match ──────
  it('does NOT auto-map FeTotal when only the ambiguous Fe2O3 (no "T") exists — SiO2/MgO still map, iron_basis stays default', async () => {
    const columns = await mapped('fe-index');
    expect(columns).toEqual({ SiO2: 'SiO2_pct', MgO: 'MgO_pct' });   // no FeTotal key at all
    expect(useGeochemistryStore.getState().config!.iron_basis).toBe('FeOT');
  });
  it('auto-maps FeTotal to Fe2O3T and syncs iron_basis to Fe2O3T', async () => {
    const config = await mappedWithExtraIron('fe-index', 'Fe2O3T_pct', roleFor('Fe2O3T_pct', 'major_oxide', 'Fe2O3T', 'wt%'));
    expect(config.columns).toEqual({ SiO2: 'SiO2_pct', FeTotal: 'Fe2O3T_pct', MgO: 'MgO_pct' });
    expect(config.iron_basis).toBe('Fe2O3T');
  });
  it('auto-maps FeTotal to FeOT and keeps iron_basis at FeOT', async () => {
    const config = await mappedWithExtraIron('fe-index', 'FeOT_pct', roleFor('FeOT_pct', 'major_oxide', 'FeOT', 'wt%'));
    expect(config.columns).toEqual({ SiO2: 'SiO2_pct', FeTotal: 'FeOT_pct', MgO: 'MgO_pct' });
    expect(config.iron_basis).toBe('FeOT');
  });
  it('does not auto-map FeTotal from a bare FeO either, for the same reason as Fe2O3', async () => {
    const config = await mappedWithExtraIron('fe-index', 'FeO_pct', roleFor('FeO_pct', 'major_oxide', 'FeO', 'wt%', 'medium'));
    expect(config.columns).toEqual({ SiO2: 'SiO2_pct', MgO: 'MgO_pct' });
    expect(config.iron_basis).toBe('FeOT');
  });
  it('Shand/A-CNK/A-NK receive their oxides automatically', async () => {
    expect(await mapped('shand-index')).toEqual({ Al2O3: 'Al2O3_pct', CaO: 'CaO_pct', Na2O: 'Na2O_pct', K2O: 'K2O_pct' });
    expect(await mapped('a-cnk')).toEqual({ Al2O3: 'Al2O3_pct', CaO: 'CaO_pct', Na2O: 'Na2O_pct', K2O: 'K2O_pct' });
    expect(await mapped('a-nk')).toEqual({ Al2O3: 'Al2O3_pct', Na2O: 'Na2O_pct', K2O: 'K2O_pct' });
  });
  it('Harker pins SiO2 and picks a major oxide for the second axis, never East/North/Order', async () => {
    const columns = await mapped('harker');
    expect(columns.SiO2).toBe('SiO2_pct');
    expect(['Na2O_pct', 'K2O_pct', 'CaO_pct', 'Al2O3_pct', 'MgO_pct']).toContain(columns.Oxide);   // Fe2O3_pct excluded: medium confidence, never auto-picked
    expect(Object.values(columns)).not.toEqual(expect.arrayContaining(['East_AMG84_z51', 'North_AMG84_z51', '[Order]']));
  });
  it('East/North/Order never appear in any of these automapped configs', async () => {
    for (const id of ['tas', 'k2o-sio2', 'mali', 'fe-index', 'shand-index', 'a-cnk', 'a-nk', 'harker']) {
      const columns = await mapped(id);
      expect(Object.values(columns)).not.toEqual(expect.arrayContaining(['East_AMG84_z51', 'North_AMG84_z51', '[Order]']));
    }
  });
});
