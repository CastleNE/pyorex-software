/**
 * Value classes for "Tamaño por clases" (kind 'size') and "Color por valor" (kind 'color'), like ioGAS bin ranges:
 * the user chooses the variable, how limits are set (quantiles, equal intervals, Jenks, 1-2-5 series, or their own
 * percentiles or values in the variable's unit), 2 to 20 classes, adds/removes/drags breaks and can save the limits as
 * a named range to reuse in either channel. Size: symbol diameters from "mín" to "máx" with evenly growing area.
 * Colour: a ramp sampled per class, each class colour can be changed by hand. Edits only the presentation of the
 * active window (geochemistry-store.presentation). Never changes results or exports.
 */
import { useMemo, useRef, useState } from 'react';
import { useGeochemistryStore } from '../../stores/geochemistry-store';
import { allBinRanges, useBinRangesStore, type BinRange } from '../../stores/bin-ranges-store';
import { sizeLabel, sizeValuesOf } from '../../lib/build-geo-chart';
import type { ChartPresentation } from '../../lib/chart-presentation';
import { COLOR_RAMP_NAMES, COLOR_RAMPS, colorClassLegend, colorClassSettings, type ColorRamp } from '../../lib/color-classes';
import {
  MAX_CLASSES, MIN_CLASSES, SIZE_METHODS, breaksProblem, clampClasses, classIndex, fmtLimit, fmtPct, isComputed, percentBelow,
  percentilesProblem, sizeClassLegend, sizeClassSettings, suggestBreak, unitOf, usableValues, type ClassSettings, type SizeMethod,
} from '../../lib/size-classes';
import { useT, type TKey } from '../../lib/i18n';

export type ClassKind = 'size' | 'color';
const KEYS = {
  size: { classes: 'sizeClasses', method: 'sizeMethod', breaks: 'sizeBreaks', percentiles: 'sizePercentiles', log: 'sizeLog', boundary: 'sizeBoundary' },
  color: { classes: 'colorClasses', method: 'colorMethod', breaks: 'colorBreaks', percentiles: 'colorPercentiles', log: 'colorLog', boundary: 'colorBoundary' },
} as const;

const field = 'h-7 rounded border border-line-strong bg-raised px-2 text-xs text-fg';
const iconBtn = 'grid h-6 w-6 place-items-center rounded text-muted hover:bg-hover hover:text-fg disabled:opacity-30';
const W = 360, H = 64, BINS = 30;
const round1 = (x: number) => Math.round(x * 10) / 10;

export default function ClassControls({ kind, compact = false }: { kind: ClassKind; compact?: boolean }) {
  const t = useT();
  const p = useGeochemistryStore(s => s.presentation);
  const result = useGeochemistryStore(s => s.result);
  const config = useGeochemistryStore(s => s.config);
  const columns = useGeochemistryStore(s => s.columns);
  const userRanges = useBinRangesStore(s => s.ranges);
  const isSize = kind === 'size';
  const c: ClassSettings = isSize ? sizeClassSettings(p) : colorClassSettings(p);
  const updateP = (patch: Partial<ChartPresentation>) => useGeochemistryStore.setState(s => ({ presentation: { ...s.presentation, ...patch } }));
  /** Patch the class settings of this channel (size* or color* fields). */
  const set = (patch: Partial<ClassSettings>) => updateP(Object.fromEntries(Object.entries(patch).map(([k, v]) => [KEYS[kind][k as keyof ClassSettings], v])) as Partial<ChartPresentation>);
  const values = useMemo(() => (!result ? [] : isSize ? sizeValuesOf(result, p.sizeSource) : result.rows.filter(r => r.status === 'valid').map(r => r.color_value)), [result, isSize, p.sizeSource]);
  const legend = useMemo(() => (isSize ? sizeClassLegend(values, p) : colorClassLegend(values, p)), [values, p, isSize]);
  const usable = useMemo(() => usableValues(values, c.log), [values, c.log]);
  const label = !result ? '' : isSize ? sizeLabel(result, p.sizeSource) : String(result.pipeline.color_column ?? '');
  const unit = unitOf(label);
  const colors = 'colors' in legend ? legend.colors : null;
  const sizes = 'sizes' in legend ? legend.sizes : null;
  const pre = isSize ? '' : `${t('cl.color')} · `;   // keeps accessible names unique when both panels are open
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [lastRange, setLastRange] = useState('');
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const n = legend.counts.length;

  const fail = (code: string) => { setProblem(t(`sz.err.${code}` as TKey)); return false; };
  const clear = () => { setDrafts({}); setProblem(null); setNote(null); };
  const setValues = (breaks: number[]) => {
    const err = breaksProblem(breaks, c.log); if (err) return fail(err);
    setProblem(null); setLastRange(''); set({ method: 'manual', breaks }); return true;
  };
  const setPercents = (pcts: number[]) => {
    const err = percentilesProblem(pcts); if (err) return fail(err);
    setProblem(null); setLastRange(''); set({ method: 'percentile', percentiles: pcts }); return true;
  };
  /** Current limits as percentiles (rounded, strictly increasing), or quantile percentiles when they collapse. */
  const currentPercents = () => {
    const pcts = legend.percents.map(round1);
    return percentilesProblem(pcts) ? Array.from({ length: n - 1 }, (_, k) => round1((100 * (k + 1)) / n)) : pcts;
  };
  const dropDraft = (key: string) => setDrafts(d => { const { [key]: _, ...rest } = d; return rest; });
  /** Applies every pending value (or percentile) typed in the table at once, so limits can be typed one by one in any
   * order: while the set is not yet valid the drafts stay and the problem is shown. */
  const commit = (key: string) => {
    if (drafts[key] === undefined) return;
    const kindOf = key[0];
    const pending = Object.entries(drafts).filter(([k]) => k[0] === kindOf).map(([k, raw]) => [Number(k.slice(1)), Number(raw.replace(',', '.'))] as const);
    const base = kindOf === 'v' ? [...legend.breaks] : [...(c.method === 'percentile' && c.percentiles?.length === legend.breaks.length ? c.percentiles : currentPercents())];
    for (const [k, v] of pending) base[k] = v;
    const ok = kindOf === 'v' ? setValues(base) : setPercents(base);
    if (ok) setDrafts(d => Object.fromEntries(Object.entries(d).filter(([k]) => k[0] !== kindOf)));
  };
  const setCount = (next: number) => { clear(); set({ classes: clampClasses(next) }); };
  const setMethod = (m: SizeMethod) => {
    clear();
    if (m === 'manual') set({ method: m, breaks: legend.breaks.length ? legend.breaks.map(b => +b.toPrecision(4)) : null });
    else if (m === 'percentile') set({ method: m, percentiles: legend.breaks.length ? currentPercents() : null });
    else set({ method: m, ...(isComputed(m) && !isComputed(c.method) && n >= MIN_CLASSES ? { classes: n } : {}) });
  };
  const addBreak = () => {
    clear();
    if (c.method === 'percentile') {
      const edges = [0, ...currentPercents(), 100];
      let best = 0; for (let i = 1; i < edges.length - 1; i++) if (edges[i + 1] - edges[i] > edges[best + 1] - edges[best]) best = i;
      return void setPercents([...edges.slice(1, -1), round1((edges[best] + edges[best + 1]) / 2)].sort((a, b) => a - b));
    }
    const b = suggestBreak(usable, legend.breaks, legend.boundary);
    if (b !== null) setValues([...legend.breaks.map(x => +x.toPrecision(4)), b].sort((x, y) => x - y));
  };
  const removeBreak = (k: number) => {
    clear();
    if (c.method === 'percentile') setPercents(currentPercents().filter((_, i) => i !== k));
    else setValues(legend.breaks.filter((_, i) => i !== k));
  };
  const applyRange = (r: BinRange) => {
    clear();
    if (r.type === 'percentile' ? setPercents(r.breaks) : setValues(r.breaks)) setLastRange(r.id);
  };
  const saveRange = () => {
    const name = (naming ?? '').trim(); if (!name) return;
    const type = c.method === 'percentile' ? 'percentile' : 'value';
    const id = useBinRangesStore.getState().save(name, type, type === 'percentile' ? currentPercents() : legend.breaks.map(b => +b.toPrecision(6)), type === 'value' ? unit || undefined : undefined);
    if (id) { setLastRange(id); setNaming(null); setNote(t('sz.saved').replace('{name}', name)); }
  };
  /** Value limits belong to the previous variable; percentiles and computed methods carry over. */
  const keepMethod = () => (c.method === 'manual' ? { method: 'quantile' as const, breaks: null, classes: clampClasses(n) } : {});
  const setColumn = (col: string) => {
    const g = useGeochemistryStore.getState();
    clear();
    if (isSize) updateP({ sizeSource: 'column' });
    set(keepMethod());
    const key = isSize ? 'size_column' : 'color_column';
    if (col !== (config?.[key] ?? '')) { g.configure({ [key]: col || null }); if (g.result) void useGeochemistryStore.getState().run(); }
  };
  const setColor = (k: number, hex: string) => updateP({ colorCustom: (colors ?? []).map((x, i) => (i === k ? hex : x)) });

  // Histogram on the classing scale (log10 when log is on); limits are draggable.
  const T = (x: number) => (c.log ? Math.log10(x) : x), TI = (x: number) => (c.log ? 10 ** x : x);
  const lo = usable.length ? T(usable[0]) : 0, hi = usable.length ? T(usable[usable.length - 1]) : 1, span = hi - lo || 1;
  const bins = useMemo(() => { const b = new Array(BINS).fill(0) as number[]; for (const v of usable) b[Math.min(BINS - 1, Math.floor(((T(v) - lo) / span) * BINS))]++; return b; }, [usable, lo, span, c.log]);
  const peak = Math.max(1, ...bins);
  const X = (v: number) => ((T(v) - lo) / span) * W;
  const onMove = (e: React.PointerEvent) => {
    if (drag == null || !svg.current) return;
    const r = svg.current.getBoundingClientRect();
    const raw = TI(lo + ((e.clientX - r.left) / r.width) * span);
    const prev = drag > 0 ? legend.breaks[drag - 1] : -Infinity, next = drag < legend.breaks.length - 1 ? legend.breaks[drag + 1] : Infinity;
    const eps = Math.abs(raw) * 1e-6 + 1e-9;
    const v = +Math.min(next - eps, Math.max(prev + eps, raw)).toPrecision(4);
    if (c.method === 'percentile') {
      const pcts = currentPercents(); pcts[drag] = round1(percentBelow(usable, v, legend.boundary));
      if (!percentilesProblem(pcts)) { setProblem(null); set({ percentiles: pcts }); }
      return;
    }
    const b = legend.breaks.map(x => +x.toPrecision(4)); b[drag] = v;
    if (!breaksProblem(b, c.log)) { setProblem(null); set({ method: 'manual', breaks: b }); }
  };
  const numeric = columns.filter(col => col.numeric).map(col => col.name);
  const column = isSize ? config?.size_column : config?.color_column;
  const noValues = !usable.length;
  const ranges = allBinRanges(userRanges);
  const rangeName = (r: BinRange) => (r.builtin ? t(`br.${r.id.slice(2)}` as TKey) : r.name);
  const rangeKind = (r: BinRange) => (r.type === 'percentile' ? t('sz.r.percentile') : `${t('sz.r.value')}${r.unit ? ` ${r.unit}` : ''}`);
  const selectedUser = userRanges.find(r => r.id === lastRange);
  const pctOf = (k: number) => (c.method === 'percentile' && c.percentiles?.length === legend.breaks.length ? c.percentiles[k] : legend.percents[k]);
  const classFill = (k: number) => (colors ? colors[k] : 'var(--color-accent)');

  const variable = isSize
    ? <select aria-label={t('sz.variable')} className={`${field} ${compact ? 'w-full' : 'max-w-48'}`} value={p.sizeSource === 'column' ? config?.size_column ?? '' : `@${p.sizeSource}`}
        onChange={e => (e.target.value.startsWith('@') ? (clear(), updateP({ sizeSource: e.target.value.slice(1) as 'x' | 'y' }), set(keepMethod())) : setColumn(e.target.value))}>
        <option value="@x">{t('sz.axisX')}</option><option value="@y">{t('sz.axisY')}</option>
        <optgroup label={t('sz.column')}>{numeric.map(col => <option key={col} value={col}>{col}</option>)}</optgroup>
      </select>
    : <select aria-label={`${pre}${t('sz.variable')}`} className={`${field} ${compact ? 'w-full' : 'max-w-48'}`} value={config?.color_column ?? ''} onChange={e => setColumn(e.target.value)}>
        <option value="">{t('cl.none')}</option>
        {numeric.map(col => <option key={col} value={col}>{col}</option>)}
      </select>;

  if (!isSize && !config?.color_column) return <div className={compact ? '' : 'mt-3'}>
    <label className="flex flex-col gap-1">{t('sz.variable')}{variable}</label>
    <p className="mt-2 text-subtle">{t('cl.pickColumn')}</p>
  </div>;

  return <div className={compact ? '' : 'mt-3 rounded border border-line bg-sunken/30 p-3'}>
    <div className={`flex flex-wrap items-end ${compact ? 'gap-x-3 gap-y-2.5' : 'gap-4'}`}>
      <label className={`flex flex-col gap-1 ${compact ? 'w-full' : ''}`}>{t('sz.variable')}{variable}</label>
      <label className={`flex flex-col gap-1 ${compact ? 'min-w-0 flex-1' : ''}`}>{t('sz.method')}
        <select aria-label={`${pre}${t('sz.method')}`} className={`${field} ${compact ? 'w-full' : ''}`} value={c.method} onChange={e => setMethod(e.target.value as SizeMethod)}>
          {SIZE_METHODS.map(m => <option key={m} value={m}>{m === 'manual' && unit ? `${t('sz.m.manual')} (${unit})` : t(`sz.m.${m}` as TKey)}</option>)}</select></label>
      <div className="flex flex-col gap-1">{t('sz.classes')}
        {isComputed(c.method)
          ? <div className="flex h-7 items-center rounded bg-sunken p-0.5" role="group" aria-label={`${pre}${t('sz.classes')}`}>
              <button className={iconBtn} aria-label={`${pre}${t('sz.lessClasses')}`} disabled={c.classes <= MIN_CLASSES} onClick={() => setCount(c.classes - 1)}>−</button>
              <input aria-label={`${pre}${t('sz.classes')} (${MIN_CLASSES}–${MAX_CLASSES})`} type="number" min={MIN_CLASSES} max={MAX_CLASSES} value={c.classes}
                onChange={e => setCount(+e.target.value)} className="h-6 w-9 bg-transparent text-center font-mono text-xs font-semibold text-fg [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
              <button className={iconBtn} aria-label={`${pre}${t('sz.moreClasses')}`} disabled={c.classes >= MAX_CLASSES} onClick={() => setCount(c.classes + 1)}>+</button>
            </div>
          : <span className="flex h-7 items-center px-2 font-mono text-xs font-semibold text-fg">{n}</span>}
      </div>

      <div className={`flex flex-col gap-1 ${compact ? 'w-full' : ''}`}>{t('sz.ranges')}
        <div className="flex items-center gap-1.5">
          <select aria-label={`${pre}${t('sz.ranges')}`} className={`${field} min-w-0 flex-1`} value={lastRange}
            onChange={e => { const r = ranges.find(x => x.id === e.target.value); if (r) applyRange(r); }}>
            <option value="" disabled>{t('sz.pickRange')}</option>
            <optgroup label={t('sz.builtin')}>{ranges.filter(r => r.builtin).map(r => <option key={r.id} value={r.id}>{rangeName(r)}</option>)}</optgroup>
            {userRanges.length > 0 && <optgroup label={t('sz.mine')}>{userRanges.map(r => <option key={r.id} value={r.id}>{r.name} · {rangeKind(r)}</option>)}</optgroup>}
          </select>
          {selectedUser && <button className={iconBtn} title={t('sz.deleteRange')} aria-label={`${pre}${t('sz.deleteRange')}`} onClick={() => { useBinRangesStore.getState().remove(selectedUser.id); setLastRange(''); }}>✕</button>}
          {naming === null && !noValues && <button className="h-7 shrink-0 rounded border border-line-strong px-2 text-xs text-muted hover:text-fg" aria-label={`${pre}${t('sz.saveAs')}`} onClick={() => setNaming('')}>{t('sz.saveAs')}</button>}
        </div>
        {naming !== null && <div className="flex items-center gap-1.5">
          <input autoFocus aria-label={`${pre}${t('sz.rangeName')}`} placeholder={t('sz.rangeName')} className={`${field} min-w-0 flex-1`} value={naming}
            onChange={e => setNaming(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveRange(); if (e.key === 'Escape') setNaming(null); }} />
          <button className="h-7 rounded bg-accent-strong px-2 text-xs font-semibold text-on-accent disabled:opacity-40" disabled={!naming.trim()} onClick={saveRange}>{t('sz.save')}</button>
          <button className="h-7 rounded px-2 text-xs text-muted hover:text-fg" onClick={() => setNaming(null)}>{t('sz.cancel')}</button>
        </div>}
      </div>

      <label className="flex items-center gap-1.5 pb-1"><input type="checkbox" aria-label={`${pre}${t('sz.log')}`} checked={c.log} onChange={e => { clear(); set({ log: e.target.checked }); }} />{t('sz.log')}</label>
      <div className="flex flex-col gap-1">{t('sz.boundary')}
        <div className="flex rounded bg-sunken p-0.5" role="group" aria-label={`${pre}${t('sz.boundary')}`}>{(['down', 'up'] as const).map(b =>
          <button key={b} onClick={() => set({ boundary: b })} aria-pressed={c.boundary === b} className={`h-6 rounded px-2 text-xs ${c.boundary === b ? 'bg-accent-strong font-semibold text-on-accent' : 'text-muted hover:text-fg'}`}>{t(`sz.b.${b}` as TKey)}</button>)}</div></div>
      {isSize ? <>
        <label className={`flex flex-col gap-1 ${compact ? 'w-[calc(50%-0.375rem)] min-w-0' : ''}`}>{t('sz.min')} · {p.sizeMin}px<input aria-label={t('sz.min')} type="range" min={2} max={20} value={p.sizeMin} onChange={e => updateP({ sizeMin: +e.target.value, sizeMax: Math.max(+e.target.value, p.sizeMax) })} /></label>
        <label className={`flex flex-col gap-1 ${compact ? 'w-[calc(50%-0.375rem)] min-w-0' : ''}`}>{t('sz.max')} · {p.sizeMax}px<input aria-label={t('sz.max')} type="range" min={6} max={40} value={p.sizeMax} onChange={e => updateP({ sizeMax: +e.target.value, sizeMin: Math.min(+e.target.value, p.sizeMin) })} /></label>
      </> : <>
        <div className={`flex items-end gap-2 ${compact ? 'w-full' : ''}`}>
          <label className="flex min-w-0 flex-1 flex-col gap-1">{t('cl.ramp')}
            <select aria-label={t('cl.ramp')} className={`${field} w-full`} value={p.colorRamp} onChange={e => updateP({ colorRamp: e.target.value as ColorRamp, colorCustom: null })}>
              {COLOR_RAMP_NAMES.map(r => <option key={r} value={r}>{t(`cl.r.${r}` as TKey)}</option>)}</select></label>
          <span aria-hidden className="mb-2 h-3 w-16 shrink-0 rounded-sm" style={{ background: `linear-gradient(to right, ${(p.colorReverse ? [...COLOR_RAMPS[p.colorRamp]].reverse() : COLOR_RAMPS[p.colorRamp]).join(',')})` }} />
          <label className="flex shrink-0 items-center gap-1.5 pb-1.5"><input type="checkbox" checked={p.colorReverse} onChange={e => updateP({ colorReverse: e.target.checked, colorCustom: null })} />{t('cl.reverse')}</label>
        </div>
        {p.colorCustom && p.colorCustom.length === n && <button className="h-7 rounded px-2 text-xs text-muted underline hover:text-fg" onClick={() => updateP({ colorCustom: null })}>{t('cl.resetColors')}</button>}
      </>}
    </div>

    {isSize && p.sizeSource === 'column' && !config?.size_column && <p className="mt-2 text-warning">{t('sz.pickColumn')}</p>}
    {noValues && (!isSize || p.sizeSource !== 'column' || column) && <p className="mt-2 text-warning">{result ? t('sz.noValues') : t('needResult')}</p>}

    {!noValues && <>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-16 w-full max-w-[520px] touch-none rounded bg-sunken" role="img" aria-label={`${pre}${t('sz.histogram')}`}
        onPointerMove={onMove} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}>
        {bins.map((count, k) => { const mid = TI(lo + ((k + 0.5) / BINS) * span); const cls = classIndex(mid, legend.breaks, legend.boundary);
          return <rect key={k} x={(k / BINS) * W + 0.5} width={W / BINS - 1} y={H - 3 - (count / peak) * (H - 10)} height={(count / peak) * (H - 10)} rx={1} fill={classFill(cls)} opacity={colors ? 1 : 0.25 + 0.75 * (cls + 1) / n} />; })}
        {legend.breaks.map((b, k) => <g key={k} style={{ cursor: 'ew-resize' }} onPointerDown={e => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); setDrag(k); }}>
          <line x1={X(b)} x2={X(b)} y1={0} y2={H} stroke="var(--color-fg)" strokeWidth={1.2} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
          <rect x={X(b) - 6} y={0} width={12} height={H} fill="transparent" />
          <circle cx={X(b)} cy={6} r={4} fill="var(--color-raised)" stroke="var(--color-fg)" vectorEffect="non-scaling-stroke" />
        </g>)}
      </svg>
      <div className="flex max-w-[520px] justify-between font-mono text-[10.5px] text-subtle"><span>{fmtLimit(usable[0])}</span><span>{t('sz.dragHint')}</span><span>{fmtLimit(usable[usable.length - 1])}</span></div>

      <table className="mt-2 text-xs">
        <thead className="text-[10.5px] uppercase tracking-wide text-subtle"><tr>
          <th className="pr-2 text-left font-semibold">{isSize ? t('sz.symbol') : t('cl.color')}</th><th className="pr-2 text-left font-semibold">{t('sz.from')}</th>
          <th className="pr-1.5 text-left font-semibold">{t('sz.to')}{unit ? ` (${unit})` : ''}</th><th className="pr-1.5 text-left font-semibold" title={t('sz.pct')}>{t('sz.pctShort')} %</th>
          <th className="pr-1 text-right font-semibold">n</th><th /></tr></thead>
        <tbody>{legend.counts.map((count, k) => {
          const from = k === 0 ? legend.min : legend.breaks[k - 1];
          const last = k === n - 1, vk = `v${k}`, pk = `p${k}`;
          const keys = (key: string) => ({ onBlur: () => commit(key), onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') dropDraft(key); } });
          const d = sizes?.[k] ?? 0;
          return <tr key={k} className="border-t border-line">
            <td className="py-1 pr-2">{sizes
              ? <svg width={d + 2} height={d + 2} className="block"><circle cx={d / 2 + 1} cy={d / 2 + 1} r={d / 2} fill="var(--color-accent)" fillOpacity={0.55} stroke="var(--color-accent)" /></svg>
              : <label className="relative block h-4 w-6 cursor-pointer rounded-sm border border-line-strong" style={{ background: colors?.[k] }} title={t('cl.pickColor')}>
                  <input type="color" aria-label={`${t('cl.pickColor')} ${k + 1}`} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={colors?.[k] ?? '#000000'} onChange={e => setColor(k, e.target.value)} />
                </label>}</td>
            <td className="whitespace-nowrap pr-2 font-mono text-muted">{k === 0 ? fmtLimit(from ?? NaN) : `${legend.boundary === 'down' ? '>' : '≥'} ${fmtLimit(from ?? NaN)}`}</td>
            {last
              ? <><td className="pr-1.5 font-mono text-muted">{fmtLimit(legend.max ?? NaN)}</td><td className="pr-1.5 font-mono text-muted">100</td></>
              : <><td className="pr-1.5"><input aria-label={`${pre}${t('sz.limit')} ${k + 1}`} inputMode="decimal" className={`${field} w-[4.6rem] px-1.5 font-mono ${c.method === 'percentile' ? 'text-muted' : ''}`}
                    value={drafts[vk] ?? fmtLimit(legend.breaks[k])} onChange={e => setDrafts(dd => ({ ...dd, [vk]: e.target.value }))} {...keys(vk)} /></td>
                  <td className="pr-1.5"><input aria-label={`${pre}${t('sz.pct')} ${k + 1}`} inputMode="decimal" className={`${field} w-12 px-1.5 font-mono ${c.method === 'percentile' ? '' : 'text-muted'}`}
                    value={drafts[pk] ?? fmtPct(pctOf(k))} onChange={e => setDrafts(dd => ({ ...dd, [pk]: e.target.value }))} {...keys(pk)} /></td></>}
            <td className="tabular pr-1 text-right font-mono text-fg">{count}</td>
            <td>{!last && <button className={iconBtn} title={t('sz.removeBreak')} aria-label={`${pre}${t('sz.removeBreak')} ${k + 1}`} disabled={legend.breaks.length <= 1} onClick={() => removeBreak(k)}>×</button>}</td>
          </tr>;
        })}</tbody>
      </table>
      <button className="mt-1.5 h-7 rounded border border-dashed border-line-strong px-2 text-xs text-muted hover:text-fg disabled:opacity-40" aria-label={`${pre}${t('sz.addBreak')}`} disabled={n >= MAX_CLASSES} onClick={addBreak}>+ {t('sz.addBreak')}</button>
      {legend.missing > 0 && <p className="mt-1 text-subtle">{t(isSize ? 'sz.missing' : 'cl.missing').replace('{n}', String(legend.missing))}</p>}
      {problem && <p role="alert" className="mt-1 text-danger">{problem}</p>}
      {note && <p role="status" className="mt-1 text-success">{note}</p>}
      {isSize && n > 7 && <p className="mt-1 text-warning">{t('sz.manyClasses')}</p>}
      <p className="mt-1 text-subtle">{c.method === 'series' ? t('sz.seriesHint') : t('sz.ownHint')}</p>
    </>}
  </div>;
}
