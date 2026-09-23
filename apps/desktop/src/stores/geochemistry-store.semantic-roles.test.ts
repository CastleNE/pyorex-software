/** End-to-end: geochemistry.column_roles + geochemistry.registry reach automapping through the store, so a new
 * scatter/histogram/ternary/downhole config is never pre-filled with an absurd column (Semantic Variable System v1). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/rpc', () => ({ callRpc: vi.fn() }));
import registryFixture from '../lib/fixtures/geochemistry-registry.json?raw';
import { callRpc } from '../lib/rpc';
import type { GeoColumn, GeoTool } from '../lib/geochemistry-api';
import { useGeochemistryStore } from './geochemistry-store';
import { useGeoRegistryStore } from './geochemistry-registry-store';

const call = vi.mocked(callRpc);
const REGISTRY = JSON.parse(registryFixture);

const COLUMNS: GeoColumn[] = [
  { name: '[Order]', numeric: true }, { name: 'Sample_ID', numeric: false }, { name: 'DHID', numeric: false },
  { name: 'East_AMG84_z51', numeric: true }, { name: 'North_AMG84_z51', numeric: true },
  { name: 'SiO2_pct', numeric: true }, { name: 'Cu_ppm', numeric: true },
];
const ROLES = [
  { column: '[Order]', semantic_role: 'row_index', analyte: null, unit: null, confidence: 'high', source: 'name' },
  { column: 'Sample_ID', semantic_role: 'sample_id', analyte: null, unit: null, confidence: 'high', source: 'name' },
  { column: 'DHID', semantic_role: 'hole_id', analyte: null, unit: null, confidence: 'high', source: 'name' },
  { column: 'East_AMG84_z51', semantic_role: 'easting', analyte: null, unit: null, confidence: 'high', source: 'name' },
  { column: 'North_AMG84_z51', semantic_role: 'northing', analyte: null, unit: null, confidence: 'high', source: 'name' },
  { column: 'SiO2_pct', semantic_role: 'major_oxide', analyte: 'SiO2', unit: 'wt%', confidence: 'high', source: 'unit' },
  { column: 'Cu_ppm', semantic_role: 'trace_element', analyte: 'Cu', unit: 'ppm', confidence: 'high', source: 'unit' },
];
const tool = (id: string, inputs: string[]): GeoTool =>
  ({ id, label: id, group: 'diagrams', inputs, kind: id, unit: 'raw', formula: '', reference: '', optional_inputs: false });
const TOOLS = [tool('scatter', ['X', 'Y']), tool('histogram', ['X']), tool('ternary', ['A', 'B', 'C']), tool('downhole', ['Depth', 'Value'])];

beforeEach(() => {
  call.mockReset();
  useGeoRegistryStore.setState({ registry: null, loading: false, error: null });
  useGeochemistryStore.setState({ datasetId: null, tools: [], columns: [], columnRoles: {}, selectedTool: null, config: null, result: null, loading: false, running: false, error: null, requestVersion: 0 });
  call.mockImplementation(async (method: string) => {
    if (method === 'geochemistry.registry') return REGISTRY;
    if (method === 'geochemistry.catalog') return { tools: TOOLS, columns: COLUMNS, dataset_id: 'ds', dataset_name: 'Demo' };
    if (method === 'geochemistry.column_roles') return { dataset_id: 'ds', columns: ROLES };
    throw new Error(`unexpected ${method}`);
  });
});

describe('automapping never fills a role-restricted input with an absurd column', () => {
  it('scatter remains permissive but never auto-fills [Order] (row_index) or an identifier', async () => {
    await useGeochemistryStore.getState().load('ds', 'diagrams');
    useGeochemistryStore.getState().select('scatter');
    const { columns } = useGeochemistryStore.getState().config!;
    for (const value of Object.values(columns)) expect(['Sample_ID', 'DHID', '[Order]']).not.toContain(value);
  });

  it('histogram never auto-fills X with an identifier or row_index', async () => {
    await useGeochemistryStore.getState().load('ds', 'diagrams');
    useGeochemistryStore.getState().select('histogram');
    const { columns } = useGeochemistryStore.getState().config!;
    for (const value of Object.values(columns)) expect(['Sample_ID', 'DHID', '[Order]']).not.toContain(value);
  });

  it('ternary auto-fills A/B/C only from compositional columns, never [Order]/East/North', async () => {
    await useGeochemistryStore.getState().load('ds', 'diagrams');
    useGeochemistryStore.getState().select('ternary');
    const { columns } = useGeochemistryStore.getState().config!;
    for (const value of Object.values(columns)) expect(['[Order]', 'East_AMG84_z51', 'North_AMG84_z51']).not.toContain(value);
    expect(Object.values(columns)).toEqual(expect.arrayContaining(['SiO2_pct', 'Cu_ppm']));
  });

  it('leaves an input unmapped rather than guessing when no compatible column exists', async () => {
    call.mockImplementation(async (method: string) => {
      if (method === 'geochemistry.registry') return REGISTRY;
      if (method === 'geochemistry.catalog') return { tools: TOOLS, columns: [{ name: '[Order]', numeric: true }], dataset_id: 'ds', dataset_name: 'Demo' };
      if (method === 'geochemistry.column_roles') return { dataset_id: 'ds', columns: [ROLES[0]] };   // only the row_index Order column, not a role ternary accepts
      throw new Error(`unexpected ${method}`);
    });
    await useGeochemistryStore.getState().load('ds', 'diagrams');
    useGeochemistryStore.getState().select('ternary');
    expect(useGeochemistryStore.getState().config?.columns).toEqual({});
  });
});
