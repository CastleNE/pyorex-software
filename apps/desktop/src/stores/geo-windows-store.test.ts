import { beforeEach, describe, expect, it } from 'vitest';
import { useGeoWindows } from './geo-windows-store';

const mem = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(),
} });
const s = () => useGeoWindows.getState();

beforeEach(() => {
  mem.clear();
  useGeoWindows.setState({ datasetId: null, windows: [], activeId: null, zTop: 10, selection: new Set(), isolate: false, classes: [], colorByClass: false, canvas: { w: 1200, h: 700 } });
  s().setDataset('ds1');
});

describe('Geoquímica floating windows', () => {
  it('opens one window per tool and area, and focuses it again instead of duplicating', () => {
    const a = s().openTool('litho', 'tas', 'TAS');
    const b = s().openTool('litho', 'harker', 'Harker');
    expect(s().openTool('litho', 'tas', 'TAS')).toBe(a);
    expect(s().windows).toHaveLength(2);
    expect(s().activeId).toBe(a);
    expect(s().windows.find(w => w.id === a)!.z).toBeGreaterThan(s().windows.find(w => w.id === b)!.z);
  });
  it('keeps windows of each area apart', () => {
    s().openTool('litho', 'tas', 'TAS'); s().openTool('data', 'scatter', 'XY');
    expect(s().windows.map(w => w.area).sort()).toEqual(['data', 'litho']);
  });
  it('duplicates a window with a numbered title and closes back to the next one', () => {
    const a = s().openTool('litho', 'harker', 'Harker');
    const b = s().duplicate(a)!;
    expect(s().windows.find(w => w.id === b)!.title).toBe('Harker (2)');
    s().close(b);
    expect(s().activeId).toBe(a);
  });
  it('tiles the visible windows of an area inside the canvas', () => {
    for (const t of ['a', 'b', 'c']) s().openTool('data', t, t);
    s().tile('data');
    for (const w of s().windows) { expect(w.x + w.w).toBeLessThanOrEqual(1200); expect(w.y + w.h).toBeLessThanOrEqual(700); }
    expect(new Set(s().windows.map(w => `${w.x},${w.y}`)).size).toBe(3);
  });
  it('toggles visual layers per window', () => {
    const a = s().openTool('litho', 'harker', 'Harker');
    s().toggleLayer(a, 'ellipses');
    expect(s().windows[0].layers.ellipses).toBe(true);
  });
  it('persists geometry, configuration and classes per dataset — never results', () => {
    const a = s().openTool('litho', 'tas', 'TAS');
    s().patch(a, { x: 99, result: { tool: 'tas' } as never });
    s().select([1, 2]); s().createClass('Grupo A');
    useGeoWindows.setState({ datasetId: null });
    s().setDataset('ds1');
    expect(s().windows[0]).toMatchObject({ toolId: 'tas', x: 99, result: null });
    expect(s().classes.map(c => c.name)).toEqual(['Grupo A']);
    s().setDataset('ds2');
    expect(s().windows).toEqual([]);
  });
});

describe('linked selection and classes', () => {
  it('keeps class names unique, since they key the class colours', () => {
    s().select([1]); s().createClass('A'); s().select([2]); const b = s().createClass('A')!;
    expect(b.name).toBe('A (2)');
    s().renameClass(b.id, 'Sin clase');
    expect(s().classes[1].name).toBe('Sin clase (2)');
  });
  it('replaces, adds and toggles selected rows', () => {
    s().select([1, 2]); s().select([3], 'add'); s().select([2], 'toggle');
    expect([...s().selection].sort()).toEqual([1, 3]);
  });
  it('only isolates a non-empty selection, and clearing drops isolation', () => {
    s().setIsolate(true); expect(s().isolate).toBe(false);
    s().select([4]); s().setIsolate(true); expect(s().isolate).toBe(true);
    s().clearSelection(); expect(s().isolate).toBe(false);
  });
  it('creates classes from the selection; a row belongs to one class at a time', () => {
    s().select([1, 2, 3]); const a = s().createClass('A')!;
    s().select([3, 4]); const b = s().createClass()!;
    expect(b.name).toBe('Clase 2');
    expect(s().classes.find(c => c.id === a.id)!.rows).toEqual([1, 2]);
    expect(s().colorByClass).toBe(true);
    s().select([1]); s().assignToClass(b.id);
    expect(s().classes.map(c => c.rows)).toEqual([[2], [1, 3, 4]]);
    s().selectClass(a.id); expect([...s().selection]).toEqual([2]);
    s().deleteClass(a.id); s().deleteClass(b.id);
    expect(s().colorByClass).toBe(false);
  });
});
