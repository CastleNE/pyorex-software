// Visual engine: colour ramps, classification, symbols and overlay statistics.

// ── Colour ramps (perceptually ordered stops) ─────────────────────────────
export const RAMPS: Record<string, { label: string; stops: string[]; kind: 'seq' | 'div' | 'cat' }> = {
  viridis: { label: 'Viridis', kind: 'seq', stops: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'] },
  magma: { label: 'Magma', kind: 'seq', stops: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'] },
  plasma: { label: 'Plasma', kind: 'seq', stops: ['#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636', '#f0f921'] },
  cividis: { label: 'Cividis', kind: 'seq', stops: ['#00224e', '#35456c', '#666970', '#948e77', '#c8b866', '#fee838'] },
  geochem: { label: 'Anomalía', kind: 'seq', stops: ['#2b4c7e', '#3f8fb5', '#9fd3c7', '#f5e663', '#f39c34', '#d7301f', '#7f0000'] },
  terrain: { label: 'Terreno', kind: 'seq', stops: ['#1b4d3e', '#4f8f4a', '#b8c96a', '#e8d9a0', '#b07d48', '#6b3d1e'] },
  rdbu: { label: 'Divergente', kind: 'div', stops: ['#2166ac', '#67a9cf', '#d1e5f0', '#f7f7f7', '#fddbc7', '#ef8a62', '#b2182b'] },
};
export const CATEGORICAL: Record<string, string[]> = {
  'Okabe–Ito': ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#56b4e9', '#d55e00', '#f0e442', '#8c96a0'],
  'Tableau 10': ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'],
  'Tierra': ['#8c510a', '#35978f', '#bf812d', '#01665e', '#dfc27d', '#80cdc1', '#543005', '#003c30'],
  'Alto contraste': ['#000000', '#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7'],
};

function hex(c: string) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function toHex(r: number, g: number, b: number) { return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
export function rampColor(ramp: string, t: number, reverse = false) {
  const stops = RAMPS[ramp]?.stops ?? RAMPS.viridis.stops;
  let u = Math.max(0, Math.min(1, t)); if (reverse) u = 1 - u;
  const p = u * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
  const a = hex(stops[i]), b = hex(stops[i + 1]);
  return toHex(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}
export function rampCss(ramp: string, reverse = false) {
  const stops = RAMPS[ramp]?.stops ?? RAMPS.viridis.stops; const s = reverse ? [...stops].reverse() : stops;
  return `linear-gradient(90deg, ${s.map((c, i) => `${c} ${(i / (s.length - 1)) * 100}%`).join(', ')})`;
}
export function luminance(c: string) { const [r, g, b] = hex(c).map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

// ── Classification of numeric values into classes ──────────────────────────
export type ClassMethod = 'continuous' | 'quantile' | 'equal' | 'jenks' | 'manual';
export function computeBreaks(values: number[], method: ClassMethod, n: number, log: boolean): number[] {
  const v = values.filter(Number.isFinite).filter(x => !log || x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  const T = (x: number) => (log ? Math.log10(x) : x), I = (x: number) => (log ? 10 ** x : x);
  const lo = T(v[0]), hi = T(v[v.length - 1]);
  if (method === 'equal' || method === 'continuous' || method === 'manual') return Array.from({ length: n - 1 }, (_, k) => I(lo + ((hi - lo) * (k + 1)) / n));
  if (method === 'quantile') return Array.from({ length: n - 1 }, (_, k) => { const p = ((v.length - 1) * (k + 1)) / n, a = Math.floor(p); return v[a] + (v[Math.ceil(p)] - v[a]) * (p - a); });
  return jenks(log ? v.map(Math.log10) : v, n).map(I);
}
// Fisher–Jenks natural breaks (O(k·n²), fine for a few thousand samples)
function jenks(data: number[], k: number): number[] {
  const n = data.length; if (n <= k) return data.slice(1);
  const lower = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(0));
  const vari = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(Infinity));
  for (let j = 1; j <= k; j++) { lower[1][j] = 1; vari[1][j] = 0; }
  for (let l = 2; l <= n; l++) {
    let s1 = 0, s2 = 0, w = 0;
    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1, val = data[i3 - 1]; s2 += val * val; s1 += val; w++;
      const v = s2 - (s1 * s1) / w, i4 = i3 - 1;
      if (i4 !== 0) for (let j = 2; j <= k; j++) if (vari[l][j] >= v + vari[i4][j - 1]) { lower[l][j] = i3; vari[l][j] = v + vari[i4][j - 1]; }
    }
    lower[l][1] = 1; vari[l][1] = s2 - (s1 * s1) / w;
  }
  const breaks: number[] = []; let kk = n;
  for (let j = k; j >= 2; j--) { const id = lower[kk][j] - 2; breaks.unshift(data[id]); kk = lower[kk][j] - 1; }
  return breaks;
}
export function classIndex(x: number, breaks: number[]) { let k = 0; while (k < breaks.length && x >= breaks[k]) k++; return k; }

// ── Symbols ────────────────────────────────────────────────────────────────
export const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'triangle-down', 'pentagon', 'hexagon', 'star', 'cross', 'x'] as const;
export type Shape = (typeof SHAPES)[number];
export const SHAPE_LABEL: Record<Shape, string> = { circle: 'Círculo', square: 'Cuadrado', triangle: 'Triángulo', diamond: 'Rombo', 'triangle-down': 'Triángulo inv.', pentagon: 'Pentágono', hexagon: 'Hexágono', star: 'Estrella', cross: 'Cruz', x: 'Aspa' };
function poly(n: number, r: number, rot = -Math.PI / 2) { return Array.from({ length: n }, (_, k) => { const a = rot + (2 * Math.PI * k) / n; return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`; }); }
/** SVG path for a symbol of "size" = diameter in px, centred at 0,0 (area-matched so shapes look equally heavy). */
export function symbolPath(shape: Shape, size: number): string {
  const r = size / 2;
  switch (shape) {
    case 'circle': return `M${r},0A${r},${r} 0 1,1 ${-r},0A${r},${r} 0 1,1 ${r},0Z`;
    case 'square': { const s = r * 0.89; return `M${-s},${-s}H${s}V${s}H${-s}Z`; }
    case 'triangle': return 'M' + poly(3, r * 1.25).join('L') + 'Z';
    case 'triangle-down': return 'M' + poly(3, r * 1.25, Math.PI / 2).join('L') + 'Z';
    case 'diamond': return 'M' + poly(4, r * 1.2).join('L') + 'Z';
    case 'pentagon': return 'M' + poly(5, r * 1.08).join('L') + 'Z';
    case 'hexagon': return 'M' + poly(6, r * 1.05, 0).join('L') + 'Z';
    case 'star': return 'M' + Array.from({ length: 10 }, (_, k) => { const a = -Math.PI / 2 + (Math.PI * k) / 5, rr = k % 2 ? r * 0.55 : r * 1.3; return `${(rr * Math.cos(a)).toFixed(2)},${(rr * Math.sin(a)).toFixed(2)}`; }).join('L') + 'Z';
    case 'cross': { const a = r * 0.36, b = r * 1.1; return `M${-a},${-b}H${a}V${-a}H${b}V${a}H${a}V${b}H${-a}V${a}H${-b}V${-a}H${-a}Z`; }
    case 'x': { const a = r * 0.3, b = r * 1.05; return `M${-b + a},${-b}L0,${-a}L${b - a},${-b}L${b},${-b + a}L${a},0L${b},${b - a}L${b - a},${b}L0,${a}L${-b + a},${b}L${-b},${b - a}L${-a},0L${-b},${-b + a}Z`; }
  }
}

// ── Statistics for overlays ───────────────────────────────────────────────
export interface Pt { x: number; y: number }
/** 2D Gaussian KDE on a grid (Scott bandwidth × factor). Returns grid in data units. */
export function kde2d(pts: Pt[], xr: [number, number], yr: [number, number], n = 60, bwFactor = 1) {
  const N = pts.length; const sd = (a: number[]) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };
  const bx = Math.max(1e-9, sd(pts.map(p => p.x)) * N ** (-1 / 6) * bwFactor), by = Math.max(1e-9, sd(pts.map(p => p.y)) * N ** (-1 / 6) * bwFactor);
  const z: number[][] = []; let max = 0;
  for (let j = 0; j < n; j++) {
    const y = yr[0] + ((yr[1] - yr[0]) * j) / (n - 1); const row: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = xr[0] + ((xr[1] - xr[0]) * i) / (n - 1); let s = 0;
      for (const p of pts) { const u = (x - p.x) / bx, v = (y - p.y) / by; s += Math.exp(-0.5 * (u * u + v * v)); }
      row.push(s); if (s > max) max = s;
    }
    z.push(row);
  }
  return { z, max, n, xr, yr };
}
/** Marching squares iso-lines on a grid (returns line segments in grid coords). */
export function contourSegments(z: number[][], level: number): [number, number, number, number][] {
  const segs: [number, number, number, number][] = []; const ny = z.length, nx = z[0].length;
  const lerp = (a: number, b: number) => (level - a) / (b - a);
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = z[j][i], b = z[j][i + 1], c = z[j + 1][i + 1], d = z[j + 1][i];
    const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const top: [number, number] = [i + lerp(a, b), j], right: [number, number] = [i + 1, j + lerp(b, c)], bottom: [number, number] = [i + lerp(d, c), j + 1], left: [number, number] = [i, j + lerp(a, d)];
    const add = (p: [number, number], q: [number, number]) => segs.push([p[0], p[1], q[0], q[1]]);
    switch (idx) {
      case 1: case 14: add(left, bottom); break; case 2: case 13: add(bottom, right); break; case 3: case 12: add(left, right); break;
      case 4: case 11: add(top, right); break; case 6: case 9: add(top, bottom); break; case 7: case 8: add(left, top); break;
      case 5: add(left, top); add(bottom, right); break; case 10: add(top, right); add(left, bottom); break;
    }
  }
  return segs;
}
export function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y); if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** Covariance (confidence) ellipse: k = 1 (≈39 %), 2.4477 (95 %) in 2D. Returns polygon points. */
export function ellipse(pts: Pt[], k: number, steps = 64): Pt[] {
  if (pts.length < 3) return [];
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length, my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let sxx = 0, syy = 0, sxy = 0; for (const p of pts) { sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; sxy += (p.x - mx) * (p.y - my); }
  sxx /= pts.length - 1; syy /= pts.length - 1; sxy /= pts.length - 1;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det)), l2 = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const ang = Math.abs(sxy) < 1e-12 ? (sxx >= syy ? 0 : Math.PI / 2) : Math.atan2(l1 - sxx, sxy);
  const a = k * Math.sqrt(Math.max(l1, 0)), b = k * Math.sqrt(Math.max(l2, 0));
  return Array.from({ length: steps }, (_, t) => { const th = (2 * Math.PI * t) / steps, x = a * Math.cos(th), y = b * Math.sin(th); return { x: mx + x * Math.cos(ang) - y * Math.sin(ang), y: my + x * Math.sin(ang) + y * Math.cos(ang) }; });
}
export function regression(pts: Pt[]) {
  const n = pts.length; if (n < 3) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0; for (const p of pts) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
  if (sxx === 0) return null; const m = sxy / sxx, b = my - m * mx; const r = sxy / Math.sqrt(sxx * syy);
  return { m, b, r2: r * r, n };
}
export function histogram(values: number[], bins: number, lo: number, hi: number) {
  const out = new Array(bins).fill(0); const w = (hi - lo) / bins || 1;
  for (const v of values) { if (!Number.isFinite(v)) continue; const k = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w))); out[k]++; }
  return out;
}
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  const span = hi - lo || 1, step0 = span / count, mag = 10 ** Math.floor(Math.log10(step0)), err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const out: number[] = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10)); return out;
}
export function logTicks(lo: number, hi: number) { const out: number[] = []; for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) { const v = 10 ** e; if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); } return out; }
export function fmt(v: number) { const a = Math.abs(v); return a >= 1000 ? Math.round(v).toLocaleString('es-PE') : a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1).replace(/\.0$/, '') : a >= 1 ? v.toFixed(2).replace(/0$/, '').replace(/\.0$/, '') : v.toPrecision(2); }
