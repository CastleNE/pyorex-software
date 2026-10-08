/**
 * Geoquímica ribbon: one tab per area (Data & Analysis · Lithogeochemistry · Mineral Exploration · Sections & Maps)
 * plus the contextual "Herramienta" tab while a registry tool is open. Area content comes from the canonical Tool
 * Registry through `ribbonFor` (lib/geochem-areas.ts) — no tool is hardcoded here and only existing tools appear.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import PxIcon, { type PxIconName } from '../PxIcon';
import { useShellStore } from '../../stores/shell-store';
import { useGeoRegistryStore } from '../../stores/geochemistry-registry-store';
import { useGeochemistryStore } from '../../stores/geochemistry-store';
import { useDatasetStore } from '../../stores/dataset-store';
import { AREAS, WORKBENCH_GROUP, inputsCovered, ribbonFor, type AreaId, type GeoView, type RibbonItem } from '../../lib/geochem-areas';
import { DIAGRAM_AREAS } from '../../lib/custom-diagrams';
import { useDiagramLibrary } from '../../stores/diagram-library-store';
import DiagramDialogs, { openLibraryDiagram } from './DiagramDialogs';
import { anyColumnMatches } from '../../lib/semantic-roles';
import { useDatasetRoles } from '../../stores/column-roles-store';
import { useL, useT, type TKey } from '../../lib/i18n';
import { toolLabel } from '../../lib/tool-labels';
import { openSessionFile, saveSessionFile } from './SessionControls';
import { useGeoWindows, type DragMode } from '../../stores/geo-windows-store';
import { LAYER_KEYS, supportsLayers, supportsSelection, type LayerKey } from '../../lib/chart-layers';

const sameView = (a: GeoView, b: GeoView) =>
  a.kind === b.kind && (a.kind === 'tool' ? a.toolId === (b as typeof a).toolId : a.kind === 'data' ? a.action === (b as typeof a).action
    : a.kind === 'map' ? a.mode === (b as typeof a).mode : a.tool === (b as typeof a).tool);

function Group({ name, children }: { name: string; children: ReactNode }) {
  return <div className="flex shrink-0 flex-col border-r border-line px-1.5 last:border-r-0">
    <div className="flex flex-1 items-start gap-0.5">{children}</div>
    <div className="truncate pb-1 text-center text-[10.5px] text-subtle">{name}</div>
  </div>;
}
type Btn = { icon: PxIconName; label: string; onClick: () => void; pressed?: boolean; title?: string; dot?: boolean; disabled?: boolean };
function Big({ icon, label, onClick, pressed, title, dot, disabled }: Btn) {
  return <button onClick={onClick} aria-pressed={pressed} title={title ?? label} disabled={disabled}
    className={`relative flex w-[78px] flex-col items-center gap-1 rounded px-1 pb-1 pt-1.5 text-center text-[11px] leading-[13px] text-fg transition-colors hover:bg-hover disabled:opacity-40 ${pressed ? 'bg-accent-soft shadow-[inset_0_-2px_0_var(--color-accent)]' : ''}`}>
    <PxIcon name={icon} className={`h-6 w-6 shrink-0 ${pressed ? 'text-accent-fg' : 'text-muted'}`} />
    <span className="line-clamp-2 break-words">{label}</span>
    {dot && <i aria-hidden className="absolute right-1.5 top-1 h-[7px] w-[7px] rounded-full bg-subtle ring-2 ring-raised" />}
  </button>;
}
function Small({ icon, label, onClick, pressed, title, dot, disabled }: Btn) {
  return <button onClick={onClick} aria-pressed={pressed} title={title ?? label} disabled={disabled}
    className={`relative flex h-[22px] max-w-[190px] items-center gap-1.5 rounded px-1.5 pr-3 text-left text-[11.5px] text-fg transition-colors hover:bg-hover disabled:opacity-40 ${pressed ? 'bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]' : ''}`}>
    <PxIcon name={icon} className={`h-[15px] w-[15px] shrink-0 ${pressed ? 'text-accent-fg' : 'text-muted'}`} />
    <span className="truncate">{label}</span>
    {dot && <i aria-hidden className="absolute right-1 top-1 h-[6px] w-[6px] rounded-full bg-subtle" />}
  </button>;
}

export default function GeoRibbon() {
  const t = useT(), L = useL();
  const area = useShellStore(s => s.area), view = useShellStore(s => s.views[s.area]), tab = useShellStore(s => s.ribbonTab);
  const { setArea, openView, setRibbonTab } = useShellStore.getState();
  const registry = useGeoRegistryStore(s => s.registry), registryError = useGeoRegistryStore(s => s.error);
  useEffect(() => { void useGeoRegistryStore.getState().load(); }, []);
  const dataset = useDatasetStore(s => s.dataset);
  const roles = useDatasetRoles(dataset?.id);
  const toolOpen = view.kind === 'tool';
  const hasWindow = useGeoWindows(s => s.windows.some(w => w.id === s.activeId && w.area === area));
  const shown = toolOpen && tab === 'tool' ? 'tool' : toolOpen && hasWindow && tab === 'style' ? 'style' : 'area';

  const button = (item: RibbonItem, big: boolean) => {
    const v: GeoView = item.kind === 'tool' ? { kind: 'tool', toolId: item.toolId } : item.view;
    const label = L(item.label);
    const cov = item.kind === 'tool' && roles ? inputsCovered(item.tool, (r, a) => anyColumnMatches(roles, { allowed_roles: r, allowed_analytes: a })) : null;
    const title = cov && !cov.ok ? `${label} · ${t('missingColumns')}: ${cov.missing.join(', ')}` : cov ? `${label} · ${t('available')}` : label;
    const props = { icon: item.icon, label, title, dot: !!cov && !cov.ok, pressed: sameView(view, v), onClick: () => openView(v) };
    return big ? <Big key={item.key} {...props} /> : <Small key={item.key} {...props} />;
  };

  let body: ReactNode;
  if (shown === 'tool') body = <ToolTab />;
  else if (shown === 'style') body = <StyleTab />;
  else if (!registry && !registryError) body = <p role="status" className="m-auto flex items-center gap-2 text-xs text-muted"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />{t('serviceUnknown')}</p>;
  else body = ribbonFor(area, registry).map(g => {
    // Up to three items: large buttons. More: columns of three compact buttons (Office-style stacks).
    const items = g.items;
    const content = items.length <= 3 ? items.map(i => button(i, true)) : Array.from({ length: Math.ceil(items.length / 3) }, (_, k) =>
      <div key={k} className="flex flex-col gap-px pt-0.5">{items.slice(k * 3, k * 3 + 3).map(i => button(i, false))}</div>);
    return <Group key={g.def.id} name={L(g.def.name)}>{content}</Group>;
  }).concat(DIAGRAM_AREAS.includes(area) ? [<MyDiagramsGroup key="my-diagrams" area={area} />] : []);

  return <div className="shrink-0 border-b border-line">
    <div className="flex h-[30px] items-stretch gap-0.5 border-b border-line bg-panel px-2.5" role="tablist" aria-label={t('geochemistry')}>
      {AREAS.map(a => {
        const sel = shown === 'area' && area === a;
        return <button key={a} role="tab" aria-selected={sel} onClick={() => setArea(a)}
          className={`relative whitespace-nowrap px-3 text-[12.5px] transition-colors ${sel ? 'bg-raised font-semibold text-fg shadow-[inset_1px_0_0_var(--color-line),inset_-1px_0_0_var(--color-line)]' : 'font-medium text-muted hover:text-fg'}`}>
          {sel && <span className="absolute inset-x-0 top-0 h-[2px] bg-accent" />}
          {sel && <span className="absolute inset-x-0 -bottom-px h-px bg-raised" />}
          {t(`area.${a}` as TKey)}
        </button>;
      })}
      {toolOpen && <>
        <span className="mx-1.5 my-[7px] w-px bg-line" />
        <CtxTab on={shown === 'tool'} onClick={() => setRibbonTab('tool')}>{t('ctx.tool')}</CtxTab>
        {hasWindow && <CtxTab on={shown === 'style'} onClick={() => setRibbonTab('style')}>{t('ctx.style')}</CtxTab>}
      </>}
      <span className="flex-1" />
      {shown === 'area' && roles && <span className="flex items-center gap-1.5 text-[11px] text-subtle"><i className="h-[7px] w-[7px] rounded-full bg-subtle" />{t('noCompatible')}</span>}
    </div>
    <div className="flex h-[88px] items-stretch overflow-x-auto bg-raised px-2 pt-1">{body}</div>
    <DiagramDialogs />
  </div>;
}

/** "Mis diagramas" in each area: new diagram, the user's diagrams placed in this area, and the whole library. */
function MyDiagramsGroup({ area }: { area: AreaId }) {
  const t = useT();
  const diagrams = useDiagramLibrary(s => s.diagrams).filter(d => d.area === area);
  const activeDiagram = useGeoWindows(s => s.windows.find(w => w.id === s.activeId && w.area === area)?.config?.diagram?.id ?? null);
  const dataset = useDatasetStore(s => s.dataset);
  const lib = useDiagramLibrary.getState();
  const shown = diagrams.slice(0, 5);
  const smalls = [
    ...shown.map(d => <Small key={d.spec.id} icon={d.spec.kind === 'ternary' ? 'ternary' : 'scatter'} label={d.spec.name} pressed={activeDiagram === d.spec.id}
      disabled={!dataset} title={`${d.spec.name}${d.folder ? ` · ${d.folder}` : ''}`} onClick={() => openLibraryDiagram(d)} />),
    <Small key="library" icon="library" label={t('dg.libraryShort')} onClick={() => lib.openLibrary()} />,
  ];
  return <Group name={t('dg.group')}>
    <Big icon="plus" label={t('dg.newShort')} onClick={() => lib.openBuilder(area)} />
    {Array.from({ length: Math.ceil(smalls.length / 3) }, (_, k) => <div key={k} className="flex flex-col gap-px pt-0.5">{smalls.slice(k * 3, k * 3 + 3)}</div>)}
  </Group>;
}

/** Contextual tab for the open registry tool: compute, reset, editor, session and the tool's reference. */
function ToolTab() {
  const t = useT(), L = useL();
  const area = useShellStore(s => s.area), editorOpen = useShellStore(s => s.editorOpen), refOpen = useShellStore(s => s.refOpen);
  const { setEditorOpen, setRefOpen } = useShellStore.getState();
  const dataset = useDatasetStore(s => s.dataset);
  const running = useGeochemistryStore(s => s.running), loading = useGeochemistryStore(s => s.loading), config = useGeochemistryStore(s => s.config);
  const tool = useGeochemistryStore(s => s.tools.find(x => x.id === s.selectedTool));
  const [notice, setNotice] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const geo = () => useGeochemistryStore.getState();
  const drawing = useDiagramLibrary(s => s.drawing), activeWindow = useGeoWindows(s => s.activeId);
  return <>
    <Group name={t('run')}>
      <Big icon="play" label={running ? '…' : t('run')} disabled={!config || loading || running} onClick={() => void geo().run()} />
      <div className="flex flex-col gap-px pt-0.5">
        <Small icon="close" label={t('reset')} disabled={!config} onClick={() => geo().resetWorkspace()} />
        <Small icon="history" label={t('refreshColumns')} disabled={!dataset || loading} onClick={() => dataset && void geo().load(dataset.id, WORKBENCH_GROUP[area])} />
      </div>
    </Group>
    <Group name={t('rail.editor')}>
      <Big icon="sliders" label={t('rail.editor')} pressed={editorOpen} onClick={() => setEditorOpen(!editorOpen)} />
    </Group>
    {config?.diagram && <Group name={t('dg.group')}>
      <Big icon="lasso" label={t('dg.draw')} pressed={!!activeWindow && drawing === activeWindow} disabled={!activeWindow}
        onClick={() => useDiagramLibrary.getState().setDrawing(drawing === activeWindow ? null : activeWindow)} />
      <Big icon="code" label={t('dg.editDiagram')} onClick={() => {
        const d = config.diagram!, saved = useDiagramLibrary.getState().diagrams.find(x => x.spec.id === d.id);
        useDiagramLibrary.getState().openBuilder(area, saved ?? { spec: d, area: DIAGRAM_AREAS.includes(area) ? area : 'litho', folder: '', logX: config.log_x, logY: config.log_y, updated: '' });
      }} />
    </Group>}
    <Group name={t('session')}>
      <div className="flex flex-col gap-px pt-0.5">
        <Small icon="export" label={t('saveSession')} disabled={!config} onClick={() => void saveSessionFile().then(n => n && setNotice(n.text))} />
        <Small icon="import" label={t('openSession')} disabled={!config} onClick={() => file.current?.click()} />
        <input ref={file} type="file" accept=".json,application/json" className="hidden" aria-label={t('openSession')}
          onChange={e => { const f = e.target.files?.[0]; if (f) void openSessionFile(f).then(err => setNotice(err)); e.target.value = ''; }} />
      </div>
    </Group>
    <Group name={t('reference')}>
      <div className="relative">
        <Big icon="library" label={t('reference')} pressed={refOpen} disabled={!tool || (!tool.formula && !tool.reference)} onClick={() => setRefOpen(!refOpen)} />
        {refOpen && tool && <div role="dialog" aria-label={t('reference')} className="fixed z-50 mt-1 w-[380px] rounded-md border border-line-strong bg-panel p-3 shadow-xl">
          <div className="mb-2 flex items-center gap-2"><PxIcon name="library" className="h-4 w-4 text-accent-fg" /><b className="flex-1 truncate text-[12.5px] text-fg">{L(toolLabel(tool))}</b>
            <button onClick={() => setRefOpen(false)} aria-label={t('close')} className="rounded p-0.5 text-muted hover:bg-hover"><PxIcon name="close" className="h-3.5 w-3.5" /></button></div>
          {tool.formula && <><p className="text-[10.5px] font-semibold uppercase tracking-wide text-subtle">{t('formula')}</p><p className="mb-2 select-text font-mono text-[12px] leading-relaxed text-fg">{tool.formula}</p></>}
          {tool.reference && <><p className="text-[10.5px] font-semibold uppercase tracking-wide text-subtle">{t('reference')}</p><p className="select-text text-[12px] leading-relaxed text-muted">{tool.reference}</p></>}
        </div>}
      </div>
    </Group>
    {notice && <p role="status" className="m-auto max-w-sm select-text px-3 text-xs text-muted">{notice}</p>}
  </>;
}

function CtxTab({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button role="tab" aria-selected={on} onClick={onClick}
    className={`relative mt-1 whitespace-nowrap rounded-t-md px-3 text-[12.5px] font-medium ${on ? 'bg-raised font-semibold text-fg' : 'bg-accent-soft/40 text-accent-fg hover:text-fg'}`}>
    {on && <span className="absolute inset-x-0 -bottom-px h-px bg-raised" />}
    {children}
  </button>;
}

const LAYER_ICON: Record<LayerKey, PxIconName> = { density: 'density', ellipses: 'ellipse', hulls: 'hull', regression: 'regression', marginals: 'marginal' };
const MODES: { id: DragMode; icon: PxIconName }[] = [{ id: 'lasso', icon: 'lasso' }, { id: 'select', icon: 'box' }, { id: 'zoom', icon: 'zoom' }];

/** Contextual tab for the active chart window: visual layers, labels, linked selection, classes and window layout. */
function StyleTab() {
  const t = useT();
  const area = useShellStore(s => s.area);
  const win = useGeoWindows(s => s.windows.find(w => w.id === s.activeId));
  const selection = useGeoWindows(s => s.selection), isolate = useGeoWindows(s => s.isolate), dragmode = useGeoWindows(s => s.dragmode);
  const classes = useGeoWindows(s => s.classes), byClass = useGeoWindows(s => s.colorByClass);
  const showLabels = useGeochemistryStore(s => s.showLabels);
  const sizeMode = useGeochemistryStore(s => s.presentation.sizeMode);
  const colorColumn = useGeochemistryStore(s => s.config?.color_column ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const W = useGeoWindows.getState();
  if (!win) return null;
  const kind = win.result?.plot.kind;
  const layersOK = !!kind && supportsLayers(kind), selectOK = !!kind && supportsSelection(kind);
  const layerTitle = (k: LayerKey) => (!kind ? t('needResult') : layersOK ? t(`layer.${k}` as TKey) : `${t(`layer.${k}` as TKey)} · ${t('layerNA')}`);
  const layer = (k: LayerKey, big: boolean) => {
    const props = { icon: LAYER_ICON[k], label: t(`layer.${k}` as TKey), title: layerTitle(k), pressed: win.layers[k], disabled: !layersOK, onClick: () => W.toggleLayer(win.id, k) };
    return big ? <Big key={k} {...props} /> : <Small key={k} {...props} />;
  };
  const needSel = (fn: () => void) => () => { if (!selection.size) { setNotice(t('needSelection')); return; } setNotice(null); fn(); };
  return <>
    <Group name={t('grp.layers')}>
      {layer('ellipses', true)}{layer('regression', true)}
      <div className="flex flex-col gap-px pt-0.5">{LAYER_KEYS.filter(k => k !== 'ellipses' && k !== 'regression').map(k => layer(k, false))}</div>
    </Group>
    <Group name={t('grp.sizeColor')}>
      <Big icon="marginal" label={t('sz.byClasses')} pressed={sizeMode === 'classes'} disabled={!kind || kind === 'histogram' || kind === 'box'} title={!kind ? t('needResult') : t('sz.byClasses')} onClick={() => {
        const g = useGeochemistryStore.getState(), on = g.presentation.sizeMode === 'classes';
        if (!on) useGeochemistryStore.setState({ presentation: { ...g.presentation, sizeMode: 'classes', ...(g.config?.size_column ? { sizeSource: 'column' as const } : {}) } });
        useShellStore.getState().setFly('style');   // the size classes are edited in the Estilo panel
      }} />
      <Big icon="palette" label={t('cl.byValue')} pressed={!!colorColumn} disabled={!kind || kind === 'histogram' || kind === 'box'} title={!kind ? t('needResult') : t('cl.byValue')} onClick={() => useShellStore.getState().setFly('style')} />
    </Group>
    <Group name={t('grp.labels')}>
      <div className="flex flex-col gap-px pt-0.5">
        <Small icon="label" label={t('labels')} pressed={showLabels} onClick={() => useGeochemistryStore.setState({ showLabels: !showLabels })} />
        <Small icon="legend" label={t('legend')} pressed={win.layers.legend} onClick={() => W.toggleLayer(win.id, 'legend')} />
      </div>
    </Group>
    <Group name={t('grp.selection')}>
      <div className="flex flex-col gap-px pt-0.5">{MODES.map(m => <Small key={m.id} icon={m.icon} label={t(`mode.${m.id}` as TKey)} pressed={dragmode === m.id} disabled={!selectOK && m.id !== 'zoom'} onClick={() => W.setDragmode(m.id)} />)}</div>
      <div className="flex flex-col gap-px pt-0.5">
        <Small icon="filter" label={isolate ? t('showAll') : t('isolate')} pressed={isolate} onClick={needSel(() => W.setIsolate(!isolate))} title={selection.size ? undefined : t('needSelection')} />
        <Small icon="close" label={`${t('clearSel')}${selection.size ? ` (${selection.size})` : ''}`} disabled={!selection.size} onClick={() => W.clearSelection()} />
        <Small icon="classify" label={t('byClass')} pressed={byClass} disabled={!classes.length} onClick={() => W.setColorByClass(!byClass)} title={classes.length ? undefined : t('noClasses')} />
      </div>
      <Big icon="plus" label={t('createClass')} onClick={needSel(() => { const c = W.createClass(); if (c) { setNotice(`${c.name} · ${c.rows.length} ${t('samples')}`); useShellStore.getState().setFly('project'); } })} title={selection.size ? undefined : t('needSelection')} />
    </Group>
    <Group name={t('grp.windows')}>
      <div className="flex flex-col gap-px pt-0.5">
        <Small icon="tile" label={t('tile')} onClick={() => W.tile(area)} />
        <Small icon="cascade" label={t('cascade')} onClick={() => W.cascade(area)} />
        <Small icon="copy" label={t('duplicate')} onClick={() => W.duplicate(win.id)} />
      </div>
      <div className="flex flex-col gap-px pt-0.5"><Small icon="close" label={t('closeAll')} onClick={() => W.closeArea(area)} /></div>
    </Group>
    {notice && <p role="status" className="m-auto max-w-xs select-text px-3 text-xs text-muted">{notice}</p>}
  </>;
}
