import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CUSTOM_TOOL, simplifyOutline, ternaryFromCartesian, adaptTemplate, columnRef, configFor, libraryFile, parseLibraryFile, parseVertices, sanitizeDef, sanitizeSpec, type DiagramDef } from './custom-diagrams';
import { restoreWorkspace } from './geochemistry-session';
import { DEFAULT_PRESENTATION } from './chart-presentation';
import { applyState, collectState, parseState, STORAGE_KEYS } from './project-state';
import { geoApi, type GeoResult } from './geochemistry-api';
import { buildGeoChart } from './build-geo-chart';

const mem = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(),
} });
const { useGeoWindows } = await import('../stores/geo-windows-store');

const def = (over: Partial<DiagramDef['spec']> = {}, rest: Partial<DiagramDef> = {}): DiagramDef => ({
  spec: { id: 'd1', name: 'Sr/Y vs Y', kind: 'xy', x: 'Y_ppm', y: 'Sr_ppm/Y_ppm', z: null, x_label: null, y_label: null, z_label: null, fields: [], reference: '', ...over },
  area: 'explo', folder: 'Fertilidad', logX: false, logY: false, updated: '', ...rest,
});

describe('diagram definitions', () => {
  it('keeps valid specs and drops broken ones, never sending unknown keys to the engine', () => {
    expect(sanitizeSpec({ ...def().spec, extra: 1 })).toEqual(def().spec);
    expect(sanitizeSpec({ ...def().spec, x: '  ' })).toBeNull();
    expect(sanitizeSpec({ ...def().spec, kind: 'ternary', z: null })).toBeNull();
    const withFields = sanitizeSpec({ ...def().spec, fields: [{ id: 'A', name: 'A', points: [[0, 0], [1, 0], [1, 1]] }, { id: 'B', name: 'B', points: [[0, 0], [1, 1]] }, { id: 'C', name: '', points: [[0, 0], [1, 0], [1, 1]] }] });
    expect(withFields!.fields.map(f => f.id)).toEqual(['A']);
    expect(sanitizeSpec({ ...def().spec, kind: 'ternary', z: 'MgO', fields: [{ id: 'A', name: 'A', points: [[0, 0], [1, 0], [1, 1]] }] })!.fields).toEqual([]);
    expect(sanitizeDef({ ...def(), area: 'maps', logX: true })).toMatchObject({ area: 'litho', logX: true });
  });
  it('reads vertices typed one per line', () => {
    expect(parseVertices('0, 20\n20 20\n\n20;200\n')).toEqual({ points: [[0, 20], [20, 20], [20, 200]] });
    expect(parseVertices('0, 20\nveinte, 3')).toEqual({ badLine: 2 });
  });
  it('writes column references the engine understands and adapts templates to the dataset', () => {
    expect([columnRef('Cu_ppm'), columnRef('Cu ppm'), columnRef('La/Yb'), columnRef('log10')]).toEqual(['Cu_ppm', '[Cu ppm]', '[La/Yb]', '[log10]']);
    const cols = [{ name: 'Sr_ppm', numeric: true }, { name: 'Y (ppm)', numeric: true }, { name: 'Sector', numeric: false }];
    expect(adaptTemplate('{Sr}/{Y}', cols)).toBe('Sr_ppm/[Y (ppm)]');
    expect(adaptTemplate('{La}/{Yb}', cols)).toBe('La/Yb');
  });
  it('builds the engine configuration and round-trips library files', () => {
    expect(configFor(def({}, { logY: true }), { tool: 'tas', columns: { SiO2: 'SiO2' }, units: {}, iron_basis: 'FeOT', include_qaqc: true, log_x: false, log_y: false, group_column: 'Sector', label_column: null }))
      .toMatchObject({ tool: CUSTOM_TOOL.id, columns: {}, log_y: true, include_qaqc: true, group_column: 'Sector', diagram: def().spec });
    const text = JSON.stringify(libraryFile([def(), { spec: { id: 'bad' } } as unknown as DiagramDef]));
    expect(parseLibraryFile(text)).toEqual([def()]);
    expect(() => parseLibraryFile('{"format":"x"}')).toThrow('No es una biblioteca');
    expect(() => parseLibraryFile('nope')).toThrow('JSON');
  });
  it('restores saved workspaces of user diagrams only with a usable definition', () => {
    const raw = { config: { ...configFor(def()), group_column: 'Sector' }, presentation: DEFAULT_PRESENTATION };
    const cols = [{ name: 'Sector', numeric: false }];
    expect(restoreWorkspace(raw, CUSTOM_TOOL, cols)!.workspace.config.diagram).toEqual(def().spec);
    expect(restoreWorkspace({ ...raw, config: { ...raw.config, diagram: null } }, CUSTOM_TOOL, cols)).toBeNull();
  });
});

describe('fields drawn with the lasso', () => {
  it('keeps the corners of a drawn outline, drops the closing vertex and rounds', () => {
    const square = [[0, 0], [5, 0.0001], [10, 0], [10, 5], [10, 10], [5, 10], [0, 10], [0, 5], [0, 0]];
    expect(simplifyOutline(square)).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
    const circle = Array.from({ length: 400 }, (_, k) => [Math.cos(k / 400 * 2 * Math.PI) * 3 + 10, Math.sin(k / 400 * 2 * Math.PI) * 3 + 10]);
    expect(simplifyOutline(circle, { max: 30 }).length).toBeLessThanOrEqual(30);
    expect(simplifyOutline([[0.1, 1], [10, 1], [100, 50], [-1, 2]], { logX: true })).toEqual([[0.1, 1], [10, 1], [100, 50]]);
  });
  it('converts the ternary frame of the lasso (x = C − B, y = A) into A, B, C and clamps outside the triangle', () => {
    expect(ternaryFromCartesian(0, 100)).toEqual([100, 0, 0]);
    expect(ternaryFromCartesian(-100, 0)).toEqual([0, 100, 0]);
    expect(ternaryFromCartesian(100, 0)).toEqual([0, 0, 100]);
    expect(ternaryFromCartesian(150, 0)).toEqual([0, 0, 100]);
  });
});

describe('user fields on the chart', () => {
  it('labels each field at its centroid, in log10 units on a log axis', () => {
    const result = { tool: 'custom-diagram', title: 't', rows: [], quality: { total: 0, used: 0, invalid: 0, excluded_qaqc: 0 }, warnings: [], formula: '', reference: '', pipeline: {}, created_at: '',
      plot: { kind: 'scatter', x_label: 'x', y_label: 'y', z_label: '', log_x: false, log_y: true, fields: [{ id: 'Alto', name: 'Alto', points: [[1, 10], [3, 10], [3, 1000], [1, 1000]] }, { id: 'Cero', name: 'Cero', points: [[1, 0], [3, 0], [2, 0]] }] } } as GeoResult;
    const out = buildGeoChart(result, { pointSize: 7, symbol: 'circle', showLabels: false, attributes: {}, presentation: DEFAULT_PRESENTATION });
    expect(out.layout.annotations).toEqual([expect.objectContaining({ text: 'Alto', x: 2, y: 2 })]);
  });
});

describe('diagrams in .orex projects', () => {
  const store = (init: Record<string, unknown>) => {
    const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), json: (k: string) => JSON.parse(m.get(k) ?? 'null') };
  };
  it('saves the library with the project and merges it back on open (project version wins)', () => {
    const local = store({ [STORAGE_KEYS.diagrams]: { state: { diagrams: [def(), def({ id: 'd2', name: 'Local' })] }, version: 0 } });
    const st = collectState(local, [], null, null);
    expect(st.diagrams.map(d => d.spec.id)).toEqual(['d1', 'd2']);
    const other = store({ [STORAGE_KEYS.diagrams]: { state: { diagrams: [def({ name: 'Old name' }), def({ id: 'd3', name: 'Mine' })] }, version: 0 } });
    applyState(other, parseState(JSON.parse(JSON.stringify(st))));
    expect(other.json(STORAGE_KEYS.diagrams).state.diagrams.map((d: DiagramDef) => `${d.spec.id}:${d.spec.name}`)).toEqual(['d3:Mine', 'd1:Sr/Y vs Y', 'd2:Local']);
    expect(parseState({ version: 1 }).diagrams).toEqual([]);
  });
});

describe('windows of user diagrams', () => {
  const s = () => useGeoWindows.getState();
  beforeEach(() => {
    mem.clear();
    useGeoWindows.setState({ datasetId: null, windows: [], activeId: null, zTop: 10, selection: new Set(), isolate: false, classes: [], colorByClass: false, canvas: { w: 1200, h: 700 } });
    s().setDataset('ds1');
  });
  it('opens one window per diagram, refocuses it, and recomputes windows after the diagram is edited', async () => {
    const compute = vi.spyOn(geoApi, 'compute').mockResolvedValue({ tool: 'custom-diagram' } as GeoResult);
    const a = s().openDiagram('explo', def());
    const b = s().openDiagram('explo', def({ id: 'd2', name: 'La/Yb vs Yb' }));
    expect(s().openDiagram('explo', def())).toBe(a);
    expect(s().windows.map(w => [w.title, w.toolId, w.config?.diagram?.id])).toEqual([['Sr/Y vs Y', 'custom-diagram', 'd1'], ['La/Yb vs Yb', 'custom-diagram', 'd2']]);
    expect(b).not.toBe(a);
    await Promise.resolve();
    compute.mockClear();
    s().syncDiagram(def({ name: 'Sr/Y vs Y (edit)', y: 'Sr_ppm/(Y_ppm+1)' }));
    const w = s().windows.find(x => x.id === a)!;
    expect(w.title).toBe('Sr/Y vs Y (edit)');
    expect(w.config!.diagram!.y).toBe('Sr_ppm/(Y_ppm+1)');
    expect(compute).toHaveBeenCalledWith('ds1', expect.objectContaining({ diagram: expect.objectContaining({ y: 'Sr_ppm/(Y_ppm+1)' }) }));
    compute.mockRestore();
  });
});
