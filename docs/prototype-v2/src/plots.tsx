import { compile } from './expr';
import { useMemo, useState, type ReactNode } from 'react';
import { CHONDRITE, DDH, MINERALS, PETRO, REE, SAMPLES, WL, numVar, spectrum } from './data';
import { useApp, type Win } from './store';
import { useResolved } from './resolve';
import { fmt, histogram, logTicks, niceTicks, symbolPath } from './viz';
import { useSize } from './PlotXY';

const M = { l: 54, r: 14, t: 12, b: 38 };

export function Spider({ win }: { win: Win }) {
  const [box, size] = useSize<HTMLDivElement>(); const R = useResolved();
  const sel = useApp(s => s.selection), isolate = useApp(s => s.isolate), select = useApp(s => s.select), style = useApp(s => s.style);
  const selSet = useMemo(() => new Set(sel), [sel]); const mode: string = win.opts.mode ?? 'samples';
  const pw = size.w - M.l - M.r, ph = size.h - M.t - M.b;
  const X = (k: number) => M.l + (k / (REE.length - 1)) * pw, Y = (v: number) => M.t + ph - ((Math.log10(Math.max(v, 0.1)) - 0) / 3) * ph;
  const norm = (i: number) => REE.map(e => SAMPLES[i].ree[e] / CHONDRITE[e]);
  const vis = SAMPLES.filter(s => R.vis[s.i].visible && (!isolate || selSet.has(s.i)));
  const hasSel = selSet.size > 0 && !isolate;
  const line = (v: number[]) => v.map((y, k) => `${k ? 'L' : 'M'}${X(k).toFixed(1)},${Y(y).toFixed(1)}`).join('');
  let body: ReactNode;
  if (mode === 'envelope') {
    const groups = new Map<string, number[][]>(); for (const s of vis) { const k = R.vis[s.i].cat; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(norm(s.i)); }
    body = [...groups.entries()].map(([name, rows]) => {
      const col = R.cats.find(c => c.name === name)?.color ?? '#888'; const q = (k: number, f: number) => { const s = rows.map(r => r[k]).sort((a, b) => a - b); return s[Math.floor((s.length - 1) * f)]; };
      const lo = REE.map((_, k) => q(k, 0.1)), hi = REE.map((_, k) => q(k, 0.9)), md = REE.map((_, k) => q(k, 0.5));
      return <g key={name}><path d={line(hi) + REE.map((_, k) => `L${X(REE.length - 1 - k)},${Y(lo[REE.length - 1 - k])}`).join('') + 'Z'} fill={col} opacity={0.16} /><path d={line(md)} fill="none" stroke={col} strokeWidth={2.2} />{md.map((v, k) => <path key={k} transform={`translate(${X(k)},${Y(v)})`} d={symbolPath(R.cats.find(c => c.name === name)!.shape, 7)} fill={col} />)}</g>;
    });
  } else {
    const order = [...vis].sort((a, b) => (selSet.has(a.i) ? 1 : 0) - (selSet.has(b.i) ? 1 : 0));
    body = order.map(s => { const v = R.vis[s.i], on = selSet.has(s.i); return <path key={s.i} d={line(norm(s.i))} fill="none" stroke={on ? 'var(--brush)' : v.color} strokeWidth={on ? 1.8 : 1} opacity={hasSel && !on ? 0.12 : style.opacity * 0.8} onClick={e => select([s.i], e.shiftKey ? 'toggle' : 'replace')} style={{ cursor: 'pointer' }} />; });
  }
  return <div ref={box} style={{ width: '100%', height: '100%' }}><svg className="px-plot" width={size.w} height={size.h}>
    <rect className="frame" x={M.l} y={M.t} width={pw} height={ph} />
    {[1, 10, 100, 1000].map(d => <g key={d}><text className="px-tick" x={M.l - 6} y={Y(d) + 3} textAnchor="end">{d}</text>{d > 1 && d < 1000 && <line className="grid" x1={M.l} x2={M.l + pw} y1={Y(d)} y2={Y(d)} />}</g>)}
    {REE.map((e, k) => <text key={e} className="px-tick" x={X(k)} y={M.t + ph + 14} textAnchor="middle">{e}</text>)}
    <text className="axl" transform={`translate(13 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle">Muestra / Condrito</text>
    {body}
  </svg></div>;
}

export function Histogram({ win }: { win: Win }) {
  const [box, size] = useSize<HTMLDivElement>(); const R = useResolved(); const style = useApp(s => s.style);
  const sel = useApp(s => s.selection); const selSet = new Set(sel);
  const v = numVar(win.opts.var ?? 'Cu'); const log: boolean = win.opts.log ?? true; const nb = win.opts.bins ?? 24;
  const T = (x: number) => (log ? Math.log10(x) : x);
  const pts = SAMPLES.filter(s => R.vis[s.i].visible).map(s => ({ i: s.i, v: v.get(s) })).filter((p): p is { i: number; v: number } => p.v != null && (!log || p.v > 0));
  const lo = Math.min(...pts.map(p => T(p.v))), hi = Math.max(...pts.map(p => T(p.v)));
  const groups = style.color.mode === 'category' ? R.cats.map(c => c.name) : ['Todas'];
  const counts = groups.map(g => histogram(pts.filter(p => g === 'Todas' || R.vis[p.i].cat === g).map(p => T(p.v)), nb, lo, hi));
  const selCounts = histogram(pts.filter(p => selSet.has(p.i)).map(p => T(p.v)), nb, lo, hi);
  const stack = counts[0].map((_, b) => counts.reduce((s, c) => s + c[b], 0)); const max = Math.max(1, ...stack);
  const pw = size.w - M.l - M.r, ph = size.h - M.t - M.b, bw = pw / nb;
  const yt = niceTicks(0, max, 4); const xt = log ? logTicks(10 ** lo, 10 ** hi) : niceTicks(lo, hi, 5);
  const sx = (t: number) => M.l + ((t - lo) / (hi - lo || 1)) * pw, sy = (c: number) => M.t + ph - (c / max) * ph;
  return <div ref={box} style={{ width: '100%', height: '100%' }}><svg className="px-plot" width={size.w} height={size.h}>
    <rect className="frame" x={M.l} y={M.t} width={pw} height={ph} />
    {yt.map(t => <g key={t}><line className="grid" x1={M.l} x2={M.l + pw} y1={sy(t)} y2={sy(t)} /><text className="px-tick" x={M.l - 6} y={sy(t) + 3} textAnchor="end">{t}</text></g>)}
    {counts[0].map((_, b) => { let acc = 0; return groups.map((g, k) => { const c = counts[k][b]; const y0 = acc; acc += c; if (!c) return null; const col = g === 'Todas' ? (style.color.mode === 'value' ? R.valueColor(log ? 10 ** (lo + (b + 0.5) * (hi - lo) / nb) : lo + (b + 0.5) * (hi - lo) / nb) : 'var(--brand)') : R.cats[k].color; return <rect key={g + b} x={M.l + b * bw + 1} width={bw - 2} y={sy(y0 + c)} height={sy(y0) - sy(y0 + c)} fill={col} opacity={0.85} />; }); })}
    {selCounts.map((c, b) => c ? <rect key={'s' + b} x={M.l + b * bw + 1} width={bw - 2} y={sy(c)} height={sy(0) - sy(c)} fill="none" stroke="var(--brush)" strokeWidth={1.5} /> : null)}
    {style.color.mode === 'value' && style.color.valueVar === v.key && R.breaks.map((br, k) => <line key={k} x1={sx(T(br))} x2={sx(T(br))} y1={M.t} y2={M.t + ph} stroke="var(--text)" strokeDasharray="3 3" />)}
    {xt.map(t => <text key={t} className="px-tick" x={sx(log ? Math.log10(t) : t)} y={M.t + ph + 14} textAnchor="middle">{fmt(t)}</text>)}
    <text className="axl" x={M.l + pw / 2} y={size.h - 6} textAnchor="middle">{v.label}{v.unit ? ` (${v.unit})` : ''}{log ? ' · log' : ''}</text>
    <text className="axl" transform={`translate(13 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle">Muestras</text>
  </svg></div>;
}

export function Ternary({ win }: { win: Win }) {
  const [box, size] = useSize<HTMLDivElement>(); const R = useResolved(); const style = useApp(s => s.style);
  const sel = useApp(s => s.selection), select = useApp(s => s.select); const selSet = new Set(sel); const hasSel = selSet.size > 0;
  const side = Math.min(size.w - 60, (size.h - 50) / 0.866), x0 = (size.w - side) / 2, y0 = size.h - 30;
  const P = (a: number, f: number, m: number) => { const s = a + f + m; const F = f / s, Mg = m / s; return [x0 + side * (Mg + F / 2), y0 - side * 0.866 * F] as [number, number]; };
  const tn = win.opts.tern as { a: string; b: string; c: string; la: string; lb: string; lc: string } | undefined;
  const ca = tn ? compile(tn.a) : null, cb = tn ? compile(tn.b) : null, cc = tn ? compile(tn.c) : null;
  const val = (c: ReturnType<typeof compile> | null, s: (typeof SAMPLES)[number]) => { if (!c || !c.ok) return null; const v = c.run({ s }); return typeof v === 'number' && v >= 0 ? v : null; };
  const pts = SAMPLES.filter(s => R.vis[s.i].visible).map(s => { if (!tn) return { i: s.i, p: P(s.Na2O + s.K2O, s.FeOT, s.MgO) }; const a = val(ca, s), b = val(cb, s), c = val(cc, s); return a == null || b == null || c == null || a + b + c <= 0 ? null : { i: s.i, p: P(a, b, c) }; }).filter((x): x is { i: number; p: [number, number] } => !!x).sort((a, b) => (selSet.has(a.i) ? 1 : 0) - (selSet.has(b.i) ? 1 : 0));
  const ib = [[0.37, 0.5], [0.4, 0.45], [0.45, 0.4], [0.5, 0.36], [0.6, 0.3], [0.7, 0.24], [0.8, 0.17]].map(([fF, fM]) => P(1 - fF - fM, fF, fM));
  return <div ref={box} style={{ width: '100%', height: '100%' }}><svg className="px-plot" width={size.w} height={size.h}>
    <path d={`M${x0},${y0}L${x0 + side},${y0}L${x0 + side / 2},${y0 - side * 0.866}Z`} className="frame" />
    {[0.25, 0.5, 0.75].map(t => <path key={t} className="grid" d={`M${P(1 - t, t, 0).join(',')}L${P(0, t, 1 - t).join(',')}`} />)}
    {!tn && <><path d={'M' + ib.map(p => p.join(',')).join('L')} fill="none" style={{ stroke: 'var(--field-line)' }} strokeWidth={1.4} strokeDasharray="5 3" />
    <text className="fname" x={ib[1][0] - 26} y={ib[1][1] - 12}>Toleítica</text><text className="fname" x={ib[5][0] + 8} y={ib[5][1] + 22}>Calcoalcalina</text></>}
    <text className="axl" x={x0 - 4} y={y0 + 16} textAnchor="middle">{tn ? tn.la : 'A (Na₂O+K₂O)'}</text><text className="axl" x={x0 + side + 4} y={y0 + 16} textAnchor="middle">{tn ? tn.lc : 'M (MgO)'}</text><text className="axl" x={x0 + side / 2} y={y0 - side * 0.866 - 6} textAnchor="middle">{tn ? tn.lb : 'F (FeOT)'}</text>
    {pts.map(({ i, p }) => { const v = R.vis[i], on = selSet.has(i); return <path key={i} transform={`translate(${p[0]},${p[1]})`} d={symbolPath(v.shape, v.size)} fill={style.shape.hollow ? 'none' : v.color} fillOpacity={style.opacity} stroke={on ? 'var(--brush)' : style.shape.hollow ? v.color : 'rgba(20,30,40,.3)'} strokeWidth={on ? 1.8 : 0.7} opacity={hasSel && !on ? 0.22 : 1} onClick={e => select([i], e.shiftKey ? 'toggle' : 'replace')} style={{ cursor: 'pointer' }} />; })}
  </svg></div>;
}

// ── Spectrometry ───────────────────────────────────────────────────────────
export function SpectrumPlot({ win }: { win: Win }) {
  const [box, size] = useSize<HTMLDivElement>(); const focus = useApp(s => s.focusInterval);
  const range: string = win.opts.range ?? 'swir', hull = range !== 'full' ? true : false;
  const iv = DDH[focus], comp = DDH[Math.min(DDH.length - 1, focus + 1)];
  const [lo, hi] = range === 'vnir' ? [350, 1000] : range === 'swir' ? [1300, 2500] : [350, 2500];
  const sp = (m: string, sd: number) => spectrum(m, sd, hull).map((v, k) => ({ x: WL[k], v })).filter(p => p.x >= lo && p.x <= hi);
  const a = sp(iv.mineral, iv.i), b = sp(comp.mineral, comp.i + 50), ref = spectrum(iv.mineral, 999, hull, 0).map((v, k) => ({ x: WL[k], v })).filter(p => p.x >= lo && p.x <= hi);
  const vals = [...a, ...b].map(p => p.v); const y0 = Math.min(...vals) - 0.02, y1 = Math.max(...vals) + 0.02;
  const pw = size.w - M.l - M.r, ph = size.h - M.t - M.b;
  const X = (x: number) => M.l + ((x - lo) / (hi - lo)) * pw, Y = (v: number) => M.t + ph - ((v - y0) / (y1 - y0)) * ph;
  const path = (p: { x: number; v: number }[]) => p.map((q, k) => `${k ? 'L' : 'M'}${X(q.x).toFixed(1)},${Y(q.v).toFixed(1)}`).join('');
  const feats = [[920, 'Fe³⁺'], [1412, 'OH'], [1912, 'H₂O'], [2202, 'Al-OH'], [2250, 'Fe-OH'], [2340, 'Mg-OH']].filter(([x]) => +x >= lo && +x <= hi) as [number, string][];
  const min = a.reduce((m, p) => (p.x > 2150 && p.x < 2260 && p.v < m.v ? p : m), { x: 2200, v: 9 });
  return <div ref={box} style={{ width: '100%', height: '100%' }}><svg className="px-plot" width={size.w} height={size.h}>
    <rect className="frame" x={M.l} y={M.t} width={pw} height={ph} />
    {[[975, 1025], [1800, 1860]].filter(([s, e]) => e > lo && s < hi).map(([s, e]) => <rect key={s} x={X(Math.max(s, lo))} y={M.t + 1} width={X(Math.min(e, hi)) - X(Math.max(s, lo))} height={ph - 2} fill="var(--warning)" opacity={0.1} />)}
    {niceTicks(y0, y1, 4).map(t => <g key={t}><line className="grid" x1={M.l} x2={M.l + pw} y1={Y(t)} y2={Y(t)} /><text className="px-tick" x={M.l - 6} y={Y(t) + 3} textAnchor="end">{t.toFixed(2)}</text></g>)}
    {niceTicks(lo, hi, 6).map(t => <text key={t} className="px-tick" x={X(t)} y={M.t + ph + 14} textAnchor="middle">{t}</text>)}
    {feats.map(([x, l]) => <g key={l}><line x1={X(x)} x2={X(x)} y1={M.t + 14} y2={M.t + ph} stroke="var(--text-muted)" strokeDasharray="2 3" opacity={0.6} /><text className="ref" x={X(x)} y={M.t + 10} textAnchor="middle" style={{ fontWeight: 600 }}>{l}</text></g>)}
    <path d={path(ref)} fill="none" stroke="var(--text)" strokeDasharray="4 3" opacity={0.55} />
    <path d={path(b)} fill="none" stroke={MINERALS[comp.mineral].color} strokeWidth={1.2} opacity={0.55} />
    <path d={path(a)} fill="none" stroke={MINERALS[iv.mineral].color} strokeWidth={2} />
    {range !== 'vnir' && <><circle cx={X(min.x)} cy={Y(min.v)} r={4} fill="var(--bg-raised)" stroke={MINERALS[iv.mineral].color} strokeWidth={2} />
      <g transform={`translate(${M.l + pw - 178},${M.t + ph - 46})`}><rect width="170" height="40" rx="4" fill="var(--bg-raised)" stroke="var(--border-strong)" /><text className="px-tick" x="8" y="16" style={{ fill: 'var(--text)' }}>{min.x.toFixed(1)} nm · prof. {(1 - min.v).toFixed(3)}</text><text className="px-tick" x="8" y="31">FWHM 34 nm · asim. 0.96</text></g></>}
    <text className="axl" x={M.l + pw / 2} y={size.h - 6} textAnchor="middle">Longitud de onda (nm)</text>
    <text className="axl" transform={`translate(13 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle">{hull ? 'Hull quotient' : 'Reflectancia'}</text>
  </svg></div>;
}

export function StripLog({ tracks }: { tracks: { label: string; unit: string; get: (i: number) => number | null; lo: number; hi: number; log?: boolean; color: string }[] }) {
  const [box, size] = useSize<HTMLDivElement>(); const focus = useApp(s => s.focusInterval), set = useApp(s => s.set);
  const [hover, setHover] = useState<number | null>(null);
  const top = 34, bot = 10, h = size.h - top - bot, Y = (d: number) => top + (d / 320) * h;
  const depthW = 34, minW = 30, gap = 6, tw = Math.max(46, (size.w - depthW - minW - gap * (tracks.length + 2)) / tracks.length);
  const xs: number[] = []; let x = depthW + gap + minW + gap; for (let k = 0; k < tracks.length; k++) { xs.push(x); x += tw + gap; }
  const pick = (e: React.MouseEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); const d = ((e.clientY - r.top - top) / h) * 320; return Math.max(0, Math.min(DDH.length - 1, Math.floor(d / 4))); };
  return <div ref={box} style={{ width: '100%', height: '100%' }}><svg className="px-plot" width={size.w} height={size.h} style={{ cursor: 'pointer' }} onPointerMove={e => setHover(pick(e))} onPointerLeave={() => setHover(null)} onClick={e => set({ focusInterval: pick(e), insOpen: true })}>
    <text className="px-tick" x={depthW / 2} y={14} textAnchor="middle" style={{ fill: 'var(--text)', fontWeight: 600 }}>Prof.</text><text className="px-tick" x={depthW / 2} y={26} textAnchor="middle">(m)</text>
    {[0, 40, 80, 120, 160, 200, 240, 280, 320].map(d => <text key={d} className="px-tick" x={depthW - 3} y={Y(d) + 3} textAnchor="end">{d}</text>)}
    <text className="px-tick" x={depthW + gap + minW / 2} y={14} textAnchor="middle" style={{ fill: 'var(--text)', fontWeight: 600 }}>Min.</text>
    {DDH.map(iv => <rect key={iv.i} x={depthW + gap} y={Y(iv.from)} width={minW} height={Y(iv.to) - Y(iv.from) + 0.3} fill={iv.saturated ? 'var(--bg-sunken)' : MINERALS[iv.mineral].color} />)}
    {tracks.map((t, k) => {
      const T = (v: number) => (t.log ? Math.log10(v) : v); const X = (v: number) => xs[k] + 3 + ((T(v) - T(t.lo)) / (T(t.hi) - T(t.lo))) * (tw - 6);
      const d = DDH.map(iv => ({ v: t.get(iv.i), y: Y(iv.from + 2) })).filter(p => p.v != null) as { v: number; y: number }[];
      return <g key={t.label}><text className="px-tick" x={xs[k] + tw / 2} y={14} textAnchor="middle" style={{ fill: 'var(--text)', fontWeight: 600 }}>{t.label}</text><text className="px-tick" x={xs[k] + tw / 2} y={26} textAnchor="middle">{t.unit}</text>
        <rect className="frame" x={xs[k]} y={top} width={tw} height={h} /><line className="grid" x1={xs[k] + tw / 2} x2={xs[k] + tw / 2} y1={top} y2={top + h} />
        <path d={d.map((p, j) => `${j ? 'L' : 'M'}${X(p.v).toFixed(1)},${p.y.toFixed(1)}`).join('')} fill="none" stroke={t.color} strokeWidth={1.4} />
        <text className="px-tick" x={xs[k] + 2} y={top + h - 3} style={{ fontSize: 8.5 }}>{fmt(t.lo)}</text><text className="px-tick" x={xs[k] + tw - 2} y={top + h - 3} textAnchor="end" style={{ fontSize: 8.5 }}>{fmt(t.hi)}</text></g>;
    })}
    {hover != null && <rect x={depthW + gap - 2} y={Y(DDH[hover].from)} width={x - depthW - gap} height={Y(4) - Y(0)} fill="var(--accent)" opacity={0.18} />}
    <rect x={depthW + gap - 2} y={Y(DDH[focus].from) - 1.5} width={x - depthW - gap} height={Y(4) - Y(0) + 3} fill="none" stroke="var(--brush)" strokeWidth={1.6} />
  </svg></div>;
}
export const SPEC_TRACKS = [
  { label: 'Al-OH', unit: '(nm)', get: (i: number) => DDH[i].aloh, lo: 2194, hi: 2212, color: '#e69f00' },
  { label: 'Crist.', unit: 'illita', get: (i: number) => DDH[i].cryst, lo: 0.5, hi: 3.5, color: '#b35a00' },
  { label: 'Cu', unit: '(ppm)', get: (i: number) => DDH[i].cu, lo: 10, hi: 10000, log: true, color: 'var(--brand)' },
];
export const PETRO_TRACKS = [
  { label: 'Densidad', unit: '(g/cm³)', get: (i: number) => PETRO[i].density, lo: 2.5, hi: 2.9, color: '#0072b2' },
  { label: 'Susc. mag.', unit: '(×10⁻³ SI)', get: (i: number) => PETRO[i].magsus, lo: 0.05, hi: 20, log: true, color: '#cc79a7' },
  { label: 'Cu', unit: '(ppm)', get: (i: number) => DDH[i].cu, lo: 10, hi: 10000, log: true, color: 'var(--brand)' },
];

export function VectorPlot() {
  const [box, size] = useSize<HTMLDivElement>(); const focus = useApp(s => s.focusInterval), set = useApp(s => s.set);
  const pts = DDH.filter(iv => iv.aloh != null && iv.cryst != null);
  const pw = size.w - M.l - M.r, ph = size.h - M.t - M.b;
  const X = (v: number) => M.l + ((v - 2194) / 18) * pw, Y = (v: number) => M.t + ph - ((v - 0.4) / 3.2) * ph;
  return <div ref={box} style={{ width: '100%', height: '100%' }}><svg className="px-plot" width={size.w} height={size.h}>
    <rect className="frame" x={M.l} y={M.t} width={pw} height={ph} />
    {[2196, 2200, 2204, 2208, 2212].map(v => <g key={v}><line className="grid" x1={X(v)} x2={X(v)} y1={M.t} y2={M.t + ph} /><text className="px-tick" x={X(v)} y={M.t + ph + 14} textAnchor="middle">{v}</text></g>)}
    {[1, 2, 3].map(v => <g key={v}><line className="grid" x1={M.l} x2={M.l + pw} y1={Y(v)} y2={Y(v)} /><text className="px-tick" x={M.l - 6} y={Y(v) + 3} textAnchor="end">{v}</text></g>)}
    <path d={`M${X(2209)},${Y(1)}Q${X(2203)},${Y(1.4)} ${X(2198)},${Y(3)}`} fill="none" stroke="var(--accent-strong)" strokeWidth={1.5} strokeDasharray="5 4" />
    <text className="ref" x={X(2198) + 8} y={Y(3.2)} style={{ fill: 'var(--accent-strong)', fontWeight: 600 }}>hacia el centro del pórfido</text>
    {pts.map(iv => <circle key={iv.i} cx={X(iv.aloh!)} cy={Y(iv.cryst!)} r={Math.max(2.5, 2 + 1.6 * (Math.log10(iv.cu) - 1.5))} fill={MINERALS[iv.mineral].color} fillOpacity={0.85} stroke={iv.i === focus ? 'var(--brush)' : 'none'} strokeWidth={2} style={{ cursor: 'pointer' }} onClick={() => set({ focusInterval: iv.i })} />)}
    <text className="axl" x={M.l + pw / 2} y={size.h - 6} textAnchor="middle">Posición Al-OH (nm)</text>
    <text className="axl" transform={`translate(13 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle">Cristalinidad illita</text>
  </svg></div>;
}
