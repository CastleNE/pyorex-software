/**
 * Geoquímica shell state: active area, the view open in each area, contextual ribbon tab and contextual side panels.
 * Pure presentation state — no analysis logic lives here. Persisted per machine so the workspace reopens as left.
 */
import { create } from 'zustand';
import { AREAS, DEFAULT_VIEW, type AreaId, type GeoView } from '../lib/geochem-areas';

export type Fly = 'project' | 'history' | 'style' | null;
export type RibbonTab = 'area' | 'tool' | 'style';
interface Persisted { area: AreaId; views: Record<AreaId, GeoView>; editorOpen: boolean; flyPin: boolean }
const KEY = 'pyorex.shell.v1';

function load(): Persisted {
  const base: Persisted = { area: 'litho', views: { ...DEFAULT_VIEW }, editorOpen: true, flyPin: false };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Persisted> | null;
    if (!raw) return base;
    const area = AREAS.includes(raw.area as AreaId) ? (raw.area as AreaId) : base.area;
    const views = { ...base.views }; for (const a of AREAS) { const v = raw.views?.[a]; if (v && typeof v === 'object' && 'kind' in v) views[a] = v; }
    // IDW isovalues became a layer of the sample map (phase 5).
    if (views.maps.kind === 'explore' && views.maps.tool === 'isovalues') views.maps = { kind: 'map', mode: 'samples' };
    return { area, views, editorOpen: raw.editorOpen ?? true, flyPin: raw.flyPin ?? false };
  } catch { return base; }
}

interface ShellState extends Persisted {
  ribbonTab: RibbonTab; fly: Fly; refOpen: boolean;
  /** «Ejes, paleta y tamaño» panel of the active chart window (opened from the Style tab). */ chartControlsOpen: boolean; setChartControlsOpen: (open: boolean) => void;
  setArea: (a: AreaId) => void;
  openView: (v: GeoView, area?: AreaId) => void;
  setRibbonTab: (t: RibbonTab) => void;
  setFly: (f: Fly) => void; toggleFlyPin: () => void;
  setEditorOpen: (open: boolean) => void; setRefOpen: (open: boolean) => void;
}

export const useShellStore = create<ShellState>((set, get) => ({
  ...load(), ribbonTab: 'area', fly: null, refOpen: false, chartControlsOpen: false,
  setChartControlsOpen: chartControlsOpen => set({ chartControlsOpen }),
  setArea: area => set({ area, ribbonTab: 'area', refOpen: false }),
  openView: (v, area) => { const a = area ?? get().area; set({ area: a, views: { ...get().views, [a]: v }, refOpen: false }); },
  setRibbonTab: ribbonTab => set({ ribbonTab }),
  setFly: fly => set({ fly }), toggleFlyPin: () => set({ flyPin: !get().flyPin }),
  setEditorOpen: editorOpen => set({ editorOpen }), setRefOpen: refOpen => set({ refOpen }),
}));

useShellStore.subscribe(s => {
  try { localStorage.setItem(KEY, JSON.stringify({ area: s.area, views: s.views, editorOpen: s.editorOpen, flyPin: s.flyPin })); } catch { /* storage unavailable */ }
});

/** Re-read the persisted shell state (after a project file rewrote it). */
export function reloadShell() { useShellStore.setState({ ...load(), ribbonTab: 'area', fly: null, refOpen: false }); }

/** Legacy deep links (app-store activeModuleId) → area + view. */
export function legacyTarget(id: string): { area: AreaId; view: GeoView } | null {
  if (id === 'data' || id === 'data-analysis') return { area: 'data', view: { kind: 'data', action: 'prepare' } };
  if (id === 'diagrams') return { area: 'data', view: { kind: 'tool', toolId: 'scatter' } };
  if (id === 'litogeochemistry' || id === 'lithogeochemistry') return { area: 'litho', view: DEFAULT_VIEW.litho };
  if (id === 'mineral-exploration') return { area: 'explo', view: DEFAULT_VIEW.explo };
  return null;
}
