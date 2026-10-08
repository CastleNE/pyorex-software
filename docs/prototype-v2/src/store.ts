import { create } from 'zustand';
import type { ClassMethod, Shape } from './viz';
import { COLUMNS, type Column } from './data';
import { DEFAULT_SECTION, type SectionLine } from './sim3d';

export type CatVar = 'sector' | 'tas' | 'user';
export type ModuleId = 'geo' | 'spec' | 'petro';
export type AreaId = 'data' | 'litho' | 'explo' | 'maps';
export type Fly = 'project' | 'style' | 'layers' | null;
export type Lang = 'es' | 'en';
export type WinType = 'tas' | 'xy' | 'spider' | 'map' | 'table' | 'hist' | 'stats' | 'profile' | 'pipeline' | 'spectrum' | 'speclog' | 'vector' | 'match' | 'petro' | 'ternary' | 'models' | 'builder' | 'section';

export interface Layers {
  points: boolean; density: 'off' | 'contours' | 'filled' | 'heat'; densityBy: 'all' | 'group'; bw: number;
  hull: boolean; ellipse: 'off' | '1s' | '95'; regression: 'off' | 'all' | 'group'; marginals: 'off' | 'hist' | 'box';
  labels: 'off' | 'id' | 'value'; fields: boolean; grid: boolean; legend: boolean;
}
export const DEFAULT_LAYERS: Layers = { points: true, density: 'off', densityBy: 'group', bw: 1, hull: false, ellipse: 'off', regression: 'off', marginals: 'off', labels: 'off', fields: true, grid: true, legend: true };

export interface Win { id: string; type: WinType; title: string; x: number; y: number; w: number; h: number; z: number; min: boolean; opts: Record<string, any>; layers: Layers }

export interface Style {
  color: { mode: 'fixed' | 'category' | 'value'; fixed: string; catVar: CatVar; palette: string; overrides: Record<string, string>; valueVar: string; ramp: string; reverse: boolean; log: boolean; method: ClassMethod; n: number; manual: number[] | null };
  shape: { mode: 'fixed' | 'category'; fixed: Shape; catVar: CatVar; overrides: Record<string, Shape>; hollow: boolean };
  size: { mode: 'fixed' | 'value'; fixed: number; valueVar: string; min: number; max: number; log: boolean };
  hidden: Record<string, boolean>; hiddenClasses: Record<number, boolean>;
  order: Record<CatVar, string[]>;
  opacity: number; outline: 'auto' | 'none' | 'dark' | 'light'; selectedOnTop: boolean;
}

export const DEFAULT_STYLE: Style = {
  color: { mode: 'category', fixed: '#0072b2', catVar: 'sector', palette: 'Okabe–Ito', overrides: {}, valueVar: 'Cu', ramp: 'viridis', reverse: false, log: true, method: 'quantile', n: 5, manual: null },
  shape: { mode: 'category', fixed: 'circle', catVar: 'sector', overrides: {}, hollow: false },
  size: { mode: 'fixed', fixed: 8, valueVar: 'Cu', min: 4, max: 18, log: true },
  hidden: {}, hiddenClasses: {}, order: { sector: [], tas: [], user: [] },
  opacity: 0.85, outline: 'auto', selectedOnTop: true,
};

export interface Step { id: string; icon: string; title: string; detail: string; code: string }

interface State {
  theme: 'light' | 'dark'; module: ModuleId; area: AreaId; ribbonTab: string; lang: Lang;
  fly: Fly; flyPin: boolean; insOpen: boolean; insPin: boolean; histOpen: boolean; refTool: string | null; refWin: string | null;
  columns: Column[]; diagrams: { name: string; version: number; def: any }[];
  gallery: { cat: string; x: number } | null; section: SectionLine; showSection: boolean; drawSection: boolean;
  wizard: number | null; backPage: string; projectCrs: string; projectName: string; dirty: boolean;
  windows: Win[]; activeId: string | null; zTop: number;
  selection: number[]; isolate: boolean; focusSample: number | null; focusInterval: number;
  style: Style; userClasses: Record<number, string>; userClassCount: number;
  history: Step[]; palette: boolean; backstage: boolean; toast: string | null;
  set: (p: Partial<State>) => void;
  setStyle: (f: (s: Style) => Style) => void;
  open: (type: WinType, opts?: Record<string, any>, title?: string, geom?: Partial<Win>) => void;
  close: (id: string) => void; focus: (id: string) => void; patchWin: (id: string, p: Partial<Win>) => void;
  setLayers: (id: string, p: Partial<Layers>) => void;
  select: (idx: number[], mode?: 'replace' | 'add' | 'toggle') => void;
  createClass: () => void; log: (s: Omit<Step, 'id'>) => void; notify: (m: string) => void;
}

export const TITLES: Record<WinType, string> = {
  tas: 'TAS plutónico', xy: 'Diagrama XY', spider: 'Spider REE', map: 'Mapa de muestras', table: 'Tabla', hist: 'Histograma', stats: 'Estadística descriptiva',
  profile: 'Importar · perfil de calidad', pipeline: 'Exportar como script', spectrum: 'Espectro SWIR', speclog: 'Log espectral', vector: 'Al-OH vs cristalinidad',
  match: 'Identificación', petro: 'Petrofísica', ternary: 'Ternario AFM', models: 'Modelos de depósito', builder: 'Diagram Builder', section: 'Sección A–A′',
};

let wid = 0;
export const useApp = create<State>((set, get) => ({
  theme: 'light', module: 'geo', area: 'litho', ribbonTab: 'area', lang: 'es',
  fly: null, flyPin: false, insOpen: false, insPin: false, histOpen: false, refTool: null, refWin: null,
  columns: COLUMNS, diagrams: [], gallery: null, section: DEFAULT_SECTION, showSection: true, drawSection: false, wizard: null, backPage: 'open', projectCrs: 'EPSG:32718', projectName: 'Intrusivos_PeruCentral', dirty: false,
  windows: [], activeId: null, zTop: 10, selection: [], isolate: false, focusSample: null, focusInterval: 45,
  style: DEFAULT_STYLE, userClasses: {}, userClassCount: 0, history: [], palette: false, backstage: false, toast: null,
  set: p => set(p),
  setStyle: f => set(s => ({ style: f(s.style) })),
  open: (type, opts = {}, title, geom = {}) => {
    const s = get();
    const existing = s.windows.find(w => w.type === type && JSON.stringify(w.opts) === JSON.stringify(opts));
    if (existing) { get().focus(existing.id); set(st => ({ windows: st.windows.map(w => (w.id === existing.id ? { ...w, min: false } : w)) })); return; }
    const n = s.windows.length, z = s.zTop + 1, id = `w${++wid}`;
    const win: Win = { id, type, title: title ?? TITLES[type], x: 24 + (n % 6) * 28, y: 20 + (n % 6) * 28, w: 520, h: 380, z, min: false, opts, layers: { ...DEFAULT_LAYERS }, ...geom };
    set({ windows: [...s.windows, win], activeId: id, zTop: z });
  },
  close: id => set(s => { const ws = s.windows.filter(w => w.id !== id); const top = ws.reduce<Win | null>((a, w) => (!a || w.z > a.z ? w : a), null); return { windows: ws, activeId: s.activeId === id ? top?.id ?? null : s.activeId }; }),
  focus: id => set(s => (s.activeId === id ? {} : { activeId: id, zTop: s.zTop + 1, windows: s.windows.map(w => (w.id === id ? { ...w, z: s.zTop + 1 } : w)) })),
  patchWin: (id, p) => set(s => ({ windows: s.windows.map(w => (w.id === id ? { ...w, ...p } : w)) })),
  setLayers: (id, p) => set(s => ({ windows: s.windows.map(w => (w.id === id ? { ...w, layers: { ...w.layers, ...p } } : w)) })),
  select: (idx, mode = 'replace') => set(s => {
    let next: number[];
    if (mode === 'replace') next = [...new Set(idx)];
    else if (mode === 'add') next = [...new Set([...s.selection, ...idx])];
    else { const cur = new Set(s.selection); for (const i of idx) cur.has(i) ? cur.delete(i) : cur.add(i); next = [...cur]; }
    return { selection: next, focusSample: next.length ? next[0] : s.focusSample, isolate: next.length ? s.isolate : false, insOpen: next.length ? true : s.insPin };
  }),
  createClass: () => {
    const s = get(); if (!s.selection.length) return;
    const name = `Clase ${s.userClassCount + 1}`; const uc = { ...s.userClasses }; for (const i of s.selection) uc[i] = name;
    set({ userClasses: uc, userClassCount: s.userClassCount + 1, style: { ...s.style, color: { ...s.style.color, mode: 'category', catVar: 'user' }, shape: { ...s.style.shape, catVar: 'user' } }, fly: 'style', dirty: true });
    get().log({ icon: 'classify', title: `Crear «${name}»`, detail: `${s.selection.length} muestras seleccionadas`, code: `df.loc[sel, "Clase"] = "${name}"   # ${s.selection.length} muestras` });
    get().notify(`«${name}» creada con ${s.selection.length} muestras. El color y la forma ahora siguen las clases de usuario.`);
  },
  log: st => set(s => ({ dirty: true, history: [...s.history, { ...st, id: String(Date.now() + Math.random()) }] })),
  notify: m => { set({ toast: m }); setTimeout(() => { if (get().toast === m) set({ toast: null }); }, 3800); },
}));
