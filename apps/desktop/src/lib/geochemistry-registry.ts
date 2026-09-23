/**
 * Navigation over the backend Tool Registry — Familia -> Herramienta for ANY module (DIAGRAMS, Litogeoquímica, and
 * later Exploración/Espectrometría/Petrofísica), all built from the same `geochemistry.registry` response. No tool
 * list lives here: only presentation labels for family ids, which differ per module and are frontend-only —
 * they never change the Registry's canonical (English, snake_case) family values.
 */
import type { GeoRegistry,GeoRegistryTool } from './geochemistry-api';

export const DIAGRAMS_MODULE='diagrams';
export const LITHOGEOCHEMISTRY_MODULE='lithogeochemistry';
export const IMPLEMENTED='implemented';
export const SUPPORTED_SCHEMA=1;

/** Presentation only. The canonical ids (registry `family`) are never renamed; unknown families show their id. */
export const FAMILY_LABELS:Record<string,string>={distribution:'Distribución',xy:'XY',compositional:'Composicional',profiles:'Perfiles'};
export const familyLabel=(id:string)=>FAMILY_LABELS[id]??id;

export const LITHO_FAMILY_LABELS:Record<string,string>={classification:'Clasificación',magmatic_series:'Series magmáticas',variation:'Variación',normalization:'Normalización',calculations:'Cálculos'};
export const lithoFamilyLabel=(id:string)=>LITHO_FAMILY_LABELS[id]??id;

export interface ToolFamily { id:string; label:string; tools:GeoRegistryTool[] }
/** @deprecated kept as an alias — DIAGRAMS callers/tests already spell it this way. */
export type DiagramFamily = ToolFamily;

export function assertRegistry(value:unknown):GeoRegistry {
  const registry=value as Partial<GeoRegistry>|null;
  if(!registry||registry.schema_version!==SUPPORTED_SCHEMA||!Array.isArray(registry.tools))throw new Error(`Respuesta de geochemistry.registry no reconocida (schema_version ${String(registry?.schema_version)}).`);
  return registry as GeoRegistry;
}

/**
 * Familia -> Herramienta for one module: registry tools with the given `module` and status=implemented, grouped by
 * family in registry order (clients group by first appearance, never a hardcoded family list of their own).
 */
export function familiesForModule(registry:GeoRegistry,module:string,label:(id:string)=>string=(id)=>id):ToolFamily[] {
  const families:ToolFamily[]=[];
  for(const tool of registry.tools){
    if(tool.module!==module||tool.status!==IMPLEMENTED)continue;
    let family=families.find(f=>f.id===tool.family);
    if(!family){family={id:tool.family,label:label(tool.family),tools:[]};families.push(family);}
    family.tools.push(tool);
  }
  return families;
}

/** DIAGRAMS navigation. Kept as a named export (rather than inlining `familiesForModule` at call sites) for the
 * existing DIAGRAMS tests, which import it directly. */
export const diagramFamilies=(registry:GeoRegistry):ToolFamily[]=>familiesForModule(registry,DIAGRAMS_MODULE,familyLabel);

/** LITOGEOQUÍMICA navigation: same builder, module=lithogeochemistry and its own family labels. */
export const lithogeochemistryFamilies=(registry:GeoRegistry):ToolFamily[]=>familiesForModule(registry,LITHOGEOCHEMISTRY_MODULE,lithoFamilyLabel);

export const familyOf=(families:ToolFamily[],toolId:string|null)=>families.find(f=>f.tools.some(t=>t.id===toolId))??null;

/** Tool to activate when a family is chosen: the current one if it already belongs to it, otherwise the family's first. */
export function toolForFamily(families:ToolFamily[],familyId:string,currentToolId:string|null):string|null {
  const family=families.find(f=>f.id===familyId);
  if(!family)return null;
  return family.tools.find(t=>t.id===currentToolId)?.id??family.tools[0]?.id??null;
}

/** Registry tools that the legacy catalog cannot serve (the store resolves tool ids through the catalog). */
export const missingFromCatalog=(families:ToolFamily[],catalogIds:string[])=>families.flatMap(f=>f.tools).map(t=>t.id).filter(id=>!catalogIds.includes(id));

/**
 * Whether the UI should offer a capability-controlled option. Only tools owned by DIAGRAMS are gated, so the behaviour never
 * depends on which other module happened to load the registry first; unknown tools keep every control (current behaviour).
 */
export function offersCapability(spec:GeoRegistryTool|undefined,capability:string) {
  return !spec||spec.module!==DIAGRAMS_MODULE||spec.capabilities.includes(capability);
}
