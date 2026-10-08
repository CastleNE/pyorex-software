import { REE, type Column } from './data';
import type { PxIconName } from './Icon';
import { useApp, type AreaId, type Win, type WinType } from './store';
import type { Txt } from './i18n';

/* ------------------------------------------------------------------------------------------------
 * Tool catalog for the prototype. Each tool declares what it NEEDS from the dataset (analytes, roles or
 * a capability that does not exist yet); the ribbon derives its state — available / partial / unavailable —
 * from the detected columns, exactly as the registry's allowed_roles / allowed_analytes would in the repo.
 * ---------------------------------------------------------------------------------------------- */

export type Need = 'depth' | 'dem' | 'norm' | 'nextPhase' | 'engine';
export interface ToolDef {
  id: string; label: Txt; icon: PxIconName; tip?: Txt;
  req?: string[];                         // every analyte required
  any?: { of: string[]; min: number };    // at least `min` of these; fewer than all = partial
  opt?: string[];                         // nice to have; missing = partial
  needs?: Need; ref?: string;
  run: () => void;
}
export interface Availability { state: 'ok' | 'partial' | 'off'; missing: string[]; reason?: Txt }

const NEED_TXT: Record<Need, Txt> = {
  depth: { es: 'Requiere columnas de profundidad (From/To) y collar', en: 'Needs depth columns (From/To) and collars' },
  dem: { es: 'Requiere un DEM o sondajes con cota', en: 'Needs a DEM or drillholes with elevation' },
  norm: { es: 'Requiere la norma CIPW (motor Python)', en: 'Needs the CIPW norm (Python engine)' },
  nextPhase: { es: 'Llega en una próxima fase del prototipo', en: 'Coming in a later prototype phase' },
  engine: { es: 'Se calcula en el motor Python; en el prototipo solo se muestra el flujo', en: 'Computed by the Python engine; the prototype shows the flow only' },
};

export function analytesOf(cols: Column[]) { return new Set(cols.filter(c => ['major', 'trace', 'ree', 'precious'].includes(c.role) && c.analyte).map(c => c.analyte!)); }

export function availability(t: ToolDef, cols: Column[]): Availability {
  const have = analytesOf(cols); const roles = new Set(cols.map(c => c.role));
  if (t.needs === 'depth' && !roles.has('depth')) return { state: 'off', missing: [], reason: NEED_TXT.depth };
  if (t.needs === 'dem' || t.needs === 'norm' || t.needs === 'nextPhase') return { state: 'off', missing: [], reason: NEED_TXT[t.needs] };
  const miss = (t.req ?? []).filter(a => !have.has(a));
  if (miss.length) return { state: 'off', missing: miss };
  if (t.any) { const got = t.any.of.filter(a => have.has(a)); const m = t.any.of.filter(a => !have.has(a)); if (got.length < t.any.min) return { state: 'off', missing: m }; if (m.length) return { state: 'partial', missing: m }; }
  const o = (t.opt ?? []).filter(a => !have.has(a)); if (o.length) return { state: 'partial', missing: o };
  if (t.needs === 'engine') return { state: 'partial', missing: [], reason: NEED_TXT.engine };
  return { state: 'ok', missing: [] };
}

/* ---------------- actions ---------------- */
const S = () => useApp.getState();
const W = (type: WinType, opts: Record<string, any>, tt: Txt, geom: Partial<Win> = {}) => () => { S().open(type, { ...opts, tt }, tt.es, geom); };
const say = (t: Txt) => () => S().notify(t[S().lang]);
const ENG = (t: Txt) => say({ es: `${t.es}: se ejecuta en el motor Python (no simulado en el prototipo).`, en: `${t.en}: runs in the Python engine (not simulated in the prototype).` });
const toMap = (p: Record<string, any>, tt: Txt) => () => {
  const s = S(); const m = s.windows.find(w => w.type === 'map');
  if (m) { s.patchWin(m.id, { opts: { ...m.opts, ...p }, min: false }); s.focus(m.id); } else s.open('map', { ...p, tt }, tt.es, { w: 640, h: 520 });
  s.set({ fly: 'layers' });
};
const MAJORS = ['SiO2', 'TiO2', 'Al2O3', 'FeOT', 'MgO', 'CaO', 'Na2O', 'K2O'];
const PM = ['Cs', 'Rb', 'Ba', 'Th', 'U', 'Nb', 'Ta', 'K2O', 'La', 'Ce', 'Pb', 'Pr', 'Sr', 'Nd', 'Zr', 'Sm', 'Eu', 'Ti', 'Dy', 'Y', 'Yb', 'Lu'];

export const TOOLS: Record<string, ToolDef> = {
  /* ---- Data & Analysis ---- */
  import: { id: 'import', label: { es: 'Importar', en: 'Import' }, icon: 'import', run: () => S().set({ wizard: 0 }) },
  lod: { id: 'lod', label: { es: '< LD → ½ LD', en: '< DL → ½ DL' }, icon: 'clean', run: () => { S().log({ icon: 'clean', title: '< LD → ½ LD', detail: 'Ta', code: 'df = px.clean.below_ld(df, method="half")' }); say({ es: 'Tratamiento de < LD registrado en el historial.', en: 'Below-DL treatment logged in history.' })(); } },
  qaqc: { id: 'qaqc', label: { es: 'QA/QC', en: 'QA/QC' }, icon: 'check', needs: 'engine', run: ENG({ es: 'QA/QC de duplicados y estándares', en: 'Duplicates and standards QA/QC' }) },
  calc: { id: 'calc', label: { es: 'Variables y ratios', en: 'Variables & ratios' }, icon: 'code', needs: 'nextPhase', run: () => {} },
  filters: { id: 'filters', label: { es: 'Filtros', en: 'Filters' }, icon: 'filter', run: () => S().set({ fly: 'style' }) },
  table: { id: 'table', label: { es: 'Tabla', en: 'Table' }, icon: 'table', run: W('table', {}, { es: 'Tabla', en: 'Table' }, { w: 720, h: 420 }) },
  stats: { id: 'stats', label: { es: 'Descriptiva', en: 'Descriptive' }, icon: 'stats', run: W('stats', { var: 'Cu' }, { es: 'Estadística descriptiva', en: 'Descriptive statistics' }, { w: 640, h: 260 }) },
  corr: { id: 'corr', label: { es: 'Correlación', en: 'Correlation' }, icon: 'scatter', needs: 'engine', run: ENG({ es: 'Correlación Pearson + Spearman', en: 'Pearson + Spearman correlation' }) },
  pctl: { id: 'pctl', label: { es: 'Percentiles', en: 'Percentiles' }, icon: 'stats', run: W('hist', { var: 'Cu', log: true }, { es: 'Histograma · Cu', en: 'Histogram · Cu' }) },
  groups: { id: 'groups', label: { es: 'Comparar grupos', en: 'Compare groups' }, icon: 'stats', run: W('stats', { var: 'SiO2' }, { es: 'Comparación por sector', en: 'Comparison by sector' }, { w: 640, h: 260 }) },
  pca: { id: 'pca', label: { es: 'PCA', en: 'PCA' }, icon: 'pca', needs: 'engine', run: ENG({ es: 'PCA con KMO/Bartlett', en: 'PCA with KMO/Bartlett' }) },
  kmeans: { id: 'kmeans', label: { es: 'K-means', en: 'K-means' }, icon: 'classify', needs: 'engine', run: ENG({ es: 'K-means', en: 'K-means' }) },
  coda: { id: 'coda', label: { es: 'CoDA (clr/ilr)', en: 'CoDA (clr/ilr)' }, icon: 'norm', needs: 'engine', run: ENG({ es: 'Transformación clr/ilr', en: 'clr/ilr transform' }) },
  scatter: { id: 'scatter', label: { es: 'Dispersión', en: 'Scatter' }, icon: 'scatter', run: W('xy', { x: 'SiO2', y: 'K2O' }, { es: 'Diagrama XY', en: 'XY plot' }) },
  hist: { id: 'hist', label: { es: 'Histograma', en: 'Histogram' }, icon: 'stats', run: W('hist', { var: 'Cu' }, { es: 'Histograma', en: 'Histogram' }) },
  ternary: { id: 'ternary', label: { es: 'Ternario', en: 'Ternary' }, icon: 'ternary', run: W('ternary', {}, { es: 'Ternario AFM', en: 'AFM ternary' }, { w: 460, h: 420 }) },
  downhole: { id: 'downhole', label: { es: 'Downhole', en: 'Downhole' }, icon: 'drill', needs: 'depth', run: () => {} },

  /* ---- Lithogeochemistry ---- */
  tas: { id: 'tas', label: { es: 'TAS', en: 'TAS' }, icon: 'tas', req: ['SiO2', 'Na2O', 'K2O'], ref: 'tas', run: W('tas', { ref: 'tas' }, { es: 'TAS plutónico', en: 'Plutonic TAS' }) },
  qapf: { id: 'qapf', label: { es: 'QAPF', en: 'QAPF' }, icon: 'ternary', needs: 'norm', run: () => {} },
  afm: { id: 'afm', label: { es: 'AFM', en: 'AFM' }, icon: 'ternary', req: ['Na2O', 'K2O', 'FeOT', 'MgO'], ref: 'afm', run: W('ternary', { ref: 'afm' }, { es: 'AFM · Irvine y Baragar', en: 'AFM · Irvine & Baragar' }, { w: 460, h: 420 }) },
  k2o: { id: 'k2o', label: { es: 'K₂O–SiO₂', en: 'K₂O–SiO₂' }, icon: 'scatter', req: ['SiO2', 'K2O'], ref: 'k2o', run: W('xy', { x: 'SiO2', y: 'K2O', ref: 'k2o' }, { es: 'K₂O–SiO₂', en: 'K₂O–SiO₂' }) },
  mali: { id: 'mali', label: { es: 'MALI', en: 'MALI' }, icon: 'scatter', req: ['SiO2', 'Na2O', 'K2O', 'CaO'], ref: 'frost', run: W('xy', { x: 'SiO2', y: 'mali', ref: 'frost' }, { es: 'MALI vs SiO₂', en: 'MALI vs SiO₂' }) },
  feidx: { id: 'feidx', label: { es: 'Fe-index', en: 'Fe-index' }, icon: 'scatter', req: ['SiO2', 'FeOT', 'MgO'], ref: 'frost', run: W('xy', { x: 'SiO2', y: 'feidx', ref: 'frost' }, { es: 'Fe-index vs SiO₂', en: 'Fe-index vs SiO₂' }) },
  shand: { id: 'shand', label: { es: 'Shand', en: 'Shand' }, icon: 'classify', req: ['Al2O3', 'CaO', 'Na2O', 'K2O'], ref: 'shand', run: W('xy', { x: 'acnk', y: 'ank', ref: 'shand' }, { es: 'Shand · A/CNK vs A/NK', en: 'Shand · A/CNK vs A/NK' }) },
  acnk: { id: 'acnk', label: { es: 'A/CNK', en: 'A/CNK' }, icon: 'stats', req: ['Al2O3', 'CaO', 'Na2O', 'K2O'], ref: 'shand', run: W('hist', { var: 'acnk', log: false }, { es: 'A/CNK', en: 'A/CNK' }) },
  ank: { id: 'ank', label: { es: 'A/NK', en: 'A/NK' }, icon: 'stats', req: ['Al2O3', 'Na2O', 'K2O'], ref: 'shand', run: W('hist', { var: 'ank', log: false }, { es: 'A/NK', en: 'A/NK' }) },
  harker: { id: 'harker', label: { es: 'Harker', en: 'Harker' }, icon: 'scatter', req: MAJORS, run: W('xy', { x: 'SiO2', y: 'MgO' }, { es: 'Harker · SiO₂ vs MgO', en: 'Harker · SiO₂ vs MgO' }) },
  ree: { id: 'ree', label: { es: 'REE', en: 'REE' }, icon: 'spider', any: { of: [...REE], min: 8 }, ref: 'ree', run: W('spider', { ref: 'ree' }, { es: 'Spider REE · condrito', en: 'REE spider · chondrite' }) },
  multi: { id: 'multi', label: { es: 'Spider', en: 'Spider' }, icon: 'spider', any: { of: PM, min: 10 }, ref: 'ree', run: W('spider', { ref: 'ree', mode: 'envelope' }, { es: 'Multielementos · manto primitivo', en: 'Multi-element · primitive mantle' }) },
  pearce: { id: 'pearce', label: { es: 'Pearce', en: 'Pearce' }, icon: 'scatter', req: ['Rb', 'Y', 'Nb'], run: () => {} },
  eu: { id: 'eu', label: { es: 'Eu/Eu*', en: 'Eu/Eu*' }, icon: 'stats', req: ['Sm', 'Eu', 'Gd'], ref: 'eu', run: W('xy', { x: 'SiO2', y: 'eu', ref: 'eu' }, { es: 'Eu/Eu* vs SiO₂', en: 'Eu/Eu* vs SiO₂' }) },
  ce: { id: 'ce', label: { es: 'Ce/Ce*', en: 'Ce/Ce*' }, icon: 'stats', req: ['La', 'Ce', 'Pr'], run: W('xy', { x: 'SiO2', y: 'ce' }, { es: 'Ce/Ce* vs SiO₂', en: 'Ce/Ce* vs SiO₂' }) },
  builder: { id: 'builder', label: { es: 'Diagram Builder', en: 'Diagram Builder' }, icon: 'sliders', run: () => S().open('builder', { n: Date.now(), tt: { es: 'Diagram Builder', en: 'Diagram Builder' } }, 'Diagram Builder', { w: 900, h: 560 }) },
  mine: { id: 'mine', label: { es: 'Mis diagramas', en: 'My diagrams' }, icon: 'project', run: () => { const d = S().diagrams; if (!d.length) { say({ es: 'Aún no hay diagramas guardados. Crea uno con Diagram Builder y pulsa «Guardar versión».', en: 'No saved diagrams yet. Create one with Diagram Builder and press “Save version”.' })(); return; } const last = d[d.length - 1]; S().open('builder', { n: Date.now(), b: { ...last.def, version: last.version + 1 }, edit: false, tt: { es: `${last.def.name} · v${last.version}`, en: `${last.def.name} · v${last.version}` } }, last.def.name, { w: 900, h: 560 }); } },

  /* ---- Mineral Exploration ---- */
  sry: { id: 'sry', label: { es: 'Sr/Y', en: 'Sr/Y' }, icon: 'scatter', req: ['Sr', 'Y'], ref: 'sry', run: W('xy', { x: 'Y', y: 'sry', ref: 'sry' }, { es: 'Sr/Y vs Y', en: 'Sr/Y vs Y' }) },
  layb: { id: 'layb', label: { es: 'La/Yb', en: 'La/Yb' }, icon: 'scatter', req: ['La', 'Yb'], ref: 'sry', run: W('xy', { x: 'SiO2', y: 'layb', ref: 'sry' }, { es: '(La/Yb)N vs SiO₂', en: '(La/Yb)N vs SiO₂' }) },
  dyyb: { id: 'dyyb', label: { es: 'Dy/Yb', en: 'Dy/Yb' }, icon: 'scatter', req: ['Dy', 'Yb'], run: W('xy', { x: 'SiO2', y: 'dyyb' }, { es: '(Dy/Yb)N vs SiO₂', en: '(Dy/Yb)N vs SiO₂' }) },
  vsc: { id: 'vsc', label: { es: 'V/Sc', en: 'V/Sc' }, icon: 'scatter', req: ['V', 'Sc'], ref: 'sry', run: () => {} },
  eu2: { id: 'eu2', label: { es: 'Eu/Eu*', en: 'Eu/Eu*' }, icon: 'stats', req: ['Sm', 'Eu', 'Gd'], ref: 'eu', run: () => TOOLS.eu.run() },
  cumo: { id: 'cumo', label: { es: 'Cu/Mo', en: 'Cu/Mo' }, icon: 'scatter', req: ['Cu', 'Mo'], run: W('xy', { x: 'Cu', y: 'Mo', logX: true, logY: true }, { es: 'Cu vs Mo', en: 'Cu vs Mo' }) },
  aiccpi: { id: 'aiccpi', label: { es: 'AI–CCPI', en: 'AI–CCPI' }, icon: 'scatter', req: ['MgO', 'K2O', 'CaO', 'Na2O', 'FeOT'], ref: 'alt', run: W('xy', { x: 'ai', y: 'ccpi', ref: 'alt' }, { es: 'Alteración · AI vs CCPI', en: 'Alteration · AI vs CCPI' }) },
  ai: { id: 'ai', label: { es: 'Ishikawa AI', en: 'Ishikawa AI' }, icon: 'stats', req: ['MgO', 'K2O', 'CaO', 'Na2O'], ref: 'alt', run: W('hist', { var: 'ai', log: false }, { es: 'Índice de Ishikawa', en: 'Ishikawa index' }) },
  ccpi: { id: 'ccpi', label: { es: 'CCPI', en: 'CCPI' }, icon: 'stats', req: ['MgO', 'FeOT', 'Na2O', 'K2O'], ref: 'alt', run: W('hist', { var: 'ccpi', log: false }, { es: 'CCPI', en: 'CCPI' }) },
  anom: { id: 'anom', label: { es: 'Anomalías', en: 'Anomalies' }, icon: 'anomaly', req: ['Cu'], run: () => { S().setStyle(s => ({ ...s, color: { ...s.color, mode: 'value', valueVar: 'Cu', ramp: 'geochem', method: 'quantile', n: 5, log: true, manual: null } })); W('hist', { var: 'Cu', log: true }, { es: 'Anomalías · Cu', en: 'Anomalies · Cu' })(); say({ es: 'Color por Cu en cuantiles (log). Arrastra los cortes en el Editor para fijar umbrales.', en: 'Colour by Cu quantiles (log). Drag the breaks in the Style panel to set thresholds.' })(); S().set({ fly: 'style' }); } },
  assoc: { id: 'assoc', label: { es: 'Asociaciones', en: 'Associations' }, icon: 'classify', needs: 'engine', run: ENG({ es: 'Asociaciones (K-means)', en: 'Associations (K-means)' }) },
  vector: { id: 'vector', label: { es: 'Vectores', en: 'Vectors' }, icon: 'magnet', needs: 'nextPhase', run: () => {} },
  models: { id: 'models', label: { es: 'Modelos', en: 'Models' }, icon: 'cube', run: W('models', {}, { es: 'Modelos de depósito', en: 'Deposit models' }, { w: 560, h: 440 }) },

  /* ---- Sections & Maps ---- */
  map: { id: 'map', label: { es: 'Mapa', en: 'Map' }, icon: 'map', run: W('map', {}, { es: 'Mapa de muestras', en: 'Sample map' }, { w: 640, h: 520 }) },
  mlayers: { id: 'mlayers', label: { es: 'Capas', en: 'Layers' }, icon: 'layers', run: () => S().set({ fly: 'layers' }) },
  dem: { id: 'dem', label: { es: 'Importar DEM/geología', en: 'Import DEM/geology' }, icon: 'import', run: () => S().set({ wizard: 0 }) },
  surface: { id: 'surface', label: { es: 'Superficie', en: 'Surface' }, icon: 'density', ref: 'idw', run: toMap({ surface: true, ref: 'idw' }, { es: 'Mapa · superficie', en: 'Map · surface' }) },
  contours: { id: 'contours', label: { es: 'Contornos', en: 'Contours' }, icon: 'hull', run: toMap({ surface: true, contours: true, ref: 'idw' }, { es: 'Mapa · contornos', en: 'Map · contours' }) },
  outlines: { id: 'outlines', label: { es: 'Outlines', en: 'Outlines' }, icon: 'anomaly', run: toMap({ outlines: true, ref: 'idw' }, { es: 'Mapa · outlines', en: 'Map · outlines' }) },
  section: { id: 'section', label: { es: 'Sección A–A′', en: 'Section A–A′' }, icon: 'splice', ref: 'section', run: () => { S().set({ showSection: true }); S().open('section', { tt: { es: 'Sección A–A′', en: 'Section A–A′' } }, 'Sección A–A′', { w: 780, h: 480 }); } },
  sondajes: { id: 'sondajes', label: { es: 'Sondajes', en: 'Drillholes' }, icon: 'drill', run: () => { const s = S(); const w = s.windows.find(x => x.type === 'section'); if (w) { const sc = { ...(w.opts.sc ?? {}), holes: !(w.opts.sc?.holes ?? true) }; s.patchWin(w.id, { opts: { ...w.opts, sc } }); s.focus(w.id); } else TOOLS.section.run(); } },
  drawsec: { id: 'drawsec', label: { es: 'Dibujar A–A′', en: 'Draw A–A′' }, icon: 'pointer', run: () => { S().set({ drawSection: true, showSection: true }); if (!S().windows.some(w => w.type === 'map')) TOOLS.map.run(); say({ es: 'Haz clic en el mapa para A y luego para A′.', en: 'Click the map for A, then for A′.' })(); } },
  zdem: { id: 'zdem', label: { es: 'Cota desde DEM', en: 'Elevation from DEM' }, icon: 'map', run: () => S().set({ wizard: 2 }) },
};

export type RibbonItem = string | string[];
export const AREA_RIBBON: Record<AreaId, { name: Txt; items: RibbonItem[]; cat?: string }[]> = {
  data: [
    { name: { es: 'Datos', en: 'Data' }, items: ['import', 'table', ['lod', 'qaqc', 'calc'], ['filters']] },
    { name: { es: 'Estadística', en: 'Statistics' }, items: ['stats', ['corr', 'pctl', 'groups']] },
    { name: { es: 'Multivariado', en: 'Multivariate' }, items: ['pca', ['kmeans', 'coda']] },
    { name: { es: 'Gráficos', en: 'Charts' }, items: ['scatter', 'hist', ['ternary', 'downhole']] },
  ],
  litho: [
    { name: { es: 'Clasificación', en: 'Classification' }, items: ['tas', 'qapf'], cat: 'class' },
    { name: { es: 'Series magmáticas', en: 'Magmatic series' }, items: ['afm', ['k2o', 'mali', 'feidx']], cat: 'series' },
    { name: { es: 'Alúmina', en: 'Alumina' }, items: ['shand', ['acnk', 'ank']], cat: 'alumina' },
    { name: { es: 'Variación', en: 'Variation' }, items: ['harker'], cat: 'variation' },
    { name: { es: 'Tectónica', en: 'Tectonics' }, items: ['gal:tect'], cat: 'tect' },
    { name: { es: 'Trazas y normalización', en: 'Trace & normalization' }, items: ['ree', 'multi', ['pearce', 'eu', 'ce']], cat: 'trace' },
    { name: { es: 'Petrogénesis', en: 'Petrogenesis' }, items: ['gal:petro'], cat: 'petro' },
    { name: { es: 'Construir', en: 'Build' }, items: ['builder', ['mine']] },
  ],
  explo: [
    { name: { es: 'Fertilidad', en: 'Fertility' }, items: ['sry', ['layb', 'dyyb', 'vsc'], ['eu2', 'cumo']], cat: 'fert' },
    { name: { es: 'Alteración', en: 'Alteration' }, items: ['aiccpi', ['ai', 'ccpi']], cat: 'alt' },
    { name: { es: 'Pathfinders', en: 'Pathfinders' }, items: ['anom', ['assoc']], cat: 'path' },
    { name: { es: 'Vectorización', en: 'Vectoring' }, items: ['vector'] },
    { name: { es: 'Modelos de depósito', en: 'Deposit models' }, items: ['models', 'gal:models'], cat: 'models' },
  ],
  maps: [
    { name: { es: 'Mapa', en: 'Map' }, items: ['map', ['mlayers', 'dem']] },
    { name: { es: 'Interpolación', en: 'Interpolation' }, items: ['surface'] },
    { name: { es: 'Contornos', en: 'Contours' }, items: ['contours'] },
    { name: { es: 'Outlines', en: 'Outlines' }, items: ['outlines'] },
    { name: { es: 'Secciones', en: 'Sections' }, items: ['section', ['drawsec', 'sondajes', 'zdem']] },
  ],
};

export const DEPOSIT_MODELS: { id: string; name: Txt; tools: string[]; note: Txt }[] = [
  { id: 'porphyry', name: { es: 'Pórfido Cu–Mo–Au', en: 'Porphyry Cu–Mo–Au' }, tools: ['sry', 'vsc', 'eu2', 'layb', 'cumo', 'aiccpi', 'surface'], note: { es: 'Fertilidad del magma, alteración y zonación de metales', en: 'Magma fertility, alteration and metal zoning' } },
  { id: 'epithermal', name: { es: 'Epitermal', en: 'Epithermal' }, tools: ['anom', 'assoc', 'aiccpi', 'surface'], note: { es: 'Pathfinders (As, Sb, Hg) y alteración argílica', en: 'Pathfinders (As, Sb, Hg) and argillic alteration' } },
  { id: 'iocg', name: { es: 'IOCG', en: 'IOCG' }, tools: ['anom', 'cumo', 'surface'], note: { es: 'Cu–Au con Fe, REE y U', en: 'Cu–Au with Fe, REE and U' } },
  { id: 'vms', name: { es: 'VMS', en: 'VMS' }, tools: ['aiccpi', 'ai', 'ccpi', 'surface'], note: { es: 'Alteration box plot y halos de alteración', en: 'Alteration box plot and alteration halos' } },
  { id: 'irgs', name: { es: 'IRGS', en: 'IRGS' }, tools: ['tas', 'shand', 'anom'], note: { es: 'Intrusivos reducidos con Au–Bi–Te', en: 'Reduced intrusions with Au–Bi–Te' } },
  { id: 'sedcu', name: { es: 'Cu sedimentario', en: 'Sediment-hosted Cu' }, tools: ['anom', 'surface', 'section'], note: { es: 'Zonación lateral Cu–Pb–Zn', en: 'Lateral Cu–Pb–Zn zoning' } },
];

/** Style contextual tab applies to these window types. */
export const PLOT_TYPES: WinType[] = ['tas', 'xy', 'map', 'ternary', 'spider', 'hist', 'vector', 'builder', 'section'];
