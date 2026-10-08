import { describe, expect, it } from 'vitest';
import { applyState, collectState, fingerprint, parseState, remapState, STORAGE_KEYS } from './project-state';

const mem = (init: Record<string, unknown> = {}) => {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), json: (k: string) => JSON.parse(m.get(k) ?? 'null') };
};
const seed = () => mem({
  [STORAGE_KEYS.shell]: { area: 'litho' },
  [STORAGE_KEYS.windows]: { A: { windows: [{ id: 'w1', toolId: 'tas' }], classes: [] }, B: { windows: [], classes: [] } },
  [STORAGE_KEYS.workspaces]: { workspaces: { 'A::tas': { config: { tool: 'tas' } }, 'B::scatter': { config: {} } }, attributes: { A: { k: { color: '#f00' } }, B: {} } },
});

describe('project state (.orex state.json)', () => {
  it('collects only the project datasets', () => {
    const st = collectState(seed(), ['A'], 'A', 'EPSG:32718');
    expect(Object.keys(st.windows)).toEqual(['A']);
    expect(Object.keys(st.geochemistry.workspaces)).toEqual(['A::tas']);
    expect(Object.keys(st.geochemistry.attributes)).toEqual(['A']);
    expect(st).toMatchObject({ activeDatasetId: 'A', crs: 'EPSG:32718', shell: { area: 'litho' } });
  });
  it('falls back to the first project dataset when the active one is not in the project', () => {
    expect(collectState(seed(), ['B'], 'A', null).activeDatasetId).toBe('B');
  });
  it('remaps every dataset key with the id_map from project.open', () => {
    const st = remapState(collectState(seed(), ['A'], 'A', null), { A: 'A2' });
    expect(st.activeDatasetId).toBe('A2');
    expect(Object.keys(st.windows)).toEqual(['A2']);
    expect(Object.keys(st.geochemistry.workspaces)).toEqual(['A2::tas']);
    expect(Object.keys(st.geochemistry.attributes)).toEqual(['A2']);
  });
  it('applies a state without dropping other datasets', () => {
    const target = mem({ [STORAGE_KEYS.windows]: { Z: { windows: [] } }, [STORAGE_KEYS.workspaces]: { workspaces: { 'Z::x': {} }, attributes: { Z: {} } } });
    applyState(target, remapState(collectState(seed(), ['A'], 'A', null), { A: 'A2' }));
    expect(Object.keys(target.json(STORAGE_KEYS.windows)).sort()).toEqual(['A2', 'Z']);
    expect(Object.keys(target.json(STORAGE_KEYS.workspaces).workspaces).sort()).toEqual(['A2::tas', 'Z::x']);
    expect(target.json(STORAGE_KEYS.shell)).toEqual({ area: 'litho' });
  });
  it('parses defensively and refuses newer versions', () => {
    expect(parseState({}).windows).toEqual({});
    expect(() => parseState({ version: 99 })).toThrow(/más reciente/);
    expect(() => parseState(null)).toThrow();
  });
  it('fingerprints ignore dataset order', () => {
    const st = collectState(seed(), ['A', 'B'], 'A', null);
    expect(fingerprint(st, ['A', 'B'])).toBe(fingerprint(st, ['B', 'A']));
  });
});
