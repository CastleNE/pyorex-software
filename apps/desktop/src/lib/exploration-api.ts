import { callRpc } from './rpc';
import type { GeoResult } from './geochemistry-api';

export type ExplorationTool = 'anomalies'|'kmeans'|'isovalues';
export interface ExplorationConfig {
  tool:ExplorationTool; variables:string[]; include_qaqc:boolean; label_column:string|null;
  method:'manual'|'percentile'; breaks:number[]; labels:string[];
  k:number; seed:number; transform:'none'|'log10'; east:string|null; north:string|null;
  epsg:number|null; resolution:number; power:number; neighbors:number; radius:number|null;
}
export interface ExplorationResult extends GeoResult {
  metrics:{thresholds?:number[];counts?:Record<string,number>;centroids?:{group:string;values:Record<string,number>}[];
    inertia?:number;silhouette?:number|null;iterations?:number;unique_locations?:number;
    duplicate_locations?:number;supported_cells?:number;total_cells?:number};
}
export const explore=(datasetId:string,config:ExplorationConfig)=>
  callRpc<ExplorationResult>('geochemistry.explore',{dataset_id:datasetId,...config});

export function parseBreaks(text:string):number[] {
  const parts=text.split(';').map(s=>s.trim());
  const values=parts.map(s=>Number(s.replace(',','.')));
  if(parts.some(s=>!s)||values.some(v=>!Number.isFinite(v))||values.some((v,i)=>i>0&&v<=values[i-1]))
    throw new Error('Escribe cortes crecientes separados por punto y coma. Ejemplo: 0.1; 0.5; 1');
  return values;
}
