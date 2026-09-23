import { callRpc } from './rpc';
import { saveFile,type SaveOutcome } from './save-file';

export type GeoGroup = 'diagrams'|'lithogeochemistry'|'mineral-exploration';
export type GeoUnit = 'pct'|'ppm'|'ppb'|'raw';
export interface GeoColumn { name:string; numeric:boolean }
export interface GeoTool { id:string; label:string; group:GeoGroup; inputs:string[]; kind:string; unit:GeoUnit; formula:string; reference:string; optional_inputs:boolean }
export interface GeoConfig { tool:string; columns:Record<string,string>; units:Record<string,GeoUnit>; iron_basis:'FeOT'|'Fe2O3T'; include_qaqc:boolean; log_x:boolean; log_y:boolean; group_column:string|null; label_column:string|null; size_column?:string|null; color_column?:string|null }
export interface GeoRow { size_value?:number|null; color_value?:number|null; sample_id:string; row_index:number; group:string; status:'valid'|'invalid'|'excluded'; reason:string|null; x:number|null; y:number|null; z:number|null; values:(number|null)[]|null; classification:string|null }
export interface GeoResult {
  grid?:{x:number[];y:number[];z:(number|null)[][];epsg:number;coordinate_unit:string}|null;
  tool:string; title:string; rows:GeoRow[];
  quality:{total:number;used:number;invalid:number;excluded_qaqc:number};
  plot:{kind:string;x_label:string;y_label:string;z_label:string;log_x:boolean;log_y:boolean;elements?:string[];fields:{id:string;name:string;points:number[][]}[]};
  warnings:string[]; formula:string; reference:string; pipeline:Record<string,unknown>;created_at:string;
}
/** Projection served by `geochemistry.registry` (Tool Registry). Tools arrive in canonical navigation order. */
export interface GeoRegistryTool { id:string; label:string; module:string; family:string; status:string; capabilities:string[]; renderer:string }
export interface GeoRegistry { schema_version:number; tools:GeoRegistryTool[] }
export interface GeoCatalog { tools:GeoTool[];columns:GeoColumn[];dataset_id:string;dataset_name:string }
export const geoApi={
  catalog:(datasetId:string)=>callRpc<GeoCatalog>('geochemistry.catalog',{dataset_id:datasetId}),
  registry:()=>callRpc<GeoRegistry>('geochemistry.registry',{}),
  compute:(datasetId:string,config:GeoConfig)=>callRpc<GeoResult>('geochemistry.compute',{dataset_id:datasetId,...config}),
};

function analyte(name:string) {
  return name.toLowerCase().replace(/(?:[_\s(\[]?(?:wt%|wtpct|pct|ppm|ppb|%)[)\]]?)$/,'').replace(/[^a-z0-9]/g,'');
}
export function guessMapping(tool:GeoTool,columns:GeoColumn[]) {
  const result:Record<string,string>={};
  const numeric=columns.filter(c=>c.numeric);
  for(const key of tool.inputs){
    const match=numeric.find(c=>analyte(c.name)===analyte(key));
    if(match) result[key]=match.name;
  }
  if(tool.unit==='raw'){
    const used=new Set(Object.values(result));
    for(const key of tool.inputs){if(['X','Y','A','B','C'].includes(key)&&!result[key]){const next=numeric.find(c=>!used.has(c.name));if(next){result[key]=next.name;used.add(next.name);}}}
  }
  return result;
}
export function initialConfig(tool:GeoTool,columns:GeoColumn[]):GeoConfig {
  const mapping=guessMapping(tool,columns);
  return {tool:tool.id,columns:mapping,units:Object.fromEntries(Object.keys(mapping).map(k=>[k,inferUnit(mapping[k],tool.unit)])),iron_basis:'FeOT',include_qaqc:false,log_x:false,log_y:false,group_column:null,label_column:null};
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
