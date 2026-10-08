/**
 * Plotly figure of a section A–A' (Secciones y mapas → Sección). Pure: engine result (maps.section) + settings.
 *
 * Two panels sharing the distance axis:
 * - top, «Perfil»: value of every projected sample against the distance from A (log scale with log classes);
 * - bottom, «Sección»: elevation against distance with the topography, drill-hole traces and the samples coloured by
 *   the SAME classes as the map. Equal scale times the chosen vertical exaggeration.
 * When no sample has an elevation, only the profile is drawn.
 */
import type { Annotations, Data, Layout, Shape } from 'plotly.js';
import { colorClassLegend, MISSING_COLOR, type ColorClassLegend } from './color-classes';
import { classIndex, fmtLimit } from './size-classes';
import type { SectionResult } from './maps-api';
import type { MapSettings } from '../stores/map-store';
import type { ChartTheme } from './chart-theme';
import type { Txt } from './i18n';

export interface SectionContext {
  selection: ReadonlySet<number>;
  dragmode: 'lasso' | 'pan' | 'zoom';
  theme: ChartTheme;
  t: (x: Txt) => string;
  /** Classes of the map, so a colour means the same in the map and in the section. */
  classes: ColorClassLegend | null;
}

export interface SectionFigure { data: Data[]; layout: Partial<Layout>; hasElevation: boolean }

export function buildSection(sec: SectionResult, s: MapSettings, ctx: SectionContext): SectionFigure {
  const { t, theme, selection } = ctx;
  const pts = sec.points;
  const valueMode = !!sec.value_label;
  const legend = valueMode ? ctx.classes ?? colorClassLegend(pts.map(p => p.value), s) : null;
  const colorOf = (v: number | null) => {
    if (!legend) return '#56b4e9';
    if (v === null || !Number.isFinite(v) || (legend.log && v <= 0)) return MISSING_COLOR;
    return legend.colors[classIndex(v, legend.breaks, legend.boundary)];
  };
  const withZ = pts.filter(p => p.z !== null);
  const hasElevation = withZ.length > 0 || !!sec.topography?.some(([, z]) => z !== null);
  const L = sec.line.length;
  const sel = (list: typeof pts) => (selection.size ? list.map((p, i) => (selection.has(p.row_index) ? i : -1)).filter(i => i >= 0) : undefined);
  const hover = (p: (typeof pts)[number]) => [
    `<b>${p.sample_id}</b>${p.hole && p.depth !== null ? ` · ${p.hole} @ ${fmtLimit(p.depth)} m` : ''}`,
    valueMode ? `${sec.value_label}: ${p.value === null ? `<i>${t({ es: 'sin valor', en: 'no value' })}</i>` : fmtLimit(p.value)}` : '',
    `${t({ es: 'Distancia', en: 'Distance' })} ${fmtLimit(p.distance)} m · ${t({ es: 'a', en: 'off' })} ${fmtLimit(Math.abs(p.offset))} m ${p.offset >= 0 ? t({ es: 'a la derecha', en: 'right' }) : t({ es: 'a la izquierda', en: 'left' })}`,
    p.z !== null ? `${t({ es: 'Cota', en: 'Elevation' })} ${fmtLimit(p.z)} m` : '',
  ].filter(Boolean).join('<br>');

  const data: Data[] = [];
  const drill = (p: (typeof pts)[number]) => p.hole !== null;

  // Top: value profile.
  if (valueMode) {
    const prof = pts.filter(p => p.value !== null && (!legend?.log || (p.value ?? 0) > 0)).sort((a, b) => a.distance - b.distance);
    data.push({
      type: 'scatter', mode: 'markers', xaxis: 'x', yaxis: 'y', x: prof.map(p => p.distance), y: prof.map(p => p.value),
      customdata: prof.map(p => p.row_index), hovertext: prof.map(hover), hoverinfo: 'text', name: t({ es: 'Perfil', en: 'Profile' }),
      marker: { color: prof.map(p => colorOf(p.value)), size: Math.max(5, s.pointSize - 2), symbol: prof.map(p => (drill(p) ? 'square' : 'circle')), line: { color: theme.bg, width: 0.6 } },
      selectedpoints: sel(prof), selected: { marker: { opacity: 1 } }, unselected: { marker: { opacity: 0.3 } },
    } as Data);
  }

  // Bottom: elevation section.
  const yb = valueMode ? 'y2' : 'y', xb = valueMode ? 'x2' : 'x';
  if (hasElevation) {
    if (sec.topography?.length) {
      data.push({ type: 'scatter', mode: 'lines', xaxis: xb, yaxis: yb, x: sec.topography.map(([d]) => d), y: sec.topography.map(([, z]) => z),
        line: { color: theme.font, width: 2 }, hoverinfo: 'skip', connectgaps: false, name: t({ es: 'Topografía', en: 'Topography' }) } as Data);
    }
    for (const h of sec.holes) {
      if (h.collar_z === null || h.end_z === null) continue;
      data.push({ type: 'scatter', mode: 'lines', xaxis: xb, yaxis: yb, x: [h.collar_distance, h.end_distance], y: [h.collar_z, h.end_z],
        line: { color: theme.neutral, width: 1.5 }, hoverinfo: 'skip', name: h.hole } as Data);
    }
    data.push({
      type: 'scatter', mode: 'markers', xaxis: xb, yaxis: yb, x: withZ.map(p => p.distance), y: withZ.map(p => p.z),
      customdata: withZ.map(p => p.row_index), hovertext: withZ.map(hover), hoverinfo: 'text', name: t({ es: 'Muestras', en: 'Samples' }),
      marker: { color: withZ.map(p => colorOf(p.value)), size: withZ.map(p => (drill(p) ? s.pointSize + 1 : s.pointSize)), symbol: withZ.map(p => (drill(p) ? 'square' : 'circle')),
        line: { color: theme.bg, width: 0.8 } },
      selectedpoints: sel(withZ), selected: { marker: { opacity: 1 } }, unselected: { marker: { opacity: 0.3 } },
    } as Data);
  }

  const annotations: Partial<Annotations>[] = [];
  const shapes: Partial<Shape>[] = [];
  const endLabel = (x: number, text: string, anchor: 'left' | 'right') => annotations.push({
    xref: 'x', yref: 'paper', x, y: 1, yanchor: 'bottom', xanchor: anchor, text: `<b>${text}</b>`, showarrow: false,
    font: { size: 12, color: theme.bg }, bgcolor: theme.font, borderpad: 3,
  });
  endLabel(0, 'A', 'left'); endLabel(L, "A'", 'right');
  for (const h of sec.holes) {
    if (h.collar_z === null || !hasElevation) continue;
    annotations.push({ xref: xb as 'x', yref: yb as 'y', x: h.collar_distance, y: h.collar_z, text: h.hole, showarrow: false, yshift: 12, font: { size: 10, color: theme.font } });
  }

  const xTitle = `${t({ es: 'Distancia desde A', en: 'Distance from A' })} (m)`;
  const zs = [...withZ.map(p => p.z as number), ...(sec.topography ?? []).flatMap(([, z]) => (z === null ? [] : [z])), ...sec.holes.flatMap(h => [h.collar_z, h.end_z].filter((z): z is number => z !== null))];
  const zr = zs.length ? [Math.min(...zs), Math.max(...zs)] : [0, 1];
  const pad = Math.max((zr[1] - zr[0]) * 0.08, 5);
  const common = { showgrid: true, gridcolor: theme.grid, zeroline: false, ticks: 'outside' as const };
  const layout: Partial<Layout> = {
    margin: { l: 72, r: 16, t: 28, b: 46 }, dragmode: ctx.dragmode, hovermode: 'closest', showlegend: false,
    uirevision: `${sec.dataset_id}:${sec.line.start.join(',')}:${sec.line.end.join(',')}`,
    separators: '. ', annotations, shapes,
  };
  const xr = [-L * 0.02, L * 1.02];
  if (valueMode && hasElevation) {
    Object.assign(layout, {
      xaxis: { ...common, range: xr, domain: [0, 1], anchor: 'y', showticklabels: false },
      yaxis: { ...common, domain: [0.7, 1], title: { text: sec.value_label ?? '' }, type: legend?.log ? 'log' : 'linear', nticks: 4 },
      xaxis2: { ...common, range: xr, matches: 'x', anchor: 'y2', title: { text: xTitle }, tickformat: ',.0f', constrain: 'range' },
      yaxis2: { ...common, domain: [0, 0.6], title: { text: `${t({ es: 'Cota', en: 'Elevation' })} (m)` }, range: [zr[0] - pad, zr[1] + pad],
        scaleanchor: 'x2', scaleratio: s.section?.exaggeration ?? 1, constrain: 'range', tickformat: ',.0f' },
    });
  } else if (valueMode) {
    Object.assign(layout, {
      xaxis: { ...common, range: xr, title: { text: xTitle }, tickformat: ',.0f' },
      yaxis: { ...common, title: { text: sec.value_label ?? '' }, type: legend?.log ? 'log' : 'linear' },
    });
  } else {
    Object.assign(layout, {
      xaxis: { ...common, range: xr, title: { text: xTitle }, tickformat: ',.0f', constrain: 'range' },
      yaxis: { ...common, title: { text: `${t({ es: 'Cota', en: 'Elevation' })} (m)` }, range: [zr[0] - pad, zr[1] + pad],
        scaleanchor: 'x', scaleratio: s.section?.exaggeration ?? 1, constrain: 'range', tickformat: ',.0f' },
    });
  }
  return { data, layout, hasElevation };
}
