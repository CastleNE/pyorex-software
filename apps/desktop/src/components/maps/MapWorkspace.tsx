/**
 * Secciones y mapas → «Mapa de muestras». Every sample at its real coordinates, coloured by the classes of a column or
 * an expression (or by a category), with an optional IDW surface and isolines drawn with the same classes. Lasso
 * selection is shared with the charts and the data table. Positions, values and the surface are computed by the Python
 * engine (maps.sample_map); this component only draws and edits settings.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { PlotMouseEvent, PlotSelectionEvent } from 'plotly.js';
import Plot, { useChartTheme } from '@/components/ThemedPlot';
import { usePlotResize } from '@/lib/use-plot-resize';
import PxIcon, { type PxIconName } from '@/components/PxIcon';
import { CoordinatesSection } from '@/components/geochemistry/VariablesPanel';
import SectionPanel from '@/components/maps/SectionPanel';
import { defaultWidth, guessDrill, guessElevation } from '@/lib/section-columns';
import { buildMap } from '@/lib/build-map';
import { categoryOptions } from '@/lib/category-columns';
import { COLOR_RAMP_NAMES, COLOR_RAMPS, MISSING_COLOR, type ColorRamp } from '@/lib/color-classes';
import { mapsApi, type MapResult } from '@/lib/maps-api';
import { dataUrlToBytes, runSave, saveFile, type SaveNotice } from '@/lib/save-file';
import { clampClasses, type SizeMethod } from '@/lib/size-classes';
import { useL, useLangStore, type Txt } from '@/lib/i18n';
import { useDatasetRoles, useColumnRoles } from '@/stores/column-roles-store';
import { useDatasetStore } from '@/stores/dataset-store';
import { useGeoWindows } from '@/stores/geo-windows-store';
import { DEFAULT_MAP, useMapStore, type MapSettings } from '@/stores/map-store';

const MEASURED = new Set(['major_oxide', 'trace_element', 'ree', 'assay', 'ratio']);
const NOT_A_VALUE = new Set(['sample_id', 'hole_id', 'row_index', 'easting', 'northing', 'longitude', 'latitude']);
const METHODS: { id: SizeMethod; label: Txt }[] = [
  { id: 'quantile', label: { es: 'Cuantiles', en: 'Quantiles' } },
  { id: 'equal', label: { es: 'Intervalos iguales', en: 'Equal intervals' } },
  { id: 'jenks', label: { es: 'Cortes naturales (Jenks)', en: 'Natural breaks (Jenks)' } },
  { id: 'series', label: { es: 'Serie 1-2-5', en: '1-2-5 series' } },
];
const EXPR = '__expression__';
type Drag = 'lasso' | 'pan' | 'zoom';

const field = 'h-7 w-full rounded border border-line-strong bg-raised px-2 text-xs text-fg focus:border-accent';
const label = 'flex flex-col gap-1 text-xs text-muted';

export default function MapWorkspace() {
  const L = useL();
  const dataset = useDatasetStore(s => s.dataset);
  const datasetId = dataset?.id ?? '';
  const stored = useMapStore(s => (datasetId ? s.byDataset[datasetId] : undefined));
  const settings = useMemo<MapSettings>(() => ({ ...DEFAULT_MAP, ...stored, idw: { ...DEFAULT_MAP.idw, ...stored?.idw } }), [stored]);
  const lang = useLangStore(s => s.lang);
  const update = (patch: Partial<MapSettings>) => datasetId && useMapStore.getState().update(datasetId, patch);
  const roles = useDatasetRoles(dataset?.id);
  const selection = useGeoWindows(s => (s.datasetId === datasetId ? s.selection : EMPTY));
  const theme = useChartTheme();
  const [result, setResult] = useState<MapResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState<Drag>('lasso');
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const plotEl = useRef<HTMLElement | null>(null);
  const mapBox = usePlotResize(plotEl);
  const request = useRef(0);

  useEffect(() => { if (datasetId) { void useColumnRoles.getState().load(datasetId); if (useGeoWindows.getState().datasetId !== datasetId) useGeoWindows.getState().setDataset(datasetId); } }, [datasetId]);

  const hasCoords = !!dataset?.spatialConfig && dataset.spatialConfig.geometry_source !== 'none';
  const spatialKey = JSON.stringify(dataset?.spatialConfig ?? null);
  const reqKey = JSON.stringify([datasetId, spatialKey, settings.value, settings.category, settings.label, settings.includeQaqc, settings.surface && settings.value ? settings.idw : null]);
  useEffect(() => {
    if (!datasetId || !hasCoords) { setResult(null); return; }
    const id = ++request.current;
    setLoading(true);
    const timer = setTimeout(() => {
      mapsApi.sampleMap({
        dataset_id: datasetId, value: settings.value, category_column: settings.category, label_column: settings.label,
        include_qaqc: settings.includeQaqc, idw: settings.surface && settings.value ? settings.idw : null,
      }).then(r => { if (id === request.current) { setResult(r); setError(null); } })
        .catch(e => { if (id === request.current) setError(e instanceof Error ? e.message : String(e)); })
        .finally(() => { if (id === request.current) setLoading(false); });
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey, hasCoords]);

  const figure = useMemo(() => {
    if (!result) return null;
    const f = buildMap(result, settings, { selection, dragmode: drawing ? 'drawline' : drag, theme, t: L });
    if (drawing) (f.layout as Record<string, unknown>).newshape = { line: { color: theme.font, width: 2.5 } };
    return f;
  },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, settings, selection, drag, drawing, theme, lang]);
  useEffect(() => {
    if (!drawing) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawing(false); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [drawing]);

  if (!dataset) return <Empty icon="map" title={L({ es: 'Mapa de muestras', en: 'Sample map' })} text={L({ es: 'Importa un dataset con coordenadas para dibujar sus muestras.', en: 'Import a dataset with coordinates to map its samples.' })} />;

  const store = useGeoWindows.getState();
  const onSelected = (ev: Readonly<PlotSelectionEvent> | undefined) => {
    const rows = (ev?.points ?? []).map(p => p.customdata).filter((r): r is number => typeof r === 'number');
    if (rows.length) store.select(rows);
  };
  const onClick = (ev: Readonly<PlotMouseEvent>) => {
    const r = ev.points?.[0]?.customdata; if (typeof r !== 'number') return;
    const e = ev.event as MouseEvent | undefined;
    store.select([r], e?.shiftKey || e?.ctrlKey || e?.metaKey ? 'toggle' : 'replace');
  };
  /** A line drawn on the map becomes the section A–A' (keeping the previous width, elevation and drill setup). */
  const onRelayout = (ev: Readonly<Record<string, unknown>>) => {
    if (!drawing) return;
    const shapes = ev.shapes as { type?: string; x0: number; y0: number; x1: number; y1: number }[] | undefined;
    const line = shapes?.filter(sh => sh.type === 'line').at(-1);
    if (!line || (line.x0 === line.x1 && line.y0 === line.y1)) return;
    const prev = settings.section;
    const cols = dataset.columns.filter(c => !c.name.startsWith('_')).map(c => ({ name: c.name, numeric: c.dataType === 'numeric' }));
    const length = Math.hypot(line.x1 - line.x0, line.y1 - line.y0);
    update({ section: {
      start: [line.x0, line.y0], end: [line.x1, line.y1], width: prev?.width ?? defaultWidth(length), exaggeration: prev?.exaggeration ?? 1,
      elevationColumn: prev ? prev.elevationColumn : guessElevation(cols, roles ?? {}), demPath: prev?.demPath ?? null,
      drill: prev ? prev.drill : guessDrill(cols, roles ?? {}), open: true,
    } });
    setDrawing(false);
  };
  const name = (settings.value ?? L({ es: 'muestras', en: 'samples' })).replace(/[^\w.-]+/g, '_');
  const exportImage = async (format: 'png' | 'svg') => {
    const el = plotEl.current; if (!el) return;
    setNotice(await runSave(async () => saveFile(`pyorex-mapa-${name}.${format}`, dataUrlToBytes(await Plotly.toImage(el, { format, width: 1600, height: 1200 })), format === 'svg' ? 'image/svg+xml' : 'image/png')));
  };
  const exportCsv = async (what: 'points' | 'grid') => {
    if (!result) return;
    let csv = '';
    if (what === 'points') {
      const cat = result.category_column;
      csv = [['sample_id', result.crs.x_column, result.crs.y_column, ...(result.value_label ? [result.value_label] : []), ...(cat ? [cat] : [])].map(q).join(','),
        ...result.points.map(p => [p.sample_id, p.x, p.y, ...(result.value_label ? [p.value ?? ''] : []), ...(cat ? [p.category ?? ''] : [])].map(q).join(','))].join('\n');
    } else if (result.grid) {
      const g = result.grid;
      csv = [`${q(result.crs.x_column)},${q(result.crs.y_column)},${q(result.value_label ?? 'z')}`, ...g.y.flatMap((y, j) => g.x.map((x, i) => `${x},${y},${g.z[j][i] ?? ''}`))].join('\n');
    }
    setNotice(await runSave(() => saveFile(`pyorex-mapa-${name}-${what === 'grid' ? 'malla' : 'muestras'}.csv`, csv, 'text/csv')));
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <MapPanel settings={settings} update={update} roles={roles} result={result} />
      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-app">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
          <PxIcon name="map" className="h-4 w-4 shrink-0 text-accent-fg" />
          <b className="truncate text-[13px] font-semibold text-fg">{settings.value ? settings.value : L({ es: 'Ubicación de muestras', en: 'Sample locations' })}</b>
          {result && <>
            <Chip><b className="tabular font-mono text-fg">{result.quality.mapped}</b> {L({ es: 'en el mapa', en: 'on the map' })}</Chip>
            {result.quality.no_value > 0 && <Chip tone="warn">{result.quality.no_value} {L({ es: 'sin valor', en: 'without value' })}</Chip>}
            {result.quality.no_coordinates > 0 && <Chip tone="warn">{result.quality.no_coordinates} {L({ es: 'sin coordenadas', en: 'without coordinates' })}</Chip>}
            <span className="truncate text-[11.5px] text-subtle" title={result.crs.label ?? undefined}>{result.crs.epsg ? `EPSG:${result.crs.epsg}` : L({ es: 'Malla local', en: 'Local grid' })}{result.crs.label ? ` · ${result.crs.label}` : ''}</span>
          </>}
          {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-label={L({ es: 'Calculando', en: 'Computing' })} />}
          <div className="ml-auto flex items-center gap-1">
            <div className="flex items-center rounded-md border border-line bg-app p-0.5" role="radiogroup" aria-label={L({ es: 'Modo del ratón', en: 'Mouse mode' })}>
              {([['lasso', 'lasso', { es: 'Seleccionar con lazo', en: 'Lasso select' }], ['pan', 'pan', { es: 'Desplazar', en: 'Pan' }], ['zoom', 'zoom', { es: 'Zoom a un recuadro', en: 'Box zoom' }]] as [Drag, PxIconName, Txt][]).map(([id, icon, tip]) => (
                <button key={id} role="radio" aria-checked={drag === id} title={L(tip)} aria-label={L(tip)} onClick={() => setDrag(id)}
                  className={`grid h-6 w-7 place-items-center rounded ${drag === id ? 'bg-accent-soft text-accent-fg' : 'text-muted hover:text-fg'}`}><PxIcon name={icon} className="h-3.5 w-3.5" /></button>
              ))}
            </div>
            <IconBtn title={L({ es: 'Ver todo el mapa', en: 'Fit the whole map' })} onClick={() => { const el = plotEl.current; if (el && figure) void Plotly.relayout(el, { 'xaxis.range': figure.layout.xaxis?.range, 'yaxis.range': figure.layout.yaxis?.range } as never); }}><PxIcon name="zoom" className="h-3.5 w-3.5" /></IconBtn>
            {selection.size > 0 && <button onClick={() => store.clearSelection()} className="h-7 rounded-md px-2 text-[12px] text-accent-fg hover:bg-hover">{L({ es: `Quitar selección (${selection.size})`, en: `Clear selection (${selection.size})` })}</button>}
            <button disabled={!result || result.crs.geographic} onClick={() => setDrawing(!drawing)} aria-pressed={drawing}
              title={result?.crs.geographic ? L({ es: 'La sección requiere coordenadas proyectadas en metros', en: 'Sections need projected coordinates in metres' }) : L({ es: "Arrastra sobre el mapa de A a A'", en: "Drag on the map from A to A'" })}
              className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] disabled:opacity-40 ${drawing ? 'border-accent bg-accent-soft text-accent-fg' : 'border-line-strong text-fg hover:bg-hover'}`}>
              <PxIcon name="drill" className="h-3.5 w-3.5" />{settings.section ? L({ es: 'Nueva sección', en: 'New section' }) : L({ es: 'Trazar sección', en: 'Draw section' })}
            </button>
            {settings.section && !settings.section.open && <button onClick={() => update({ section: { ...settings.section!, open: true } })} className="h-7 rounded-md px-2 text-[12px] text-accent-fg hover:bg-hover">{L({ es: 'Ver sección', en: 'Show section' })}</button>}
            <ExportMenu disabled={!result} hasGrid={!!result?.grid && settings.surface} onImage={f => void exportImage(f)} onCsv={w => void exportCsv(w)} />
          </div>
        </header>
        {error && <p role="alert" className="shrink-0 border-b border-danger/40 bg-danger/10 px-3 py-1.5 text-xs text-danger"><span className="select-text">{error}</span></p>}
        {notice && <p className={`shrink-0 border-b border-line px-3 py-1 text-xs ${notice.tone === 'ok' ? 'text-success' : 'text-danger'}`}>{notice.text} <button className="ml-2 text-muted hover:text-fg" onClick={() => setNotice(null)}>×</button></p>}
        <div ref={mapBox} className="relative min-h-0 flex-1">
          {!hasCoords ? (
            <div className="mx-auto mt-12 w-[420px] max-w-[90%] rounded-lg border border-line bg-panel p-4">
              <h3 className="mb-1 text-sm font-semibold text-fg">{L({ es: 'Este dataset no tiene coordenadas', en: 'This dataset has no coordinates' })}</h3>
              <p className="mb-3 text-xs text-muted">{L({ es: 'Indica qué columnas son Este y Norte (o longitud y latitud) y su sistema de referencia. Los valores no se reproyectan.', en: 'Tell which columns hold East and North (or longitude and latitude) and their reference system. Values are never reprojected.' })}</p>
              <CoordinatesSection />
            </div>
          ) : figure ? (
            <Plot data={figure.data} layout={figure.layout} useResizeHandler className="h-full w-full" style={{ width: '100%', height: '100%' }}
              config={{ displaylogo: false, responsive: true, scrollZoom: true, displayModeBar: false }}
              onInitialized={(_, el) => { plotEl.current = el; }} onUpdate={(_, el) => { plotEl.current = el; }}
              onSelected={onSelected} onDeselect={() => store.clearSelection()} onClick={onClick} onRelayout={onRelayout} />
          ) : !error && <div className="grid h-full place-items-center"><span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>}
          {figure && result && <MapLegend figure={figure} result={result} />}
          {drawing && <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-accent-strong px-3 py-1 text-[12px] font-medium text-on-accent shadow-lg">{L({ es: "Arrastra de A a A' para trazar la sección · Esc para cancelar", en: "Drag from A to A' to draw the section · Esc to cancel" })}</div>}
          {result && result.warnings.length > 0 && (
            <div className="absolute left-3 top-3 max-w-md">
              <button onClick={() => setShowNotes(!showNotes)} className="flex items-center gap-1 rounded-full border border-line bg-panel/90 px-2 py-0.5 text-[11px] text-muted shadow hover:text-fg">
                <PxIcon name="warn" className="h-3 w-3" />{result.warnings.length} {L({ es: result.warnings.length === 1 ? 'nota' : 'notas', en: result.warnings.length === 1 ? 'note' : 'notes' })}
              </button>
              {showNotes && <ul className="mt-1 space-y-1 rounded-md border border-line bg-panel/95 p-2 text-[11.5px] text-muted shadow-xl">{result.warnings.map(w => <li key={w} className="select-text">· {w}</li>)}</ul>}
            </div>
          )}
        </div>
        {figure && settings.section?.open && <SectionPanel settings={settings} update={update} classes={figure.classes} drag={drag} />}
      </section>
    </div>
  );
}

const EMPTY: ReadonlySet<number> = new Set();
const q = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Left panel: what is mapped and how it looks. Every change redraws the map. */
function MapPanel({ settings: s, update, roles, result }: { settings: MapSettings; update: (p: Partial<MapSettings>) => void; roles: ReturnType<typeof useDatasetRoles>; result: MapResult | null }) {
  const L = useL();
  const dataset = useDatasetStore(st => st.dataset)!;
  const role = (n: string) => roles?.[n]?.semantic_role ?? 'unknown';
  const visible = dataset.columns.filter(c => !c.name.startsWith('_') && c.name !== 'internal_feature_id');
  const valueColumns = visible.filter(c => !NOT_A_VALUE.has(role(c.name)) && (c.dataType === 'numeric' || MEASURED.has(role(c.name))));
  const cats = categoryOptions(visible.map(c => ({ name: c.name, numeric: c.dataType === 'numeric' })), roles ?? {});
  const textCols = visible.filter(c => c.dataType !== 'numeric');
  const isExpr = !!s.value && !valueColumns.some(c => c.name === s.value);
  const [exprMode, setExprMode] = useState(isExpr);
  const [draft, setDraft] = useState(isExpr ? s.value ?? '' : '');
  useEffect(() => { setExprMode(isExpr); setDraft(isExpr ? s.value ?? '' : ''); }, [dataset.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const interpolable = result?.crs.interpolable ?? true;

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-line bg-panel" aria-label={L({ es: 'Ajustes del mapa', en: 'Map settings' })}>
      <Section title={L({ es: 'Qué mostrar', en: 'What to show' })}>
        <label className={label}><span>{L({ es: 'Valor', en: 'Value' })}</span>
          <select aria-label={L({ es: 'Valor', en: 'Value' })} className={field} value={exprMode ? EXPR : s.value ?? ''}
            onChange={e => { const v = e.target.value; if (v === EXPR) { setExprMode(true); setDraft(s.value ?? ''); } else { setExprMode(false); update({ value: v || null, colorMethod: s.colorMethod === 'manual' ? 'quantile' : s.colorMethod, colorBreaks: null }); } }}>
            <option value="">{L({ es: 'Solo ubicación', en: 'Location only' })}</option>
            {valueColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            <option value={EXPR}>{L({ es: 'Expresión…', en: 'Expression…' })}</option>
          </select>
        </label>
        {exprMode && <form className="space-y-1" onSubmit={e => { e.preventDefault(); update({ value: draft.trim() || null }); }}>
          <input aria-label={L({ es: 'Expresión', en: 'Expression' })} className={`${field} font-mono`} value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => update({ value: draft.trim() || null })}
            placeholder="Cu_ppm/Zn_ppm · log10(Au_ppb)" spellCheck={false} />
          <p className="text-[11px] text-subtle">{L({ es: 'Nombres con espacios entre corchetes: [Cu ppm]. Enter para aplicar.', en: 'Names with spaces in brackets: [Cu ppm]. Enter to apply.' })}</p>
        </form>}
        <label className={label}><span>{s.value ? L({ es: 'Categoría (forma del símbolo)', en: 'Category (symbol shape)' }) : L({ es: 'Categoría (color)', en: 'Category (colour)' })}</span>
          <select aria-label={L({ es: 'Categoría', en: 'Category' })} className={field} value={s.category ?? ''} onChange={e => update({ category: e.target.value || null })}>
            <option value="">{L({ es: 'Ninguna', en: 'None' })}</option>
            {[...cats.text, ...cats.numeric].map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <label className={`${label} flex-1`}><span>{L({ es: 'Etiqueta', en: 'Label' })}</span>
            <select aria-label={L({ es: 'Columna de etiqueta', en: 'Label column' })} className={field} value={s.label ?? ''} onChange={e => update({ label: e.target.value || null })}>
              <option value="">{L({ es: 'ID de muestra', en: 'Sample ID' })}</option>
              {textCols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </label>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={s.showLabels} onChange={e => update({ showLabels: e.target.checked })} className="accent-accent" />{L({ es: 'Mostrar', en: 'Show' })}</label>
        </div>
        <label className={label}><span className="flex justify-between">{L({ es: 'Tamaño del símbolo', en: 'Symbol size' })}<span className="tabular font-mono text-subtle">{s.pointSize}</span></span>
          <input type="range" min="4" max="20" value={s.pointSize} onChange={e => update({ pointSize: Number(e.target.value) })} aria-label={L({ es: 'Tamaño del símbolo', en: 'Symbol size' })} className="h-6 w-full accent-accent" />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={s.includeQaqc} onChange={e => update({ includeQaqc: e.target.checked })} className="accent-accent" />{L({ es: 'Incluir controles QAQC', en: 'Include QA/QC controls' })}</label>
      </Section>

      {s.value && <Section title={L({ es: 'Clases y color', en: 'Classes and colour' })}>
        <div className="grid grid-cols-[1fr_4.5rem] gap-2">
          <label className={label}><span>{L({ es: 'Método', en: 'Method' })}</span>
            <select aria-label={L({ es: 'Método de clases', en: 'Class method' })} className={field} value={METHODS.some(m => m.id === s.colorMethod) ? s.colorMethod : 'quantile'} onChange={e => update({ colorMethod: e.target.value as SizeMethod, colorBreaks: null, colorPercentiles: null })}>
              {METHODS.map(m => <option key={m.id} value={m.id}>{L(m.label)}</option>)}
            </select>
          </label>
          <label className={label}><span>{L({ es: 'Clases', en: 'Classes' })}</span>
            <input type="number" min={2} max={12} disabled={s.colorMethod === 'series'} aria-label={L({ es: 'Número de clases', en: 'Number of classes' })} className={`${field} tabular font-mono`} value={s.colorClasses}
              onChange={e => update({ colorClasses: Math.min(12, clampClasses(Number(e.target.value))), colorCustom: null })} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={s.colorLog} onChange={e => update({ colorLog: e.target.checked })} className="accent-accent" />{L({ es: 'Clases en escala log10 (trazas)', en: 'Classes on log10 scale (traces)' })}</label>
        <div className="flex items-end gap-2">
          <label className={`${label} flex-1`}><span>{L({ es: 'Rampa de color', en: 'Colour ramp' })}</span>
            <select aria-label={L({ es: 'Rampa de color', en: 'Colour ramp' })} className={field} value={s.colorRamp} onChange={e => update({ colorRamp: e.target.value as ColorRamp, colorCustom: null })}>
              {COLOR_RAMP_NAMES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <button title={L({ es: 'Invertir rampa', en: 'Reverse ramp' })} aria-label={L({ es: 'Invertir rampa', en: 'Reverse ramp' })} aria-pressed={s.colorReverse} onClick={() => update({ colorReverse: !s.colorReverse, colorCustom: null })}
            className={`mb-px grid h-7 w-8 place-items-center rounded border ${s.colorReverse ? 'border-accent text-accent-fg' : 'border-line-strong text-muted'} hover:bg-hover`}>⇄</button>
        </div>
        <div className="h-2 w-full rounded-full" style={{ background: `linear-gradient(90deg, ${(s.colorReverse ? [...COLOR_RAMPS[s.colorRamp]].reverse() : COLOR_RAMPS[s.colorRamp]).join(',')})` }} aria-hidden />
      </Section>}

      {s.value && <Section title={L({ es: 'Superficie IDW', en: 'IDW surface' })} right={<Toggle on={s.surface} disabled={!interpolable} onChange={v => update({ surface: v })} label={L({ es: 'Mostrar superficie IDW', en: 'Show IDW surface' })} />}>
        {!interpolable && <p className="text-[11.5px] text-warning">{L({ es: 'Requiere coordenadas proyectadas en metros; con longitud/latitud no se interpola.', en: 'Needs projected coordinates in metres; longitude/latitude cannot be interpolated.' })}</p>}
        {s.surface && interpolable && <>
          <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={s.contours} onChange={e => update({ contours: e.target.checked })} className="accent-accent" />{L({ es: 'Isolíneas en los límites de clase', en: 'Isolines at the class limits' })}</label>
          <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={s.idw.log} onChange={e => update({ idw: { ...s.idw, log: e.target.checked } })} className="accent-accent" />{L({ es: 'Interpolar en log10 (trazas)', en: 'Interpolate in log10 (traces)' })}</label>
          <div className="grid grid-cols-3 gap-2">
            <Num label={L({ es: 'Potencia', en: 'Power' })} value={s.idw.power} min={0.5} max={5} step={0.5} onChange={v => update({ idw: { ...s.idw, power: v } })} />
            <Num label={L({ es: 'Vecinos', en: 'Neighbours' })} value={s.idw.neighbors} min={3} max={64} onChange={v => update({ idw: { ...s.idw, neighbors: Math.round(v) } })} />
            <Num label={L({ es: 'Nodos', en: 'Nodes' })} value={s.idw.resolution} min={11} max={250} onChange={v => update({ idw: { ...s.idw, resolution: Math.round(v) } })} />
          </div>
          <label className={label}><span>{L({ es: 'Radio máximo (m)', en: 'Maximum radius (m)' })}</span>
            <input type="number" min={0} className={`${field} tabular font-mono`} placeholder={L({ es: 'Sin límite', en: 'No limit' })} value={s.idw.radius ?? ''} aria-label={L({ es: 'Radio máximo', en: 'Maximum radius' })}
              onChange={e => update({ idw: { ...s.idw, radius: e.target.value && Number(e.target.value) > 0 ? Number(e.target.value) : null } })} />
          </label>
          <label className={label}><span className="flex justify-between">{L({ es: 'Opacidad', en: 'Opacity' })}<span className="tabular font-mono text-subtle">{Math.round(s.surfaceOpacity * 100)}%</span></span>
            <input type="range" min="0.2" max="1" step="0.05" value={s.surfaceOpacity} onChange={e => update({ surfaceOpacity: Number(e.target.value) })} aria-label={L({ es: 'Opacidad de la superficie', en: 'Surface opacity' })} className="h-6 w-full accent-accent" />
          </label>
          {result?.grid_metrics && <p className="text-[11px] text-subtle">{L({ es: `${result.grid_metrics.unique_locations} ubicaciones · ${result.grid_metrics.supported_cells} de ${result.grid_metrics.total_cells} celdas dentro de la envolvente`, en: `${result.grid_metrics.unique_locations} locations · ${result.grid_metrics.supported_cells} of ${result.grid_metrics.total_cells} cells inside the hull` })}</p>}
        </>}
      </Section>}
    </aside>
  );
}

function MapLegend({ figure, result }: { figure: ReturnType<typeof buildMap>; result: MapResult }) {
  const L = useL();
  const lg = figure.legend;
  if (lg.kind === 'none' && !figure.symbols.length) return null;
  return (
    <div className="pointer-events-auto absolute bottom-14 right-4 max-h-[60%] w-56 overflow-y-auto rounded-md border border-line bg-panel/95 p-2.5 text-[11.5px] shadow-xl" aria-label={L({ es: 'Leyenda', en: 'Legend' })}>
      {lg.kind === 'classes' && <>
        <p className="mb-1.5 truncate font-semibold text-fg" title={lg.title}>{lg.title}{lg.log && <span className="ml-1 text-[10px] font-normal text-subtle">log10</span>}</p>
        <ul className="space-y-0.5">{[...lg.classes].reverse().map((c, k) => (
          <li key={k} className="flex items-center gap-2"><span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: c.color }} /><span className="tabular flex-1 font-mono text-fg">{c.range}</span><span className="tabular font-mono text-subtle">{c.count}</span></li>
        ))}</ul>
        {lg.missing > 0 && <p className="mt-1 flex items-center gap-2 text-muted"><span className="h-3 w-3 rounded-sm" style={{ background: MISSING_COLOR }} />{L({ es: 'Sin valor', en: 'No value' })}<span className="tabular ml-auto font-mono text-subtle">{lg.missing}</span></p>}
        {lg.surface && <p className="mt-1.5 border-t border-line pt-1.5 text-[10.5px] text-subtle">{L({ es: 'La superficie y las isolíneas usan las mismas clases.', en: 'The surface and isolines use the same classes.' })}{result.grid?.log ? L({ es: ' Interpolada en log10.', en: ' Interpolated in log10.' }) : ''}</p>}
      </>}
      {lg.kind === 'categories' && <>
        <p className="mb-1.5 truncate font-semibold text-fg">{lg.title}</p>
        <ul className="space-y-0.5">{lg.items.map(i => <li key={i.name} className="flex items-center gap-2"><span className="h-3 w-3 shrink-0 rounded-full" style={{ background: i.color }} /><span className="flex-1 truncate text-fg">{i.name}</span><span className="tabular font-mono text-subtle">{i.count}</span></li>)}</ul>
      </>}
      {figure.symbols.length > 0 && <div className={lg.kind !== 'none' ? 'mt-2 border-t border-line pt-1.5' : ''}>
        <p className="mb-1 truncate font-semibold text-fg">{result.category_column}</p>
        <ul className="space-y-0.5">{figure.symbols.map(sym => <li key={sym.name} className="flex items-center gap-2"><span className="w-3 text-center text-muted">{SYMBOL_GLYPH[sym.symbol] ?? '●'}</span><span className="flex-1 truncate text-fg">{sym.name}</span><span className="tabular font-mono text-subtle">{sym.count}</span></li>)}</ul>
      </div>}
    </div>
  );
}
const SYMBOL_GLYPH: Record<string, string> = { circle: '●', square: '■', 'triangle-up': '▲', diamond: '◆', 'triangle-down': '▼', cross: '✚', x: '✖', star: '★' };

function ExportMenu({ disabled, hasGrid, onImage, onCsv }: { disabled: boolean; hasGrid: boolean; onImage: (f: 'png' | 'svg') => void; onCsv: (w: 'points' | 'grid') => void }) {
  const L = useL();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', close); return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const item = 'block w-full rounded px-2.5 py-1.5 text-left text-[12.5px] text-fg hover:bg-hover disabled:opacity-40';
  return (
    <div ref={ref} className="relative">
      <button disabled={disabled} onClick={() => setOpen(!open)} className="flex h-7 items-center gap-1.5 rounded-md border border-line-strong px-2 text-[12px] text-fg hover:bg-hover disabled:opacity-40">
        <PxIcon name="export" className="h-3.5 w-3.5" />{L({ es: 'Exportar', en: 'Export' })}<span className="text-[9px] text-subtle">▾</span>
      </button>
      {open && <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-56 rounded-md border border-line-strong bg-panel p-1 shadow-2xl">
        <button role="menuitem" className={item} onClick={() => { setOpen(false); onImage('png'); }}>{L({ es: 'Imagen PNG', en: 'PNG image' })}</button>
        <button role="menuitem" className={item} onClick={() => { setOpen(false); onImage('svg'); }}>{L({ es: 'Imagen SVG (vectorial)', en: 'SVG image (vector)' })}</button>
        <div className="my-1 h-px bg-line" />
        <button role="menuitem" className={item} onClick={() => { setOpen(false); onCsv('points'); }}>{L({ es: 'Muestras del mapa (CSV)', en: 'Map samples (CSV)' })}</button>
        <button role="menuitem" className={item} disabled={!hasGrid} onClick={() => { setOpen(false); onCsv('grid'); }}>{L({ es: 'Malla IDW (CSV x, y, z)', en: 'IDW grid (CSV x, y, z)' })}</button>
      </div>}
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5 border-b border-line px-3 py-3">
      <h3 className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{title}{right}</h3>
      {children}
    </section>
  );
}

function Toggle({ on, onChange, disabled, label: name }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={name} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-4 w-7 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-accent' : 'bg-line-strong'}`}>
      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
    </button>
  );
}

function Num({ label: name, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className={label}><span>{name}</span>
      <input type="number" min={min} max={max} step={step} value={value} aria-label={name} className={`${field} tabular font-mono`}
        onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= min && v <= max) onChange(v); }} />
    </label>
  );
}

function Chip({ children, tone }: { children: ReactNode; tone?: 'warn' }) {
  return <span className={`flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11.5px] ${tone === 'warn' ? 'bg-warning/10 text-warning' : 'bg-sunken text-muted'}`}>{children}</span>;
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return <button title={title} aria-label={title} onClick={onClick} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg">{children}</button>;
}

function Empty({ icon, title, text }: { icon: PxIconName; title: string; text: string }) {
  return <div className="m-auto flex flex-col items-center gap-2 p-8 text-center"><PxIcon name={icon} className="h-9 w-9 text-subtle" /><p className="text-[14px] font-semibold text-fg">{title}</p><p className="max-w-sm text-[12px] text-muted">{text}</p></div>;
}
