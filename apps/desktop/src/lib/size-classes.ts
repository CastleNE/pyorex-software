/**
 * Value classes for graduated symbols ("tamaño por clases") and for colour by value (lib/color-classes.ts): the value
 * (X, Y or an Editor column) is split into
 * classes whose limits come from a method (quantiles, equal intervals, natural breaks, 1-2-5 series) or are typed by
 * the user, either as PERCENTILES of the data or as VALUES in the variable's unit (ppm, %, …), like ioGAS bin ranges.
 * Each class gets one symbol diameter, chosen so the symbol AREA grows evenly from the smallest to the largest class
 * (the cartographic convention). Presentation only: classes never change results, tables or exports.
 *
 * Class rule with limits b1 < b2 < … < b(n-1):
 *  - boundary 'up' (default, same as the colour classes): x == b goes to the upper class;
 *  - boundary 'down' (ioGAS "boundary cases go down"): x == b stays in the lower class.
 */
export type SizeMethod = 'quantile' | 'equal' | 'jenks' | 'series' | 'percentile' | 'manual';
export type ComputedMethod = 'quantile' | 'equal' | 'jenks';
export type SizeBoundary = 'up' | 'down';
export const MIN_CLASSES = 2;
export const MAX_CLASSES = 20;
/** Methods offered in the UI, in order. 'percentile' and 'manual' are the user's own limits. */
export const SIZE_METHODS: SizeMethod[] = ['quantile', 'equal', 'jenks', 'series', 'percentile', 'manual'];
export const isComputed = (m: SizeMethod): m is ComputedMethod => m === 'quantile' || m === 'equal' || m === 'jenks';

export interface SizeClassSettings {
  /** Class count for the computed methods (2–20). Own limits define their own count (limits + 1). */
  sizeClasses: number;
  sizeMethod: SizeMethod;
  /** Own limits in data units (method 'manual'). */
  sizeBreaks: number[] | null;
  /** Own limits as percentiles 0–100 of the data (method 'percentile'). */
  sizePercentiles: number[] | null;
  sizeMin: number; sizeMax: number; sizeLog: boolean;
  sizeBoundary: SizeBoundary;
}

export const clampClasses = (n: number) => Math.min(MAX_CLASSES, Math.max(MIN_CLASSES, Math.round(Number.isFinite(n) ? n : 5)));

/** Finite values usable for classing (positive only on a log scale), sorted ascending. */
export function usableValues(values: (number | null | undefined)[], log: boolean): number[] {
  return values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && (!log || v > 0)).sort((a, b) => a - b);
}

/** Percentile p (0–100) of sorted data, linear interpolation between order statistics (same as numpy's default). */
export function percentileOf(sorted: number[], p: number): number {
  if (!sorted.length) return Number.NaN;
  const pos = ((sorted.length - 1) * Math.min(100, Math.max(0, p))) / 100, a = Math.floor(pos);
  return +(sorted[a] + (sorted[Math.ceil(pos)] - sorted[a]) * (pos - a)).toPrecision(12);
}

/** Share (0–100) of the usable samples that fall below a limit under the boundary rule — the limit "as a percentile". */
export function percentBelow(sorted: number[], b: number, boundary: SizeBoundary = 'up'): number {
  if (!sorted.length) return Number.NaN;
  let k = 0;
  while (k < sorted.length && (boundary === 'up' ? sorted[k] < b : sorted[k] <= b)) k++;
  return (100 * k) / sorted.length;
}

/** Limits of the 1-2-5 series (…, 1, 2, 5, 10, 20, 50, …) strictly inside the data range, at most MAX_CLASSES − 1. */
export function seriesBreaks(values: (number | null | undefined)[]): number[] {
  const v = usableValues(values, true);
  if (v.length < 2) return [];
  const lo = v[0], hi = v[v.length - 1], out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)) - 1; e <= Math.ceil(Math.log10(hi)) + 1; e++) for (const m of [1, 2, 5]) {
    const b = +(m * 10 ** e).toPrecision(12);
    if (b > lo && b < hi) out.push(b);
  }
  if (out.length <= MAX_CLASSES - 1) return out;
  return out.filter((_, i) => i % Math.ceil(out.length / (MAX_CLASSES - 1)) === 0);
}

/** n−1 class limits computed with a method (log scale: equal intervals and Jenks work on log10 values). */
export function computeSizeBreaks(values: (number | null | undefined)[], method: ComputedMethod, n: number, log: boolean): number[] {
  const v = usableValues(values, log);
  if (!v.length || n < 2) return [];
  // Ties (e.g. many values at a detection-limit floor) can repeat a quantile: keep strictly increasing limits only,
  // so no empty «15 – 15» class appears.
  if (method === 'quantile') return Array.from({ length: n - 1 }, (_, k) => percentileOf(v, (100 * (k + 1)) / n)).filter((b, i, a) => i === 0 || b > a[i - 1]);
  const T = (x: number) => (log ? Math.log10(x) : x), I = (x: number) => (log ? 10 ** x : x);
  const lo = T(v[0]), hi = T(v[v.length - 1]);
  if (method === 'equal') return Array.from({ length: n - 1 }, (_, k) => I(lo + ((hi - lo) * (k + 1)) / n));
  return jenks(v.map(T), n).map(I);
}

/** Fisher–Jenks natural breaks on sorted data. Returns the lower bound of every class after the first. */
function jenks(data: number[], k: number): number[] {
  const n = data.length;
  if (n <= k) return data.slice(1);
  const lower = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(0));
  const vari = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(Infinity));
  for (let j = 1; j <= k; j++) { lower[1][j] = 1; vari[1][j] = 0; }
  for (let l = 2; l <= n; l++) {
    let s1 = 0, s2 = 0, w = 0;
    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1, val = data[i3 - 1];
      s2 += val * val; s1 += val; w++;
      const v = s2 - (s1 * s1) / w, i4 = i3 - 1;
      if (i4 !== 0) for (let j = 2; j <= k; j++) if (vari[l][j] >= v + vari[i4][j - 1]) { lower[l][j] = i3; vari[l][j] = v + vari[i4][j - 1]; }
    }
    lower[l][1] = 1; vari[l][1] = s2 - (s1 * s1) / w;
  }
  const breaks: number[] = [];
  let kk = n;
  for (let j = k; j >= 2; j--) { const start = lower[kk][j]; breaks.unshift(data[start - 1]); kk = start - 1; }
  return breaks;
}

export const classIndex = (x: number, breaks: number[], boundary: SizeBoundary = 'up') => {
  let k = 0;
  while (k < breaks.length && (boundary === 'up' ? x >= breaks[k] : x > breaks[k])) k++;
  return k;
};

/** Symbol diameter per class: area grows evenly from `min` to `max`. */
export function classSizes(n: number, min: number, max: number): number[] {
  return Array.from({ length: n }, (_, k) => +(min + (max - min) * Math.sqrt(n === 1 ? 1 : k / (n - 1))).toFixed(2));
}

export type BreaksProblem = 'count' | 'number' | 'positive' | 'increasing' | 'pctRange';
/** Problem with own value limits (i18n key suffix), or null when usable: 1–19 limits, finite, strictly increasing, >0 on log. */
export function breaksProblem(breaks: number[], log: boolean): BreaksProblem | null {
  if (breaks.length < MIN_CLASSES - 1 || breaks.length > MAX_CLASSES - 1) return 'count';
  if (breaks.some(b => !Number.isFinite(b))) return 'number';
  if (log && breaks.some(b => b <= 0)) return 'positive';
  for (let k = 1; k < breaks.length; k++) if (breaks[k] <= breaks[k - 1]) return 'increasing';
  return null;
}
/** Same checks for own percentiles: each strictly between 0 and 100, strictly increasing. */
export function percentilesProblem(pcts: number[]): BreaksProblem | null {
  if (pcts.length < MIN_CLASSES - 1 || pcts.length > MAX_CLASSES - 1) return 'count';
  if (pcts.some(b => !Number.isFinite(b))) return 'number';
  if (pcts.some(b => b <= 0 || b >= 100)) return 'pctRange';
  for (let k = 1; k < pcts.length; k++) if (pcts[k] <= pcts[k - 1]) return 'increasing';
  return null;
}

/** Class settings shared by size and colour classes (the presentation keeps one set per channel). */
export interface ClassSettings { classes: number; method: SizeMethod; breaks: number[] | null; percentiles: number[] | null; log: boolean; boundary: SizeBoundary }
export const sizeClassSettings = (s: SizeClassSettings): ClassSettings =>
  ({ classes: s.sizeClasses, method: s.sizeMethod, breaks: s.sizeBreaks, percentiles: s.sizePercentiles, log: s.sizeLog, boundary: s.sizeBoundary });

/** Limits in use. Own limits that are not usable fall back to quantiles with the selected class count. */
export function resolveBreaks(values: (number | null | undefined)[], c: ClassSettings): number[] {
  if (c.method === 'manual' && c.breaks && !breaksProblem(c.breaks, c.log)) return [...c.breaks];
  if (c.method === 'percentile' && c.percentiles && !percentilesProblem(c.percentiles)) {
    const v = usableValues(values, c.log);
    // Ties in the data can map two percentiles onto the same value; keep only strictly increasing limits.
    return c.percentiles.map(p => percentileOf(v, p)).filter((b, i, a) => Number.isFinite(b) && (i === 0 || b > a[i - 1]));
  }
  if (c.method === 'series') return seriesBreaks(values);
  return computeSizeBreaks(values, isComputed(c.method) ? c.method : 'quantile', clampClasses(c.classes), c.log);
}
export const resolveSizeBreaks = (values: (number | null | undefined)[], s: SizeClassSettings) => resolveBreaks(values, sizeClassSettings(s));

export interface ClassLegend {
  breaks: number[];
  /** Each limit expressed as the share of samples below it (0–100). */
  percents: number[];
  counts: number[]; missing: number; min: number | null; max: number | null; log: boolean; boundary: SizeBoundary;
}
export interface SizeClassLegend extends ClassLegend { sizes: number[] }

/** Limits, sample count per class and values left out (missing, or ≤ 0 on a log scale). */
export function classLegend(values: (number | null | undefined)[], c: ClassSettings): ClassLegend {
  const usable = usableValues(values, c.log);
  const breaks = resolveBreaks(values, c);
  const boundary = c.boundary === 'down' ? 'down' : 'up';
  const counts = new Array(breaks.length + 1).fill(0) as number[];
  for (const v of usable) counts[classIndex(v, breaks, boundary)]++;
  return { breaks, percents: breaks.map(b => percentBelow(usable, b, boundary)), counts, missing: values.length - usable.length, min: usable[0] ?? null, max: usable.at(-1) ?? null, log: c.log, boundary };
}

/** Everything the chart and its legend need for graduated symbols: classLegend plus the diameter of each class. */
export function sizeClassLegend(values: (number | null | undefined)[], s: SizeClassSettings): SizeClassLegend {
  const l = classLegend(values, sizeClassSettings(s));
  return { ...l, sizes: classSizes(l.counts.length, s.sizeMin, s.sizeMax) };
}

/** Class of each value, or null for values outside the usable set (missing, or ≤ 0 on a log scale). */
export function classesFor(values: (number | null | undefined)[], legend: ClassLegend): (number | null)[] {
  return values.map(v => (typeof v === 'number' && Number.isFinite(v) && (!legend.log || v > 0) ? classIndex(v, legend.breaks, legend.boundary) : null));
}

/** Diameter for each value (fallback for values outside the usable set, e.g. missing or ≤0 on a log scale). */
export function classSizesFor(values: (number | null | undefined)[], legend: SizeClassLegend, fallback: number): number[] {
  return values.map(v => (typeof v === 'number' && Number.isFinite(v) && (!legend.log || v > 0) ? legend.sizes[classIndex(v, legend.breaks, legend.boundary)] : fallback));
}

/** Range text of class k, following the boundary rule: "< b1", "b1 – b2", "≥ bn" (or "≤ b1", "> bn" when cases go down). */
export function classRange(legend: Pick<ClassLegend, 'breaks' | 'boundary' | 'min'>, k: number): string {
  const b = legend.breaks, down = legend.boundary === 'down';
  if (!b.length) return fmtLimit(legend.min ?? Number.NaN);
  if (k === 0) return `${down ? '≤' : '<'} ${fmtLimit(b[0])}`;
  if (k === b.length) return `${down ? '>' : '≥'} ${fmtLimit(b[k - 1])}`;
  return `${fmtLimit(b[k - 1])} – ${fmtLimit(b[k])}`;
}

/** Unit written in a column or axis label (Cu_ppm, Au (ppb), SiO2 (wt%), TiO2_pct, Au_g/t), or '' when there is none. */
export function unitOf(label: string): string {
  const m = /(?:[_\s(\[]|^)(ppm|ppb|ppt|pct|wt ?%|%|g\/t|mg\/kg|µg\/g|ug\/g|oz\/t)\)?\]?\s*$/i.exec(label.trim())
    ?? /\((ppm|ppb|ppt|pct|wt ?%|%|g\/t|mg\/kg|oz\/t)\)/i.exec(label);
  if (!m) return '';
  const u = m[1].toLowerCase().replace(' ', '');
  return u === 'pct' ? '%' : u === 'wt%' ? 'wt%' : u;
}

/** Splits the class with most samples at its median: a sensible new limit for "add a break". */
export function suggestBreak(sorted: number[], breaks: number[], boundary: SizeBoundary = 'up'): number | null {
  if (sorted.length < 2) return null;
  const groups: number[][] = Array.from({ length: breaks.length + 1 }, () => []);
  for (const v of sorted) groups[classIndex(v, breaks, boundary)].push(v);
  const order = groups.map((_, k) => k).sort((a, b) => groups[b].length - groups[a].length);
  for (const k of order) {
    const g = groups[k]; if (g.length < 2) continue;
    const lo = k === 0 ? g[0] : breaks[k - 1], hi = k === breaks.length ? g[g.length - 1] : breaks[k];
    const m = +percentileOf(g, 50).toPrecision(4);
    if (m > lo && m < hi && !breaks.includes(m)) return m;
    const mid = +((lo + hi) / 2).toPrecision(6);
    if (mid > lo && mid < hi && !breaks.includes(mid)) return mid;
  }
  return null;
}

/** Compact number for limits: up to 4 significant digits, no exponent for ordinary geochemical ranges. */
export function fmtLimit(x: number): string {
  if (!Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-3 || a >= 1e7)) return x.toExponential(2);
  return String(+x.toPrecision(4));
}
/** Percentile label: integers as is, otherwise one decimal. */
export const fmtPct = (p: number) => (Number.isFinite(p) ? String(Math.abs(p - Math.round(p)) < 1e-9 ? Math.round(p) : +p.toFixed(1)) : '—');
