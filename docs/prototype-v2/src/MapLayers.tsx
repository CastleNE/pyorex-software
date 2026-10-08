import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';
import { NUM_VARS, SAMPLES, quantile } from './data';
import { useApp, type Win } from './store';
import { RAMPS, fmt, histogram, rampCss } from './viz';
import { DEF_OUT, varOf, colorAt, contOf, contourLevels, gridFor, isolines, outOf, outlineImage, outlineStats, rangeOf, surfOf, surfaceImage, type ContOpts, type OutOpts, type SurfOpts } from './surface';
import { DEPOSIT_MODELS, TOOLS, availability } from './tools';
import { useL, useT } from './i18n';

export const CRS_LIST: { code: string; label: string; group: string }[] = [
  { code: 'EPSG:32717', label: 'WGS 84 / UTM 17S', group: 'Perú' }, { code: 'EPSG:32718', label: 'WGS 84 / UTM 18S', group: 'Perú' }, { code: 'EPSG:32719', label: 'WGS 84 / UTM 19S', group: 'Perú' },
  { code: 'EPSG:24877', label: 'PSAD56 / UTM 17S', group: 'Perú (histórico)' }, { code: 'EPSG:24878', label: 'PSAD56 / UTM 18S', group: 'Perú (histórico)' }, { code: 'EPSG:24879', label: 'PSAD56 / UTM 19S', group: 'Perú (histórico)' },
  { code: 'EPSG:4326', label: 'WGS 84 · geográficas (lat/lon)', group: 'Global' },
];
export const crsLabel = (code: string) => CRS_LIST.find(c => c.code === code)?.label ?? code;

type SX = (v: number) => number;

/* ---------------- map layers drawn under the sample points ---------------- */
export function MapSurface({ win, sx, sy }: { win: Win; sx: SX; sy: SX }) {
  const o = win.opts; if (!o.surface && !o.outlines) return null;
  const sf = surfOf(o), g = gridFor(sf), ol = outOf(o);
  const X0 = g.x0 - g.dx / 2, X1 = g.x0 + (g.nx - 0.5) * g.dx, Y0 = g.y0 - g.dx / 2, Y1 = g.y0 + (g.ny - 0.5) * g.dx;
  const box = { x: sx(X0), y: sy(Y1), width: sx(X1) - sx(X0), height: sy(Y0) - sy(Y1) };
  return <g>
    {o.surface && <image href={surfaceImage(sf, g)} {...box} opacity={sf.opacity} preserveAspectRatio="none" style={{ imageRendering: sf.smooth ? 'auto' : 'pixelated' }} />}
    {o.outlines && ol.rows.map((r, k) => ol.source === 'surface'
      ? <g key={k}><image href={outlineImage(g, r.v, r.color)} {...box} opacity={ol.fill} preserveAspectRatio="none" style={{ imageRendering: 'pixelated' }} />
          <path d={segPath(isolines(g, g.T(r.v)), sx, sy)} fill="none" stroke={r.color} strokeWidth={ol.border} strokeLinejoin="round" /></g>
      : <g key={k} opacity={ol.fill}>{SAMPLES.filter(s => (varOf(sf.var).get(s) ?? -Infinity) >= r.v).map(s => <circle key={s.i} cx={sx(s.east)} cy={sy(s.north)} r={Math.abs(sx(s.east + ol.buffer) - sx(s.east))} fill={r.color} />)}</g>)}
  </g>;
}
const segPath = (segs: [number, number, number, number][], sx: SX, sy: SX) => segs.map(([a, b, c, d]) => `M${sx(a).toFixed(1)} ${sy(b).toFixed(1)}L${sx(c).toFixed(1)} ${sy(d).toFixed(1)}`).join('');

export function MapContours({ win, sx, sy }: { win: Win; sx: SX; sy: SX }) {
  const o = win.opts; if (!o.contours) return null;
  const sf = surfOf(o), ct = contOf(o), g = gridFor(sf); const rng = rangeOf(sf);
  const levels = contourLevels(ct, sf);
  return <g opacity={ct.opacity}>{levels.map((lv, k) => {
    const segs = isolines(g, g.T(lv)); if (!segs.length) return null;
    const major = ct.major > 0 && k % ct.major === ct.major - 1; const col = ct.color === 'ink' ? 'var(--text)' : colorAt(sf, g.T(lv), rng);
    const step = Math.max(1, Math.floor(segs.length / 3)); const labs = ct.labels ? segs.filter((_, i) => i % step === Math.floor(step / 2)).slice(0, 3) : [];
    return <g key={k}><path d={segPath(segs, sx, sy)} fill="none" stroke={col} strokeWidth={ct.width * (major ? 1.8 : 1)} strokeLinecap="round" />
      {labs.map(([a, b, c, d], i) => <text key={i} x={(sx(a) + sx(c)) / 2} y={(sy(b) + sy(d)) / 2 + 3} textAnchor="middle" className="px-tick" style={{ fill: 'var(--text)', fontSize: 9.5, fontWeight: 600, paintOrder: 'stroke', stroke: 'var(--bg-raised)', strokeWidth: 3 }}>{fmt(lv)}</text>)}</g>;
  })}</g>;
}
export function SurfaceBar({ win }: { win: Win }) {
  const sf = surfOf(win.opts); if (!win.opts.surface) return null; const [lo, hi] = rangeOf(sf); const v = varOf(sf.var);
  const bg = sf.classes === 'disc' ? `linear-gradient(90deg, ${Array.from({ length: sf.n }, (_, k) => { const c = colorAt(sf, lo + ((hi - lo) * (k + 0.5)) / sf.n, [lo, hi]); return `${c} ${(k / sf.n) * 100}%, ${c} ${((k + 1) / sf.n) * 100}%`; }).join(', ')})` : rampCss(sf.ramp, sf.reverse);
  return <span className="sbar"><span className="mono">{fmt(sf.log ? 10 ** lo : lo)}</span><i style={{ background: bg }} /><span className="mono">{fmt(sf.log ? 10 ** hi : hi)}</span><span className="muted">{v.label} {v.unit}{sf.log ? ' · log' : ''}</span></span>;
}

/* ---------------- Layers flyout content for a map window ---------------- */
const Seg = <T extends string>({ value, options, onChange, disabled = [] }: { value: T; options: [T, string][]; onChange: (v: T) => void; disabled?: T[] }) =>
  <div className="px-seg">{options.map(([v, l]) => <button key={v} aria-pressed={value === v} disabled={disabled.includes(v)} title={disabled.includes(v) ? 'Motor Python · no simulado en el prototipo' : undefined} onClick={() => onChange(v)}>{l}</button>)}</div>;
const Slider = ({ label, value, min, max, step = 1, onChange, show }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; show?: string }) =>
  <label className="ly-sl"><span>{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} /><span className="mono">{show ?? value}</span></label>;
function Card({ icon, title, on, onToggle, children }: { icon: any; title: string; on?: boolean; onToggle?: (v: boolean) => void; children?: ReactNode }) {
  return <div className="ly"><div className="ly-h"><Icon name={icon} size={16} /><div style={{ flex: 1 }}><b>{title}</b></div>{onToggle && <label className="sw"><input type="checkbox" checked={!!on} onChange={e => onToggle(e.target.checked)} /><i /></label>}</div>{on !== false && children}</div>;
}

export function MapLayerPanel({ win }: { win: Win }) {
  const patch = useApp(s => s.patchWin); const o = win.opts;
  const sf = surfOf(o), ct = contOf(o), ol = outOf(o);
  const PS = (p: Partial<SurfOpts>) => patch(win.id, { opts: { ...o, sf: { ...sf, ...p } } });
  const PC = (p: Partial<ContOpts>) => patch(win.id, { opts: { ...o, ct: { ...ct, ...p } } });
  const PO = (p: Partial<OutOpts>) => patch(win.id, { opts: { ...o, ol: { ...ol, ...p } } });
  const T = (p: Record<string, boolean>) => patch(win.id, { opts: { ...o, ...p } });
  const g = useMemo(() => (o.surface || o.outlines || o.contours ? gridFor(sf) : null), [o.surface, o.outlines, o.contours, sf.var, sf.method, sf.power, sf.neighbors, sf.cell, sf.mask, sf.log, sf.smooth]);
  const v = varOf(sf.var); const select = useApp(s => s.select);
  const [manualTxt, setManualTxt] = useState(ct.manual.join('; '));
  return <div className="pp">
    <Card icon="density" title="Superficie interpolada" on={!!o.surface} onToggle={b => T({ surface: b })}>
      <label className="px-field"><span className="px-label">Variable o expresión</span><select className="px-select2" value={NUM_VARS.some(x => x.key === sf.var) ? sf.var : '__expr'} onChange={e => e.target.value !== '__expr' && PS({ var: e.target.value, mlo: null, mhi: null })}>{NUM_VARS.map(x => <option key={x.key} value={x.key}>{x.label}{x.unit ? ` (${x.unit})` : ''}</option>)}<option value="__expr">Expresión…</option></select></label>
      <ExprInput value={sf.var} onChange={x => PS({ var: x, mlo: null, mhi: null })} examples={['Cu / Mo', 'Cu + 30 * Mo', 'log10(Cu) + log10(Mo)', 'Sr / Y', 'K2O / Na2O']} />
      <Seg value={sf.method} onChange={m => PS({ method: m })} options={[['idw', 'IDW'], ['nn', 'Vecino'], ['tin', 'TIN'], ['rbf', 'RBF'], ['kriging', 'Kriging']]} disabled={['tin', 'rbf', 'kriging']} />
      {sf.method === 'idw' && <><Slider label="Potencia" value={sf.power} min={1} max={4} step={0.5} onChange={x => PS({ power: x })} /><Slider label="Vecinos" value={sf.neighbors} min={3} max={24} onChange={x => PS({ neighbors: x })} /></>}
      <Slider label="Celda" value={sf.cell} min={500} max={3000} step={100} onChange={x => PS({ cell: x })} show={`${sf.cell} m`} />
      <Slider label="Máscara" value={sf.mask} min={1500} max={15000} step={500} onChange={x => PS({ mask: x })} show={`${(sf.mask / 1000).toFixed(1)} km`} />
      <label className="ly-sw"><input type="checkbox" checked={sf.log} onChange={e => PS({ log: e.target.checked, mlo: null, mhi: null })} />Escala logarítmica</label>
      <div className="pp-sub">Motor de color</div>
      <Seg value={sf.range} onChange={r => PS({ range: r, ...(r === 'manual' && sf.mlo == null ? (() => { const [a, b] = rangeOf(sf); return { mlo: +(sf.log ? 10 ** a : a).toPrecision(3), mhi: +(sf.log ? 10 ** b : b).toPrecision(3) }; })() : {}) })} options={[['minmax', 'Mín–Máx'], ['pct', 'Percentiles'], ['manual', 'Manual']]} />
      <RangeHist sf={sf} onChange={PS} />
      <div className="ed-ramps">{Object.entries(RAMPS).filter(([, r]) => r.kind !== 'cat').map(([k, r]) => <button key={k} aria-pressed={sf.ramp === k} onClick={() => PS({ ramp: k })}><i style={{ background: rampCss(k, sf.reverse) }} /><span>{r.label}</span></button>)}</div>
      <label className="ly-sw"><input type="checkbox" checked={sf.reverse} onChange={e => PS({ reverse: e.target.checked })} />Invertir paleta</label>
      <Seg value={sf.classes} onChange={c => PS({ classes: c })} options={[['cont', 'Continua'], ['disc', 'Clases discretas']]} />
      {sf.classes === 'disc' && <Slider label="Clases" value={sf.n} min={3} max={10} onChange={x => PS({ n: x })} />}
      <Slider label="Opacidad" value={Math.round(sf.opacity * 100)} min={10} max={100} step={5} onChange={x => PS({ opacity: x / 100 })} show={`${Math.round(sf.opacity * 100)} %`} />
      <Slider label="Suavizado" value={sf.smooth} min={0} max={3} onChange={x => PS({ smooth: x })} />
      <p className="ed-hint">Método, celda y máscara recalculan la superficie. Rango, paleta, clases y opacidad cambian solo el color, al instante.</p>
    </Card>
    <Card icon="hull" title="Contornos" on={!!o.contours} onToggle={b => T({ contours: b })}>
      <Seg value={ct.mode} onChange={m => PC({ mode: m })} options={[['auto', 'Automático'], ['step', 'Paso fijo'], ['manual', 'Manual']]} />
      {ct.mode === 'auto' && !sf.log && <Slider label="Niveles" value={ct.n} min={3} max={12} onChange={x => PC({ n: x })} />}
      {ct.mode === 'auto' && sf.log && <p className="ed-hint">Escala log: niveles 1-2-5 por década.</p>}
      {ct.mode === 'step' && <label className="ly-sl"><span>Paso</span><input className="px-num-in" type="number" value={ct.step} onChange={e => PC({ step: Math.max(1e-6, +e.target.value) })} /><span className="mono">{v.unit}</span></label>}
      {ct.mode === 'manual' && <label className="px-field"><span className="px-label">Niveles ({v.unit}), separados por «;»</span><input className="px-in" value={manualTxt} onChange={e => { setManualTxt(e.target.value); const nums = e.target.value.split(';').map(x => +x.trim().replace(',', '.')).filter(x => Number.isFinite(x) && x > 0); if (nums.length) PC({ manual: nums }); }} /></label>}
      <div className="lv-chips">{contourLevels(ct, sf).slice(0, 14).map(l => <span key={l} className="px-chip mono">{fmt(l)}</span>)}</div>
      <label className="ly-sw"><input type="checkbox" checked={ct.labels} onChange={e => PC({ labels: e.target.checked })} />Etiquetas</label>
      <Seg value={ct.color} onChange={c => PC({ color: c })} options={[['ink', 'Tinta'], ['ramp', 'Según rampa']]} />
      <Slider label="Grosor" value={ct.width} min={0.5} max={3} step={0.25} onChange={x => PC({ width: x })} />
      <Slider label="Principal cada" value={ct.major} min={0} max={5} onChange={x => PC({ major: x })} show={ct.major ? `${ct.major}` : 'no'} />
      <Slider label="Opacidad" value={Math.round(ct.opacity * 100)} min={10} max={100} step={5} onChange={x => PC({ opacity: x / 100 })} show={`${Math.round(ct.opacity * 100)} %`} />
    </Card>
    <Card icon="anomaly" title="Outlines por umbral" on={!!o.outlines} onToggle={b => T({ outlines: b })}>
      <Seg value={ol.source} onChange={x => PO({ source: x })} options={[['surface', 'Desde la superficie'], ['samples', 'Desde muestras']]} />
      {ol.source === 'samples' && <Slider label="Buffer" value={ol.buffer} min={300} max={5000} step={100} onChange={x => PO({ buffer: x })} show={`${ol.buffer} m`} />}
      <table className="ol-t"><thead><tr><th>{v.label} ≥</th><th></th><th>n</th><th>km²</th><th></th></tr></thead><tbody>
        {ol.rows.map((r, k) => { const n = SAMPLES.filter(s => (v.get(s) ?? -Infinity) >= r.v).length; const a = g && ol.source === 'surface' ? outlineStats(g, r.v).areaKm2 : null;
          return <tr key={k}><td><input className="px-num-in" type="number" value={r.v} onChange={e => PO({ rows: ol.rows.map((x, j) => (j === k ? { ...x, v: +e.target.value } : x)) })} /></td>
            <td><input type="color" value={r.color} onChange={e => PO({ rows: ol.rows.map((x, j) => (j === k ? { ...x, color: e.target.value } : x)) })} /></td>
            <td className="mono">{n}</td><td className="mono">{a == null ? '—' : a.toFixed(1)}</td>
            <td><button className="ol-b" title="Seleccionar muestras dentro" onClick={() => select(SAMPLES.filter(s => (v.get(s) ?? -Infinity) >= r.v).map(s => s.i))}><Icon name="lasso" size={13} /></button><button className="ol-b" title="Quitar" onClick={() => PO({ rows: ol.rows.filter((_, j) => j !== k) })}><Icon name="close" size={13} /></button></td></tr>; })}
      </tbody></table>
      <div className="px-row" style={{ gap: 6 }}><button className="px-btn px-btn--sm" onClick={() => PO({ rows: [...ol.rows, { v: +(ol.rows[ol.rows.length - 1]?.v ?? 100) * 2, color: '#7a0177' }].sort((a, b) => a.v - b.v) })}><Icon name="plus" size={13} />Umbral</button><button className="px-btn px-btn--sm px-btn--ghost" onClick={() => PO({ rows: DEF_OUT.rows })}>Restablecer</button></div>
      <Slider label="Relleno" value={Math.round(ol.fill * 100)} min={0} max={80} step={5} onChange={x => PO({ fill: x / 100 })} show={`${Math.round(ol.fill * 100)} %`} />
      {ol.source === 'surface' && <Slider label="Borde" value={ol.border} min={0} max={4} step={0.2} onChange={x => PO({ border: x })} />}
      <p className="ed-hint">El botón de lazo selecciona las muestras de esa zona en todas las ventanas; desde ahí puedes crear una clase.</p>
    </Card>
  </div>;
}

/** Histogram of sample values (in the colour space) with draggable range handles. */
function RangeHist({ sf, onChange }: { sf: SurfOpts; onChange: (p: Partial<SurfOpts>) => void }) {
  const v = varOf(sf.var); const T = (x: number) => (sf.log ? Math.log10(Math.max(x, 1e-6)) : x), TI = (t: number) => (sf.log ? 10 ** t : t);
  const vals = useMemo(() => SAMPLES.map(s => v.get(s)).filter((x): x is number => x != null && Number.isFinite(x) && (!sf.log || x > 0)).sort((a, b) => a - b), [v, sf.log]);
  const lo = T(vals[0]), hi = T(vals[vals.length - 1]); const W = 240, H = 54, nb = 28;
  const h = histogram(vals.map(T), nb, lo, hi); const mx = Math.max(...h, 1); const rng = rangeOf(sf);
  const X = (t: number) => ((t - lo) / (hi - lo || 1)) * W; const svg = useRef<SVGSVGElement>(null); const [drag, setDrag] = useState<0 | 1 | null>(null);
  const pctOf = (t: number) => { const x = TI(t); let k = 0; while (k < vals.length && vals[k] <= x) k++; return Math.round((k / vals.length) * 100); };
  const move = (e: React.PointerEvent) => {
    if (drag == null || !svg.current) return; const r = svg.current.getBoundingClientRect(); const t = lo + ((e.clientX - r.left) / r.width) * (hi - lo);
    if (sf.range === 'pct') { const p = Math.max(0, Math.min(100, pctOf(t))); onChange(drag === 0 ? { plo: Math.min(p, sf.phi - 2) } : { phi: Math.max(p, sf.plo + 2) }); }
    else { const val = +TI(t).toPrecision(3); onChange(drag === 0 ? { range: 'manual', mlo: val, mhi: sf.mhi ?? +TI(rng[1]).toPrecision(3) } : { range: 'manual', mhi: val, mlo: sf.mlo ?? +TI(rng[0]).toPrecision(3) }); }
  };
  return <div className="ed-hist">
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)} style={{ touchAction: 'none' }}>
      <rect x={X(rng[0])} y={0} width={Math.max(0, X(rng[1]) - X(rng[0]))} height={H} fill="var(--accent)" opacity={0.08} />
      {h.map((n, k) => { const t = lo + ((k + 0.5) / nb) * (hi - lo); return <rect key={k} x={(k / nb) * W + 0.5} width={W / nb - 1} y={H - 4 - (n / mx) * (H - 12)} height={(n / mx) * (H - 12)} fill={colorAt(sf, t, rng)} rx={1} />; })}
      {[0, 1].map(k => { const x = X(rng[k]); return <g key={k} style={{ cursor: 'ew-resize' }} onPointerDown={e => { (e.target as Element).setPointerCapture(e.pointerId); setDrag(k as 0 | 1); }}><line x1={x} x2={x} y1={0} y2={H} stroke="var(--text)" strokeWidth={1.4} /><rect x={x - 6} y={0} width={12} height={H} fill="transparent" /><rect x={x - 4} y={1} width={8} height={10} rx={2} fill="var(--bg-raised)" stroke="var(--text)" /></g>; })}
    </svg>
    <div className="mono muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5 }}>
      <span>{sf.range === 'pct' ? `P${sf.plo}` : 'mín'} = {fmt(TI(rng[0]))}</span><span>{v.unit}</span><span>{sf.range === 'pct' ? `P${sf.phi}` : 'máx'} = {fmt(TI(rng[1]))}</span>
    </div>
  </div>;
}

/* ---------------- Deposit models window ---------------- */
export function ModelsWin() {
  const cols = useApp(s => s.columns); const L = useL(), t = useT(); const [sel, setSel] = useState('porphyry');
  const m = DEPOSIT_MODELS.find(x => x.id === sel)!;
  const tile = () => { for (const id of m.tools) { const a = availability(TOOLS[id], cols); if (a.state !== 'off') TOOLS[id].run(); } };
  return <><div style={{ flex: 1, display: 'grid', gridTemplateColumns: '190px 1fr', minHeight: 0 }}>
    <div style={{ borderRight: '1px solid var(--border)', overflow: 'auto', padding: '6px 0' }}>{DEPOSIT_MODELS.map(d => <div key={d.id} className={`tr ${d.id === sel ? 'tr--on' : ''}`} onClick={() => setSel(d.id)}><Icon name="cube" size={15} /><span className="tr-l">{L(d.name)}</span></div>)}</div>
    <div style={{ padding: 12, overflow: 'auto' }}><div className="px-name">{L(m.name)}</div><p className="muted" style={{ margin: '2px 0 10px', fontSize: 12.5 }}>{L(m.note)}</p>
      <div className="pp-sub" style={{ margin: '0 0 6px' }}>Herramientas recomendadas</div>
      {m.tools.map(id => { const tl = TOOLS[id]; const a = availability(tl, cols); return <div key={id} className="md-row" data-st={a.state}><Icon name={tl.icon} size={15} /><span style={{ flex: 1 }}>{L(tl.label)}</span><span className={`st st--${a.state}`}>{a.state === 'ok' ? t('available') : a.state === 'partial' ? t('partial') : t('unavailable')}</span>{a.missing.length > 0 && <small className="muted">{t('missing')}: {a.missing.slice(0, 4).join(', ')}</small>}{a.reason && a.state === 'off' && <small className="muted">{L(a.reason)}</small>}</div>; })}
    </div></div>
    <div className="px-win__foot"><span>Plantilla de flujo: abre las herramientas disponibles del modelo</span><span style={{ flex: 1 }} /><button className="px-btn px-btn--sm px-btn--primary" onClick={tile}>Abrir conjunto</button></div></>;
}

export const quantileOf = quantile;

export function ExprInput({ value, onChange, examples }: { value: string; onChange: (v: string) => void; examples: string[] }) {
  const [txt, setTxt] = useState(value); const err = varOf(txt).error;
  useEffect(() => { setTxt(value); }, [value]);
  return <div className="ex-in"><input className={`px-in mono ${err ? 'err' : ''}`} value={txt} spellCheck={false} onChange={e => { setTxt(e.target.value); if (!varOf(e.target.value).error) onChange(e.target.value); }} placeholder="Cu / Mo" />
    {err ? <small className="bd-e"><Icon name="warn" size={12} />{err}</small> : <div className="ex-chips">{examples.map(x => <button key={x} className="px-chip mono" onClick={() => { setTxt(x); onChange(x); }}>{x}</button>)}</div>}</div>;
}
