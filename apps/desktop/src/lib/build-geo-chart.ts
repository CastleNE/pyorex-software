import type { Data,Layout } from 'plotly.js';
import { plotRows,type GeoResult,type GeoRow } from './geochemistry-api';
import { resolveAttribute,type AttributeStyle } from './geochemistry-attributes';
import { PALETTES,axisRange,displaySizes,type ChartPresentation } from './chart-presentation';
import { classSizesFor,classesFor,sizeClassLegend,type SizeClassLegend } from './size-classes';
import { MISSING_COLOR,colorClassLegend,type ColorClassLegend } from './color-classes';

interface Style {pointSize:number;symbol:string;showLabels:boolean;attributes:Record<string,AttributeStyle>;presentation:ChartPresentation}
export function buildGeoChart(result:GeoResult,style:Style) {
  const {pointSize,symbol,showLabels,attributes,presentation:p}=style;
  const palette=PALETTES[p.palette];
  const plot=result.plot;
  const displayed=plotRows(result.rows,plot.kind);
  const population=result.rows.filter(r=>r.status==='valid');
  const groups=[...new Set(population.map(r=>r.group))];
  const sizeValue=(r:GeoRow)=>p.sizeSource==='column'?r.size_value:p.sizeSource==='x'?r.x:r.y;
  const sizeValues=population.map(sizeValue);
  // Graduated symbols: user-defined classes (lib/size-classes.ts). Other modes keep their previous behaviour.
  const sizeLegend:(SizeClassLegend&{label:string})|null=p.sizeMode==='classes'?{...sizeClassLegend(sizeValues,p),label:sizeLabel(result,p.sizeSource)}:null;
  const sizes=sizeLegend?classSizesFor(sizeValues,sizeLegend,pointSize):displaySizes(sizeValues,p.sizeMode==='classes'?'constant':p.sizeMode,pointSize);
  const sizeByRow=new Map(population.map((r,i)=>[r.row_index,sizes[i]]));
  // Colour by value: user classes (lib/color-classes.ts), same rules as the size classes. Missing values are grey.
  const colorValues=population.map(r=>r.color_value);
  const colorLegend:(ColorClassLegend&{label:string})|null=result.pipeline.color_column&&colorValues.some(v=>v!=null&&Number.isFinite(v))?{...colorClassLegend(colorValues,p),label:String(result.pipeline.color_column)}:null;
  const colorByRow=new Map<number,string>();
  if(colorLegend)classesFor(colorValues,colorLegend).forEach((k,i)=>colorByRow.set(population[i].row_index,k==null?MISSING_COLOR:colorLegend.colors[k]));
  const color=(r:GeoRow,fallback:string)=>{
    if(!result.pipeline.color_column)return fallback;
    return colorByRow.get(r.row_index)??MISSING_COLOR;
  };
  const traces:Data[]=[];
  if(result.grid)traces.push({type:'contour',x:result.grid.x,y:result.grid.y,z:result.grid.z,
    colorscale:palette.map((c,i)=>[i/(palette.length-1),c]),connectgaps:false,
    contours:{coloring:'heatmap',showlabels:true},colorbar:{title:{text:String((result.pipeline.variables as string[]|undefined)?.[0]??'Valor')}},
    hovertemplate:'Este: %{x}<br>Norte: %{y}<br>IDW: %{z}<extra></extra>'} as Data);
  for(const field of plot.fields){
    const points=[...field.points,field.points[0]];
    // Ternary fields (user diagrams) come as [A, B, C] vertices; their label is a text point at the centroid.
    if(plot.kind==='ternary'){
      traces.push({type:'scatterternary',mode:'lines',a:points.map(p=>p[0]),b:points.map(p=>p[1]),c:points.map(p=>p[2]),name:field.name,showlegend:false,line:{color:'#52525b',width:1},hoverinfo:'name'} as Data);
      const n=field.points.length,mean=(k:number)=>field.points.reduce((t,p)=>t+p[k],0)/n;
      traces.push({type:'scatterternary',mode:'text',a:[mean(0)],b:[mean(1)],c:[mean(2)],text:[field.id],textfont:{color:'#71717a',size:10},showlegend:false,hoverinfo:'skip'} as Data);
    }else traces.push({type:'scatter',mode:'lines',x:points.map(p=>p[0]),y:points.map(p=>p[1]),name:field.name,showlegend:false,line:{color:'#52525b',width:1},hoverinfo:'name'});
  }
  if(plot.kind==='qapf')traces.push({type:'scatter',mode:'text+lines',x:[0,.5,1,.5,0,1],y:[0,Math.sqrt(3)/2,0,-Math.sqrt(3)/2,0,0],text:['A','Q','P','F','',''],textposition:'top center',line:{color:'#a1a1aa'},showlegend:false,hoverinfo:'skip'});
  if(plot.kind==='assay'&&displayed.length){
    const values=displayed.flatMap(r=>[r.x,r.y]).filter((v):v is number=>v!=null);
    const lo=values.reduce((a,b)=>Math.min(a,b)),hi=values.reduce((a,b)=>Math.max(a,b));
    traces.push({type:'scatter',mode:'lines',name:'Identidad 1:1',x:[lo,hi],y:[lo,hi],line:{color:'#a1a1aa',dash:'dash'}});
  }
  for(const [i,group] of groups.entries()){
    const attr=resolveAttribute(attributes,(result.pipeline.group_column as string|null)??null,group,i,pointSize,symbol,palette);
    if(!attr.visible)continue;
    const rows=(plot.kind==='downhole'?result.rows.filter(r=>r.y!=null):displayed).filter(r=>r.group===group);
    if(['line','ecdf','qq','probability'].includes(plot.kind))rows.sort((a,b)=>(a.x??0)-(b.x??0));
    if(plot.kind==='downhole')rows.sort((a,b)=>(a.y??0)-(b.y??0));
    const marker={color:rows.map(r=>color(r,attr.color)),size:rows.map(r=>p.sizeMode==='constant'?attr.size:sizeByRow.get(r.row_index)??pointSize),symbol:attr.symbol,opacity:p.opacity};
    // customdata = row_index: lets linked selection map every plotted point back to its dataset row.
    const common={name:group,marker,text:rows.map(r=>r.sample_id+(r.classification?` · ${r.classification}`:'')),customdata:rows.map(r=>r.row_index)};
    if(plot.kind==='spider'){
      for(const row of rows)traces.push({type:'scatter',mode:'lines+markers',x:plot.elements,y:row.values??[],name:`${group} · ${row.sample_id}`,connectgaps:false,line:{color:color(row,attr.color),width:1},marker:{size:sizeByRow.get(row.row_index)??attr.size,symbol:attr.symbol,opacity:p.opacity},text:row.sample_id,customdata:(plot.elements??[]).map(()=>row.row_index)});
    }else if(plot.kind==='histogram')traces.push({type:'histogram',name:group,x:rows.map(r=>r.x),opacity:p.opacity,marker:{color:attr.color}});
    else if(plot.kind==='box')traces.push({type:'box',name:group,y:rows.map(r=>r.x),quartilemethod:'linear',boxpoints:'all',jitter:.3,pointpos:0,marker:{color:attr.color,size:attr.size},text:common.text,customdata:common.customdata});
    else if(plot.kind==='ternary')traces.push({...common,type:'scatterternary',mode:showLabels?'markers+text':'markers',a:rows.map(r=>r.x),b:rows.map(r=>r.y),c:rows.map(r=>r.z),textposition:'top center'} as Data);
    else {
      const connected=['line','downhole','ecdf'].includes(plot.kind);
      traces.push({...common,type:'scatter',mode:connected?(showLabels?'lines+markers+text':'lines+markers'):(showLabels?'markers+text':'markers'),x:rows.map(r=>r.x),y:rows.map(r=>r.y),textposition:'top center',line:{color:attr.color,shape:plot.kind==='ecdf'?'hv':'linear'},connectgaps:false} as Data);
      if(plot.kind==='downhole'&&result.tool==='downhole-compare')traces.push({...common,name:`${group} · ${(result.pipeline.columns as Record<string,string>).Assay2}`,type:'scatter',mode:'lines+markers',x:rows.map(r=>r.z),y:rows.map(r=>r.y),line:{color:attr.color,dash:'dash'},marker:{...marker,symbol:'diamond'}} as Data);
    }
  }
  const logX=p.logX||plot.log_x,logY=p.logY||plot.log_y;
  const xrange=axisRange(p.xMin,p.xMax,logX),yrange=axisRange(p.yMin,p.yMax,logY);
  const layout:Partial<Layout>={paper_bgcolor:'#18181b',plot_bgcolor:'#18181b',font:{color:'#d4d4d8',size:11},margin:{t:25,r:result.grid?100:25,b:70,l:75},autosize:true,barmode:'overlay',legend:{orientation:'h',y:-.25},
    xaxis:{title:{text:plot.x_label},type:logX?'log':'linear',gridcolor:'#3f3f46',showgrid:p.grid,range:xrange,autorange:!xrange},
    yaxis:{title:{text:plot.kind==='box'?plot.x_label:plot.y_label},type:logY?'log':'linear',gridcolor:'#3f3f46',showgrid:p.grid,range:yrange?(p.reverseY?[yrange[1],yrange[0]]:yrange):undefined,autorange:yrange?false:p.reverseY?'reversed':true},
    ternary:{sum:100,bgcolor:'#18181b',aaxis:{title:{text:plot.x_label},gridcolor:'#3f3f46'},baxis:{title:{text:plot.y_label},gridcolor:'#3f3f46'},caxis:{title:{text:plot.z_label},gridcolor:'#3f3f46'}}};
  // Field labels at the centroid of the vertices. On a log axis Plotly places annotations in log10 units, so the
  // centroid is taken in that space (vertices ≤ 0 cannot be shown on a log axis and are left out).
  if(plot.fields.length&&plot.kind!=='ternary')layout.annotations=plot.fields.flatMap(f=>{
    const pts=f.points.filter(p=>(!logX||p[0]>0)&&(!logY||p[1]>0));if(!pts.length)return [];
    const tx=(v:number)=>logX?Math.log10(v):v,ty=(v:number)=>logY?Math.log10(v):v;
    return [{x:pts.reduce((n,p)=>n+tx(p[0]),0)/pts.length,y:pts.reduce((n,p)=>n+ty(p[1]),0)/pts.length,text:f.id,showarrow:false,font:{color:'#71717a',size:10}}];
  });
  if(plot.kind==='box')layout.xaxis={...layout.xaxis,title:{text:'Grupo'},type:'category',range:undefined,autorange:true};
  if(plot.kind==='probability')layout.yaxis={...layout.yaxis,type:'linear',range:undefined,autorange:true,tickvals:[-2.32635,-1.64485,-1.28155,-.67449,0,.67449,1.28155,1.64485,2.32635],ticktext:['1','5','10','25','50','75','90','95','99']};
  if(plot.kind==='downhole')layout.yaxis={...layout.yaxis,type:'linear',range:axisRange(p.yMin,p.yMax,false)?.reverse(),autorange:axisRange(p.yMin,p.yMax,false)?false:'reversed'};
  if(plot.kind==='difference')layout.shapes=[{type:'line',xref:'paper',x0:0,x1:1,y0:0,y1:0,line:{color:'#a1a1aa',dash:'dash'}}];
  if(plot.kind==='qapf'||result.grid||result.pipeline.east)layout.yaxis={...layout.yaxis,scaleanchor:'x',scaleratio:1};
  return {data:traces,layout,displayCount:displayed.length,colorLegend,sizeLegend};
}

/** What the size classes are computed from, for the legend title. */
export function sizeLabel(result:GeoResult,source:ChartPresentation['sizeSource']):string {
  if(source==='column')return String(result.pipeline.size_column??'—');
  return source==='x'?result.plot.x_label:result.plot.y_label;
}
/** Values the size classes are computed from (valid rows only), for the histogram in the size controls. */
export function sizeValuesOf(result:GeoResult,source:ChartPresentation['sizeSource']):(number|null|undefined)[] {
  return result.rows.filter(r=>r.status==='valid').map(r=>source==='column'?r.size_value:source==='x'?r.x:r.y);
}
