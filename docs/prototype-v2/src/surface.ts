import { NUM_VARS, SAMPLES, quantile, type Sample } from './data';
import { compile } from './expr';
/** A column key or any expression over the sample columns. */
export function varOf(key: string): { key: string; label: string; unit: string; get: (s: Sample) => number | null; error?: string } {
  const v = NUM_VARS.find(x => x.key === key); if (v) return v;
  const c = compile(key); if (!c.ok) return { key, label: key, unit: '', get: () => null, error: c.error };
  return { key, label: key, unit: '', get: s => { const r = c.run({ s }); return typeof r === 'number' ? r : null; } };
}
import { rampColor } from './viz';

export interface SurfOpts {
  var: string; method: 'idw' | 'nn' | 'tin' | 'rbf' | 'kriging'; power: number; neighbors: number; cell: number; mask: number;
  log: boolean; range: 'minmax' | 'pct' | 'manual'; plo: number; phi: number; mlo: number | null; mhi: number | null;
  ramp: string; reverse: boolean; classes: 'cont' | 'disc'; n: number; opacity: number; smooth: number;
}
export interface ContOpts { mode: 'auto' | 'step' | 'manual'; n: number; step: number; manual: number[]; labels: boolean; width: number; opacity: number; color: 'ramp' | 'ink'; major: number }
export interface OutlineRow { v: number; color: string }
export interface OutOpts { source: 'surface' | 'samples'; rows: OutlineRow[]; fill: number; border: number; buffer: number }

export const DEF_SURF: SurfOpts = { var: 'Cu', method: 'idw', power: 2, neighbors: 12, cell: 1200, mask: 6000, log: true, range: 'pct', plo: 2, phi: 98, mlo: null, mhi: null, ramp: 'geochem', reverse: false, classes: 'cont', n: 6, opacity: 0.72, smooth: 1 };
export const DEF_CONT: ContOpts = { mode: 'manual', n: 6, step: 100, manual: [50, 100, 250, 500, 1000], labels: true, width: 1, opacity: 0.9, color: 'ink', major: 2 };
export const DEF_OUT: OutOpts = { source: 'surface', rows: [{ v: 100, color: '#f5e663' }, { v: 250, color: '#f39c34' }, { v: 500, color: '#d7301f' }, { v: 1000, color: '#7f0000' }], fill: 0.28, border: 1.6, buffer: 1500 };

export const surfOf = (o: Record<string, any>): SurfOpts => ({ ...DEF_SURF, ...(o.sf ?? {}) });
export const contOf = (o: Record<string, any>): ContOpts => ({ ...DEF_CONT, ...(o.ct ?? {}) });
export const outOf = (o: Record<string, any>): OutOpts => ({ ...DEF_OUT, ...(o.ol ?? {}) });

export interface Grid { nx: number; ny: number; x0: number; y0: number; dx: number; z: Float64Array; T: (v: number) => number; TI: (t: number) => number }

const cache = new Map<string, Grid>();
/** IDW / nearest-neighbour grid in the (optionally log) value space; NaN outside the mask. */
export function gridFor(o: SurfOpts): Grid {
  const key = [o.var, o.method, o.power, o.neighbors, o.cell, o.mask, o.log, o.smooth].join('|');
  const hit = cache.get(key); if (hit) return hit;
  const v = varOf(o.var); const T = (x: number) => (o.log ? Math.log10(Math.max(x, 1e-6)) : x), TI = (t: number) => (o.log ? 10 ** t : t);
  const pts = SAMPLES.map(s => ({ x: s.east, y: s.north, z: v.get(s) })).filter((p): p is { x: number; y: number; z: number } => p.z != null && Number.isFinite(p.z) && (!o.log || p.z > 0)).map(p => ({ ...p, t: T(p.z) }));
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const pad = o.mask * 0.6, x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  const dx = o.cell, nx = Math.max(2, Math.ceil((x1 - x0) / dx) + 1), ny = Math.max(2, Math.ceil((y1 - y0) / dx) + 1);
  const z = new Float64Array(nx * ny); const k = Math.max(1, Math.min(pts.length, o.neighbors));
  const near: { d: number; t: number }[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * dx, y = y0 + j * dx; near.length = 0; let dmin = Infinity;
    for (const p of pts) { const d = Math.hypot(p.x - x, p.y - y); if (d < dmin) dmin = d; if (near.length < k) { near.push({ d, t: p.t }); near.sort((a, b) => a.d - b.d); } else if (d < near[k - 1].d) { near[k - 1] = { d, t: p.t }; near.sort((a, b) => a.d - b.d); } }
    if (dmin > o.mask) { z[j * nx + i] = NaN; continue; }
    if (o.method === 'nn') { z[j * nx + i] = near[0].t; continue; }
    let sw = 0, s = 0; for (const n of near) { if (n.d < 1) { sw = 1; s = n.t; break; } const w = 1 / n.d ** o.power; sw += w; s += w * n.t; }
    z[j * nx + i] = s / sw;
  }
  for (let pass = 0; pass < o.smooth; pass++) {
    const c = Float64Array.from(z);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (Number.isNaN(c[j * nx + i])) continue; let s = 0, n = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const q = c[jj * nx + ii]; if (!Number.isNaN(q)) { s += q; n++; } }
      z[j * nx + i] = s / n;
    }
  }
  const g = { nx, ny, x0, y0, dx, z, T, TI }; cache.set(key, g); if (cache.size > 24) cache.delete(cache.keys().next().value!);
  return g;
}

/** Colour range in value space (transformed): min–max, sample percentiles or manual. */
export function rangeOf(o: SurfOpts): [number, number] {
  const v = varOf(o.var); const T = (x: number) => (o.log ? Math.log10(Math.max(x, 1e-6)) : x);
  const vals = SAMPLES.map(s => v.get(s)).filter((x): x is number => x != null && Number.isFinite(x) && (!o.log || x > 0)).sort((a, b) => a - b);
  if (o.range === 'manual' && o.mlo != null && o.mhi != null) return [T(o.mlo), T(o.mhi)];
  if (o.range === 'pct') return [T(quantile(vals, o.plo / 100)), T(quantile(vals, o.phi / 100))];
  return [T(vals[0]), T(vals[vals.length - 1])];
}
export function colorAt(o: SurfOpts, t: number, rng: [number, number]) {
  let u = (t - rng[0]) / (rng[1] - rng[0] || 1); u = Math.max(0, Math.min(1, u));
  if (o.classes === 'disc') { const k = Math.min(o.n - 1, Math.floor(u * o.n)); u = o.n === 1 ? 0.5 : k / (o.n - 1); }
  return rampColor(o.ramp, u, o.reverse);
}

const imgCache = new Map<string, string>();
/** Raster image (data URL) of the grid coloured with the current colour engine. */
export function surfaceImage(o: SurfOpts, g: Grid): string {
  const rng = rangeOf(o); const key = [o.var, o.method, o.power, o.neighbors, o.cell, o.mask, o.log, o.smooth, o.ramp, o.reverse, o.classes, o.n, rng.join(',')].join('|');
  const hit = imgCache.get(key); if (hit) return hit;
  const cv = document.createElement('canvas'); cv.width = g.nx; cv.height = g.ny; const ctx = cv.getContext('2d')!; const img = ctx.createImageData(g.nx, g.ny);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const t = g.z[j * g.nx + i]; const p = ((g.ny - 1 - j) * g.nx + i) * 4; if (Number.isNaN(t)) { img.data[p + 3] = 0; continue; }
    const c = colorAt(o, t, rng); img.data[p] = parseInt(c.slice(1, 3), 16); img.data[p + 1] = parseInt(c.slice(3, 5), 16); img.data[p + 2] = parseInt(c.slice(5, 7), 16); img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); const url = cv.toDataURL(); imgCache.set(key, url); if (imgCache.size > 40) imgCache.delete(imgCache.keys().next().value!);
  return url;
}

/** Marching squares that ignores cells touching the mask (NaN). Segments in data coordinates. */
export function isolines(g: Grid, level: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = []; const Z = (i: number, j: number) => g.z[j * g.nx + i];
  const X = (i: number) => g.x0 + i * g.dx, Y = (j: number) => g.y0 + j * g.dx;
  for (let j = 0; j < g.ny - 1; j++) for (let i = 0; i < g.nx - 1; i++) {
    const a = Z(i, j), b = Z(i + 1, j), c = Z(i + 1, j + 1), d = Z(i, j + 1);
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) continue;
    const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0); if (idx === 0 || idx === 15) continue;
    const l = (p: number, q: number) => (level - p) / (q - p);
    const top = [X(i) + l(a, b) * g.dx, Y(j)], right = [X(i + 1), Y(j) + l(b, c) * g.dx], bottom = [X(i) + l(d, c) * g.dx, Y(j + 1)], left = [X(i), Y(j) + l(a, d) * g.dx];
    const add = (p: number[], q: number[]) => out.push([p[0], p[1], q[0], q[1]]);
    switch (idx) {
      case 1: case 14: add(left, bottom); break; case 2: case 13: add(bottom, right); break; case 3: case 12: add(left, right); break;
      case 4: case 11: add(top, right); break; case 6: case 9: add(top, bottom); break; case 7: case 8: add(left, top); break;
      case 5: add(left, top); add(bottom, right); break; case 10: add(top, right); add(left, bottom); break;
    }
  }
  return out;
}

/** Contour levels in data units. */
export function contourLevels(c: ContOpts, o: SurfOpts): number[] {
  if (c.mode === 'manual') return [...c.manual].sort((a, b) => a - b);
  const [lo, hi] = rangeOf(o); const TI = (t: number) => (o.log ? 10 ** t : t);
  if (c.mode === 'step') { const out: number[] = []; const a = TI(lo), b = TI(hi); for (let v = Math.ceil(a / c.step) * c.step; v <= b && out.length < 40; v += c.step) out.push(+v.toPrecision(6)); return out; }
  if (o.log) { const out: number[] = []; for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (Math.log10(v) >= lo && Math.log10(v) <= hi) out.push(v); } return out; }
  return Array.from({ length: c.n }, (_, k) => +TI(lo + ((hi - lo) * (k + 1)) / (c.n + 1)).toPrecision(3));
}

export function outlineStats(g: Grid, v: number) {
  const t = g.T(v); let cells = 0; for (let k = 0; k < g.z.length; k++) if (!Number.isNaN(g.z[k]) && g.z[k] >= t) cells++;
  return { areaKm2: (cells * g.dx * g.dx) / 1e6 };
}
/** Fill mask image for one outline threshold. */
export function outlineImage(g: Grid, v: number, color: string): string {
  const cv = document.createElement('canvas'); cv.width = g.nx; cv.height = g.ny; const ctx = cv.getContext('2d')!; const img = ctx.createImageData(g.nx, g.ny); const t = g.T(v);
  const r = parseInt(color.slice(1, 3), 16), gg = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const z = g.z[j * g.nx + i]; const p = ((g.ny - 1 - j) * g.nx + i) * 4; if (!Number.isNaN(z) && z >= t) { img.data[p] = r; img.data[p + 1] = gg; img.data[p + 2] = b; img.data[p + 3] = 255; } }
  ctx.putImageData(img, 0, 0); return cv.toDataURL();
}
