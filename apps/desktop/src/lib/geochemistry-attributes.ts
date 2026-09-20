/** Presentation only: never removes rows from scientific results or exports. */
export const ATTRIBUTE_COLORS = ['#56b4e9','#e69f00','#009e73','#cc79a7','#f0e442','#0072b2','#d55e00','#a1a1aa'];
export interface AttributeStyle { color?:string; symbol?:string; size?:number; visible?:boolean }
export function attributeKey(column:string|null,group:string) { return JSON.stringify([column,group]); }
export function resolveAttribute(styles:Record<string,AttributeStyle>,column:string|null,group:string,index:number,size:number,symbol:string,colors:string[]=ATTRIBUTE_COLORS) {
  return {color:colors[index%colors.length],size,symbol,visible:true,...styles[attributeKey(column,group)]};
}
