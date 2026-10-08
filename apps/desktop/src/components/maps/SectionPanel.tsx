/**
 * Section A–A' under the sample map: value profile and elevation section along the line drawn on the map, with the
 * topography (DEM or sample elevations) and drill holes. Uses the map's value, category and classes. Computed by the
 * Python engine (maps.section); this panel only edits the section settings and draws.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { PlotMouseEvent, PlotSelectionEvent } from 'plotly.js';
import { isTauri } from '@tauri-apps/api/core';
import Plot, { useChartTheme } from '@/components/ThemedPlot';
import { usePlotResize } from '@/lib/use-plot-resize';
import PxIcon from '@/components/PxIcon';
import { buildSection } from '@/lib/build-section';
import { mapsApi, type DrillRequest, type SectionResult } from '@/lib/maps-api';
import { dataUrlToBytes, runSave, saveFile, type SaveNotice } from '@/lib/save-file';
import { fmtLimit } from '@/lib/size-classes';
import type { ColorClassLegend } from '@/lib/color-classes';
import { fileOf } from '@/lib/recent-projects';
import { useL, useLangStore } from '@/lib/i18n';
import { useDatasetStore } from '@/stores/dataset-store';
import { useGeoWindows } from '@/stores/geo-windows-store';
import type { MapSettings, SectionSettings } from '@/stores/map-store';

const field = 'h-7 rounded border border-line-strong bg-raised px-2 text-xs text-fg focus:border-accent';
const DEM = '__dem__';
const EXAGGERATIONS = [1, 2, 3, 5, 10];

export default function SectionPanel({ settings, update, classes, drag }: {
  settings: MapSettings; update: (p: Partial<MapSettings>) => void; classes: ColorClassLegend | null; drag: 'lasso' | 'pan' | 'zoom';
}) {
  const L = useL();
  const lang = useLangStore(s => s.lang);
  const dataset = useDatasetStore(s => s.dataset)!;
  const sec = settings.section!;
  const setSec = (patch: Partial<SectionSettings>) => update({ section: { ...sec, ...patch } });
  const selection = useGeoWindows(s => (s.datasetId === dataset.id ? s.selection : EMPTY));
  const theme = useChartTheme();
  const [result, setResult] = useState<SectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const [drillOpen, setDrillOpen] = useState(false);
  const [demDraft, setDemDraft] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [tall, setTall] = useState(false);
  const plotEl = useRef<HTMLElement | null>(null);
  const secBox = usePlotResize(plotEl);
  const request = useRef(0);

  const reqKey = JSON.stringify([dataset.id, sec.start, sec.end, sec.width, sec.elevationColumn, sec.demPath, sec.drill, settings.value, settings.category, settings.label, settings.includeQaqc]);
  useEffect(() => {
    const id = ++request.current;
    setLoading(true);
    const timer = setTimeout(() => {
      mapsApi.section({
        dataset_id: dataset.id, start: sec.start, end: sec.end, width: sec.width, value: settings.value, category_column: settings.category,
        label_column: settings.label, include_qaqc: settings.includeQaqc, elevation_column: sec.elevationColumn, dem_path: sec.demPath, drill: drillReady(sec.drill) ? sec.drill : null,
      }).then(r => { if (id === request.current) { setResult(r); setError(null); } })
        .catch(e => { if (id === request.current) setError(e instanceof Error ? e.message : String(e)); })
        .finally(() => { if (id === request.current) setLoading(false); });
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);

  const figure = useMemo(() => (result ? buildSection(result, settings, { selection, dragmode: drag, theme, t: L, classes }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, settings, selection, drag, theme, lang, classes]);

  const numeric = dataset.columns.filter(c => c.dataType === 'numeric' && !c.name.startsWith('_')).map(c => c.name);
  const all = dataset.columns.filter(c => !c.name.startsWith('_') && c.name !== 'internal_feature_id').map(c => c.name);
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
  const pickDem = async () => {
    if (isTauri()) {
      const dialog = await import('@tauri-apps/plugin-dialog');
      const p = await dialog.open({ multiple: false, filters: [{ name: 'DEM (GeoTIFF, ESRI ASCII)', extensions: ['tif', 'tiff', 'asc'] }] });
      if (typeof p === 'string') setSec({ demPath: p, elevationColumn: null });
    } else setDemDraft(sec.demPath ?? '');
  };
  const exportImage = async (format: 'png' | 'svg') => {
    const el = plotEl.current; if (!el) return;
    setNotice(await runSave(async () => saveFile(`pyorex-seccion.${format}`, dataUrlToBytes(await Plotly.toImage(el, { format, width: 1800, height: 1000 })), format === 'svg' ? 'image/svg+xml' : 'image/png')));
  };
  const exportCsv = async () => {
    if (!result) return;
    const head = ['sample_id', 'hole', 'depth', 'distance_m', 'offset_m', 'elevation', ...(result.value_label ? [result.value_label] : []), ...(result.category_column ? [result.category_column] : [])];
    const csv = [head.map(q).join(','), ...result.points.map(p => [p.sample_id, p.hole ?? '', p.depth ?? '', p.distance, p.offset, p.z ?? '',
      ...(result.value_label ? [p.value ?? ''] : []), ...(result.category_column ? [p.category ?? ''] : [])].map(q).join(','))].join('\n');
    setNotice(await runSave(() => saveFile('pyorex-seccion.csv', csv, 'text/csv')));
  };

  const elevationValue = sec.demPath ? DEM : sec.elevationColumn ?? '';
  return (
    <section className="relative flex min-h-0 flex-col border-t-2 border-line-strong bg-app" style={{ height: tall ? '82%' : '52%' }} aria-label={L({ es: 'Sección', en: 'Section' })}>
      <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-panel px-3 py-1.5 text-xs">
        <b className="text-[13px] font-semibold text-fg">{L({ es: 'Sección', en: 'Section' })} A–A'</b>
        {result && <span className="tabular font-mono text-[11.5px] text-muted">{fmtKm(result.line.length)} · az {Math.round(result.line.azimuth)}° · {result.quality.in_section} {L({ es: 'muestras', en: 'samples' })}{result.holes.length ? ` · ${result.holes.length} ${L({ es: 'sondajes', en: 'holes' })}` : ''}</span>}
        {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-muted" title={L({ es: 'Se proyectan las muestras a menos de la mitad de este ancho de la línea', en: 'Samples closer to the line than half this width are projected' })}>
            {L({ es: 'Ancho', en: 'Width' })}
            <input type="number" min={1} className={`${field} tabular w-20 font-mono`} value={sec.width} aria-label={L({ es: 'Ancho de la banda (m)', en: 'Band width (m)' })}
              onChange={e => { const v = Number(e.target.value); if (v > 0) setSec({ width: v }); }} />m
          </label>
          <label className="flex items-center gap-1 text-muted">{L({ es: 'Exag. vertical', en: 'Vert. exag.' })}
            <select className={field} value={sec.exaggeration} onChange={e => setSec({ exaggeration: Number(e.target.value) })} aria-label={L({ es: 'Exageración vertical', en: 'Vertical exaggeration' })}>
              {EXAGGERATIONS.map(x => <option key={x} value={x}>{x}×</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 text-muted">{L({ es: 'Cota', en: 'Elevation' })}
            <select className={`${field} max-w-40`} value={elevationValue} aria-label={L({ es: 'Fuente de la cota', en: 'Elevation source' })}
              onChange={e => { const v = e.target.value; if (v === DEM) void pickDem(); else setSec({ elevationColumn: v || null, demPath: null }); }}>
              <option value="">{L({ es: 'Sin cota (solo perfil)', en: 'None (profile only)' })}</option>
              {numeric.map(c => <option key={c} value={c}>{c}</option>)}
              <option value={DEM}>{sec.demPath ? `DEM · ${fileOf(sec.demPath)}` : L({ es: 'DEM (GeoTIFF / .asc)…', en: 'DEM (GeoTIFF / .asc)…' })}</option>
            </select>
          </label>
          {sec.demPath && <button className="text-accent-fg hover:underline" onClick={() => void pickDem()}>{L({ es: 'Cambiar DEM', en: 'Change DEM' })}</button>}
          <div className="relative">
            <button onClick={() => setDrillOpen(!drillOpen)} aria-pressed={!!sec.drill} className={`flex h-7 items-center gap-1 rounded-md border px-2 ${sec.drill ? 'border-accent bg-accent-soft text-accent-fg' : 'border-line-strong text-fg hover:bg-hover'}`}>
              <PxIcon name="drill" className="h-3.5 w-3.5" />{L({ es: 'Sondajes', en: 'Drill holes' })}<span className="text-[9px] text-subtle">▾</span>
            </button>
            {drillOpen && <DrillForm drill={sec.drill} columns={all} numeric={numeric} onChange={drill => setSec({ drill })} onClose={() => setDrillOpen(false)} />}
          </div>
          <IconBtn title={L({ es: "Invertir A y A'", en: "Swap A and A'" })} onClick={() => setSec({ start: sec.end, end: sec.start })}>⇄</IconBtn>
          <IconBtn title={L({ es: 'Exportar PNG', en: 'Export PNG' })} onClick={() => void exportImage('png')}><span className="text-[10px] font-semibold">PNG</span></IconBtn>
          <IconBtn title={L({ es: 'Exportar SVG', en: 'Export SVG' })} onClick={() => void exportImage('svg')}><span className="text-[10px] font-semibold">SVG</span></IconBtn>
          <IconBtn title={L({ es: 'Exportar muestras de la sección (CSV)', en: 'Export section samples (CSV)' })} onClick={() => void exportCsv()}><span className="text-[10px] font-semibold">CSV</span></IconBtn>
          <IconBtn title={tall ? L({ es: 'Reducir', en: 'Shrink' }) : L({ es: 'Agrandar', en: 'Enlarge' })} onClick={() => setTall(!tall)}>{tall ? '▾' : '▴'}</IconBtn>
          <IconBtn title={L({ es: 'Cerrar sección', en: 'Close section' })} onClick={() => setSec({ open: false })}><PxIcon name="close" className="h-3.5 w-3.5" /></IconBtn>
        </div>
      </header>
      {demDraft !== null && (
        <form className="flex shrink-0 items-center gap-2 border-b border-line bg-panel px-3 py-1.5 text-xs" onSubmit={e => { e.preventDefault(); setSec({ demPath: demDraft.trim() || null, elevationColumn: null }); setDemDraft(null); }}>
          <span className="text-muted">{L({ es: 'Ruta completa del DEM', en: 'Full DEM path' })}</span>
          <input autoFocus className={`${field} flex-1 font-mono`} value={demDraft} onChange={e => setDemDraft(e.target.value)} placeholder="C:\\datos\\dem.tif" aria-label={L({ es: 'Ruta del DEM', en: 'DEM path' })} />
          <button type="submit" className="h-7 rounded bg-accent-strong px-3 font-semibold text-on-accent">{L({ es: 'Usar', en: 'Use' })}</button>
          <button type="button" className="text-muted hover:text-fg" onClick={() => setDemDraft(null)}>{L({ es: 'Cancelar', en: 'Cancel' })}</button>
        </form>
      )}
      {error && <p role="alert" className="shrink-0 border-b border-danger/40 bg-danger/10 px-3 py-1.5 text-xs text-danger"><span className="select-text">{error}</span></p>}
      {notice && <p className={`shrink-0 border-b border-line px-3 py-1 text-xs ${notice.tone === 'ok' ? 'text-success' : 'text-danger'}`}>{notice.text} <button className="ml-2 text-muted hover:text-fg" onClick={() => setNotice(null)}>×</button></p>}
      <div ref={secBox} className="relative min-h-0 flex-1">
        {figure && (figure.data.length ? (
          <Plot data={figure.data} layout={figure.layout} useResizeHandler className="h-full w-full" style={{ width: '100%', height: '100%' }}
            config={{ displaylogo: false, responsive: true, scrollZoom: true, displayModeBar: false }}
            onInitialized={(_, el) => { plotEl.current = el; }} onUpdate={(_, el) => { plotEl.current = el; }}
            onSelected={onSelected} onDeselect={() => store.clearSelection()} onClick={onClick} />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-xs text-muted">
            {L({ es: 'Elige un valor en el panel del mapa o una fuente de cota (columna o DEM) para dibujar la sección.', en: 'Choose a value in the map panel or an elevation source (column or DEM) to draw the section.' })}
          </div>
        ))}
        {result && result.warnings.length > 0 && (
          <div className="absolute left-3 top-2 max-w-lg">
            <button onClick={() => setShowNotes(!showNotes)} className="flex items-center gap-1 rounded-full border border-line bg-panel/90 px-2 py-0.5 text-[11px] text-muted shadow hover:text-fg">
              <PxIcon name="warn" className="h-3 w-3" />{result.warnings.length} {L({ es: result.warnings.length === 1 ? 'nota' : 'notas', en: result.warnings.length === 1 ? 'note' : 'notes' })}
            </button>
            {showNotes && <ul className="mt-1 space-y-1 rounded-md border border-line bg-panel/95 p-2 text-[11.5px] text-muted shadow-xl">{result.warnings.map(w => <li key={w} className="select-text">· {w}</li>)}</ul>}
          </div>
        )}
      </div>
    </section>
  );
}

/** Drill-hole fields: hole id, from/to or depth, azimuth and dip (column or a fixed value). */
function DrillForm({ drill, columns, numeric, onChange, onClose }: { drill: DrillRequest | null; columns: string[]; numeric: string[]; onChange: (d: DrillRequest | null) => void; onClose: () => void }) {
  const L = useL();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    window.addEventListener('mousedown', close); return () => window.removeEventListener('mousedown', close);
  }, [onClose]);
  const d: DrillRequest = drill ?? { hole_column: '', from_column: null, to_column: null, depth_column: null, azimuth_column: null, dip_column: null, azimuth: 0, dip: -90 };
  const set = (patch: Partial<DrillRequest>) => {
    const next = { ...d, ...patch };
    onChange(next.hole_column ? next : null);
  };
  const sel = (label: string, value: string | null, options: string[], on: (v: string | null) => void, empty: string): ReactNode => (
    <label className="flex flex-col gap-1 text-[11px] text-muted"><span>{label}</span>
      <select className={`${field} w-full`} value={value ?? ''} onChange={e => on(e.target.value || null)} aria-label={label}>
        <option value="">{empty}</option>{options.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
  const none = L({ es: '—', en: '—' });
  return (
    <div ref={ref} className="absolute right-0 top-full z-30 mt-1 w-80 space-y-2 rounded-md border border-line-strong bg-panel p-3 shadow-2xl">
      <p className="text-[11.5px] text-muted">{L({ es: 'Cada intervalo se ubica a su profundidad media sobre un sondaje recto desde el collar (coordenadas y cota de la fila).', en: 'Each interval sits at its mid depth on a straight hole from the collar (row coordinates and elevation).' })}</p>
      {sel(L({ es: 'Sondaje (ID)', en: 'Hole ID' }), d.hole_column || null, columns, v => set({ hole_column: v ?? '' }), L({ es: 'Sin sondajes', en: 'No drill holes' }))}
      <div className="grid grid-cols-3 gap-2">
        {sel(L({ es: 'Desde', en: 'From' }), d.from_column, numeric, v => set({ from_column: v }), none)}
        {sel(L({ es: 'Hasta', en: 'To' }), d.to_column, numeric, v => set({ to_column: v }), none)}
        {sel(L({ es: 'o Prof.', en: 'or Depth' }), d.depth_column, numeric, v => set({ depth_column: v }), none)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {sel(L({ es: 'Azimut', en: 'Azimuth' }), d.azimuth_column, numeric, v => set({ azimuth_column: v }), `${L({ es: 'Fijo', en: 'Fixed' })} ${d.azimuth}°`)}
        {sel(L({ es: 'Inclinación', en: 'Dip' }), d.dip_column, numeric, v => set({ dip_column: v }), `${L({ es: 'Fija', en: 'Fixed' })} ${d.dip}°`)}
      </div>
      {(!d.azimuth_column || !d.dip_column) && <div className="grid grid-cols-2 gap-2">
        {!d.azimuth_column && <label className="flex flex-col gap-1 text-[11px] text-muted">{L({ es: 'Azimut fijo (°)', en: 'Fixed azimuth (°)' })}<input type="number" min={0} max={360} className={`${field} w-full font-mono`} value={d.azimuth} onChange={e => set({ azimuth: Math.min(360, Math.max(0, Number(e.target.value) || 0)) })} /></label>}
        {!d.dip_column && <label className="flex flex-col gap-1 text-[11px] text-muted">{L({ es: 'Inclinación fija (°)', en: 'Fixed dip (°)' })}<input type="number" min={-90} max={90} className={`${field} w-full font-mono`} value={d.dip} onChange={e => set({ dip: Math.min(90, Math.max(-90, Number(e.target.value) || -90)) })} /></label>}
      </div>}
      {drill && <p className="text-[11px] text-subtle">{L({ es: `Profundidades en ${drill.from_column && drill.to_column ? `${drill.from_column}–${drill.to_column}` : drill.depth_column}.`, en: `Depths from ${drill.from_column && drill.to_column ? `${drill.from_column}–${drill.to_column}` : drill.depth_column}.` })}</p>}
    </div>
  );
}

const EMPTY: ReadonlySet<number> = new Set();
/** A drill setup the engine can use: hole id plus from/to or depth. */
const drillReady = (d: DrillRequest | null): d is DrillRequest => !!d && !!d.hole_column && (!!(d.from_column && d.to_column) || !!d.depth_column);
const q = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const fmtKm = (m: number) => (m >= 1000 ? `${fmtLimit(m / 1000)} km` : `${fmtLimit(m)} m`);

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return <button title={title} aria-label={title} onClick={onClick} className="grid h-7 min-w-7 place-items-center rounded-md px-1 text-muted hover:bg-hover hover:text-fg">{children}</button>;
}
