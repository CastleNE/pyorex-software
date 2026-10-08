import { useMemo, type ReactNode } from 'react';
import Icon, { type PxIconName } from './Icon';
import { DDH, MINERALS, SAMPLES, SECTORS, asi, euAnomaly, matchScores, median, mgNumber, tasName } from './data';
import { useApp, TITLES, type Layers, type WinType } from './store';
import { useResolved } from './resolve';
import { fmt, symbolPath } from './viz';
import { MapLayerPanel } from './MapLayers';
import { SectionLayerPanel } from './Section';
import { HOLES, N_INTERVALS } from './sim3d';
import { useL } from './i18n';

const WIN_ICON: Record<WinType, PxIconName> = {
  tas: 'tas', xy: 'scatter', spider: 'spider', map: 'map', table: 'table', hist: 'stats', stats: 'stats', profile: 'import', pipeline: 'code',
  spectrum: 'spectrum', speclog: 'log', vector: 'scatter', match: 'library', petro: 'magnet', ternary: 'ternary', models: 'cube', builder: 'sliders', section: 'splice',
};
export { WIN_ICON };

const Seg = <T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) =>
  <div className="px-seg">{options.map(([v, l]) => <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}</div>;

function Tree({ icon, label, right, on, onClick, depth = 0 }: { icon: PxIconName; label: ReactNode; right?: ReactNode; on?: boolean; onClick?: () => void; depth?: number }) {
  return <div className={`tr ${on ? 'tr--on' : ''}`} style={{ paddingLeft: 8 + depth * 16 }} onClick={onClick}><Icon name={icon} size={15} /><span className="tr-l">{label}</span>{right}</div>;
}

/* ---------------- Proyecto (Contents, ArcGIS-like) ---------------- */
export function ProjectPanel() {
  const windows = useApp(s => s.windows), activeId = useApp(s => s.activeId), focus = useApp(s => s.focus), open = useApp(s => s.open), user = useApp(s => s.userClasses), patch = useApp(s => s.patchWin);
  const R = useResolved();
  const userCls = useMemo(() => { const m = new Map<string, number>(); for (const v of Object.values(user)) m.set(v, (m.get(v) ?? 0) + 1); return [...m]; }, [user]);
  return <div className="pp">
    <div className="pp-h">Datos</div>
    <Tree icon="table" label={<>geoquimica_2026.csv <small className="muted">· {SAMPLES.length} filas</small></>} onClick={() => open('table')} />
    {SECTORS.map(s => <Tree key={s} depth={1} icon="filter" label={s} right={<span className="px-num">{SAMPLES.filter(x => x.sector === s).length}</span>} />)}
    <Tree icon="drill" label={<>Sondajes_Oxapampa.csv <small className="muted">· {HOLES.length} sondajes · {N_INTERVALS} intervalos</small></>} onClick={() => useApp.getState().open('section', { tt: { es: 'Sección A–A′', en: 'Section A–A′' } }, 'Sección A–A′', { w: 760, h: 460 })} />
    <Tree icon="map" label={<>DEM · Copernicus GLO-30 <small className="muted">· 30 m · simulado</small></>} />
    <Tree icon="drill" label={<>DDH-04 · espectros <small className="muted">· {DDH.length}</small></>} onClick={() => open('speclog', {}, undefined, { w: 380, h: 520 })} />
    <div className="pp-h">Vistas abiertas <span className="px-num">{windows.length}</span></div>
    {windows.length === 0 && <p className="muted pp-empty">Ninguna vista. Ábrelas desde la cinta.</p>}
    {[...windows].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })).map(w =>
      <Tree key={w.id} icon={WIN_ICON[w.type]} on={w.id === activeId} label={<WinTitle win={w} />} onClick={() => { focus(w.id); if (w.min) patch(w.id, { min: false }); }}
        right={w.min ? <small className="muted">min.</small> : undefined} />)}
    <div className="pp-h">Simbología activa</div>
    <div style={{ padding: '2px 10px 6px' }}>{R.cats.slice(0, 8).map(c => <div key={c.name} className="pp-leg"><svg width="14" height="14" viewBox="-7 -7 14 14"><path d={symbolPath(c.shape, 10)} fill={c.color} /></svg><span>{c.name}</span><span className="px-num">{c.n}</span></div>)}</div>
    <div className="pp-h">Clases de usuario</div>
    {userCls.length === 0 ? <p className="muted pp-empty">Selecciona con el lazo y pulsa «Crear clase».</p> :
      userCls.map(([n, c]) => <Tree key={n} icon="classify" label={n} right={<span className="px-num">{c}</span>} />)}
  </div>;
}

/* ---------------- Capas (per-window overlays) ---------------- */
const SCATTER: WinType[] = ['tas', 'xy', 'map', 'vector'];
export function LayersPanel() {
  const win = useApp(s => s.windows.find(w => w.id === s.activeId)); const setLayers = useApp(s => s.setLayers), set = useApp(s => s.set);
  if (!win) return <p className="muted pp-empty">Activa una ventana para editar sus capas.</p>;
  const L = win.layers; const S = (p: Partial<Layers>) => setLayers(win.id, p);
  const scatter = SCATTER.includes(win.type);
  const Row = ({ icon, title, sub, children }: { icon: PxIconName; title: string; sub?: string; children: ReactNode }) =>
    <div className="ly"><div className="ly-h"><Icon name={icon} size={16} /><div><b>{title}</b>{sub && <small>{sub}</small>}</div></div>{children}</div>;
  return <div className="pp">
    <div className="ly-win"><Icon name={WIN_ICON[win.type]} size={16} /><b><WinTitle win={win} /></b><span className="px-chip" style={{ marginLeft: 'auto' }}>ventana activa</span></div>
    {win.type === 'map' && <MapLayerPanel win={win} />}
    {win.type === 'section' && <SectionLayerPanel win={win} />}
    {!scatter && <p className="muted pp-empty">Esta vista tiene capas limitadas. Las superposiciones completas (densidad, elipses, envolventes, regresión, marginales) están en diagramas XY, TAS, mapa y vectores.</p>}
    <Row icon="scatter" title="Puntos" sub="Estilo desde el Editor"><label className="ly-sw"><input type="checkbox" checked={L.points} onChange={e => S({ points: e.target.checked })} />Visibles</label><button className="ed-link" onClick={() => set({ fly: 'style' })}>Editar simbología →</button></Row>
    {scatter && <>
      <Row icon="density" title="Densidad (KDE 2D)" sub="Kernel gaussiano, ancho de banda de Scott">
        <Seg value={L.density} onChange={v => S({ density: v })} options={[['off', 'No'], ['contours', 'Isolíneas'], ['filled', 'Relleno'], ['heat', 'Calor']]} />
        {L.density !== 'off' && <>
          <Seg value={L.densityBy} onChange={v => S({ densityBy: v })} options={[['group', 'Por grupo'], ['all', 'Todas las muestras']]} />
          <label className="ly-sl"><span>Ancho de banda</span><input type="range" min={0.4} max={2.5} step={0.05} value={L.bw} onChange={e => S({ bw: +e.target.value })} /><span className="mono">×{L.bw.toFixed(2)}</span></label>
        </>}
      </Row>
      <Row icon="ellipse" title="Elipses de confianza" sub="Covarianza por grupo"><Seg value={L.ellipse} onChange={v => S({ ellipse: v })} options={[['off', 'No'], ['1s', '1σ (68 %)'], ['95', '95 %']]} /></Row>
      <Row icon="hull" title="Envolvente convexa" sub="Por grupo"><label className="ly-sw"><input type="checkbox" checked={L.hull} onChange={e => S({ hull: e.target.checked })} />Mostrar</label></Row>
      <Row icon="regression" title="Regresión lineal" sub="Mínimos cuadrados con R²"><Seg value={L.regression} onChange={v => S({ regression: v })} options={[['off', 'No'], ['all', 'Global'], ['group', 'Por grupo']]} /></Row>
      <Row icon="marginal" title="Distribuciones marginales"><Seg value={L.marginals} onChange={v => S({ marginals: v })} options={[['off', 'No'], ['hist', 'Histograma'], ['box', 'Caja']]} /></Row>
      <Row icon="label" title="Etiquetas"><Seg value={L.labels} onChange={v => S({ labels: v })} options={[['off', 'No'], ['id', 'ID'], ['value', 'Valor color']]} /></Row>
    </>}
    {(win.type === 'tas') && <Row icon="tas" title="Campos de clasificación"><label className="ly-sw"><input type="checkbox" checked={L.fields} onChange={e => S({ fields: e.target.checked })} />Middlemost (1994)</label></Row>}
    <Row icon="grid" title="Cuadrícula y leyenda"><label className="ly-sw"><input type="checkbox" checked={L.grid} onChange={e => S({ grid: e.target.checked })} />Cuadrícula</label><label className="ly-sw"><input type="checkbox" checked={L.legend} onChange={e => S({ legend: e.target.checked })} />Leyenda en gráfico</label></Row>
    <div className="ly-foot"><button className="px-btn px-btn--sm" onClick={() => { const { windows } = useApp.getState(); for (const w of windows) if (w.id !== win.id && SCATTER.includes(w.type)) setLayers(w.id, { ...L, fields: w.type === 'tas' ? L.fields : w.layers.fields }); useApp.getState().notify('Capas copiadas a todos los diagramas de dispersión.'); }}><Icon name="layers" size={14} />Aplicar a todos los diagramas</button></div>
  </div>;
}

/* ---------------- Inspector ---------------- */
const KEYS: [string, string, (s: (typeof SAMPLES)[number]) => number | null, string][] = [
  ['SiO2', 'SiO₂', s => s.SiO2, 'wt%'], ['alk', 'Na₂O+K₂O', s => s.Na2O + s.K2O, 'wt%'], ['MgO', 'MgO', s => s.MgO, 'wt%'],
  ['Cu', 'Cu', s => s.Cu, 'ppm'], ['Mo', 'Mo', s => s.Mo, 'ppm'], ['Sr', 'Sr', s => s.Sr, 'ppm'], ['Rb', 'Rb', s => s.Rb, 'ppm'],
];
export function Inspector() {
  const module = useApp(s => s.module);
  return module === 'spec' || module === 'petro' ? <IntervalInspector /> : <SampleInspector />;
}
function SampleInspector() {
  const sel = useApp(s => s.selection), fs = useApp(s => s.focusSample), select = useApp(s => s.select); const R = useResolved();
  const i = fs ?? sel[0];
  if (i == null) return <div className="pp"><p className="muted pp-empty"><Icon name="lasso" size={16} /> Selecciona muestras en cualquier gráfico, tabla o mapa. Todo está vinculado.</p></div>;
  const s = SAMPLES[i]; const v = R.vis[i]; const peers = SAMPLES.filter(x => x.sector === s.sector);
  const tot = s.total;
  return <div className="pp ins">
    <div className="ins-h">
      <svg width="28" height="28" viewBox="-14 -14 28 28"><path d={symbolPath(v.shape, 20)} fill={v.color} stroke="rgba(0,0,0,.3)" /></svg>
      <div><div className="px-name mono">{s.id}</div><small className="muted">{s.sector} · {v.cat}</small></div>
    </div>
    <div className="ins-chips"><span className="px-chip px-chip--accent">{tasName(s)}</span><span className="px-chip">ASI {asi(s)}</span><span className="px-chip">Mg# {mgNumber(s)}</span><span className="px-chip">Eu/Eu* {euAnomaly(s)}</span></div>
    {sel.length > 1 && <div className="ins-nav"><button className="px-btn px-btn--sm px-btn--ghost" onClick={() => { const k = sel.indexOf(i); useApp.setState({ focusSample: sel[(k - 1 + sel.length) % sel.length] }); }}>‹</button><span className="muted">{sel.indexOf(i) + 1} de {sel.length} seleccionadas</span><button className="px-btn px-btn--sm px-btn--ghost" onClick={() => { const k = sel.indexOf(i); useApp.setState({ focusSample: sel[(k + 1) % sel.length] }); }}>›</button></div>}
    <div className="pp-h">Valores <small className="muted" style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}>barra = rango del sector · marca = mediana</small></div>
    <dl className="px-kv" style={{ padding: '0 10px' }}>{KEYS.map(([k, l, g, u]) => {
      const x = g(s); const pv = peers.map(g).filter((n): n is number => n != null); const lo = Math.min(...pv), hi = Math.max(...pv), md = median(pv);
      const t = (n: number) => `${Math.max(0, Math.min(100, ((n - lo) / (hi - lo || 1)) * 100))}%`;
      return <div key={k} style={{ display: 'contents' }}><dt>{l} <small>{u}</small></dt><dd>{x == null ? <span className="px-chip px-chip--warn">&lt;LD</span> : fmt(x)}</dd><div className="px-bar"><i style={{ width: x == null ? 0 : t(x) }} /><b style={{ left: t(md) }} /></div></div>;
    })}</dl>
    <div className="pp-h">Calidad</div>
    <div className="ins-q"><Icon name={Math.abs(tot - 100) > 1.5 ? 'warn' : 'check'} size={15} className={Math.abs(tot - 100) > 1.5 ? 'warn' : 'acc'} />Total de óxidos <b className="mono">{tot.toFixed(2)} %</b></div>
    <div className="ins-q"><Icon name={s.Ta == null ? 'warn' : 'check'} size={15} className={s.Ta == null ? 'warn' : 'acc'} />Ta {s.Ta == null ? 'bajo límite de detección' : `${s.Ta} ppm`}</div>
    <div className="pp-h">Ubicación · UTM 18S</div>
    <dl className="px-kv" style={{ padding: '0 10px 10px' }}><dt>Este</dt><dd>{s.east.toLocaleString('es-PE')}</dd><dt>Norte</dt><dd>{s.north.toLocaleString('es-PE')}</dd></dl>
    <div style={{ padding: '0 10px 12px', display: 'flex', gap: 6 }}><button className="px-btn px-btn--sm" onClick={() => useApp.getState().open('map')}><Icon name="map" size={14} />Ver en mapa</button><button className="px-btn px-btn--sm px-btn--ghost" onClick={() => select([i])}>Solo esta</button></div>
  </div>;
}
function IntervalInspector() {
  const k = useApp(s => s.focusInterval); const iv = DDH[k]; const m = useMemo(() => matchScores(iv), [iv]);
  return <div className="pp ins">
    <div className="ins-h"><span className="ins-sw" style={{ background: MINERALS[iv.mineral]?.color }} /><div><div className="px-name mono">{iv.from.toFixed(1)}–{iv.to.toFixed(1)} m</div><small className="muted">DDH-04 · intervalo {k + 1} de {DDH.length}</small></div></div>
    <div className="ins-chips"><span className="px-chip px-chip--accent">{MINERALS[iv.mineral]?.label}</span>{iv.saturated && <span className="px-chip px-chip--warn">Saturado</span>}</div>
    <div className="pp-h">Parámetros espectrales</div>
    <dl className="px-kv" style={{ padding: '0 10px' }}><dt>Al-OH (nm)</dt><dd>{iv.aloh?.toFixed(1) ?? '—'}</dd><dt>Cristalinidad</dt><dd>{iv.cryst?.toFixed(2) ?? '—'}</dd><dt>Ajuste</dt><dd>{iv.score?.toFixed(2) ?? '—'}</dd><dt>Cu (ppm)</dt><dd>{fmt(iv.cu)}</dd></dl>
    <div className="pp-h">Candidatos de biblioteca</div>
    <div style={{ padding: '0 10px 10px' }}>{m.slice(0, 4).map(x => <div key={x.mineral} className="ins-m"><span className="ins-sw" style={{ background: MINERALS[x.mineral]?.color }} /><span>{MINERALS[x.mineral]?.label ?? x.mineral}</span><span className="px-meter"><i style={{ width: `${x.score * 100}%` }} /></span><span className="mono">{x.score.toFixed(2)}</span></div>)}</div>
    <div style={{ padding: '0 10px 12px', display: 'flex', gap: 6 }}><button className="px-btn px-btn--sm" onClick={() => useApp.getState().set({ focusInterval: Math.max(0, k - 1) })}>‹ Anterior</button><button className="px-btn px-btn--sm" onClick={() => useApp.getState().set({ focusInterval: Math.min(DDH.length - 1, k + 1) })}>Siguiente ›</button></div>
  </div>;
}

/* ---------------- Historial ---------------- */
export function HistoryPanel() {
  const h = useApp(s => s.history), open = useApp(s => s.open);
  return <div className="pp">
    <div className="pp-h">Pasos reproducibles <span className="px-num">{h.length}</span></div>
    {h.length === 0 && <p className="muted pp-empty">Cada clasificación, filtro y cambio de estilo queda registrado aquí y se puede exportar como script de Python.</p>}
    <ol className="hist">{h.map((st, k) => <li key={st.id}><span className="hist-n">{k + 1}</span><Icon name={(st.icon as PxIconName) ?? 'history'} size={15} /><div><b>{st.title}</b><small>{st.detail}</small></div></li>)}</ol>
    <div style={{ padding: 10 }}><button className="px-btn px-btn--sm" onClick={() => open('pipeline', {}, undefined, { w: 560, h: 420 })}><Icon name="code" size={14} />Exportar como script</button></div>
  </div>;
}

export const TITLE_OF = TITLES;

export function WinTitle({ win }: { win: { title: string; opts: Record<string, any> } }) { const L = useL(); return <>{win.opts.tt ? L(win.opts.tt) : win.title}</>; }
