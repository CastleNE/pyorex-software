/**
 * Canvas of floating windows for one Geoquímica area. The ribbon asks for a tool (`toolId`); the canvas opens a
 * window for it or brings the existing one to the front. The active window is mirrored into the attribute Editor.
 */
import { useEffect, useRef } from 'react';
import FloatingWindow from '@/components/window-manager/FloatingWindow';
import PxIcon from '../PxIcon';
import GeoChartWindow from './GeoChartWindow';
import { bindEditor, editorBoundTo, useGeoWindows } from '../../stores/geo-windows-store';
import { useGeochemistryStore } from '../../stores/geochemistry-store';
import { useGeoRegistryStore } from '../../stores/geochemistry-registry-store';
import { useDatasetStore } from '../../stores/dataset-store';
import { useShellStore } from '../../stores/shell-store';
import { iconForTool, type AreaId, type GeoView } from '../../lib/geochem-areas';
import { useL, useT } from '../../lib/i18n';
import { toolLabel } from '../../lib/tool-labels';
import { CUSTOM_TOOL_ID } from '../../lib/custom-diagrams';

export default function GeoCanvas({ area, request }: { area: AreaId; request?: GeoView }) {
  const t = useT(), L = useL();
  const ref = useRef<HTMLDivElement>(null);
  const handled = useRef<GeoView | null>(null);
  const toolId = request?.kind === 'tool' ? request.toolId : undefined;
  const datasetId = useDatasetStore(s => s.dataset?.id ?? null);
  const windows = useGeoWindows(s => s.windows), activeId = useGeoWindows(s => s.activeId), windowsDataset = useGeoWindows(s => s.datasetId);
  const loading = useGeochemistryStore(s => s.loading), tools = useGeochemistryStore(s => s.tools), editorTool = useGeochemistryStore(s => s.selectedTool);
  const registry = useGeoRegistryStore(s => s.registry);
  const W = useGeoWindows.getState; // stable accessor: never a dependency that changes on every store update
  const mine = windows.filter(w => w.area === area);
  const topZ = mine.reduce((m, w) => Math.max(m, w.z), -Infinity);

  useEffect(() => { W().setDataset(datasetId); }, [datasetId, W]);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => W().setCanvas(Math.round(e.contentRect.width), Math.round(e.contentRect.height)));
    ro.observe(el); return () => ro.disconnect();
  }, [W]);

  // Ribbon → window: open (or focus) the window of the requested tool once the catalog knows it.
  // Each ribbon click is a new view object, so clicking a tool whose window was closed opens it again.
  useEffect(() => {
    if (!request || handled.current === request || !toolId || loading || windowsDataset !== datasetId || !tools.some(x => x.id === toolId)) return;
    handled.current = request;
    // User diagrams open through the library (openDiagram); a bare request only focuses one that is already open.
    if (toolId === CUSTOM_TOOL_ID) {
      const front = W().windows.filter(w => w.area === area && w.toolId === toolId).sort((a, b) => b.z - a.z)[0];
      if (front && W().activeId !== front.id) W().activate(front.id);
      return;
    }
    const label = tools.find(x => x.id === toolId)?.label ?? registry?.tools.find(x => x.id === toolId)?.label ?? toolId;
    W().openTool(area, toolId, label);
  }, [request, toolId, area, loading, tools, registry, windowsDataset, datasetId, W]);

  // The active window always belongs to this area; when switching areas, the front window of the area takes over.
  useEffect(() => {
    const s = useGeoWindows.getState(), act = s.windows.find(w => w.id === s.activeId);
    if (act?.area === area) return;
    const front = s.windows.filter(w => w.area === area).sort((a, b) => b.z - a.z)[0];
    if (front) s.activate(front.id);
  }, [area, windows.length]);

  // Re-mirror the active window into the Editor after a catalog (re)load or when the Editor shows another tool.
  useEffect(() => {
    const s = useGeoWindows.getState(), act = s.windows.find(w => w.id === s.activeId);
    if (!act || loading) return;
    if (!act.config || editorTool !== act.toolId || editorBoundTo() !== act.id) bindEditor(act);
  }, [activeId, loading, editorTool, tools]);

  // The ribbon highlights the tool of the active window.
  useEffect(() => {
    const s = useGeoWindows.getState(), act = s.windows.find(w => w.id === s.activeId);
    const view = useShellStore.getState().views[area];
    if (act && act.area === area && (view.kind !== 'tool' || view.toolId !== act.toolId)) useShellStore.getState().openView({ kind: 'tool', toolId: act.toolId }, area);
  }, [activeId, windows, area]);

  return <div ref={ref} className="px-canvas relative min-h-0 min-w-0 flex-1 overflow-hidden" aria-label={t('canvas')}>
    {mine.length === 0 && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
      <PxIcon name="dock" className="h-9 w-9 text-subtle" />
      <p className="text-[14px] font-semibold text-fg">{t('canvasEmpty')}</p>
      <p className="max-w-sm text-[12px] text-muted">{t('canvasHint')}</p>
    </div>}
    {mine.map(w => {
      const tool = registry?.tools.find(x => x.id === w.toolId);
      const title = tool && w.toolId !== CUSTOM_TOOL_ID ? L(toolLabel(tool)) + (w.title.match(/ \(\d+\)$/)?.[0] ?? '') : w.title;
      return <FloatingWindow key={w.id} title={title} icon={tool ? iconForTool(tool) : 'scatter'}
        x={w.x} y={w.y} width={w.w} height={w.h} zIndex={w.z} minimized={w.minimized} active={w.id === activeId && w.z === topZ}
        onFocus={() => W().activate(w.id)} onClose={() => W().close(w.id)} onMinimizeToggle={() => W().toggleMinimize(w.id)}
        onDragStop={(x, y) => W().patch(w.id, { x, y })} onResizeStop={(width, height, x, y) => W().patch(w.id, { w: width, h: height, x, y })}>
        <GeoChartWindow win={w} active={w.id === activeId} />
      </FloatingWindow>;
    })}
  </div>;
}
