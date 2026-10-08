export const PALETTES = {
  Accessible:['#56b4e9','#e69f00','#009e73','#cc79a7','#f0e442','#0072b2','#d55e00','#a1a1aa'],
  Tableau:['#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc949','#af7aa1','#ff9da7'],
  Earth:['#8c510a','#bf812d','#dfc27d','#80cdc1','#35978f','#01665e'],
  Viridis:['#440154','#414487','#2a788e','#22a884','#7ad151','#fde725'],
  Inferno:['#000004','#420a68','#932667','#dd513a','#fca50a','#fcffa4'],
  Diverging:['#2166ac','#67a9cf','#d1e5f0','#fddbc7','#ef8a62','#b2182b'],
};
export type PaletteName=keyof typeof PALETTES;
import type { SizeBoundary, SizeMethod } from './size-classes';
import type { ColorClassSettings } from './color-classes';
export interface ChartPresentation extends ColorClassSettings {
  palette:PaletteName; sizeMode:'constant'|'linear'|'quantile'|'classes'; sizeSource:'x'|'y'|'column';
  /** sizeMode 'classes' (graduated symbols, see lib/size-classes.ts): class count (2–20) for computed methods, how
   * limits are set, own limits as values or percentiles, smallest/largest symbol diameter (px), log10 classing and
   * which class takes a value equal to a limit. */
  sizeClasses:number; sizeMethod:SizeMethod; sizeBreaks:number[]|null; sizePercentiles:number[]|null; sizeMin:number; sizeMax:number; sizeLog:boolean; sizeBoundary:SizeBoundary;
  logX:boolean;logY:boolean;xMin:string;xMax:string;yMin:string;yMax:string;
  opacity:number;grid:boolean;reverseY:boolean;
}
export const DEFAULT_PRESENTATION:ChartPresentation={palette:'Accessible',sizeMode:'constant',sizeSource:'y',sizeClasses:5,sizeMethod:'quantile',sizeBreaks:null,sizePercentiles:null,sizeMin:5,sizeMax:18,sizeLog:false,sizeBoundary:'up',
  colorClasses:5,colorMethod:'equal',colorBreaks:null,colorPercentiles:null,colorLog:false,colorBoundary:'up',colorRamp:'rainbow',colorReverse:false,colorCustom:null,
  logX:false,logY:false,xMin:'',xMax:'',yMin:'',yMax:'',opacity:.85,grid:true,reverseY:false};
export function displaySizes(values:(number|null|undefined)[],mode:Exclude<ChartPresentation['sizeMode'],'classes'>,fallback:number) {
  const finite=values.filter((v):v is number=>typeof v==='number'&&Number.isFinite(v));
  if(mode==='constant'||!finite.length)return values.map(()=>fallback);
  const sorted=[...finite].sort((a,b)=>a-b),min=sorted[0],max=sorted[sorted.length-1];
  return values.map(v=>{
    if(v==null||!Number.isFinite(v)||max===min)return fallback;
    if(mode==='quantile')return v<sorted[Math.floor(sorted.length/3)]?5:v<sorted[Math.floor(2*sorted.length/3)]?10:16;
    return 4+12*Math.sqrt((v-min)/(max-min));
  });
}
export function axisRange(min:string,max:string,log:boolean):[number,number]|undefined {
  if(!min.trim()||!max.trim())return undefined;
  const a=Number(min),b=Number(max);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a>=b||(log&&a<=0))return undefined;
  return log?[Math.log10(a),Math.log10(b)]:[a,b];
}
