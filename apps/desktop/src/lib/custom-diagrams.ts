/**
 * Diagram Builder (Phase 4): diagrams defined by the user. Every axis is a free expression over the dataset columns
 * (Sr/Y, La/Yb, log10(Cu_ppm), (Na2O_pct+K2O_pct)/Al2O3_pct…), XY or ternary, with optional classification fields
 * (polygons in data coordinates). The expressions are validated and evaluated in Python
 * (services/analytics/analysis/geochemistry/custom_diagram.py) through the same `geochemistry.compute` pipeline as the
 * built-in tools, with tool id 'custom-diagram' and the definition in `config.diagram`, so windows, layers, classes,
 * size/colour classes, sessions and exports work unchanged.
 *
 * This module only holds the definition format, its validation, templates and the library file format.
 */
import type { AreaId } from './geochem-areas';
import type { GeoColumn, GeoConfig, GeoTool } from './geochemistry-api';

export const CUSTOM_TOOL_ID = 'custom-diagram';
/** Catalog entry the frontend adds for user diagrams (the backend catalog only lists built-in tools). */
export const CUSTOM_TOOL: GeoTool = {
  id: CUSTOM_TOOL_ID, label: 'Diagrama propio', group: 'diagrams', inputs: [], kind: 'scatter', unit: 'raw',
  formula: 'Ejes definidos por expresiones del usuario', reference: '', optional_inputs: false,
};

export interface DiagramField { id: string; name: string; points: number[][] }
/** Exactly what the backend accepts (DiagramSpec, extra fields forbidden). */
export interface DiagramSpec {
  id: string; name: string; kind: 'xy' | 'ternary';
  x: string; y: string; z: string | null;
  x_label: string | null; y_label: string | null; z_label: string | null;
  fields: DiagramField[]; reference: string;
}
/** A diagram in the user's library: the spec plus where it appears and its default axes. */
export interface DiagramDef { spec: DiagramSpec; area: AreaId; folder: string; logX: boolean; logY: boolean; updated: string }

export const LIBRARY_FORMAT = 'pyorex.diagrams';
export const LIBRARY_VERSION = 1;
export const DIAGRAM_AREAS: AreaId[] = ['data', 'litho', 'explo'];
const MAX_EXPR = 500;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const optStr = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : null);
let seq = 0;
export const newDiagramId = () => `d${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Defensive parse of a spec from storage, a project or an imported file; null when it is not usable. */
export function sanitizeSpec(raw: unknown): DiagramSpec | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id, 80), name = str(raw.name, 120).trim(), x = str(raw.x, MAX_EXPR).trim(), y = str(raw.y, MAX_EXPR).trim();
  if (!id || !name || !x || !y) return null;
  const kind = raw.kind === 'ternary' ? 'ternary' : 'xy';
  const z = optStr(raw.z, MAX_EXPR);
  if (kind === 'ternary' && !z) return null;
  const fields = Array.isArray(raw.fields) ? raw.fields.flatMap((f): DiagramField[] => {
    if (!isRecord(f) || !Array.isArray(f.points)) return [];
    const dims = kind === 'ternary' ? 3 : 2;   // XY vertices are [x, y]; ternary vertices are [A, B, C]
    const points = f.points.filter((p): p is number[] => Array.isArray(p) && p.length === dims && p.every(n => typeof n === 'number' && Number.isFinite(n))).slice(0, 200);
    const fid = str(f.id, 40) || newDiagramId().slice(0, 12), fname = str(f.name, 120).trim();
    return points.length >= 3 && fname ? [{ id: fid, name: fname, points }] : [];
  }).slice(0, 60) : [];
  return { id, name, kind, x, y, z: kind === 'ternary' ? z : null, x_label: optStr(raw.x_label, 120), y_label: optStr(raw.y_label, 120), z_label: optStr(raw.z_label, 120),
    fields, reference: str(raw.reference, 600) };
}

export function sanitizeDef(raw: unknown): DiagramDef | null {
  if (!isRecord(raw)) return null;
  const spec = sanitizeSpec(raw.spec);
  if (!spec) return null;
  const area = DIAGRAM_AREAS.includes(raw.area as AreaId) ? raw.area as AreaId : 'litho';
  return { spec, area, folder: str(raw.folder, 60).trim(), logX: raw.logX === true && spec.kind === 'xy', logY: raw.logY === true && spec.kind === 'xy', updated: str(raw.updated, 40) };
}

/** Engine configuration that draws a library diagram (columns/units are not used by user diagrams). */
export function configFor(def: DiagramDef, base?: GeoConfig | null): GeoConfig {
  return {
    tool: CUSTOM_TOOL_ID, columns: {}, units: {}, iron_basis: 'FeOT', include_qaqc: base?.include_qaqc ?? false,
    log_x: def.logX, log_y: def.logY, group_column: base?.group_column ?? null, label_column: base?.label_column ?? null,
    size_column: base?.size_column ?? null, color_column: base?.color_column ?? null, diagram: def.spec,
  };
}

/** One vertex per line: "x, y" (XY) or "A, B, C" (ternary); also separated by spaces or ";". Returns the points, or
 * the 1-based line that could not be read. */
export function parseVertices(text: string, dims: 2 | 3 = 2): { points: number[][] } | { badLine: number } {
  const points: number[][] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim(); if (!line) continue;
    const parts = line.split(/[\s,;\t]+/).filter(Boolean).map(Number);
    if (parts.length !== dims || parts.some(n => !Number.isFinite(n))) return { badLine: i + 1 };
    points.push(parts);
  }
  return { points };
}
export const formatVertices = (points: number[][]) => points.map(p => p.join(', ')).join('\n');

/**
 * Turns a lasso drawn on the chart into a field outline: rounds to 4 significant digits and keeps at most `max`
 * vertices (Ramer–Douglas–Peucker in the scale of the axes, so a log axis is simplified in log space).
 */
export function simplifyOutline(raw: number[][], opts: { logX?: boolean; logY?: boolean; max?: number } = {}): number[][] {
  const max = opts.max ?? 40;
  const pts = raw.filter(p => p.every(Number.isFinite) && (!opts.logX || p[0] > 0) && (!opts.logY || p[1] > 0));
  // A closed lasso repeats its first vertex at the end; a polygon does not need it.
  if (pts.length > 3 && pts[0].every((v, k) => v === pts[pts.length - 1][k])) pts.pop();
  if (pts.length <= 3) return pts.map(p => p.map(v => +v.toPrecision(4)));
  const sp = pts.map(p => [opts.logX ? Math.log10(p[0]) : p[0], opts.logY ? Math.log10(p[1]) : p[1]]);
  const span = (k: number) => Math.max(...sp.map(p => p[k])) - Math.min(...sp.map(p => p[k])) || 1;
  const sx = span(0), sy = span(1);
  const dist = (p: number[], a: number[], b: number[]) => {
    const [px, py, ax, ay, bx, by] = [p[0] / sx, p[1] / sy, a[0] / sx, a[1] / sy, b[0] / sx, b[1] / sy];
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  const rdp = (idx: number[], eps: number): number[] => {
    if (idx.length <= 2) return idx;
    let best = 0, at = 0;
    for (let k = 1; k < idx.length - 1; k++) { const d = dist(sp[idx[k]], sp[idx[0]], sp[idx[idx.length - 1]]); if (d > best) { best = d; at = k; } }
    return best > eps ? [...rdp(idx.slice(0, at + 1), eps).slice(0, -1), ...rdp(idx.slice(at), eps)] : [idx[0], idx[idx.length - 1]];
  };
  // Closed ring: simplify from the first vertex back to itself, then drop the repeated end.
  const ring = [...sp.map((_, i) => i), 0];
  const simplify = (eps: number) => rdp(ring, eps).slice(0, -1);
  let eps = 0.005, kept = simplify(eps);
  while (kept.length > max && eps < 1) { eps *= 1.6; kept = simplify(eps); }
  if (kept.length < 3) kept = [0, Math.floor(pts.length / 3), Math.floor((2 * pts.length) / 3)];
  return kept.map(i => pts[i].map(v => +v.toPrecision(4)));
}

/** Point of the ternary frame (x = C − B, y = A, sum 100) → [A, B, C] percentages, clamped inside the triangle. */
export function ternaryFromCartesian(x: number, y: number): number[] {
  const raw = [y, (100 - y - x) / 2, (100 - y + x) / 2].map(v => Math.max(0, v));
  const sum = raw[0] + raw[1] + raw[2] || 1;
  return raw.map(v => +((100 * v) / sum).toPrecision(4));
}

/** Column reference as it must be written in an expression: bare when it is an identifier, else [bracketed]. */
export const columnRef = (name: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !/^(log10|log|sqrt|abs|exp|IF)$/.test(name) ? name : `[${name}]`);
export const EXPRESSION_FUNCTIONS = ['log10', 'log', 'sqrt', 'abs', 'exp'] as const;

/** Analyte of a column name (Sr_ppm → sr, "La (ppm)" → la), used to adapt templates to the dataset's columns. */
const analyteOf = (name: string) => name.toLowerCase().replace(/(?:[_\s(\[]?(?:wt%|wtpct|pct|ppm|ppb|%)[)\]]?)$/, '').replace(/[^a-z0-9]/g, '');

export interface DiagramTemplate { id: string; name: string; kind: 'xy' | 'ternary'; x: string; y: string; z?: string; logX?: boolean; logY?: boolean; area: AreaId; folder: string }
/** Starting points without classification fields (add the fields of your own reference). {El} = column of element El. */
export const TEMPLATES: DiagramTemplate[] = [
  { id: 'sry-y', name: 'Sr/Y vs Y', kind: 'xy', x: '{Y}', y: '{Sr}/{Y}', area: 'explo', folder: 'Fertilidad' },
  { id: 'layb-yb', name: 'La/Yb vs Yb', kind: 'xy', x: '{Yb}', y: '{La}/{Yb}', area: 'explo', folder: 'Fertilidad' },
  { id: 'rb-ynb', name: 'Rb vs Y+Nb', kind: 'xy', x: '{Y}+{Nb}', y: '{Rb}', logX: true, logY: true, area: 'litho', folder: 'Discriminación tectónica' },
  { id: 'alk-ratio', name: 'K2O/Na2O vs SiO2', kind: 'xy', x: '{SiO2}', y: '{K2O}/{Na2O}', area: 'litho', folder: 'Series' },
];
/** Replace {El} by the dataset column of that analyte (bare element name when the dataset has none). */
export function adaptTemplate(expr: string, columns: GeoColumn[]): string {
  const numeric = columns.filter(c => c.numeric);
  return expr.replace(/\{([A-Za-z0-9]+)\}/g, (_, el: string) => {
    const hit = numeric.find(c => analyteOf(c.name) === el.toLowerCase());
    return hit ? columnRef(hit.name) : el;
  });
}

export function blankDef(area: AreaId): DiagramDef {
  return { spec: { id: newDiagramId(), name: '', kind: 'xy', x: '', y: '', z: null, x_label: null, y_label: null, z_label: null, fields: [], reference: '' },
    area, folder: '', logX: false, logY: false, updated: '' };
}

/** Library file (export/import, to share diagrams between computers or people). */
export interface LibraryFile { format: typeof LIBRARY_FORMAT; version: number; exported_at: string; diagrams: DiagramDef[] }
export const libraryFile = (diagrams: DiagramDef[], now = new Date()): LibraryFile => ({ format: LIBRARY_FORMAT, version: LIBRARY_VERSION, exported_at: now.toISOString(), diagrams });
export function parseLibraryFile(text: string): DiagramDef[] {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('El archivo no es JSON válido'); }
  if (!isRecord(raw) || raw.format !== LIBRARY_FORMAT) throw new Error('No es una biblioteca de diagramas de PyOreX');
  if (typeof raw.version !== 'number' || raw.version > LIBRARY_VERSION) throw new Error(`Versión no soportada: ${String(raw.version)}`);
  if (!Array.isArray(raw.diagrams)) throw new Error('El archivo no contiene diagramas');
  return raw.diagrams.map(sanitizeDef).filter((d): d is DiagramDef => !!d);
}
