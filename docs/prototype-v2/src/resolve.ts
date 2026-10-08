import { useMemo } from 'react';
import { SAMPLES, SECTORS, numVar, tasName, type Sample } from './data';
import { useApp, type CatVar, type Style } from './store';
import { CATEGORICAL, SHAPES, classIndex, computeBreaks, rampColor, type Shape } from './viz';

export const CAT_LABEL: Record<CatVar, string> = { sector: 'Sector', tas: 'Litología (TAS)', user: 'Clases de usuario' };
const TAS_CACHE = SAMPLES.map(tasName);
export function catOf(v: CatVar, s: Sample, user: Record<number, string>) {
  return v === 'sector' ? s.sector : v === 'tas' ? TAS_CACHE[s.i] : user[s.i] ?? 'Sin clase';
}
export function categories(v: CatVar, user: Record<number, string>, order: string[]) {
  const counts = new Map<string, number>();
  for (const s of SAMPLES) { const c = catOf(v, s, user); counts.set(c, (counts.get(c) ?? 0) + 1); }
  const base = v === 'sector' ? [...SECTORS] : [...counts.keys()].sort((a, b) => (a === 'Sin clase' ? 1 : b === 'Sin clase' ? -1 : a.localeCompare(b)));
  const ordered = [...order.filter(c => counts.has(c)), ...base.filter(c => !order.includes(c))];
  return ordered.map(name => ({ name, n: counts.get(name) ?? 0 }));
}

export interface Visual { color: string; shape: Shape; size: number; visible: boolean; cat: string; cls: number | null; drawRank: number }
export interface Resolved {
  vis: Visual[]; cats: { name: string; n: number; color: string; shape: Shape }[];
  breaks: number[]; classColors: string[]; classCounts: number[]; valueRange: [number, number] | null;
  valueColor: (v: number | null) => string; sizeRange: [number, number] | null;
}

export function resolve(style: Style, user: Record<number, string>): Resolved {
  const c = style.color, cv = c.catVar;
  const cats0 = categories(cv, user, style.order[cv]);
  const pal = CATEGORICAL[c.palette] ?? CATEGORICAL['Okabe–Ito'];
  const shapeCats = categories(style.shape.catVar, user, style.order[style.shape.catVar]).map(x => x.name);
  const catColor = (name: string, k: number) => c.overrides[`${cv}:${name}`] ?? (name === 'Sin clase' ? '#8c96a0' : pal[k % pal.length]);
  const catShape = (name: string) => style.shape.overrides[`${style.shape.catVar}:${name}`] ?? SHAPES[Math.max(0, shapeCats.indexOf(name)) % SHAPES.length];
  const cats = cats0.map((x, k) => ({ ...x, color: catColor(x.name, k), shape: catShape(x.name) }));

  // value colouring
  const vv = numVar(c.valueVar); const vals = SAMPLES.map(s => vv.get(s));
  const finite = vals.filter((v): v is number => v != null && Number.isFinite(v) && (!c.log || v > 0));
  const valueRange: [number, number] | null = finite.length ? [Math.min(...finite), Math.max(...finite)] : null;
  const breaks = c.method === 'continuous' ? [] : c.manual ?? computeBreaks(finite, c.method, c.n, c.log);
  const nCls = breaks.length + 1;
  const classColors = Array.from({ length: nCls }, (_, k) => rampColor(c.ramp, nCls === 1 ? 0.5 : k / (nCls - 1), c.reverse));
  const tOf = (v: number) => { if (!valueRange) return 0.5; const [lo, hi] = valueRange; return c.log ? (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo) || 1) : (v - lo) / (hi - lo || 1); };
  const valueColor = (v: number | null) => (v == null || !Number.isFinite(v) || (c.log && v <= 0) ? '#a0a8b0' : c.method === 'continuous' ? rampColor(c.ramp, tOf(v), c.reverse) : classColors[classIndex(v, breaks)]);
  const classCounts = new Array(nCls).fill(0);

  // size
  const sv = numVar(style.size.valueVar); const svals = SAMPLES.map(s => sv.get(s));
  const sf = svals.filter((v): v is number => v != null && Number.isFinite(v) && (!style.size.log || v > 0));
  const sizeRange: [number, number] | null = sf.length ? [Math.min(...sf), Math.max(...sf)] : null;
  const sizeOf = (v: number | null) => {
    if (style.size.mode === 'fixed' || !sizeRange || v == null) return style.size.fixed;
    const [lo, hi] = sizeRange; const T = (x: number) => (style.size.log ? Math.log10(Math.max(x, 1e-9)) : x);
    const t = Math.max(0, Math.min(1, (T(v) - T(lo)) / (T(hi) - T(lo) || 1)));
    return style.size.min + (style.size.max - style.size.min) * Math.sqrt(t); // area-proportional
  };

  const orderIdx = new Map(cats.map((x, k) => [x.name, k]));
  const vis: Visual[] = SAMPLES.map((s, i) => {
    const cat = catOf(cv, s, user); const v = vals[i];
    const cls = c.mode === 'value' && v != null && Number.isFinite(v) && c.method !== 'continuous' ? classIndex(v, breaks) : null;
    if (cls != null) classCounts[cls]++;
    const color = c.mode === 'fixed' ? c.fixed : c.mode === 'category' ? cats[orderIdx.get(cat) ?? 0]?.color ?? '#8c96a0' : valueColor(v);
    const shape = style.shape.mode === 'fixed' ? style.shape.fixed : catShape(catOf(style.shape.catVar, s, user));
    const hidden = (c.mode === 'category' && style.hidden[`${cv}:${cat}`]) || (cls != null && style.hiddenClasses[cls]);
    return { color, shape, size: sizeOf(svals[i]), visible: !hidden, cat, cls, drawRank: c.mode === 'category' ? cats.length - (orderIdx.get(cat) ?? 0) : 0 };
  });
  return { vis, cats, breaks, classColors, classCounts, valueRange, valueColor, sizeRange };
}

export function useResolved() {
  const style = useApp(s => s.style); const user = useApp(s => s.userClasses);
  return useMemo(() => resolve(style, user), [style, user]);
}
