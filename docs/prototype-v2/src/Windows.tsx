import { useMemo, useState, type ReactNode } from 'react';
import Icon, { type PxIconName } from './Icon';
import PlotXY from './PlotXY';
import { Histogram, PETRO_TRACKS, SPEC_TRACKS, Spider, SpectrumPlot, StripLog, Ternary, VectorPlot } from './plots';
import { DDH, MINERALS, NUM_VARS, SAMPLES, SECTORS, TAS_FIELDS, matchScores, median, numVar, quantile, tasName } from './data';
import { useApp, type Layers, type Win } from './store';
import { useResolved } from './resolve';
import { fmt, symbolPath } from './viz';
import { MapSurface, MapContours, ModelsWin, SurfaceBar, crsLabel } from './MapLayers';
import { surfOf } from './surface';
import { BuilderWin } from './Builder';
import { SectionWin, SectionOnMap, SectionDraw } from './Section';

const Tool = ({ icon, on, title, onClick }: { icon: PxIconName; on?: boolean; title: string; onClick: () => void }) =>
  <button className="px-tool" aria-pressed={!!on} title={title} aria-label={title} onClick={onClick}><Icon name={icon} size={16} /></button>;

function PlotTools({ win, children }: { win: Win; children?: ReactNode }) {
  const patch = useApp(s => s.patchWin), setLayers = useApp(s => s.setLayers), set = useApp(s => s.set); const L = win.layers; const tool = win.opts.tool ?? 'lasso';
  const T = (t: string) => patch(win.id, { opts: { ...win.opts, tool: t } }); const S = (p: Partial<Layers>) => setLayers(win.id, p);
  return <div className="px-win__tools">
    <Tool icon="pointer" title="Seleccionar (clic o recuadro)" on={tool === 'box'} onClick={() => T('box')} />
    <Tool icon="lasso" title="Lazo" on={tool === 'lasso'} onClick={() => T('lasso')} />
    <Tool icon="pan" title="Mover (rueda = zoom, doble clic = restablecer)" on={tool === 'pan'} onClick={() => T('pan')} />
    <span className="px-sep" />
    <Tool icon="density" title="Densidad de puntos" on={L.density !== 'off'} onClick={() => S({ density: L.density === 'off' ? 'filled' : 'off' })} />
    <Tool icon="ellipse" title="Elipses de confianza 95 %" on={L.ellipse !== 'off'} onClick={() => S({ ellipse: L.ellipse === 'off' ? '95' : 'off' })} />
    <Tool icon="hull" title="Envolventes convexas" on={L.hull} onClick={() => S({ hull: !L.hull })} />
    <Tool icon="regression" title="Regresión por grupo" on={L.regression !== 'off'} onClick={() => S({ regression: L.regression === 'off' ? 'group' : 'off' })} />
    <Tool icon="marginal" title="Distribuciones marginales" on={L.marginals !== 'off'} onClick={() => S({ marginals: L.marginals === 'off' ? 'hist' : 'off' })} />
    <Tool icon="label" title="Etiquetas" on={L.labels !== 'off'} onClick={() => S({ labels: L.labels === 'off' ? 'id' : 'off' })} />
    <Tool icon="legend" title="Leyenda" on={L.legend} onClick={() => S({ legend: !L.legend })} />
    <span className="px-sep" />
    <button className="px-btn px-btn--sm px-btn--ghost" onClick={() => set({ fly: 'layers' })}><Icon name="layers" size={14} />{useApp.getState().lang === 'es' ? 'Capas…' : 'Layers…'}</button>
    <span style={{ flex: 1 }} />{children}
  </div>;
}

const Sel = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) =>
  <label className="px-inline"><span className="muted">{label}</span><select value={value} onChange={e => onChange(e.target.value)} className="px-mini">{NUM_VARS.map(v => <option key={v.key} value={v.key}>{v.label}{v.unit ? ` (${v.unit})` : ''}</option>)}</select></label>;

function Foot({ children }: { children: ReactNode }) { return <div className="px-win__foot">{children}</div>; }
function useCounts() {
  const R = useResolved(), isolate = useApp(s => s.isolate), sel = useApp(s => s.selection);
  const shown = SAMPLES.filter(s => R.vis[s.i].visible && (!isolate || sel.includes(s.i))).length; return { shown, sel: sel.length };
}
function LinkedFoot({ extra }: { extra?: ReactNode }) {
  const c = useCounts(); const es = useApp(s => s.lang) === 'es';
  return <Foot><span><span className="mono">{c.shown}</span> {es ? 'de' : 'of'} {SAMPLES.length} {es ? 'muestras visibles' : 'samples visible'}</span>{extra}<span style={{ flex: 1 }} /><span className="px-dot" style={{ background: 'var(--accent)' }} /><span>{es ? 'Vinculado a selección' : 'Linked to selection'}{c.sel ? ` · ${c.sel}` : ''}</span></Foot>;
}

export function WindowBody({ win }: { win: Win }) {
  const patch = useApp(s => s.patchWin), setStyle = useApp(s => s.setStyle), log = useApp(s => s.log), notify = useApp(s => s.notify);
  const o = win.opts; const P = (p: Record<string, any>) => patch(win.id, { opts: { ...o, ...p, view: undefined } });
  switch (win.type) {
    case 'tas': {
      const points = useMemo(() => SAMPLES.map(s => ({ i: s.i, x: s.SiO2, y: +(s.Na2O + s.K2O).toFixed(2) })), []);
      const toColumn = () => { setStyle(st => ({ ...st, color: { ...st.color, mode: 'category', catVar: 'tas' } })); log({ icon: 'classify', title: 'Clasificar TAS plutónico', detail: 'nueva columna Litologia_TAS', code: 'df["Litologia_TAS"] = px.classify.tas(df, kind="plutonic")' }); notify('Clasificación escrita en «Litología (TAS)». El color ahora sigue esa columna.'); };
      return <><PlotTools win={win}><button className="px-chip px-chip--accent" onClick={toColumn} style={{ border: 0, cursor: 'pointer' }}><Icon name="classify" size={13} />Clasificación → columna</button></PlotTools>
        <div className="px-win__plot"><PlotXY win={win} points={points} xLabel="SiO₂ (wt%)" yLabel="Na₂O + K₂O (wt%)" domain={{ x: [40, 80], y: [0, 16] }} fields={TAS_FIELDS} /></div>
        <LinkedFoot extra={<span className="muted">· Middlemost (1994)</span>} /></>;
    }
    case 'xy': {
      const X = numVar(o.x ?? 'SiO2'), Y = numVar(o.y ?? 'K2O');
      const points = useMemo(() => SAMPLES.map(s => ({ i: s.i, x: X.get(s), y: Y.get(s) })).filter((p): p is { i: number; x: number; y: number } => p.x != null && p.y != null), [X, Y]);
      return <><PlotTools win={win}><Sel label="X" value={X.key} onChange={v => P({ x: v })} /><Tool icon="log" title="Log X" on={!!o.logX} onClick={() => P({ logX: !o.logX })} /><Sel label="Y" value={Y.key} onChange={v => P({ y: v })} /><Tool icon="log" title="Log Y" on={!!o.logY} onClick={() => P({ logY: !o.logY })} /></PlotTools>
        <div className="px-win__plot"><PlotXY win={win} points={points} xLabel={`${X.label}${X.unit ? ` (${X.unit})` : ''}`} yLabel={`${Y.label}${Y.unit ? ` (${Y.unit})` : ''}`} logX={!!o.logX} logY={!!o.logY} valueText={i => fmt(Y.get(SAMPLES[i]) ?? 0)} /></div><LinkedFoot /></>;
    }
    case 'map': {
      const points = useMemo(() => SAMPLES.map(s => ({ i: s.i, x: s.east, y: s.north })), []);
      const crs = useApp(s => s.projectCrs);
      return <><PlotTools win={win}><button className="px-chip" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => { useApp.setState({ drawSection: true, showSection: true }); useApp.getState().notify(useApp.getState().lang === 'es' ? 'Haz clic en el mapa para A y luego para A′.' : 'Click the map for A, then for A′.'); }}><Icon name="splice" size={13} />A–A′</button>{(o.surface || o.outlines) && <span className="px-chip px-chip--accent" style={{ whiteSpace: 'nowrap' }}><Icon name="density" size={13} />{surfOf(o).var} · {surfOf(o).method.toUpperCase()}</span>}</PlotTools>
        <div className="px-win__plot"><PlotXY win={win} points={points} xLabel={`Este (m) · ${crsLabel(crs)}`} yLabel="Norte (m)" equal padLeft={86} valueText={i => String(SAMPLES[i].Cu)}
          under={(sx, sy) => <><MapSurface win={win} sx={sx} sy={sy} /><MapContours win={win} sx={sx} sy={sy} /></>}
          over={(sx, sy) => { const x0 = 448000, y0 = 8790000; return <g><SectionOnMap sx={sx} sy={sy} /><SectionDraw sx={sx} sy={sy} /><line x1={sx(x0)} x2={sx(x0 + 20000)} y1={sy(y0)} y2={sy(y0)} stroke="var(--text)" strokeWidth={3} /><text className="px-tick" x={sx(x0 + 10000)} y={sy(y0) - 6} textAnchor="middle" style={{ fill: 'var(--text)' }}>20 km</text><g transform={`translate(${sx(470000)},${sy(8985000)})`}><path d="M0,-14L6,6L0,2L-6,6Z" fill="var(--text)" /><text className="px-tick" y={20} textAnchor="middle" style={{ fill: 'var(--text)', fontWeight: 600 }}>N</text></g></g>; }} /></div>
        <LinkedFoot extra={<><span className="muted">· {crsLabel(crs)}</span><SurfaceBar win={win} /></>} /></>;
    }
    case 'models': return <ModelsWin />;
    case 'builder': return <BuilderWin win={win} />;
    case 'section': return <SectionWin win={win} />;
    case 'spider': return <><div className="px-win__tools"><div className="px-seg" style={{ width: 240 }}><button aria-pressed={(o.mode ?? 'samples') === 'samples'} onClick={() => P({ mode: 'samples' })}>Muestras</button><button aria-pressed={o.mode === 'envelope'} onClick={() => P({ mode: 'envelope' })}>Mediana + rango</button></div><span style={{ flex: 1 }} /><span className="muted" style={{ fontSize: 11.5 }}>Clic en una línea para seleccionar</span></div>
      <div className="px-win__plot"><Spider win={win} /></div><LinkedFoot extra={<span className="muted">· Condrito, Sun & McDonough (1989)</span>} /></>;
    case 'hist': return <><div className="px-win__tools"><Sel label="Variable" value={o.var ?? 'Cu'} onChange={v => P({ var: v })} /><Tool icon="log" title="Escala log" on={o.log ?? true} onClick={() => P({ log: !(o.log ?? true) })} /><label className="px-inline"><span className="muted">Clases</span><input type="range" min={8} max={60} value={o.bins ?? 24} onChange={e => P({ bins: +e.target.value })} /></label></div>
      <div className="px-win__plot"><Histogram win={win} /></div><LinkedFoot extra={<span className="muted">· barras apiladas por categoría</span>} /></>;
    case 'ternary': return <><div className="px-win__tools"><span className="muted" style={{ fontSize: 11.5 }}>{o.tern ? o.cite ?? '' : 'AFM · Irvine & Baragar (1971)'} · clic para seleccionar</span>{o.status === 'prop' && <span className="px-chip px-chip--warn" style={{ marginLeft: 8 }}>Propuesto · campos pendientes</span>}</div><div className="px-win__plot"><Ternary win={win} /></div><LinkedFoot /></>;
    case 'table': return <TableWin />;
    case 'stats': return <StatsWin win={win} />;
    case 'profile': return <ProfileWin />;
    case 'pipeline': return <PipelineWin />;
    case 'spectrum': return <><div className="px-win__tools"><div className="px-seg" style={{ width: 230 }}>{(['vnir', 'swir', 'full'] as const).map(r => <button key={r} aria-pressed={(o.range ?? 'swir') === r} onClick={() => P({ range: r })}>{r === 'full' ? 'Completo' : r.toUpperCase()}</button>)}</div><span style={{ flex: 1 }} /><SpecLegend /></div><div className="px-win__plot"><SpectrumPlot win={win} /></div><Foot><span>Empalmes de detector sombreados (~1000 y ~1830 nm)</span><span style={{ flex: 1 }} /><span className="px-dot" style={{ background: 'var(--accent)' }} />Vinculado al log</Foot></>;
    case 'speclog': return <><div className="px-win__plot" style={{ padding: 0 }}><StripLog tracks={SPEC_TRACKS} /></div><Foot><span>DDH-04 · clic en una profundidad para inspeccionarla</span></Foot></>;
    case 'petro': return <><div className="px-win__plot" style={{ padding: 0 }}><StripLog tracks={PETRO_TRACKS} /></div><Foot><span>KT-10 + balanza hidrostática · DDH-04</span></Foot></>;
    case 'vector': return <><div className="px-win__plot"><VectorPlot /></div><Foot><span>{DDH.filter(d => d.aloh != null && d.cryst != null).length} intervalos con illita/muscovita · tamaño = Cu</span></Foot></>;
    case 'match': return <MatchWin />;
  }
}

function SpecLegend() { const f = useApp(s => s.focusInterval); const a = DDH[f], b = DDH[Math.min(DDH.length - 1, f + 1)]; return <span className="px-row" style={{ gap: 10, fontSize: 11.5, color: 'var(--text-muted)' }}><span className="px-row" style={{ gap: 4 }}><i style={{ width: 14, height: 2, background: MINERALS[a.mineral].color }} />{a.from + 2} m</span><span className="px-row" style={{ gap: 4 }}><i style={{ width: 14, height: 2, background: MINERALS[b.mineral].color, opacity: 0.6 }} />{b.from + 2} m</span><span className="px-row" style={{ gap: 4 }}><i style={{ width: 14, borderTop: '1.5px dashed var(--text)' }} />Ref.</span></span>; }

function MatchWin() {
  const f = useApp(s => s.focusInterval); const iv = DDH[f]; const rows = matchScores(iv);
  return <><div style={{ flex: 1, overflow: 'auto' }}>{rows.map((r, k) => <div key={r.mineral} className="px-row" style={{ height: 44, gap: 10, padding: '0 12px', borderBottom: '1px solid var(--border)', background: k === 0 ? 'var(--bg-selected)' : undefined }}>
    <span style={{ width: 12, height: 12, borderRadius: 3, background: MINERALS[r.mineral].color }} /><div style={{ flex: 1, minWidth: 0, lineHeight: '15px' }}><b style={{ fontWeight: k ? 500 : 600 }}>{MINERALS[r.mineral].label}</b><div className="muted" style={{ fontSize: 11 }}>{r.source}</div></div>
    <div style={{ width: 80 }}><div className="px-meter"><i style={{ width: `${r.score * 100}%`, background: r.score >= 0.85 ? 'var(--accent)' : 'var(--border-strong)' }} /></div></div><span className="px-num" style={{ width: 34 }}>{r.score.toFixed(2)}</span></div>)}</div>
    <Foot><span>DDH-04 · {iv.from}–{iv.to} m · umbral 0.85</span></Foot></>;
}

function TableWin() {
  const sel = useApp(s => s.selection), select = useApp(s => s.select), isolate = useApp(s => s.isolate); const R = useResolved();
  const [first, setFirst] = useState(true); const [sort, setSort] = useState<{ k: string; d: 1 | -1 }>({ k: 'id', d: 1 });
  const selSet = new Set(sel);
  const cols: { k: string; h: string; u?: string; get: (s: typeof SAMPLES[0]) => any }[] = [
    { k: 'id', h: 'ID', get: s => s.id }, { k: 'sector', h: 'Sector', get: s => s.sector }, { k: 'tas', h: 'Litología (TAS)', get: s => tasName(s) },
    ...['SiO2', 'K2O', 'alk', 'mg', 'Cu', 'Rb', 'Ta', 'eu'].map(k => { const v = numVar(k); return { k, h: v.label, u: v.unit, get: (s: typeof SAMPLES[0]) => v.get(s) }; }),
  ];
  const c = cols.find(x => x.k === sort.k)!;
  let rows = SAMPLES.filter(s => R.vis[s.i].visible && (!isolate || selSet.has(s.i)));
  rows = [...rows].sort((a, b) => { const va = c.get(a), vb = c.get(b); return (va > vb ? 1 : va < vb ? -1 : 0) * sort.d; });
  if (first && sel.length) rows.sort((a, b) => (selSet.has(b.i) ? 1 : 0) - (selSet.has(a.i) ? 1 : 0));
  return <><div className="px-win__tools"><label className="px-inline" style={{ cursor: 'pointer' }}><input type="checkbox" checked={first} onChange={e => setFirst(e.target.checked)} />Selección primero</label><span style={{ flex: 1 }} /><span className="muted" style={{ fontSize: 11.5 }}>Clic en encabezado para ordenar · Shift+clic en filas para sumar</span></div>
    <div style={{ flex: 1, overflow: 'auto' }}><table className="px-table"><thead><tr>{cols.map(x => <th key={x.k} className={['id', 'sector', 'tas'].includes(x.k) ? 'l' : ''} onClick={() => setSort({ k: x.k, d: sort.k === x.k ? (-sort.d as 1 | -1) : 1 })} style={{ cursor: 'pointer' }}>{x.h}{sort.k === x.k ? (sort.d > 0 ? ' ▲' : ' ▼') : ''}{x.u && <small>{x.u}</small>}</th>)}</tr></thead>
      <tbody>{rows.slice(0, 250).map(s => <tr key={s.i} className={selSet.has(s.i) ? 'on' : ''} onClick={e => select([s.i], e.shiftKey ? 'toggle' : 'replace')} style={{ cursor: 'pointer' }}>
        {cols.map(x => { const v = x.get(s); if (x.k === 'sector') return <td key={x.k} className="l"><span className="px-row" style={{ gap: 6 }}><svg width="12" height="12" viewBox="-6 -6 12 12"><path d={symbolPath(R.vis[s.i].shape, 9)} fill={R.vis[s.i].color} /></svg>{v}</span></td>;
          return <td key={x.k} className={['id', 'tas'].includes(x.k) ? 'l' : ''}>{v == null ? <span className="ld">&lt;LD</span> : typeof v === 'number' ? fmt(v) : v}</td>; })}</tr>)}</tbody></table></div>
    <Foot><span><span className="mono">{rows.length}</span> filas{rows.length > 250 ? ' (mostrando 250)' : ''}</span><span style={{ flex: 1 }} /><span className="px-dot" style={{ background: 'var(--accent)' }} />Vinculado a selección</Foot></>;
}

function StatsWin({ win }: { win: Win }) {
  const patch = useApp(s => s.patchWin); const v = numVar(win.opts.var ?? 'Cu');
  const rows = [...SECTORS, 'Todas'].map(g => { const vals = SAMPLES.filter(s => g === 'Todas' || s.sector === g).map(s => v.get(s)).filter((x): x is number => x != null).sort((a, b) => a - b); const n = vals.length, mean = vals.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)); return { g, n, mean, sd, min: vals[0], q1: quantile(vals, .25), med: median(vals), q3: quantile(vals, .75), max: vals[n - 1], cv: sd / mean }; });
  return <><div className="px-win__tools"><Sel label="Variable" value={v.key} onChange={x => patch(win.id, { opts: { ...win.opts, var: x } })} /></div>
    <div style={{ flex: 1, overflow: 'auto' }}><table className="px-table"><thead><tr><th className="l">Grupo</th><th>n</th><th>Media</th><th>Desv. est.</th><th>CV</th><th>Mín</th><th>Q1</th><th>Mediana</th><th>Q3</th><th>Máx</th></tr></thead><tbody>
      {rows.map(r => <tr key={r.g} style={r.g === 'Todas' ? { fontWeight: 600 } : undefined}><td className="l">{r.g}</td><td>{r.n}</td><td>{fmt(r.mean)}</td><td>{fmt(r.sd)}</td><td>{r.cv.toFixed(2)}</td><td>{fmt(r.min)}</td><td>{fmt(r.q1)}</td><td>{fmt(r.med)}</td><td>{fmt(r.q3)}</td><td>{fmt(r.max)}</td></tr>)}</tbody></table></div>
    <Foot><span>{v.label} {v.unit && `(${v.unit})`} · valores &lt; LD excluidos, no imputados</span></Foot></>;
}

function ProfileWin() {
  const cards = ['SiO2', 'K2O', 'Cu', 'Ta'].map(k => { const v = numVar(k); const vals = SAMPLES.map(s => v.get(s)); const ok = vals.filter((x): x is number => x != null); return { v, ok: ok.length, ld: vals.length - ok.length, med: median(ok), hist: (() => { const lo = Math.min(...ok), hi = Math.max(...ok); const b = new Array(14).fill(0); for (const x of ok) b[Math.min(13, Math.floor(((x - lo) / (hi - lo || 1)) * 14))]++; return b; })() }; });
  return <><div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div className="px-row" style={{ gap: 18, fontSize: 12.5, flexWrap: 'wrap' }}><span><b>{SAMPLES.length}</b> muestras</span><span><b>{NUM_VARS.length + 14}</b> columnas</span><span className="muted">óxidos (wt%) · trazas (ppm) · REE</span><span style={{ color: 'var(--warning)' }}>{SAMPLES.filter(s => s.Ta == null).length} celdas con «&lt;» interpretadas como &lt; LD</span></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 10 }}>{cards.map(c => { const mx = Math.max(...c.hist); return <div key={c.v.key} className={`px-card ${c.ld ? 'px-card--hi' : ''}`}><div className="px-row px-row--between"><b>{c.v.label}</b><span className="muted" style={{ fontSize: 11 }}>{c.v.unit}</span></div>
      <svg viewBox="0 0 140 40" style={{ width: '100%', height: 40, background: 'var(--bg-sunken)', borderRadius: 4 }} preserveAspectRatio="none">{c.hist.map((h, k) => <rect key={k} x={k * 10 + 1} y={38 - (h / mx) * 34} width={8} height={(h / mx) * 34} rx={1} fill="var(--brand)" opacity={0.8} />)}</svg>
      <div className="px-row px-row--between"><span className="px-big">{fmt(c.med)}</span><span className="muted" style={{ fontSize: 11 }}>mediana</span></div>
      <div className="px-meter"><i style={{ width: `${(c.ok / SAMPLES.length) * 100}%`, background: 'var(--accent)' }} /><i style={{ width: `${(c.ld / SAMPLES.length) * 100}%`, background: 'var(--warning)' }} /></div>
      <div className="px-row" style={{ gap: 4 }}>{c.ld ? <span className="px-chip px-chip--warn">{c.ld} &lt; LD</span> : <span className="px-chip px-chip--accent">Completo</span>}</div></div>; })}</div>
    <div className="px-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Icon name="sliders" /><div style={{ flex: 1 }}><b>Tratamiento de valores &lt; LD</b><div className="muted" style={{ fontSize: 12 }}>Se registra en el historial del proyecto</div></div><div className="px-seg" style={{ width: 300 }}><button aria-pressed="true">½ LD</button><button>LD/√2</button><button>Vacío</button><button>Imputar</button></div></div>
  </div><Foot><span>Paso 3 de 3 · calidad</span><span style={{ flex: 1 }} /><button className="px-btn">Atrás</button><button className="px-btn px-btn--primary">Importar {SAMPLES.length} muestras</button></Foot></>;
}

function PipelineWin() {
  const history = useApp(s => s.history); const style = useApp(s => s.style);
  const base = [{ icon: 'import', title: 'Importar', detail: 'Intrusivos_PeruCentral.xlsx · ' + SAMPLES.length + ' muestras', code: 'df = px.read_lab("Intrusivos_PeruCentral.xlsx")' }, { icon: 'clean', title: '< LD → ½ LD', detail: 'Ta', code: 'df = px.clean.below_ld(df, method="half")' }];
  const steps = [...base, ...history];
  const code = ['# Generado por PyOreX v2 (prototipo)', 'import pyorex as px', '', ...steps.map(s => s.code), '', `style = px.Style(color=${style.color.mode === 'value' ? `px.ramp("${style.color.valueVar}", "${style.color.ramp}", method="${style.color.method}", n=${style.color.n}${style.color.log ? ', log=True' : ''})` : style.color.mode === 'category' ? `"${style.color.catVar}"` : `"${style.color.fixed}"`},`, `                 shape=${style.shape.mode === 'category' ? `"${style.shape.catVar}"` : `"${style.shape.fixed}"`}, size=${style.size.mode === 'value' ? `px.size("${style.size.valueVar}", ${style.size.min}, ${style.size.max})` : style.size.fixed})`, 'px.plot.tas(df, kind="plutonic", style=style).save("fig_TAS.svg", preset="A4_1col")'].join('\n');
  return <><div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 0 }}>
    <div style={{ borderRight: '1px solid var(--border)', overflow: 'auto', padding: '6px 10px' }} className="px-steps">{steps.map((s, k) => <div key={k} className={`px-step ${k === steps.length - 1 ? 'px-step--cur' : 'px-step--done'}`}><span className="px-step__n"><Icon name={s.icon as PxIconName} size={14} /></span><div className="px-step__t"><b>{s.title}</b><small>{s.detail}</small></div><span /></div>)}</div>
    <div style={{ padding: 10, overflow: 'auto' }}><div className="px-code">{code}</div></div></div>
    <Foot><span>Mismo resultado fuera de PyOreX · el estilo de los gráficos también se exporta</span></Foot></>;
}
