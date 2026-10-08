/**
 * NOTE: no longer used by the app — "Color por valor" now uses the user classes of lib/color-classes.ts.
 * Histogram behind the "Color por valor (5 clases)" legend. Uses exactly the
 * class rule of build-geo-chart.ts (five equal intervals of the observed
 * range, top edge inclusive) so legend counts match the plotted colours.
 * Presentation only — never feeds the scientific result.
 */
export interface LegendBin { x0: number; x1: number; count: number; classIndex: number }
export interface ColorLegendStats { min: number; max: number; bins: LegendBin[]; classCounts: number[]; missing: number }

export function classOf(value: number, min: number, max: number): number {
  return max === min ? 2 : Math.min(4, Math.floor((5 * (value - min)) / (max - min)));
}

export function colorLegendStats(values: (number | null | undefined)[], binCount = 20): ColorLegendStats | null {
  const finite = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const missing = values.length - finite.length;
  if (!finite.length) return null;
  const min = finite.reduce((a, b) => Math.min(a, b));
  const max = finite.reduce((a, b) => Math.max(a, b));
  const classCounts = [0, 0, 0, 0, 0];
  for (const v of finite) classCounts[classOf(v, min, max)] += 1;
  const n = max === min ? 1 : binCount;
  const width = max === min ? 1 : (max - min) / n;
  const bins: LegendBin[] = Array.from({ length: n }, (_, i) => {
    const x0 = min + i * width;
    const x1 = max === min ? max : x0 + width;
    return { x0, x1, count: 0, classIndex: classOf((x0 + x1) / 2, min, max) };
  });
  for (const v of finite) bins[max === min ? 0 : Math.min(n - 1, Math.floor((v - min) / width))].count += 1;
  return { min, max, bins, classCounts, missing };
}
