/**
 * Geoquímica floating windows (phase 2). Each window is one registry tool with its own configuration, presentation,
 * visual layers and last result; windows live on the canvas of one area and are persisted per dataset (geometry and
 * configuration only — results are recomputed by the engine, never stored).
 *
 * The attribute Editor keeps editing `useGeochemistryStore`: the ACTIVE window is mirrored into it (`bindEditor`) and
 * every change made there is written back to that window. Selection (row_index) and user classes are shared by all
 * windows of the dataset — that is what links them.
 */
import { create } from 'zustand';
import { geoApi, type GeoConfig, type GeoResult } from '../lib/geochemistry-api';
import { DEFAULT_PRESENTATION, type ChartPresentation } from '../lib/chart-presentation';
import { AUTO_SYMBOL } from '../lib/geochemistry-attributes';
import { DEFAULT_LAYERS, type ChartLayers, type LayerKey, type SampleClass } from '../lib/chart-layers';
import type { AreaId } from '../lib/geochem-areas';
import { useGeochemistryStore } from './geochemistry-store';
import { CUSTOM_TOOL_ID, configFor, type DiagramDef } from '../lib/custom-diagrams';

export type DragMode = 'lasso' | 'select' | 'zoom' | 'pan';
export interface GeoWindow {
  id: string; area: AreaId; toolId: string; title: string;
  /** null until the window is first bound to the Editor (it then takes the tool's restored or default configuration). */
  config: GeoConfig | null; presentation: ChartPresentation; pointSize: number; symbol: string; showLabels: boolean;
  layers: ChartLayers;
  result: GeoResult | null; running: boolean; error: string | null;
  x: number; y: number; w: number; h: number; z: number; minimized: boolean;
}
type Persisted = Pick<GeoWindow, 'id' | 'area' | 'toolId' | 'title' | 'config' | 'presentation' | 'pointSize' | 'symbol' | 'showLabels' | 'layers' | 'x' | 'y' | 'w' | 'h' | 'z' | 'minimized'>;
interface DatasetSnapshot { windows: Persisted[]; classes: SampleClass[]; colorByClass: boolean }

export const CLASS_COLORS = ['#d55e00', '#0072b2', '#009e73', '#cc79a7', '#e69f00', '#56b4e9', '#f0e442', '#8c510a'];
const KEY = 'pyorex.geo.windows.v1';
const readAll = (): Record<string, DatasetSnapshot> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; } };
const writeAll = (all: Record<string, DatasetSnapshot>) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage unavailable */ } };
let seq = 0;
const uid = () => `w${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

interface WindowsState {
  datasetId: string | null;
  windows: GeoWindow[]; activeId: string | null; zTop: number;
  selection: ReadonlySet<number>; isolate: boolean; dragmode: DragMode;
  classes: SampleClass[]; colorByClass: boolean;
  canvas: { w: number; h: number };

  setDataset: (id: string | null) => void;
  setCanvas: (w: number, h: number) => void;
  openTool: (area: AreaId, toolId: string, title: string) => string;
  activate: (id: string) => void;
  patch: (id: string, patch: Partial<GeoWindow>) => void;
  close: (id: string) => void;
  closeArea: (area: AreaId) => void;
  duplicate: (id: string) => string | null;
  toggleMinimize: (id: string) => void;
  tile: (area: AreaId) => void;
  cascade: (area: AreaId) => void;
  toggleLayer: (id: string, key: LayerKey | 'legend') => void;
  runWindow: (id: string) => Promise<void>;
  /** Opens (or focuses) the window of a library diagram in an area and computes it. */
  openDiagram: (area: AreaId, def: DiagramDef) => string;
  /** After a diagram is edited in the library: every window drawing it takes the new definition and recomputes. */
  syncDiagram: (def: DiagramDef) => void;

  select: (rows: number[], mode?: 'replace' | 'add' | 'toggle') => void;
  clearSelection: () => void;
  setIsolate: (on: boolean) => void;
  setDragmode: (m: DragMode) => void;
  createClass: (name?: string) => SampleClass | null;
  assignToClass: (classId: string) => void;
  renameClass: (classId: string, name: string) => void;
  deleteClass: (classId: string) => void;
  selectClass: (classId: string) => void;
  setColorByClass: (on: boolean) => void;
}

const runVersion = new Map<string, number>();
let binding = false;
/** Window currently mirrored in the Editor; write-back only ever targets this window. */
let boundId: string | null = null;
export const editorBoundTo = () => boundId;
/** Class names are unique (they key the class colours) and never collide with the “no class” label. */
const uniqueName = (name: string, taken: string[]) => { let n = name, k = 2; while (taken.includes(n) || n === 'Sin clase' || n === 'Unclassified') n = `${name} (${k++})`; return n; };

export const useGeoWindows = create<WindowsState>((set, get) => {
  const patch = (id: string, p: Partial<GeoWindow>) => set(s => ({ windows: s.windows.map(w => (w.id === id ? { ...w, ...p } : w)) }));
  const inArea = (area: AreaId) => get().windows.filter(w => w.area === area);
  const placement = (area: AreaId) => {
    const { canvas } = get(), n = inArea(area).filter(w => !w.minimized).length;
    const w = Math.max(360, Math.min(820, canvas.w - 32 - n * 28)), h = Math.max(260, Math.min(560, canvas.h - 32 - n * 28));
    return { x: 16 + n * 28, y: 16 + n * 28, w, h };
  };
  return {
    datasetId: null, windows: [], activeId: null, zTop: 10,
    selection: new Set(), isolate: false, dragmode: 'lasso', classes: [], colorByClass: false,
    canvas: { w: 1000, h: 640 },

    setDataset: id => {
      if (id === get().datasetId) return;
      const snap = id ? readAll()[id] : undefined;
      const windows: GeoWindow[] = (snap?.windows ?? []).map(p => ({ ...p, layers: { ...DEFAULT_LAYERS, ...p.layers }, result: null, running: false, error: null }));
      const zTop = windows.reduce((m, w) => Math.max(m, w.z), 10);
      set({ datasetId: id, windows, activeId: null, zTop, selection: new Set(), isolate: false, classes: snap?.classes ?? [], colorByClass: snap?.colorByClass ?? false });
      for (const w of windows) if (w.config) void get().runWindow(w.id);
    },
    setCanvas: (w, h) => { const c = get().canvas; if (c.w !== w || c.h !== h) set({ canvas: { w, h } }); },

    openTool: (area, toolId, title) => {
      const s = get(), active = s.windows.find(w => w.id === s.activeId);
      if (active && active.area === area && active.toolId === toolId) return active.id;
      const existing = inArea(area).filter(w => w.toolId === toolId).sort((a, b) => b.z - a.z)[0];
      if (existing) { get().activate(existing.id); return existing.id; }
      const id = uid(), z = s.zTop + 1;
      const win: GeoWindow = { id, area, toolId, title, config: null, presentation: { ...DEFAULT_PRESENTATION }, pointSize: 7, symbol: AUTO_SYMBOL, showLabels: false,
        layers: { ...DEFAULT_LAYERS }, result: null, running: false, error: null, ...placement(area), z, minimized: false };
      set({ windows: [...s.windows, win], zTop: z });
      get().activate(id);
      return id;
    },

    activate: id => {
      const s = get(), win = s.windows.find(w => w.id === id); if (!win) return;
      // Already the front window: keep its z (focusing must not count as a change to the saved layout).
      const onTop = win.z >= s.zTop, z = onTop ? win.z : s.zTop + 1;
      if (s.activeId === id) { if (!onTop || win.minimized) set({ zTop: z, windows: s.windows.map(w => (w.id === id ? { ...w, z, minimized: false } : w)) }); return; }
      const prev = s.windows.find(w => w.id === s.activeId);
      set({ activeId: id, zTop: z, windows: onTop && !win.minimized ? s.windows : s.windows.map(w => (w.id === id ? { ...w, z, minimized: false } : w)) });
      // A computation started from the Editor for the previous window is superseded by the rebinding below:
      // finish it in the background so that window still gets its result.
      if (prev && prev.id !== id && (prev.running || useGeochemistryStore.getState().running) && prev.config) void get().runWindow(prev.id);
      boundId = null;
      bindEditor(get().windows.find(w => w.id === id)!);
    },

    patch,
    close: id => {
      const s = get(), rest = s.windows.filter(w => w.id !== id);
      set({ windows: rest, activeId: s.activeId === id ? null : s.activeId });
      if (s.activeId === id) { const closed = s.windows.find(w => w.id === id)!; const next = rest.filter(w => w.area === closed.area).sort((a, b) => b.z - a.z)[0]; if (next) get().activate(next.id); }
    },
    closeArea: area => { const s = get(); set({ windows: s.windows.filter(w => w.area !== area), activeId: s.windows.find(w => w.id === s.activeId)?.area === area ? null : s.activeId }); },
    duplicate: id => {
      const s = get(), src = s.windows.find(w => w.id === id); if (!src) return null;
      const copies = s.windows.filter(w => w.toolId === src.toolId && w.area === src.area).length;
      const base = src.title.replace(/ \(\d+\)$/, '');
      const nid = uid(), z = s.zTop + 1;
      const copy: GeoWindow = { ...src, id: nid, title: `${base} (${copies + 1})`, x: src.x + 28, y: src.y + 28, z, minimized: false, running: false };
      set({ windows: [...s.windows, copy], zTop: z });
      get().activate(nid);
      return nid;
    },
    toggleMinimize: id => { const w = get().windows.find(x => x.id === id); if (w) patch(id, { minimized: !w.minimized }); },
    tile: area => {
      const { canvas } = get(), ws = inArea(area).filter(w => !w.minimized).sort((a, b) => a.z - b.z); if (!ws.length) return;
      const g = 8, cols = Math.ceil(Math.sqrt(ws.length)), rows = Math.ceil(ws.length / cols);
      const cw = Math.floor((canvas.w - g * (cols + 1)) / cols), ch = Math.floor((canvas.h - g * (rows + 1)) / rows);
      const pos = new Map(ws.map((w, k) => [w.id, { x: g + (k % cols) * (cw + g), y: g + Math.floor(k / cols) * (ch + g), w: Math.max(280, cw), h: Math.max(180, ch) }]));
      set(s => ({ windows: s.windows.map(w => (pos.has(w.id) ? { ...w, ...pos.get(w.id)! } : w)) }));
    },
    cascade: area => {
      const { canvas } = get(), ws = inArea(area).filter(w => !w.minimized).sort((a, b) => a.z - b.z);
      const w = Math.max(360, Math.min(820, canvas.w - 32 - (ws.length - 1) * 28)), h = Math.max(260, Math.min(560, canvas.h - 32 - (ws.length - 1) * 28));
      const pos = new Map(ws.map((x, k) => [x.id, { x: 16 + k * 28, y: 16 + k * 28, w, h }]));
      set(s => ({ windows: s.windows.map(x => (pos.has(x.id) ? { ...x, ...pos.get(x.id)! } : x)) }));
    },
    toggleLayer: (id, key) => { const w = get().windows.find(x => x.id === id); if (w) patch(id, { layers: { ...w.layers, [key]: !w.layers[key] } }); },

    runWindow: async id => {
      const { datasetId } = get(), w = get().windows.find(x => x.id === id);
      if (!datasetId || !w?.config) return;
      const v = (runVersion.get(id) ?? 0) + 1; runVersion.set(id, v);
      patch(id, { running: true, error: null });
      try {
        const result = await geoApi.compute(datasetId, w.config);
        // Discard if superseded, or if the window's configuration changed while computing.
        if (runVersion.get(id) !== v || get().datasetId !== datasetId || get().windows.find(x => x.id === id)?.config !== w.config) { if (runVersion.get(id) === v) patch(id, { running: false }); return; }
        patch(id, { result, running: false });
        if (get().activeId === id) pushToEditor({ result, running: false, error: null });
      } catch (e) {
        if (runVersion.get(id) !== v) return;
        patch(id, { error: e instanceof Error ? e.message : String(e), running: false });
      }
    },

    openDiagram: (area, def) => {
      const s = get();
      const existing = s.windows.filter(w => w.area === area && w.config?.diagram?.id === def.spec.id).sort((a, b) => b.z - a.z)[0];
      if (existing) {
        const stale = JSON.stringify(existing.config?.diagram) !== JSON.stringify(def.spec);
        if (stale) patch(existing.id, { config: { ...existing.config!, diagram: def.spec, log_x: def.logX, log_y: def.logY }, title: def.spec.name, result: null });
        get().activate(existing.id);
        if (stale || !existing.result) void get().runWindow(existing.id);
        return existing.id;
      }
      const editor = useGeochemistryStore.getState();
      const base = editor.datasetId === s.datasetId ? editor.config : null;
      const id = uid(), z = s.zTop + 1;
      const win: GeoWindow = { id, area, toolId: CUSTOM_TOOL_ID, title: def.spec.name, config: configFor(def, base), presentation: { ...DEFAULT_PRESENTATION }, pointSize: 7, symbol: AUTO_SYMBOL, showLabels: false,
        layers: { ...DEFAULT_LAYERS }, result: null, running: false, error: null, ...placement(area), z, minimized: false };
      set({ windows: [...s.windows, win], zTop: z });
      get().activate(id);
      void get().runWindow(id);
      return id;
    },
    syncDiagram: def => {
      for (const w of get().windows.filter(x => x.config?.diagram?.id === def.spec.id)) {
        if (w.id === boundId && get().activeId === w.id) {
          patch(w.id, { title: def.spec.name });
          const g = useGeochemistryStore.getState();
          g.configure({ diagram: def.spec, log_x: def.logX, log_y: def.logY });
          void useGeochemistryStore.getState().run();
        } else {
          patch(w.id, { title: def.spec.name, config: { ...w.config!, diagram: def.spec, log_x: def.logX, log_y: def.logY }, result: null });
          void get().runWindow(w.id);
        }
      }
    },

    select: (rows, mode = 'replace') => {
      const cur = get().selection;
      let next: Set<number>;
      if (mode === 'replace') next = new Set(rows);
      else if (mode === 'add') next = new Set([...cur, ...rows]);
      else { next = new Set(cur); for (const r of rows) { if (next.has(r)) next.delete(r); else next.add(r); } }
      set({ selection: next, isolate: next.size ? get().isolate : false });
    },
    clearSelection: () => set({ selection: new Set(), isolate: false }),
    setIsolate: on => set({ isolate: on && get().selection.size > 0 }),
    setDragmode: dragmode => set({ dragmode }),
    createClass: name => {
      const s = get(); if (!s.selection.size) return null;
      const n = s.classes.length;
      const cls: SampleClass = { id: uid().replace(/^w/, "c"), name: uniqueName(name?.trim() || `Clase ${n + 1}`, s.classes.map(c => c.name)), color: CLASS_COLORS[n % CLASS_COLORS.length], rows: [...s.selection].sort((a, b) => a - b) };
      // A row belongs to one class at a time: assigning moves it out of any other class.
      set({ classes: [...s.classes.map(c => ({ ...c, rows: c.rows.filter(r => !s.selection.has(r)) })), cls], colorByClass: true });
      return cls;
    },
    assignToClass: classId => {
      const s = get(); if (!s.selection.size) return;
      set({ classes: s.classes.map(c => (c.id === classId ? { ...c, rows: [...new Set([...c.rows, ...s.selection])].sort((a, b) => a - b) } : { ...c, rows: c.rows.filter(r => !s.selection.has(r)) })), colorByClass: true });
    },
    renameClass: (classId, name) => { if (name.trim()) set(s => ({ classes: s.classes.map(c => (c.id === classId ? { ...c, name: uniqueName(name.trim(), s.classes.filter(x => x.id !== classId).map(x => x.name)) } : c)) })); },
    deleteClass: classId => set(s => { const classes = s.classes.filter(c => c.id !== classId); return { classes, colorByClass: classes.length ? s.colorByClass : false }; }),
    selectClass: classId => { const c = get().classes.find(x => x.id === classId); if (c) get().select(c.rows); },
    setColorByClass: on => set({ colorByClass: on && get().classes.length > 0 }),
  };
});

/** Mirror a window into the Editor (geochemistry-store). A window without config takes the tool's restored defaults. */
export function bindEditor(win: GeoWindow): boolean {
  const g = useGeochemistryStore.getState();
  // Only bind into an Editor loaded for the same dataset (never write one dataset's window into another's workspace).
  if (g.loading || g.datasetId !== useGeoWindows.getState().datasetId || !g.tools.some(t => t.id === win.toolId)) return false;
  binding = true;
  try {
    if (g.selectedTool !== win.toolId) g.select(win.toolId);
    const e = useGeochemistryStore.getState();
    if (!win.config) {
      useGeoWindows.getState().patch(win.id, { config: e.config, presentation: e.presentation, pointSize: e.pointSize, symbol: e.symbol, showLabels: e.showLabels });
      useGeochemistryStore.setState({ result: null, error: null, running: false, requestVersion: e.requestVersion + 1 });
    } else {
      useGeochemistryStore.setState({ config: win.config, presentation: win.presentation, pointSize: win.pointSize, symbol: win.symbol, showLabels: win.showLabels,
        result: win.result, error: win.error, running: false, notice: null, requestVersion: e.requestVersion + 1 });
    }
  } finally { binding = false; }
  boundId = win.id;
  return true;
}
function pushToEditor(p: { result: GeoResult | null; running: boolean; error: string | null }) {
  binding = true; try { useGeochemistryStore.setState(p); } finally { binding = false; }
}

// Editor → active window.
useGeochemistryStore.subscribe((s, prev) => {
  if (s.loading && !prev.loading) boundId = null; // a catalog (re)load replaces the Editor content
  if (binding || s.loading) return;
  const ws = useGeoWindows.getState(), w = ws.windows.find(x => x.id === ws.activeId);
  if (!w || boundId !== w.id) return;
  if (!w || s.datasetId !== ws.datasetId || s.selectedTool !== w.toolId || !s.config) return;
  if (s.config === prev.config && s.result === prev.result && s.running === prev.running && s.error === prev.error && s.presentation === prev.presentation
    && s.pointSize === prev.pointSize && s.symbol === prev.symbol && s.showLabels === prev.showLabels) return;
  // A fresh Editor run or a configuration change supersedes any background computation of this window.
  if ((s.running && !prev.running) || s.config !== prev.config) runVersion.set(w.id, (runVersion.get(w.id) ?? 0) + 1);
  ws.patch(w.id, { config: s.config, result: s.result, running: s.running, error: s.error, presentation: s.presentation, pointSize: s.pointSize, symbol: s.symbol, showLabels: s.showLabels });
});

// Persist windows (geometry + configuration) and classes per dataset.
useGeoWindows.subscribe((s, prev) => {
  if (!s.datasetId || (s.windows === prev.windows && s.classes === prev.classes && s.colorByClass === prev.colorByClass)) return;
  const keep = (w: GeoWindow): Persisted => ({ id: w.id, area: w.area, toolId: w.toolId, title: w.title, config: w.config, presentation: w.presentation, pointSize: w.pointSize,
    symbol: w.symbol, showLabels: w.showLabels, layers: w.layers, x: w.x, y: w.y, w: w.w, h: w.h, z: w.z, minimized: w.minimized });
  const all = readAll(); all[s.datasetId] = { windows: s.windows.map(keep), classes: s.classes, colorByClass: s.colorByClass }; writeAll(all);
});
