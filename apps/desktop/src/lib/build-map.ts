/**
 * Plotly figure of the sample map (Secciones y mapas). Pure: takes the engine result (lib/maps-api.ts) and the user's
 * settings (stores/map-store.ts) and returns traces, layout and legend. No calculation here beyond presentation:
 * classes reuse the colour-class rules of the charts (lib/color-classes.ts), the IDW grid comes from Python.
 *
 * - Value mapped: points coloured by class, the category (if any) as symbol; samples without value in grey.
 * - Only a category: points coloured by category.
 * - Surface: the IDW grid filled with the SAME classes as the points (so colours mean the same everywhere) and an
 *   isoline at every class limit, labelled with its value.
 * - Equal scale on both axes (1 m = 1 m; for longitude/latitude, corrected by cos(latitude)), a scale bar and a
 *   north arrow.
 */
import type { Data, Layout, Shape, Annotations } from 'plotly.js';
import { AUTO_SYMBOLS } from './geochemistry-attributes';
import { PALETTES } from './chart-presentation';
import { colorClassLegend, MISSING_COLOR, type ColorClassLegend } from './color-classes';
import { classIndex, classRange, fmtLimit } from './size-classes';
import type { MapResult } from './maps-api';
import type { MapSettings } from '../stores/map-store';
import type { ChartTheme } from './chart-theme';
import type { Txt } from './i18n';

export type MapLegend =
  | { kind: 'classes'; title: string; classes: { color: string; range: string; count: number }[]; missing: number; surface: boolean; log: boolean }
  | { kind: 'categories'; title: string; items: { color: string; name: string; count: number }[] }
  | { kind: 'none' };

export interface MapFigure {
  data: Data[]; layout: Partial<Layout>; legend: MapLegend; symbols: { name: string; symbol: string; count: number }[];
  /** Value classes of the map (the section reuses them so colours mean the same in both views). */
  classes: ColorClassLegend | null;
}

export interface MapContext {
  selection: ReadonlySet<number>;
  dragmode: 'lasso' | 'select' | 'zoom' | 'pan' | 'drawline';
  theme: ChartTheme;
  t: (x: Txt) => string;
}

const NO_DATA = 'Sin dato';

/** A "round" length (1, 2 or 5 × 10ⁿ) close to a fifth of the map width, for the scale bar. */
export function niceLength(width: number): number {
  if (!(width > 0)) return 0;
  const target = width / 5, pow = 10 ** Math.floor(Math.log10(target)), f = target / pow;
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * pow;
}

export function fmtDistance(m: number): string {
  return m >= 1000 ? `${+(m / 1000).toPrecision(3)} km` : `${+m.toPrecision(3)} m`;
}

/** Map extent with a small margin so edge samples are not cut. */
export function mapExtent(xs: number[], ys: number[]) {
  let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // Samples along a line (collars of a drill fence, a traverse): open the short side so the map is not a sliver.
  const span = Math.max(x1 - x0, y1 - y0, 1), minSide = span * 0.35;
  if (x1 - x0 < minSide) { const c = (x0 + x1) / 2; [x0, x1] = [c - minSide / 2, c + minSide / 2]; }
  if (y1 - y0 < minSide) { const c = (y0 + y1) / 2; [y0, y1] = [c - minSide / 2, c + minSide / 2]; }
  const pad = span * 0.06;
  return { x0: x0 - pad, x1: x1 + pad, y0: y0 - pad, y1: y1 + pad };
}

export function buildMap(result: MapResult, s: MapSettings, ctx: MapContext): MapFigure {
  const { t, theme, selection } = ctx;
  const pts = result.points;
  const valueMode = !!result.value_label;
  const values = pts.map(p => p.value);
  const legendData: ColorClassLegend | null = valueMode ? colorClassLegend(values, s) : null;

  // Categories: colour when no value is mapped, symbol when a value is.
  const catNames = result.category_column ? [...new Set(pts.map(p => p.category ?? NO_DATA))] : [];
  catNames.sort((a, b) => (a === NO_DATA ? 1 : b === NO_DATA ? -1 : a.localeCompare(b, 'es', { numeric: true })));
  const palette = PALETTES.Accessible;
  const catColor = (c: string) => (c === NO_DATA ? MISSING_COLOR : palette[catNames.filter(n => n !== NO_DATA).indexOf(c) % palette.length]);
  const catSymbol = (c: string) => AUTO_SYMBOLS[Math.max(0, catNames.indexOf(c)) % AUTO_SYMBOLS.length];

  const colorOf = (i: number): string => {
    const p = pts[i];
    if (legendData) {
      const v = p.value;
      if (v === null || !Number.isFinite(v) || (legendData.log && v <= 0)) return MISSING_COLOR;
      return legendData.colors[classIndex(v, legendData.breaks, legendData.boundary)];
    }
    if (result.category_column) return catColor(p.category ?? NO_DATA);
    return '#56b4e9';
  };

  const data: Data[] = [];
  const grid = s.surface ? result.grid : null;

  // IDW surface: grid → class index, filled bands with the class colours; isolines at the class limits.
  if (grid && legendData && legendData.breaks.length) {
    const n = legendData.colors.length;
    const zClass = grid.z.map(line => line.map(v => (v === null || (legendData.log && v <= 0) ? null : classIndex(v, legendData.breaks, legendData.boundary))));
    const colorscale: [number, string][] = [];
    legendData.colors.forEach((c, k) => { colorscale.push([k / n, c], [(k + 1) / n, c]); });
    data.push({
      type: 'heatmap', x: grid.x, y: grid.y, z: zClass as unknown as number[][], zmin: -0.5, zmax: n - 0.5, zsmooth: false,
      colorscale, showscale: false, opacity: s.surfaceOpacity, hoverinfo: 'skip', name: t({ es: 'Superficie IDW', en: 'IDW surface' }),
    } as Data);
    if (s.contours) {
      for (const b of legendData.breaks) {
        data.push({
          type: 'contour', x: grid.x, y: grid.y, z: grid.z as number[][], showscale: false, hoverinfo: 'skip', name: fmtLimit(b),
          autocontour: false, contours: { start: b, end: b, size: 1, coloring: 'none', showlabels: true, labelformat: '.3~g', labelfont: { size: 10, color: theme.font } },
          line: { color: theme.font, width: 1, smoothing: 0.85 },
        } as Data);
      }
    }
  }

  // Samples: one trace (lasso + shared selection), drawn above the surface.
  const sel = selection.size ? pts.map((p, i) => (selection.has(p.row_index) ? i : -1)).filter(i => i >= 0) : undefined;
  const hover = pts.map(p => {
    const lines = [`<b>${p.sample_id}</b>`];
    if (valueMode) lines.push(`${result.value_label}: ${p.value === null ? `<i>${t({ es: 'sin valor', en: 'no value' })}</i>` : fmtLimit(p.value)}`);
    if (result.category_column) lines.push(`${result.category_column}: ${p.category ?? NO_DATA}`);
    lines.push(`${result.crs.x_column}: ${fmtCoord(p.x, result.crs.geographic)} · ${result.crs.y_column}: ${fmtCoord(p.y, result.crs.geographic)}`);
    return lines.join('<br>');
  });
  const showText = s.showLabels;
  data.push({
    type: 'scatter', mode: showText ? 'text+markers' : 'markers', x: pts.map(p => p.x), y: pts.map(p => p.y),
    customdata: pts.map(p => p.row_index), hovertext: hover, hoverinfo: 'text', text: showText ? pts.map(p => p.sample_id) : undefined,
    textposition: 'top center', textfont: { size: 10, color: theme.font }, name: t({ es: 'Muestras', en: 'Samples' }),
    marker: {
      color: pts.map((_, i) => colorOf(i)), size: s.pointSize,
      symbol: valueMode && result.category_column ? pts.map(p => catSymbol(p.category ?? NO_DATA)) : 'circle',
      // Over the surface the symbol shares its class colour with the band below: a light outline keeps it visible.
      line: { color: grid ? '#ffffff' : theme.bg, width: grid ? 1.4 : 1 }, opacity: 1,
    },
    selectedpoints: sel, selected: { marker: { size: s.pointSize + 4, opacity: 1 } }, unselected: { marker: { opacity: 0.3 } },
  } as Data);

  // Frame: equal scale, scale bar and north arrow.
  const ext = mapExtent(pts.map(p => p.x), pts.map(p => p.y));
  const meanLat = (ext.y0 + ext.y1) / 2;
  const ratio = result.crs.geographic ? 1 / Math.max(0.1, Math.cos((meanLat * Math.PI) / 180)) : 1;
  const shapes: Partial<Shape>[] = [];
  const annotations: Partial<Annotations>[] = [{
    xref: 'paper', yref: 'paper', x: 0.985, y: 0.975, xanchor: 'right', yanchor: 'top', text: '<b>N</b>', showarrow: true,
    ax: 0, ay: 26, arrowhead: 2, arrowsize: 1.2, arrowwidth: 2, arrowcolor: theme.font, font: { size: 13, color: theme.font }, standoff: 2,
  }];
  // Section A–A': the line, its band (samples projected onto it) and the end labels.
  const sec = s.section;
  if (sec && !result.crs.geographic) {
    const [ax, ay] = sec.start, [bx, by] = sec.end, len = Math.hypot(bx - ax, by - ay);
    if (len > 0) {
      const nx = ((by - ay) / len) * (sec.width / 2), ny = (-(bx - ax) / len) * (sec.width / 2);
      shapes.push({ type: 'path', xref: 'x', yref: 'y', path: `M${ax + nx},${ay + ny} L${bx + nx},${by + ny} L${bx - nx},${by - ny} L${ax - nx},${ay - ny} Z`,
        line: { color: theme.font, width: 1, dash: 'dot' }, fillcolor: 'rgba(255,255,255,0.06)' });
      shapes.push({ type: 'line', xref: 'x', yref: 'y', x0: ax, y0: ay, x1: bx, y1: by, line: { color: theme.font, width: 2.5 } });
      for (const [x, y, text] of [[ax, ay, 'A'], [bx, by, "A'"]] as [number, number, string][]) {
        annotations.push({ xref: 'x', yref: 'y', x, y, text: `<b>${text}</b>`, showarrow: false, font: { size: 13, color: theme.bg }, bgcolor: theme.font, borderpad: 3 });
      }
    }
  }

  if (!result.crs.geographic) {
    const len = niceLength(ext.x1 - ext.x0);
    const x0 = ext.x0 + (ext.x1 - ext.x0) * 0.04, y = ext.y0 + (ext.y1 - ext.y0) * 0.04;
    shapes.push({ type: 'line', xref: 'x', yref: 'y', x0, x1: x0 + len, y0: y, y1: y, line: { color: theme.font, width: 3 } });
    for (const xx of [x0, x0 + len]) shapes.push({ type: 'line', xref: 'x', yref: 'y', x0: xx, x1: xx, y0: y, y1: y + (ext.y1 - ext.y0) * 0.012, line: { color: theme.font, width: 2 } });
    const unit = result.crs.source === 'local_grid' ? ` ${t({ es: 'u', en: 'u' })}` : '';
    annotations.push({ xref: 'x', yref: 'y', x: x0 + len / 2, y, yshift: 11, showarrow: false, text: unit ? `${+len.toPrecision(3)}${unit}` : fmtDistance(len), font: { size: 11, color: theme.font } });
  }

  const axisTitle = (col: string) => `${col}${result.crs.geographic ? ' (°)' : result.crs.source === 'local_grid' ? '' : ' (m)'}`;
  const layout: Partial<Layout> = {
    margin: { l: 78, r: 16, t: 12, b: 52 },
    dragmode: ctx.dragmode, hovermode: 'closest', showlegend: false, uirevision: `${result.dataset_id}:${result.crs.x_column}:${result.crs.y_column}`,
    xaxis: { title: { text: axisTitle(result.crs.x_column) }, range: [ext.x0, ext.x1], showgrid: true, gridcolor: theme.grid, zeroline: false,
      tickformat: result.crs.geographic ? '.3f' : ',.0f', constrain: 'domain', ticks: 'outside' },
    yaxis: { title: { text: axisTitle(result.crs.y_column) }, range: [ext.y0, ext.y1], showgrid: true, gridcolor: theme.grid, zeroline: false,
      tickformat: result.crs.geographic ? '.3f' : ',.0f', scaleanchor: 'x', scaleratio: ratio, constrain: 'domain', ticks: 'outside' },
    separators: '. ',
    shapes, annotations,
  };

  let legend: MapLegend = { kind: 'none' };
  if (legendData) {
    legend = {
      kind: 'classes', title: result.value_label ?? '', log: legendData.log, surface: !!grid, missing: legendData.missing,
      classes: legendData.colors.map((color, k) => ({ color, range: classRange(legendData, k), count: legendData.counts[k] ?? 0 })),
    };
  } else if (result.category_column) {
    legend = { kind: 'categories', title: result.category_column, items: catNames.map(name => ({ name, color: catColor(name), count: pts.filter(p => (p.category ?? NO_DATA) === name).length })) };
  }
  const symbols = valueMode && result.category_column
    ? catNames.map(name => ({ name, symbol: catSymbol(name), count: pts.filter(p => (p.category ?? NO_DATA) === name).length }))
    : [];
  return { data, layout, legend, symbols, classes: legendData };
}

function fmtCoord(v: number, geographic: boolean) {
  return geographic ? v.toFixed(5) : Math.round(v).toLocaleString('en-US').replace(/,/g, ' ');
}
