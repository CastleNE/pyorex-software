/**
 * Visual layers and linked selection for Geoquímica charts (phase 2 — presentation only).
 *
 * Everything here decorates the Plotly figure that `buildGeoChart` produces from a computed result: it never changes
 * the result rows, the scientific calculation, the tables or the exports. Overlays that summarise points (95 %
 * ellipses, least-squares lines, hulls, density, marginals) are drawn from the plotted coordinates and labelled as
 * visual guides; anything that must be reported belongs in the Python engine, with its quality metrics.
 */
import type { Data, Layout } from 'plotly.js';
import type { GeoResult } from './geochemistry-api';
import { attributeKey, type AttributeStyle } from './geochemistry-attributes';

export interface ChartLayers { density: boolean; ellipses: boolean; hulls: boolean; regression: boolean; marginals: boolean; legend: boolean }
export const DEFAULT_LAYERS: ChartLayers = { density: false, ellipses: false, hulls: false, regression: false, marginals: false, legend: true };
export type LayerKey = Exclude<keyof ChartLayers, 'legend'>;
export const LAYER_KEYS: LayerKey[] = ['density', 'ellipses', 'hulls', 'regression', 'marginals'];

/** Point-cloud XY renderers where geometric overlays make sense (TAS, Harker, ratios, assay comparisons…). */
const LAYER_KINDS = ['scatter', 'assay', 'difference'];
export const supportsLayers = (kind: string) => LAYER_KINDS.includes(kind);
/** Renderers whose points can be lasso-selected (each plotted point carries its row_index). */
const SELECT_KINDS = ['scatter', 'assay', 'difference', 'ternary', 'qq', 'probability', 'ecdf', 'line', 'downhole', 'box'];
export const supportsSelection = (kind: string) => SELECT_KINDS.includes(kind);

/** A user class: a named set of dataset rows (row_index), coloured consistently in every window. */
export interface SampleClass { id: string; name: string; color: string; rows: number[] }
export const CLASS_COLUMN = '__classes__';
export const NO_CLASS = { es: 'Sin clase', en: 'Unclassified' };

// ── Geometry (pure, tested) ───────────────────────────────────────────────────

/** χ²(2) quantile: −2·ln(1−p). p = 0.95 → 5.991. */
export const chi2Quantile2 = (p: number) => -2 * Math.log(1 - p);

/**
 * Covariance ellipse containing `level` of a bivariate normal fitted to the points (sample covariance, n−1).
 * Returns a closed polygon, or null with fewer than 3 points or a degenerate (zero-variance) cloud.
 */
export function confidenceEllipse(xs: number[], ys: number[], level = 0.95, steps = 72): [number, number][] | null {
  const n = Math.min(xs.length, ys.length); if (n < 3) return null;
  let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; } mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  sxx /= n - 1; syy /= n - 1; sxy /= n - 1;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  if (!(l1 > 0) || !(l2 > 0)) return null;
  const angle = Math.abs(sxy) < 1e-15 ? (sxx >= syy ? 0 : Math.PI / 2) : Math.atan2(l1 - sxx, sxy);
  const k = Math.sqrt(chi2Quantile2(level)), a = k * Math.sqrt(l1), b = k * Math.sqrt(l2), c = Math.cos(angle), s = Math.sin(angle);
  const out: [number, number][] = [];
  for (let i = 0; i < steps; i++) { const t = 2 * Math.PI * i / steps, u = a * Math.cos(t), v = b * Math.sin(t); out.push([mx + u * c - v * s, my + u * s + v * c]); }
  out.push(out[0]);
  return out;
}

/** Convex hull (Andrew's monotone chain), closed. Null with fewer than 3 distinct points. */
export function convexHull(points: [number, number][]): [number, number][] | null {
  const pts = [...new Map(points.map(p => [`${p[0]},${p[1]}`, p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return null;
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return hull.length >= 3 ? [...hull, hull[0]] : null;
}

/** Ordinary least squares y = a + b·x with R². Null with fewer than 3 points or constant x. */
export function linearFit(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number; n: number } | null {
  const n = Math.min(xs.length, ys.length); if (n < 3) return null;
  let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; } mx /= n; my /= n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  if (sxx === 0) return null;
  const slope = sxy / sxx, intercept = my - slope * mx, r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2, n };
}

/** Equal-width histogram over [min, max]: `edges` has bins+1 entries. */
export function binCounts(values: number[], bins = 20): { edges: number[]; counts: number[] } | null {
  if (!values.length) return null;
  let lo = Infinity, hi = -Infinity; for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (lo === hi) { lo -= 0.5; hi += 0.5; }
  const w = (hi - lo) / bins, counts = new Array(bins).fill(0) as number[];
  for (const v of values) counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
  return { edges: Array.from({ length: bins + 1 }, (_, i) => lo + i * w), counts };
}

// ── Result preparation: isolate / classes (presentation copies) ───────────────

export interface PrepareOptions { selection: ReadonlySet<number>; isolate: boolean; classes: SampleClass[]; byClass: boolean; noClassLabel: string }
/**
 * Copy of the result for display: `isolate` keeps only selected rows; `byClass` regroups rows by user class (the
 * class colours become attribute styles). The original result is never mutated.
 */
export function prepareResult(result: GeoResult, o: PrepareOptions): { result: GeoResult; attributes: Record<string, AttributeStyle> } {
  let rows = result.rows; const attributes: Record<string, AttributeStyle> = {};
  if (o.isolate && o.selection.size) rows = rows.filter(r => o.selection.has(r.row_index));
  if (o.byClass && o.classes.length) {
    const classOf = new Map<number, string>();
    for (const c of o.classes) for (const r of c.rows) if (!classOf.has(r)) classOf.set(r, c.name);
    rows = rows.map(r => ({ ...r, group: classOf.get(r.row_index) ?? o.noClassLabel }));
    for (const c of o.classes) attributes[attributeKey(CLASS_COLUMN, c.name)] = { color: c.color };
    attributes[attributeKey(CLASS_COLUMN, o.noClassLabel)] = { color: '#8c96a0' };
    return { result: { ...result, rows, pipeline: { ...result.pipeline, group_column: CLASS_COLUMN } }, attributes };
  }
  return { result: rows === result.rows ? result : { ...result, rows }, attributes };
}

// ── Figure decoration ─────────────────────────────────────────────────────────

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface DecorateOptions { kind: string; selection: ReadonlySet<number>; layers: ChartLayers; logX: boolean; logY: boolean; accent: string;
  /** Histogram only: X of the selected valid rows, drawn as an overlay on the same bins. */ selectedValues?: number[]; selectionLabel?: string }
export interface Decorated { data: Data[]; layout: Partial<Layout>; fits: { group: string; slope: number; intercept: number; r2: number; n: number }[] }

const isPointTrace = (t: Loose) => Array.isArray(t.customdata) && (t.type === 'scatter' || t.type === 'scatterternary' || t.type === 'box');
const traceColor = (t: Loose): string => (typeof t.line?.color === 'string' ? t.line.color : typeof t.marker?.color === 'string' ? t.marker.color : '#8c96a0');
const fwd = (log: boolean) => (v: number) => (log ? Math.log10(v) : v);
const back = (log: boolean) => (v: number) => (log ? 10 ** v : v);
const finitePairs = (t: Loose, logX: boolean, logY: boolean): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i < (t.x?.length ?? 0); i++) {
    const x = t.x[i], y = t.y[i];
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    if ((logX && x <= 0) || (logY && y <= 0)) continue;
    out.push([fwd(logX)(x), fwd(logY)(y)]);
  }
  return out;
};

/** Adds selection highlighting and the active visual layers to a built chart. Inputs are not mutated. */
export function decorateChart(chart: { data: Data[]; layout: Partial<Layout> }, o: DecorateOptions): Decorated {
  const sel = o.selection, any = sel.size > 0;
  const data: Loose[] = chart.data.map(t => ({ ...(t as Loose) }));
  const layout: Loose = { ...chart.layout };
  const fits: Decorated['fits'] = [];

  // Linked selection: keep selected points at full strength, fade the rest.
  if (any) for (const t of data) {
    if (!Array.isArray(t.customdata)) continue;
    if (t.type === 'scatter' && t.mode === 'lines+markers' && o.kind === 'spider') { t.opacity = sel.has(t.customdata[0]) ? 1 : 0.12; continue; }
    if (!isPointTrace(t)) continue;
    t.selectedpoints = (t.customdata as number[]).flatMap((r, i) => (sel.has(r) ? [i] : []));
    t.selected = { marker: { opacity: 1 } };
    t.unselected = { marker: { opacity: 0.14 } };
  }
  if (any && o.kind === 'histogram') {
    for (const t of data) if (t.type === 'histogram') t.bingroup = 'pyorex';
    if (o.selectedValues?.length) data.push({ type: 'histogram', x: o.selectedValues, name: o.selectionLabel ?? 'Selection', bingroup: 'pyorex', opacity: 0.9, marker: { color: o.accent, line: { color: o.accent, width: 1 } } });
  }

  const groups = supportsLayers(o.kind) ? data.filter(t => isPointTrace(t) && t.type === 'scatter') : [];
  const extra: Loose[] = [], under: Loose[] = [];
  const bx = back(o.logX), by = back(o.logY);
  if (groups.length) {
    if (o.layers.density) {
      const pts = groups.flatMap(t => finitePairs(t, o.logX, o.logY));
      if (pts.length >= 10) under.push({
        type: 'histogram2dcontour', x: pts.map(p => bx(p[0])), y: pts.map(p => by(p[1])), name: 'density', showlegend: false, showscale: false,
        ncontours: 10, contours: { coloring: 'fill', showlines: false }, hoverinfo: 'skip', opacity: 0.45,
        colorscale: [[0, 'rgba(0,0,0,0)'], [0.15, 'rgba(0,0,0,0)'], [1, o.accent]],
      });
    }
    for (const t of groups) {
      const pts = finitePairs(t, o.logX, o.logY), color = traceColor(t), name = String(t.name ?? '');
      if (o.layers.ellipses) {
        const e = confidenceEllipse(pts.map(p => p[0]), pts.map(p => p[1]));
        if (e) extra.push({ type: 'scatter', mode: 'lines', x: e.map(p => bx(p[0])), y: e.map(p => by(p[1])), name: `${name} · 95 %`, showlegend: false, hoverinfo: 'name', line: { color, width: 1.5, dash: 'dash' } });
      }
      if (o.layers.hulls) {
        const h = convexHull(pts);
        if (h) extra.push({ type: 'scatter', mode: 'lines', x: h.map(p => bx(p[0])), y: h.map(p => by(p[1])), name: `${name} · hull`, showlegend: false, hoverinfo: 'name', fill: 'toself', fillcolor: hexAlpha(color, 0.08), line: { color, width: 1 } });
      }
      if (o.layers.regression) {
        const f = linearFit(pts.map(p => p[0]), pts.map(p => p[1]));
        if (f) {
          const lo = Math.min(...pts.map(p => p[0])), hi = Math.max(...pts.map(p => p[0]));
          const xsLine = Array.from({ length: 24 }, (_, i) => lo + (hi - lo) * i / 23);
          extra.push({ type: 'scatter', mode: 'lines', x: xsLine.map(bx), y: xsLine.map(x => by(f.intercept + f.slope * x)), name: `${name} · R² ${f.r2.toFixed(2)}`, showlegend: false, hovertemplate: `${name}<br>R² = ${f.r2.toFixed(3)} · n = ${f.n}<extra></extra>`, line: { color, width: 2 } });
          fits.push({ group: name, ...f });
        }
      }
    }
    if (o.layers.marginals && !layout.yaxis?.scaleanchor) {
      for (const t of groups) {
        const pts = finitePairs(t, o.logX, o.logY), color = traceColor(t);
        const hx = binCounts(pts.map(p => p[0])), hy = binCounts(pts.map(p => p[1]));
        if (hx) extra.push({ type: 'scatter', mode: 'lines', xaxis: 'x', yaxis: 'y2', x: stepX(hx.edges).map(bx), y: stepY(hx.counts), fill: 'tozeroy', fillcolor: hexAlpha(color, 0.25), line: { color, width: 1 }, showlegend: false, hoverinfo: 'skip' });
        if (hy) extra.push({ type: 'scatter', mode: 'lines', xaxis: 'x2', yaxis: 'y', y: stepX(hy.edges).map(by), x: stepY(hy.counts), fill: 'tozerox', fillcolor: hexAlpha(color, 0.25), line: { color, width: 1 }, showlegend: false, hoverinfo: 'skip' });
      }
      layout.xaxis = { ...layout.xaxis, domain: [0, 0.84] };
      layout.yaxis = { ...layout.yaxis, domain: [0, 0.84] };
      layout.xaxis2 = { domain: [0.86, 1], anchor: 'y', showticklabels: false, showgrid: false, zeroline: false, rangemode: 'tozero' };
      layout.yaxis2 = { domain: [0.86, 1], anchor: 'x', showticklabels: false, showgrid: false, zeroline: false, rangemode: 'tozero' };
    }
  }
  if (!o.layers.legend) layout.showlegend = false;
  return { data: [...under, ...data, ...extra] as Data[], layout: layout as Partial<Layout>, fits };
}

/** [e0,e1,e2…] → [e0,e1,e1,e2,e2,…] so counts draw as a step outline. */
const stepX = (edges: number[]) => edges.flatMap((e, i) => (i === 0 || i === edges.length - 1 ? [e] : [e, e]));
const stepY = (counts: number[]) => counts.flatMap(c => [c, c]);
function hexAlpha(color: string, a: number) {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
