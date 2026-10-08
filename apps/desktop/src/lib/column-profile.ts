/**
 * Display helpers for the column profile (components/data/ColumnProfileStrip.tsx). Pure formatting: every number
 * comes computed from the engine (data.profile).
 */
import type { ColumnHistogram, ColumnProfile } from './data-api';
import type { Txt } from './i18n';

/** Compact number for a small card: 4 significant digits at most, thousands without decimals. */
export function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 10000) return Math.round(v).toLocaleString('en-US').replace(/,/g, ' ');
  if (a >= 100) return String(Math.round(v * 10) / 10);
  if (a >= 0.01) return String(Number(v.toPrecision(3)));
  return v.toExponential(1);
}

export interface Issue { id: string; label: Txt; tone: 'warn' | 'info' }

/** What deserves attention in a column, most important first. */
export function columnIssues(c: ColumnProfile): Issue[] {
  const out: Issue[] = [];
  if (c.below_lod) out.push({ id: 'lod', tone: 'warn', label: { es: `<LD ${c.below_lod}`, en: `<DL ${c.below_lod}` } });
  if (c.missing) out.push({ id: 'missing', tone: 'warn', label: { es: `faltan ${c.missing}`, en: `${c.missing} missing` } });
  if (c.not_analyzed) out.push({ id: 'na', tone: 'info', label: { es: `N.A. ${c.not_analyzed}`, en: `N.A. ${c.not_analyzed}` } });
  if (c.constant) out.push({ id: 'constant', tone: 'warn', label: { es: 'constante', en: 'constant' } });
  if (c.numeric?.outliers) out.push({ id: 'outliers', tone: 'info', label: { es: `atípicos ${c.numeric.outliers}`, en: `${c.numeric.outliers} outliers` } });
  return out;
}

export const hasIssues = (c: ColumnProfile) => columnIssues(c).length > 0;

/** Horizontal position (0–1) of a value on the histogram, in its own scale; null when it cannot be placed. */
export function histogramMarker(h: ColumnHistogram, value: number | null): number | null {
  if (value === null || h.width <= 0) return null;
  const x = h.scale === 'log10' ? (value > 0 ? Math.log10(value) : null) : value;
  if (x === null) return null;
  const pos = (x - h.start) / (h.width * h.counts.length);
  return Math.min(1, Math.max(0, pos));
}

const ROLE: Record<string, Txt> = {
  major_oxide: { es: 'Óxido', en: 'Oxide' },
  trace_element: { es: 'Traza', en: 'Trace' },
  ree: { es: 'REE', en: 'REE' },
  assay: { es: 'Ensaye', en: 'Assay' },
  ratio: { es: 'Razón', en: 'Ratio' },
  sample_id: { es: 'ID', en: 'ID' },
  hole_id: { es: 'Sondaje', en: 'Hole' },
  row_index: { es: 'Índice', en: 'Index' },
  depth: { es: 'Prof.', en: 'Depth' },
  depth_from: { es: 'Desde', en: 'From' },
  depth_to: { es: 'Hasta', en: 'To' },
  easting: { es: 'Este', en: 'East' },
  northing: { es: 'Norte', en: 'North' },
  elevation: { es: 'Cota', en: 'Elev.' },
  longitude: { es: 'Long.', en: 'Long.' },
  latitude: { es: 'Lat.', en: 'Lat.' },
  categorical: { es: 'Categoría', en: 'Category' },
};
const KIND: Record<ColumnProfile['kind'], Txt> = {
  numeric: { es: 'Número', en: 'Number' },
  text: { es: 'Texto', en: 'Text' },
  datetime: { es: 'Fecha', en: 'Date' },
  boolean: { es: 'Sí/No', en: 'Yes/No' },
  other: { es: 'Otro', en: 'Other' },
};

/** Short chip for a card: the geochemical role when known, otherwise the data type. */
export const roleChip = (role: string | undefined, kind: ColumnProfile['kind']): Txt => (role && ROLE[role]) || KIND[kind];

export const unitLabel = (unit: string | null | undefined): string | null => (unit ? unit : null);

/** Engine bookkeeping columns (null-type flags, sample type, feature id): never shown as data. */
export const isInternalColumn = (name: string) => name.startsWith('_') || name === 'internal_feature_id';

/** How a censored cell is shown in the grid, from its `_nulltype_<column>` flag. */
export function censoredLabel(flag: unknown): Txt | null {
  if (flag === 'BELOW_LOD') return { es: '<LD', en: '<DL' };
  if (flag === 'NOT_ANALYZED') return { es: 'N.A.', en: 'N.A.' };
  return null;
}
