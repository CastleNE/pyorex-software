import { DEFAULT_PRESENTATION,PALETTES,type ChartPresentation } from './chart-presentation';
import type { AttributeStyle } from './geochemistry-attributes';
import type { GeoColumn,GeoConfig,GeoTool,GeoUnit } from './geochemistry-api';
import { CUSTOM_TOOL_ID,sanitizeSpec } from './custom-diagrams';
import { COLOR_RAMP_NAMES,isHexColor,type ColorRamp } from './color-classes';
import { MAX_CLASSES,MIN_CLASSES,SIZE_METHODS,breaksProblem,percentilesProblem,type SizeMethod } from './size-classes';

/** Configuración y presentación de una herramienta. Nunca incluye resultados calculados ni datos de muestras. */
export interface Workspace { config:GeoConfig; presentation:ChartPresentation; pointSize:number; symbol:string; showLabels:boolean }
export interface SavedState { workspaces:Record<string,Workspace>; attributes:Record<string,Record<string,AttributeStyle>> }
export const EMPTY_SAVED:SavedState={workspaces:{},attributes:{}};

export const SESSION_FORMAT='pyorex.geochemistry.session';
export const SESSION_VERSION=1;
export interface SessionDocument {
  format:typeof SESSION_FORMAT; version:number; exported_at:string;
  dataset:{id:string;name:string};
  workspaces:Record<string,Workspace>; attributes:Record<string,AttributeStyle>;
}

export const workspaceKey=(datasetId:string,toolId:string)=>`${datasetId}::${toolId}`;

const UNITS:GeoUnit[]=['pct','ppm','ppb','raw'];
const isRecord=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const str=(v:unknown,fallback:string)=>typeof v==='string'?v:fallback;
const num=(v:unknown,fallback:number,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback;
const bool=(v:unknown,fallback:boolean)=>typeof v==='boolean'?v:fallback;

export function sanitizePresentation(raw:unknown):ChartPresentation {
  const d=DEFAULT_PRESENTATION;
  if(!isRecord(raw))return {...d};
  const palette=typeof raw.palette==='string'&&raw.palette in PALETTES?raw.palette as ChartPresentation['palette']:d.palette;
  const sizeMode=raw.sizeMode==='linear'||raw.sizeMode==='quantile'||raw.sizeMode==='constant'||raw.sizeMode==='classes'?raw.sizeMode:d.sizeMode;
  // Class settings are validated the same way for size (size*) and colour (color*).
  const numbers=(v:unknown)=>Array.isArray(v)&&v.every(b=>typeof b==='number'&&Number.isFinite(b))?v as number[]:null;
  const classes=(k:unknown,fallback:number)=>typeof k==='number'&&Number.isInteger(k)&&k>=MIN_CLASSES&&k<=MAX_CLASSES?k:fallback;
  const method=(m:unknown,fallback:SizeMethod)=>SIZE_METHODS.includes(m as SizeMethod)?m as SizeMethod:fallback;
  const breaks=(v:unknown)=>{const b=numbers(v);return b&&!breaksProblem(b,false)?b:null;};
  const pcts=(v:unknown)=>{const b=numbers(v);return b&&!percentilesProblem(b)?b:null;};
  const sizeClasses=classes(raw.sizeClasses,d.sizeClasses),sizeMethod=method(raw.sizeMethod,d.sizeMethod);
  const sizeBreaks=breaks(raw.sizeBreaks),sizePercentiles=pcts(raw.sizePercentiles);
  const color={colorClasses:classes(raw.colorClasses,d.colorClasses),colorMethod:method(raw.colorMethod,d.colorMethod),colorBreaks:breaks(raw.colorBreaks),colorPercentiles:pcts(raw.colorPercentiles),
    colorLog:bool(raw.colorLog,d.colorLog),colorBoundary:raw.colorBoundary==='down'?'down' as const:'up' as const,
    colorRamp:COLOR_RAMP_NAMES.includes(raw.colorRamp as ColorRamp)?raw.colorRamp as ColorRamp:d.colorRamp,colorReverse:bool(raw.colorReverse,d.colorReverse),
    colorCustom:Array.isArray(raw.colorCustom)&&raw.colorCustom.length>=MIN_CLASSES&&raw.colorCustom.length<=MAX_CLASSES&&raw.colorCustom.every(isHexColor)?raw.colorCustom as string[]:null};
  const sizeMin=num(raw.sizeMin,d.sizeMin,2,40),sizeMax=Math.max(sizeMin,num(raw.sizeMax,d.sizeMax,2,48));
  const sizeSource=raw.sizeSource==='x'||raw.sizeSource==='y'||raw.sizeSource==='column'?raw.sizeSource:d.sizeSource;
  return {palette,sizeMode,sizeSource,sizeClasses,sizeMethod,sizeBreaks,sizePercentiles,sizeMin,sizeMax,sizeLog:bool(raw.sizeLog,d.sizeLog),sizeBoundary:raw.sizeBoundary==='down'?'down':'up',...color,logX:bool(raw.logX,d.logX),logY:bool(raw.logY,d.logY),xMin:str(raw.xMin,d.xMin),xMax:str(raw.xMax,d.xMax),yMin:str(raw.yMin,d.yMin),yMax:str(raw.yMax,d.yMax),opacity:num(raw.opacity,d.opacity,0.05,1),grid:bool(raw.grid,d.grid),reverseY:bool(raw.reverseY,d.reverseY)};
}

export function sanitizeAttributes(raw:unknown):Record<string,AttributeStyle> {
  if(!isRecord(raw))return {};
  const out:Record<string,AttributeStyle>={};
  for(const [key,value] of Object.entries(raw)){
    if(!isRecord(value))continue;
    const style:AttributeStyle={};
    if(typeof value.color==='string')style.color=value.color;
    if(typeof value.symbol==='string')style.symbol=value.symbol;
    if(typeof value.size==='number'&&Number.isFinite(value.size))style.size=value.size;
    if(typeof value.visible==='boolean')style.visible=value.visible;
    out[key]=style;
  }
  return out;
}

/**
 * Valida una configuración guardada contra el catálogo actual: las columnas que ya no existen se descartan
 * (nunca se reasignan en silencio) y se devuelve la lista de campos descartados para avisar al usuario.
 */
export function restoreWorkspace(raw:unknown,tool:GeoTool,columns:GeoColumn[]):{workspace:Workspace;dropped:string[]}|null {
  if(!isRecord(raw)||!isRecord(raw.config)||raw.config.tool!==tool.id)return null;
  const names=new Set(columns.map(c=>c.name)),numeric=new Set(columns.filter(c=>c.numeric).map(c=>c.name));
  const dropped:string[]=[];
  const mapped:Record<string,string>={},units:Record<string,GeoUnit>={};
  const savedColumns=isRecord(raw.config.columns)?raw.config.columns:{};
  const savedUnits=isRecord(raw.config.units)?raw.config.units:{};
  for(const key of tool.inputs){
    const column=savedColumns[key];
    if(typeof column!=='string')continue;
    if(!numeric.has(column)){dropped.push(`${key} → ${column}`);continue;}
    mapped[key]=column;
    const unit=savedUnits[key];
    units[key]=UNITS.includes(unit as GeoUnit)?unit as GeoUnit:(tool.unit);
  }
  const optional=(key:'group_column'|'label_column'|'size_column'|'color_column',mustBeNumeric:boolean)=>{
    const value=(raw.config as Record<string,unknown>)[key];
    if(typeof value!=='string')return null;
    if(!(mustBeNumeric?numeric:names).has(value)){dropped.push(`${key} → ${value}`);return null;}
    return value;
  };
  // User diagrams (Diagram Builder) carry their definition; without a usable one the workspace is not restored.
  const diagram=tool.id===CUSTOM_TOOL_ID?sanitizeSpec(raw.config.diagram):null;
  if(tool.id===CUSTOM_TOOL_ID&&!diagram)return null;
  const config:GeoConfig={
    tool:tool.id,columns:mapped,units,...(diagram?{diagram}:{}),
    iron_basis:raw.config.iron_basis==='Fe2O3T'?'Fe2O3T':'FeOT',
    include_qaqc:bool(raw.config.include_qaqc,false),log_x:bool(raw.config.log_x,false),log_y:bool(raw.config.log_y,false),
    group_column:optional('group_column',false),label_column:optional('label_column',false),
    size_column:optional('size_column',true),color_column:optional('color_column',true),
  };
  return {workspace:{config,presentation:sanitizePresentation(raw.presentation),pointSize:num(raw.pointSize,7,3,16),symbol:str(raw.symbol,'circle'),showLabels:bool(raw.showLabels,false)},dropped};
}

export function buildSession(dataset:{id:string;name:string},saved:SavedState,now=new Date()):SessionDocument {
  const prefix=`${dataset.id}::`;
  const workspaces=Object.fromEntries(Object.entries(saved.workspaces).filter(([key])=>key.startsWith(prefix)).map(([key,value])=>[key.slice(prefix.length),value]));
  return {format:SESSION_FORMAT,version:SESSION_VERSION,exported_at:now.toISOString(),dataset,workspaces,attributes:saved.attributes[dataset.id]??{}};
}

export function parseSession(text:string):SessionDocument {
  let raw:unknown;
  try{raw=JSON.parse(text);}catch{throw new Error('El archivo no es JSON válido');}
  if(!isRecord(raw)||raw.format!==SESSION_FORMAT)throw new Error('No es un documento de sesión de Geoquímica de PyOrex');
  if(typeof raw.version!=='number'||raw.version>SESSION_VERSION)throw new Error(`Versión de sesión no soportada: ${String(raw.version)}`);
  if(!isRecord(raw.dataset)||typeof raw.dataset.id!=='string')throw new Error('La sesión no identifica el dataset');
  const workspaces:Record<string,Workspace>={};
  if(isRecord(raw.workspaces))for(const [toolId,value] of Object.entries(raw.workspaces))if(isRecord(value)&&isRecord(value.config))workspaces[toolId]=value as unknown as Workspace;
  return {format:SESSION_FORMAT,version:raw.version,exported_at:str(raw.exported_at,''),dataset:{id:raw.dataset.id,name:str(raw.dataset.name,'')},workspaces,attributes:sanitizeAttributes(raw.attributes)};
}

const STORAGE_KEY='pyorex.geochemistry.workspaces.v1';
export function loadSaved():SavedState {
  try{
    const raw=JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY)??'null');
    if(isRecord(raw)&&isRecord(raw.workspaces)&&isRecord(raw.attributes))return {workspaces:raw.workspaces as Record<string,Workspace>,attributes:raw.attributes as SavedState['attributes']};
  }catch{/* almacenamiento ausente o corrupto: se parte de cero */}
  return {workspaces:{},attributes:{}};
}
export function persistSaved(saved:SavedState):void {
  try{globalThis.localStorage?.setItem(STORAGE_KEY,JSON.stringify(saved));}catch{/* sin almacenamiento: la sesión sigue funcionando en memoria */}
}
