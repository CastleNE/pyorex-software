/**
 * Contextual side panels of Geoquímica: a narrow rail (Proyecto · Editor · Historial) and the flyout it opens.
 * Flyouts float over the workspace and close on demand; pinning docks them beside it. Nothing here is permanent.
 */
import PxIcon, { type PxIconName } from '../PxIcon';
import AnalysisHistoryPanel from '../AnalysisHistoryPanel';
import { useShellStore, type Fly } from '../../stores/shell-store';
import { useDatasetStore } from '../../stores/dataset-store';
import { useGeoRegistryStore } from '../../stores/geochemistry-registry-store';
import { areaOfTool, groupOf, VIEW_ITEMS } from '../../lib/geochem-areas';
import { usePlanAllows } from '../../stores/plan-store';
import { useL, useT } from '../../lib/i18n';
import { toolLabel } from '../../lib/tool-labels';
import { useState } from 'react';
import { useGeoWindows } from '../../stores/geo-windows-store';
import { useProject } from '../../stores/project-store';
import { CoordinatesSection, VariablesSection } from './VariablesPanel';
import SizeClassControls from './SizeClassControls';
import ClassControls from './ClassControls';
import { useGeochemistryStore } from '../../stores/geochemistry-store';

function RailButton({ icon, label, on, disabled, onClick }: { icon: PxIconName; label: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return <button onClick={onClick} aria-pressed={on} disabled={disabled} title={label}
    className={`flex w-full flex-col items-center gap-0.5 rounded px-0.5 pb-1 pt-1.5 text-[9.5px] leading-[11px] transition-colors disabled:opacity-35 ${on ? 'bg-accent-soft text-fg shadow-[inset_2px_0_0_var(--color-accent)]' : 'text-muted hover:bg-hover hover:text-fg'}`}>
    <PxIcon name={icon} className={`h-[18px] w-[18px] ${on ? 'text-accent-fg' : ''}`} />{label}
  </button>;
}

export function GeoRail() {
  const t = useT();
  const fly = useShellStore(s => s.fly), editorOpen = useShellStore(s => s.editorOpen), toolOpen = useShellStore(s => s.views[s.area].kind === 'tool');
  const { setFly, setEditorOpen } = useShellStore.getState();
  const toggle = (f: Exclude<Fly, null>) => setFly(fly === f ? null : f);
  return <nav aria-label={t('geochemistry')} className="z-20 flex w-[58px] shrink-0 flex-col gap-0.5 border-r border-line bg-panel px-1 py-1.5">
    <RailButton icon="project" label={t('rail.project')} on={fly === 'project'} onClick={() => toggle('project')} />
    <RailButton icon="sliders" label={t('rail.editor')} on={toolOpen && editorOpen} disabled={!toolOpen} onClick={() => setEditorOpen(!editorOpen)} />
    <RailButton icon="legend" label={t('rail.style')} on={fly === 'style'} disabled={!toolOpen} onClick={() => toggle('style')} />
    <RailButton icon="history" label={t('rail.history')} on={fly === 'history'} onClick={() => toggle('history')} />
  </nav>;
}

export function GeoFlyout({ onOpenData, docked }: { onOpenData: () => void; docked: boolean }) {
  const t = useT();
  const fly = useShellStore(s => s.fly), pinned = useShellStore(s => s.flyPin);
  const { setFly, toggleFlyPin, openView } = useShellStore.getState();
  const registry = useGeoRegistryStore(s => s.registry);
  if (!fly) return null;
  const reopen = (id: string) => {
    const view = VIEW_ITEMS.find(v => v.id === id);
    if (view) { openView(view.view, groupOf(view.group)?.area ?? 'data'); return; }
    const tool = registry?.tools.find(x => x.id === id); const area = tool && areaOfTool(tool);
    if (tool && area) openView({ kind: 'tool', toolId: tool.id }, area);
  };
  const titleKey = fly === 'project' ? 'rail.project' : fly === 'style' ? 'rail.style' : 'rail.history';
  return <aside aria-label={t(titleKey)}
    className={`flex w-[330px] shrink-0 flex-col bg-panel ${docked ? 'relative border-r border-line' : 'absolute inset-y-0 left-0 z-30 border-r border-line-strong shadow-2xl'}`}>
    <header className="flex h-[34px] shrink-0 items-center gap-2 border-b border-line pl-3 pr-1.5">
      <PxIcon name={fly === 'project' ? 'project' : fly === 'style' ? 'legend' : 'history'} className="h-4 w-4 text-accent-fg" />
      <b className="flex-1 text-[12.5px] text-fg">{t(titleKey)}</b>
      <button onClick={toggleFlyPin} aria-pressed={pinned} title={pinned ? t('unpin') : t('pin')} aria-label={pinned ? t('unpin') : t('pin')}
        className={`rounded p-1 ${pinned ? 'bg-accent-soft text-accent-fg' : 'text-muted hover:bg-hover'}`}><PxIcon name="dock" className="h-4 w-4" /></button>
      <button onClick={() => setFly(null)} title={t('close')} aria-label={t('close')} className="rounded p-1 text-muted hover:bg-hover"><PxIcon name="close" className="h-4 w-4" /></button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {fly === 'project' ? <ProjectPanel onOpenData={onOpenData} /> : fly === 'style' ? <StylePanel /> : <AnalysisHistoryPanel onReopenTool={reopen} />}
    </div>
  </aside>;
}

function ProjectPanel({ onOpenData }: { onOpenData: () => void }) {
  const t = useT();
  const dataset = useDatasetStore(s => s.dataset), all = useDatasetStore(s => s.allDatasets), setActive = useDatasetStore(s => s.setActiveDataset);
  const name = useProject(s => s.name), path = useProject(s => s.path), dirty = useProject(s => s.dirty), members = useProject(s => s.datasetIds), busy = useProject(s => s.busy);
  const P = useProject.getState;
  const projects = usePlanAllows('feature', 'projects');
  const heading = 'mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-subtle';
  return <div className="space-y-4 p-3 text-xs">
    <section>
      <h3 className={heading}>{t('project')}</h3>
      <div className="flex items-center gap-2">
        <PxIcon name="project" className="h-4 w-4 shrink-0 text-accent-fg" />
        <b className="min-w-0 flex-1 truncate text-[12.5px] text-fg" title={path ?? undefined}>{name ? `${name}.orex` : t('untitled')}</b>
        <span className={`shrink-0 text-[11px] ${dirty ? 'text-warning' : 'text-subtle'}`}>{dirty ? t('unsaved') : name ? t('savedState') : ''}</span>
      </div>
      {path && <p className="mt-0.5 truncate font-mono text-[10.5px] text-subtle" title={path}>{path}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button disabled={!!busy || !projects} title={projects ? undefined : t('planNoProjects')} onClick={() => void P().save()} className="flex h-7 items-center gap-1.5 rounded bg-accent-strong px-2.5 text-xs font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"><PxIcon name="export" className="h-3.5 w-3.5" />{t('save')}</button>
        <button disabled={!!busy || !projects} title={projects ? undefined : t('planNoProjects')} onClick={() => void P().open()} className="flex h-7 items-center gap-1.5 rounded border border-line-strong bg-raised px-2.5 text-xs text-fg hover:bg-hover disabled:opacity-50"><PxIcon name="project" className="h-3.5 w-3.5 text-muted" />{t('openProject')}</button>
      </div>
    </section>
    <section>
      <h3 className={heading}>{t('datasets')}</h3>
      {all.length === 0 ? <p className="text-muted">{t('noDataset')}</p> :
        <ul className="space-y-0.5">{all.map(d => {
          const on = d.id === dataset?.id, member = members.includes(d.id);
          return <li key={d.id} className={`flex items-center gap-1.5 rounded pl-1 ${on ? 'bg-accent-soft' : 'hover:bg-hover'}`}>
            <input type="checkbox" checked={member} onChange={e => (e.target.checked ? P().include(d.id) : P().exclude(d.id))} aria-label={member ? t('inProject') : t('notInProject')} title={member ? t('inProject') : t('notInProject')} />
            <button onClick={() => setActive(d.id)} aria-current={on || undefined} className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left ${on ? 'text-fg' : 'text-muted hover:text-fg'}`}>
              <PxIcon name="table" className={`h-4 w-4 shrink-0 ${on ? 'text-accent-fg' : ''}`} />
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <span className="tabular shrink-0 font-mono text-[10.5px] text-subtle">{d.rowCount.toLocaleString()}×{d.columnCount}</span>
            </button>
          </li>;
        })}</ul>}
      {all.length > 0 && <p className="mt-1 text-[10.5px] text-subtle">{t('datasetsHint')}</p>}
      <button onClick={onOpenData} className="mt-2 flex h-7 items-center gap-1.5 rounded border border-line-strong bg-raised px-2.5 text-xs text-fg hover:bg-hover">
        <PxIcon name="import" className="h-4 w-4 text-muted" />{t('importData')}
      </button>
    </section>
    {dataset && <ClassesPanel />}
    {dataset && <VariablesSection />}
    {dataset && <CoordinatesSection />}
  </div>;
}

/** User classes (named sets of samples) shared by every window of the dataset. */
function ClassesPanel() {
  const t = useT();
  const classes = useGeoWindows(s => s.classes), selection = useGeoWindows(s => s.selection), byClass = useGeoWindows(s => s.colorByClass);
  const W = useGeoWindows.getState();
  const [editing, setEditing] = useState<string | null>(null);
  return <section>
    <div className="mb-1.5 flex items-center gap-2">
      <h3 className="flex-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-subtle">{t('classes')}</h3>
      {classes.length > 0 && <label className="flex items-center gap-1 text-[11px] text-muted"><input type="checkbox" checked={byClass} onChange={e => W.setColorByClass(e.target.checked)} />{t('byClass')}</label>}
    </div>
    {classes.length === 0 ? <p className="text-[11.5px] leading-relaxed text-muted">{t('noClasses')}</p> :
      <ul className="space-y-0.5">{classes.map(c => <li key={c.id} className="group flex items-center gap-2 rounded px-1.5 py-1 hover:bg-hover">
        <i className="h-3 w-3 shrink-0 rounded-sm" style={{ background: c.color }} />
        {editing === c.id
          ? <input autoFocus defaultValue={c.name} aria-label={t('rename')} className="h-6 min-w-0 flex-1 rounded border border-line-strong bg-raised px-1.5 text-xs text-fg"
              onBlur={e => { W.renameClass(c.id, e.target.value); setEditing(null); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }} />
          : <button onDoubleClick={() => setEditing(c.id)} onClick={() => W.selectClass(c.id)} title={`${t('selectRows')} · ${t('rename')}: doble clic`} className="min-w-0 flex-1 truncate text-left text-fg">{c.name}</button>}
        <span className="tabular shrink-0 font-mono text-[11px] text-subtle">{c.rows.length}</span>
        <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button onClick={() => W.assignToClass(c.id)} disabled={!selection.size} title={t('addSelection')} aria-label={t('addSelection')} className="rounded p-0.5 text-muted hover:text-fg disabled:opacity-30"><PxIcon name="plus" className="h-3.5 w-3.5" /></button>
          <button onClick={() => setEditing(c.id)} title={t('rename')} aria-label={t('rename')} className="rounded p-0.5 text-muted hover:text-fg"><PxIcon name="label" className="h-3.5 w-3.5" /></button>
          <button onClick={() => W.deleteClass(c.id)} title={t('remove')} aria-label={t('remove')} className="rounded p-0.5 text-muted hover:text-danger"><PxIcon name="close" className="h-3.5 w-3.5" /></button>
        </span>
      </li>)}</ul>}
  </section>;
}

/** Estilo: symbol size of the active chart window — fixed, or graduated by classes with the user's own limits. */
function StylePanel() {
  const t = useT();
  const L = useL();
  const mode = useGeochemistryStore(s => s.presentation.sizeMode), tool = useGeochemistryStore(s => s.tools.find(x => x.id === s.selectedTool));
  const hasWindow = useGeoWindows(s => !!s.windows.find(w => w.id === s.activeId));
  const set = (classes: boolean) => {
    const g = useGeochemistryStore.getState();
    useGeochemistryStore.setState({ presentation: { ...g.presentation, sizeMode: classes ? 'classes' : 'constant', ...(classes && g.config?.size_column ? { sizeSource: 'column' as const } : {}) } });
  };
  if (!hasWindow) return <p className="p-3 text-xs text-muted">{t('needResult')}</p>;
  return <div className="space-y-3 p-3 text-xs text-muted">
    <div className="flex items-center gap-2"><PxIcon name="scatter" className="h-4 w-4 text-accent-fg" /><b className="min-w-0 flex-1 truncate text-[12.5px] text-fg">{tool ? L(toolLabel(tool)) : ''}</b></div>
    <section>
      <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-subtle">{t('sz.sizeBy')}</h3>
      <div className="flex rounded bg-sunken p-0.5" role="group" aria-label={t('sz.sizeBy')}>
        {([false, true] as const).map(c => <button key={String(c)} onClick={() => set(c)} aria-pressed={(mode === 'classes') === c}
          className={`h-7 flex-1 rounded text-xs font-medium ${(mode === 'classes') === c ? 'bg-raised text-fg shadow-window' : 'text-muted hover:text-fg'}`}>{t(c ? 'sz.byClassesShort' : 'sz.fixed')}</button>)}
      </div>
      {mode !== 'classes' && mode !== 'constant' && <p className="mt-1.5 text-subtle">{t('sz.otherMode')}</p>}
    </section>
    {mode === 'classes' && <SizeClassControls compact />}
    <section className="border-t border-line pt-3">
      <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-subtle">{t('cl.byValue')}</h3>
      <ClassControls kind="color" compact />
    </section>
  </div>;
}
