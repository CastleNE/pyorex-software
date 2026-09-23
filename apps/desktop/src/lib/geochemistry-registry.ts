/** Navigation over the backend Tool Registry. No tool list lives here: only presentation labels for family ids. */
import type { GeoRegistry,GeoRegistryTool } from './geochemistry-api';

export const DIAGRAMS_MODULE='diagrams';
export const IMPLEMENTED='implemented';
export const SUPPORTED_SCHEMA=1;

/** Presentation only. The canonical ids (registry `family`) are never renamed; unknown families show their id. */
export const FAMILY_LABELS:Record<string,string>={distribution:'Distribución',xy:'XY',compositional:'Composicional',profiles:'Perfiles'};
export const familyLabel=(id:string)=>FAMILY_LABELS[id]??id;

export interface DiagramFamily { id:string; label:string; tools:GeoRegistryTool[] }

export function assertRegistry(value:unknown):GeoRegistry {
  const registry=value as Partial<GeoRegistry>|null;
  if(!registry||registry.schema_version!==SUPPORTED_SCHEMA||!Array.isArray(registry.tools))throw new Error(`Respuesta de geochemistry.registry no reconocida (schema_version ${String(registry?.schema_version)}).`);
  return registry as GeoRegistry;
}

/** DIAGRAMS navigation: registry tools with module=diagrams and status=implemented, grouped by family in registry order. */
export function diagramFamilies(registry:GeoRegistry):DiagramFamily[] {
  const families:DiagramFamily[]=[];
  for(const tool of registry.tools){
    if(tool.module!==DIAGRAMS_MODULE||tool.status!==IMPLEMENTED)continue;
    let family=families.find(f=>f.id===tool.family);
    if(!family){family={id:tool.family,label:familyLabel(tool.family),tools:[]};families.push(family);}
    family.tools.push(tool);
  }
  return families;
}

export const familyOf=(families:DiagramFamily[],toolId:string|null)=>families.find(f=>f.tools.some(t=>t.id===toolId))??null;

/** Tool to activate when a family is chosen: the current one if it already belongs to it, otherwise the family's first. */
export function toolForFamily(families:DiagramFamily[],familyId:string,currentToolId:string|null):string|null {
  const family=families.find(f=>f.id===familyId);
  if(!family)return null;
  return family.tools.find(t=>t.id===currentToolId)?.id??family.tools[0]?.id??null;
}

/** Registry tools that the legacy catalog cannot serve (the store resolves tool ids through the catalog). */
export const missingFromCatalog=(families:DiagramFamily[],catalogIds:string[])=>families.flatMap(f=>f.tools).map(t=>t.id).filter(id=>!catalogIds.includes(id));

/**
 * Whether the UI should offer a capability-controlled option. Only tools owned by DIAGRAMS are gated, so the behaviour never
 * depends on which other module happened to load the registry first; unknown tools keep every control (current behaviour).
 */
export function offersCapability(spec:GeoRegistryTool|undefined,capability:string) {
  return !spec||spec.module!==DIAGRAMS_MODULE||spec.capabilities.includes(capability);
}
