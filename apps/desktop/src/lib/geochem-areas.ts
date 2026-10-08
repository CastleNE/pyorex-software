/**
 * Geoquímica in four areas (Data & Analysis · Lithogeochemistry · Mineral Exploration · Sections & Maps).
 *
 * The backend Tool Registry stays canonical: its `module`/`family` values are never renamed. This file only decides,
 * on the frontend, WHERE each registry tool appears on the ribbon (area + group), plus the few workspace views that
 * are not registry tools yet (table/preparation, statistics, PCA, K-means, anomalies, IDW isovalues). Only tools that
 * exist are listed — no buttons for capabilities that are not implemented.
 */
import type { GeoGroup, GeoRegistry, GeoRegistryTool } from './geochemistry-api';
import type { PxIconName } from '../components/PxIcon';
import type { Txt } from './i18n';
import { toolLabel } from './tool-labels';

export type AreaId = 'data' | 'litho' | 'explo' | 'maps';
export const AREAS: AreaId[] = ['data', 'litho', 'explo', 'maps'];

export type DataAction = 'prepare' | 'descriptive-statistics' | 'correlation-analysis' | 'principal-component-analysis' | 'history';
export type ExploreTool = 'anomalies' | 'kmeans' | 'isovalues' | 'pca';
export type MapMode = 'samples';
export type GeoView = { kind: 'tool'; toolId: string } | { kind: 'data'; action: DataAction } | { kind: 'explore'; tool: ExploreTool } | { kind: 'map'; mode: MapMode };

export interface RibbonGroupDef { id: string; area: AreaId; name: Txt }
export const RIBBON_GROUPS: RibbonGroupDef[] = [
  { id: 'prepare', area: 'data', name: { es: 'Datos', en: 'Data' } },
  { id: 'qaqc', area: 'data', name: { es: 'QA/QC', en: 'QA/QC' } },
  { id: 'stats', area: 'data', name: { es: 'Estadística', en: 'Statistics' } },
  { id: 'multi', area: 'data', name: { es: 'Multivariado', en: 'Multivariate' } },
  { id: 'charts', area: 'data', name: { es: 'Gráficos', en: 'Charts' } },
  { id: 'class', area: 'litho', name: { es: 'Clasificación', en: 'Classification' } },
  { id: 'series', area: 'litho', name: { es: 'Series magmáticas', en: 'Magmatic series' } },
  { id: 'alumina', area: 'litho', name: { es: 'Alúmina', en: 'Alumina' } },
  { id: 'variation', area: 'litho', name: { es: 'Variación', en: 'Variation' } },
  { id: 'trace', area: 'litho', name: { es: 'Trazas y normalización', en: 'Trace & normalization' } },
  { id: 'fert', area: 'explo', name: { es: 'Fertilidad', en: 'Fertility' } },
  { id: 'alt', area: 'explo', name: { es: 'Alteración', en: 'Alteration' } },
  { id: 'path', area: 'explo', name: { es: 'Pathfinders', en: 'Pathfinders' } },
  { id: 'maps', area: 'maps', name: { es: 'Mapas', en: 'Maps' } },
];

/** Canonical registry (module/family) → ribbon group. */
const PLACEMENT: Record<string, string> = {
  'data_analysis/geochemistry': 'prepare', 'data_analysis/qaqc': 'qaqc',
  'diagrams/distribution': 'charts', 'diagrams/xy': 'charts', 'diagrams/compositional': 'charts', 'diagrams/profiles': 'charts',
  'lithogeochemistry/classification': 'class', 'lithogeochemistry/magmatic_series': 'series', 'lithogeochemistry/calculations': 'alumina',
  'lithogeochemistry/variation': 'variation', 'lithogeochemistry/normalization': 'trace',
  'exploration/fertility': 'fert', 'exploration/alteration': 'alt',
};
/** A family the frontend does not know yet still appears, in its module's default group. */
const MODULE_FALLBACK: Record<string, string> = { data_analysis: 'prepare', diagrams: 'charts', lithogeochemistry: 'trace', exploration: 'path' };

export const groupOf = (id: string) => RIBBON_GROUPS.find(g => g.id === id);
export function placeTool(tool: Pick<GeoRegistryTool, 'module' | 'family'>): string | null {
  return PLACEMENT[`${tool.module}/${tool.family}`] ?? MODULE_FALLBACK[tool.module] ?? null;
}
export function areaOfTool(tool: Pick<GeoRegistryTool, 'module' | 'family'>): AreaId | null {
  const g = placeTool(tool); return g ? groupOf(g)?.area ?? null : null;
}

/** Workspace views that exist today but are not registry tools. */
export interface ViewItem { id: string; group: string; view: GeoView; label: Txt; icon: PxIconName }
export const VIEW_ITEMS: ViewItem[] = [
  { id: 'prepare', group: 'prepare', view: { kind: 'data', action: 'prepare' }, label: { es: 'Tabla y preparación', en: 'Table & preparation' }, icon: 'table' },
  { id: 'descriptive-statistics', group: 'stats', view: { kind: 'data', action: 'descriptive-statistics' }, label: { es: 'Resumen estadístico', en: 'Summary statistics' }, icon: 'stats' },
  { id: 'correlation-analysis', group: 'stats', view: { kind: 'data', action: 'correlation-analysis' }, label: { es: 'Correlaciones', en: 'Correlations' }, icon: 'scatter' },
  { id: 'principal-component-analysis', group: 'multi', view: { kind: 'data', action: 'principal-component-analysis' }, label: { es: 'PCA', en: 'PCA' }, icon: 'pca' },
  { id: 'kmeans', group: 'multi', view: { kind: 'explore', tool: 'kmeans' }, label: { es: 'K-means', en: 'K-means' }, icon: 'classify' },
  { id: 'anomalies', group: 'path', view: { kind: 'explore', tool: 'anomalies' }, label: { es: 'Anomalías', en: 'Anomalies' }, icon: 'anomaly' },
  { id: 'sample-map', group: 'maps', view: { kind: 'map', mode: 'samples' }, label: { es: 'Mapa de muestras', en: 'Sample map' }, icon: 'map' },
];

const TOOL_ICON: Record<string, PxIconName> = {
  tas: 'tas', qapf: 'ternary', afm: 'ternary', ternary: 'ternary', 'ree-normalization': 'spider', 'primitive-mantle': 'spider',
  histogram: 'stats', boxplot: 'stats', 'qq-normal': 'stats', probability: 'stats', ecdf: 'stats', downhole: 'drill', 'downhole-compare': 'drill',
  'assay-compare': 'check', 'assay-difference': 'check', 'element-ratios': 'code', alteration: 'anomaly', 'shand-index': 'classify',
};
const FAMILY_ICON: Record<string, PxIconName> = { normalization: 'spider', fertility: 'anomaly', calculations: 'stats', classification: 'tas' };
export const iconForTool = (t: Pick<GeoRegistryTool, 'id' | 'family'>): PxIconName => TOOL_ICON[t.id] ?? FAMILY_ICON[t.family] ?? 'scatter';

export type RibbonItem =
  | { kind: 'tool'; key: string; toolId: string; label: Txt; icon: PxIconName; tool: GeoRegistryTool }
  | { kind: 'view'; key: string; view: GeoView; label: Txt; icon: PxIconName };
export interface RibbonGroup { def: RibbonGroupDef; items: RibbonItem[] }

/** Ribbon content for one area: implemented registry tools (in registry order) plus the workspace views of that area. */
export function ribbonFor(area: AreaId, registry: GeoRegistry | null): RibbonGroup[] {
  return RIBBON_GROUPS.filter(g => g.area === area).map(def => {
    const tools: RibbonItem[] = (registry?.tools ?? []).filter(t => t.status === 'implemented' && placeTool(t) === def.id)
      .map(t => ({ kind: 'tool', key: `tool:${t.id}`, toolId: t.id, label: toolLabel(t), icon: iconForTool(t), tool: t }));
    const views: RibbonItem[] = VIEW_ITEMS.filter(v => v.group === def.id).map(v => ({ kind: 'view', key: `view:${v.id}`, view: v.view, label: v.label, icon: v.icon }));
    return { def, items: def.id === 'prepare' || def.id === 'stats' || def.id === 'multi' ? [...views, ...tools] : [...tools, ...views] };
  }).filter(g => g.items.length > 0);
}

/** The catalog group the Workbench should load for an area (selection of the tool itself happens afterwards). */
export const WORKBENCH_GROUP: Record<AreaId, GeoGroup> = { data: 'diagrams', litho: 'lithogeochemistry', explo: 'mineral-exploration', maps: 'mineral-exploration' };

/** Default view when an area is opened for the first time. */
export const DEFAULT_VIEW: Record<AreaId, GeoView> = {
  data: { kind: 'data', action: 'prepare' }, litho: { kind: 'tool', toolId: 'tas' }, explo: { kind: 'tool', toolId: 'fertility-sr-y' }, maps: { kind: 'map', mode: 'samples' },
};

/**
 * Whether the active dataset has columns compatible with every declared input of a registry tool (informative only:
 * the button still opens the tool). Uses the same semantic-role rule as the Editor's automapping.
 */
export function inputsCovered(tool: GeoRegistryTool, hasCompatible: (allowedRoles: string[], allowedAnalytes: string[]) => boolean): { ok: boolean; missing: string[] } {
  const missing = tool.inputs.filter(i => (i.allowed_roles.length || i.allowed_analytes.length) && !hasCompatible(i.allowed_roles, i.allowed_analytes))
    .map(i => (i.allowed_analytes.length ? i.allowed_analytes.join('/') : i.key));
  return { ok: missing.length === 0, missing };
}
