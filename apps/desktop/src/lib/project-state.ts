/**
 * What a PyOreX project (.orex) remembers about the desktop, besides the datasets themselves (those are copied by
 * the Python service, byte for byte). Pure functions over the localStorage documents the stores already persist,
 * so a project is exactly "the workspace as you left it": areas and open views, floating windows with their
 * configuration and layers, user classes, Editor workspaces and category styles, and the project CRS.
 *
 * Dataset ids are the join key everywhere; `remapState` rewrites them with the `id_map` returned by
 * `project.open` (a dataset restored under a new id because the local copy differed keeps all its windows).
 */
import type { SavedState } from './geochemistry-session';
import { sanitizeDef, type DiagramDef } from './custom-diagrams';

export const PROJECT_STATE_VERSION = 1;
export const STORAGE_KEYS = { shell: 'pyorex.shell.v1', windows: 'pyorex.geo.windows.v1', workspaces: 'pyorex.geochemistry.workspaces.v1', diagrams: 'pyorex.diagrams.v1', maps: 'pyorex.map.v1' } as const;

export interface ProjectState {
  version: number;
  activeDatasetId: string | null;
  /** Preferred CRS of the project (e.g. "EPSG:32718"): proposed when assigning coordinates to a dataset. */
  crs: string | null;
  shell: unknown;
  /** pyorex.geo.windows.v1 restricted to the project's datasets. */
  windows: Record<string, unknown>;
  /** pyorex.geochemistry.workspaces.v1 restricted to the project's datasets. */
  geochemistry: SavedState;
  /** The user's diagram library (Diagram Builder): travels with the project; on open, same id = project version. */
  diagrams: DiagramDef[];
  /** Sample map settings per dataset (stores/map-store.ts), restricted to the project's datasets. */
  maps: Record<string, unknown>;
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const read = (s: Storage, key: string): unknown => { try { return JSON.parse(s.getItem(key) ?? 'null'); } catch { return null; } };
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const datasetOfKey = (key: string) => key.split('::')[0];
const defs = (raw: unknown): DiagramDef[] => (Array.isArray(raw) ? raw.map(sanitizeDef).filter((d): d is DiagramDef => !!d) : []);
/** Library as persisted by stores/diagram-library-store.ts (zustand persist: { state: { diagrams } }). */
const storedDiagrams = (s: Storage): DiagramDef[] => { const doc = read(s, STORAGE_KEYS.diagrams); return isRecord(doc) && isRecord(doc.state) ? defs(doc.state.diagrams) : []; };
/** Map settings as persisted by stores/map-store.ts (zustand persist: { state: { byDataset } }). */
const storedMaps = (s: Storage): Record<string, unknown> => { const doc = read(s, STORAGE_KEYS.maps); return isRecord(doc) && isRecord(doc.state) && isRecord(doc.state.byDataset) ? doc.state.byDataset : {}; };

export function collectState(s: Storage, datasetIds: string[], activeDatasetId: string | null, crs: string | null): ProjectState {
  const ids = new Set(datasetIds);
  const allWindows = read(s, STORAGE_KEYS.windows);
  const windows = isRecord(allWindows) ? Object.fromEntries(Object.entries(allWindows).filter(([id]) => ids.has(id))) : {};
  const ws = read(s, STORAGE_KEYS.workspaces);
  const geochemistry: SavedState = { workspaces: {}, attributes: {} };
  if (isRecord(ws) && isRecord(ws.workspaces) && isRecord(ws.attributes)) {
    geochemistry.workspaces = Object.fromEntries(Object.entries(ws.workspaces).filter(([k]) => ids.has(datasetOfKey(k)))) as SavedState['workspaces'];
    geochemistry.attributes = Object.fromEntries(Object.entries(ws.attributes).filter(([id]) => ids.has(id))) as SavedState['attributes'];
  }
  return { version: PROJECT_STATE_VERSION, activeDatasetId: activeDatasetId && ids.has(activeDatasetId) ? activeDatasetId : datasetIds[0] ?? null, crs, shell: read(s, STORAGE_KEYS.shell), windows, geochemistry, diagrams: storedDiagrams(s),
    maps: Object.fromEntries(Object.entries(storedMaps(s)).filter(([id]) => ids.has(id))) };
}

/** Replace archived dataset ids by local ones everywhere they key the state. Unknown ids are left as they are. */
export function remapState(state: ProjectState, idMap: Record<string, string>): ProjectState {
  const m = (id: string) => idMap[id] ?? id;
  return {
    ...state,
    activeDatasetId: state.activeDatasetId ? m(state.activeDatasetId) : null,
    windows: Object.fromEntries(Object.entries(state.windows ?? {}).map(([id, v]) => [m(id), v])),
    geochemistry: {
      workspaces: Object.fromEntries(Object.entries(state.geochemistry?.workspaces ?? {}).map(([k, v]) => { const [id, ...rest] = k.split('::'); return [[m(id), ...rest].join('::'), v]; })),
      attributes: Object.fromEntries(Object.entries(state.geochemistry?.attributes ?? {}).map(([id, v]) => [m(id), v])),
    },
    maps: Object.fromEntries(Object.entries(state.maps ?? {}).map(([id, v]) => [m(id), v])),
  };
}

/** Defensive parse of a state coming from a file. */
export function parseState(raw: unknown): ProjectState {
  if (!isRecord(raw)) throw new Error('Estado de proyecto inválido');
  if (typeof raw.version === 'number' && raw.version > PROJECT_STATE_VERSION) throw new Error('El proyecto se creó con una versión más reciente de PyOreX');
  const geo = isRecord(raw.geochemistry) ? raw.geochemistry : {};
  return {
    version: PROJECT_STATE_VERSION,
    activeDatasetId: typeof raw.activeDatasetId === 'string' ? raw.activeDatasetId : null,
    crs: typeof raw.crs === 'string' ? raw.crs : null,
    shell: isRecord(raw.shell) ? raw.shell : null,
    windows: isRecord(raw.windows) ? raw.windows : {},
    geochemistry: { workspaces: isRecord(geo.workspaces) ? geo.workspaces as SavedState['workspaces'] : {}, attributes: isRecord(geo.attributes) ? geo.attributes as SavedState['attributes'] : {} },
    diagrams: defs(raw.diagrams),
    maps: isRecord(raw.maps) ? Object.fromEntries(Object.entries(raw.maps).filter(([, v]) => isRecord(v))) : {},
  };
}

/** Write a (remapped) project state back into the documents the stores read. Other datasets' entries are kept. */
export function applyState(s: Storage, state: ProjectState): void {
  if (state.shell) s.setItem(STORAGE_KEYS.shell, JSON.stringify(state.shell));
  const allWindows = read(s, STORAGE_KEYS.windows);
  s.setItem(STORAGE_KEYS.windows, JSON.stringify({ ...(isRecord(allWindows) ? allWindows : {}), ...state.windows }));
  const ws = read(s, STORAGE_KEYS.workspaces);
  const base: SavedState = isRecord(ws) && isRecord(ws.workspaces) && isRecord(ws.attributes) ? (ws as unknown as SavedState) : { workspaces: {}, attributes: {} };
  s.setItem(STORAGE_KEYS.workspaces, JSON.stringify({ workspaces: { ...base.workspaces, ...state.geochemistry.workspaces }, attributes: { ...base.attributes, ...state.geochemistry.attributes } }));
  if (state.diagrams?.length) {
    const local = storedDiagrams(s), incoming = new Set(state.diagrams.map(d => d.spec.id));
    s.setItem(STORAGE_KEYS.diagrams, JSON.stringify({ state: { diagrams: [...local.filter(d => !incoming.has(d.spec.id)), ...state.diagrams] }, version: 0 }));
  }
  if (state.maps && Object.keys(state.maps).length) s.setItem(STORAGE_KEYS.maps, JSON.stringify({ state: { byDataset: { ...storedMaps(s), ...state.maps } }, version: 0 }));
}

/** Stable text of what a save would write — compared to detect unsaved changes. */
export const fingerprint = (state: ProjectState, datasetIds: string[]) => JSON.stringify([state, [...datasetIds].sort()]);
