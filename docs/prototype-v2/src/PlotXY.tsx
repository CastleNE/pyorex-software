import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SAMPLES } from './data';
import { useApp, type Layers, type Win } from './store';
import { useResolved, type Resolved } from './resolve';
import { contourSegments, convexHull, ellipse, fmt, histogram, kde2d, logTicks, niceTicks, rampColor, rampCss, regression, symbolPath, type Pt } from './viz';

export interface PlotPoint { i: number; x: number; y: number }
export interface PlotProps {
  win: Win; points: PlotPoint[]; xLabel: string; yLabel: string; logX?: boolean; logY?: boolean;
  domain?: { x?: [number, number]; y?: [number, number] }; equal?: boolean;
  fields?: { name: string; poly: [number, number][]; label: [number, number] }[];
  under?: (sx: (v: number) => number, sy: (v: number) => number) => ReactNode;
  over?: (sx: (v: number) => number, sy: (v: number) => number) => ReactNode;
  valueText?: (i: number) => string;
  padLeft?: number;
}

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null); const [size, setSize] = useState({ w: 400, h: 300 });
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(120, e.contentRect.width), h: Math.max(120, e.contentRect.height) })); ro.observe(el); return () => ro.disconnect(); }, []);
  return [ref, size] as const;
}

const pad = (lo: number, hi: number, log: boolean, f = 0.05): [number, number] => {
  if (log) { const a = Math.log10(lo), b = Math.log10(hi), d = (b - a || 1) * f; return [10 ** (a - d), 10 ** (b + d)]; }
  const d = (hi - lo || Math.abs(hi) || 1) * f; return [lo - d, hi + d];
};
const inPolyPx = (x: number, y: number, p: [number, number][]) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };

export default function PlotXY(props: PlotProps) {
  const { win, points, xLabel, yLabel, logX = false, logY = false, fields } = props;
  const L: Layers = win.layers; const tool: string = win.opts.tool ?? 'lasso';
  const [box, size] = useSize<HTMLDivElement>();
  const R = useResolved();
  const selection = useApp(s => s.selection), isolate = useApp(s => s.isolate), select = useApp(s => s.select), patchWin = useApp(s => s.patchWin), theme = useApp(s => s.theme);
  const colorMode = useApp(s => s.style.color.mode);
  const selSet = useMemo(() => new Set(selection), [selection]);
  const [hover, setHover] = useState<{ i: number; px: number; py: number } | null>(null);
  const [drag, setDrag] = useState<{ kind: 'lasso' | 'box' | 'pan'; pts: [number, number][]; start?: { x: number; y: number; view: any } } | null>(null);

  const visible = points.filter(p => R.vis[p.i].visible && (!isolate || selSet.has(p.i)) && (!logX || p.x > 0) && (!logY || p.y > 0));
  const mTop = 10 + (L.marginals !== 'off' ? 46 : 0), mRight = 14 + (L.marginals !== 'off' ? 46 : 0), mLeft = props.padLeft ?? 54, mBottom = 40;
  const W = size.w, H = size.h, pw = Math.max(40, W - mLeft - mRight), ph = Math.max(40, H - mTop - mBottom);

  const base = useMemo(() => {
    const xs = points.map(p => p.x).filter(v => !logX || v > 0), ys = points.map(p => p.y).filter(v => !logY || v > 0);
    let x = props.domain?.x ?? pad(Math.min(...xs), Math.max(...xs), logX), y = props.domain?.y ?? pad(Math.min(...ys), Math.max(...ys), logY);
    if (props.equal) { const sx = (x[1] - x[0]) / pw, sy = (y[1] - y[0]) / ph, s = Math.max(sx, sy); const cx = (x[0] + x[1]) / 2, cy = (y[0] + y[1]) / 2; x = [cx - (s * pw) / 2, cx + (s * pw) / 2]; y = [cy - (s * ph) / 2, cy + (s * ph) / 2]; }
    return { x, y };
  }, [points, logX, logY, props.domain, props.equal, pw, ph]);
  const view: { x: [number, number]; y: [number, number] } = (() => {
    const v = win.opts.view; if (!v) return base; if (!props.equal) return v;
    const sxu = (v.x[1] - v.x[0]) / pw, syu = (v.y[1] - v.y[0]) / ph, u = Math.max(sxu, syu); const cx = (v.x[0] + v.x[1]) / 2, cy = (v.y[0] + v.y[1]) / 2;
    return { x: [cx - (u * pw) / 2, cx + (u * pw) / 2], y: [cy - (u * ph) / 2, cy + (u * ph) / 2] };
  })();
  const T = (v: number, log: boolean) => (log ? Math.log10(v) : v), TI = (v: number, log: boolean) => (log ? 10 ** v : v);
  const sx = (v: number) => mLeft + ((T(v, logX) - T(view.x[0], logX)) / (T(view.x[1], logX) - T(view.x[0], logX))) * pw;
  const sy = (v: number) => mTop + ph - ((T(v, logY) - T(view.y[0], logY)) / (T(view.y[1], logY) - T(view.y[0], logY))) * ph;
  const ix = (px: number) => TI(T(view.x[0], logX) + ((px - mLeft) / pw) * (T(view.x[1], logX) - T(view.x[0], logX)), logX);
  const iy = (py: number) => TI(T(view.y[0], logY) + ((mTop + ph - py) / ph) * (T(view.y[1], logY) - T(view.y[0], logY)), logY);
  const xt = logX ? logTicks(view.x[0], view.x[1]) : niceTicks(view.x[0], view.x[1], Math.max(3, Math.round(pw / 90)));
  const yt = logY ? logTicks(view.y[0], view.y[1]) : niceTicks(view.y[0], view.y[1], Math.max(3, Math.round(ph / 60)));

  // groups for overlays (by colour category, or a single group in value/fixed mode)
  const grouped = !!R.vis.length && colorMode === 'category';
  const groups = useMemo(() => {
    const m = new Map<string, Pt[]>();
    for (const p of visible) { const key = grouped ? R.vis[p.i].cat : 'Todas'; if (!m.has(key)) m.set(key, []); m.get(key)!.push({ x: T(p.x, logX), y: T(p.y, logY) }); }
    return [...m.entries()].map(([name, pts]) => ({ name, pts, color: grouped ? R.cats.find(c => c.name === name)?.color ?? '#888' : 'var(--accent-strong)' }));
  }, [visible, grouped, R, logX, logY]);

  const density = useMemo(() => {
    if (L.density === 'off') return [];
    const xr: [number, number] = [T(view.x[0], logX), T(view.x[1], logX)], yr: [number, number] = [T(view.y[0], logY), T(view.y[1], logY)];
    const sets = L.densityBy === 'group' && grouped ? groups.filter(g => g.pts.length >= 5) : [{ name: 'Todas', pts: visible.map(p => ({ x: T(p.x, logX), y: T(p.y, logY) })), color: '' }];
    return sets.map(g => ({ ...g, k: kde2d(g.pts, xr, yr, 56, L.bw) }));
  }, [L.density, L.densityBy, L.bw, groups, visible, view, logX, logY, grouped]);

  const cellW = pw / 55, cellH = ph / 55;
  const densityLayer = density.map((d, gi) => {
    const { z, max, n } = d.k; const all = !d.color; const out: ReactNode[] = [];
    const gx = (i: number) => mLeft + (i / (n - 1)) * pw, gy = (j: number) => mTop + ph - (j / (n - 1)) * ph;
    if (L.density === 'heat' || L.density === 'filled') {
      const levels = [0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const t = z[j][i] / max; if (t < 0.06) continue;
        let fill: string, op: number;
        if (L.density === 'heat') { fill = all ? rampColor('magma', 0.15 + 0.85 * t, true) : d.color; op = all ? 0.75 * Math.min(1, t * 1.4) : 0.55 * t; }
        else { const lv = levels.filter(l => t >= l).length; fill = all ? rampColor('viridis', lv / levels.length) : d.color; op = all ? 0.55 : 0.08 + 0.07 * lv; }
        out.push(<rect key={`${gi}-${i}-${j}`} x={gx(i) - cellW / 2} y={gy(j) - cellH / 2} width={cellW + 0.6} height={cellH + 0.6} fill={fill} opacity={op} />);
      }
    }
    if (L.density === 'contours' || L.density === 'filled') {
      for (const lv of [0.15, 0.35, 0.55, 0.75, 0.9]) {
        const segs = contourSegments(z, lv * max);
        const dd = segs.map(([a, b, c, e]) => `M${gx(a).toFixed(1)},${gy(b).toFixed(1)}L${gx(c).toFixed(1)},${gy(e).toFixed(1)}`).join('');
        out.push(<path key={`${gi}-c${lv}`} d={dd} fill="none" stroke={all ? 'var(--text)' : d.color} strokeWidth={lv === 0.9 ? 1.6 : 1.1} opacity={all ? 0.55 : 0.9} />);
      }
    }
    return <g key={gi}>{out}</g>;
  });

  const P = (p: Pt) => `${sx(TI(p.x, logX)).toFixed(1)},${sy(TI(p.y, logY)).toFixed(1)}`;
  const hulls = L.hull ? groups.filter(g => g.pts.length >= 3).map(g => <polygon key={g.name} points={convexHull(g.pts).map(P).join(' ')} fill={g.color} fillOpacity={0.07} stroke={g.color} strokeWidth={1.3} strokeDasharray="5 3" />) : null;
  const ells = L.ellipse !== 'off' ? groups.filter(g => g.pts.length >= 4).map(g => <g key={g.name}><polygon points={ellipse(g.pts, L.ellipse === '95' ? 2.4477 : 1).map(P).join(' ')} fill={g.color} fillOpacity={0.1} stroke={g.color} strokeWidth={1.6} /><circle cx={sx(TI(g.pts.reduce((s, p) => s + p.x, 0) / g.pts.length, logX))} cy={sy(TI(g.pts.reduce((s, p) => s + p.y, 0) / g.pts.length, logY))} r={3.5} fill={g.color} stroke="var(--bg-raised)" /></g>) : null;
  const regs = L.regression !== 'off' ? (L.regression === 'group' ? groups : [{ name: 'Todas', pts: groups.flatMap(g => g.pts), color: 'var(--text)' }]).map((g, k) => {
    const r = regression(g.pts); if (!r) return null; const x0 = Math.min(...g.pts.map(p => p.x)), x1 = Math.max(...g.pts.map(p => p.x));
    const a = { x: x0, y: r.m * x0 + r.b }, b = { x: x1, y: r.m * x1 + r.b };
    return <g key={g.name}><line x1={sx(TI(a.x, logX))} y1={sy(TI(a.y, logY))} x2={sx(TI(b.x, logX))} y2={sy(TI(b.y, logY))} stroke={g.color} strokeWidth={2} strokeLinecap="round" />
      <text x={mLeft + pw - 6} y={mTop + 14 + k * 14} textAnchor="end" className="px-tick" style={{ fill: g.color === 'var(--text)' ? 'var(--text)' : g.color, fontWeight: 600 }}>{g.name}: R² = {r.r2.toFixed(2)} · n = {r.n}</text></g>;
  }) : null;

  // points (draw order: category order, then selection on top)
  const sorted = [...visible].sort((a, b) => (R.vis[a.i].drawRank - R.vis[b.i].drawRank) || (selSet.has(a.i) ? 1 : 0) - (selSet.has(b.i) ? 1 : 0));
  const hasSel = selSet.size > 0 && !isolate;
  const style = useApp(s => s.style);
  const outline = style.outline === 'none' ? 'none' : style.outline === 'dark' ? 'rgba(0,0,0,.65)' : style.outline === 'light' ? 'rgba(255,255,255,.85)' : theme === 'dark' ? 'rgba(255,255,255,.35)' : 'rgba(20,30,40,.35)';
  const pointsLayer = L.points && sorted.map(p => {
    const v = R.vis[p.i], sel = selSet.has(p.i), hollow = style.shape.hollow;
    return <path key={p.i} transform={`translate(${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)})`} d={symbolPath(v.shape, v.size)}
      fill={hollow ? 'none' : v.color} fillOpacity={style.opacity} stroke={sel ? 'var(--brush)' : hollow ? v.color : outline} strokeWidth={sel ? 1.8 : hollow ? 1.6 : 0.7}
      opacity={hasSel && !sel ? 0.22 : 1} />;
  });
  const labels = L.labels !== 'off' && visible.length <= 400 ? sorted.filter((_, k) => k % Math.ceil(visible.length / 120) === 0).map(p => <text key={p.i} x={sx(p.x) + R.vis[p.i].size / 2 + 2} y={sy(p.y) - 3} className="px-tick" style={{ fontSize: 9.5, fill: 'var(--text-muted)' }}>{L.labels === 'id' ? SAMPLES[p.i].id : props.valueText?.(p.i) ?? ''}</text>) : null;

  // marginals
  const marg = L.marginals !== 'off' && (() => {
    const out: ReactNode[] = []; const nb = 24;
    const sets = grouped ? groups : [{ name: 'Todas', pts: groups.flatMap(g => g.pts), color: 'var(--accent-strong)' }];
    const xr = [T(view.x[0], logX), T(view.x[1], logX)], yr = [T(view.y[0], logY), T(view.y[1], logY)];
    if (L.marginals === 'hist') {
      const hx = sets.map(g => histogram(g.pts.map(p => p.x), nb, xr[0], xr[1])), hy = sets.map(g => histogram(g.pts.map(p => p.y), nb, yr[0], yr[1]));
      const mx = Math.max(1, ...hx.flat()), my = Math.max(1, ...hy.flat());
      sets.forEach((g, k) => {
        const px = hx[k].map((c, b) => `${mLeft + ((b + 0.5) / nb) * pw},${mTop - 6 - (c / mx) * 36}`).join(' ');
        out.push(<polyline key={`x${k}`} points={`${mLeft},${mTop - 6} ${px} ${mLeft + pw},${mTop - 6}`} fill={g.color} fillOpacity={0.18} stroke={g.color} strokeWidth={1.4} />);
        const py = hy[k].map((c, b) => `${mLeft + pw + 6 + (c / my) * 36},${mTop + ph - ((b + 0.5) / nb) * ph}`).join(' ');
        out.push(<polyline key={`y${k}`} points={`${mLeft + pw + 6},${mTop + ph} ${py} ${mLeft + pw + 6},${mTop}`} fill={g.color} fillOpacity={0.18} stroke={g.color} strokeWidth={1.4} />);
      });
    } else {
      sets.forEach((g, k) => {
        const q = (a: number[], f: number) => { const s = [...a].sort((u, v) => u - v); const p = (s.length - 1) * f, lo = Math.floor(p); return s[lo] + (s[Math.ceil(p)] - s[lo]) * (p - lo); };
        const bh = Math.min(10, 40 / sets.length - 2), xs = g.pts.map(p => p.x), ys = g.pts.map(p => p.y);
        const [a, b, c, d, e] = [0.05, 0.25, 0.5, 0.75, 0.95].map(f => q(xs, f)); const y0 = mTop - 8 - (k + 1) * (bh + 2);
        out.push(<g key={`bx${k}`} stroke={g.color}><line x1={sx(TI(a, logX))} x2={sx(TI(e, logX))} y1={y0 + bh / 2} y2={y0 + bh / 2} /><rect x={sx(TI(b, logX))} y={y0} width={Math.max(1, sx(TI(d, logX)) - sx(TI(b, logX)))} height={bh} fill={g.color} fillOpacity={0.25} /><line x1={sx(TI(c, logX))} x2={sx(TI(c, logX))} y1={y0} y2={y0 + bh} strokeWidth={2} /></g>);
        const [a2, b2, c2, d2, e2] = [0.05, 0.25, 0.5, 0.75, 0.95].map(f => q(ys, f)); const x0 = mLeft + pw + 8 + k * (bh + 2);
        out.push(<g key={`by${k}`} stroke={g.color}><line y1={sy(TI(a2, logY))} y2={sy(TI(e2, logY))} x1={x0 + bh / 2} x2={x0 + bh / 2} /><rect y={sy(TI(d2, logY))} x={x0} height={Math.max(1, sy(TI(b2, logY)) - sy(TI(d2, logY)))} width={bh} fill={g.color} fillOpacity={0.25} /><line y1={sy(TI(c2, logY))} y2={sy(TI(c2, logY))} x1={x0} x2={x0 + bh} strokeWidth={2} /></g>);
      });
    }
    return out;
  })();

  // interaction
  const svgRef = useRef<SVGSVGElement>(null);
  const local = (e: React.PointerEvent | React.WheelEvent) => { const r = svgRef.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as [number, number]; };
  const nearest = (x: number, y: number) => { let best: number | null = null, bd = 100; for (const p of visible) { const d = (sx(p.x) - x) ** 2 + (sy(p.y) - y) ** 2; if (d < bd) { bd = d; best = p.i; } } return best; };
  const onDown = (e: React.PointerEvent) => {
    const [x, y] = local(e); (e.target as Element).setPointerCapture?.(e.pointerId);
    if (tool === 'pan') setDrag({ kind: 'pan', pts: [[x, y]], start: { x, y, view } });
    else setDrag({ kind: tool === 'lasso' ? 'lasso' : 'box', pts: [[x, y]] });
  };
  const onMove = (e: React.PointerEvent) => {
    const [x, y] = local(e);
    if (!drag) { const n = nearest(x, y); setHover(n == null ? null : { i: n, px: x, py: y }); return; }
    if (drag.kind === 'pan' && drag.start) {
      const dx = x - drag.start.x, dy = y - drag.start.y, v = drag.start.view;
      const shift = (r: [number, number], d: number, span: number, log: boolean, sign: number): [number, number] => { const a = T(r[0], log), b = T(r[1], log), k = (sign * d * (b - a)) / span; return [TI(a - k, log), TI(b - k, log)]; };
      patchWin(win.id, { opts: { ...win.opts, view: { x: shift(v.x, dx, pw, logX, 1), y: shift(v.y, dy, ph, logY, -1) } } });
    } else setDrag({ ...drag, pts: [...drag.pts, [x, y]] });
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag) return; const mode = e.shiftKey ? 'add' : e.altKey ? 'toggle' : 'replace';
    if (drag.kind !== 'pan') {
      const [x0, y0] = drag.pts[0], [x1, y1] = drag.pts[drag.pts.length - 1];
      if (Math.hypot(x1 - x0, y1 - y0) < 4) { const n = nearest(x0, y0); n != null ? select([n], e.shiftKey ? 'toggle' : 'replace') : !e.shiftKey && select([]); }
      else if (drag.kind === 'box') { const [a, b, c, d] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)]; select(visible.filter(p => sx(p.x) >= a && sx(p.x) <= b && sy(p.y) >= c && sy(p.y) <= d).map(p => p.i), mode); }
      else select(visible.filter(p => inPolyPx(sx(p.x), sy(p.y), drag.pts)).map(p => p.i), mode);
    }
    setDrag(null);
  };
  const onWheel = (e: React.WheelEvent) => {
    const [x, y] = local(e); const k = e.deltaY > 0 ? 1.15 : 1 / 1.15; const cx = T(ix(x), logX), cy = T(iy(y), logY);
    const zr = (r: [number, number], c: number, log: boolean): [number, number] => [TI(c + (T(r[0], log) - c) * k, log), TI(c + (T(r[1], log) - c) * k, log)];
    patchWin(win.id, { opts: { ...win.opts, view: { x: zr(view.x, cx, logX), y: zr(view.y, cy, logY) } } });
  };

  const legend = L.legend && <PlotLegend R={R} />;
  const hs = hover && SAMPLES[hover.i];
  return (
    <div ref={box} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg ref={svgRef} className="px-plot" width={W} height={H} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setHover(null)} onWheel={onWheel}
        onDoubleClick={() => patchWin(win.id, { opts: { ...win.opts, view: undefined } })} style={{ cursor: tool === 'pan' ? (drag ? 'grabbing' : 'grab') : 'crosshair', touchAction: 'none', display: 'block' }}>
        <defs><clipPath id={`clip-${win.id}`}><rect x={mLeft} y={mTop} width={pw} height={ph} /></clipPath></defs>
        <rect className="frame" x={mLeft} y={mTop} width={pw} height={ph} />
        {L.grid && xt.map(t => <line key={`gx${t}`} className="grid" x1={sx(t)} x2={sx(t)} y1={mTop} y2={mTop + ph} />)}
        {L.grid && yt.map(t => <line key={`gy${t}`} className="grid" y1={sy(t)} y2={sy(t)} x1={mLeft} x2={mLeft + pw} />)}
        <g clipPath={`url(#clip-${win.id})`}>
          {L.fields && fields?.map((f, k) => <path key={f.name} d={'M' + f.poly.map(([a, b]) => `${sx(a)},${sy(b)}`).join('L') + 'Z'} style={{ fill: k % 2 ? 'var(--field-fill)' : 'transparent', stroke: 'var(--field-line)' }} />)}
          {L.fields && fields?.map(f => <text key={f.name + 't'} className="fname" x={sx(f.label[0])} y={sy(f.label[1])} textAnchor="middle">{f.name}</text>)}
          {props.under?.(sx, sy)}
          {densityLayer}{hulls}{ells}{pointsLayer}{regs}{labels}
          {props.over?.(sx, sy)}
        </g>
        {xt.map(t => <text key={`tx${t}`} className="px-tick" x={sx(t)} y={mTop + ph + 14} textAnchor="middle">{fmt(t)}</text>)}
        {yt.map(t => <text key={`ty${t}`} className="px-tick" x={mLeft - 6} y={sy(t) + 3} textAnchor="end">{fmt(t)}</text>)}
        <text className="axl" x={mLeft + pw / 2} y={H - 6} textAnchor="middle">{xLabel}{logX ? ' · log' : ''}</text>
        <text className="axl" transform={`translate(13 ${mTop + ph / 2}) rotate(-90)`} textAnchor="middle">{yLabel}{logY ? ' · log' : ''}</text>
        {marg}
        {drag && drag.kind === 'lasso' && <path className="lasso" d={'M' + drag.pts.map(p => p.join(',')).join('L') + 'Z'} />}
        {drag && drag.kind === 'box' && drag.pts.length > 1 && (() => { const [a, b] = drag.pts[0], [c, d] = drag.pts[drag.pts.length - 1]; return <rect className="lasso" x={Math.min(a, c)} y={Math.min(b, d)} width={Math.abs(c - a)} height={Math.abs(d - b)} />; })()}
      </svg>
      {legend && <div style={{ position: 'absolute', right: mRight + 8, top: mTop + 8, pointerEvents: 'auto' }}>{legend}</div>}
      {hs && !drag && (
        <div className="px-tip" style={{ left: Math.min(hover!.px + 14, W - 190), top: Math.max(4, hover!.py - 54) }}>
          <b className="mono">{hs.id}</b> · {hs.sector}<br /><span className="muted">{xLabel}</span> <span className="mono">{fmt(points.find(p => p.i === hover!.i)!.x)}</span> · <span className="muted">{yLabel}</span> <span className="mono">{fmt(points.find(p => p.i === hover!.i)!.y)}</span>
        </div>
      )}
    </div>
  );
}

export function PlotLegend({ R, compact = false }: { R: Resolved; compact?: boolean }) {
  const style = useApp(s => s.style);
  const c = style.color;
  const box: React.CSSProperties = { background: 'color-mix(in srgb, var(--bg-raised) 92%, transparent)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', fontSize: 11.5, lineHeight: '16px', boxShadow: 'var(--shadow-1)', maxWidth: 200 };
  return (
    <div style={box}>
      {c.mode === 'category' && R.cats.map(k => (
        <div key={k.name} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: style.hidden[`${c.catVar}:${k.name}`] ? 0.35 : 1 }}>
          <svg width="14" height="14" viewBox="-7 -7 14 14"><path d={symbolPath(style.shape.mode === 'category' && style.shape.catVar === c.catVar ? k.shape : style.shape.fixed, 10)} fill={style.shape.hollow ? 'none' : k.color} stroke={style.shape.hollow ? k.color : 'none'} strokeWidth={1.5} /></svg>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.name}</span>{!compact && <span className="mono muted" style={{ marginLeft: 'auto', fontSize: 10.5 }}>{k.n}</span>}
        </div>
      ))}
      {c.mode === 'value' && R.valueRange && (
        <div>
          <div className="muted" style={{ fontSize: 10.5, fontWeight: 600 }}>{c.valueVar}{c.log ? ' · log' : ''}</div>
          {c.method === 'continuous'
            ? <><div style={{ width: 140, height: 10, borderRadius: 3, background: rampCss(c.ramp, c.reverse), margin: '3px 0' }} /><div className="mono muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}><span>{fmt(R.valueRange[0])}</span><span>{fmt(R.valueRange[1])}</span></div></>
            : R.classColors.map((col, k) => <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: style.hiddenClasses[k] ? 0.35 : 1 }}><i style={{ width: 11, height: 11, borderRadius: 2, background: col, display: 'inline-block' }} /><span className="mono" style={{ fontSize: 10.5 }}>{k === 0 ? '< ' + fmt(R.breaks[0]) : k === R.breaks.length ? '≥ ' + fmt(R.breaks[k - 1]) : `${fmt(R.breaks[k - 1])} – ${fmt(R.breaks[k])}`}</span></div>)}
        </div>
      )}
      {style.size.mode === 'value' && R.sizeRange && (
        <div style={{ marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 4 }}>
          <div className="muted" style={{ fontSize: 10.5, fontWeight: 600 }}>Tamaño · {style.size.valueVar}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>{[0, 0.5, 1].map(t => { const s = style.size.min + (style.size.max - style.size.min) * Math.sqrt(t); const v = style.size.log ? 10 ** (Math.log10(R.sizeRange![0]) + t * (Math.log10(R.sizeRange![1]) - Math.log10(R.sizeRange![0]))) : R.sizeRange![0] + t * (R.sizeRange![1] - R.sizeRange![0]); return <span key={t} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}><svg width={s + 2} height={s + 2}><circle cx={s / 2 + 1} cy={s / 2 + 1} r={s / 2} fill="none" stroke="var(--text-muted)" /></svg><span className="mono" style={{ fontSize: 9.5 }}>{fmt(v)}</span></span>; })}</div>
        </div>
      )}
    </div>
  );
}
