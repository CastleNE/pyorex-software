/**
 * Body of one Geoquímica floating window: the computed result as a chart (with linked selection and visual layers)
 * or as a table. Presentation only — results, tables and exports always contain every row the engine returned.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { PlotMouseEvent, PlotSelectionEvent } from 'plotly.js';
import Plot from '@/components/ThemedPlot';
import PxIcon from '../PxIcon';
import ChartControls from './ChartControls';
import { ColorLegend, SizeLegend, printable } from './Results';
import { buildGeoChart } from '../../lib/build-geo-chart';
import { decorateChart, prepareResult, supportsSelection } from '../../lib/chart-layers';
import { downloadResult } from '../../lib/geochemistry-api';
import { dataUrlToBytes, extensionFor, runSave, saveFile, type SaveNotice } from '../../lib/save-file';
import { useGeochemistryStore } from '../../stores/geochemistry-store';
import { useGeoWindows, type GeoWindow } from '../../stores/geo-windows-store';
import { useLangStore, useT } from '../../lib/i18n';
import { toolLabel } from '../../lib/tool-labels';
import { useDiagramLibrary } from '../../stores/diagram-library-store';
import { CUSTOM_TOOL_ID, DIAGRAM_AREAS, newDiagramId, simplifyOutline, ternaryFromCartesian, type DiagramDef } from '../../lib/custom-diagrams';

const accentColor = () => {
  try { return getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#14a39a'; } catch { return '#14a39a'; }
};

export default function GeoChartWindow({ win, active }: { win: GeoWindow; active: boolean }) {
  const t = useT(), lang = useLangStore(s => s.lang);
  const attributes = useGeochemistryStore(s => s.attributes);
  const tool = useGeochemistryStore(s => s.tools.find(x => x.id === win.toolId));
  const selection = useGeoWindows(s => s.selection), isolate = useGeoWindows(s => s.isolate), dragmode = useGeoWindows(s => s.dragmode);
  const classes = useGeoWindows(s => s.classes), byClass = useGeoWindows(s => s.colorByClass);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [onlySel, setOnlySel] = useState(false);
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const chartEl = useRef<HTMLElement | null>(null);
  const result = win.result;
  // Drawing a classification field on a user diagram: the lasso outlines the field instead of selecting samples.
  const drawing = useDiagramLibrary(s => s.drawing) === win.id && !!win.config?.diagram;
  const [pending, setPending] = useState<number[][] | null>(null);
  const [fieldName, setFieldName] = useState('');
  useEffect(() => {
    if (!drawing) { setPending(null); return; }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') useDiagramLibrary.getState().setDrawing(null); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [drawing]);

  const figure = useMemo(() => {
    if (!result) return null;
    const prepared = prepareResult(result, { selection, isolate, classes, byClass, noClassLabel: lang === 'es' ? 'Sin clase' : 'Unclassified' });
    const built = buildGeoChart(prepared.result, { pointSize: win.pointSize, symbol: win.symbol, showLabels: win.showLabels, attributes: { ...attributes, ...prepared.attributes }, presentation: win.presentation });
    const deco = decorateChart(built, { kind: result.plot.kind, selection, layers: win.layers, logX: win.presentation.logX || result.plot.log_x, logY: win.presentation.logY || result.plot.log_y, accent: accentColor(),
      selectedValues: result.plot.kind === 'histogram' && selection.size ? prepared.result.rows.filter(r => r.status === 'valid' && r.x != null && selection.has(r.row_index)).map(r => r.x as number) : undefined, selectionLabel: lang === 'es' ? 'Selección' : 'Selection' });
    const layout = { ...deco.layout, dragmode: drawing ? 'lasso' as const : supportsSelection(result.plot.kind) ? dragmode : 'zoom', // Keep the user's zoom while restyling, but reset it when a new result or axis scale arrives.
      uirevision: `${win.id}:${result.created_at}:${win.presentation.logX}:${win.presentation.logY}`, selectionrevision: selection.size,
      // Windows are small: legend on top so it never collides with the X-axis title.
      legend: { orientation: 'h' as const, x: 0, xanchor: 'left' as const, y: 1.01, yanchor: 'bottom' as const }, margin: { t: 34, r: result.grid ? 90 : 16, b: 52, l: 64 } };
    return { ...deco, layout, displayCount: built.displayCount, colorLegend: built.colorLegend, sizeLegend: built.sizeLegend };
  }, [result, selection, isolate, classes, byClass, lang, win.pointSize, win.symbol, win.showLabels, attributes, win.presentation, win.layers, win.id, dragmode, drawing]);

  if (win.running && !result) return <Center><span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" /><p className="text-sm text-muted">{t('computing')}</p></Center>;
  if (win.error) return <Center><PxIcon name="warn" className="h-7 w-7 text-danger" /><p role="alert" className="max-w-md select-text text-xs text-danger">{win.error}</p></Center>;
  if (!result || !figure) return <Center>
    <PxIcon name={tool?.kind === 'spider' ? 'spider' : 'scatter'} className="h-8 w-8 text-subtle" />
    <h3 className="text-[15px] font-semibold text-fg">{tool && win.toolId !== CUSTOM_TOOL_ID ? toolLabel(tool)[lang] : win.title}</h3>
    {tool?.formula && <p className="max-w-lg select-text font-mono text-[11.5px] leading-relaxed text-muted">{tool.formula}</p>}
    {tool?.reference && <p className="max-w-lg select-text text-[11.5px] text-subtle">{tool.reference}</p>}
    <p className="mt-2 rounded-full bg-accent-soft px-3 py-1 text-[12px] text-accent-fg">{active ? t('pressRun') : t('clickToEdit')}</p>
  </Center>;

  const q = result.quality;
  const selInResult = selection.size ? result.rows.filter(r => selection.has(r.row_index)).length : 0;
  const store = useGeoWindows.getState();
  const onSelected = (ev: Readonly<PlotSelectionEvent> | undefined) => {
    if (drawing) {
      const raw = lassoOutline(ev, result.plot.kind === 'ternary');
      const logX = !!(win.presentation.logX || result.plot.log_x), logY = !!(win.presentation.logY || result.plot.log_y);
      const pts = raw && simplifyOutline(raw, result.plot.kind === 'ternary' ? {} : { logX, logY });
      if (pts && pts.length >= 3) { setPending(pts); setFieldName(n => n || `${t('dg.newFieldName')} ${(win.config?.diagram?.fields.length ?? 0) + 1}`); }
      return;
    }
    const rows = (ev?.points ?? []).map(p => p.customdata).filter((r): r is number => typeof r === 'number');
    if (rows.length) store.select(rows);
  };
  const onClick = (ev: Readonly<PlotMouseEvent>) => {
    const p = ev.points?.[0]; const r = p?.customdata;
    if (typeof r !== 'number') return;
    const e = ev.event as MouseEvent | undefined;
    store.select([r], e?.shiftKey || e?.ctrlKey || e?.metaKey ? 'toggle' : 'replace');
  };
  const exportImage = async (format: 'png' | 'jpeg' | 'svg') => {
    const el = chartEl.current; if (!el) return;
    setNotice(await runSave(async () => saveFile(`pyorex-${result.tool}.${extensionFor(format)}`, dataUrlToBytes(await Plotly.toImage(el, { format, width: 1400, height: 900 })), format === 'svg' ? 'image/svg+xml' : `image/${format}`)));
  };
  const saveField = () => {
    const d = win.config?.diagram, name = fieldName.trim(); if (!d || !pending || !name) return;
    const lib = useDiagramLibrary.getState();
    const def: DiagramDef = lib.diagrams.find(x => x.spec.id === d.id)
      ?? { spec: d, area: DIAGRAM_AREAS.includes(win.area) ? win.area : 'litho', folder: '', logX: !!win.config?.log_x, logY: !!win.config?.log_y, updated: '' };
    const stored = lib.save({ ...def, spec: { ...def.spec, fields: [...def.spec.fields, { id: newDiagramId().slice(-8), name, points: pending }] } });
    useGeoWindows.getState().syncDiagram(stored);
    setPending(null); setFieldName('');
    setNotice({ tone: 'ok', text: t('dg.fieldAdded').replace('{name}', name) });
  };
  const tableRows = onlySel && selection.size ? result.rows.filter(r => selection.has(r.row_index)) : result.rows;
  const pages = Math.max(1, Math.ceil(tableRows.length / 100));

  return <section className="flex h-full min-h-0 flex-col">
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-panel px-2.5 py-1.5 text-[11px]">
      <span className="rounded-full bg-sunken px-2 py-0.5 text-muted">{t('total')} <b className="tabular font-mono font-medium text-fg">{q.total}</b></span>
      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent-fg">{t('valid')} <b className="tabular font-mono font-medium">{q.used}</b></span>
      {q.invalid > 0 && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-warning">{t('invalid')} <b className="tabular font-mono font-medium">{q.invalid}</b></span>}
      {q.excluded_qaqc > 0 && <span className="rounded-full bg-sunken px-2 py-0.5 text-muted">QAQC <b className="tabular font-mono font-medium">{q.excluded_qaqc}</b></span>}
      {selInResult > 0 && <span className="rounded-full border border-accent px-2 py-0.5 text-accent-fg">{selInResult} {t('selected')}{isolate ? ` · ${t('isolated')}` : ''}</span>}
      {result.warnings.length > 0 && <span title={result.warnings.join('\n')} className="flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-warning"><PxIcon name="warn" className="h-3 w-3" />{result.warnings.length}</span>}
      <div className="ml-auto flex items-center gap-1.5">
        <div className="flex rounded bg-sunken p-0.5" role="group" aria-label={t('view')}>{(['chart', 'table'] as const).map(v => <button key={v} onClick={() => setView(v)} aria-pressed={view === v} title={t(v)} className={`flex h-5 items-center gap-1 rounded px-1.5 ${view === v ? 'bg-raised text-fg shadow-window' : 'text-muted hover:text-fg'}`}><PxIcon name={v === 'chart' ? 'scatter' : 'table'} className="h-3.5 w-3.5" />{t(v)}</button>)}</div>
        <details className="relative">
          <summary className="flex h-6 cursor-pointer list-none items-center gap-1 rounded border border-line-strong bg-raised px-2 text-fg hover:bg-hover"><PxIcon name="export" className="h-3.5 w-3.5" />{t('export')}</summary>
          <div className="absolute right-0 z-20 mt-1 flex w-44 flex-col rounded-md border border-line-strong bg-panel p-1 shadow-xl">
            {view === 'chart' && (['png', 'jpeg', 'svg'] as const).map(f => <button key={f} onClick={() => void exportImage(f)} className="rounded px-2 py-1 text-left hover:bg-hover">{t('figure')} {f === 'jpeg' ? 'JPG' : f.toUpperCase()}</button>)}
            <button onClick={() => void runSave(() => downloadResult(result, 'csv')).then(setNotice)} className="rounded px-2 py-1 text-left hover:bg-hover">{t('table')} CSV</button>
            <button onClick={() => void runSave(() => downloadResult(result, 'json')).then(setNotice)} className="rounded px-2 py-1 text-left hover:bg-hover">{t('result')} JSON</button>
          </div>
        </details>
      </div>
    </div>
    {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`shrink-0 select-text px-3 py-1 text-[11px] ${notice.tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>{notice.text}</p>}
    {drawing && view === 'chart' && <div role="status" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-accent bg-accent-soft px-3 py-1.5 text-[11.5px] text-accent-fg">
      <PxIcon name="lasso" className="h-3.5 w-3.5" />
      {!pending ? <span>{t('dg.drawing')}</span> : <>
        <input autoFocus aria-label={t('dg.newFieldName')} value={fieldName} onChange={e => setFieldName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveField(); }}
          className="h-6 w-48 rounded border border-line-strong bg-raised px-2 text-[11.5px] text-fg focus:border-accent focus:outline-none" />
        <span className="text-muted">{t('dg.nVertices').replace('{n}', String(pending.length))}</span>
        <button onClick={saveField} disabled={!fieldName.trim()} className="h-6 rounded bg-accent-strong px-2 font-semibold text-on-accent disabled:opacity-40">{t('dg.addFieldSave')}</button>
        <button onClick={() => setPending(null)} className="h-6 rounded px-2 text-muted hover:text-fg">{t('dg.discard')}</button>
      </>}
    </div>}
    {active && view === 'chart' && <ChartControls />}
    {view === 'chart' && figure.sizeLegend && <SizeLegend legend={figure.sizeLegend} title={t('sz.legend')} noData={t('sz.noData')} />}
    {view === 'chart' && figure.colorLegend && <ColorLegend legend={figure.colorLegend} title={t('cl.legend')} noData={t('sz.noData')} values={result.rows.filter(r => r.status === 'valid').map(r => r.color_value)} />}
    {view === 'chart' && figure.displayCount < q.used && <p role="status" className="shrink-0 border-b border-warning-line bg-warning-soft px-3 py-1 text-[11px] text-warning">{t('limited').replace('{n}', String(figure.displayCount))}</p>}
    {q.used === 0 && <p role="alert" className="p-3 text-xs text-warning">{t('noValid')}</p>}
    {view === 'chart' ? <div className="relative min-h-0 flex-1">
      <Plot onInitialized={(_f, el) => { chartEl.current = el; }} onUpdate={(_f, el) => { chartEl.current = el; }} onPurge={() => { chartEl.current = null; }}
        onSelected={onSelected} onDeselect={() => store.clearSelection()} onClick={onClick}
        data={figure.data} layout={figure.layout} useResizeHandler style={{ width: '100%', height: '100%' }}
        config={{ responsive: true, displaylogo: false, displayModeBar: 'hover', modeBarButtonsToRemove: ['lasso2d', 'select2d', 'zoom2d', 'pan2d'], toImageButtonOptions: { format: 'png', filename: `pyorex-${result.tool}`, scale: 2, height: 800, width: 1200 } }} />
      {figure.fits.length > 0 && <div className="pointer-events-none absolute right-2 top-1 rounded bg-panel/90 px-2 py-1 text-[10.5px] text-muted shadow">
        <b className="font-semibold text-fg">{t('layer.regression')}</b> · {t('visualGuide')}
        {figure.fits.map(f => <div key={f.group} className="tabular font-mono">{f.group}: R² {f.r2.toFixed(3)} · n {f.n}</div>)}
      </div>}
    </div> : <div className="min-h-0 flex-1 overflow-auto px-2 py-1.5">
      {selection.size > 0 && <label className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted"><input type="checkbox" checked={onlySel} onChange={e => { setOnlySel(e.target.checked); setPage(0); }} />{t('onlySelection')}</label>}
      <table className="w-full text-left text-[11.5px]">
        <thead className="sticky top-0 bg-panel text-[10.5px] uppercase tracking-wide text-subtle"><tr>{['', t('col.sample'), t('col.group'), t('col.status'), 'X', 'Y', 'Z', result.plot.kind === 'spider' ? t('col.normalized') : t('col.values'), t('col.classReason')].map((h, i) => <th key={i} className="border-b border-line px-1.5 py-1.5 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{tableRows.slice(page * 100, page * 100 + 100).map(row => {
          const on = selection.has(row.row_index);
          return <tr key={row.row_index} onClick={e => store.select([row.row_index], e.shiftKey || e.ctrlKey || e.metaKey ? 'toggle' : 'replace')}
            className={`cursor-pointer border-t border-line ${on ? 'bg-accent-soft' : 'hover:bg-hover'}`}>
            <td className="w-4 px-1.5">{on && <i className="block h-2 w-2 rounded-full bg-accent" />}</td>
            <td className="px-1.5 py-1 font-mono text-fg">{row.sample_id}</td><td className="px-1.5">{row.group}</td>
            <td className="px-1.5"><span className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-medium ${row.status === 'valid' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>{row.status}</span></td>
            {[row.x, row.y, row.z, row.values].map((v, i) => <td key={i} className="px-1.5 font-mono tabular-nums">{printable(v)}</td>)}
            <td className="px-1.5">{row.classification ?? row.reason ?? '—'}</td>
          </tr>;
        })}</tbody>
      </table>
      <div className="mt-2 flex items-center gap-3 text-[11px]"><button disabled={page === 0} onClick={() => setPage(page - 1)} className="disabled:opacity-30">←</button><span className="tabular font-mono">{page + 1} / {pages}</span><button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className="disabled:opacity-30">→</button></div>
    </div>}
  </section>;
}

const Center = ({ children }: { children: ReactNode }) => <div className="px-canvas flex h-full flex-col items-center justify-center gap-2 p-5 text-center">{children}</div>;

/** Vertices of the lasso just drawn, in data units: [x, y] on XY charts, [A, B, C] on ternaries. */
function lassoOutline(ev: Readonly<PlotSelectionEvent> | undefined, ternary: boolean): number[][] | null {
  const lp = (ev as unknown as { lassoPoints?: unknown } | undefined)?.lassoPoints;
  if (!lp || typeof lp !== 'object') return null;
  const xy = lp as { x?: unknown[]; y?: unknown[] };
  let pts: number[][];
  if (Array.isArray(xy.x) && Array.isArray(xy.y)) pts = xy.x.map((x, i) => [Number(x), Number(xy.y![i])]);
  else {
    const first = Object.values(lp as Record<string, unknown>).find(Array.isArray) as unknown[] | undefined;
    pts = first?.map(p => (Array.isArray(p) ? p.map(Number) : [])).filter(p => p.length >= 2) ?? [];
  }
  if (!pts.length) return null;
  // Ternary subplots report the lasso in their internal cartesian frame: y = A and x = C − B (sum 100).
  return ternary ? pts.map(([x, y]) => ternaryFromCartesian(x, y)) : pts;
}
