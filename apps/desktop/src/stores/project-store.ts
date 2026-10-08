/**
 * The current PyOreX project (.orex): which datasets belong to it, where it is saved, its CRS and whether the
 * workspace has unsaved changes. Saving/opening the archive is done by the Python service (`project.*`); this store
 * gathers and restores the desktop state around it (lib/project-state.ts).
 */
import { create } from 'zustand';
import { isTauri } from '@tauri-apps/api/core';
import { projectApi } from '../lib/project-api';
import { applyState, collectState, fingerprint, parseState, remapState, type ProjectState } from '../lib/project-state';
import { listDatasets } from '../lib/data-api';
import { toDatasetInfo } from '../lib/dataset-mapping';
import { loadSaved } from '../lib/geochemistry-session';
import { useDatasetStore } from './dataset-store';
import { useGeoWindows } from './geo-windows-store';
import { useGeochemistryStore } from './geochemistry-store';
import { reloadShell, useShellStore } from './shell-store';
import { useDiagramLibrary } from './diagram-library-store';
import { useMapStore } from './map-store';
import { hasFeature, usePlanStore } from './plan-store';
import { onProjectDataChanged } from '../lib/project-events';
import { useColumnRoles } from './column-roles-store';
import { addRecent, loadRecent, removeRecent, saveRecent, type RecentProject } from '../lib/recent-projects';
import { tx } from '../lib/i18n';

export type Notice = { tone: 'ok' | 'error'; text: string };
export type PathRequest = { mode: 'open' | 'save'; suggested: string; resolve: (path: string | null) => void };
export type Choice = 'save' | 'discard' | 'cancel';
export type ConfirmRequest = { resolve: (c: Choice) => void };

interface Persisted { path: string | null; name: string | null; datasetIds: string[]; crs: string | null; savedPrint: string | null;
  /** Service-side changes (metadata, overlays) not yet saved in the .orex — see lib/project-events.ts. */ pendingData: boolean }
const KEY = 'pyorex.project.v1';
function load(): Persisted {
  const base: Persisted = { path: null, name: null, datasetIds: [], crs: null, savedPrint: null, pendingData: false };
  try { const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return raw && typeof raw === 'object' ? { ...base, ...raw } : base; } catch { return base; }
}

interface ProjectStore extends Persisted {
  dirty: boolean; busy: 'saving' | 'opening' | null; notice: Notice | null;
  /** Recently opened or saved projects, newest first (File → Open recent). */
  recent: RecentProject[];
  pathRequest: PathRequest | null; confirmRequest: ConfirmRequest | null;
  include: (datasetId: string) => void;
  exclude: (datasetId: string) => void;
  setCrs: (crs: string | null) => void;
  save: (asNew?: boolean) => Promise<boolean>;
  /** Opens a project; without a path, asks for one. */
  open: (path?: string) => Promise<void>;
  forgetRecent: (path: string) => void;
  newProject: () => Promise<void>;
  recompute: () => void;
  dismissNotice: () => void;
}

const storage = () => globalThis.localStorage;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Datasets a save would include: the explicit members, or (first save) the active dataset plus any with windows. */
function membersForSave(s: Persisted): string[] {
  const known = new Set(useDatasetStore.getState().allDatasets.map(d => d.id));
  let ids = s.datasetIds.filter(id => known.has(id));
  if (!ids.length) {
    const active = useDatasetStore.getState().dataset?.id;
    let withWindows: string[] = [];
    try { withWindows = Object.entries(JSON.parse(storage().getItem('pyorex.geo.windows.v1') ?? '{}') as Record<string, { windows?: unknown[] }>).filter(([, v]) => (v.windows?.length ?? 0) > 0).map(([k]) => k); } catch { /* none */ }
    ids = [...new Set([...(active ? [active] : []), ...withWindows])].filter(id => known.has(id));
  }
  return ids;
}
const currentState = (s: Persisted, ids: string[]): ProjectState => collectState(storage(), ids, useDatasetStore.getState().dataset?.id ?? null, s.crs);

/** True when the native dialog returned a name without .orex and we added it: its overwrite prompt did not cover that file. */
let appendedExtension = false;
async function projectExists(path: string): Promise<boolean> {
  try { await projectApi.inspect(path); return true; } catch (e) { return !/No existe/.test(msg(e)); }
}

async function pickPath(mode: 'open' | 'save', suggested: string): Promise<string | null> {
  appendedExtension = false;
  if (isTauri()) {
    const dialog = await import('@tauri-apps/plugin-dialog');
    const filters = [{ name: 'Proyecto PyOreX', extensions: ['orex'] }];
    const p = mode === 'save' ? await dialog.save({ defaultPath: suggested, filters }) : await dialog.open({ multiple: false, filters });
    if (typeof p !== 'string') return null;
    appendedExtension = mode === 'save' && !p.toLowerCase().endsWith('.orex');
    return appendedExtension ? `${p}.orex` : p;
  }
  // Browser development mode: no native dialogs, ask for an absolute path in the app.
  return new Promise(resolve => useProject.setState({ pathRequest: { mode, suggested, resolve: p => { useProject.setState({ pathRequest: null }); resolve(p); } } }));
}

const askUnsaved = () => new Promise<Choice>(resolve => useProject.setState({ confirmRequest: { resolve: c => { useProject.setState({ confirmRequest: null }); resolve(c); } } }));

export const useProject = create<ProjectStore>((set, get) => ({
  ...load(), dirty: false, busy: null, notice: null, pathRequest: null, confirmRequest: null, recent: loadRecent(),

  include: id => { if (!get().datasetIds.includes(id)) set({ datasetIds: [...get().datasetIds, id] }); },
  exclude: id => set({ datasetIds: get().datasetIds.filter(x => x !== id) }),
  setCrs: crs => set({ crs }),
  dismissNotice: () => set({ notice: null }),
  forgetRecent: path => set({ recent: removeRecent(get().recent, path) }),

  recompute: () => {
    const s = get(), ids = membersForSave(s);
    const print = ids.length ? fingerprint(currentState(s, ids), ids) : null;
    const dirty = !!print && (print !== s.savedPrint || s.pendingData);
    if (dirty !== s.dirty) set({ dirty });
  },

  save: async (asNew = false) => {
    const s = get(); if (s.busy || inFlight) return false;
    if (!projectsAllowed()) return false;
    inFlight = true;
    try { return await doSave(asNew); } finally { inFlight = false; }
  },

  open: async (path?: string) => {
    if (get().busy || inFlight) return;
    if (!projectsAllowed()) return;
    inFlight = true;
    try { await doOpen(path); } finally { inFlight = false; }
  },

  newProject: async () => {
    if (get().busy || inFlight || !(await resolveUnsaved(get))) return;
    set({ path: null, name: null, datasetIds: [], crs: null, savedPrint: null, pendingData: false, dirty: false, notice: { tone: 'ok', text: tx({ es: 'Proyecto nuevo. Los datasets siguen disponibles; los que importes o incluyas formarán parte de él.', en: 'New project. Datasets are still available; the ones you import or include will belong to it.' }) } });
  },
}));

/** Editions without .orex projects (web demo): explain instead of opening a dialog the engine would refuse. */
function projectsAllowed(): boolean {
  const plan = usePlanStore.getState().plan;
  if (hasFeature(plan, 'projects')) return true;
  useProject.setState({ notice: { tone: 'error', text: tx({ es: `${plan?.label ?? 'Esta edición'} no incluye proyectos .orex. Disponible en la versión de escritorio de PyOreX.`, en: `${plan?.label ?? 'This edition'} does not include .orex projects. Available in the PyOreX desktop edition.` }) } });
  return false;
}
let inFlight = false;

async function doSave(asNew: boolean): Promise<boolean> {
    const set = useProject.setState, get = useProject.getState;
    const s = get();
    const ids = membersForSave(s);
    if (!ids.length) { set({ notice: { tone: 'error', text: tx({ es: 'No hay datasets para guardar. Importa datos primero.', en: 'There are no datasets to save. Import data first.' }) } }); return false; }
    const target = !asNew && s.path ? s.path : await pickPath('save', `${s.name ?? 'Proyecto'}.orex`);
    if (!target) return false;
    if (appendedExtension && target !== s.path && (await projectExists(target))) {
      set({ notice: { tone: 'error', text: tx({ es: `Ya existe ${target}. Elígelo explícitamente en el diálogo para reemplazarlo.`, en: `${target} already exists. Choose it explicitly in the dialog to replace it.` }) } });
      return false;
    }
    set({ busy: 'saving', notice: null });
    try {
      const state = currentState(get(), ids);
      const out = await projectApi.save(target, asNew || !s.name ? null : s.name, state, ids);
      const mb = (out.bytes / 1048576).toFixed(1);
      set({ path: out.path, name: out.name, datasetIds: ids, savedPrint: fingerprint(state, ids), pendingData: false, dirty: false, recent: addRecent(get().recent, out.path, out.name),
        notice: { tone: 'ok', text: tx({ es: `Proyecto guardado · ${out.datasets} dataset(s) · ${mb} MB · ${out.path}`, en: `Project saved · ${out.datasets} dataset(s) · ${mb} MB · ${out.path}` }) } });
      return true;
    } catch (e) { set({ notice: { tone: 'error', text: tx({ es: `No se pudo guardar el proyecto: ${msg(e)}`, en: `Could not save the project: ${msg(e)}` }) } }); return false; }
    finally { set({ busy: null }); }
}

async function doOpen(requested?: string): Promise<void> {
  const set = useProject.setState, get = useProject.getState;
  if (!(await resolveUnsaved(get))) return;
  const path = requested ?? await pickPath('open', '');
  if (!path) return;
  set({ busy: 'opening', notice: null });
  try {
    const out = await projectApi.open(path);
    const state = remapState(parseState(out.state), out.id_map);
    applyState(storage(), state);
    const ids = Object.values(out.id_map);
    // Reference for "unsaved changes": exactly what was just applied (not a timer).
    const savedPrint = fingerprint(collectState(storage(), ids, state.activeDatasetId, state.crs), ids);
    // Reload every store that persisted what the project just rewrote.
    const { datasets } = await listDatasets();
    const ds = useDatasetStore.getState();
    ds.setAllDatasets(datasets.map(toDatasetInfo));
    if (state.activeDatasetId) ds.setActiveDataset(state.activeDatasetId);
    reloadShell();
    void useDiagramLibrary.persist.rehydrate();
    void useMapStore.persist.rehydrate();
    // The Editor may hold the previous version of the same dataset in memory: drop it and reload, so its
    // autosave never writes stale configuration over what the project restored.
    useGeochemistryStore.setState({ saved: loadSaved(), datasetId: null, config: null, result: null, selectedTool: null, attributes: {}, requestVersion: useGeochemistryStore.getState().requestVersion + 1 });
    const active = useDatasetStore.getState().dataset?.id ?? null;
    if (active) void useGeochemistryStore.getState().load(active, 'lithogeochemistry');
    useGeoWindows.setState({ datasetId: null });
    useGeoWindows.getState().setDataset(active);
    for (const id of ids) void useColumnRoles.getState().load(id, true);
    const renamed = Object.entries(out.id_map).filter(([a, b]) => a !== b).length;
    set({ path, name: out.manifest.name, datasetIds: ids, crs: state.crs, savedPrint, pendingData: false, dirty: false, recent: addRecent(get().recent, path, out.manifest.name),
      notice: { tone: 'ok', text: tx({
        es: `Proyecto «${out.manifest.name}» abierto · ${ids.length} dataset(s)${renamed ? ` · ${renamed} restaurado(s) como copia porque la versión local era distinta` : ''}`,
        en: `Project “${out.manifest.name}” opened · ${ids.length} dataset(s)${renamed ? ` · ${renamed} restored as a copy because the local version was different` : ''}` }) } });
  } catch (e) {
    // A recent entry whose file was moved or deleted is dropped so the list does not keep offering it.
    const missing = !!requested && /No existe/.test(msg(e));
    set({ ...(missing ? { recent: removeRecent(get().recent, requested) } : {}),
      notice: { tone: 'error', text: missing ? tx({ es: `Ya no existe ${requested}. Se quitó de recientes.`, en: `${requested} no longer exists. It was removed from recent projects.` }) : tx({ es: `No se pudo abrir el proyecto: ${msg(e)}`, en: `Could not open the project: ${msg(e)}` }) } });
  }
  finally { set({ busy: null }); }
}

async function resolveUnsaved(get: () => ProjectStore): Promise<boolean> {
  get().recompute();
  if (!get().dirty) return true;
  const c = await askUnsaved();
  if (c === 'cancel') return false;
  if (c === 'save') return doSave(false);   // not get().save(): that guard would refuse while an open is in flight
  return true;
}

// Persist the project identity; recompute "unsaved changes" whenever something it saves may have changed.
useProject.subscribe((s, p) => {
  if (s.recent !== p.recent) saveRecent(s.recent, storage());
  if (s.path !== p.path || s.name !== p.name || s.datasetIds !== p.datasetIds || s.crs !== p.crs || s.savedPrint !== p.savedPrint || s.pendingData !== p.pendingData) {
    try { storage().setItem(KEY, JSON.stringify({ path: s.path, name: s.name, datasetIds: s.datasetIds, crs: s.crs, savedPrint: s.savedPrint, pendingData: s.pendingData })); } catch { /* storage unavailable */ }
    schedule();
  }
});
let timer: ReturnType<typeof setTimeout> | undefined;
function schedule() { clearTimeout(timer); timer = setTimeout(() => useProject.getState().recompute(), 400); }
useShellStore.subscribe(schedule);
useDiagramLibrary.subscribe((s, p) => { if (s.diagrams !== p.diagrams) schedule(); });
useMapStore.subscribe((s, p) => { if (s.byDataset !== p.byDataset) schedule(); });
useGeoWindows.subscribe((s, p) => { if (s.windows !== p.windows || s.classes !== p.classes || s.colorByClass !== p.colorByClass) schedule(); });
useGeochemistryStore.subscribe((s, p) => { if (s.saved !== p.saved) schedule(); });
useDatasetStore.subscribe((s, p) => { if (s.dataset?.id !== p.dataset?.id || s.allDatasets !== p.allDatasets) schedule(); });

onProjectDataChanged(() => useProject.setState({ pendingData: true }));
