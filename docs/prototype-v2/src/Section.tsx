import { useMemo, useState } from 'react';
import Icon from './Icon';
import { SAMPLES } from './data';
import { useApp, type Win } from './store';
import { useResolved } from './resolve';
import { useSize } from './PlotXY';
import { RAMPS, fmt, niceTicks, rampColor, rampCss, symbolPath } from './viz';
import { HOLES, along, dem, frame, inStock, type Hole, type Interval, type SectionLine } from './sim3d';
import { compile } from './expr';
export const IV_VARS = ['Cu', 'Mo', 'Au', 'Ag', 'Zn', 'Pb', 'As', 'S', 'K2O', 'Na2O'];
const ivVal = (expr: string) => { const c = compile(expr); return (iv: Interval) => { if (!c.ok) return null; const r = c.run({ vars: iv.vars }); return typeof r === 'number' && Number.isFinite(r) ? r : null; }; };

export interface SecOpts { ve: 'auto' | '1' | '2' | '5'; expr: string; log: boolean; lvAuto: boolean; surface: boolean; contours: boolean; outlines: boolean; geology: boolean; holes: boolean; samples: boolean; ramp: string; opacity: number; levels: number[]; thresholds: { v: number; color: string }[]; mask: number }
export const DEF_SEC: SecOpts = { ve: 'auto', expr: 'Cu', log: true, lvAuto: false, surface: true, contours: true, outlines: false, geology: true, holes: true, samples: true, ramp: 'geochem', opacity: 0.75, levels: [250, 500, 1000, 2000], thresholds: [{ v: 500, color: '#f39c34' }, { v: 1000, color: '#d7301f' }, { v: 2000, color: '#7f0000' }], mask: 420 };
export const secOf = (o: Record<string, any>): SecOpts => ({ ...DEF_SEC, ...(o.sc ?? {}) });

type G = { ns: number; nz: number; len: number; zLo: number; zHi: number; ds: number; dz: number; z: Float64Array; geo: Float64Array; topo: number[] };
const gcache = new Map<string, G>();
function holesIn(L: SectionLine) { const F = frame(L); return HOLES.map(h => { const ds = h.iv.map(iv => F.proj(iv.e, iv.n)); const near = ds.some(p => Math.abs(p.d) <= L.buffer && p.s >= -50 && p.s <= F.len + 50); const off = Math.min(...ds.map(p => Math.abs(p.d))); return near ? { h, off } : null; }).filter((x): x is { h: Hole; off: number } => !!x); }
function gridOf(L: SectionLine, expr: string, log: boolean, mask: number): G {
  const key = [L.a, L.b, L.buffer, expr, log, mask].join('|'); const val = ivVal(expr); const hit = gcache.get(key); if (hit) return hit;
  const F = frame(L); const ns = 170, nz = 90; const topo: number[] = [];
  for (let i = 0; i < ns; i++) topo.push(dem(...F.at((F.len * i) / (ns - 1))));
  const pts = holesIn(L).flatMap(({ h }) => h.iv.map(iv => { const x = val(iv); return x == null || (log && x <= 0) ? null : { s: F.proj(iv.e, iv.n).s, z: iv.z, t: log ? Math.log10(x) : x }; }).filter((p): p is { s: number; z: number; t: number } => !!p));
  const zHi = Math.max(...topo) + 60, zLo = Math.min(Math.min(...topo) - 200, ...(pts.length ? pts.map(p => p.z - 120) : [Math.min(...topo) - 700]));
  const ds = F.len / (ns - 1), dz = (zHi - zLo) / (nz - 1); const z = new Float64Array(ns * nz), geo = new Float64Array(ns * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < ns; i++) {
    const s = i * ds, zz = zLo + j * dz, k = j * ns + i; const [e, n] = F.at(s); geo[k] = inStock(e, n, zz) ? 1 : 0;
    if (zz > topo[i]) { z[k] = NaN; continue; }
    let dmin = Infinity, sw = 0, sv = 0; for (const p of pts) { const d = Math.hypot(p.s - s, p.z - zz); if (d < dmin) dmin = d; const w = 1 / Math.max(1, d) ** 2; sw += w; sv += w * p.t; }
    z[k] = dmin > mask ? NaN : sv / sw;
  }
  const g = { ns, nz, len: F.len, zLo, zHi, ds, dz, z, geo, topo }; gcache.set(key, g); if (gcache.size > 12) gcache.delete(gcache.keys().next().value!); return g;
}
function iso(g: G, arr: Float64Array, level: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = []; const Z = (i: number, j: number) => arr[j * g.ns + i];
  for (let j = 0; j < g.nz - 1; j++) for (let i = 0; i < g.ns - 1; i++) {
    const a = Z(i, j), b = Z(i + 1, j), c = Z(i + 1, j + 1), d = Z(i, j + 1); if ([a, b, c, d].some(Number.isNaN)) continue;
    const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0); if (idx === 0 || idx === 15) continue;
    const l = (p: number, q: number) => (level - p) / (q - p); const S = (x: number) => x * g.ds, Zz = (y: number) => g.zLo + y * g.dz;
    const top = [S(i + l(a, b)), Zz(j)], right = [S(i + 1), Zz(j + l(b, c))], bottom = [S(i + l(d, c)), Zz(j + 1)], left = [S(i), Zz(j + l(a, d))];
    const add = (p: number[], q: number[]) => out.push([p[0], p[1], q[0], q[1]]);
    switch (idx) { case 1: case 14: add(left, bottom); break; case 2: case 13: add(bottom, right); break; case 3: case 12: add(left, right); break; case 4: case 11: add(top, right); break; case 6: case 9: add(top, bottom); break; case 7: case 8: add(left, top); break; case 5: add(left, top); add(bottom, right); break; case 10: add(top, right); add(left, bottom); break; }
  }
  return out;
}
const imgCache = new Map<string, string>();
function raster(g: G, key: string, color: (t: number) => string | null) {
  const hit = imgCache.get(key); if (hit) return hit;
  const cv = document.createElement('canvas'); cv.width = g.ns; cv.height = g.nz; const ctx = cv.getContext('2d')!; const img = ctx.createImageData(g.ns, g.nz);
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.ns; i++) { const t = g.z[j * g.ns + i]; const p = ((g.nz - 1 - j) * g.ns + i) * 4; const c = Number.isNaN(t) ? null : color(t); if (!c) continue; img.data[p] = parseInt(c.slice(1, 3), 16); img.data[p + 1] = parseInt(c.slice(3, 5), 16); img.data[p + 2] = parseInt(c.slice(5, 7), 16); img.data[p + 3] = 255; }
  ctx.putImageData(img, 0, 0); const url = cv.toDataURL(); imgCache.set(key, url); if (imgCache.size > 30) imgCache.delete(imgCache.keys().next().value!); return url;
}

export function SectionWin({ win }: { win: Win }) {
  const L = useApp(s => s.section), patch = useApp(s => s.patchWin), select = useApp(s => s.select), sel = useApp(s => s.selection), lang = useApp(s => s.lang), set = useApp(s => s.set), style = useApp(s => s.style);
  const R = useResolved(); const es = lang === 'es'; const o = secOf(win.opts); const P = (p: Partial<SecOpts>) => patch(win.id, { opts: { ...win.opts, sc: { ...o, ...p } } });
  const [box, size] = useSize<HTMLDivElement>(); const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const F = useMemo(() => frame(L), [L]); const err = useMemo(() => { const c = compile(o.expr); return c.ok ? (c.run({ vars: HOLES[0].iv[0].vars }) === null && !IV_VARS.some(v => o.expr.includes(v)) ? 'Variable desconocida' : null) : c.error; }, [o.expr]);
  const g = useMemo(() => gridOf(L, o.expr, o.log, o.mask), [L, o.expr, o.log, o.mask]); const holes = useMemo(() => holesIn(L), [L]); const val = useMemo(() => ivVal(o.expr), [o.expr]);
  const T = (x: number | null) => (x == null || (o.log && x <= 0) ? null : o.log ? Math.log10(x) : x), TI = (t: number) => (o.log ? 10 ** t : t);
  const [exprTxt, setExprTxt] = useState(o.expr);
  const vals = useMemo(() => holes.flatMap(({ h }) => h.iv.map(iv => T(val(iv)))).filter((x): x is number => x != null).sort((a, b) => a - b), [holes, val, o.log]);
  const lo = vals.length ? vals[Math.floor(vals.length * 0.02)] : 0, hi = vals.length ? vals[Math.floor(vals.length * 0.98)] : 1;
  const col = (t: number) => rampColor(o.ramp, (t - lo) / (hi - lo || 1));
  const m = { l: 62, r: 18, t: 30, b: 36 }; const pw = Math.max(80, size.w - m.l - m.r), ph = Math.max(60, size.h - m.t - m.b);
  const kx = pw / g.len; const veAuto = ph / (g.zHi - g.zLo) / kx; const ve = o.ve === 'auto' ? veAuto : +o.ve; const ky = kx * ve;
  const zTop = g.zHi, zBot = zTop - ph / ky;
  const sx = (s: number) => m.l + s * kx, sz = (z: number) => m.t + (zTop - z) * ky;
  const box2 = { x: sx(-g.ds / 2), y: sz(g.zLo + (g.nz - 0.5) * g.dz), width: (g.len + g.ds) * kx, height: (g.nz) * g.dz * ky };
  const topoPath = g.topo.map((z, i) => `${i ? 'L' : 'M'}${sx(i * g.ds).toFixed(1)} ${sz(z).toFixed(1)}`).join('');
  const seg = (sg: [number, number, number, number][]) => sg.map(([a, b, c, d]) => `M${sx(a).toFixed(1)} ${sz(b).toFixed(1)}L${sx(c).toFixed(1)} ${sz(d).toFixed(1)}`).join('');
  const vname = o.expr;
  const smp = SAMPLES.map(s => ({ s, p: F.proj(s.east, s.north) })).filter(({ p }) => Math.abs(p.d) <= L.buffer && p.s >= 0 && p.s <= F.len);
  const xt = niceTicks(0, g.len, Math.max(3, Math.round(pw / 110))), zt = niceTicks(Math.max(zBot, g.zLo - 400), zTop, Math.max(3, Math.round(ph / 55)));
  const selSet = new Set(sel);
  const autoLv = () => { const out: number[] = []; if (!vals.length) return out; if (o.log) { for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) for (const m2 of [1, 2, 5]) { const v = m2 * 10 ** e; if (Math.log10(v) > lo && Math.log10(v) < hi) out.push(v); } return out; } const st = niceTicks(lo, hi, 6); return st.filter(v => v > lo && v < hi); };
  const levels = o.lvAuto || o.expr !== 'Cu' ? autoLv() : o.levels.filter(v => v > 0);
  return <><div className="px-win__tools sc-tools">
    {([['surface', 'density', es ? 'Interpolación' : 'Interpolation'], ['contours', 'hull', es ? 'Contornos' : 'Contours'], ['outlines', 'anomaly', 'Outlines'], ['geology', 'layers', es ? 'Geología' : 'Geology'], ['holes', 'drill', es ? 'Sondajes' : 'Drillholes'], ['samples', 'scatter', es ? 'Muestras' : 'Samples']] as const).map(([k, ic, l]) => <button key={k} className="px-tool" aria-pressed={o[k]} title={l} onClick={() => P({ [k]: !o[k] } as any)}><Icon name={ic} size={16} /></button>)}
    <span className="px-sep" /><label className={`bd-ax sc-ax ${err ? 'err' : ''}`} title={err ?? (es ? `Variables: ${IV_VARS.join(', ')}` : `Variables: ${IV_VARS.join(', ')}`)}><span>{es ? 'Variable' : 'Variable'}</span><input list={`sx-${win.id}`} value={exprTxt} spellCheck={false} onChange={e => { setExprTxt(e.target.value); const c = compile(e.target.value); if (c.ok && e.target.value.trim()) P({ expr: e.target.value }); }} /><datalist id={`sx-${win.id}`}>{[...IV_VARS, 'Cu / Mo', 'Cu + 30 * Mo', 'Cu / 10000 + Au', 'Zn + Pb', 'K2O / Na2O', 'log10(Cu) - log10(Zn)'].map(x => <option key={x} value={x} />)}</datalist><button className="px-tool" aria-pressed={o.log} title="log" onClick={() => P({ log: !o.log })}><Icon name="log" size={14} /></button></label>
    <span className="px-inline muted">EV</span><div className="px-seg" style={{ width: 170, flex: 'none' }}>{(['auto', '1', '2', '5'] as const).map(v => <button key={v} aria-pressed={o.ve === v} onClick={() => P({ ve: v })}>{v === 'auto' ? 'Auto' : `${v}×`}</button>)}</div>
    <span className="mono muted" style={{ fontSize: 11 }}>{ve.toFixed(1)}×</span><span style={{ flex: 1 }} />
    <button className="px-btn px-btn--sm px-btn--ghost" onClick={() => set({ fly: 'layers' })}><Icon name="layers" size={14} />{es ? 'Capas…' : 'Layers…'}</button>
  </div>
    <div className="px-win__plot" ref={box} style={{ padding: 0, position: 'relative' }}>
      <svg className="px-plot" width={size.w} height={size.h} onPointerLeave={() => setHover(null)}>
        <defs><clipPath id={`sc-${win.id}`}><rect x={m.l} y={m.t} width={pw} height={ph} /></clipPath>
          <pattern id={`hatch-${win.id}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="var(--text-muted)" strokeWidth="0.8" opacity="0.5" /></pattern></defs>
        <g clipPath={`url(#sc-${win.id})`}>
          <path d={`${topoPath}L${sx(g.len)} ${sz(zBot - 5000)}L${sx(0)} ${sz(zBot - 5000)}Z`} fill="var(--bg-sunken)" />
          {zt.map(z => <line key={z} className="grid" x1={m.l} x2={m.l + pw} y1={sz(z)} y2={sz(z)} />)}{xt.map(s => <line key={s} className="grid" x1={sx(s)} x2={sx(s)} y1={m.t} y2={m.t + ph} />)}
          {o.surface && <image href={raster(g, `${L.a}|${L.b}|${L.buffer}|${o.expr}|${o.log}|${o.ramp}|${lo}|${hi}|${o.mask}`, col)} {...box2} opacity={o.opacity} preserveAspectRatio="none" />}
          {o.outlines && o.thresholds.map((r, k) => { const t = o.log ? Math.log10(Math.max(1e-9, r.v)) : r.v; return <g key={k}><image href={raster(g, `ol|${L.a}|${L.b}|${L.buffer}|${o.expr}|${o.log}|${r.v}|${r.color}|${o.mask}`, x => (x >= t ? r.color : null))} {...box2} opacity={0.3} preserveAspectRatio="none" style={{ imageRendering: 'pixelated' }} /><path d={seg(iso(g, g.z, t))} fill="none" stroke={r.color} strokeWidth={1.8} /></g>; })}
          {o.contours && levels.map((lv, k) => { const sg = iso(g, g.z, o.log ? Math.log10(lv) : lv); const lab = sg[Math.floor(sg.length / 2)]; return <g key={k}><path d={seg(sg)} fill="none" stroke="var(--text)" strokeWidth={k === levels.length - 1 ? 1.6 : 0.9} opacity={0.85} />{lab && <text x={(sx(lab[0]) + sx(lab[2])) / 2} y={(sz(lab[1]) + sz(lab[3])) / 2 + 3} textAnchor="middle" className="px-tick" style={{ fill: 'var(--text)', fontWeight: 600, paintOrder: 'stroke', stroke: 'var(--bg-raised)', strokeWidth: 3 }}>{fmt(lv)}</text>}</g>; })}
          {o.geology && <><path d={seg(iso(g, g.geo, 0.5))} fill="none" stroke="var(--text)" strokeWidth={1.4} strokeDasharray="6 3" />{(() => { const k = g.geo.findIndex(v => v === 1); if (k < 0) return null; const sC = F.proj(455500, 8829000).s; return <text x={sx(sC)} y={sz(2050) + 4} textAnchor="middle" className="fname" style={{ fill: 'var(--text)', fontStyle: 'normal', fontWeight: 600, paintOrder: 'stroke', stroke: 'var(--bg-raised)', strokeWidth: 3 }}>{es ? 'Pórfido (simulado)' : 'Porphyry (simulated)'}</text>; })()}</>}
          <path d={topoPath} fill="none" stroke="var(--text)" strokeWidth={1.8} />
          {o.holes && holes.map(({ h, off }) => { const pts = Array.from({ length: Math.ceil(h.len / 10) + 1 }, (_, k) => { const [e, n, z] = along(h, Math.min(h.len, k * 10)); return [F.proj(e, n).s, z] as [number, number]; });
            const c0 = F.proj(h.e, h.n).s; return <g key={h.id} opacity={off > L.buffer * 0.6 ? 0.55 : 1}>
              <path d={pts.map(([s, z], k) => `${k ? 'L' : 'M'}${sx(s)} ${sz(z)}`).join('')} fill="none" stroke="var(--text)" strokeWidth={8} strokeLinecap="round" opacity={0.85} />
              {h.iv.map((iv, k) => { const [a, b] = [pts[k], pts[k + 1] ?? pts[k]]; const t = T(val(iv)); return <line key={k} x1={sx(a[0])} y1={sz(a[1])} x2={sx(b[0])} y2={sz(b[1])} stroke={t == null ? 'var(--border-strong)' : col(t)} strokeWidth={5.5} onPointerMove={e => setHover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, text: `${h.id} · ${iv.from}–${iv.to} m · ${o.expr} = ${(() => { const x = val(iv); return x == null ? '—' : fmt(x); })()} · Cu ${fmt(iv.cu)} · Mo ${fmt(iv.mo)} · Au ${iv.vars.Au} · ${iv.lith === 'stock' ? (es ? 'pórfido' : 'porphyry') : (es ? 'roca caja' : 'host rock')}` })} />; })}
              <text x={sx(c0)} y={sz(h.z) - 8} textAnchor="middle" className="px-tick" style={{ fill: 'var(--text)', fontWeight: 600, paintOrder: 'stroke', stroke: 'var(--bg-raised)', strokeWidth: 3 }}>{h.id}</text>
              {off > 30 && <text x={sx(c0)} y={sz(h.z) - 19} textAnchor="middle" className="px-tick" style={{ fontSize: 9, paintOrder: 'stroke', stroke: 'var(--bg-raised)', strokeWidth: 3 }}>{es ? 'a' : 'at'} {Math.round(off)} m</text>}
            </g>; })}
          {o.samples && smp.map(({ s, p }) => { const v = R.vis[s.i]; if (!v.visible) return null; const on = selSet.has(s.i); const x = sx(p.s), y = sz(dem(s.east, s.north)) - 2; return <path key={s.i} transform={`translate(${x},${y})`} d={symbolPath(v.shape, v.size)} fill={style.shape.hollow ? 'none' : v.color} stroke={on ? 'var(--brush)' : 'rgba(20,30,40,.4)'} strokeWidth={on ? 2 : 0.7} style={{ cursor: 'pointer' }} onClick={e => select([s.i], e.shiftKey ? 'toggle' : 'replace')} onPointerMove={e => setHover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, text: `${s.id} · ${s.sector} · Cu ${s.Cu} ppm · ${es ? 'a' : 'at'} ${Math.round(Math.abs(p.d))} m ${es ? 'de la línea' : 'from the line'}` })} />; })}
        </g>
        <rect x={m.l} y={m.t} width={pw} height={ph} className="frame" style={{ fill: "none" }} />
        {xt.map(s => <text key={s} className="px-tick" x={sx(s)} y={m.t + ph + 14} textAnchor="middle">{fmt(s)}</text>)}
        {zt.filter(z => z >= zBot && z <= zTop).map(z => <text key={z} className="px-tick" x={m.l - 6} y={sz(z) + 3} textAnchor="end">{fmt(z)}</text>)}
        <text className="axl" x={m.l + pw / 2} y={size.h - 6} textAnchor="middle">{es ? 'Distancia a lo largo de A–A′ (m)' : 'Distance along A–A′ (m)'}</text>
        <text className="axl" transform={`translate(13 ${m.t + ph / 2}) rotate(-90)`} textAnchor="middle">{es ? 'Cota (m s. n. m.)' : 'Elevation (m a.s.l.)'}</text>
        <text x={m.l + 4} y={m.t - 9} className="sc-ab">A</text><text x={m.l + pw - 4} y={m.t - 9} textAnchor="end" className="sc-ab">A′</text>
        <g transform={`translate(${m.l + pw - 186},${m.t + ph - 38})`}><rect width={178} height={30} rx={5} fill="var(--bg-raised)" stroke="var(--border)" opacity={0.94} /><text x={8} y={12} className="px-tick" style={{ fill: 'var(--text)', fontWeight: 600 }}>{vname}{o.log ? ' · log' : ''} · P2–P98 · {fmt(TI(lo))}–{fmt(TI(hi))}</text><foreignObject x={8} y={16} width={160} height={10}><div style={{ height: 8, borderRadius: 2, background: rampCss(o.ramp) }} /></foreignObject></g>
      </svg>
      {hover && <div className="px-tip" style={{ left: Math.min(hover.x + 12, size.w - 230), top: Math.max(4, hover.y - 40) }}>{hover.text}</div>}
    </div>
    <div className="px-win__foot"><span>{es ? 'Longitud' : 'Length'} <span className="mono">{fmt(F.len)} m</span> · buffer <span className="mono">±{L.buffer} m</span> · <span className="mono">{holes.length}</span> {es ? 'sondajes' : 'holes'} · <span className="mono">{smp.length}</span> {es ? 'muestras proyectadas' : 'projected samples'}</span><span style={{ flex: 1 }} /><span className="muted">{es ? 'DEM y sondajes simulados' : 'Simulated DEM and drillholes'}</span></div></>;
}

/** Plan-view overlay on the map: A–A′ line, buffer band, collars and traces. */
export function SectionOnMap({ sx, sy }: { sx: (v: number) => number; sy: (v: number) => number }) {
  const L = useApp(s => s.section), show = useApp(s => s.showSection); if (!show) return null; const F = frame(L);
  const n = F.nrm, b = L.buffer; const c = (p: [number, number], k: number): [number, number] => [p[0] + n[0] * b * k, p[1] + n[1] * b * k];
  const band = [c(L.a, 1), c(L.b, 1), c(L.b, -1), c(L.a, -1)];
  return <g pointerEvents="none">
    <path d={'M' + band.map(p => `${sx(p[0])},${sy(p[1])}`).join('L') + 'Z'} fill="var(--accent)" fillOpacity={0.1} stroke="var(--accent-strong)" strokeDasharray="4 3" />
    {HOLES.map(h => { const end = along(h, h.len); return <g key={h.id}><line x1={sx(h.e)} y1={sy(h.n)} x2={sx(end[0])} y2={sy(end[1])} stroke="var(--text)" strokeWidth={1.6} /><circle cx={sx(h.e)} cy={sy(h.n)} r={3.5} fill="var(--bg-raised)" stroke="var(--text)" strokeWidth={1.4} /></g>; })}
    <line x1={sx(L.a[0])} y1={sy(L.a[1])} x2={sx(L.b[0])} y2={sy(L.b[1])} stroke="var(--accent-strong)" strokeWidth={2.4} />
    {([[L.a, 'A'], [L.b, 'A′']] as const).map(([p, t]) => <g key={t}><circle cx={sx(p[0])} cy={sy(p[1])} r={5} fill="var(--accent-strong)" /><text x={sx(p[0]) + 8} y={sy(p[1]) - 7} className="sc-ab">{t}</text></g>)}
  </g>;
}

/** Click A then A′ on the map. */
export function SectionDraw({ sx, sy }: { sx: (v: number) => number; sy: (v: number) => number }) {
  const draw = useApp(s => s.drawSection), set = useApp(s => s.set), L = useApp(s => s.section); const [a, setA] = useState<[number, number] | null>(null);
  if (!draw) return null;
  const inv = (f: (v: number) => number) => { const p0 = f(0), p1 = f(1000); return (px: number) => ((px - p0) / (p1 - p0)) * 1000; };
  const pick = (e: React.PointerEvent): [number, number] => { e.stopPropagation(); const r = (e.target as Element).closest('svg')!.getBoundingClientRect(); return [Math.round(inv(sx)(e.clientX - r.left)), Math.round(inv(sy)(e.clientY - r.top))]; };
  return <rect x={-5000} y={-5000} width={10000} height={10000} fill="transparent" style={{ cursor: 'crosshair' }} onPointerDown={e => { const p = pick(e); if (!a) setA(p); else { set({ section: { ...L, a, b: p }, drawSection: false, showSection: true }); setA(null); useApp.getState().notify(useApp.getState().lang === 'es' ? 'Sección actualizada: la ventana de sección se recalcula con la nueva línea.' : 'Section updated: the section window recomputes along the new line.'); } }} />;
}

export const RAMP_KEYS = Object.keys(RAMPS).filter(k => RAMPS[k].kind !== 'cat');

/** Layers flyout content for a section window. */
export function SectionLayerPanel({ win }: { win: Win }) {
  const patch = useApp(s => s.patchWin), L = useApp(s => s.section), set = useApp(s => s.set), lang = useApp(s => s.lang); const es = lang === 'es';
  const o = secOf(win.opts); const P = (p: Partial<SecOpts>) => patch(win.id, { opts: { ...win.opts, sc: { ...o, ...p } } });
  const [lv, setLv] = useState(o.levels.join('; '));
  const Sw = ({ k, label }: { k: keyof SecOpts; label: string }) => <label className="ly-sw"><input type="checkbox" checked={!!o[k]} onChange={e => P({ [k]: e.target.checked } as any)} />{label}</label>;
  return <div className="pp">
    <div className="ly"><div className="ly-h"><Icon name="splice" size={16} /><div><b>{es ? 'Línea A–A′' : 'Line A–A′'}</b><small>{es ? 'Dibuja la línea sobre el mapa' : 'Draw the line on the map'}</small></div></div>
      <button className="px-btn px-btn--sm" onClick={() => { set({ drawSection: true, showSection: true }); useApp.getState().notify(es ? 'Haz clic en el mapa para A y luego para A′.' : 'Click the map for A, then for A′.'); }}><Icon name="splice" size={13} />{es ? 'Dibujar en el mapa' : 'Draw on the map'}</button>
      <label className="ly-sl"><span>Buffer</span><input type="range" min={100} max={1500} step={50} value={L.buffer} onChange={e => set({ section: { ...L, buffer: +e.target.value } })} /><span className="mono">±{L.buffer} m</span></label>
      <label className="ly-sw"><input type="checkbox" checked={useApp.getState().showSection} onChange={e => set({ showSection: e.target.checked })} />{es ? 'Mostrar línea y buffer en el mapa' : 'Show line and buffer on the map'}</label></div>
    <div className="ly"><div className="ly-h"><Icon name="layers" size={16} /><div><b>{es ? 'Capas de la sección' : 'Section layers'}</b></div></div>
      <Sw k="surface" label={es ? 'Interpolación (IDW en el plano de la sección)' : 'Interpolation (IDW on the section plane)'} /><Sw k="contours" label={es ? 'Contornos' : 'Contours'} /><Sw k="outlines" label={es ? 'Outlines por umbral' : 'Threshold outlines'} />
      <Sw k="geology" label={es ? 'Geología (contacto del pórfido)' : 'Geology (porphyry contact)'} /><Sw k="holes" label={es ? 'Sondajes con intervalos' : 'Drillholes with intervals'} /><Sw k="samples" label={es ? 'Muestras de superficie proyectadas' : 'Projected surface samples'} />
      <label className="ly-sl"><span>{es ? 'Máscara' : 'Mask'}</span><input type="range" min={100} max={600} step={20} value={o.mask} onChange={e => P({ mask: +e.target.value })} /><span className="mono">{o.mask} m</span></label></div>
    <div className="ly"><div className="ly-h"><Icon name="palette" size={16} /><div><b>{es ? 'Color' : 'Colour'}</b><small>{es ? 'log · rango P2–P98 de los intervalos' : 'log · P2–P98 range of intervals'}</small></div></div>
      <div className="ed-ramps">{RAMP_KEYS.map(k => <button key={k} aria-pressed={o.ramp === k} onClick={() => P({ ramp: k })}><i style={{ background: rampCss(k) }} /><span>{RAMPS[k].label}</span></button>)}</div>
      <label className="ly-sl"><span>{es ? 'Opacidad' : 'Opacity'}</span><input type="range" min={10} max={100} step={5} value={Math.round(o.opacity * 100)} onChange={e => P({ opacity: +e.target.value / 100 })} /><span className="mono">{Math.round(o.opacity * 100)} %</span></label></div>
    <div className="ly"><div className="ly-h"><Icon name="hull" size={16} /><div><b>{es ? 'Contornos y outlines' : 'Contours and outlines'}</b></div></div>
      <label className="px-field"><span className="px-label">{es ? 'Niveles, separados por «;» (Cu); en otras variables son automáticos' : 'Levels separated by “;” (Cu); automatic for other variables'}</span><input className="px-in" value={lv} onChange={e => { setLv(e.target.value); const n = e.target.value.split(';').map(x => +x.trim().replace(',', '.')).filter(x => x > 0); if (n.length) P({ levels: n }); }} /></label>
      <table className="ol-t"><thead><tr><th>{o.expr} ≥</th><th></th><th></th></tr></thead><tbody>{o.thresholds.map((r, k) => <tr key={k}><td><input className="px-num-in" type="number" value={r.v} onChange={e => P({ thresholds: o.thresholds.map((x, j) => (j === k ? { ...x, v: +e.target.value } : x)) })} /></td><td><input type="color" value={r.color} onChange={e => P({ thresholds: o.thresholds.map((x, j) => (j === k ? { ...x, color: e.target.value } : x)) })} /></td><td><button className="ol-b" onClick={() => P({ thresholds: o.thresholds.filter((_, j) => j !== k) })}><Icon name="close" size={12} /></button></td></tr>)}</tbody></table>
      <button className="px-btn px-btn--sm" onClick={() => P({ thresholds: [...o.thresholds, { v: 3000, color: '#4a0000' }] })}><Icon name="plus" size={13} />{es ? 'Umbral' : 'Threshold'}</button></div>
  </div>;
}
