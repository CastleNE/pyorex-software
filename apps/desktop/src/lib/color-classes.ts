/**
 * Colour by value with user classes ("Color por valor"): the colour column (Editor → color_column) is split into 2–20
 * classes with exactly the same rules as the size classes (lib/size-classes.ts: quantiles, equal intervals, Jenks,
 * 1-2-5 series, own percentiles or own values, boundary up/down, log10) and each class takes a colour from a ramp, or
 * a colour the user picked for that class. Values without data are grey. Presentation only.
 */
import { classLegend, type ClassLegend, type ClassSettings, type SizeBoundary, type SizeMethod } from './size-classes';

/** Colour ramps sampled evenly for the class count (stops interpolated in RGB). */
export const COLOR_RAMPS = {
  rainbow: ['#2c3fbf', '#1f9fe0', '#2cc56f', '#e6dc2e', '#f18a24', '#d42a1f'],
  viridis: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'],
  inferno: ['#000004', '#420a68', '#932667', '#dd513a', '#fca50a', '#fcffa4'],
  heat: ['#fff5c4', '#fec44f', '#fe9929', '#ec7014', '#cc4c02', '#8c2d04'],
  blues: ['#deebf7', '#9ecae1', '#6baed6', '#3182bd', '#08519c', '#08306b'],
  earth: ['#8c510a', '#bf812d', '#dfc27d', '#80cdc1', '#35978f', '#01665e'],
  diverging: ['#2166ac', '#67a9cf', '#d1e5f0', '#fddbc7', '#ef8a62', '#b2182b'],
} as const;
export type ColorRamp = keyof typeof COLOR_RAMPS;
export const COLOR_RAMP_NAMES = Object.keys(COLOR_RAMPS) as ColorRamp[];
export const MISSING_COLOR = '#a1a1aa';

export interface ColorClassSettings {
  colorClasses: number; colorMethod: SizeMethod; colorBreaks: number[] | null; colorPercentiles: number[] | null;
  colorLog: boolean; colorBoundary: SizeBoundary; colorRamp: ColorRamp; colorReverse: boolean;
  /** Colours picked by the user, one per class; used only while the class count matches. */
  colorCustom: string[] | null;
}
export const colorClassSettings = (s: ColorClassSettings): ClassSettings =>
  ({ classes: s.colorClasses, method: s.colorMethod, breaks: s.colorBreaks, percentiles: s.colorPercentiles, log: s.colorLog, boundary: s.colorBoundary });

const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => `#${rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
export const isHexColor = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/** n colours evenly spread along a ramp (first and last stops included). */
export function rampColors(ramp: ColorRamp, n: number, reverse = false): string[] {
  const stops = [...(COLOR_RAMPS[ramp] ?? COLOR_RAMPS.rainbow)];
  if (reverse) stops.reverse();
  if (n <= 1) return [stops[Math.floor(stops.length / 2)]];
  return Array.from({ length: n }, (_, k) => {
    const pos = (k / (n - 1)) * (stops.length - 1), a = Math.floor(pos), b = Math.min(stops.length - 1, a + 1), f = pos - a;
    const [ca, cb] = [hex(stops[a]), hex(stops[b])];
    return toHex(ca.map((v, i) => v + (cb[i] - v) * f));
  });
}

export interface ColorClassLegend extends ClassLegend { colors: string[] }

/** Limits, colour and sample count per class, and values left out. */
export function colorClassLegend(values: (number | null | undefined)[], s: ColorClassSettings): ColorClassLegend {
  const l = classLegend(values, colorClassSettings(s));
  const n = l.counts.length;
  const colors = s.colorCustom && s.colorCustom.length === n && s.colorCustom.every(isHexColor) ? [...s.colorCustom] : rampColors(s.colorRamp, n, s.colorReverse);
  return { ...l, colors };
}
