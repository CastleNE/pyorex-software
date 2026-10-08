import { callRpc } from './rpc';
import type { DiagramSpec } from './custom-diagrams';
import { saveFile,type SaveOutcome } from './save-file';
import { confidentColumn,inputConstraintFor } from './semantic-roles';

export type GeoGroup = 'diagrams'|'lithogeochemistry'|'mineral-exploration';
export type GeoUnit = 'pct'|'ppm'|'ppb'|'raw';
export interface GeoColumn { name:string; numeric:boolean }
export interface GeoTool { id:string; label:string; group:GeoGroup; inputs:string[]; kind:string; unit:GeoUnit; formula:string; reference:string; optional_inputs:boolean }
export interface GeoConfig { tool:string; columns:Record<string,string>; units:Record<string,GeoUnit>; iron_basis:'FeOT'|'Fe2O3T'; include_qaqc:boolean; log_x:boolean; log_y:boolean; group_column:string|null; label_column:string|null; size_column?:string|null; color_column?:string|null;
  /** Only for tool 'custom-diagram' (Diagram Builder, lib/custom-diagrams.ts). */
  diagram?:DiagramSpec|null }
export interface GeoRow { size_value?:number|null; color_value?:number|null; sample_id:string; row_index:number; group:string; status:'valid'|'invalid'|'excluded'; reason:string|null; x:number|null; y:number|null; z:number|null; values:(number|null)[]|null; classification:string|null }
export interface GeoResult {
  grid?:{x:number[];y:number[];z:(number|null)[][];epsg:number;coordinate_unit:string}|null;
  tool:string; title:string; rows:GeoRow[];
  quality:{total:number;used:number;invalid:number;excluded_qaqc:number};
  plot:{kind:string;x_label:string;y_label:string;z_label:string;log_x:boolean;log_y:boolean;elements?:string[];fields:{id:string;name:string;points:number[][]}[]};
  warnings:string[]; formula:string; reference:string; pipeline:Record<string,unknown>;created_at:string;
}
/** Projection served by `geochemistry.registry` (Tool Registry). Tools arrive in canonical navigation order. */
export interface GeoRegistryInput { key:string; allowed_roles:string[]; allowed_analytes:string[] }
export interface GeoRegistryTool { id:string; label:string; module:string; family:string; status:string; capabilities:string[]; renderer:string; inputs:GeoRegistryInput[]; group_allowed_roles:string[] }
export interface GeoRegistry { schema_version:number; tools:GeoRegistryTool[] }
export interface GeoCatalog { tools:GeoTool[];columns:GeoColumn[];dataset_id:string;dataset_name:string }
/** Semantic Variable System (v1): one column's classification, served by `geochemistry.column_roles`. */
export interface GeoColumnRole { column:string; semantic_role:string; analyte:string|null; unit:string|null; confidence:'high'|'medium'|'low'; source:string }
export interface GeoColumnRoles { dataset_id:string; columns:GeoColumnRole[] }
/** `geochemistry.diagram_preview`: live check of each Diagram Builder axis expression. */
export interface DiagramAxisPreview { ok:boolean; error:string|null; columns:string[]; n_valid:number; n_invalid:number; min:number|null; max:number|null; sample:number[] }
export interface DiagramPreview { dataset_id:string; axes:Record<string,DiagramAxisPreview> }
export const geoApi={
  catalog:(datasetId:string)=>callRpc<GeoCatalog>('geochemistry.catalog',{dataset_id:datasetId}),
  registry:()=>callRpc<GeoRegistry>('geochemistry.registry',{}),
  columnRoles:(datasetId:string)=>callRpc<GeoColumnRoles>('geochemistry.column_roles',{dataset_id:datasetId}),
  compute:(datasetId:string,config:GeoConfig)=>callRpc<GeoResult>('geochemistry.compute',{dataset_id:datasetId,...config}),
  diagramPreview:(datasetId:string,expressions:Partial<Record<'x'|'y'|'z',string>>)=>callRpc<DiagramPreview>('geochemistry.diagram_preview',{dataset_id:datasetId,expressions}),
};

function analyte(name:string) {
  return name.toLowerCase().replace(/(?:[_\s(\[]?(?:wt%|wtpct|pct|ppm|ppb|%)[)\]]?)$/,'').replace(/[^a-z0-9]/g,'');
}
/**
 * `registryTool`/`columnRoles` are optional (Semantic Variable System v1, see lib/semantic-roles.ts). A key with a
 * declared `allowed_roles`/`allowed_analytes` constraint is matched ONLY from that semantic metadata — never by
 * searching column names here — and only a "high" confidence match is auto-filled; a key with no constraint
 * declared behaves exactly as before this system existed (fuzzy name match, then first unused numeric column for
 * X/Y/A/B/C). This is what makes TAS map SiO2_pct/Na2O_pct/K2O_pct correctly while never guessing from `[Order]`.
 */
export function guessMapping(tool:GeoTool,columns:GeoColumn[],registryTool?:GeoRegistryTool,columnRoles?:Record<string,GeoColumnRole>) {
  const result:Record<string,string>={};
  const numeric=columns.filter(c=>c.numeric);
  const roles=columnRoles??{};
  const used=new Set<string>();
  for(const key of tool.inputs){
    const constraint=inputConstraintFor(registryTool,key);
    if(constraint&&(constraint.allowed_roles.length||constraint.allowed_analytes.length)){
      const match=confidentColumn(numeric.filter(c=>!used.has(c.name)),roles,constraint);
      if(match){result[key]=match.name;used.add(match.name);}
      continue;
    }
    const match=numeric.find(c=>analyte(c.name)===analyte(key));
    if(match) result[key]=match.name;
  }
  if(tool.unit==='raw'){
    for(const key of tool.inputs){
      if(!['X','Y','A','B','C'].includes(key)||result[key])continue;
      const constraint=inputConstraintFor(registryTool,key);
      const unused=numeric.filter(c=>!used.has(c.name));
      const next=constraint&&(constraint.allowed_roles.length||constraint.allowed_analytes.length)
        ?confidentColumn(unused,roles,constraint)
        :unused[0];
      if(next){result[key]=next.name;used.add(next.name);}
    }
  }
  return result;
}
/**
 * Sync iron_basis to the analyte actually auto-mapped for FeTotal (any tool using that input key: fe-index, afm,
 * alteration) — but only when it is unambiguous. 'FeOT'/'Fe2O3T' say "total" in the name and classify at HIGH
 * confidence, so FeTotal only ever auto-maps to one of those two or stays empty (see semantic-roles.ts's
 * confidentColumn); a bare 'Fe2O3'/'FeO' is MEDIUM confidence precisely so it never reaches this function having
 * been auto-picked (see analysis/geochemistry/semantics.py). iron_basis itself only ever takes these two values
 * (Editor.tsx's "Forma del hierro total" select); this never guesses beyond them.
 */
function ironBasisFor(mapping:Record<string,string>,columnRoles?:Record<string,GeoColumnRole>):'FeOT'|'Fe2O3T'|undefined {
  const analyte=columnRoles?.[mapping.FeTotal??'']?.analyte;
  return analyte==='FeOT'||analyte==='Fe2O3T'?analyte:undefined;
}
export function initialConfig(tool:GeoTool,columns:GeoColumn[],registryTool?:GeoRegistryTool,columnRoles?:Record<string,GeoColumnRole>):GeoConfig {
  const mapping=guessMapping(tool,columns,registryTool,columnRoles);
  return {tool:tool.id,columns:mapping,units:Object.fromEntries(Object.keys(mapping).map(k=>[k,inferUnit(mapping[k],tool.unit)])),iron_basis:ironBasisFor(mapping,columnRoles)??'FeOT',include_qaqc:false,log_x:false,log_y:false,group_column:null,label_column:null};
}
export function inferUnit(column:string,fallback:GeoUnit):GeoUnit {
  if(fallback==='raw')return 'raw';
  const suffix=column.toLowerCase().match(/(ppb|ppm|wt%|wtpct|pct|%)[)\]]?$/)?.[1];
  return suffix==='ppb'?'ppb':suffix==='ppm'?'ppm':suffix?'pct':fallback;
}
export function plotRows(rows:GeoRow[],kind:string) {
  const valid=rows.filter(row=>row.status==='valid');
  return ['histogram','box','qq','probability','ecdf','line','downhole','assay','difference'].includes(kind)?valid:valid.slice(0,kind==='spider'?100:5000);
}
export function colorIndex(group:string,index:number,groups:string[],grouped:boolean) {
  return grouped?Math.max(0,groups.indexOf(group)):index;
}
export function toCsv(rows:Record<string,unknown>[]) {
  const keys=Array.from(new Set(rows.flatMap(row=>Object.keys(row))));
  const cell=(value:unknown)=>{
    let text=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);
    if(typeof value==='string' && /^[\s]*[=+@-]/.test(text)) text="'"+text;
    return /[",\r\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;
  };
  return '\uFEFF'+[keys.map(cell).join(','),...rows.map(row=>keys.map(k=>cell(row[k])).join(','))].join('\r\n');
}
export function downloadResult(result:GeoResult,format:'csv'|'json'):Promise<SaveOutcome> {
  const content=format==='json'?JSON.stringify(result,null,2):toCsv(result.rows.map(row=>({...row,tool:result.tool,formula:result.formula,reference:result.reference})));
  return saveFile(`pyorex-${result.tool}-${result.created_at.slice(0,10)}.${format}`,content,format==='json'?'application/json':'text/csv;charset=utf-8');
}
