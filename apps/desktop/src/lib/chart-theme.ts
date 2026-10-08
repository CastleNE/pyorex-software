/**
 * Plotly can't read CSS variables, so chart colours are resolved from the
 * design-system tokens at render time and re-resolved when the theme changes.
 * `themeLayout` also rewrites the legacy hard-coded dark palette (zinc hexes
 * still present in builders such as build-geo-chart.ts) so every existing
 * chart follows the theme without changing its builder.
 */
export interface ChartTheme {
  bg: string;
  grid: string;
  font: string;
  legend: string;
  neutral: string;
  /** Classification-field boundaries (TAS, QAPF…): visible but quieter than data. */
  field: string;
  splice: string;
  fontFamily: string;
}

export const DARK_CHART_THEME: ChartTheme = {
  bg: "#151e27",
  grid: "#283646",
  font: "#c3cdd8",
  legend: "#1b2631",
  neutral: "#93a1b0",
  field: "#4a5b6d",
  splice: "rgba(240, 180, 76, 0.10)",
  fontFamily: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
};

export function readChartTheme(root: Element | null = typeof document !== "undefined" ? document.documentElement : null): ChartTheme {
  if (!root || typeof getComputedStyle === "undefined") return DARK_CHART_THEME;
  const css = getComputedStyle(root);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    bg: v("--px-chart-bg", DARK_CHART_THEME.bg),
    grid: v("--px-chart-grid", DARK_CHART_THEME.grid),
    font: v("--px-chart-font", DARK_CHART_THEME.font),
    legend: v("--px-chart-legend", DARK_CHART_THEME.legend),
    neutral: v("--px-chart-neutral", DARK_CHART_THEME.neutral),
    field: v("--px-chart-field", DARK_CHART_THEME.field),
    splice: v("--px-spec-splice", DARK_CHART_THEME.splice),
    fontFamily: DARK_CHART_THEME.fontFamily,
  };
}

/** Legacy dark-UI hexes (zinc) → the theme role they played. */
const LEGACY: Record<string, keyof ChartTheme> = {
  "#18181b": "bg", // zinc-900
  "#27272a": "legend", // zinc-800
  "#3f3f46": "grid", // zinc-700
  "#d4d4d8": "font", // zinc-300
  "#e4e4e7": "font", // zinc-200
  "#a1a1aa": "neutral", // zinc-400
  "#71717a": "neutral", // zinc-500
  "#52525b": "field", // zinc-600 — classification field lines
};

function mapValue(value: unknown, theme: ChartTheme): unknown {
  if (typeof value === "string") {
    const role = LEGACY[value.toLowerCase()];
    return role ? theme[role] : value;
  }
  if (Array.isArray(value)) return value.map((x) => mapValue(x, theme));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(value as Record<string, unknown>)) out[k] = mapValue(x, theme);
    return out;
  }
  return value;
}

/** Applies the theme to a Plotly layout: legacy colours remapped + base colours/fonts set. */
export function themeLayout<T extends object>(layout: T | undefined, theme: ChartTheme): T {
  const mapped = (mapValue(layout ?? {}, theme) ?? {}) as Record<string, unknown>;
  const font = (mapped.font as Record<string, unknown> | undefined) ?? {};
  return {
    ...mapped,
    paper_bgcolor: mapped.paper_bgcolor ?? theme.bg,
    plot_bgcolor: mapped.plot_bgcolor ?? theme.bg,
    font: { ...font, color: font.color ?? theme.font, family: font.family ?? theme.fontFamily },
  } as T;
}

/** Remaps only legacy neutral greys inside trace data (identity lines, default markers). */
export function themeData<T>(data: T, theme: ChartTheme): T {
  return mapValue(data, theme) as T;
}

/** Detector splice zones (nm) for VNIR–SWIR instruments; shaded so jumps aren't read as features. */
export const DETECTOR_SPLICES: [number, number][] = [
  [975, 1025],
  [1800, 1860],
];

/** Plotly shapes for the splices that fall inside the plotted wavelength range. */
export function spliceShapes(minNm: number, maxNm: number, theme: ChartTheme) {
  return DETECTOR_SPLICES.filter(([a, b]) => b > minNm && a < maxNm).map(([a, b]) => ({
    type: "rect" as const,
    xref: "x" as const,
    yref: "paper" as const,
    x0: Math.max(a, minNm),
    x1: Math.min(b, maxNm),
    y0: 0,
    y1: 1,
    fillcolor: theme.splice,
    line: { width: 0 },
    layer: "below" as const,
  }));
}
