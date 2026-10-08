/**
 * Proyecto → Variables and Coordinates of the active dataset.
 *
 * Variables shows how every column was recognised (major oxides, trace elements, REE, coordinates, text…), which
 * is what turns tools on or off on the ribbon, and lets the user correct a role. Coordinates assigns the X/Y columns
 * and the CRS. Both only change dataset metadata through the Python service; values are never modified.
 */
import { useMemo, useState } from 'react';
import PxIcon from '../PxIcon';
import { useDatasetStore } from '../../stores/dataset-store';
import { useColumnRoles, useDatasetRoles } from '../../stores/column-roles-store';
import { useGeoRegistryStore } from '../../stores/geochemistry-registry-store';
import { useProject } from '../../stores/project-store';
import { AREAS, inputsCovered, ribbonFor } from '../../lib/geochem-areas';
import { anyColumnMatches, type ColumnRoleMap } from '../../lib/semantic-roles';
import { COMMON_CRS, variablesApi } from '../../lib/variables-api';
import { toDatasetInfo } from '../../lib/dataset-mapping';
import { markProjectDataChanged } from '../../lib/project-events';
import type { GeometrySource, SpatialConfig } from '../../lib/data-api';
import { useL, useT, type TKey, type Txt } from '../../lib/i18n';

const ROLE_LABEL: Record<string, Txt> = {
  major_oxide: { es: 'Óxido mayor', en: 'Major oxide' }, trace_element: { es: 'Elemento traza', en: 'Trace element' }, ree: { es: 'REE', en: 'REE' },
  assay: { es: 'Ensaye', en: 'Assay' }, ratio: { es: 'Razón', en: 'Ratio' }, easting: { es: 'Este (X)', en: 'Easting (X)' }, northing: { es: 'Norte (Y)', en: 'Northing (Y)' },
  elevation: { es: 'Cota', en: 'Elevation' }, longitude: { es: 'Longitud', en: 'Longitude' }, latitude: { es: 'Latitud', en: 'Latitude' }, hole_id: { es: 'Sondaje', en: 'Hole id' },
  depth: { es: 'Profundidad', en: 'Depth' }, depth_from: { es: 'Desde', en: 'From' }, depth_to: { es: 'Hasta', en: 'To' }, sample_id: { es: 'Id de muestra', en: 'Sample id' },
  row_index: { es: 'Índice interno', en: 'Internal index' }, categorical: { es: 'Categórica', en: 'Categorical' }, numeric_generic: { es: 'Numérica sin clasificar', en: 'Unclassified numeric' },
  unknown: { es: 'Desconocida', en: 'Unknown' },
};
const GROUPS: { id: string; roles: string[]; label: Txt }[] = [
  { id: 'major', roles: ['major_oxide'], label: { es: 'Óxidos mayores', en: 'Major oxides' } },
  { id: 'trace', roles: ['trace_element'], label: { es: 'Elementos traza', en: 'Trace elements' } },
  { id: 'ree', roles: ['ree'], label: { es: 'Tierras raras (REE)', en: 'Rare earths (REE)' } },
  { id: 'assay', roles: ['assay', 'ratio'], label: { es: 'Ensayes y razones', en: 'Assays & ratios' } },
  { id: 'space', roles: ['easting', 'northing', 'elevation', 'longitude', 'latitude'], label: { es: 'Coordenadas', en: 'Coordinates' } },
  { id: 'hole', roles: ['hole_id', 'depth', 'depth_from', 'depth_to'], label: { es: 'Sondaje y profundidad', en: 'Drillhole & depth' } },
  { id: 'ids', roles: ['sample_id', 'row_index'], label: { es: 'Identificadores', en: 'Identifiers' } },
  { id: 'cat', roles: ['categorical'], label: { es: 'Categóricas (texto)', en: 'Categorical (text)' } },
  { id: 'other', roles: ['numeric_generic', 'unknown'], label: { es: 'Sin clasificar', en: 'Unclassified' } },
];
const CHEMICAL = new Set(['major_oxide', 'trace_element', 'ree', 'assay']);
const heading = 'mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-subtle';
const field = 'h-7 min-w-0 rounded border border-line-strong bg-raised px-1.5 text-[11.5px] text-fg';

export function VariablesSection() {
  const t = useT(), L = useL();
  const dataset = useDatasetStore(s => s.dataset);
  const roles = useDatasetRoles(dataset?.id);
  const error = useColumnRoles(s => (dataset ? s.errors[dataset.id] : ''));
  const registry = useGeoRegistryStore(s => s.registry);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const coverage = useMemo(() => {
    if (!roles || !registry) return null;
    return AREAS.map(area => {
      const tools = ribbonFor(area, registry).flatMap(g => g.items).flatMap(i => (i.kind === 'tool' ? [i.tool] : []));
      const ok = tools.filter(tool => inputsCovered(tool, (r, a) => anyColumnMatches(roles, { allowed_roles: r, allowed_analytes: a })).ok).length;
      return { area, ok, total: tools.length };
    }).filter(c => c.total > 0);
  }, [roles, registry]);

  if (!dataset) return null;
  const change = async (column: string, role: string | null, analyte: string | null = null) => {
    setBusy(column); setProblem(null);
    try { await useColumnRoles.getState().setRole(dataset.id, column, role, analyte); setEditing(null); }
    catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const entries = roles ? Object.values(roles) : [];

  return <section>
    <h3 className={heading}>{t('variables')}</h3>
    {!roles && !error && <p className="text-muted">{t('serviceUnknown')}</p>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    {coverage && <div className="mb-2 rounded border border-line bg-sunken/40 px-2 py-1.5">
      <p className="mb-1 text-[11px] text-muted">{t('toolsEnabled')}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">{coverage.map(c => <span key={c.area} className="flex justify-between gap-2 text-[11px]">
        <span className="truncate text-fg">{t(`area.${c.area}` as TKey)}</span><span className={`tabular font-mono ${c.ok === c.total ? 'text-success' : 'text-muted'}`}>{c.ok}/{c.total}</span></span>)}</div>
    </div>}
    {problem && <p role="alert" className="mb-1.5 select-text text-[11px] text-danger">{problem}</p>}
    {roles && <ul className="space-y-0.5">{GROUPS.map(g => {
      const cols = entries.filter(c => g.roles.includes(c.semantic_role));
      if (!cols.length) return null;
      const isOpen = open === g.id;
      return <li key={g.id}>
        <button onClick={() => setOpen(isOpen ? null : g.id)} aria-expanded={isOpen} className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-hover">
          <span className={`text-[9px] text-subtle transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
          <span className="flex-1 truncate text-fg">{L(g.label)}</span>
          {cols.some(c => c.source === 'user') && <i title={t('userRole')} className="h-1.5 w-1.5 rounded-full bg-accent" />}
          <span className="tabular font-mono text-[11px] text-subtle">{cols.length}</span>
        </button>
        {!isOpen && g.id !== 'other' && g.id !== 'cat' && <p className="truncate pl-6 text-[10.5px] text-subtle">{cols.map(c => c.analyte ?? c.column).join(' · ')}</p>}
        {isOpen && <ul className="mb-1 ml-3 border-l border-line pl-2">{cols.map(c => <ColumnRow key={c.column} c={c} editing={editing === c.column} busy={busy === c.column}
          onEdit={() => setEditing(editing === c.column ? null : c.column)} onChange={(r, a) => void change(c.column, r, a)} />)}</ul>}
      </li>;
    })}</ul>}
    <p className="mt-1.5 text-[10.5px] leading-snug text-subtle">{t('rolesHint')}</p>
  </section>;
}

function ColumnRow({ c, editing, busy, onEdit, onChange }: { c: ColumnRoleMap[string]; editing: boolean; busy: boolean; onEdit: () => void; onChange: (role: string | null, analyte: string | null) => void }) {
  const t = useT(), L = useL();
  const [role, setRole] = useState(c.semantic_role);
  const [analyte, setAnalyte] = useState(c.analyte ?? '');
  return <li className="py-0.5">
    <div className="flex items-center gap-1.5">
      <button onClick={onEdit} title={t('changeRole')} className="min-w-0 flex-1 truncate text-left font-mono text-[11px] text-fg hover:underline">{c.column}</button>
      {c.analyte && <span className="rounded bg-sunken px-1 text-[10px] text-muted">{c.analyte}</span>}
      {c.unit && <span className="text-[10px] text-subtle">{c.unit}</span>}
      {c.source === 'user' && <span className="rounded bg-accent-soft px-1 text-[10px] text-accent-fg">{t('userRole')}</span>}
      {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />}
    </div>
    {editing && <div className="mt-1 flex flex-wrap items-center gap-1">
      <select aria-label={t('changeRole')} value={role} onChange={e => setRole(e.target.value)} className={`${field} flex-1`}>
        {Object.keys(ROLE_LABEL).map(r => <option key={r} value={r}>{L(ROLE_LABEL[r])}</option>)}
      </select>
      {CHEMICAL.has(role) && <input aria-label={t('analyte')} placeholder={t('analyte')} value={analyte} onChange={e => setAnalyte(e.target.value)} className={`${field} w-16`} />}
      <button onClick={() => onChange(role, CHEMICAL.has(role) && analyte.trim() ? analyte.trim() : null)} className="h-7 rounded bg-accent-strong px-2 text-[11px] font-medium text-on-accent hover:bg-accent-hover">{t('apply')}</button>
      {c.source === 'user' && <button onClick={() => onChange(null, null)} className="h-7 rounded border border-line-strong px-2 text-[11px] text-fg hover:bg-hover">{t('automatic')}</button>}
    </div>}
  </li>;
}

const SOURCES: GeometrySource[] = ['projected_xy', 'wgs84_lonlat', 'local_grid', 'none'];

export function CoordinatesSection() {
  const t = useT();
  const dataset = useDatasetStore(s => s.dataset);
  const roles = useDatasetRoles(dataset?.id);
  const projectCrs = useProject(s => s.crs);
  const [editing, setEditing] = useState(false);
  const sc = dataset?.spatialConfig ?? null;
  const [source, setSource] = useState<GeometrySource>(sc?.geometry_source ?? 'projected_xy');
  const guess = (r: string) => Object.values(roles ?? {}).find(c => c.semantic_role === r)?.column ?? '';
  const [x, setX] = useState(''), [y, setY] = useState('');
  const [crs, setCrs] = useState('');
  const [custom, setCustom] = useState('');
  const [asProject, setAsProject] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!dataset) return null;
  const numeric = dataset.columns.filter(c => c.dataType === 'numeric').map(c => c.name);
  const start = () => {
    const src = sc?.geometry_source && sc.geometry_source !== 'none' ? sc.geometry_source : 'projected_xy';
    setSource(src);
    setX(src === 'wgs84_lonlat' ? sc?.lon_col ?? guess('longitude') : sc?.east_col ?? guess('easting'));
    setY(src === 'wgs84_lonlat' ? sc?.lat_col ?? guess('latitude') : sc?.north_col ?? guess('northing'));
    const current = sc?.projected_epsg ?? projectCrs ?? 'EPSG:32718';
    setCrs(COMMON_CRS.some(c => c.epsg === current) ? current : 'other'); setCustom(COMMON_CRS.some(c => c.epsg === current) ? '' : current);
    setAsProject(!projectCrs); setProblem(null); setEditing(true);
  };
  const apply = async () => {
    const epsg = crs === 'other' ? (/^\d+$/.test(custom.trim()) ? `EPSG:${custom.trim()}` : custom.trim()) : crs;
    const config: SpatialConfig = source === 'projected_xy' ? { geometry_source: source, east_col: x, north_col: y, projected_epsg: epsg }
      : source === 'local_grid' ? { geometry_source: source, east_col: x, north_col: y } : source === 'wgs84_lonlat' ? { geometry_source: source, lon_col: x, lat_col: y } : { geometry_source: 'none' };
    setBusy(true); setProblem(null);
    try {
      const { dataset: meta } = await variablesApi.setSpatialConfig(dataset.id, config);
      markProjectDataChanged();
      const info = toDatasetInfo(meta);
      useDatasetStore.setState(s => ({ dataset: s.dataset?.id === info.id ? info : s.dataset, allDatasets: s.allDatasets.map(d => (d.id === info.id ? info : d)) }));
      if (source === 'projected_xy' && asProject) useProject.getState().setCrs(meta.spatial_config?.projected_epsg ?? epsg);
      setEditing(false);
    } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const label = (k: GeometrySource) => t(`geo.${k}` as TKey);
  return <section>
    <h3 className={heading}>{t('coordinates')}</h3>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <dt className="text-subtle">{t('geometry')}</dt><dd className="text-fg">{label(sc?.geometry_source ?? 'none')}</dd>
      {sc && sc.geometry_source !== 'none' && <><dt className="text-subtle">X / Y</dt><dd className="truncate font-mono text-fg">{(sc.geometry_source === 'wgs84_lonlat' ? [sc.lon_col, sc.lat_col] : [sc.east_col, sc.north_col]).join(' / ')}</dd></>}
      <dt className="text-subtle">CRS</dt><dd className={sc?.projected_epsg ? 'font-mono text-fg' : 'text-muted'} title={sc?.projected_crs_label ?? undefined}>{sc?.projected_epsg ?? (sc?.geometry_source === 'wgs84_lonlat' ? 'EPSG:4326' : t('noCrs'))}</dd>
      <dt className="text-subtle">{t('projectCrs')}</dt><dd className={projectCrs ? 'font-mono text-fg' : 'text-muted'}>{projectCrs ?? '—'}{projectCrs && sc?.projected_epsg && sc.projected_epsg !== projectCrs && <span className="ml-1 text-warning" title={t('crsMismatch')}>≠</span>}</dd>
    </dl>
    {!editing ? <button onClick={start} className="mt-2 flex h-7 items-center gap-1.5 rounded border border-line-strong bg-raised px-2.5 text-xs text-fg hover:bg-hover"><PxIcon name="map" className="h-4 w-4 text-muted" />{t('assignCoordinates')}</button>
      : <div className="mt-2 space-y-1.5 rounded border border-line bg-sunken/40 p-2">
        <select aria-label={t('geometry')} value={source} onChange={e => setSource(e.target.value as GeometrySource)} className={`${field} w-full`}>{SOURCES.map(s => <option key={s} value={s}>{label(s)}</option>)}</select>
        {source !== 'none' && <div className="grid grid-cols-2 gap-1.5">
          {[[x, setX, source === 'wgs84_lonlat' ? t('geo.lon') : t('geo.east')], [y, setY, source === 'wgs84_lonlat' ? t('geo.lat') : t('geo.north')]].map(([v, set, lab], i) =>
            <label key={i} className="flex min-w-0 flex-col gap-0.5 text-[10.5px] text-subtle">{lab as string}
              <select value={v as string} onChange={e => (set as (s: string) => void)(e.target.value)} className={field}><option value="">—</option>{numeric.map(n => <option key={n} value={n}>{n}</option>)}</select></label>)}
        </div>}
        {source === 'projected_xy' && <>
          <select aria-label="CRS" value={crs} onChange={e => setCrs(e.target.value)} className={`${field} w-full`}>
            {COMMON_CRS.map(c => <option key={c.epsg} value={c.epsg}>{c.label} · {c.epsg}</option>)}<option value="other">{t('otherEpsg')}</option></select>
          {crs === 'other' && <input aria-label="EPSG" placeholder="EPSG:32718" value={custom} onChange={e => setCustom(e.target.value)} className={`${field} w-full font-mono`} />}
          <label className="flex items-center gap-1.5 text-[11px] text-muted"><input type="checkbox" checked={asProject} onChange={e => setAsProject(e.target.checked)} />{t('useAsProjectCrs')}</label>
        </>}
        {problem && <p role="alert" className="select-text text-[11px] text-danger">{problem}</p>}
        <p className="text-[10.5px] leading-snug text-subtle">{t('crsHint')}</p>
        <div className="flex justify-end gap-1.5">
          <button onClick={() => setEditing(false)} className="h-7 rounded border border-line-strong px-2 text-[11px] text-fg hover:bg-hover">{t('cancel')}</button>
          <button disabled={busy || (source !== 'none' && (!x || !y))} onClick={() => void apply()} className="h-7 rounded bg-accent-strong px-2.5 text-[11px] font-medium text-on-accent hover:bg-accent-hover disabled:opacity-40">{busy ? '…' : t('apply')}</button>
        </div>
      </div>}
  </section>;
}
